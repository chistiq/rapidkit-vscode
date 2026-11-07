import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';
import * as vscode from 'vscode';
import { readStudioWorkingBytes } from './studioNativeDocuments.js';
import { studioSourcePathDenialReason } from './studioWorkspacePathPolicy.js';
import { isStudioSemanticSourcePath } from './studioSemanticSourcePolicy.js';
import { studioSourceIgnore } from './studioSourceIgnore.js';

const EXCLUDE =
  '{**/.git/**,**/node_modules/**,**/vendor/**,**/dist/**,**/build/**,**/target/**,**/.venv/**,**/coverage/**,**/.workspai/**,**/.rapidkit/**,**/.mypy_cache/**,**/.pytest_cache/**,**/.ruff_cache/**,**/__pycache__/**,**/.next/**,**/.svelte-kit/**,**/.angular/**,**/.turbo/**}';
const MAX_FILES = 1000;
const MAX_BYTES = 16 * 1024 * 1024;
const tokenize = (text: string) =>
  text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .normalize('NFKC')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'from',
  'with',
  'where',
  'find',
  'how',
  'are',
  'this',
  'that',
  'code',
  'does',
]);
function scoped(root: string, target: string): string | undefined {
  const relative = path.relative(root, target).replace(/\\/g, '/');
  return relative &&
    relative !== '..' &&
    !relative.startsWith('../') &&
    !path.isAbsolute(relative) &&
    !studioSourcePathDenialReason(relative)
    ? relative
    : undefined;
}
type Snippet = {
  path: string;
  line: number;
  endLine: number;
  text: string;
  textTruncated: boolean;
  sha256: string;
  score: number;
  matchedTerms: string[];
  provenance: 'current-source';
};

/** Same source and dirty-buffer boundary as lexical retrieval; text stays in memory. */
export async function readStudioSemanticSources(root: string, signal: AbortSignal) {
  const realRoot = await fs.realpath(root);
  const ignored = await studioSourceIgnore(realRoot);
  const uris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(root, '**/*'),
    EXCLUDE,
    MAX_FILES + 1
  );
  const documents: Array<{ path: string; text: string }> = [];
  let scannedBytes = 0,
    omittedFiles = 0;
  for (const uri of uris.slice(0, MAX_FILES)) {
    if (signal.aborted) {
      throw new Error('Semantic source discovery was cancelled.');
    }
    try {
      const relative = uri.scheme === 'file' ? scoped(root, uri.fsPath) : undefined;
      if (!relative || !isStudioSemanticSourcePath(relative) || (await ignored(relative))) {
        omittedFiles++;
        continue;
      }
      const real = await fs.realpath(uri.fsPath);
      const canonicalRelative = scoped(realRoot, real);
      if (
        !canonicalRelative ||
        !isStudioSemanticSourcePath(canonicalRelative) ||
        (await ignored(canonicalRelative))
      ) {
        omittedFiles++;
        continue;
      }
      const stat = await fs.stat(real);
      if (!stat.isFile() || stat.size > 256 * 1024) {
        omittedFiles++;
        continue;
      }
      const raw = await readStudioWorkingBytes(real);
      if (raw.byteLength > 256 * 1024 || raw.includes(0)) {
        omittedFiles++;
        continue;
      }
      if (scannedBytes + raw.byteLength > MAX_BYTES) {
        break;
      }
      const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw);
      documents.push({ path: relative, text });
      scannedBytes += raw.byteLength;
    } catch {
      omittedFiles++;
    }
  }
  if (signal.aborted) {
    throw new Error('Semantic source discovery was cancelled.');
  }
  return {
    documents,
    coverage: {
      discoveredFiles: uris.length,
      scannedBytes,
      omittedFiles,
      truncated:
        uris.length > MAX_FILES ||
        documents.length + omittedFiles < Math.min(uris.length, MAX_FILES),
    },
  };
}
/** Fresh, bounded lexical retrieval. Graph/language evidence is kept separate with its own
 * coverage; this deliberately does not advertise an embedding index or exhaustive recall. */
export async function searchStudioCodeContext(input: {
  query: string;
  root: string;
  glob?: string;
  limit?: number;
  signal: AbortSignal;
}) {
  const started = Date.now();
  if (
    typeof input.query !== 'string' ||
    input.query.length > 300 ||
    (input.limit !== undefined &&
      (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 12))
  ) {
    throw new Error('Invalid bounded code context query or limit.');
  }
  const terms = [
    ...new Set(tokenize(input.query).filter((term) => term.length > 1 && !STOP_WORDS.has(term))),
  ].slice(0, 16);
  if (!terms.length) {
    throw new Error('Provide concrete code keywords or symbol names for context search.');
  }
  const realRoot = await fs.realpath(input.root);
  const cancelled = () => {
    if (input.signal.aborted) {
      throw new Error('Code context retrieval was cancelled.');
    }
  };
  cancelled();
  const glob = input.glob ?? '**/*';
  if (path.isAbsolute(glob) || /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(glob) || /[\0\r\n]/.test(glob)) {
    throw new Error('Code context glob must stay inside the selected source scope.');
  }
  const uris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(input.root, glob),
    EXCLUDE,
    MAX_FILES + 1
  );
  cancelled();
  // Prefer path matches before spending the bounded content scan budget.
  uris.sort(
    (a, b) =>
      terms.filter((term) => b.fsPath.toLowerCase().includes(term)).length -
        terms.filter((term) => a.fsPath.toLowerCase().includes(term)).length ||
      a.fsPath.localeCompare(b.fsPath)
  );
  const candidates: Snippet[] = [];
  let scannedFiles = 0,
    scannedBytes = 0,
    omittedFiles = 0,
    truncated = uris.length > MAX_FILES;
  for (const uri of uris.slice(0, MAX_FILES)) {
    cancelled();
    try {
      const relative = uri.scheme === 'file' ? scoped(input.root, uri.fsPath) : undefined;
      if (!relative) {
        omittedFiles++;
        continue;
      }
      const real = await fs.realpath(uri.fsPath);
      if (!scoped(realRoot, real)) {
        omittedFiles++;
        continue;
      }
      const stat = await fs.stat(real);
      if (!stat.isFile() || stat.size > 256 * 1024) {
        omittedFiles++;
        continue;
      }
      if (scannedBytes + stat.size > MAX_BYTES) {
        truncated = true;
        break;
      }
      const raw = await readStudioWorkingBytes(real);
      if (raw.byteLength > 256 * 1024 || raw.subarray(0, 2048).includes(0)) {
        omittedFiles++;
        continue;
      }
      if (scannedBytes + raw.byteLength > MAX_BYTES) {
        truncated = true;
        break;
      }
      scannedFiles++;
      scannedBytes += raw.byteLength;
      const text = raw.toString('utf8');
      const lines = text.split(/\r?\n/);
      const fileTerms = new Set(tokenize(relative));
      const matches = lines
        .map((line, index) => {
          const words = new Set(tokenize(line));
          const matchedTerms = terms.filter((term) => words.has(term) || fileTerms.has(term));
          return {
            index,
            matchedTerms,
            score:
              matchedTerms.length * 4 +
              terms.filter((term) => words.has(term)).length * 2 +
              (line.toLowerCase().includes(input.query.toLowerCase()) ? 8 : 0),
          };
        })
        .filter((match) => match.matchedTerms.length)
        .sort((a, b) => b.score - a.score || a.index - b.index);
      const selected: number[] = [];
      const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
      for (const match of matches) {
        if (selected.some((line) => Math.abs(line - match.index) <= 4)) {
          continue;
        }
        const start = Math.max(0, match.index - 2),
          end = Math.min(lines.length, match.index + 3);
        const excerpt = lines.slice(start, end).join('\n');
        candidates.push({
          path: relative,
          line: start + 1,
          endLine: end,
          text: excerpt.slice(0, 1800),
          textTruncated: excerpt.length > 1800,
          sha256,
          score: match.score,
          matchedTerms: match.matchedTerms,
          provenance: 'current-source',
        });
        selected.push(match.index);
        if (selected.length >= 2) {
          break;
        }
      }
    } catch {
      cancelled();
      omittedFiles++;
    }
  }
  cancelled();
  candidates.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.line - b.line);
  const snippets: Snippet[] = [];
  let outputBytes = 0;
  for (const candidate of candidates) {
    const bytes = Buffer.byteLength(JSON.stringify(candidate));
    if (outputBytes + bytes > 16_000 || snippets.length >= (input.limit ?? 8)) {
      break;
    }
    snippets.push(candidate);
    outputBytes += bytes;
  }
  return {
    ranking: 'lexical-term-coverage',
    observedAt: new Date().toISOString(),
    snippets,
    coverage: {
      discoveredFiles: uris.length,
      scannedFiles,
      scannedBytes,
      omittedFiles,
      truncated: truncated || candidates.length > snippets.length,
      outputBytes,
      durationMs: Date.now() - started,
    },
    instruction:
      'Current source snippets with hashes and one-based ranges; no embedding search or exhaustive recall is claimed. Narrow glob/query when truncated. Inspect exact source before edits; Graph freshness and language relationships are separate evidence.',
  };
}

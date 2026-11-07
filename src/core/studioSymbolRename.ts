import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';
import * as vscode from 'vscode';
import type { FilePatch } from './patchApplyEngine.js';
import { studioSourcePathDenialReason } from './studioWorkspacePathPolicy.js';
import { waitForStudioLanguageProvider } from './studioLanguageProvider.js';

export type StudioSymbolRenameRequest = {
  path: string;
  line: number;
  column: number;
  newName: string;
  workspacePath: string;
  projectPath?: string;
  signal: AbortSignal;
};

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Compile provider text edits on the host; source bodies never need a model round trip. */
export async function prepareStudioSymbolRename(
  input: StudioSymbolRenameRequest
): Promise<FilePatch[]> {
  const root = path.resolve(input.projectPath ?? input.workspacePath);
  const realRoot = await fs.realpath(root);
  const check = async (uri: vscode.Uri): Promise<string> => {
    const relative = path.relative(root, uri.fsPath).replace(/\\/g, '/');
    if (
      uri.scheme !== 'file' ||
      !relative ||
      !inside(root, uri.fsPath) ||
      studioSourcePathDenialReason(relative)
    ) {
      throw new Error('The language rename includes a path outside the editable source scope.');
    }
    const real = await fs.realpath(uri.fsPath);
    const stat = await fs.stat(real);
    if (
      !inside(realRoot, real) ||
      studioSourcePathDenialReason(path.relative(realRoot, real)) ||
      !stat.isFile() ||
      stat.size > 2 * 1024 * 1024
    ) {
      throw new Error(
        'The language rename target is unavailable, oversized, or outside the editable source scope.'
      );
    }
    return relative;
  };
  const cancelled = () => {
    if (input.signal.aborted) {
      throw new Error('Language rename was cancelled; no changes were applied.');
    }
  };
  if (
    !input.path ||
    path.isAbsolute(input.path) ||
    !Number.isSafeInteger(input.line) ||
    input.line < 1 ||
    !Number.isSafeInteger(input.column) ||
    input.column < 1 ||
    typeof input.newName !== 'string' ||
    !input.newName.trim() ||
    input.newName.length > 200 ||
    /[\0\r\n]/.test(input.newName)
  ) {
    throw new Error(
      'Language rename requires a relative source path, positive line/column and a non-empty newName (at most 200 characters).'
    );
  }
  cancelled();
  const uri = vscode.Uri.file(path.resolve(root, input.path));
  await check(uri);
  const source = await vscode.workspace.openTextDocument(uri);
  const position = new vscode.Position(input.line - 1, input.column - 1);
  if (
    position.line >= source.lineCount ||
    position.character > source.lineAt(position.line).text.length
  ) {
    throw new Error('The rename position is outside the source document.');
  }
  const versions = new Map(
    vscode.workspace.textDocuments.map((document) => [document.uri.toString(), document.version])
  );
  versions.set(source.uri.toString(), source.version);
  const started = Date.now();
  const edit = await waitForStudioLanguageProvider(
    () =>
      vscode.commands.executeCommand<vscode.WorkspaceEdit>(
        'vscode.executeDocumentRenameProvider',
        uri,
        position,
        input.newName
      ),
    input.signal
  );
  cancelled();
  const entries = edit?.entries() ?? [];
  if (!entries.length) {
    throw new Error(
      'The language provider returned no textual rename edits. Inspect references or use inspected source edits instead.'
    );
  }
  if (entries.length > 100) {
    throw new Error('Language rename exceeds 100 files; narrow the operation before retrying.');
  }
  const patches: FilePatch[] = [];
  const seen = new Set<string>();
  let bytes = 0;
  for (const [target, changes] of entries) {
    cancelled();
    const relativePath = await check(target);
    const real = await fs.realpath(target.fsPath);
    if (seen.has(real)) {
      throw new Error('The language rename repeats a source file through an alias.');
    }
    seen.add(real);
    const document = await vscode.workspace.openTextDocument(target);
    const version = versions.get(target.toString());
    const stat = await fs.stat(target.fsPath);
    if (version !== undefined ? document.version !== version : stat.mtimeMs > started) {
      throw new Error(
        'A rename source changed while the provider was preparing edits. Request a fresh rename.'
      );
    }
    const before = document.getText();
    bytes += Buffer.byteLength(before);
    if (bytes > 8 * 1024 * 1024 || changes.length > 10_000) {
      throw new Error('Language rename exceeds its bounded source/edit budget.');
    }
    const offset = (position: vscode.Position) => {
      const result = document.offsetAt(position);
      const exact = document.positionAt(result);
      if (exact.line !== position.line || exact.character !== position.character) {
        throw new Error('The language provider returned an invalid source range.');
      }
      return result;
    };
    const ranges = changes.map((change) => ({
      start: offset(change.range.start),
      end: offset(change.range.end),
      text: change.newText,
    }));
    ranges.sort((a, b) => a.start - b.start || a.end - b.end);
    const pieces: string[] = [];
    let boundary = 0;
    let previousStart = -1;
    let insertionBytes = 0;
    for (const range of ranges) {
      if (range.end < range.start || range.start < boundary || range.start === previousStart) {
        throw new Error('The language provider returned overlapping rename edits.');
      }
      insertionBytes += Buffer.byteLength(range.text);
      if (insertionBytes + bytes > 8 * 1024 * 1024) {
        throw new Error('Language rename exceeds its bounded source/edit budget.');
      }
      pieces.push(before.slice(boundary, range.start), range.text);
      boundary = range.end;
      previousStart = range.start;
    }
    pieces.push(before.slice(boundary));
    const after = pieces.join('');
    bytes += Buffer.byteLength(after);
    if (bytes > 8 * 1024 * 1024) {
      throw new Error('Language rename exceeds its bounded source/edit budget.');
    }
    if (before !== after) {
      patches.push({
        relativePath,
        baseSha256: crypto.createHash('sha256').update(before).digest('hex'),
        patchedContent: after,
        originalContent: before,
        isNewFile: false,
        hunks: [],
        status: 'pending',
      });
    }
  }
  cancelled();
  return patches;
}

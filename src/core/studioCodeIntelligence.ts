import path from 'node:path';

import fs from 'fs-extra';
import * as vscode from 'vscode';

import { studioSourcePathDenialReason } from './studioWorkspacePathPolicy.js';
import type { StudioAgentToolResult } from './studioAgentToolRegistry.js';
import { waitForStudioLanguageProvider } from './studioLanguageProvider.js';

export type StudioCodeIntelligenceOperation =
  | 'definition'
  | 'references'
  | 'implementation'
  | 'hover'
  | 'document-symbols'
  | 'workspace-symbols';

export type StudioCodeIntelligenceRequest = {
  operation: StudioCodeIntelligenceOperation;
  path?: string;
  line?: number;
  column?: number;
  query?: string;
  workspacePath: string;
  projectPath?: string;
  signal?: AbortSignal;
};

type PortableLocation = {
  path: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
};

type PortableSymbol = PortableLocation & {
  name: string;
  detail?: string;
  kind: number;
};

export type StudioCodeIntelligenceResult = {
  operation: StudioCodeIntelligenceOperation;
  source?: { path: string; line: number; column: number };
  query?: string;
  locations: PortableLocation[];
  symbols: PortableSymbol[];
  hover: string[];
  truncated: boolean;
};

const MAX_CODE_INTELLIGENCE_RESULTS = 100;
const MAX_PROVIDER_ITEMS = 10_000;
const MAX_HOVER_CHARACTERS = 24_000;
const OPERATIONS: readonly StudioCodeIntelligenceOperation[] = [
  'definition',
  'references',
  'implementation',
  'hover',
  'document-symbols',
  'workspace-symbols',
];

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

function portablePath(root: string, uri: vscode.Uri): string | undefined {
  if (uri.scheme !== 'file' || !isInside(root, uri.fsPath)) {
    return undefined;
  }
  const relative = path.relative(root, uri.fsPath).replace(/\\/g, '/');
  return relative && !studioSourcePathDenialReason(relative) ? relative : undefined;
}

function portableLocation(
  root: string,
  location: vscode.Location | vscode.LocationLink
): PortableLocation | undefined {
  const uri = 'targetUri' in location ? location.targetUri : location.uri;
  const range = 'targetRange' in location ? location.targetRange : location.range;
  const relativePath = portablePath(root, uri);
  return relativePath
    ? {
        path: relativePath,
        line: range.start.line + 1,
        column: range.start.character + 1,
        endLine: range.end.line + 1,
        endColumn: range.end.character + 1,
      }
    : undefined;
}

function markdownText(value: vscode.MarkedString | vscode.MarkdownString): string {
  if (typeof value === 'string') {
    return value;
  }
  return 'language' in value ? value.value : value.value;
}

async function flattenDocumentSymbols(
  root: string,
  uri: vscode.Uri,
  symbols: readonly (vscode.DocumentSymbol | vscode.SymbolInformation)[],
  output: PortableSymbol[],
  admit: (uri: vscode.Uri) => Promise<boolean>
): Promise<boolean> {
  const pending = [...symbols].reverse();
  let inspected = 0;
  let truncated = false;
  while (pending.length && inspected++ < MAX_PROVIDER_ITEMS) {
    const symbol = pending.pop()!;
    const target = 'location' in symbol ? symbol.location.uri : uri;
    const location = !(await admit(target))
      ? undefined
      : 'location' in symbol
        ? portableLocation(root, symbol.location)
        : portableLocation(root, new vscode.Location(uri, symbol.range));
    if (location && output.length < MAX_CODE_INTELLIGENCE_RESULTS) {
      output.push({
        ...location,
        name: symbol.name.slice(0, 500),
        ...('detail' in symbol && symbol.detail ? { detail: symbol.detail.slice(0, 1000) } : {}),
        kind: symbol.kind,
      });
    } else {
      truncated = true;
    }
    if ('children' in symbol && symbol.children.length > 0) {
      const remaining = Math.max(0, MAX_PROVIDER_ITEMS - inspected - pending.length);
      pending.push(...symbol.children.slice(0, remaining).reverse());
      truncated ||= symbol.children.length > remaining;
    }
  }
  return truncated || pending.length > 0;
}

export async function inspectStudioCodeIntelligence(
  input: StudioCodeIntelligenceRequest
): Promise<StudioCodeIntelligenceResult> {
  if (!OPERATIONS.includes(input.operation)) {
    throw new Error('Code intelligence operation is invalid.');
  }
  const root = path.resolve(input.projectPath ?? input.workspacePath);
  const realRoot = await fs.realpath(root);
  const admitted = new Map<string, Promise<boolean>>();
  const admit = (uri: vscode.Uri): Promise<boolean> => {
    if (input.signal?.aborted) {
      return Promise.reject(new Error('Language intelligence retrieval was cancelled.'));
    }
    if (!portablePath(root, uri)) {
      return Promise.resolve(false);
    }
    const key = uri.fsPath;
    if (!admitted.has(key)) {
      admitted.set(
        key,
        fs
          .realpath(key)
          .then(
            async (real) =>
              isInside(realRoot, real) &&
              !studioSourcePathDenialReason(path.relative(realRoot, real)) &&
              (await fs.stat(real)).isFile()
          )
          .catch(() => false)
      );
    }
    return admitted.get(key)!;
  };
  const result: StudioCodeIntelligenceResult = {
    operation: input.operation,
    locations: [],
    symbols: [],
    hover: [],
    truncated: false,
  };

  if (input.operation === 'workspace-symbols') {
    const query = input.query?.trim();
    if (!query || query.length > 500 || /[\0\r\n]/.test(query)) {
      throw new Error(
        'Workspace symbol lookup requires a non-empty query of at most 500 characters.'
      );
    }
    result.query = query;
    const symbols =
      (await waitForStudioLanguageProvider(
        () =>
          vscode.commands.executeCommand<vscode.SymbolInformation[]>(
            'vscode.executeWorkspaceSymbolProvider',
            query
          ),
        input.signal
      )) ?? [];
    result.truncated = await flattenDocumentSymbols(
      root,
      vscode.Uri.file(root),
      symbols.slice(0, MAX_PROVIDER_ITEMS),
      result.symbols,
      admit
    );
    result.truncated ||= symbols.length > MAX_PROVIDER_ITEMS;
    return result;
  }

  const relativePath = input.path?.trim().replace(/\\/g, '/');
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error('Code intelligence requires one workspace-relative source path.');
  }
  const denial = studioSourcePathDenialReason(relativePath);
  if (denial) {
    throw new Error(`Code intelligence source path is blocked: ${relativePath} (${denial}).`);
  }
  const absolutePath = path.resolve(root, relativePath);
  const uri = vscode.Uri.file(absolutePath);
  if (!(await admit(uri))) {
    throw new Error(`Code intelligence source path is unavailable: ${relativePath}`);
  }
  const line = input.line ?? 1;
  const column = input.column ?? 1;
  if (!Number.isSafeInteger(line) || line < 1 || !Number.isSafeInteger(column) || column < 1) {
    throw new Error('Code intelligence line and column must be positive integers.');
  }
  const position = new vscode.Position(line - 1, column - 1);
  result.source = { path: relativePath, line, column };

  if (input.operation === 'hover') {
    const hovers =
      (await waitForStudioLanguageProvider(
        () =>
          vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider',
            uri,
            position
          ),
        input.signal
      )) ?? [];
    let remaining = MAX_HOVER_CHARACTERS;
    for (const hover of hovers.slice(0, 20)) {
      for (const content of hover.contents) {
        const text = markdownText(content);
        if (!text) {
          continue;
        }
        const fragment = text.slice(0, remaining);
        if (fragment) {
          result.hover.push(fragment);
        }
        remaining -= fragment.length;
        result.truncated ||= fragment.length < text.length;
        if (!remaining || result.hover.length >= 20) {
          result.truncated = true;
          break;
        }
      }
      if (!remaining || result.hover.length >= 20) {
        break;
      }
    }
    result.truncated ||= hovers.length > 20;
    return result;
  }

  if (input.operation === 'document-symbols') {
    const symbols =
      (await waitForStudioLanguageProvider(
        () =>
          vscode.commands.executeCommand<Array<vscode.DocumentSymbol | vscode.SymbolInformation>>(
            'vscode.executeDocumentSymbolProvider',
            uri
          ),
        input.signal
      )) ?? [];
    result.truncated = await flattenDocumentSymbols(
      root,
      uri,
      symbols.slice(0, MAX_PROVIDER_ITEMS),
      result.symbols,
      admit
    );
    result.truncated ||= symbols.length > MAX_PROVIDER_ITEMS;
    return result;
  }

  const command =
    input.operation === 'definition'
      ? 'vscode.executeDefinitionProvider'
      : input.operation === 'references'
        ? 'vscode.executeReferenceProvider'
        : 'vscode.executeImplementationProvider';
  const locations =
    (await waitForStudioLanguageProvider(
      () =>
        vscode.commands.executeCommand<Array<vscode.Location | vscode.LocationLink>>(
          command,
          uri,
          position
        ),
      input.signal
    )) ?? [];
  for (const location of locations.slice(0, MAX_PROVIDER_ITEMS)) {
    const uri = 'targetUri' in location ? location.targetUri : location.uri;
    const portable = (await admit(uri)) ? portableLocation(root, location) : undefined;
    if (portable) {
      result.locations.push(portable);
    }
    if (result.locations.length >= MAX_CODE_INTELLIGENCE_RESULTS) {
      break;
    }
  }
  result.truncated = locations.length > result.locations.length;
  return result;
}

export async function runStudioCodeIntelligenceTool(
  input: StudioCodeIntelligenceRequest
): Promise<StudioAgentToolResult<StudioCodeIntelligenceResult>> {
  try {
    return { ok: true, changed: false, output: await inspectStudioCodeIntelligence(input) };
  } catch (error) {
    return {
      ok: false,
      changed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

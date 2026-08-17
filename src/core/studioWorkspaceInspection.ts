import { createHash } from 'node:crypto';
import * as path from 'node:path';
import fs from 'fs-extra';
import * as vscode from 'vscode';

import {
  resolveStudioWorkspaceCommandPlan,
  runStudioWorkspaceCommand,
} from './studioWorkspaceCommand.js';
import { buildStudioUntrackedFileDiffs } from './studioWorkspaceChangeReview.js';

const STUDIO_WORKSPACE_FILE_EXCLUDE =
  '{**/.git/**,**/node_modules/**,**/vendor/**,**/dist/**,**/build/**,**/target/**,**/.venv/**,**/.workspai/cache/**,**/.workspai/snapshots/**,**/*.tmp}';
const MAX_FINGERPRINT_FILES = 2_000;
const MAX_FINGERPRINT_FILE_BYTES = 16 * 1024 * 1024;
const MAX_FINGERPRINT_TOTAL_BYTES = 128 * 1024 * 1024;

export async function discoverStudioWorkspaceFiles(input: {
  workspacePath: string;
  projectPath?: string;
  glob?: string;
  limit?: number;
}): Promise<Array<{ path: string; size: number }>> {
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 200), 1), 500);
  const requestedGlob = input.glob?.trim() || '**/*';
  if (
    path.isAbsolute(requestedGlob) ||
    /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(requestedGlob) ||
    /[\0\r\n]/.test(requestedGlob)
  ) {
    throw new Error('Studio workspace discovery glob must stay inside the selected workspace.');
  }
  const sourceRoot = input.projectPath?.trim() || input.workspacePath;
  const uris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(sourceRoot, requestedGlob),
    STUDIO_WORKSPACE_FILE_EXCLUDE,
    limit
  );
  const files: Array<{ path: string; size: number }> = [];
  for (const uri of uris) {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if ((stat.type & vscode.FileType.File) !== 0) {
        files.push({
          path: path.relative(sourceRoot, uri.fsPath).replace(/\\/g, '/'),
          size: stat.size,
        });
      }
    } catch {
      // Transient files are omitted from the discovery snapshot.
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function studioDiagnosticSeverityName(
  severity: vscode.DiagnosticSeverity
): 'error' | 'warning' | 'information' | 'hint' {
  if (severity === vscode.DiagnosticSeverity.Error) {
    return 'error';
  }
  if (severity === vscode.DiagnosticSeverity.Warning) {
    return 'warning';
  }
  if (severity === vscode.DiagnosticSeverity.Information) {
    return 'information';
  }
  return 'hint';
}

export function inspectStudioWorkspaceDiagnostics(input: {
  workspacePath: string;
  projectPath?: string;
  paths?: string[];
  severities?: Array<'error' | 'warning' | 'information' | 'hint'>;
}): Array<Record<string, unknown>> {
  const allowedPaths = input.paths?.length
    ? new Set(input.paths.map((entry) => entry.replace(/\\/g, '/')))
    : undefined;
  const allowedSeverities = new Set(input.severities ?? ['error', 'warning']);
  const diagnostics: Array<Record<string, unknown>> = [];
  const sourceRoot = input.projectPath?.trim() || input.workspacePath;
  for (const [uri, entries] of vscode.languages.getDiagnostics()) {
    const relativePath = path.relative(sourceRoot, uri.fsPath).replace(/\\/g, '/');
    if (
      relativePath.startsWith('../') ||
      path.isAbsolute(relativePath) ||
      (allowedPaths && !allowedPaths.has(relativePath))
    ) {
      continue;
    }
    for (const diagnostic of entries) {
      const severity = studioDiagnosticSeverityName(diagnostic.severity);
      if (!allowedSeverities.has(severity)) {
        continue;
      }
      diagnostics.push({
        path: relativePath,
        severity,
        message: diagnostic.message,
        source: diagnostic.source,
        code:
          typeof diagnostic.code === 'object' && diagnostic.code
            ? diagnostic.code.value
            : diagnostic.code,
        range: {
          start: {
            line: diagnostic.range.start.line + 1,
            column: diagnostic.range.start.character + 1,
          },
          end: {
            line: diagnostic.range.end.line + 1,
            column: diagnostic.range.end.character + 1,
          },
        },
      });
      if (diagnostics.length >= 250) {
        return diagnostics;
      }
    }
  }
  return diagnostics;
}

export async function inspectStudioWorkspaceChanges(input: {
  workspacePath: string;
  projectPath?: string;
  paths?: string[];
}): Promise<Record<string, unknown>> {
  const pathArgs = input.paths?.length ? ['--', ...input.paths] : [];
  const sourceRoot = input.projectPath?.trim() || input.workspacePath;
  const statusPlan = resolveStudioWorkspaceCommandPlan({
    workspacePath: sourceRoot,
    request: {
      executable: 'git',
      args: ['status', '--short', '--untracked-files=all', '-z', ...pathArgs],
      purpose: 'inspect',
    },
  });
  const diffPlan = resolveStudioWorkspaceCommandPlan({
    workspacePath: sourceRoot,
    request: {
      executable: 'git',
      args: ['diff', '--no-ext-diff', '--unified=3', ...pathArgs],
      purpose: 'inspect',
    },
  });
  const [status, diff] = await Promise.all([
    runStudioWorkspaceCommand(statusPlan),
    runStudioWorkspaceCommand(diffPlan),
  ]);
  const untrackedDiff = await buildStudioUntrackedFileDiffs({
    workspacePath: sourceRoot,
    statusPorcelainZ: status.stdout,
    includedPaths: input.paths,
  });
  const combinedDiff = [diff.stdout.trim(), untrackedDiff.trim()].filter(Boolean).join('\n');
  return {
    status: status.stdout.split('\0').filter(Boolean).join('\n'),
    diff: combinedDiff,
    statusExitCode: status.exitCode,
    diffExitCode: diff.exitCode,
  };
}

export async function fingerprintStudioWorkspaceSourceState(input: {
  workspacePath: string;
  projectPath?: string;
}): Promise<{ fingerprint: string; status: string; diff: string } | null> {
  const snapshot = await inspectStudioWorkspaceChanges(input);
  if (snapshot.statusExitCode !== 0 || snapshot.diffExitCode !== 0) {
    return null;
  }
  const sourceRoot = input.projectPath?.trim() || input.workspacePath;
  const changedPathCommands = [
    ['diff', '--name-only', '-z'],
    ['diff', '--cached', '--name-only', '-z'],
    ['ls-files', '--others', '--exclude-standard', '-z'],
  ];
  const changedPathResults = await Promise.all(
    changedPathCommands.map((args) =>
      runStudioWorkspaceCommand(
        resolveStudioWorkspaceCommandPlan({
          workspacePath: sourceRoot,
          request: { executable: 'git', args, purpose: 'inspect' },
        })
      )
    )
  );
  if (changedPathResults.some((result) => result.exitCode !== 0)) {
    return null;
  }
  const changedPaths = [
    ...new Set(
      changedPathResults.flatMap((result) => result.stdout.split('\0').filter(Boolean)).sort()
    ),
  ];
  if (changedPaths.length > MAX_FINGERPRINT_FILES) {
    return null;
  }

  const contentFingerprint = createHash('sha256');
  let totalBytes = 0;
  for (const changedPath of changedPaths) {
    if (
      path.isAbsolute(changedPath) ||
      /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(changedPath) ||
      /[\0\r\n]/.test(changedPath)
    ) {
      return null;
    }
    const absolutePath = path.resolve(sourceRoot, changedPath);
    const relativePath = path.relative(sourceRoot, absolutePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return null;
    }
    const stat = await fs.lstat(absolutePath).catch(() => undefined);
    contentFingerprint.update(changedPath).update('\0');
    if (!stat) {
      contentFingerprint.update('missing').update('\0');
      continue;
    }
    if (stat.isSymbolicLink()) {
      const link = await fs.readlink(absolutePath).catch(() => undefined);
      if (link === undefined) {
        return null;
      }
      contentFingerprint.update('symlink').update('\0').update(link).update('\0');
      continue;
    }
    if (!stat.isFile() || stat.size > MAX_FINGERPRINT_FILE_BYTES) {
      return null;
    }
    totalBytes += stat.size;
    if (totalBytes > MAX_FINGERPRINT_TOTAL_BYTES) {
      return null;
    }
    const content = await fs.readFile(absolutePath).catch(() => undefined);
    if (!content || content.byteLength !== stat.size) {
      return null;
    }
    contentFingerprint
      .update('file')
      .update('\0')
      .update(String(stat.mode))
      .update('\0')
      .update(content)
      .update('\0');
  }
  const status = typeof snapshot.status === 'string' ? snapshot.status : '';
  const diff = typeof snapshot.diff === 'string' ? snapshot.diff : '';
  return {
    fingerprint: createHash('sha256')
      .update(status)
      .update('\0')
      .update(diff)
      .update('\0')
      .update(contentFingerprint.digest())
      .digest('hex'),
    status,
    diff,
  };
}

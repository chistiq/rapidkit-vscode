import * as path from 'node:path';
import * as vscode from 'vscode';

import {
  resolveStudioWorkspaceCommandPlan,
  runStudioWorkspaceCommand,
} from './studioWorkspaceCommand.js';
import { buildStudioUntrackedFileDiffs } from './studioWorkspaceChangeReview.js';

const STUDIO_WORKSPACE_FILE_EXCLUDE =
  '{**/.git/**,**/node_modules/**,**/vendor/**,**/dist/**,**/build/**,**/target/**,**/.venv/**,**/.workspai/cache/**,**/.workspai/snapshots/**,**/*.tmp}';

export async function discoverStudioWorkspaceFiles(input: {
  workspacePath: string;
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
  const uris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(input.workspacePath, requestedGlob),
    STUDIO_WORKSPACE_FILE_EXCLUDE,
    limit
  );
  const files: Array<{ path: string; size: number }> = [];
  for (const uri of uris) {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if ((stat.type & vscode.FileType.File) !== 0) {
        files.push({
          path: path.relative(input.workspacePath, uri.fsPath).replace(/\\/g, '/'),
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
  paths?: string[];
  severities?: Array<'error' | 'warning' | 'information' | 'hint'>;
}): Array<Record<string, unknown>> {
  const allowedPaths = input.paths?.length
    ? new Set(input.paths.map((entry) => entry.replace(/\\/g, '/')))
    : undefined;
  const allowedSeverities = new Set(input.severities ?? ['error', 'warning']);
  const diagnostics: Array<Record<string, unknown>> = [];
  for (const [uri, entries] of vscode.languages.getDiagnostics()) {
    const relativePath = path.relative(input.workspacePath, uri.fsPath).replace(/\\/g, '/');
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
  paths?: string[];
}): Promise<Record<string, unknown>> {
  const pathArgs = input.paths?.length ? ['--', ...input.paths] : [];
  const statusPlan = resolveStudioWorkspaceCommandPlan({
    workspacePath: input.workspacePath,
    request: {
      executable: 'git',
      args: ['status', '--short', '--untracked-files=all', '-z', ...pathArgs],
      purpose: 'inspect',
    },
  });
  const diffPlan = resolveStudioWorkspaceCommandPlan({
    workspacePath: input.workspacePath,
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
    workspacePath: input.workspacePath,
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

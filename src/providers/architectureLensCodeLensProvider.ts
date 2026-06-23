import * as path from 'path';
import * as vscode from 'vscode';

import {
  indexProjectSystemGraph,
  queryProjectSystemGraphImpact,
  scoreSystemGraphImpactDeterministic,
} from '../core/systemGraphIndexer';
import { buildArchitectureCodeLensSummary } from './architectureLensCodeLens';

type SelectedWorkspace = {
  path?: string;
  name?: string;
};

type SelectedProject = {
  path?: string;
  name?: string;
  type?: string;
};

function isPathInside(candidatePath: string, rootPath?: string): boolean {
  if (!rootPath) {
    return false;
  }
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function executeOptionalCommand<T>(command: string): Promise<T | undefined> {
  try {
    return (await vscode.commands.executeCommand(command)) as T | undefined;
  } catch {
    return undefined;
  }
}

function firstContentLine(document: vscode.TextDocument): number {
  for (let index = 0; index < document.lineCount; index += 1) {
    if (document.lineAt(index).text.trim()) {
      return index;
    }
  }
  return 0;
}

export class WorkspaiArchitectureCodeLensProvider implements vscode.CodeLensProvider {
  private static readonly SUPPORTED_LANGUAGES = new Set([
    'python',
    'typescript',
    'javascript',
    'go',
    'java',
    'typescriptreact',
    'javascriptreact',
  ]);

  async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    if (
      document.uri.scheme !== 'file' ||
      !WorkspaiArchitectureCodeLensProvider.SUPPORTED_LANGUAGES.has(document.languageId)
    ) {
      return [];
    }

    const selectedProject = await executeOptionalCommand<SelectedProject>(
      'workspai.getSelectedProject'
    );
    const selectedWorkspace = await executeOptionalCommand<SelectedWorkspace>(
      'workspai.getSelectedWorkspace'
    );
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);

    const workspacePath =
      (selectedWorkspace?.path && isPathInside(document.uri.fsPath, selectedWorkspace.path)
        ? selectedWorkspace.path
        : workspaceFolder?.uri.fsPath) || undefined;
    const projectPath =
      (selectedProject?.path && isPathInside(document.uri.fsPath, selectedProject.path)
        ? selectedProject.path
        : workspaceFolder?.uri.fsPath) || undefined;

    if (!workspacePath || !projectPath || token.isCancellationRequested) {
      return [];
    }

    const graphSnapshot = await indexProjectSystemGraph({
      workspacePath,
      projectPath,
      framework: selectedProject?.type,
      useIncrementalCache: true,
      maxFiles: 450,
    });

    if (token.isCancellationRequested || graphSnapshot.nodes.length === 0) {
      return [];
    }

    const impactQuery = queryProjectSystemGraphImpact(graphSnapshot, {
      seedFilePaths: [document.uri.fsPath],
      maxDepth: 2,
      maxNodes: 16,
    });

    if (token.isCancellationRequested || impactQuery.unknownScope) {
      return [];
    }

    const score = scoreSystemGraphImpactDeterministic({
      impactQuery,
      graphSnapshot,
      doctorErrors: 0,
      doctorWarnings: 0,
      requiresImpactReview: true,
      requiresVerifyPath: true,
      riskClass: 'guarded-mutating',
    });

    const summary = buildArchitectureCodeLensSummary({
      filePath: document.uri.fsPath,
      graphSnapshot,
      impactQuery,
      score,
    });

    const lensRange = new vscode.Range(
      firstContentLine(document),
      0,
      firstContentLine(document),
      0
    );
    const commandArguments = [
      {
        seed: summary.seedText,
        source: 'code-lens',
        trigger: 'architecture-lens',
        scope: selectedProject?.name ? `project:${selectedProject.name}` : undefined,
        workspace: workspacePath
          ? {
              path: workspacePath,
              name: selectedWorkspace?.name,
            }
          : undefined,
        project: selectedProject?.path
          ? {
              path: selectedProject.path,
              name: selectedProject.name,
              type: selectedProject.type,
            }
          : undefined,
      },
    ];

    return [
      new vscode.CodeLens(lensRange, {
        title: summary.title,
        command: 'workspai.architectureImpactLens',
        tooltip: 'Run npm Workspace Advisor with graph-backed project scope',
        arguments: commandArguments,
      }),
      new vscode.CodeLens(lensRange, {
        title: summary.auxiliaryTitle,
        command: 'workspai.aiChangeImpactLite',
        tooltip: 'Optional AI review with architecture graph seed context',
        arguments: commandArguments,
      }),
    ];
  }
}

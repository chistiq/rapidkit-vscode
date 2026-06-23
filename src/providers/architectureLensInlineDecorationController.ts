import * as path from 'path';
import * as vscode from 'vscode';

import {
  indexProjectSystemGraph,
  queryProjectSystemGraphImpact,
  scoreSystemGraphImpactDeterministic,
} from '../core/systemGraphIndexer';
import { buildArchitectureInlineRenderModel } from './architectureLensInlineDecorations';

type SelectedWorkspace = {
  path?: string;
};

type SelectedProject = {
  path?: string;
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

export class WorkspaiArchitectureInlineDecorationController implements vscode.Disposable {
  private static readonly SUPPORTED_LANGUAGES = new Set([
    'python',
    'typescript',
    'javascript',
    'go',
    'java',
    'typescriptreact',
    'javascriptreact',
  ]);

  private readonly decorationType = vscode.window.createTextEditorDecorationType({
    after: {
      margin: '0 0 0 1rem',
      color: new vscode.ThemeColor('editorCodeLens.foreground'),
    },
    isWholeLine: false,
    overviewRulerColor: new vscode.ThemeColor('editorWarning.foreground'),
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  });

  private readonly disposables: vscode.Disposable[] = [];
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        this.scheduleRefresh(editor);
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (vscode.window.activeTextEditor?.document === event.document) {
          this.scheduleRefresh(vscode.window.activeTextEditor);
        }
      }),
      vscode.languages.onDidChangeDiagnostics((event) => {
        const activeEditor = vscode.window.activeTextEditor;
        if (
          activeEditor &&
          event.uris.some((uri) => uri.toString() === activeEditor.document.uri.toString())
        ) {
          this.scheduleRefresh(activeEditor);
        }
      }),
      this.decorationType
    );

    this.scheduleRefresh(vscode.window.activeTextEditor);
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.clearDecorations();
    this.disposables.forEach((disposable) => disposable.dispose());
  }

  private scheduleRefresh(editor: vscode.TextEditor | undefined): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh(editor);
    }, 180);
  }

  private clearDecorations(): void {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      activeEditor.setDecorations(this.decorationType, []);
    }
  }

  private async refresh(editor: vscode.TextEditor | undefined): Promise<void> {
    if (!editor) {
      this.clearDecorations();
      return;
    }

    const document = editor.document;
    if (
      document.uri.scheme !== 'file' ||
      !WorkspaiArchitectureInlineDecorationController.SUPPORTED_LANGUAGES.has(document.languageId)
    ) {
      editor.setDecorations(this.decorationType, []);
      return;
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

    if (!workspacePath || !projectPath) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    const diagnostics = vscode.languages.getDiagnostics(document.uri);
    const graphSnapshot = await indexProjectSystemGraph({
      workspacePath,
      projectPath,
      framework: selectedProject?.type,
      useIncrementalCache: true,
      maxFiles: 450,
    });

    if (graphSnapshot.nodes.length === 0) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    const impactQuery = queryProjectSystemGraphImpact(graphSnapshot, {
      seedFilePaths: [document.uri.fsPath],
      maxDepth: 2,
      maxNodes: 16,
    });

    if (impactQuery.unknownScope) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    const doctorErrors = diagnostics.filter(
      (diagnostic) => diagnostic.severity === vscode.DiagnosticSeverity.Error
    ).length;
    const doctorWarnings = diagnostics.filter(
      (diagnostic) => diagnostic.severity === vscode.DiagnosticSeverity.Warning
    ).length;

    const score = scoreSystemGraphImpactDeterministic({
      impactQuery,
      graphSnapshot,
      doctorErrors,
      doctorWarnings,
      requiresImpactReview: true,
      requiresVerifyPath: true,
      riskClass: 'guarded-mutating',
    });

    const model = buildArchitectureInlineRenderModel({
      score,
      impactQuery,
      diagnostics,
      fallbackLine: firstContentLine(document),
    });

    const hover = new vscode.MarkdownString(
      `**${model.label}**\n\n${model.detail}\n\nUse the Workspai Architecture CodeLens above to open Change Advisor Lite with graph-backed context.`
    );
    hover.isTrusted = false;

    const decorations = model.anchorLines.map((line) => {
      const anchorCharacter = document.lineAt(line).range.end.character;
      return {
        range: new vscode.Range(line, anchorCharacter, line, anchorCharacter),
        hoverMessage: hover,
        renderOptions: {
          after: {
            contentText: model.label,
            backgroundColor:
              'color-mix(in srgb, var(--vscode-editorWarning-foreground) 12%, transparent)',
            border:
              '1px solid color-mix(in srgb, var(--vscode-editorWarning-foreground) 28%, transparent)',
            textDecoration: 'none; border-radius: 999px; padding: 0.1rem 0.5rem;',
          },
        },
      } satisfies vscode.DecorationOptions;
    });

    editor.setDecorations(this.decorationType, decorations);
  }
}

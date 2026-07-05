/**
 * Code Actions Provider
 * Provides quick fixes and refactorings for Workspai files
 */

import * as vscode from 'vscode';
import {
  buildMissingFrameworkDocumentText,
  isWorkspaiConfigurationFile,
} from './workspaiConfigFiles';

type DiagnosticSeed = {
  severity: string;
  line: number;
  column: number;
  fileLineLabel: string;
  message: string;
};

function buildDiagnosticSignature(context: vscode.CodeActionContext): string {
  const signature = context.diagnostics
    .slice(0, 4)
    .map((diagnostic) =>
      [
        diagnostic.severity,
        diagnostic.range.start.line,
        diagnostic.range.start.character,
        diagnostic.message,
      ].join(':')
    )
    .join('|');
  return signature || 'selection';
}

function buildEditorIssuePayload(document: vscode.TextDocument, context: vscode.CodeActionContext) {
  return {
    filePath: document.uri.fsPath,
    fileName: vscode.workspace.asRelativePath(document.fileName),
    languageId: document.languageId,
    diagnosticSignature: buildDiagnosticSignature(context),
  };
}

export function buildAIDiagnosticSeed(input: {
  intent: 'debug' | 'fix-preview' | 'explain';
  fileName: string;
  languageId: string;
  diagnostics: DiagnosticSeed[];
  snippet?: string;
}): string {
  const intentLabel =
    input.intent === 'debug'
      ? 'Debug with Workspai AI'
      : input.intent === 'fix-preview'
        ? 'Fix with Workspai'
        : 'Explain with Workspai';
  const diagnosticsBlock =
    input.diagnostics.length > 0
      ? input.diagnostics
          .slice(0, 8)
          .map(
            (diagnostic) =>
              `- [${diagnostic.severity}] ${diagnostic.fileLineLabel}: ${diagnostic.message}`
          )
          .join('\n')
      : '- No diagnostic supplied; use the selected code snippet as evidence.';

  return [
    `${intentLabel}: handle this editor issue with the smallest safe change.`,
    '',
    'Scope:',
    `File: ${input.fileName}`,
    `Language: ${input.languageId}`,
    '',
    'Diagnostics:',
    diagnosticsBlock,
    input.snippet ? ['', 'Selected/current code evidence:', '```', input.snippet, '```'] : '',
    '',
    'Studio rules:',
    '- Ground the answer in this diagnostic and the existing project context.',
    '- Do not invent missing config files, package scripts, or framework choices.',
    '- If evidence is insufficient, name the exact file or command to inspect next.',
    '- For editor diagnostics, prefer the local project typecheck/test command over workspace release gates.',
    '- Do not claim a mutation has been applied unless a tool reports it.',
    '- Include the smallest safe fix path, verify command, and rollback note.',
  ]
    .flat()
    .filter(Boolean)
    .join('\n');
}

export class WorkspaiCodeActionsProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
    vscode.CodeActionKind.Refactor,
  ];
  private static readonly AI_DEBUG_LANGUAGES = new Set([
    'python',
    'typescript',
    'javascript',
    'go',
    'java',
    'csharp',
    'php',
    'ruby',
    'rust',
    'kotlin',
    'scala',
    'sql',
    'yaml',
    'json',
    'jsonc',
    'toml',
    'shellscript',
    'dockerfile',
    'typescriptreact',
    'javascriptreact',
  ]);

  private getRangeSnippet(document: vscode.TextDocument, range: vscode.Range): string | undefined {
    const text = document.getText(document.validateRange(range)).trim();
    if (!text) {
      return undefined;
    }
    if (text.length <= 800) {
      return text;
    }
    return `${text.slice(0, 800)}\n... [truncated]`;
  }

  private buildDiagnosticSeed(
    intent: 'debug' | 'fix-preview' | 'explain',
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext
  ): string {
    const diagnostics = context.diagnostics.map((diagnostic) => ({
      severity: diagnostic.severity === vscode.DiagnosticSeverity.Error ? 'ERROR' : 'WARN',
      line: diagnostic.range.start.line + 1,
      column: diagnostic.range.start.character + 1,
      fileLineLabel: `${vscode.workspace.asRelativePath(document.fileName)}:${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1}`,
      message: diagnostic.message,
    }));

    return buildAIDiagnosticSeed({
      intent,
      fileName: vscode.workspace.asRelativePath(document.fileName),
      languageId: document.languageId,
      diagnostics,
      snippet: this.getRangeSnippet(document, range),
    });
  }

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.CodeAction[] | undefined {
    const actions: vscode.CodeAction[] = [];

    // Quick fixes for configuration files
    if (isWorkspaiConfigurationFile(document.fileName)) {
      actions.push(...this.getConfigurationQuickFixes(document, range, context));
    }

    // Quick fixes for module.yaml files
    if (document.fileName.endsWith('module.yaml')) {
      actions.push(...this.getModuleQuickFixes(document, range, context));
    }

    // AI debug actions are available for any editable document that has diagnostics or selection.
    actions.push(...this.getAIDebugActions(document, range, context));

    return actions.length > 0 ? actions : undefined;
  }

  /** "Debug with AI" action shown when there are diagnostics or a selection. */
  private getAIDebugActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    if (!WorkspaiCodeActionsProvider.AI_DEBUG_LANGUAGES.has(document.languageId)) {
      return [];
    }

    const actions: vscode.CodeAction[] = [];

    const hasErrors = context.diagnostics.some(
      (d) => d.severity === vscode.DiagnosticSeverity.Error
    );
    const selectionSnippet = this.getRangeSnippet(document, range);
    const hasSelection = Boolean(selectionSnippet);

    if (hasErrors || hasSelection) {
      const fixAction = new vscode.CodeAction('Fix with Workspai', vscode.CodeActionKind.QuickFix);
      const editorIssue = buildEditorIssuePayload(document, context);
      fixAction.command = {
        command: 'workspai.openIncidentStudio',
        title: 'Fix with Workspai',
        arguments: [
          {
            initialTask: this.buildDiagnosticSeed('fix-preview', document, range, context),
            composerHandoff: 'prefill',
            studioMode: 'investigate',
            source: 'code-action',
            trigger: 'editor-fix',
            editorIssue,
          },
        ],
      };
      fixAction.isPreferred = hasErrors;
      actions.push(fixAction);
    }

    if (hasErrors) {
      const editorIssue = buildEditorIssuePayload(document, context);
      const explainAction = new vscode.CodeAction(
        'Explain with Workspai',
        vscode.CodeActionKind.QuickFix
      );
      explainAction.command = {
        command: 'workspai.openWorkspaceAdvisor',
        title: 'Explain with Workspai',
        arguments: [
          {
            initialQuestion: this.buildDiagnosticSeed('explain', document, range, context),
            source: 'code-action',
            trigger: 'editor-explain',
            editorIssue,
          },
        ],
      };
      actions.push(explainAction);
    }

    return actions;
  }

  private getConfigurationQuickFixes(
    document: vscode.TextDocument,
    _range: vscode.Range,
    _context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // Add missing fields
    const text = document.getText();
    if (!text.includes('"framework"')) {
      const action = new vscode.CodeAction(
        'Add missing framework field',
        vscode.CodeActionKind.QuickFix
      );
      action.edit = new vscode.WorkspaceEdit();
      action.edit.replace(
        document.uri,
        new vscode.Range(document.positionAt(0), document.positionAt(text.length)),
        buildMissingFrameworkDocumentText(text)
      );
      actions.push(action);
    }

    return actions;
  }

  private getModuleQuickFixes(
    document: vscode.TextDocument,
    _range: vscode.Range,
    _context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // Add missing metadata
    const text = document.getText();
    if (!text.includes('version:')) {
      const action = new vscode.CodeAction('Add version field', vscode.CodeActionKind.QuickFix);
      action.edit = new vscode.WorkspaceEdit();
      action.edit.insert(document.uri, new vscode.Position(1, 0), 'version: "1.0.0"\n');
      actions.push(action);
    }

    return actions;
  }
}

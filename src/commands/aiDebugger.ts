/**
 * AI Debugger Command
 * Routes all debug entry points through the shared Workspai AI modal.
 * The old dedicated debugger panel was duplicating prompt/context logic and is intentionally removed.
 */

import * as vscode from 'vscode';
import type { AIModalContext } from '../core/aiService';
import { resolvePreferredAIModalContext } from '../core/aiContextResolver';
import { WelcomePanel } from '../ui/panels/welcomePanel';
import { parseLogTrace, readLogFile } from '../core/patchApplyEngine';

// ──────────────────────────────────────────────
// Context collection helpers
// ──────────────────────────────────────────────

/** Returns the user's text selection in the active editor, or undefined. */
export function getEditorSelection(editor = vscode.window.activeTextEditor): string | undefined {
  if (!editor) {
    return undefined;
  }
  const sel = editor.selection;
  if (sel.isEmpty) {
    return undefined;
  }
  return editor.document.getText(sel);
}

/** Returns diagnostics (errors/warnings) from the active file as a formatted string. */
export function formatDiagnostics(diagnostics: readonly vscode.Diagnostic[]): string | undefined {
  if (diagnostics.length === 0) {
    return undefined;
  }

  return diagnostics
    .slice(0, 20)
    .map((d) => {
      const sev = d.severity === vscode.DiagnosticSeverity.Error ? 'ERROR' : 'WARN';
      return `[${sev}] Line ${d.range.start.line + 1}: ${d.message}`;
    })
    .join('\n');
}

export function getActiveDiagnostics(
  editor = vscode.window.activeTextEditor,
  diagnostics = editor ? vscode.languages.getDiagnostics(editor.document.uri) : []
): string | undefined {
  if (!editor) {
    return undefined;
  }

  return formatDiagnostics(diagnostics);
}

export function collectDebugPrefillQuestion(
  editor = vscode.window.activeTextEditor,
  diagnostics = editor ? vscode.languages.getDiagnostics(editor.document.uri) : []
): string | undefined {
  return getEditorSelection(editor) ?? getActiveDiagnostics(editor, diagnostics);
}

export function collectExplainPrefillQuestion(
  issueSummary?: unknown,
  editor = vscode.window.activeTextEditor,
  diagnostics = editor ? vscode.languages.getDiagnostics(editor.document.uri) : []
): string | undefined {
  const invocationSeed = parseAIDebugInvocationSeed(issueSummary);
  if (invocationSeed) {
    return invocationSeed;
  }
  const selected = getEditorSelection(editor);
  if (selected) {
    return selected;
  }
  return getActiveDiagnostics(editor, diagnostics);
}

function parseAIDebugInvocationSeed(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const payload = value as Record<string, unknown>;
  if (typeof payload.seed === 'string') {
    const trimmed = payload.seed.trim();
    return trimmed || undefined;
  }
  return undefined;
}

/**
 * Read a log file selected by the user and return structured debug context.
 * Returns null if the user cancelled or the file could not be read.
 */
export async function collectLogFileDebugContext(uri?: vscode.Uri): Promise<{
  rawText: string;
  parsedTrace: ReturnType<typeof parseLogTrace>;
  filePath: string;
} | null> {
  let fileUri = uri;
  if (!fileUri) {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Select log file',
      filters: { 'Log files': ['log', 'txt', 'out', 'err', 'json'], 'All files': ['*'] },
    });
    if (!picked || picked.length === 0) {
      return null;
    }
    fileUri = picked[0];
  }

  const rawText = await readLogFile(fileUri.fsPath);
  if (rawText === null) {
    void vscode.window.showErrorMessage(`Could not read log file: ${fileUri.fsPath}`);
    return null;
  }

  const parsedTrace = parseLogTrace(rawText);
  return { rawText, parsedTrace, filePath: fileUri.fsPath };
}

// ──────────────────────────────────────────────
// Command registration
// ──────────────────────────────────────────────

export function registerAIDebuggerCommand(context: vscode.ExtensionContext): vscode.Disposable {
  const debugCommand = vscode.commands.registerCommand(
    'workspai.debugWithAI',
    async (seed?: unknown) => {
      const prefillQuestion = parseAIDebugInvocationSeed(seed) ?? collectDebugPrefillQuestion();
      const baseContext: AIModalContext = await resolvePreferredAIModalContext();
      WelcomePanel.showAIModal(context, {
        ...baseContext,
        prefillQuestion,
        prefillMode: 'debug',
      });
    }
  );

  const explainCommand = vscode.commands.registerCommand(
    'workspai.explainErrorWithAI',
    async (issueSummary?: string) => {
      const prefillQuestion = collectExplainPrefillQuestion(issueSummary);
      const baseContext: AIModalContext = await resolvePreferredAIModalContext();
      WelcomePanel.showAIModal(context, {
        ...baseContext,
        prefillQuestion,
        prefillMode: 'ask',
      });
    }
  );

  // A03: Ingest a log file and open Incident Studio with the trace as context
  const ingestLogCommand = vscode.commands.registerCommand(
    'workspai.ingestLogFile',
    async (uri?: vscode.Uri) => {
      const logCtx = await collectLogFileDebugContext(uri);
      if (!logCtx) {
        return;
      }

      const { rawText, parsedTrace, filePath } = logCtx;
      const baseContext: AIModalContext = await resolvePreferredAIModalContext();
      const workspacePath = baseContext.workspaceRootPath ?? baseContext.path;

      const traceHeader = parsedTrace.errorType
        ? `${parsedTrace.errorType}: ${parsedTrace.errorMessage ?? ''}`
        : '';
      const relatedFilesNote =
        parsedTrace.relatedFiles.length > 0
          ? `Related files detected: ${parsedTrace.relatedFiles.slice(0, 5).join(', ')}`
          : '';
      const initialQuery = [
        'Analyze this production log trace and propose the smallest safe fix with verification steps.',
        traceHeader || `Log file: ${vscode.workspace.asRelativePath(filePath)}`,
        relatedFilesNote,
        '',
        rawText.slice(0, 3000),
      ]
        .filter(Boolean)
        .join('\n');

      if (workspacePath) {
        WelcomePanel.openIncidentStudio(context, {
          workspacePath,
          workspaceName: baseContext.name,
          projectPath: baseContext.path,
          projectName: baseContext.name,
          projectType: baseContext.framework,
          initialQuery,
          preferredDisplayMode: 'lite',
        });
        return;
      }

      WelcomePanel.showAIModal(context, {
        ...baseContext,
        prefillQuestion: initialQuery,
        prefillMode: 'debug',
      });
    }
  );

  return vscode.Disposable.from(debugCommand, explainCommand, ingestLogCommand);
}

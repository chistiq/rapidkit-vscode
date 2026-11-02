import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';
import * as vscode from 'vscode';
import { askConfiguredAIProviderForToolAction } from './aiProviderService.js';
import { studioAgentInstructionsTool } from './studioAgentInstructions.js';
import { studioSourcePathDenialReason } from './studioWorkspacePathPolicy.js';
import { resolveStudioNextEdit } from './studioNextEdit.js';

type Proposal = {
  id: string;
  document: vscode.TextDocument;
  version: number;
  range: vscode.Range;
  before: string;
  after: string;
  replacement: string;
  workspaceRoot: string;
};
export class StudioInlineEdit
  implements vscode.Disposable, vscode.TextDocumentContentProvider, vscode.CodeLensProvider
{
  private readonly proposals = new Map<string, Proposal>();
  private disposed = false;
  private readonly recentEdits = new Map<string, { version: number; changes: unknown[] }>();
  private readonly change = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.change.event;
  private readonly subscriptions: vscode.Disposable[];
  constructor(private readonly context: vscode.ExtensionContext) {
    this.subscriptions = [
      vscode.workspace.registerTextDocumentContentProvider('workspai-inline', this),
      vscode.languages.registerCodeLensProvider({ scheme: 'file' }, this),
      vscode.commands.registerCommand('workspai.assistant.inlineEdit', () => this.propose()),
      vscode.commands.registerCommand('workspai.assistant.nextEdit', () => this.propose(true)),
      vscode.workspace.onDidChangeTextDocument((event) => {
        const document = event.document;
        if (
          !vscode.workspace.isTrusted ||
          !event.contentChanges.length ||
          document !== vscode.window.activeTextEditor?.document ||
          document.uri.scheme !== 'file'
        ) {
          return;
        }
        const folder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (
          !folder ||
          studioSourcePathDenialReason(path.relative(folder.uri.fsPath, document.uri.fsPath))
        ) {
          return;
        }
        const id = document.uri.toString();
        this.recentEdits.delete(id);
        this.recentEdits.set(id, {
          version: document.version,
          changes: event.contentChanges.slice(-4).map((change) => ({
            rangeOffset: change.rangeOffset,
            rangeLength: change.rangeLength,
            text: change.text.slice(0, 2_000),
            truncated: change.text.length > 2_000,
          })),
        });
        while (this.recentEdits.size > 8) {
          this.recentEdits.delete(this.recentEdits.keys().next().value!);
        }
      }),
      vscode.commands.registerCommand('_workspai.acceptInlineEdit', (id: string) =>
        this.accept(id)
      ),
      vscode.commands.registerCommand('_workspai.discardInlineEdit', (id: string) => {
        this.proposals.delete(id);
        this.change.fire();
      }),
    ];
  }
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.subscriptions.forEach((item) => item.dispose());
    this.change.dispose();
    this.proposals.clear();
    this.recentEdits.clear();
  }
  provideTextDocumentContent(uri: vscode.Uri): string {
    const proposal = this.proposals.get(uri.authority);
    return uri.path === '/before' ? (proposal?.before ?? '') : (proposal?.after ?? '');
  }
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    return [...this.proposals.values()]
      .filter((proposal) => proposal.document.uri.toString() === document.uri.toString())
      .flatMap((proposal) => [
        new vscode.CodeLens(proposal.range, {
          title: 'Accept Workspai edit',
          command: '_workspai.acceptInlineEdit',
          arguments: [proposal.id],
        }),
        new vscode.CodeLens(proposal.range, {
          title: 'Discard',
          command: '_workspai.discardInlineEdit',
          arguments: [proposal.id],
        }),
      ]);
  }
  private async validateScope(document: vscode.TextDocument, expectedRoot?: string) {
    if (!vscode.workspace.isTrusted) {
      throw new Error('Trust the workspace before requesting or applying an inline edit.');
    }
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder || (expectedRoot && folder.uri.fsPath !== expectedRoot)) {
      throw new Error('Open this file in its original workspace before applying an inline edit.');
    }
    const root = await fs.realpath(folder.uri.fsPath);
    const target = await fs
      .realpath(document.uri.fsPath)
      .catch(async (error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') {
          throw error;
        }
        return path.join(
          await fs.realpath(path.dirname(document.uri.fsPath)),
          path.basename(document.uri.fsPath)
        );
      });
    const relative = path.relative(root, target);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error('The inline edit target resolves outside the selected workspace.');
    }
    const denial =
      studioSourcePathDenialReason(relative) ??
      studioSourcePathDenialReason(path.relative(folder.uri.fsPath, document.uri.fsPath));
    if (denial) {
      throw new Error(`This file is outside the editable source scope: ${denial}.`);
    }
    if (!vscode.workspace.isTrusted) {
      throw new Error('Workspace trust changed; the inline edit was not applied.');
    }
    return folder;
  }
  private async accept(id: string): Promise<void> {
    const proposal = this.proposals.get(id);
    if (!proposal) {
      return;
    }
    try {
      await this.validateScope(proposal.document, proposal.workspaceRoot);
    } catch (error) {
      void vscode.window.showWarningMessage(error instanceof Error ? error.message : String(error));
      return;
    }
    if (
      proposal.document.isClosed ||
      proposal.document.version !== proposal.version ||
      proposal.document.getText() !== proposal.before
    ) {
      void vscode.window.showWarningMessage(
        'The document changed after this proposal. Discard it and request a fresh edit.'
      );
      return;
    }
    const edit = new vscode.WorkspaceEdit();
    edit.replace(proposal.document.uri, proposal.range, proposal.replacement);
    if (!(await vscode.workspace.applyEdit(edit))) {
      throw new Error('VS Code could not apply the edit.');
    }
    this.proposals.delete(id);
    this.change.fire();
    await vscode.window.showTextDocument(proposal.document);
  }
  private async propose(predictNext = false): Promise<void> {
    if (this.disposed) {
      return;
    }
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== 'file') {
      return;
    }
    try {
      await this.validateScope(editor.document);
    } catch (error) {
      void vscode.window.showWarningMessage(error instanceof Error ? error.message : String(error));
      return;
    }
    const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (!folder) {
      void vscode.window.showWarningMessage(
        'Open this file in a workspace before requesting an inline edit.'
      );
      return;
    }
    const relative = path.relative(folder.uri.fsPath, editor.document.uri.fsPath);
    const denial = studioSourcePathDenialReason(relative);
    if (denial) {
      void vscode.window.showWarningMessage(
        `This file is outside the editable source scope: ${denial}.`
      );
      return;
    }
    const instruction = predictNext
      ? 'Predict one useful next edit from the cursor, current source and recent edits. Infer intent conservatively; return none when no useful continuation is clear. Do not invent requirements or apply unrelated refactors.'
      : await vscode.window.showInputBox({
          prompt: 'Describe the change to the selection (or the full file if nothing is selected)',
          placeHolder: 'e.g. Handle an empty input and simplify this function',
        });
    if (!instruction?.trim()) {
      return;
    }
    if (this.proposals.size >= 16) {
      void vscode.window.showWarningMessage(
        'Review or discard an existing inline proposal before starting another.'
      );
      return;
    }
    const document = editor.document;
    const version = document.version;
    const before = document.getText();
    if (predictNext && before.length > 1_000_000) {
      void vscode.window.showWarningMessage(
        'Use Assistant for a file larger than the next-edit review limit.'
      );
      return;
    }
    if (!predictNext && before.length > 96_000 && editor.selection.isEmpty) {
      void vscode.window.showWarningMessage(
        'Select a focused range or use Assistant for this large edit.'
      );
      return;
    }
    let range = editor.selection.isEmpty
      ? new vscode.Range(document.positionAt(0), document.positionAt(before.length))
      : new vscode.Range(editor.selection.start, editor.selection.end);
    const selectedText = predictNext ? '' : document.getText(range);
    if (selectedText.length > 64_000) {
      void vscode.window.showWarningMessage('Select a smaller range for this inline edit.');
      return;
    }
    const cursorOffset = predictNext ? document.offsetAt(editor.selection.active) : 0;
    const contextStart = Math.max(0, cursorOffset - 12_000);
    const contextEnd = Math.min(before.length, cursorOffset + 12_000);
    const documentContext = predictNext
      ? before.slice(contextStart, contextEnd)
      : before.length > 64_000
        ? before.slice(
            Math.max(0, document.offsetAt(range.start) - 16_000),
            document.offsetAt(range.end) + 16_000
          )
        : before;
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: predictNext ? 'Workspai next edit' : 'Workspai inline edit',
        cancellable: true,
      },
      async (_progress, token) => {
        const controller = new AbortController();
        const cancellation = token.onCancellationRequested(() => controller.abort());
        try {
          const rules = await studioAgentInstructionsTool.execute(
            { path: relative },
            {
              sessionId: 'inline',
              requestId: 'inline',
              toolCallId: 'instructions',
              workspacePath: folder.uri.fsPath,
              signal: controller.signal,
            }
          );
          if (this.disposed || token.isCancellationRequested) {
            return;
          }
          const response = await askConfiguredAIProviderForToolAction(
            this.context,
            [
              {
                role: 'user',
                content: `${predictNext ? 'Return propose-next-edit with one exact oldText block from the shown source and its replacement, or action:none.' : 'Propose a focused replacement for the selected range. Return propose-inline-edit.'} Do not claim that it was applied or tested. Respect the user's request and applicable repository instructions.\nRequest: ${instruction}\nFile: ${relative}\nRepository instructions: ${JSON.stringify(rules.output)}\n${predictNext ? `Cursor offset in shown context: ${cursorOffset - contextStart}\nRecent editor changes (only when current): ${JSON.stringify(this.recentEdits.get(document.uri.toString())?.version === version ? this.recentEdits.get(document.uri.toString())?.changes : [])}\n` : ''}Document context (may be bounded):\n${documentContext}\n${predictNext ? '' : `Selected text:\n${selectedText}`}`,
              },
            ],
            [
              {
                name: predictNext ? 'propose-next-edit' : 'propose-inline-edit',
                description: predictNext
                  ? 'Predict one focused exact source replacement for review, or return none. No change is applied.'
                  : 'Propose the exact replacement text for review, preserving all text outside the selected range.',
                inputSchema: {
                  type: 'object',
                  required: predictNext ? ['action', 'oldText', 'replacement'] : ['replacement'],
                  additionalProperties: false,
                  properties: {
                    replacement: { type: 'string' },
                    ...(predictNext
                      ? {
                          action: { type: 'string', enum: ['edit', 'none'] },
                          oldText: {
                            type: 'string',
                            description:
                              'One exact nonempty source block for edit; empty for none.',
                          },
                        }
                      : {}),
                  },
                },
              },
            ],
            token
          );
          if (this.disposed || token.isCancellationRequested) {
            return;
          }
          if (
            response.type !== 'tool' ||
            response.toolName !== (predictNext ? 'propose-next-edit' : 'propose-inline-edit') ||
            typeof response.input.replacement !== 'string'
          ) {
            throw new Error(
              'The model did not return a valid edit proposal. Try another model or use Assistant.'
            );
          }
          await this.validateScope(document, folder.uri.fsPath);
          if (this.disposed || token.isCancellationRequested) {
            return;
          }
          if (document.isClosed || document.version !== version || document.getText() !== before) {
            throw new Error(
              'The document changed while the proposal was being prepared. Request a fresh edit.'
            );
          }
          const prediction = predictNext
            ? resolveStudioNextEdit(before, contextStart, contextEnd, response.input)
            : undefined;
          if (predictNext && !prediction) {
            void vscode.window.showInformationMessage('No useful next edit was suggested.');
            return;
          }
          if (prediction) {
            range = new vscode.Range(
              document.positionAt(prediction.start),
              document.positionAt(prediction.end)
            );
          }
          const replacement = prediction?.replacement ?? response.input.replacement;
          const after =
            before.slice(0, document.offsetAt(range.start)) +
            replacement +
            before.slice(document.offsetAt(range.end));
          const id = crypto.randomUUID();
          this.proposals.set(id, {
            id,
            document,
            version,
            range,
            before,
            after,
            replacement,
            workspaceRoot: folder.uri.fsPath,
          });
          this.change.fire();
          await vscode.commands.executeCommand(
            'vscode.diff',
            vscode.Uri.parse(`workspai-inline://${id}/before`),
            vscode.Uri.parse(`workspai-inline://${id}/after`),
            `Workspai edit · ${path.basename(relative)}`,
            { preview: true }
          );
          if (this.disposed) {
            return;
          }
          // Review is a user decision, not an ongoing model request. End the
          // progress notification while keeping diff and CodeLens actions live.
          void Promise.resolve(
            vscode.window.showInformationMessage(
              'Review the proposed edit. It has not been applied or verified.',
              'Apply edit',
              'Discard'
            )
          )
            .then(async (choice) => {
              if (choice === 'Apply edit') {
                await this.accept(id);
              } else if (choice === 'Discard') {
                this.proposals.delete(id);
                this.change.fire();
              }
            })
            .catch((error: unknown) => {
              if (!this.disposed) {
                void vscode.window.showErrorMessage(
                  error instanceof Error ? error.message : String(error)
                );
              }
            });
        } catch (error) {
          if (!token.isCancellationRequested) {
            void vscode.window.showErrorMessage(
              error instanceof Error ? error.message : String(error)
            );
          }
        } finally {
          cancellation.dispose();
        }
      }
    );
  }
}

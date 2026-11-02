import * as vscode from 'vscode';
import { renderStudioSubagentHistory } from './studioSubagentHistory.js';
import { onStudioSubagentHistoryChanged } from './studioAgentSessionStore.js';

const SCHEME = 'workspai-subagent';
export function registerStudioSubagentDocuments(
  context: vscode.ExtensionContext
): vscode.Disposable {
  const changed = new vscode.EventEmitter<vscode.Uri>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const stop = onStudioSubagentHistoryChanged((owner) => {
    for (const document of vscode.workspace.textDocuments) {
      const uri = document.uri;
      if (uri.scheme !== SCHEME || new URLSearchParams(uri.query).get('session') !== owner) {
        continue;
      }
      const key = uri.toString();
      if (pending.has(key)) {
        continue;
      }
      pending.set(
        key,
        setTimeout(() => {
          pending.delete(key);
          changed.fire(uri);
        }, 150)
      );
    }
  });
  const registration = vscode.workspace.registerTextDocumentContentProvider(SCHEME, {
    onDidChange: changed.event,
    async provideTextDocumentContent(uri) {
      const query = new URLSearchParams(uri.query);
      return renderStudioSubagentHistory(context, {
        sessionId: query.get('session') ?? '',
        requestId: query.get('request') ?? '',
        toolCallId: query.get('tool') ?? '',
      });
    },
  });
  return {
    dispose() {
      stop();
      for (const timer of pending.values()) {
        clearTimeout(timer);
      }
      pending.clear();
      registration.dispose();
      changed.dispose();
    },
  };
}
export async function showStudioSubagentActivity(input: {
  sessionId: string;
  requestId: string;
  toolCallId: string;
}): Promise<void> {
  if (Object.values(input).some((value) => !value || value.length > 200)) {
    throw new Error('Invalid subagent activity identity.');
  }
  const uri = vscode.Uri.from({
    scheme: SCHEME,
    path: '/Subagent activity.log',
    query: new URLSearchParams({
      session: input.sessionId,
      request: input.requestId,
      tool: input.toolCallId,
    }).toString(),
  });
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document, { preview: true });
}

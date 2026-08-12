import type * as vscode from 'vscode';

import type { WorkspaceRepairDecision } from './workspaceRepairCliClient.js';

export function renderNativeRepairDecisionButtons(
  stream: Pick<vscode.ChatResponseStream, 'button'>,
  transactionId: string,
  options: readonly WorkspaceRepairDecision[]
): void {
  for (const decision of options) {
    const title = decision
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    stream.button({
      command: 'workbench.action.chat.open',
      title,
      tooltip: `Submit ${decision} to CLI repair transaction ${transactionId}`,
      arguments: [
        {
          query: `@workspai /repair ${decision} ${transactionId}`,
          isPartialQuery: false,
        },
      ],
    });
  }
}

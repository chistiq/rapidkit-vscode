import * as vscode from 'vscode';

/** Tool decisions can include long reasoning and complete file-edit payloads. */
export function getAIToolRequestTimeoutMs(): number {
  const fallback = 180_000;
  const configured = vscode.workspace
    .getConfiguration('workspai')
    .get<number>('aiToolRequestTimeoutMs', fallback);
  return Number.isFinite(configured) ? Math.max(8_000, Math.min(600_000, configured)) : fallback;
}

export class AIModelRequestTimeoutError extends Error {
  readonly code = 'AI_MODEL_REQUEST_TIMEOUT';

  constructor(
    readonly timeoutMs: number,
    setting = 'workspai.aiToolRequestTimeoutMs'
  ) {
    super(
      `AI model request timed out after ${timeoutMs}ms. Recorded work is retained; continue the session or increase ${setting}.`
    );
    this.name = 'AIModelRequestTimeoutError';
  }
}

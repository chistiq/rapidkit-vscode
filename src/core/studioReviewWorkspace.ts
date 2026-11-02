import type { StudioExecutionTarget } from './studioProjectTarget.js';

/** Resolve public target references against host-owned receipts, never UI paths. */
export async function resolveStudioReviewWorkspace(input: {
  record: Record<string, unknown>;
  loadTarget: (sessionId: string, ref: string) => Promise<StudioExecutionTarget | undefined>;
  validateTarget: (target: StudioExecutionTarget) => Promise<void>;
  loadRequestWorkspace?: (sessionId: string, requestId?: string) => Promise<string | undefined>;
  loadTransactionWorkspace?: (
    sessionId: string,
    transactionId: string,
    requestId?: string
  ) => Promise<string>;
  fallback: () => Promise<string>;
}): Promise<string> {
  const { record } = input;
  if (
    typeof record.transactionId === 'string' &&
    record.transactionId.startsWith('native-') &&
    input.loadTransactionWorkspace
  ) {
    if (typeof record.sessionId !== 'string') {
      throw new Error('The file transaction requires its owning chat.');
    }
    return input.loadTransactionWorkspace(
      record.sessionId,
      record.transactionId,
      typeof record.requestId === 'string' ? record.requestId : undefined
    );
  }
  if (record.targetRef !== undefined) {
    if (typeof record.targetRef !== 'string' || typeof record.sessionId !== 'string') {
      throw new Error('The changed file requires its owning session and destination reference.');
    }
    const target = await input.loadTarget(record.sessionId, record.targetRef);
    if (!target || target.ref !== record.targetRef) {
      throw new Error('This historical destination is no longer available for review.');
    }
    await input.validateTarget(target);
    return target.workspacePath;
  }
  if (typeof record.sessionId === 'string' && input.loadRequestWorkspace) {
    const workspace = await input.loadRequestWorkspace(
      record.sessionId,
      typeof record.requestId === 'string' ? record.requestId : undefined
    );
    if (!workspace) {
      throw new Error('This request destination is no longer available for review.');
    }
    return workspace;
  }
  return typeof record.workspacePath === 'string' && record.workspacePath.trim()
    ? record.workspacePath.trim()
    : input.fallback();
}

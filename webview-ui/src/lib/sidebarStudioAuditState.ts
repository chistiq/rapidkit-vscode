import type { SidebarScope } from '@/sidebar/sidebarTypes';

export type SidebarStudioAuditState = {
  actionId: string;
  kind?: string;
  status: 'stale' | 'failed';
  registryRecorded: boolean;
  feedbackRecorded: boolean;
  error?: string;
  retryable: boolean;
};

export function parseSidebarStudioAuditState(
  data: Record<string, unknown>
): SidebarStudioAuditState | null {
  if (data.status === 'saved') {
    return null;
  }
  if (data.status !== 'stale' && data.status !== 'failed') {
    return null;
  }
  return {
    actionId: typeof data.actionId === 'string' ? data.actionId : 'studio-audit',
    kind: typeof data.kind === 'string' ? data.kind : undefined,
    status: data.status,
    registryRecorded: data.registryRecorded === true,
    feedbackRecorded: data.feedbackRecorded === true,
    error: typeof data.error === 'string' ? data.error : undefined,
    retryable: data.retryable === true,
  };
}

export function buildSidebarStudioRetryAuditPayload(input: {
  sessionId?: string;
  scope: SidebarScope;
}): Record<string, unknown> {
  return {
    action: 'retry-audit',
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    scope: input.scope,
  };
}

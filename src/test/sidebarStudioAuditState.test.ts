import { describe, expect, it } from 'vitest';

import {
  buildSidebarStudioRetryAuditPayload,
  parseSidebarStudioAuditState,
} from '../../webview-ui/src/lib/sidebarStudioAuditState';

describe('sidebar Studio audit state UI contract', () => {
  it('clears visible audit state when feedback is saved', () => {
    expect(
      parseSidebarStudioAuditState({
        status: 'saved',
        actionId: 'verify',
        registryRecorded: true,
        feedbackRecorded: true,
      })
    ).toBeNull();
  });

  it('surfaces stale feedback history with retry metadata', () => {
    const state = parseSidebarStudioAuditState({
      status: 'stale',
      actionId: 'verify-handoff',
      kind: 'verify-handoff',
      registryRecorded: true,
      feedbackRecorded: false,
      retryable: true,
      error: 'Workspace feedback record returned malformed JSON.',
    });

    expect(state).toMatchObject({
      actionId: 'verify-handoff',
      kind: 'verify-handoff',
      status: 'stale',
      registryRecorded: true,
      feedbackRecorded: false,
      retryable: true,
      error: 'Workspace feedback record returned malformed JSON.',
    });
  });

  it('builds a retry-audit action payload with current Studio session and scope', () => {
    expect(
      buildSidebarStudioRetryAuditPayload({
        sessionId: 'studio-1',
        scope: { workspacePath: '/ws', workspaceName: 'demo', projectName: 'api' },
      })
    ).toEqual({
      action: 'retry-audit',
      sessionId: 'studio-1',
      scope: { workspacePath: '/ws', workspaceName: 'demo', projectName: 'api' },
    });
  });
});

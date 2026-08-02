import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  Object.defineProperty(globalThis, 'acquireVsCodeApi', {
    configurable: true,
    value: () => ({
      postMessage: () => undefined,
      getState: () => undefined,
      setState: () => undefined,
    }),
  });
});

describe('Studio session workspace identity', () => {
  it('keeps identical project and card names distinguishable across workspaces', async () => {
    const { chatSessionContextLabel, chatSessionWorkspaceKey } =
      await import('../../webview-ui/src/sidebar/sidebarSessions');
    const now = new Date(0).toISOString();
    const base = {
      sessionId: 'session',
      title: 'Fix Workspace Doctor',
      messages: [],
      status: 'error' as const,
    };
    const alpha = {
      ...base,
      sessionId: 'alpha',
      incident: {
        key: 'alpha-incident',
        workspaceName: 'commerce-platform',
        workspacePath: '/workspaces/commerce-platform',
        projectName: 'api',
        projectPath: '/workspaces/commerce-platform/api',
        cardId: 'doctor',
        cardLabel: 'Workspace Doctor',
        firstSeenAt: now,
        lastSeenAt: now,
      },
    };
    const beta = {
      ...base,
      sessionId: 'beta',
      incident: {
        ...alpha.incident,
        key: 'beta-incident',
        workspaceName: 'billing-platform',
        workspacePath: '/workspaces/billing-platform',
        projectPath: '/workspaces/billing-platform/api',
      },
    };

    expect(chatSessionContextLabel(alpha)).toBe('commerce-platform / api');
    expect(chatSessionContextLabel(beta)).toBe('billing-platform / api');
    expect(chatSessionWorkspaceKey(alpha)).not.toBe(chatSessionWorkspaceKey(beta));
  });

  it('labels workspace-scoped incidents without inventing a project', async () => {
    const { chatSessionContextLabel } =
      await import('../../webview-ui/src/sidebar/sidebarSessions');
    const now = new Date(0).toISOString();
    expect(
      chatSessionContextLabel({
        sessionId: 'workspace-repair',
        title: 'Fix Readiness',
        messages: [],
        status: 'idle',
        incident: {
          key: 'workspace-readiness',
          workspaceName: 'commerce-platform',
          workspacePath: '/workspaces/commerce-platform',
          cardId: 'readiness',
          scope: 'workspace',
          firstSeenAt: now,
          lastSeenAt: now,
        },
      })
    ).toBe('commerce-platform / workspace');
  });
});

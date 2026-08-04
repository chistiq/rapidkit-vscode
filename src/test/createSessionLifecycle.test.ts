import { describe, expect, it } from 'vitest';

import { settleInterruptedCreateSessions } from '../../webview-ui/src/lib/createSessionLifecycle';
import type { CreateSession } from '../../webview-ui/src/sidebar/createTypes';

function session(status: CreateSession['status']): CreateSession {
  return {
    sessionId: `create-${status}`,
    title: `${status} session`,
    target: 'project',
    method: 'ai',
    status,
    messages: [{ id: 'request', role: 'user', kind: 'text', text: 'Create an API' }],
    createdAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
  };
}

describe('Create session lifecycle', () => {
  it.each(['planning', 'running'] as const)(
    'settles a persisted %s operation as an explicit interruption',
    (status) => {
      const [settled] = settleInterruptedCreateSessions(
        [session(status)],
        '2026-08-03T01:00:00.000Z'
      );

      expect(settled.status).toBe('error');
      expect(settled.updatedAt).toBe('2026-08-03T01:00:00.000Z');
      expect(settled.messages.at(-1)).toMatchObject({
        id: `interrupted-create-${status}`,
        kind: 'error',
      });
    }
  );

  it.each(['ready', 'done', 'error'] as const)('preserves a terminal %s session', (status) => {
    const existing = session(status);
    expect(settleInterruptedCreateSessions([existing])[0]).toBe(existing);
  });
});

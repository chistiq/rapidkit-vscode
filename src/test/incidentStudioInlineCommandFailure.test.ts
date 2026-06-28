import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  window: {},
  ProgressLocation: {},
}));

import { summarizeIncidentInlineFailure } from '../ui/panels/incidentStudioInlineCommandBridge';

describe('incident studio inline command failure summary', () => {
  it('prefers stderr tail for verify failure summaries', () => {
    const summary = summarizeIncidentInlineFailure({
      exitCode: 2,
      stdout: 'ignored stdout',
      stderr: ['first', 'second', 'top blocker'].join('\n'),
    });

    expect(summary.error).toBe('Exit 2: first\nsecond\ntop blocker');
    expect(summary.stderrTail).toBe('first\nsecond\ntop blocker');
  });
});

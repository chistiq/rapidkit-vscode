import { describe, expect, it } from 'vitest';

import {
  parseStudioVerifyFailure,
  studioVerifyFailureSummary,
} from '../../webview-ui/src/lib/studioVerifyFailure';

describe('studio verify failure view', () => {
  it('parses failed verify-handoff action results for the blocker chrome', () => {
    const failure = parseStudioVerifyFailure({
      action: 'verify-handoff',
      status: 'failed',
      commandText: 'npx rapidkit workspace verify --json --write',
      exitCode: 2,
      stderrTail: 'workspaceVerify: gate blocked',
      topBlocker: 'release gate failed',
      error: 'Exit 2',
    });

    expect(failure).toEqual({
      commandText: 'npx rapidkit workspace verify --json --write',
      exitCode: 2,
      stderrTail: 'workspaceVerify: gate blocked',
      topBlocker: 'release gate failed',
      error: 'Exit 2',
    });
    expect(failure ? studioVerifyFailureSummary(failure) : null).toBe(
      'workspaceVerify: gate blocked'
    );
  });

  it('ignores non verify-handoff action results', () => {
    expect(parseStudioVerifyFailure({ action: 'auto-fix', status: 'failed' })).toBeNull();
    expect(parseStudioVerifyFailure({ action: 'verify-handoff', status: 'done' })).toBeNull();
  });
});

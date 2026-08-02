import { describe, expect, it } from 'vitest';

import { resolveStudioIncidentRepairStatus } from '../../webview-ui/src/lib/studioIncidentRepairStatus';

describe('Studio incident repair status', () => {
  it('does not confuse a completed intermediate action with a resolved card', () => {
    expect(
      resolveStudioIncidentRepairStatus({
        progressStatus: 'done',
        phase: 'refreshed-governed-evidence',
        cardStatus: 'fail',
      })
    ).toBe('running');
  });

  it('marks an incident done only from passing card evidence or explicit verification', () => {
    expect(
      resolveStudioIncidentRepairStatus({
        progressStatus: 'done',
        phase: 'inspected',
        cardStatus: 'pass',
      })
    ).toBe('done');
    expect(
      resolveStudioIncidentRepairStatus({
        progressStatus: 'done',
        phase: 'verified',
        cardStatus: 'fail',
      })
    ).toBe('done');
  });

  it('preserves running and review states', () => {
    expect(resolveStudioIncidentRepairStatus({ progressStatus: 'running' })).toBe('running');
    expect(resolveStudioIncidentRepairStatus({ progressStatus: 'review' })).toBe('review');
  });
});

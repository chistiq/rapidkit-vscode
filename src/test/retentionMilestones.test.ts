import { describe, expect, it } from 'vitest';

import { applyRetentionMilestone, emptyRetentionMilestoneState } from '../core/retentionMilestones';

describe('retentionMilestones', () => {
  it('records write-once product milestones without details', () => {
    const first = applyRetentionMilestone(
      emptyRetentionMilestoneState(),
      'first_artifact_generated',
      { surface: 'dashboard', now: 100 }
    );
    const second = applyRetentionMilestone(first, 'first_artifact_generated', {
      surface: 'dashboard',
      now: 200,
    });

    expect(second.firstArtifactGeneratedAt).toBe(100);
    expect(JSON.stringify(second)).not.toContain('artifactPath');
    expect(JSON.stringify(second)).not.toContain('rapidkit workspace verify');
  });

  it('counts command failures by broad surface only', () => {
    const state = applyRetentionMilestone(
      applyRetentionMilestone(emptyRetentionMilestoneState(), 'command_failure', {
        surface: 'dashboard',
        now: 100,
      }),
      'command_failure',
      { surface: 'studio', now: 120 }
    );

    expect(state.totalCommandFailures).toBe(2);
    expect(state.commandFailuresBySurface.dashboard).toBe(1);
    expect(state.commandFailuresBySurface.studio).toBe(1);
  });
});

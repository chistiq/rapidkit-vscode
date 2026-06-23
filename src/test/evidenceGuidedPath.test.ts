import { describe, expect, it } from 'vitest';

import {
  evidenceGuidedStepShortLabel,
  findNextSelectableStepIndex,
  findPreviousSelectableStepIndex,
} from '../../webview-ui/src/components/EvidenceGuidedPath';
import type { EvidenceGuidedStep } from '../../webview-ui/src/lib/dashboardEvidenceViewMode';

function step(
  id: EvidenceGuidedStep['id'],
  state: EvidenceGuidedStep['state'],
  title: string
): EvidenceGuidedStep {
  return {
    id,
    state,
    title,
    detail: '',
    cardIds: [],
  };
}

describe('EvidenceGuidedPath', () => {
  it('uses stable rail labels instead of clipping step titles', () => {
    expect(evidenceGuidedStepShortLabel(step('project', 'current', 'Select a project'))).toBe(
      'Project'
    );
    expect(
      evidenceGuidedStepShortLabel(step('project', 'attention', 'Add your first project'))
    ).toBe('Project');
    expect(evidenceGuidedStepShortLabel(step('readiness', 'locked', 'Check readiness'))).toBe(
      'Readiness'
    );
  });

  it('skips locked steps when moving forward through the path', () => {
    const steps: EvidenceGuidedStep[] = [
      step('health', 'complete', 'Workspace health'),
      step('project', 'complete', 'Select a project'),
      step('analyze', 'locked', 'Analyze workspace'),
      step('readiness', 'locked', 'Check readiness'),
      step('verify', 'attention', 'Verify gates'),
      step('release', 'locked', 'Autopilot release'),
    ];

    expect(findNextSelectableStepIndex(steps, 1)).toBe(4);
    expect(findNextSelectableStepIndex(steps, 4)).toBeNull();
  });

  it('skips locked steps when moving backward through the path', () => {
    const steps: EvidenceGuidedStep[] = [
      step('health', 'complete', 'Workspace health'),
      step('project', 'locked', 'Select a project'),
      step('analyze', 'locked', 'Analyze workspace'),
      step('readiness', 'current', 'Check readiness'),
    ];

    expect(findPreviousSelectableStepIndex(steps, 3)).toBe(0);
    expect(findPreviousSelectableStepIndex(steps, 0)).toBeNull();
  });
});

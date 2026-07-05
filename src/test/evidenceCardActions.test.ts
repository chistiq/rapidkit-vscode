import { describe, expect, it } from 'vitest';

import { resolveVisiblePrimaryEvidenceAction } from '../../webview-ui/src/components/EvidenceCardActions';

describe('EvidenceCardActions', () => {
  it('keeps explicit Studio primary actions visible even when agent secondary actions are hidden', () => {
    expect(
      resolveVisiblePrimaryEvidenceAction({
        primaryAction: { type: 'studio', label: 'Fix by Workspai' },
        canRun: false,
        hasRunHandler: false,
        hasStudioHandler: true,
        showAgentActions: false,
        runLabel: 'Run',
      })
    ).toEqual({ type: 'studio', label: 'Fix by Workspai' });
  });

  it('does not invent a Studio fallback when agent actions are hidden', () => {
    expect(
      resolveVisiblePrimaryEvidenceAction({
        canRun: false,
        hasRunHandler: false,
        hasStudioHandler: true,
        showAgentActions: false,
        runLabel: 'Run',
      })
    ).toBeUndefined();
  });
});

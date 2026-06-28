import { describe, expect, it } from 'vitest';

import { deriveSidebarShipLoopView } from '../../webview-ui/src/lib/sidebarShipLoop';

describe('sidebarShipLoop view', () => {
  it('derives compact analyze → verify → readiness → archive steps', () => {
    const view = deriveSidebarShipLoopView([
      { id: 'analyze', status: 'pass' },
      { id: 'readiness', status: 'missing' },
      { id: 'archive', status: 'missing' },
    ]);

    expect(view.steps.map((step) => step.id)).toEqual([
      'analyze',
      'verify-gates',
      'readiness',
      'archive',
    ]);
    expect(view.nextStepId).toBe('verify-gates');
  });
});

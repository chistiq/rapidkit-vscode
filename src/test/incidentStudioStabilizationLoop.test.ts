import { describe, expect, it } from 'vitest';

import {
  deriveEnterpriseStabilizationLoopView,
  resolveStabilizationLoopBlockReason,
} from '../../webview-ui/src/lib/incidentStudioStabilizationLoop';

describe('incidentStudioStabilizationLoop', () => {
  it('derives frozen loop state when expansion is frozen', () => {
    const view = deriveEnterpriseStabilizationLoopView({
      enterpriseStabilizationGateStatus: {
        expansionFrozen: true,
        freezeReason: 'Both stabilization windows must pass.',
        consecutiveWindowsPass: 0,
        last7d: { overallPass: false },
        last30d: { overallPass: false },
      },
    });

    expect(view?.state).toBe('frozen');
    expect(resolveStabilizationLoopBlockReason(view)).toContain('Both stabilization windows');
  });

  it('derives stable loop state when both windows pass consecutively', () => {
    const view = deriveEnterpriseStabilizationLoopView({
      enterpriseStabilizationGateStatus: {
        expansionFrozen: false,
        freezeReason: null,
        consecutiveWindowsPass: 2,
        last7d: { overallPass: true },
        last30d: { overallPass: true },
      },
    });

    expect(view?.state).toBe('stable');
    expect(resolveStabilizationLoopBlockReason(view)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { resolveGovernedStudioRepairMutationBlockReason } from '../ui/panels/incidentStudioMutationGate';

describe('governed Studio repair mutation policy', () => {
  it('allows a trusted contract-authorized reversible repair independently of expansion KPIs', () => {
    expect(
      resolveGovernedStudioRepairMutationBlockReason({
        workspaceTrusted: true,
        contractAuthorized: true,
        reversible: true,
      })
    ).toBeNull();
  });

  it.each([
    [{ workspaceTrusted: false, contractAuthorized: true, reversible: true }, 'trusted'],
    [
      { workspaceTrusted: true, contractAuthorized: false, reversible: true },
      'contract-authorized',
    ],
    [{ workspaceTrusted: true, contractAuthorized: true, reversible: false }, 'rollback'],
    [
      {
        workspaceTrusted: true,
        contractAuthorized: true,
        reversible: true,
        invasive: true,
      },
      'explicit approval',
    ],
  ])('blocks unsafe repair input %j', (input, expectedReason) => {
    expect(resolveGovernedStudioRepairMutationBlockReason(input)).toContain(expectedReason);
  });
});

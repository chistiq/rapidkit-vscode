import { describe, expect, it } from 'vitest';

import {
  canDispatchStudioAIActionOperation,
  resolveStudioAIActionOperationBlockReason,
} from './incidentStudioAIActionGate';

describe('incidentStudioAIActionGate', () => {
  it('blocks apply when contract validation or policy gates fail', () => {
    expect(
      resolveStudioAIActionOperationBlockReason('apply', null, {
        policyMutationBlocked: true,
        policyReason: 'Telemetry stale',
      })
    ).toBe('Telemetry stale');

    expect(
      canDispatchStudioAIActionOperation('verify', {
        contract: {
          schemaVersion: 'workspai.ai-action.v1',
          actionType: 'verify',
          summary: 'Verify auth gate',
          riskLevel: 'low',
          affectedFiles: [],
          proposedCommands: [],
          proposedPatches: [],
          verificationCommands: [],
          rollbackPlan: [],
          confidence: 0.9,
          requiresApproval: true,
        },
        validation: {
          status: 'blocked',
          issues: [],
          canApply: false,
          canVerify: false,
          canRollback: false,
        },
        receivedAt: '2026-06-10T12:00:00.000Z',
      })
    ).toBe(false);
  });
});

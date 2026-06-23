import { describe, expect, it } from 'vitest';

import { buildStudioPosture } from '../../webview-ui/src/components/StudioRedesign/state/studioPosture';

describe('studioPosture', () => {
  it('treats incomplete AI action proof as needs review even with evidence hash', () => {
    const posture = buildStudioPosture({
      releasePosture: 'go',
      policyGates: {
        flowState: 'passing',
        telemetryState: 'complete',
        releasePosture: 'go',
      },
      health: {
        modulesOk: 3,
        modulesWarning: 0,
        modulesError: 0,
        systemStatus: 'ready',
      },
      aiActionRegistry: {
        updatedAt: '2026-06-19T00:00:00.000Z',
        entries: [
          {
            id: 'action-1',
            createdAt: '2026-06-19T00:00:00.000Z',
            summary: 'Verify workspace',
            actionType: 'verify',
            riskLevel: 'low',
            validationStatus: 'valid',
            lifecycleStatus: 'verified',
            executions: [
              {
                operation: 'verify',
                ok: true,
                summary: 'verify completed successfully.',
                evidencePath: '/workspace/.workspai/evidence/verify.json',
                evidenceSha256: 'abcdef1234567890',
                commandCount: 1,
                failedCommandCount: 0,
                completedAt: '2026-06-19T00:01:00.000Z',
                proof: {
                  schemaVersion: 'workspai.ai-action-proof-summary.v1',
                  evidenceRequired: true,
                  evidencePresent: true,
                  evidenceSha256Present: false,
                  transcriptRequired: true,
                  transcriptCommandCount: 1,
                  failedCommandCount: 0,
                  rollbackProofRequired: false,
                  rollbackPlanPresent: false,
                  complete: false,
                  issues: ['Evidence SHA256 is missing.'],
                },
              },
            ],
          },
        ],
      },
    });

    expect(posture.label).toBe('Needs Review');
    expect(posture.tone).toBe('warning');
    expect(posture.proof).toContain('proof incomplete');
    expect(posture.nextProof).toContain('Review proof completeness');
  });
});

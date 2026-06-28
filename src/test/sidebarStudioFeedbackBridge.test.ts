import { describe, expect, it } from 'vitest';

import { buildAgentActionOutcomeFromAudit } from '../core/sidebarStudioFeedbackBridge.js';

describe('sidebarStudioFeedbackBridge (4.17)', () => {
  it('maps audit input to agent-action-outcome payload', () => {
    const payload = buildAgentActionOutcomeFromAudit(
      {
        workspacePath: '/tmp/ws',
        kind: 'apply-patch',
        actionId: 'studio-fix',
        summary: 'Applied config patch',
        ok: true,
        appliedFixes: [{ path: 'config.yaml', action: 'update', outcome: 'applied' }],
        handoff: {
          scope: 'workspace',
          verifyCommand: 'npx rapidkit workspace verify --json',
        } as never,
      },
      { sha256: 'abc', path: '.rapidkit/reports/workspace-verify-last-run.json' }
    );

    expect(payload.schemaVersion).toBe('agent-action-outcome.v1');
    expect(payload.actionId).toBe('studio-fix');
    expect(payload.outcome).toBe('ok');
    expect(payload.affectedFiles).toEqual(['config.yaml']);
    expect(payload.verifyAfter).toContain('workspace verify');
  });

  it('preserves patch metadata for workspace intelligence history replay', () => {
    const payload = buildAgentActionOutcomeFromAudit({
      workspacePath: '/tmp/ws',
      kind: 'apply-patch',
      actionId: 'studio-fix',
      summary: 'Applied selected Studio patches',
      ok: true,
      appliedFixes: [{ path: 'src/config.ts', action: 'apply-debug-patch', outcome: 'applied' }],
      patchMetadata: {
        patchId: 'patch-studio-fix',
        sourceAction: 'apply-patch',
        reviewRequired: true,
        branchCreated: 'workspai/apply-studio-fix',
        appliedCount: 1,
        rejectedCount: 2,
        failedCount: 0,
        affectedFiles: ['src/config.ts'],
        rollbackCommand: 'git checkout -- "src/config.ts"',
      },
    });

    expect(payload.patchMetadata).toMatchObject({
      patchId: 'patch-studio-fix',
      sourceAction: 'apply-patch',
      reviewRequired: true,
      appliedCount: 1,
      rejectedCount: 2,
      failedCount: 0,
      affectedFiles: ['src/config.ts'],
      rollbackCommand: 'git checkout -- "src/config.ts"',
    });
  });
});

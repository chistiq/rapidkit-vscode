import { describe, expect, it } from 'vitest';

import { resolveWorkspaiAssistantModeContract } from '../core/assistantModeContract.js';
import { createStudioAgentWorkspaiToolRegistry } from '../core/studioAgentWorkspaiTools.js';

const host = {
  discover: async () => ({ ok: true }),
  inspect: async () => ({ ok: true }),
  search: async () => ({ ok: true, output: [] }),
  graphSearch: async () => ({ ok: true, output: [] }),
  diagnostics: async () => ({ ok: true }),
  inspectChanges: async () => ({ ok: true }),
  applyPatches: async () => ({ ok: true }),
  applyTextEdits: async () => ({ ok: true }),
  deleteFiles: async () => ({ ok: true }),
  runGovernedCommand: async () => ({ ok: true }),
  runWorkspaceCommand: async () => ({ ok: true }),
  inspectRemediationPlan: async () => ({ ok: true }),
  executeRemediationStep: async () => ({ ok: true }),
  inspectDependencySecurity: async () => ({ ok: true }),
  repairDependencySecurity: async () => ({ ok: true }),
  verify: async () => ({ ok: true, cardBlocking: false }),
};

describe('Workspai assistant mode contract', () => {
  it('keeps mode behavior independent from permission and presentation', () => {
    expect(resolveWorkspaiAssistantModeContract('agent')).toMatchObject({
      executionKind: 'autonomous-repair',
      permissionLevel: 'autopilot',
      canMutateWorkspace: true,
      requiresVerifiedCompletion: true,
    });
    expect(resolveWorkspaiAssistantModeContract('ask')).toMatchObject({
      executionKind: 'evidence-answer',
      permissionLevel: 'default',
      canMutateWorkspace: false,
    });
    expect(resolveWorkspaiAssistantModeContract('plan')).toMatchObject({
      executionKind: 'repair-plan',
      canMutateWorkspace: false,
    });
    expect(resolveWorkspaiAssistantModeContract('goal')).toMatchObject({
      executionKind: 'governed-goal',
      permissionLevel: 'autopilot',
      canMutateWorkspace: true,
      requiresVerifiedCompletion: true,
    });
  });

  it('exposes mutations to Agent and governed Goal while preserving read-only modes', () => {
    const toolsFor = (assistantMode: 'agent' | 'ask' | 'plan' | 'goal') =>
      createStudioAgentWorkspaiToolRegistry({
        host,
        cardId: 'readiness',
        assistantMode,
        ...(assistantMode === 'goal' ? { goalId: 'goal-test-coverage-1234' } : {}),
      })
        .list()
        .map((tool) => tool.name);

    expect(toolsFor('agent')).toContain('apply-workspace-patch');
    expect(toolsFor('agent')).toContain('apply-workspace-edits');
    expect(toolsFor('agent')).toContain('query-workspace-graph');
    expect(toolsFor('agent')).toContain('delete-workspace-files');
    expect(toolsFor('agent')).toContain('run-workspace-command');
    expect(toolsFor('agent')).toContain('run-governed-command');
    expect(toolsFor('agent')).toContain('inspect-remediation-plan');
    expect(toolsFor('agent')).toContain('execute-remediation-step');
    expect(toolsFor('agent')).toContain('inspect-dependency-security');
    expect(toolsFor('agent')).not.toContain('repair-dependency-security');
    expect(toolsFor('agent')).not.toContain('upgrade-dependency-security');
    expect(toolsFor('agent')).not.toContain('complete-dependency-transaction');
    expect(toolsFor('ask')).toEqual([
      'discover-workspace-files',
      'inspect-source',
      'inspect-evidence',
      'search-workspace',
      'query-workspace-graph',
      'inspect-workspace-diagnostics',
      'inspect-workspace-changes',
    ]);
    expect(toolsFor('plan')).not.toContain('apply-workspace-patch');
    expect(toolsFor('plan')).not.toContain('delete-workspace-files');
    expect(toolsFor('plan')).not.toContain('execute-remediation-step');
    expect(toolsFor('plan')).not.toContain('repair-dependency-security');
    expect(toolsFor('plan')).not.toContain('upgrade-dependency-security');
    expect(toolsFor('plan')).not.toContain('run-workspace-command');
    expect(toolsFor('plan')).toContain('verify-blocker');
    expect(toolsFor('goal')).toContain('apply-workspace-patch');
    expect(toolsFor('goal')).toContain('apply-workspace-edits');
    expect(toolsFor('goal')).toContain('query-workspace-graph');
    expect(toolsFor('goal')).toContain('delete-workspace-files');
    expect(toolsFor('goal')).toContain('run-workspace-command');
    expect(toolsFor('goal')).toContain('run-governed-command');
    expect(toolsFor('goal')).toContain('inspect-remediation-plan');
    expect(toolsFor('goal')).toContain('execute-remediation-step');
    expect(toolsFor('goal')).toContain('verify-goal');
    expect(toolsFor('goal')).not.toContain('recover-active-blocker');
    expect(toolsFor('goal')).not.toContain('verify-blocker');
  });
});

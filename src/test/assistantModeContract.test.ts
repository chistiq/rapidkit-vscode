import { describe, expect, it } from 'vitest';

import { resolveWorkspaiAssistantModeContract } from '../core/assistantModeContract.js';
import { createStudioAgentWorkspaiToolRegistry } from '../core/studioAgentWorkspaiTools.js';

const host = {
  discover: async () => ({ ok: true }),
  inspect: async () => ({ ok: true }),
  search: async () => ({ ok: true, output: [] }),
  diagnostics: async () => ({ ok: true }),
  inspectChanges: async () => ({ ok: true }),
  applyPatches: async () => ({ ok: true }),
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
      intent: 'autonomous-repair',
      permissionLevel: 'autopilot',
      canMutateWorkspace: true,
      requiresVerifiedCompletion: true,
    });
    expect(resolveWorkspaiAssistantModeContract('ask')).toMatchObject({
      intent: 'evidence-answer',
      permissionLevel: 'default',
      canMutateWorkspace: false,
    });
    expect(resolveWorkspaiAssistantModeContract('plan')).toMatchObject({
      intent: 'repair-plan',
      canMutateWorkspace: false,
    });
  });

  it('exposes mutating tools only to Agent mode', () => {
    const toolsFor = (assistantMode: 'agent' | 'ask' | 'plan') =>
      createStudioAgentWorkspaiToolRegistry({
        host,
        cardId: 'readiness',
        assistantMode,
      })
        .list()
        .map((tool) => tool.name);

    expect(toolsFor('agent')).toContain('apply-workspace-patch');
    expect(toolsFor('agent')).toContain('delete-workspace-files');
    expect(toolsFor('agent')).toContain('run-workspace-command');
    expect(toolsFor('agent')).toContain('run-governed-command');
    expect(toolsFor('agent')).toContain('inspect-remediation-plan');
    expect(toolsFor('agent')).toContain('execute-remediation-step');
    expect(toolsFor('agent')).toContain('inspect-dependency-security');
    expect(toolsFor('agent')).toContain('repair-dependency-security');
    expect(toolsFor('agent')).toContain('upgrade-dependency-security');
    expect(toolsFor('ask')).toEqual([
      'discover-workspace-files',
      'inspect-source',
      'inspect-evidence',
      'search-workspace',
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
  });
});

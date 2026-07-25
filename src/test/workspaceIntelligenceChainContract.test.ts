import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  ProgressLocation: { Notification: 15 },
  window: {
    withProgress: vi.fn(),
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
  },
}));

import {
  getWorkspaceIntelligenceAgentReadOrder,
  getWorkspaceIntelligenceChainSteps,
  getWorkspaceIntelligenceExecutionMilestones,
  resolveWorkspaceIntelligenceRunMilestone,
  validateWorkspaceIntelligenceChainContract,
} from '../core/workspaceIntelligenceChainContract.js';
import { buildWorkspaceIntelligenceCoreChainCommands } from '../core/workspaceIntelligenceRuntime.js';

describe('workspace intelligence chain contract consumer', () => {
  it('uses the CLI-owned contract as the runtime command source', () => {
    expect(validateWorkspaceIntelligenceChainContract()).toEqual([]);
    const steps = getWorkspaceIntelligenceChainSteps();
    expect(buildWorkspaceIntelligenceCoreChainCommands()).toEqual(
      steps.map((step) => step.command)
    );
    expect(steps.map((step) => step.id)).toEqual([
      'model',
      'diff',
      'impact',
      'doctor-evidence',
      'contract-evidence',
      'analyze-evidence',
      'readiness-evidence',
      'verify',
      'context',
      'agent-sync',
      'explain',
    ]);
  });

  it('exposes the canonical agent artifact read order', () => {
    expect(getWorkspaceIntelligenceAgentReadOrder()).toEqual(
      expect.arrayContaining([
        '.workspai/reports/INDEX.json',
        '.workspai/reports/workspace-context-agent.json',
        '.workspai/reports/workspace-verify-last-run.json',
        '.workspai/reports/workspace-model.json',
      ])
    );
  });

  it('derives the full execution rail from contract stages and preflight placement', () => {
    expect(getWorkspaceIntelligenceExecutionMilestones().map((milestone) => milestone.id)).toEqual([
      'sync',
      'model',
      'baseline',
      'diff',
      'impact',
      'doctor-evidence',
      'contract-evidence',
      'analyze-evidence',
      'readiness-evidence',
      'verify',
      'context',
      'agent-sync',
      'explain',
    ]);
  });

  it('resolves the first blocking milestone from a unified runner report', () => {
    expect(
      resolveWorkspaceIntelligenceRunMilestone({
        preflight: [
          { id: 'sync', status: 'passed' },
          { id: 'baseline', status: 'passed' },
        ],
        stages: [
          { id: 'model', status: 'passed' },
          { id: 'diff', status: 'passed' },
          { id: 'impact', status: 'passed' },
          { id: 'doctor-evidence', status: 'passed' },
          { id: 'contract-evidence', status: 'passed' },
          { id: 'analyze-evidence', status: 'passed' },
          { id: 'readiness-evidence', status: 'blocked' },
          { id: 'verify', status: 'skipped' },
        ],
      })
    ).toBe('readiness-evidence');
  });
});

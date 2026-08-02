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
  getWorkspaceIntelligenceCanonicalStages,
  getWorkspaceIntelligenceChainSteps,
  getWorkspaceIntelligenceExecutionMilestones,
  getWorkspaceIntelligenceExecutionPreflights,
  resolveWorkspaceIntelligenceRunMilestone,
  resolveWorkspaceIntelligenceRunPreflight,
  resolveWorkspaceIntelligenceRunStage,
  resolveWorkspaceIntelligenceStreamProgress,
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

  it('keeps deterministic preflights outside the immutable canonical loop', () => {
    expect(getWorkspaceIntelligenceExecutionPreflights().map((preflight) => preflight.id)).toEqual([
      'sync',
      'baseline',
    ]);
    expect(getWorkspaceIntelligenceCanonicalStages().map((stage) => stage.id)).toEqual([
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

  it('projects a failed preflight onto the canonical stage it prevented', () => {
    const report = {
      preflight: [
        { id: 'sync', status: 'passed' },
        { id: 'baseline', status: 'failed' },
      ],
      stages: [
        { id: 'model', status: 'passed' },
        { id: 'diff', status: 'skipped' },
      ],
    };
    expect(resolveWorkspaceIntelligenceRunMilestone(report)).toBe('baseline');
    expect(resolveWorkspaceIntelligenceRunPreflight(report)).toBe('baseline');
    expect(resolveWorkspaceIntelligenceRunStage(report)).toBe('diff');
  });

  it('accepts only contract-owned milestone progress from the CLI log stream', () => {
    expect(
      resolveWorkspaceIntelligenceStreamProgress({
        message: 'impact started',
        metadata: {
          intelligenceMilestoneId: 'impact',
          intelligenceMilestoneKind: 'stage',
          intelligenceMilestoneStatus: 'started',
        },
      })
    ).toEqual({
      id: 'impact',
      kind: 'stage',
      status: 'started',
      message: 'impact started',
    });
    expect(
      resolveWorkspaceIntelligenceStreamProgress({
        metadata: {
          intelligenceMilestoneId: 'baseline',
          intelligenceMilestoneKind: 'preflight',
          intelligenceMilestoneStatus: 'passed',
        },
      })
    ).toMatchObject({ id: 'baseline', kind: 'preflight', status: 'passed' });
    expect(
      resolveWorkspaceIntelligenceStreamProgress({
        metadata: {
          intelligenceMilestoneId: 'invented-stage',
          intelligenceMilestoneKind: 'stage',
          intelligenceMilestoneStatus: 'started',
        },
      })
    ).toBeUndefined();
  });
});

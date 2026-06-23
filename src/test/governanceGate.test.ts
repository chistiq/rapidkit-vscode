import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  window: {
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showTextDocument: vi.fn(),
  },
  workspace: { openTextDocument: vi.fn() },
  commands: { executeCommand: vi.fn() },
  Uri: { file: (p: string) => ({ fsPath: p }) },
  ProgressLocation: { Notification: 15 },
}));

import { summarizeGovernanceGateResult } from '../core/governanceGate';

describe('summarizeGovernanceGateResult', () => {
  it('marks ready verdict as passed', () => {
    const summary = summarizeGovernanceGateResult({
      summary: { verdict: 'ready', exitCode: 0, stagesPassed: 5, stagesWarn: 0, stagesFailed: 0 },
      blockingReasons: [],
    });
    expect(summary.verdict).toBe('ready');
    expect(summary.passed).toBe(true);
    expect(summary.message).toContain('passed');
    expect(summary.blockers).toEqual([]);
  });

  it('marks blocked verdict as not passed with blockers', () => {
    const summary = summarizeGovernanceGateResult({
      summary: { verdict: 'blocked', exitCode: 3, stagesPassed: 2, stagesWarn: 0, stagesFailed: 1 },
      blockingReasons: ['doctor: 3 errors', 'analyze: critical finding'],
    });
    expect(summary.verdict).toBe('blocked');
    expect(summary.passed).toBe(false);
    expect(summary.stagesFailed).toBe(1);
    expect(summary.blockers).toEqual(['doctor: 3 errors', 'analyze: critical finding']);
    expect(summary.message).toContain('blocked');
  });

  it('handles needs-attention verdict', () => {
    const summary = summarizeGovernanceGateResult({
      summary: {
        verdict: 'needs-attention',
        exitCode: 1,
        stagesPassed: 3,
        stagesWarn: 2,
        stagesFailed: 0,
      },
      blockingReasons: [],
    });
    expect(summary.verdict).toBe('needs-attention');
    expect(summary.passed).toBe(false);
    expect(summary.message).toContain('needs attention');
  });

  it('returns unknown for missing/invalid report', () => {
    expect(summarizeGovernanceGateResult(null).verdict).toBe('unknown');
    expect(summarizeGovernanceGateResult(null).passed).toBe(false);
    expect(summarizeGovernanceGateResult({ summary: { verdict: 'weird' } }).verdict).toBe(
      'unknown'
    );
  });

  it('coerces non-numeric stage counts to zero', () => {
    const summary = summarizeGovernanceGateResult({
      summary: { verdict: 'ready', stagesPassed: 'x', stagesWarn: null },
    });
    expect(summary.stagesPassed).toBe(0);
    expect(summary.stagesWarn).toBe(0);
  });
});

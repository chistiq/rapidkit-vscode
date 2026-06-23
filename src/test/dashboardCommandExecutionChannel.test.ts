import { describe, expect, it } from 'vitest';
import { resolveDashboardCommandExecutionChannel } from '../contracts/dashboardCommandExecutionChannel';

describe('resolveDashboardCommandExecutionChannel', () => {
  it('marks governance and intelligence progress commands as background', () => {
    expect(resolveDashboardCommandExecutionChannel('workspacePipeline')).toBe('background');
    expect(resolveDashboardCommandExecutionChannel('workspaceModel')).toBe('background');
    expect(resolveDashboardCommandExecutionChannel('workspaceIntelligenceChain')).toBe(
      'background'
    );
  });

  it('marks default rapidkit CLI commands as terminal', () => {
    expect(resolveDashboardCommandExecutionChannel('workspaceAnalyze')).toBe('terminal');
    expect(resolveDashboardCommandExecutionChannel('workspaceBootstrap')).toBe('terminal');
    expect(resolveDashboardCommandExecutionChannel('projectDoctor')).toBe('terminal');
    expect(resolveDashboardCommandExecutionChannel('workspaceTerminal')).toBe('terminal');
  });

  it('switches terminal rapidkit to background for evidence direct-run', () => {
    expect(
      resolveDashboardCommandExecutionChannel('workspaceAnalyze', { evidenceDirectRun: true })
    ).toBe('background');
    expect(
      resolveDashboardCommandExecutionChannel('workspaceBootstrap', {
        source: 'evidence',
        evidenceDirectRun: true,
      })
    ).toBe('background');
  });

  it('keeps doctor on terminal even with evidence direct-run payload', () => {
    expect(
      resolveDashboardCommandExecutionChannel('checkWorkspaceHealth', {
        evidenceDirectRun: true,
        preferredAction: 'check',
      })
    ).toBe('terminal');
  });

  it('returns undefined for non-CLI dashboard actions', () => {
    expect(resolveDashboardCommandExecutionChannel('importWorkspace')).toBeUndefined();
    expect(resolveDashboardCommandExecutionChannel('openSetup')).toBeUndefined();
    expect(resolveDashboardCommandExecutionChannel('projectArchitecture')).toBeUndefined();
  });
});

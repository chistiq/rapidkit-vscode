import { describe, expect, it } from 'vitest';

import {
  enrichStudioActionFailureWithHandoff,
  parseStudioActionFailure,
  parseStudioVerifyFailure,
  studioVerifyFailureSummary,
} from '../../webview-ui/src/lib/studioVerifyFailure';

describe('studio verify failure view', () => {
  it('parses failed verify-handoff action results for the blocker chrome', () => {
    const failure = parseStudioVerifyFailure({
      action: 'verify-handoff',
      status: 'failed',
      commandText:
        'npx rapidkit workspace verify --from-impact .rapidkit/reports/workspace-impact-last-run.json --json',
      dashboardCommandId: 'workspaceVerify',
      executionChannel: 'background',
      capabilityGate: 'workspace verify',
      safetyRisk: 'write',
      safetyRefreshCommands: ['npx rapidkit workspace verify --json'],
      rollbackCommand: 'git checkout -- "src/config.ts"',
      exitCode: 2,
      stderrTail: 'workspaceVerify: gate blocked',
      topBlocker: 'release gate failed',
      error: 'Exit 2',
    });

    expect(failure).toEqual({
      title: 'Verify failed',
      action: 'verify-handoff',
      commandText:
        'npx rapidkit workspace verify --from-impact .rapidkit/reports/workspace-impact-last-run.json --json',
      dashboardCommandId: 'workspaceVerify',
      executionChannel: 'background',
      capabilityGate: 'workspace verify',
      safetyRisk: 'write',
      safetyConfirmation: undefined,
      safetyRefreshCommands: ['npx rapidkit workspace verify --json'],
      rollbackCommand: 'git checkout -- "src/config.ts"',
      exitCode: 2,
      stderrTail: 'workspaceVerify: gate blocked',
      summary: undefined,
      topBlocker: 'release gate failed',
      error: 'Exit 2',
      nextAction: undefined,
    });
    expect(failure ? studioVerifyFailureSummary(failure) : null).toBe(
      'workspaceVerify: gate blocked'
    );
  });

  it('ignores non verify-handoff action results', () => {
    expect(parseStudioVerifyFailure({ action: 'auto-fix', status: 'failed' })).toBeNull();
    expect(parseStudioVerifyFailure({ action: 'verify-handoff', status: 'done' })).toBeNull();
  });

  it('parses non-verify Studio action failures so the sidebar can surface them', () => {
    const failure = parseStudioActionFailure({
      action: 'auto-fix',
      status: 'failed',
      summary: 'Patch bridge refused unsafe change',
      error: 'No safe patch available',
    });

    expect(failure).toEqual({
      title: 'Auto-fix failed',
      action: 'auto-fix',
      commandText: undefined,
      dashboardCommandId: undefined,
      executionChannel: undefined,
      capabilityGate: undefined,
      safetyRisk: undefined,
      safetyConfirmation: undefined,
      safetyRefreshCommands: undefined,
      rollbackCommand: undefined,
      exitCode: undefined,
      stderrTail: undefined,
      summary: 'Patch bridge refused unsafe change',
      topBlocker: undefined,
      error: 'No safe patch available',
      nextAction: undefined,
    });
    expect(failure ? studioVerifyFailureSummary(failure) : null).toBe(
      'Patch bridge refused unsafe change'
    );
  });

  it('inherits failure command contract metadata from the active handoff', () => {
    const failure = parseStudioActionFailure({
      action: 'run-remediation-command',
      status: 'failed',
      summary: 'Repair command exited 1.',
    });

    expect(failure).not.toBeNull();
    expect(
      enrichStudioActionFailureWithHandoff(failure!, {
        schemaVersion: 'rapidkit-studio-blocker-handoff-v1',
        cardId: 'workspace-verify',
        cardStatus: 'fail',
        blockers: ['verify blocked'],
        artifactPath: '.rapidkit/reports/workspace-verify-last-run.json',
        sourceCommand: 'npx rapidkit workspace verify --json',
        dashboardCommandId: 'workspaceVerify',
        executionChannel: 'background',
        capabilityGate: 'workspace verify',
        safetyRisk: 'write',
        safetyConfirmation: 'Run Verify',
        safetyRefreshCommands: ['npx rapidkit workspace verify --json'],
        scope: 'workspace',
        blockerSignature: 'abc123456789abcd',
      })
    ).toMatchObject({
      dashboardCommandId: 'workspaceVerify',
      executionChannel: 'background',
      capabilityGate: 'workspace verify',
      safetyRisk: 'write',
      safetyConfirmation: 'Run Verify',
      safetyRefreshCommands: ['npx rapidkit workspace verify --json'],
    });
  });

  it('preserves host-provided title and next action for generic Studio failures', () => {
    const failure = parseStudioActionFailure({
      action: 'run-command',
      status: 'failed',
      title: 'Command run failed',
      commandText: 'rapidkit workspace verify',
      error: 'No workspace is selected',
      nextAction: 'Select a workspace, then rerun the command.',
    });

    expect(failure).toMatchObject({
      title: 'Command run failed',
      action: 'run-command',
      commandText: 'rapidkit workspace verify',
      error: 'No workspace is selected',
      nextAction: 'Select a workspace, then rerun the command.',
    });
  });

  it('preserves gate-blocked auto-fix failures as a visible blocked state', () => {
    const failure = parseStudioActionFailure({
      action: 'auto-fix',
      status: 'failed',
      title: 'Gate still blocked',
      summary: 'Gate command failed: rapidkit autopilot release --mode enforce --json',
      rollbackCommand: 'git checkout -- "src/app.ts"',
      nextAction: 'Inspect gate output, then rerun verify.',
    });

    expect(failure).toMatchObject({
      title: 'Gate still blocked',
      action: 'auto-fix',
      summary: 'Gate command failed: rapidkit autopilot release --mode enforce --json',
      rollbackCommand: 'git checkout -- "src/app.ts"',
      nextAction: 'Inspect gate output, then rerun verify.',
    });
  });

  it('surfaces retry-audit feedback failures as actionable Studio failures', () => {
    const failure = parseStudioActionFailure({
      action: 'retry-audit',
      status: 'failed',
      title: 'Audit retry failed',
      summary: 'Workspace feedback record returned malformed JSON.',
      error: 'Workspace feedback record returned malformed JSON.',
      nextAction: 'Open the audit state, confirm registry and feedback writes, then retry audit.',
    });

    expect(failure).toMatchObject({
      title: 'Audit retry failed',
      action: 'retry-audit',
      summary: 'Workspace feedback record returned malformed JSON.',
      error: 'Workspace feedback record returned malformed JSON.',
      nextAction: 'Open the audit state, confirm registry and feedback writes, then retry audit.',
    });
  });

  it('surfaces ship-loop refresh failures as actionable Studio failures', () => {
    const failure = parseStudioActionFailure({
      action: 'refresh-ship-loop',
      status: 'failed',
      summary: 'Studio could not refresh the ship-loop cards from workspace evidence.',
      error: 'workspace evidence unavailable',
      nextAction:
        'Open the latest evidence artifact, then refresh Studio or rerun the ship-loop step.',
    });

    expect(failure).toMatchObject({
      title: 'Ship-loop refresh failed',
      action: 'refresh-ship-loop',
      summary: 'Studio could not refresh the ship-loop cards from workspace evidence.',
      error: 'workspace evidence unavailable',
      nextAction:
        'Open the latest evidence artifact, then refresh Studio or rerun the ship-loop step.',
    });
  });
});

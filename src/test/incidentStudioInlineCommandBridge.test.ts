import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  window: {
    showWarningMessage: vi.fn(),
  },
}));

import {
  isExpectedDiagnosticFindingExit,
  isMutatingRapidkitCliCommand,
  parseIncidentInlineCommandPayload,
} from '../ui/panels/incidentStudioInlineCommandBridge';

describe('incidentStudioInlineCommandBridge', () => {
  it('treats audit finding exit codes as successful diagnostic observations', () => {
    expect(
      isExpectedDiagnosticFindingExit({
        command: 'npm audit --json',
        exitCode: 1,
        stdout: '{"metadata":{"vulnerabilities":{"high":3}}}',
      })
    ).toBe(true);
    expect(
      isExpectedDiagnosticFindingExit({
        command: 'npm audit fix --force',
        exitCode: 1,
        stderr: 'failed',
      })
    ).toBe(false);
  });

  it('parses inline command payloads with cliActionId', () => {
    expect(
      parseIncidentInlineCommandPayload({
        command: 'npx rapidkit doctor workspace',
        workspacePath: '/tmp/ws',
        cliActionId: 'workspace-doctor',
      })
    ).toEqual({
      command: 'npx rapidkit doctor workspace',
      workspacePath: '/tmp/ws',
      projectPath: undefined,
      cliActionId: 'workspace-doctor',
    });
  });

  it('detects mutating rapidkit CLI commands', () => {
    expect(isMutatingRapidkitCliCommand('npx rapidkit doctor workspace --fix')).toBe(true);
    expect(isMutatingRapidkitCliCommand('npx rapidkit doctor workspace')).toBe(false);
    expect(isMutatingRapidkitCliCommand('npx rapidkit readiness --json')).toBe(false);
  });
});

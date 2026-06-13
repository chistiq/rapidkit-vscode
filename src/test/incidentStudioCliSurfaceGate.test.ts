import { describe, expect, it } from 'vitest';

import {
  canDispatchIncidentCliSurface,
  resolveIncidentCliSurfaceBlockReason,
} from '../../webview-ui/src/lib/incidentStudioCliSurfaceGate';

describe('incidentStudioCliSurfaceGate', () => {
  it('blocks advanced CLI actions in guided mode', () => {
    const reason = resolveIncidentCliSurfaceBlockReason({
      command: 'npx rapidkit workspace sync',
      cliActionId: 'workspace-sync',
      workspacePath: '/tmp/ws',
      hasProjectSelected: false,
      userMode: 'guided',
    });

    expect(reason).toContain('Advanced CLI commands are blocked');
  });

  it('blocks mutating CLI actions when policy gates fail', () => {
    const reason = resolveIncidentCliSurfaceBlockReason({
      command: 'npx rapidkit doctor workspace --fix',
      cliActionId: 'workspace-doctor-fix',
      workspacePath: '/tmp/ws',
      userMode: 'expert',
      telemetry: {
        enterpriseStabilizationGateStatus: {
          expansionFrozen: true,
          freezeReason: 'Expansion frozen for recovery.',
        },
      },
    });

    expect(reason).toContain('Expansion frozen');
  });

  it('allows stable workspace doctor in guided mode', () => {
    expect(
      canDispatchIncidentCliSurface({
        command: 'npx rapidkit doctor workspace',
        cliActionId: 'workspace-doctor',
        workspacePath: '/tmp/ws',
        userMode: 'guided',
      })
    ).toBe(true);
  });
});

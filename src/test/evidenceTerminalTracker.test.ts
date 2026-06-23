import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({}));

import {
  isWorkspaceEvidenceTerminalName,
  resolveWorkspacePathForEvidenceTerminal,
  shouldRefreshEvidenceOnCliLogEvent,
  shouldRequestCliLogEventsForRapidkitTerminal,
  shouldRefreshEvidenceOnTerminalClose,
  shouldTrackRapidkitEvidenceTerminal,
  trackWorkspaceEvidenceTerminal,
  withCliLogEventEnv,
} from '../core/evidenceTerminalTracker';

describe('evidenceTerminalTracker', () => {
  it('tracks exact workspace paths for evidence terminals', () => {
    const terminal = { name: 'Workspai: Workspace Sync — ws-a' } as any;

    trackWorkspaceEvidenceTerminal(terminal, '/workspaces/ws-a');

    expect(shouldRefreshEvidenceOnTerminalClose(terminal)).toBe(true);
    expect(resolveWorkspacePathForEvidenceTerminal(terminal)).toBe('/workspaces/ws-a');
  });

  it('recognizes evidence terminal names without inventing a workspace path', () => {
    const terminal = { name: 'Workspai: Governance Pipeline — ws-a' } as any;

    expect(shouldRefreshEvidenceOnTerminalClose(terminal)).toBe(true);
    expect(resolveWorkspacePathForEvidenceTerminal(terminal)).toBeUndefined();
  });

  it('limits command auto-tracking to workspace evidence producers', () => {
    expect(
      shouldTrackRapidkitEvidenceTerminal({
        name: 'Workspai: Workspace Sync — ws-a',
        cwd: '/workspaces/ws-a',
        commands: [['workspace', 'sync']],
      })
    ).toBe(true);
    expect(
      shouldTrackRapidkitEvidenceTerminal({
        name: 'Workspai: Doctor - ws-a',
        cwd: '/workspaces/ws-a',
        commands: [['doctor', 'workspace']],
      })
    ).toBe(true);
    expect(
      shouldTrackRapidkitEvidenceTerminal({
        name: 'Workspai: Doctor - api',
        cwd: '/workspaces/ws-a/api',
        commands: [['doctor', 'project']],
      })
    ).toBe(false);
    expect(isWorkspaceEvidenceTerminalName('Workspai: Setup — ws-a')).toBe(false);
  });

  it('requests npm cli-log-event JSON only for evidence-producing terminals', () => {
    expect(
      shouldRequestCliLogEventsForRapidkitTerminal({
        name: 'Workspai: Workspace Impact — ws-a',
        cwd: '/workspaces/ws-a',
        commands: [['workspace', 'impact', '--json', '--write']],
      })
    ).toBe(true);
    expect(
      shouldRequestCliLogEventsForRapidkitTerminal({
        name: 'Workspai: Doctor - api',
        cwd: '/workspaces/ws-a/api',
        commands: [['doctor', 'project']],
      })
    ).toBe(false);
    expect(withCliLogEventEnv({ EXISTING: '1' }, true)).toEqual({
      EXISTING: '1',
      RAPIDKIT_LOG_FORMAT: 'json',
    });
  });

  it('uses the npm cli-log-event contract to identify evidence refresh events', () => {
    expect(
      shouldRefreshEvidenceOnCliLogEvent({
        schemaVersion: 'cli-log-event-v1',
        runId: 'run-123456',
        timestamp: '2026-06-22T00:00:00.000Z',
        level: 'info',
        event: 'run.completed',
        component: 'workspace-impact',
        message: 'Workspace impact complete',
        command: ['workspace', 'impact', '--json', '--write'],
      })
    ).toBe(true);
    expect(
      shouldRefreshEvidenceOnCliLogEvent({
        schemaVersion: 'cli-log-event-v1',
        runId: 'run-123456',
        timestamp: '2026-06-22T00:00:00.000Z',
        level: 'info',
        event: 'progress',
        component: 'workspace-impact',
        message: 'Working',
      })
    ).toBe(false);
  });
});

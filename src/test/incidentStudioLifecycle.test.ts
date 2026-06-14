import { describe, expect, it } from 'vitest';

import {
  getConversationIdToCloseOnBootstrap,
  getConversationIdToCloseOnViewExit,
  reconcileIncidentStudioSyncSelection,
} from '../../webview-ui/src/lib/incidentStudioLifecycle';
import {
  buildIncidentWorkspaceGraphFixture,
  INCIDENT_STUDIO_SUPPORTED_KIT_FIXTURES,
} from './fixtures/incidentStudioGraphFixtures';

describe('incidentStudioLifecycle', () => {
  it('closes the previous conversation when incident studio re-bootstrap creates a new one', () => {
    expect(getConversationIdToCloseOnBootstrap('conv-active', 'conv-next')).toBe('conv-active');
  });

  it('does not close anything when bootstrap reuses the same conversation or there is no active one', () => {
    expect(getConversationIdToCloseOnBootstrap('conv-active', 'conv-active')).toBeNull();
    expect(getConversationIdToCloseOnBootstrap(null, 'conv-next')).toBeNull();
  });

  it('closes the active conversation when leaving incident studio and keeps it while staying inside the view', () => {
    expect(getConversationIdToCloseOnViewExit('dashboard', 'conv-active')).toBe('conv-active');
    expect(getConversationIdToCloseOnViewExit('settings', 'conv-active')).toBe('conv-active');
    expect(getConversationIdToCloseOnViewExit('setup', 'conv-active')).toBe('conv-active');
    expect(getConversationIdToCloseOnViewExit('incident-studio', 'conv-active')).toBeNull();
    expect(getConversationIdToCloseOnViewExit('dashboard', null)).toBeNull();
  });

  it('ignores stale workspace sync payloads from a previous workspace', () => {
    expect(
      reconcileIncidentStudioSyncSelection('/tmp/workspace-b', '/tmp/workspace-b/api', {
        workspacePath: '/tmp/workspace-a',
        selectedProjectPath: '/tmp/workspace-a/api',
      })
    ).toEqual({
      shouldApply: false,
      selectionChanged: false,
      projectSelection: null,
    });
  });

  it('reconciles selected project scope from the normalized graph snapshot', () => {
    expect(
      reconcileIncidentStudioSyncSelection('/tmp/workspace-a', null, {
        workspacePath: '/tmp/workspace-a',
        graph: {
          snapshotVersion: 'v1',
          workspace: { path: '/tmp/workspace-a', name: 'workspace-a' },
          project: {
            framework: 'fastapi',
            kit: 'fastapi.standard',
            selectedProject: {
              path: '/tmp/workspace-a/orders-api',
              name: 'orders-api',
              type: 'fastapi',
            },
          },
          topology: { modulesCount: 1, topModules: ['api'] },
          doctor: {
            hasEvidence: false,
            health: { passed: 0, warnings: 0, errors: 0, total: 0, percent: 0 },
          },
          git: { diffStat: 'clean', hasDiffContext: false },
          memory: { conventionsCount: 0, decisionsCount: 0, hasMemory: false },
          telemetry: { totalEvents: 0, lastCommand: null, onboardingFollowupClickThroughRate: 0 },
          evidence: {
            hasDoctorEvidence: false,
            hasGitDiff: false,
            hasWorkspaceMemory: false,
            projectScoped: true,
          },
          completeness: 'fresh',
          lastUpdatedAt: 1,
        },
      })
    ).toEqual({
      shouldApply: true,
      selectionChanged: true,
      projectSelection: {
        path: '/tmp/workspace-a/orders-api',
        name: 'orders-api',
        type: 'fastapi',
      },
    });
  });

  it('marks selection as changed when sync clears previously active project scope', () => {
    expect(
      reconcileIncidentStudioSyncSelection('/tmp/workspace-a', '/tmp/workspace-a/orders-api', {
        workspacePath: '/tmp/workspace-a',
        selectedProjectPath: null,
        graph: null,
      })
    ).toEqual({
      shouldApply: true,
      selectionChanged: true,
      projectSelection: null,
    });
  });

  it('reconciles selected project scope for all supported graph fixtures', () => {
    for (const fixture of INCIDENT_STUDIO_SUPPORTED_KIT_FIXTURES) {
      expect(
        reconcileIncidentStudioSyncSelection(fixture.workspacePath, null, {
          workspacePath: fixture.workspacePath,
          graph: buildIncidentWorkspaceGraphFixture(fixture),
        })
      ).toEqual({
        shouldApply: true,
        selectionChanged: true,
        projectSelection: {
          path: fixture.projectPath,
          name: fixture.projectName,
          type: fixture.projectType,
        },
      });
    }
  });
});

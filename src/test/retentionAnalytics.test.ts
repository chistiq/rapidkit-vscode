import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const { envState, mockGet } = vi.hoisted(() => ({
  envState: { isTelemetryEnabled: true },
  mockGet: vi.fn(),
}));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({ get: mockGet, update: vi.fn() }),
  },
  env: {
    get isTelemetryEnabled() {
      return envState.isTelemetryEnabled;
    },
  },
  ConfigurationTarget: { Global: 1 },
}));

vi.mock('../utils/logger', () => ({
  Logger: { getInstance: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import {
  ANALYTICS_LOCAL_SNAPSHOT_KEY,
  RETENTION_ANALYTICS_ALLOWED_PAYLOAD_KEYS,
  RETENTION_ANALYTICS_PRIVACY_CONTRACT,
  RETENTION_ANALYTICS_REMOTE_ENDPOINT,
  RETENTION_ANALYTICS_REMOTE_TRANSPORT,
  buildRetentionCohortSummary,
  captureRetentionAnalytics,
  sendRetentionAnalyticsPayload,
  validateRetentionAnalyticsPayloadContract,
} from '../core/retentionAnalytics';
import { ANALYTICS_OPT_IN_KEY } from '../core/analyticsConsent';
import type { TtfvRecord } from '../core/ttfvBridge';
import type { DashboardActivityEntry } from '../core/dashboardActivityBridge';
import type { RetentionMilestoneState } from '../core/retentionMilestones';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function createContext() {
  const store = new Map<string, unknown>();
  return {
    store,
    context: {
      globalState: {
        get<T>(key: string, defaultValue?: T): T | undefined {
          return (store.get(key) as T | undefined) ?? defaultValue;
        },
        async update(key: string, value: unknown) {
          store.set(key, value);
        },
      },
    } as unknown as import('vscode').ExtensionContext,
  };
}

const NOW = Date.parse('2026-06-22T00:00:00.000Z');

function ttfv(overrides: Partial<TtfvRecord> = {}): TtfvRecord {
  return {
    resolvedAt: NOW,
    installedAt: NOW - 5 * 24 * 60 * 60 * 1000,
    firstArtifactAt: NOW - 4 * 24 * 60 * 60 * 1000,
    firstArtifactPath: '/secret/workspace/.rapidkit/reports/doctor-last-run.json',
    ttfvMs: 60_000,
    preexisting: false,
    extensionVersion: '1.2.3',
    ...overrides,
  };
}

function activity(): DashboardActivityEntry[] {
  return [
    {
      id: '1',
      command: 'a',
      label: 'A',
      scope: 'workspace',
      status: 'completed',
      timestamp: 1,
      runCount: 3,
    },
    { id: '2', command: 'b', label: 'B', scope: 'workspace', status: 'failed', timestamp: 2 },
    {
      id: '3',
      command: 'c',
      label: 'C',
      scope: 'project',
      status: 'dispatched',
      timestamp: 3,
      runCount: 2,
    },
  ];
}

function milestones(overrides: Partial<RetentionMilestoneState> = {}): RetentionMilestoneState {
  return {
    schemaVersion: 'workspai-retention-milestones-v1',
    firstArtifactGeneratedAt: NOW - 50_000,
    firstBlockerFixedAt: NOW - 40_000,
    verifyPassAfterStudioFixAt: NOW - 30_000,
    returnToDashboardAfterVerifyAt: NOW - 20_000,
    commandFailuresBySurface: { dashboard: 2, studio: 1 },
    totalCommandFailures: 3,
    updatedAt: NOW - 10_000,
    ...overrides,
  };
}

describe('buildRetentionCohortSummary', () => {
  it('aggregates counts/durations into an anonymous summary', () => {
    const summary = buildRetentionCohortSummary({
      now: NOW,
      ttfv: ttfv(),
      registeredWorkspaceCount: 2,
      activity: activity(),
      milestones: milestones(),
    });

    expect(summary.schemaVersion).toBe('retention-cohort.v1');
    expect(summary.daysSinceInstall).toBe(5);
    expect(summary.ttfvMs).toBe(60_000);
    expect(summary.ttfvResolved).toBe(true);
    expect(summary.registeredWorkspaceCount).toBe(2);
    expect(summary.activityEntryCount).toBe(3);
    expect(summary.activityCompletedCount).toBe(1);
    expect(summary.activityFailedCount).toBe(1);
    expect(summary.activityDispatchedCount).toBe(1);
    expect(summary.totalCommandRuns).toBe(6); // 3 + 1 + 2
    expect(summary.firstArtifactGenerated).toBe(true);
    expect(summary.firstBlockerFixed).toBe(true);
    expect(summary.verifyPassAfterStudioFix).toBe(true);
    expect(summary.returnToDashboardAfterVerify).toBe(true);
    expect(summary.totalCommandFailures).toBe(3);
    expect(summary.commandFailuresBySurface.dashboard).toBe(2);
    expect(summary.commandFailuresBySurface.studio).toBe(1);
    expect(summary.activationStage).toBe('returned_after_verify');
    expect(summary.repairLoopStage).toBe('returned_to_dashboard');
    expect(summary.activationCompletionScore).toBe(100);
    expect(summary.commandFailureRate).toBe(0.3333);
    expect(summary.distinctFailureSurfaceCount).toBe(2);
    expect(summary.repeatedFailureFriction).toBe(true);
    expect(summary.nextRecommendedFocus).toBe('reduce_command_failures');
  });

  it('never includes paths, names, or command identifiers', () => {
    const summary = buildRetentionCohortSummary({
      now: NOW,
      ttfv: ttfv(),
      registeredWorkspaceCount: 1,
      activity: activity(),
      milestones: milestones(),
    });
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('doctor-last-run');
    expect(serialized).not.toContain('"a"');
    expect(serialized).not.toContain('workspace');
  });

  it('handles a missing TTFV record', () => {
    const summary = buildRetentionCohortSummary({
      now: NOW,
      ttfv: null,
      registeredWorkspaceCount: 0,
      activity: [],
    });
    expect(summary.ttfvResolved).toBe(false);
    expect(summary.daysSinceInstall).toBeNull();
    expect(summary.ttfvMs).toBeNull();
    expect(summary.activationStage).toBe('not_started');
    expect(summary.repairLoopStage).toBe('not_started');
    expect(summary.activationCompletionScore).toBe(0);
    expect(summary.nextRecommendedFocus).toBe('setup');
  });

  it('identifies the next anonymous funnel focus without leaking commands', () => {
    const summary = buildRetentionCohortSummary({
      now: NOW,
      ttfv: ttfv({ preexisting: true }),
      registeredWorkspaceCount: 1,
      activity: [
        {
          id: '1',
          command: 'secret-command',
          label: 'Secret Command',
          scope: 'workspace',
          status: 'completed',
          timestamp: 1,
        },
      ],
      milestones: milestones({
        firstArtifactGeneratedAt: NOW - 50_000,
        firstBlockerFixedAt: undefined,
        verifyPassAfterStudioFixAt: undefined,
        returnToDashboardAfterVerifyAt: undefined,
        totalCommandFailures: 0,
        commandFailuresBySurface: {},
      }),
    });

    expect(summary.activationStage).toBe('first_artifact');
    expect(summary.repairLoopStage).toBe('not_started');
    expect(summary.activationCompletionScore).toBe(20);
    expect(summary.nextRecommendedFocus).toBe('fix_first_blocker');
    expect(JSON.stringify(summary)).not.toContain('secret-command');
    expect(JSON.stringify(summary)).not.toContain('Secret Command');
  });

  it('pins the RC privacy contract to local-only anonymous aggregates', () => {
    const summary = buildRetentionCohortSummary({
      now: NOW,
      ttfv: ttfv(),
      registeredWorkspaceCount: 1,
      activity: activity(),
      milestones: milestones(),
    });

    expect(RETENTION_ANALYTICS_REMOTE_TRANSPORT).toBe('disabled-for-rc');
    expect(RETENTION_ANALYTICS_REMOTE_ENDPOINT).toBeNull();
    expect(RETENTION_ANALYTICS_PRIVACY_CONTRACT.deniedData).toEqual([
      'paths',
      'workspace names',
      'project names',
      'command arguments',
      'free text',
    ]);
    expect(Object.keys(summary).sort()).toEqual(
      [...RETENTION_ANALYTICS_ALLOWED_PAYLOAD_KEYS].sort()
    );
    expect(validateRetentionAnalyticsPayloadContract(summary)).toEqual({
      ok: true,
      violations: [],
    });
  });

  it('rejects payload fields outside the privacy allowlist', () => {
    const summary = buildRetentionCohortSummary({
      now: NOW,
      ttfv: ttfv(),
      registeredWorkspaceCount: 1,
      activity: activity(),
      milestones: milestones(),
    }) as ReturnType<typeof buildRetentionCohortSummary> & { workspacePath: string };
    summary.workspacePath = '/secret/workspace';

    expect(validateRetentionAnalyticsPayloadContract(summary).ok).toBe(false);
    expect(validateRetentionAnalyticsPayloadContract(summary).violations).toContain(
      'unexpected field: workspacePath'
    );
  });
});

describe('sendRetentionAnalyticsPayload + captureRetentionAnalytics', () => {
  beforeEach(() => {
    mockGet.mockReset();
    envState.isTelemetryEnabled = true;
  });

  it('is a no-op when not opted in', async () => {
    mockGet.mockImplementation((key: string, fallback?: unknown) =>
      key === ANALYTICS_OPT_IN_KEY ? false : fallback
    );
    const { context, store } = createContext();
    const payload = buildRetentionCohortSummary({
      now: NOW,
      ttfv: ttfv(),
      registeredWorkspaceCount: 1,
      activity: [],
    });

    const sent = await sendRetentionAnalyticsPayload(context, payload);
    expect(sent).toBe(false);
    expect(store.has(ANALYTICS_LOCAL_SNAPSHOT_KEY)).toBe(false);
    expect(await captureRetentionAnalytics(context, { now: NOW })).toBeNull();
  });

  it('stays disabled when a legacy installation has opt-in enabled', async () => {
    mockGet.mockImplementation((key: string, fallback?: unknown) =>
      key === ANALYTICS_OPT_IN_KEY ? true : fallback
    );
    const { context, store } = createContext();
    const payload = buildRetentionCohortSummary({
      now: NOW,
      ttfv: ttfv(),
      registeredWorkspaceCount: 1,
      activity: [],
    });

    const sent = await sendRetentionAnalyticsPayload(context, payload);
    expect(sent).toBe(false);
    expect(store.has(ANALYTICS_LOCAL_SNAPSHOT_KEY)).toBe(false);
    expect(await captureRetentionAnalytics(context, { now: NOW })).toBeNull();
  });

  it('does not persist invalid opted-in payloads', async () => {
    mockGet.mockImplementation((key: string, fallback?: unknown) =>
      key === ANALYTICS_OPT_IN_KEY ? true : fallback
    );
    const { context, store } = createContext();
    const payload = buildRetentionCohortSummary({
      now: NOW,
      ttfv: ttfv(),
      registeredWorkspaceCount: 1,
      activity: [],
    }) as ReturnType<typeof buildRetentionCohortSummary> & { projectName: string };
    payload.projectName = 'private-project';

    const sent = await sendRetentionAnalyticsPayload(context, payload);
    expect(sent).toBe(false);
    expect(store.has(ANALYTICS_LOCAL_SNAPSHOT_KEY)).toBe(false);
  });
});

describe('retention milestone wiring', () => {
  it('records local-only milestone signals from artifact, dashboard, and Studio paths', () => {
    const ttfvBridge = read('src/core/ttfvBridge.ts');
    const dashboardHost = read('src/ui/panels/welcomePanelDashboardHostFactories.ts');
    const actionsProvider = read('src/ui/webviews/actionsWebviewProvider.ts');

    expect(ttfvBridge).toContain("recordRetentionMilestone(context, 'first_artifact_generated'");
    expect(dashboardHost).toContain("recordRetentionMilestone(bindings.context, 'command_failure'");
    expect(actionsProvider).toContain("'first_blocker_fixed'");
    expect(actionsProvider).toContain("'verify_pass_after_studio_fix'");
    expect(actionsProvider).toContain("'return_to_dashboard_after_verify'");
    expect(actionsProvider).toContain("surface: 'studio'");
    expect(read('src/ui/panels/welcomePanelIncidentStudioMessages.ts')).toContain(
      "'studio_opened'"
    );
    expect(read('src/ui/panels/welcomePanelCreationNavigationMessages.ts')).toContain(
      "'studio_opened'"
    );
  });
});

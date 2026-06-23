import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  buildRetentionCohortSummary,
  captureRetentionAnalytics,
  sendRetentionAnalyticsPayload,
} from '../core/retentionAnalytics';
import { ANALYTICS_OPT_IN_KEY } from '../core/analyticsConsent';
import type { TtfvRecord } from '../core/ttfvBridge';
import type { DashboardActivityEntry } from '../core/dashboardActivityBridge';

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

describe('buildRetentionCohortSummary', () => {
  it('aggregates counts/durations into an anonymous summary', () => {
    const summary = buildRetentionCohortSummary({
      now: NOW,
      ttfv: ttfv(),
      registeredWorkspaceCount: 2,
      activity: activity(),
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
  });

  it('never includes paths, names, or command identifiers', () => {
    const summary = buildRetentionCohortSummary({
      now: NOW,
      ttfv: ttfv(),
      registeredWorkspaceCount: 1,
      activity: activity(),
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

  it('persists a local snapshot only when opted in', async () => {
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
    expect(sent).toBe(true);
    expect(store.has(ANALYTICS_LOCAL_SNAPSHOT_KEY)).toBe(true);
  });
});

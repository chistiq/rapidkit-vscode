import { describe, expect, it } from 'vitest';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import {
  buildWorkspaceTrend,
  normalizeHistoryEntries,
  readWorkspaceTrend,
  riskToScore,
  verdictToHealth,
  WORKSPACE_HISTORY_SCHEMA_VERSION,
  type DashboardTrendSummary as HostTrendSummary,
  type WorkspaceHistoryEntry,
} from '../core/workspaceTrend';
import { WORKSPACE_HISTORY_PATH } from '../core/workspaceIntelligencePaths';
import type { DashboardTrendSummary as WebviewTrendSummary } from '../../webview-ui/src/lib/dashboardEvidence';

// Compile-time guard: the host trend type (used by the bridge) and the webview
// payload type (used by the chart) must stay structurally identical, since the
// host tsconfig rootDir forbids a shared import. A divergence fails typecheck here.
const _hostToWebview: WebviewTrendSummary = {} as HostTrendSummary;
const _webviewToHost: HostTrendSummary = {} as WebviewTrendSummary;
void _hostToWebview;
void _webviewToHost;

const NOW = Date.parse('2026-06-22T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function entry(
  daysAgo: number,
  overrides: Partial<WorkspaceHistoryEntry> = {}
): WorkspaceHistoryEntry {
  return {
    generatedAt: new Date(NOW - daysAgo * DAY).toISOString(),
    kind: 'verify',
    verdict: 'ready',
    risk: 'low',
    affectedProjects: 1,
    freshness: 'fresh',
    gatePassed: true,
    blockingReasons: 0,
    policyViolations: 0,
    ...overrides,
  };
}

describe('verdictToHealth', () => {
  it('maps verdicts to a 0-100 health score', () => {
    expect(verdictToHealth('ready')).toBe(100);
    expect(verdictToHealth('needs-attention')).toBe(60);
    expect(verdictToHealth('blocked')).toBe(20);
    expect(verdictToHealth('unknown')).toBe(0);
    expect(verdictToHealth(undefined)).toBe(0);
  });
});

describe('riskToScore', () => {
  it('maps impact risk bands to a 0-100 score', () => {
    expect(riskToScore('critical')).toBe(100);
    expect(riskToScore('high')).toBe(75);
    expect(riskToScore('moderate')).toBe(50);
    expect(riskToScore('medium')).toBe(50);
    expect(riskToScore('low')).toBe(25);
    expect(riskToScore('none')).toBe(0);
    expect(riskToScore('???')).toBe(0);
  });
});

describe('normalizeHistoryEntries', () => {
  it('returns entries with a string generatedAt only', () => {
    const result = normalizeHistoryEntries({
      entries: [
        { generatedAt: '2026-06-01T00:00:00.000Z', verdict: 'ready' },
        { verdict: 'blocked' },
        null,
        'nope',
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].verdict).toBe('ready');
  });

  it('handles malformed payloads gracefully', () => {
    expect(normalizeHistoryEntries(null)).toEqual([]);
    expect(normalizeHistoryEntries({ entries: 'x' })).toEqual([]);
    expect(normalizeHistoryEntries({})).toEqual([]);
  });
});

describe('buildWorkspaceTrend', () => {
  it('filters to the rolling window and sorts oldest to newest', () => {
    const trend = buildWorkspaceTrend(
      [entry(40, { verdict: 'blocked' }), entry(2), entry(10, { verdict: 'needs-attention' })],
      { now: NOW, windowDays: 30 }
    );
    expect(trend.points).toHaveLength(2);
    expect(trend.points[0].verdict).toBe('needs-attention');
    expect(trend.points[1].verdict).toBe('ready');
    expect(trend.totalRuns).toBe(2);
  });

  it('computes deltas across the window and gate pass rate', () => {
    const trend = buildWorkspaceTrend(
      [
        entry(20, { verdict: 'blocked', risk: 'high', gatePassed: false }),
        entry(1, { verdict: 'ready', risk: 'none', gatePassed: true }),
      ],
      { now: NOW }
    );
    expect(trend.gateHealthDelta).toBe(80); // 100 - 20
    expect(trend.impactRiskDelta).toBe(-75); // 0 - 75
    expect(trend.gatePassRate).toBe(0.5);
    expect(trend.latest?.verdict).toBe('ready');
  });

  it('returns null deltas for an empty window', () => {
    const trend = buildWorkspaceTrend([entry(90)], { now: NOW, windowDays: 30 });
    expect(trend.points).toHaveLength(0);
    expect(trend.gateHealthDelta).toBeNull();
    expect(trend.latest).toBeNull();
    expect(trend.gatePassRate).toBe(0);
  });
});

describe('readWorkspaceTrend', () => {
  async function makeWorkspace(payload: unknown): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rapidkit-trend-'));
    const file = path.join(dir, WORKSPACE_HISTORY_PATH);
    await fs.ensureDir(path.dirname(file));
    await fs.writeJSON(file, payload);
    return dir;
  }

  it('reads and builds a trend from a valid history file', async () => {
    const dir = await makeWorkspace({
      schemaVersion: WORKSPACE_HISTORY_SCHEMA_VERSION,
      retention: 50,
      entries: [entry(5, { verdict: 'needs-attention' }), entry(1)],
    });
    const trend = await readWorkspaceTrend(dir, { now: NOW });
    expect(trend?.totalRuns).toBe(2);
    expect(trend?.latest?.gateHealth).toBe(100);
    await fs.remove(dir);
  });

  it('returns null when the file is missing', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rapidkit-trend-empty-'));
    expect(await readWorkspaceTrend(dir, { now: NOW })).toBeNull();
    await fs.remove(dir);
  });

  it('returns null for an unrecognized schema version', async () => {
    const dir = await makeWorkspace({ schemaVersion: 'other', entries: [entry(1)] });
    expect(await readWorkspaceTrend(dir, { now: NOW })).toBeNull();
    await fs.remove(dir);
  });

  it('returns null when no workspace path is provided', async () => {
    expect(await readWorkspaceTrend(undefined)).toBeNull();
  });
});

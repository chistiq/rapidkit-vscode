import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import {
  computeTtfvMs,
  ensureInstalledAt,
  formatTtfvLabel,
  getTtfvRecord,
  recordTtfvIfNeeded,
  scanReportArtifacts,
  selectEarliestArtifact,
  TTFV_INSTALLED_AT_KEY,
  TTFV_RECORD_KEY,
} from '../core/ttfvBridge';

vi.mock('../utils/logger', () => ({
  Logger: {
    getInstance: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

function createContext() {
  const store = new Map<string, unknown>();
  return {
    globalState: {
      get<T>(key: string, defaultValue?: T): T | undefined {
        return (store.get(key) as T | undefined) ?? defaultValue;
      },
      async update(key: string, value: unknown) {
        store.set(key, value);
      },
    },
  } as unknown as import('vscode').ExtensionContext;
}

describe('formatTtfvLabel', () => {
  it('formats sub-minute, minute, and hour durations', () => {
    expect(formatTtfvLabel(45_000)).toBe('45s');
    expect(formatTtfvLabel(192_000)).toBe('3m 12s');
    expect(formatTtfvLabel(7_500_000)).toBe('2h 5m');
    expect(formatTtfvLabel(3_600_000)).toBe('1h');
  });
});

describe('computeTtfvMs', () => {
  it('returns non-negative elapsed time', () => {
    expect(computeTtfvMs(1000, 4000)).toBe(3000);
    expect(computeTtfvMs(5000, 2000)).toBe(0);
  });
});

describe('selectEarliestArtifact', () => {
  it('picks the artifact with the smallest timestamp', () => {
    const earliest = selectEarliestArtifact([
      { path: '/a/doctor-last-run.json', timestamp: 2000 },
      { path: '/a/workspace-model.json', timestamp: 1000 },
    ]);
    expect(earliest?.path).toContain('workspace-model');
  });

  it('returns null for an empty list', () => {
    expect(selectEarliestArtifact([])).toBeNull();
  });
});

describe('scanReportArtifacts', () => {
  it('reads generatedAt from report JSON and ignores non-json files', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rapidkit-ttfv-'));
    await fs.writeJSON(path.join(dir, 'doctor-last-run.json'), {
      generatedAt: '2026-06-01T10:00:00.000Z',
    });
    await fs.writeFile(path.join(dir, 'notes.txt'), 'skip');
    const artifacts = await scanReportArtifacts(dir);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].timestamp).toBe(Date.parse('2026-06-01T10:00:00.000Z'));
    await fs.remove(dir);
  });
});

describe('ensureInstalledAt', () => {
  it('writes once and returns the same value on subsequent calls', async () => {
    const context = createContext();
    const first = await ensureInstalledAt(context, 1000);
    const second = await ensureInstalledAt(context, 9999);
    expect(first).toBe(1000);
    expect(second).toBe(1000);
    expect(context.globalState.get(TTFV_INSTALLED_AT_KEY)).toBe(1000);
  });
});

describe('recordTtfvIfNeeded', () => {
  async function makeWorkspace(
    reports: Record<string, Record<string, unknown>>,
    installedAt = Date.parse('2026-06-01T00:00:00.000Z'),
    metadataDirectory: '.workspai' | '.rapidkit' = '.workspai'
  ): Promise<{ context: import('vscode').ExtensionContext; dir: string }> {
    const context = createContext();
    await context.globalState.update(TTFV_INSTALLED_AT_KEY, installedAt);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rapidkit-ttfv-ws-'));
    const reportsDir = path.join(dir, metadataDirectory, 'reports');
    await fs.ensureDir(reportsDir);
    for (const [name, payload] of Object.entries(reports)) {
      await fs.writeJSON(path.join(reportsDir, name), payload);
    }
    return { context, dir };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records TTFV on first artifact and is idempotent', async () => {
    const artifactAt = Date.parse('2026-06-01T00:05:00.000Z');
    const { context, dir } = await makeWorkspace({
      'doctor-last-run.json': { generatedAt: new Date(artifactAt).toISOString() },
    });

    const first = await recordTtfvIfNeeded(context, dir, { extensionVersion: '1.0.0' });
    const second = await recordTtfvIfNeeded(context, dir);

    expect(first?.ttfvMs).toBe(5 * 60 * 1000);
    expect(first?.preexisting).toBe(false);
    expect(second?.ttfvMs).toBe(5 * 60 * 1000);
    expect(getTtfvRecord(context)?.firstArtifactPath).toContain('doctor-last-run.json');
    await fs.remove(dir);
  });

  it('marks preexisting artifacts when they predate install', async () => {
    const installedAt = Date.parse('2026-06-22T00:00:00.000Z');
    const { context, dir } = await makeWorkspace(
      {
        'doctor-last-run.json': { generatedAt: '2026-06-01T00:00:00.000Z' },
      },
      installedAt
    );

    const record = await recordTtfvIfNeeded(context, dir);
    expect(record?.preexisting).toBe(true);
    expect(record?.ttfvMs).toBeNull();
    await fs.remove(dir);
  });

  it('uses canonical reports as the single authority and retains a legacy fallback', async () => {
    const installedAt = Date.parse('2026-06-01T00:00:00.000Z');
    const canonicalAt = Date.parse('2026-06-01T00:03:00.000Z');
    const legacyAt = Date.parse('2026-06-01T00:01:00.000Z');
    const { context, dir } = await makeWorkspace(
      {
        'workspace-model.json': { generatedAt: new Date(canonicalAt).toISOString() },
      },
      installedAt
    );
    await fs.ensureDir(path.join(dir, '.rapidkit', 'reports'));
    await fs.writeJSON(path.join(dir, '.rapidkit', 'reports', 'doctor-last-run.json'), {
      generatedAt: new Date(legacyAt).toISOString(),
    });

    const canonical = await recordTtfvIfNeeded(context, dir);
    expect(canonical?.ttfvMs).toBe(3 * 60 * 1000);
    expect(canonical?.firstArtifactPath).toContain('.workspai');

    const legacyFixture = await makeWorkspace(
      {
        'doctor-last-run.json': { generatedAt: new Date(legacyAt).toISOString() },
      },
      installedAt,
      '.rapidkit'
    );
    const legacy = await recordTtfvIfNeeded(legacyFixture.context, legacyFixture.dir);
    expect(legacy?.ttfvMs).toBe(60 * 1000);
    expect(legacy?.firstArtifactPath).toContain('.rapidkit');
    await fs.remove(dir);
    await fs.remove(legacyFixture.dir);
  });

  it('returns null when no workspace path or no artifacts yet', async () => {
    const context = createContext();
    expect(await recordTtfvIfNeeded(context, null)).toBeNull();

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rapidkit-ttfv-empty-'));
    expect(await recordTtfvIfNeeded(context, dir)).toBeNull();
    await fs.remove(dir);
  });
});

import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  window: { showWarningMessage: vi.fn() },
  commands: { executeCommand: vi.fn() },
  workspace: {
    getConfiguration: vi.fn(() => ({ get: vi.fn((_key: string, fallback: unknown) => fallback) })),
  },
}));

import {
  assessEvidenceFreshness,
  isEvidenceFreshnessBlocking,
  EVIDENCE_AGING_THRESHOLD_MS,
  EVIDENCE_STALE_THRESHOLD_MS,
  type EvidenceFreshnessInputs,
} from '../core/workspaceEvidenceFreshness';
import { planFreshnessGate, type FreshnessGateMode } from '../core/workspaceEvidenceFreshnessGate';

const NOW = Date.parse('2026-06-22T12:00:00.000Z');

function isoAgo(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

function inputs(overrides: Partial<EvidenceFreshnessInputs> = {}): EvidenceFreshnessInputs {
  return {
    now: NOW,
    verifyVerdict: null,
    reports: [
      { id: 'workspace-model', required: true, present: true, generatedAt: isoAgo(60 * 1000) },
      {
        id: 'workspace-context-agent',
        required: true,
        present: true,
        generatedAt: isoAgo(60 * 1000),
      },
      { id: 'workspace-verify', required: false, present: true, generatedAt: isoAgo(60 * 1000) },
    ],
    ...overrides,
  };
}

describe('assessEvidenceFreshness', () => {
  it('reports missing when a required report is absent', () => {
    const result = assessEvidenceFreshness(
      inputs({
        reports: [
          { id: 'workspace-model', required: true, present: false, generatedAt: null },
          {
            id: 'workspace-context-agent',
            required: true,
            present: true,
            generatedAt: isoAgo(1000),
          },
        ],
      })
    );
    expect(result.verdict).toBe('missing');
    expect(result.missingReports).toEqual(['workspace-model']);
  });

  it('treats a stale verify verdict as authoritative even when timestamps are recent', () => {
    const result = assessEvidenceFreshness(inputs({ verifyVerdict: 'stale' }));
    expect(result.verdict).toBe('stale');
    expect(result.verifyVerdict).toBe('stale');
  });

  it('marks fresh evidence under the aging threshold', () => {
    const result = assessEvidenceFreshness(inputs());
    expect(result.verdict).toBe('fresh');
  });

  it('marks aging evidence between the aging and stale thresholds', () => {
    const age = EVIDENCE_AGING_THRESHOLD_MS + 60 * 60 * 1000;
    const result = assessEvidenceFreshness(
      inputs({
        reports: [
          { id: 'workspace-model', required: true, present: true, generatedAt: isoAgo(age) },
          {
            id: 'workspace-context-agent',
            required: true,
            present: true,
            generatedAt: isoAgo(60 * 1000),
          },
        ],
      })
    );
    expect(result.verdict).toBe('aging');
    expect(result.oldestAgeMs).toBe(age);
  });

  it('marks stale evidence beyond the stale threshold', () => {
    const age = EVIDENCE_STALE_THRESHOLD_MS + 60 * 60 * 1000;
    const result = assessEvidenceFreshness(
      inputs({
        reports: [
          { id: 'workspace-model', required: true, present: true, generatedAt: isoAgo(age) },
        ],
      })
    );
    expect(result.verdict).toBe('stale');
  });

  it('returns unknown when present but no timestamps or verdict', () => {
    const result = assessEvidenceFreshness(
      inputs({
        reports: [
          { id: 'workspace-model', required: true, present: true, generatedAt: null },
          {
            id: 'workspace-context-agent',
            required: true,
            present: true,
            generatedAt: null,
          },
        ],
      })
    );
    expect(result.verdict).toBe('unknown');
  });

  it('treats a fresh verify verdict as fresh when timestamps are absent', () => {
    const result = assessEvidenceFreshness(
      inputs({
        verifyVerdict: 'fresh',
        reports: [{ id: 'workspace-model', required: true, present: true, generatedAt: null }],
      })
    );
    expect(result.verdict).toBe('fresh');
  });
});

describe('isEvidenceFreshnessBlocking', () => {
  it('blocks only stale and missing', () => {
    expect(isEvidenceFreshnessBlocking('stale')).toBe(true);
    expect(isEvidenceFreshnessBlocking('missing')).toBe(true);
    expect(isEvidenceFreshnessBlocking('aging')).toBe(false);
    expect(isEvidenceFreshnessBlocking('fresh')).toBe(false);
    expect(isEvidenceFreshnessBlocking('unknown')).toBe(false);
  });
});

describe('planFreshnessGate', () => {
  const blocking = assessEvidenceFreshness(inputs({ verifyVerdict: 'stale' }));
  const ok = assessEvidenceFreshness(inputs());

  it('always proceeds when mode is off', () => {
    expect(planFreshnessGate(blocking, 'off').action).toBe('proceed');
  });

  it('proceeds for non-blocking verdicts regardless of mode', () => {
    const modes: FreshnessGateMode[] = ['auto-refresh', 'warn', 'off'];
    for (const mode of modes) {
      expect(planFreshnessGate(ok, mode).action).toBe('proceed');
    }
  });

  it('auto-refreshes blocking verdicts in auto-refresh mode', () => {
    expect(planFreshnessGate(blocking, 'auto-refresh').action).toBe('auto-refresh');
  });

  it('warns on blocking verdicts in warn mode', () => {
    expect(planFreshnessGate(blocking, 'warn').action).toBe('warn');
  });
});

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  resolveIncidentStudioShipEvidence,
  SHIP_LOOP_EVIDENCE_CARD_IDS,
} from '../ui/panels/incidentStudioShipEvidenceBridge';
import { buildDashboardEvidenceBundle } from '../core/dashboardEvidenceBridge';

describe('incidentStudioShipEvidenceBridge', () => {
  async function createWorkspaceWithShipReports(
    reports: Record<string, Record<string, unknown>>
  ): Promise<string> {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'rapidkit-ship-evidence-'));
    const reportsDir = path.join(workspacePath, '.rapidkit', 'reports');
    await fs.ensureDir(reportsDir);
    for (const [fileName, payload] of Object.entries(reports)) {
      await fs.writeJSON(path.join(reportsDir, fileName), payload);
    }
    await fs.writeFile(path.join(workspacePath, '.rapidkit-workspace'), '{}', 'utf8');
    return workspacePath;
  }

  it('maps ship loop cards from dashboard evidence bundle', async () => {
    const workspacePath = await createWorkspaceWithShipReports({
      'analyze-last-run.json': {
        generatedAt: '2026-06-16T10:00:00.000Z',
        summary: { score: 88, verdict: 'ready', findings: { fail: 0, warn: 1 } },
      },
      'release-readiness-last-run.json': {
        generatedAt: '2026-06-16T10:01:00.000Z',
        overallStatus: 'warn',
        blockingReasons: [],
      },
      'autopilot-release-last-run.json': {
        generatedAt: '2026-06-16T10:02:00.000Z',
        summary: { verdict: 'approved' },
      },
    });
    const archiveManifestPath = path.join(workspacePath, '.workspai', 'archive-manifest.json');
    await fs.ensureDir(path.dirname(archiveManifestPath));
    await fs.writeJSON(archiveManifestPath, {
      generatedAt: '2026-06-16T10:03:00.000Z',
      summary: 'Archive ready',
    });

    const payload = await resolveIncidentStudioShipEvidence({ workspacePath });

    expect(payload.cards.map((card) => card.id)).toEqual(SHIP_LOOP_EVIDENCE_CARD_IDS);
    expect(payload.cards.find((card) => card.id === 'analyze')?.status).toBe('pass');
    expect(payload.cards.find((card) => card.id === 'readiness')?.status).toBe('warn');
    expect(payload.cards.find((card) => card.id === 'autopilot')?.status).toBe('pass');
    expect(payload.cards.find((card) => card.id === 'archive')?.status).toBe('pass');
    expect(payload.cards.find((card) => card.id === 'autopilot')?.artifactPath).toContain(
      'autopilot-release-last-run.json'
    );
  });

  it('does not include workspace run or setup cards in ship evidence payload', async () => {
    const workspacePath = await createWorkspaceWithShipReports({
      'workspace-run-last.json': {
        generatedAt: '2026-06-16T10:00:00.000Z',
        stage: 'test',
        summary: { passed: 1, failed: 0, skipped: 0, selectedCount: 1, exitCode: 0 },
        gates: { blocked: false },
      },
    });
    await fs.writeJSON(path.join(workspacePath, '.rapidkit', 'toolchain.lock'), {
      runtime: { node: { version: '20.12.0' }, python: { version: null } },
    });
    await fs.writeJSON(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      profile: 'polyglot',
    });

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });
    const shipPayload = await resolveIncidentStudioShipEvidence({ workspacePath });

    expect(bundle.cards.some((card) => card.id === 'workspaceRun')).toBe(true);
    expect(bundle.cards.some((card) => card.id === 'setup')).toBe(true);
    expect(shipPayload.cards.some((card) => card.id === 'workspaceRun')).toBe(false);
    expect(shipPayload.cards.some((card) => card.id === 'setup')).toBe(false);
  });
});

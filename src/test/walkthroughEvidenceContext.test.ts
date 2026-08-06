import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  commands: { executeCommand: vi.fn() },
}));

import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import {
  evaluateDoctorGreen,
  resolveWalkthroughEvidenceState,
} from '../core/walkthroughEvidenceContext';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs) {
    await fs.remove(dir);
  }
  tempDirs.length = 0;
});

function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), `walkthrough-evidence-${Date.now()}-${Math.random()}`);
  tempDirs.push(dir);
  return dir;
}

describe('evaluateDoctorGreen', () => {
  it('is ready with scored evidence and zero blocking errors', () => {
    expect(
      evaluateDoctorGreen({ healthScore: { total: 10, passed: 10, warnings: 0, errors: 0 } })
    ).toBe(true);
    expect(
      evaluateDoctorGreen({ healthScore: { total: 10, passed: 9, warnings: 1, errors: 0 } })
    ).toBe(true);
    expect(
      evaluateDoctorGreen({ healthScore: { total: 10, passed: 8, warnings: 0, errors: 2 } })
    ).toBe(false);
  });

  it('is not green when there is no scored evidence', () => {
    expect(
      evaluateDoctorGreen({ healthScore: { total: 0, passed: 0, warnings: 0, errors: 0 } })
    ).toBe(false);
    expect(evaluateDoctorGreen(null)).toBe(false);
    expect(evaluateDoctorGreen({})).toBe(false);
  });
});

describe('resolveWalkthroughEvidenceState', () => {
  it('returns all-false for no workspace', async () => {
    expect(await resolveWalkthroughEvidenceState(null)).toEqual({
      hasWorkspaceModel: false,
      doctorGreen: false,
      agentGroundingSynced: false,
    });
  });

  it('detects model, green doctor, and agent grounding from artifacts', async () => {
    const workspacePath = makeTempDir();
    const reportsDir = path.join(workspacePath, '.rapidkit', 'reports');
    await fs.ensureDir(reportsDir);

    await fs.writeJSON(path.join(reportsDir, 'workspace-model.json'), {
      schemaVersion: 'workspace-model.v1',
    });
    await fs.writeJSON(path.join(reportsDir, 'doctor-last-run.json'), {
      healthScore: { total: 12, passed: 12, warnings: 0, errors: 0 },
    });
    await fs.writeJSON(path.join(reportsDir, 'INDEX.json'), { reports: [] });
    await fs.writeFile(path.join(workspacePath, 'AGENTS.md'), '# AGENTS');

    expect(await resolveWalkthroughEvidenceState(workspacePath)).toEqual({
      hasWorkspaceModel: true,
      doctorGreen: true,
      agentGroundingSynced: true,
    });
  });

  it('prefers agent-customization-pack.json when present', async () => {
    const workspacePath = makeTempDir();
    const reportsDir = path.join(workspacePath, '.rapidkit', 'reports');
    await fs.ensureDir(reportsDir);
    await fs.writeJSON(path.join(reportsDir, 'agent-customization-pack.json'), {
      schemaVersion: 'rapidkit-agent-customization-pack.v1',
      outputInventory: [{ path: 'AGENTS.md', kind: 'grounding', status: 'written' }],
      drift: { missingRequired: [], staleReports: [], strictViolations: [] },
    });

    const state = await resolveWalkthroughEvidenceState(workspacePath);
    expect(state.agentGroundingSynced).toBe(true);
  });

  it('requires both INDEX and AGENTS.md for legacy agent grounding fallback', async () => {
    const workspacePath = makeTempDir();
    const reportsDir = path.join(workspacePath, '.rapidkit', 'reports');
    await fs.ensureDir(reportsDir);
    await fs.writeJSON(path.join(reportsDir, 'INDEX.json'), { reports: [] });
    // No AGENTS.md
    const state = await resolveWalkthroughEvidenceState(workspacePath);
    expect(state.agentGroundingSynced).toBe(false);
    expect(state.hasWorkspaceModel).toBe(false);
  });

  it('completes the Doctor step when only advisory warnings remain', async () => {
    const workspacePath = makeTempDir();
    const reportsDir = path.join(workspacePath, '.rapidkit', 'reports');
    await fs.ensureDir(reportsDir);
    await fs.writeJSON(path.join(reportsDir, 'doctor-last-run.json'), {
      healthScore: { total: 10, passed: 9, warnings: 1, errors: 0 },
    });
    const state = await resolveWalkthroughEvidenceState(workspacePath);
    expect(state.doctorGreen).toBe(true);
  });
});

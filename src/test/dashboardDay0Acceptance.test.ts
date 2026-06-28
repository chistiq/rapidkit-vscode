import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';

import { buildDashboardEvidenceBundle } from '../core/dashboardEvidenceBridge';
import {
  assertDay0DashboardAcceptance,
  DAY0_DASHBOARD_E2E_STEP_IDS,
} from './helpers/day0DashboardAcceptance';
import {
  buildDay0DashboardE2ESteps,
  createWorkspaceViaCli,
  isLocalCliE2EEnabled,
  resolveRapidkitNpmDist,
  runIntelligenceScenario,
} from './helpers/localCliE2E';

const describeLocal = isLocalCliE2EEnabled() ? describe : describe.skip;

describe('day-0 dashboard acceptance (offline)', () => {
  it('documents the day-0 CLI step subset used for scaffold acceptance', () => {
    const stepIds = buildDay0DashboardE2ESteps().map((step) => step.id);
    expect(stepIds).toEqual([...DAY0_DASHBOARD_E2E_STEP_IDS]);
  });
});

describeLocal('day-0 dashboard acceptance on freshly created workspace', () => {
  const tempRoots: string[] = [];

  afterAll(async () => {
    for (const root of tempRoots) {
      await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });

  it('creates a minimal workspace, runs core day-0 commands, and satisfies dashboard UX expectations', async () => {
    const dist = resolveRapidkitNpmDist();
    const sandboxRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-day0-'));
    tempRoots.push(sandboxRoot);

    const homeDir = path.join(sandboxRoot, 'home');
    await fs.ensureDir(homeDir);
    const env = {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir,
    };

    const workspacePath = await createWorkspaceViaCli({
      dist,
      name: 'day0-acceptance-ws',
      profile: 'minimal',
      env,
      cwd: sandboxRoot,
    });

    const scenario = await runIntelligenceScenario({
      dist,
      env,
      name: 'day-0 minimal scaffold',
      profile: 'minimal',
      workspacePath,
      steps: buildDay0DashboardE2ESteps(),
    });

    expect(
      scenario.failedRequiredSteps,
      `day-0 required CLI steps failed: ${scenario.failedRequiredSteps.join(', ')}`
    ).toEqual([]);

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });
    assertDay0DashboardAcceptance(bundle);
  });
});

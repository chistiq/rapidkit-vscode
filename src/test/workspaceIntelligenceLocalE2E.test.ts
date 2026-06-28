import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  analyzeE2EReport,
  buildWorkspaceIntelligenceE2ESteps,
  createPolyglotProjects,
  createWorkspaceViaCli,
  isLocalCliE2EEnabled,
  LOCAL_E2E_ENV_FLAG,
  resolveRapidkitNpmDist,
  runIntelligenceScenario,
  writeE2EReport,
  type E2EReport,
} from './helpers/localCliE2E';
import { DASHBOARD_COMMAND_CONTRACTS } from '../core/dashboardCommandContracts';
import { EVIDENCE_CARD_COMMANDS } from '@/lib/dashboardEvidenceActions';

const CORE_REQUIRED_STEP_IDS = [
  'workspaceSync',
  'foundationEnsure',
  'doctorWorkspace',
  'workspaceModel',
  'intelligenceSnapshot',
  'workspaceDiff',
  'workspaceImpact',
  'workspaceContextAgent',
  'workspaceAgentSync',
  'workspaceExplain',
] as const;

function failedCoreSteps(scenario: E2EReport['scenarios'][number]): string[] {
  return scenario.steps
    .filter(
      (step) =>
        (CORE_REQUIRED_STEP_IDS as readonly string[]).includes(step.id) && step.exitCode !== 0
    )
    .map((step) => step.id);
}

const INTELLIGENCE_CARD_IDS = [
  'workspaceModel',
  'intelligenceSnapshot',
  'workspaceDiff',
  'workspaceImpact',
  'workspaceVerify',
  'workspaceExplain',
  'workspaceWhy',
  'workspaceTrace',
  'workspaceWatch',
  'workspaceContextAgent',
  'agentGrounding',
] as const;

describe('workspace intelligence E2E plan (offline)', () => {
  it('covers every intelligence dashboard card command in the local CLI plan', () => {
    const stepIds = new Set(buildWorkspaceIntelligenceE2ESteps().map((step) => step.id));
    const cardCommandIds = INTELLIGENCE_CARD_IDS.map((cardId) => EVIDENCE_CARD_COMMANDS[cardId]);
    for (const commandId of cardCommandIds) {
      expect(commandId, `missing dashboard mapping for intelligence card`).toBeTruthy();
      const contract =
        DASHBOARD_COMMAND_CONTRACTS[commandId as keyof typeof DASHBOARD_COMMAND_CONTRACTS];
      expect(contract?.cliArgs?.length, `${commandId} has no cliArgs`).toBeGreaterThan(0);
    }

    expect(stepIds.has('workspaceModel')).toBe(true);
    expect(stepIds.has('workspaceExplain')).toBe(true);
    expect(stepIds.has('workspaceWhy')).toBe(true);
    expect(stepIds.has('workspaceTrace')).toBe(true);
    expect(stepIds.has('workspaceWatch')).toBe(true);
  });

  it('documents how to run the local-only CLI E2E', () => {
    expect(LOCAL_E2E_ENV_FLAG).toBe('WORKSPAI_RUN_CLI_E2E');
    expect(isLocalCliE2EEnabled()).toBe(process.env.WORKSPAI_RUN_CLI_E2E === '1');
  });
});

const describeLocal = isLocalCliE2EEnabled() ? describe : describe.skip;

describeLocal('workspace intelligence local CLI E2E', () => {
  const tempRoots: string[] = [];
  let reportPath = '';

  afterAll(async () => {
    if (reportPath) {
      // eslint-disable-next-line no-console
      console.log(`\nE2E report: ${reportPath}`);
      // eslint-disable-next-line no-console
      console.log(`Analysis: ${reportPath.replace(/\.json$/i, '.analysis.md')}\n`);
    }
    for (const root of tempRoots) {
      await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });

  it('runs full workspace intelligence cycle on minimal, polyglot-empty, and polyglot+3-project workspaces', async () => {
    const dist = resolveRapidkitNpmDist();
    const sandboxRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-wi-e2e-'));
    tempRoots.push(sandboxRoot);

    const scenarios: E2EReport['scenarios'] = [];

    async function runEmptyWorkspaceScenario(name: string, profile: 'minimal' | 'polyglot') {
      const homeDir = path.join(sandboxRoot, `${name}-home`);
      await fs.ensureDir(homeDir);
      const env = {
        ...process.env,
        HOME: homeDir,
        USERPROFILE: homeDir,
      };
      const workspacePath = await createWorkspaceViaCli({
        dist,
        name,
        profile,
        env,
        cwd: sandboxRoot,
      });
      const scenario = await runIntelligenceScenario({
        dist,
        env,
        name: `${profile} (no projects)`,
        profile,
        workspacePath,
      });
      scenarios.push(scenario);
      expect(failedCoreSteps(scenario), `${profile} core intelligence steps`).toEqual([]);
    }

    await runEmptyWorkspaceScenario('wi-minimal', 'minimal');
    await runEmptyWorkspaceScenario('wi-polyglot-empty', 'polyglot');

    const polyglotHome = path.join(sandboxRoot, 'wi-polyglot-full-home');
    await fs.ensureDir(polyglotHome);
    const polyglotEnv = {
      ...process.env,
      HOME: polyglotHome,
      USERPROFILE: polyglotHome,
    };
    const polyglotWorkspace = await createWorkspaceViaCli({
      dist,
      name: 'wi-polyglot-full',
      profile: 'polyglot',
      env: polyglotEnv,
      cwd: sandboxRoot,
    });

    const { projectNames, scaffoldMode } = await createPolyglotProjects({
      dist,
      workspacePath: polyglotWorkspace,
      env: polyglotEnv,
    });

    const polyglotScenario = await runIntelligenceScenario({
      dist,
      env: polyglotEnv,
      name: 'polyglot (Next.js + NestJS + FastAPI)',
      profile: 'polyglot',
      workspacePath: polyglotWorkspace,
    });
    polyglotScenario.scaffoldMode = scaffoldMode;
    scenarios.push(polyglotScenario);

    expect(projectNames.sort()).toEqual(['api', 'service', 'web'].sort());
    expect(failedCoreSteps(polyglotScenario), 'polyglot core intelligence steps').toEqual([]);

    const advisoryFailures = polyglotScenario.steps
      .filter((step) => step.exitCode !== 0)
      .map((step) => step.id);
    // eslint-disable-next-line no-console
    console.log(
      `Polyglot advisory failures (recorded for analysis): ${advisoryFailures.join(', ') || 'none'}`
    );

    for (const cardId of INTELLIGENCE_CARD_IDS) {
      const status = polyglotScenario.dashboardCards[cardId];
      expect(status, `${cardId} should be present in dashboard bundle`).toBeTruthy();
    }

    const report: E2EReport = {
      generatedAt: new Date().toISOString(),
      rapidkitDist: dist,
      scenarios,
      analysis: '',
    };
    report.analysis = analyzeE2EReport(report);
    const reportDir = path.join(process.cwd(), 'test-results', 'local-e2e');
    await fs.ensureDir(reportDir);
    reportPath = await writeE2EReport(
      report,
      path.join(reportDir, 'workspace-intelligence-e2e-report.json')
    );

    // eslint-disable-next-line no-console
    console.log('\n' + report.analysis + '\n');
  }, 900_000);
});

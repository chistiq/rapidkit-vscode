import { spawnSync, type SpawnSyncReturns } from 'child_process';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

import {
  WORKSPACE_IMPACT_REPORT_PATH,
  WORKSPACE_INTELLIGENCE_REPORT_PATHS,
  WORKSPACE_MODEL_DIFF_REPORT_PATH,
  WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH,
  WORKSPACE_VERIFY_REPORT_PATH,
} from '../../core/workspaceIntelligencePaths';
import { DASHBOARD_COMMAND_CONTRACTS } from '../../core/dashboardCommandContracts';
import {
  buildWorkspaceAgentContextCliArgs,
  buildWorkspaceAgentSyncCliArgs,
} from '../../core/agentContextPack';
import type { DashboardEvidenceCard } from '../../core/dashboardEvidenceBridge.js';

export const LOCAL_E2E_ENV_FLAG = 'WORKSPAI_RUN_CLI_E2E';

export function isLocalCliE2EEnabled(): boolean {
  return process.env[LOCAL_E2E_ENV_FLAG] === '1';
}

export type E2ECliStep = {
  id: string;
  label: string;
  args: string[] | ((ctx: E2EStepContext, projectName?: string) => string[]);
  /** Dashboard evidence card ids this step should refresh (when applicable). */
  cardIds?: string[];
  /** Step must exit 0 for scenario success. */
  required?: boolean;
  /** Required only when workspace has projects. */
  requiredWhenProjects?: boolean;
  /** Only run when workspace has at least one project. */
  requiresProjects?: boolean;
  /** Run once per project (args may use {projectName}). */
  perProject?: boolean;
  /** Execute from the target project root instead of the workspace root. */
  cwd?: 'workspace' | 'project';
};

export type E2EStepContext = {
  workspacePath: string;
  projectNames: string[];
};

export type E2ECliRunResult = SpawnSyncReturns<string> & { cliOutput: string; durationMs: number };

export type E2EStepResult = {
  id: string;
  label: string;
  cliArgs: string[];
  exitCode: number | null;
  durationMs: number;
  required: boolean;
  artifactsPresent: string[];
  artifactsMissing: string[];
  outputTail: string;
  projectName?: string;
  verification?: {
    verdict: 'ready' | 'needs-attention' | 'blocked';
    blockingReasons: string[];
  };
};

export type E2EScenarioResult = {
  name: string;
  profile: 'minimal' | 'polyglot';
  workspacePath: string;
  projectNames: string[];
  scaffoldMode?: 'cli' | 'observed-fixture';
  steps: E2EStepResult[];
  dashboardCards: Record<string, string>;
  failedRequiredSteps: string[];
};

export type E2EReport = {
  generatedAt: string;
  workspaiDist: string;
  scenarios: E2EScenarioResult[];
  analysis: string;
};

const GOVERNANCE_ARTIFACTS = [
  '.workspai/reports/doctor-last-run.json',
  '.workspai/reports/analyze-last-run.json',
  '.workspai/reports/release-readiness-last-run.json',
  '.workspai/reports/pipeline-last-run.json',
  '.workspai/reports/workspace-contract-verify-last-run.json',
] as const;

/** Commands aligned with dashboard cards + Phase 4 intelligence surface. */
export function buildWorkspaceIntelligenceE2ESteps(): E2ECliStep[] {
  return [
    {
      id: 'workspaceSync',
      label: DASHBOARD_COMMAND_CONTRACTS.workspaceSync.label,
      args: ['workspace', 'sync', '--json'],
      cardIds: ['workspaceSync'],
      required: true,
    },
    {
      id: 'foundationEnsure',
      label: DASHBOARD_COMMAND_CONTRACTS.workspaceFoundationEnsure.label,
      args: ['workspace', 'foundation', 'ensure', '--json'],
      cardIds: ['foundation'],
      required: true,
    },
    {
      id: 'analyze',
      label: DASHBOARD_COMMAND_CONTRACTS.workspaceAnalyze.label,
      args: ['analyze', '--json'],
      cardIds: ['analyze'],
      required: false,
    },
    {
      id: 'contractGraph',
      label: DASHBOARD_COMMAND_CONTRACTS.workspaceContractGraph.label,
      args: ['workspace', 'contract', 'graph', '--json'],
      required: false,
    },
    {
      id: 'workspaceModel',
      label: DASHBOARD_COMMAND_CONTRACTS.workspaceModel.label,
      args: ['workspace', 'model', '--json', '--write'],
      cardIds: ['workspaceModel'],
      required: true,
    },
    {
      id: 'intelligenceSnapshot',
      label: DASHBOARD_COMMAND_CONTRACTS.workspaceIntelligenceSnapshot.label,
      args: ['workspace', 'snapshot', '--json'],
      cardIds: ['intelligenceSnapshot'],
      required: true,
    },
    {
      id: 'workspaceDiff',
      label: DASHBOARD_COMMAND_CONTRACTS.workspaceDiff.label,
      args: () => ['workspace', 'diff', '--from', WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH, '--json'],
      cardIds: ['workspaceDiff'],
      required: true,
    },
    {
      id: 'workspaceImpact',
      label: DASHBOARD_COMMAND_CONTRACTS.workspaceImpact.label,
      args: () => ['workspace', 'impact', '--from', WORKSPACE_MODEL_DIFF_REPORT_PATH, '--json'],
      cardIds: ['workspaceImpact'],
      required: true,
    },
    {
      id: 'doctorWorkspace',
      label: DASHBOARD_COMMAND_CONTRACTS.checkWorkspaceHealth.label,
      args: ['doctor', 'workspace', '--json'],
      cardIds: ['doctor'],
      required: true,
    },
    {
      id: 'contractVerify',
      label: DASHBOARD_COMMAND_CONTRACTS.workspaceContractVerify.label,
      args: ['workspace', 'contract', 'verify', '--strict', '--json'],
      cardIds: ['contract'],
      required: false,
    },
    {
      id: 'readiness',
      label: DASHBOARD_COMMAND_CONTRACTS.workspaceReadiness.label,
      args: ['readiness', '--json'],
      cardIds: ['readiness'],
      required: false,
    },
    {
      id: 'workspaceVerify',
      label: DASHBOARD_COMMAND_CONTRACTS.workspaceVerify.label,
      args: () => ['workspace', 'verify', '--from-impact', WORKSPACE_IMPACT_REPORT_PATH, '--json'],
      cardIds: ['workspaceVerify'],
      required: false,
    },
    {
      id: 'workspaceContextAgent',
      label: DASHBOARD_COMMAND_CONTRACTS.workspaceContextAgent.label,
      args: buildWorkspaceAgentContextCliArgs(),
      cardIds: ['workspaceContextAgent'],
      required: true,
    },
    {
      id: 'workspaceAgentSync',
      label: DASHBOARD_COMMAND_CONTRACTS.workspaceAgentSync.label,
      args: buildWorkspaceAgentSyncCliArgs(),
      cardIds: ['agentGrounding'],
      required: true,
    },
    {
      id: 'workspaceExplain',
      label: DASHBOARD_COMMAND_CONTRACTS.workspaceExplain.label,
      args: ['workspace', 'explain', 'release-blocked', '--json', '--write'],
      cardIds: ['workspaceExplain'],
      required: true,
    },
    {
      id: 'workspaceWhy',
      label: DASHBOARD_COMMAND_CONTRACTS.workspaceWhy.label,
      args: ['workspace', 'why', 'release-blocked', '--json', '--write'],
      required: true,
    },
    {
      id: 'workspaceTrace',
      label: DASHBOARD_COMMAND_CONTRACTS.workspaceTrace.label,
      args: ['workspace', 'trace', '--from', WORKSPACE_MODEL_DIFF_REPORT_PATH, '--json', '--write'],
      requiredWhenProjects: true,
    },
    {
      id: 'workspaceWatch',
      label: DASHBOARD_COMMAND_CONTRACTS.workspaceWatch.label,
      args: ['workspace', 'watch', '--once', '--json'],
      required: false,
    },
    {
      id: 'workspaceGraphEmit',
      label: 'Workspace Graph Emit',
      args: ['workspace', 'graph', 'emit', '--json'],
      required: false,
    },
    {
      id: 'pipeline',
      label: DASHBOARD_COMMAND_CONTRACTS.workspacePipeline.label,
      args: ['pipeline', '--json', '--strict'],
      cardIds: ['pipeline'],
      required: false,
    },
    {
      id: 'policyShow',
      label: DASHBOARD_COMMAND_CONTRACTS.workspacePolicyShow.label,
      args: ['workspace', 'policy', 'show'],
      cardIds: ['policy'],
      required: false,
    },
    {
      id: 'doctorProject',
      label: DASHBOARD_COMMAND_CONTRACTS.projectDoctor.label,
      args: ['doctor', 'project', '--json'],
      cardIds: ['projectDoctor'],
      required: false,
      requiresProjects: true,
      perProject: true,
      cwd: 'project',
    },
    {
      id: 'explainProject',
      label: 'Explain Project',
      args: (_ctx, projectName) => [
        'workspace',
        'explain',
        `project:${projectName}`,
        '--json',
        '--write',
      ],
      required: false,
      requiresProjects: true,
      perProject: true,
    },
    {
      id: 'graphExplainProject',
      label: 'Graph Explain Project',
      args: (_ctx, projectName) => ['workspace', 'graph', 'explain', projectName ?? '', '--json'],
      required: false,
      requiresProjects: true,
      perProject: true,
    },
    {
      id: 'impactScoped',
      label: 'Scoped Impact',
      args: (ctx, projectName) => [
        'workspace',
        'impact',
        '--from',
        WORKSPACE_MODEL_DIFF_REPORT_PATH,
        '--scope',
        `project:${projectName ?? ctx.projectNames[0]}`,
        '--json',
      ],
      required: false,
      requiresProjects: true,
      perProject: true,
    },
    {
      id: 'workspaceRunTest',
      label: DASHBOARD_COMMAND_CONTRACTS.workspaceRunTest.label,
      args: ['workspace', 'run', 'test', '--json', '--continue-on-error'],
      cardIds: ['workspaceRun'],
      required: false,
      requiresProjects: true,
    },
  ];
}

/** Minimal Day-0 repair path: sync → foundation → doctor → bootstrap → model. */
export function buildDay0DashboardE2ESteps(): E2ECliStep[] {
  return [
    {
      id: 'workspaceSync',
      label: DASHBOARD_COMMAND_CONTRACTS.workspaceSync.label,
      args: ['workspace', 'sync', '--json'],
      cardIds: ['workspaceSync'],
      required: true,
    },
    {
      id: 'foundationEnsure',
      label: DASHBOARD_COMMAND_CONTRACTS.workspaceFoundationEnsure.label,
      args: ['workspace', 'foundation', 'ensure', '--json'],
      cardIds: ['foundation'],
      required: true,
    },
    {
      id: 'doctorWorkspace',
      label: DASHBOARD_COMMAND_CONTRACTS.checkWorkspaceHealth.label,
      args: ['doctor', 'workspace', '--json'],
      cardIds: ['doctor'],
      required: true,
    },
    {
      id: 'workspaceBootstrap',
      label: DASHBOARD_COMMAND_CONTRACTS.workspaceBootstrap.label,
      args: ['bootstrap', '--json'],
      cardIds: ['bootstrap'],
      required: true,
    },
    {
      id: 'workspaceModel',
      label: DASHBOARD_COMMAND_CONTRACTS.workspaceModel.label,
      args: ['workspace', 'model', '--json', '--write'],
      cardIds: ['workspaceModel'],
      required: true,
    },
  ];
}

export function intelligenceArtifactPaths(): string[] {
  return [
    ...WORKSPACE_INTELLIGENCE_REPORT_PATHS,
    ...GOVERNANCE_ARTIFACTS,
    '.workspai/reports/workspace-intelligence-history.json',
  ];
}

export function resolveWorkspaiCliDist(): string {
  const npmRoot = path.resolve(__dirname, '..', '..', '..', '..', 'workspai');
  const cliRoot = path.join(npmRoot, 'packages', 'cli');
  const distPath = path.join(cliRoot, 'dist', 'index.js');
  if (!fs.existsSync(distPath)) {
    const build = spawnSync('corepack', ['npm', 'run', 'build'], {
      cwd: npmRoot,
      stdio: 'inherit',
      encoding: 'utf8',
    });
    if (build.status !== 0) {
      throw new Error(`Failed to build Workspai CLI dist at ${cliRoot}`);
    }
  }
  if (!fs.existsSync(distPath)) {
    throw new Error(`Workspai CLI dist missing at ${distPath}`);
  }
  return distPath;
}

export function buildIsolatedCliEnv(homeDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: homeDir, USERPROFILE: homeDir };
  delete env.VITEST;
  delete env.VITEST_POOL_ID;
  delete env.VITEST_WORKER_ID;
  delete env.NODE_ENV;
  delete env.NODE_OPTIONS;
  if (process.platform === 'win32') {
    env.APPDATA = env.APPDATA ?? homeDir;
  }
  return env;
}

export function runWorkspaiCli(
  dist: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv
): E2ECliRunResult {
  const started = Date.now();
  const result = spawnSync(process.execPath, [dist, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...env, CI: '1' },
    maxBuffer: 20 * 1024 * 1024,
  });
  const cliOutput = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  return {
    ...result,
    cliOutput:
      cliOutput ||
      `[empty] status=${String(result.status)} error=${result.error?.message ?? 'none'}`,
    durationMs: Date.now() - started,
  };
}

export async function promoteWorkspaceProfile(input: {
  dist: string;
  workspacePath: string;
  profile: 'minimal' | 'polyglot';
  env: NodeJS.ProcessEnv;
}): Promise<void> {
  const workspaceJsonPath = path.join(input.workspacePath, '.workspai', 'workspace.json');
  const workspaceJson = (await fs.readJson(workspaceJsonPath)) as Record<string, unknown>;
  workspaceJson.profile = input.profile;
  await fs.writeJson(workspaceJsonPath, workspaceJson, { spaces: 2 });

  const sync = runWorkspaiCli(
    input.dist,
    ['workspace', 'sync', '--json'],
    input.workspacePath,
    input.env
  );
  if (sync.status !== 0) {
    throw new Error(
      `workspace sync after profile promotion failed (${sync.status}):\n${sync.cliOutput.slice(-1500)}`
    );
  }
}

export async function createWorkspaceViaCli(input: {
  dist: string;
  name: string;
  profile: 'minimal' | 'polyglot';
  env: NodeJS.ProcessEnv;
  cwd: string;
}): Promise<string> {
  const createProfile = input.profile === 'polyglot' ? 'minimal' : input.profile;
  const create = runWorkspaiCli(
    input.dist,
    ['create', 'workspace', input.name, '--yes', '--profile', createProfile, '--skip-git'],
    input.cwd,
    input.env
  );
  if (create.status !== 0) {
    throw new Error(
      `create workspace ${input.name} failed (${create.status}):\n${create.cliOutput.slice(-2000)}`
    );
  }

  const homeDir = input.env.HOME ?? input.env.USERPROFILE ?? '';
  const workspacePath = path.join(homeDir, '.workspai', 'workspaces', input.name);
  if (!(await fs.pathExists(workspacePath))) {
    throw new Error(`Expected workspace at ${workspacePath} after create`);
  }

  if (input.profile === 'polyglot') {
    await promoteWorkspaceProfile({
      dist: input.dist,
      workspacePath,
      profile: 'polyglot',
      env: input.env,
    });
  }

  return workspacePath;
}

export async function seedPolyglotProjectsObserved(workspacePath: string): Promise<string[]> {
  const projects = [
    {
      name: 'web',
      relativePath: 'apps/web',
      runtime: 'node',
      kit_name: 'frontend.nextjs',
      framework: 'nextjs',
      manifest: {
        path: 'apps/web/package.json',
        content: {
          name: 'web',
          private: true,
          scripts: {
            dev: 'next dev',
            build: 'next build',
            start: 'next start',
            lint: 'next lint',
            test: 'vitest run',
          },
          dependencies: {
            next: '^15.0.0',
            react: '^19.0.0',
            'react-dom': '^19.0.0',
          },
        },
      },
      extraFiles: {
        'apps/web/app/page.tsx': 'export default function Page() { return null; }\n',
      },
    },
    {
      name: 'api',
      relativePath: 'services/api',
      runtime: 'node',
      kit_name: 'nestjs.standard',
      framework: 'nestjs',
      manifest: {
        path: 'services/api/package.json',
        content: {
          name: 'api',
          private: true,
          scripts: {
            dev: 'nest start --watch',
            build: 'nest build',
            start: 'node dist/main',
            test: 'jest',
          },
          dependencies: {
            '@nestjs/common': '^11.0.0',
            '@nestjs/core': '^11.0.0',
          },
        },
      },
      extraFiles: {
        'services/api/src/main.ts': "console.log('api');\n",
      },
    },
    {
      name: 'service',
      relativePath: 'services/service',
      runtime: 'python',
      kit_name: 'fastapi.standard',
      framework: 'fastapi',
      manifest: {
        path: 'services/service/pyproject.toml',
        content: '[project]\nname = "service"\nversion = "0.1.0"\n',
      },
      extraFiles: {
        'services/service/src/main.py': 'from fastapi import FastAPI\napp = FastAPI()\n',
      },
    },
  ] as const;

  for (const project of projects) {
    const projectRoot = path.join(workspacePath, project.relativePath);
    await fs.ensureDir(path.join(projectRoot, '.workspai'));
    await fs.writeJson(
      path.join(projectRoot, '.workspai', 'project.json'),
      {
        name: project.name,
        runtime: project.runtime,
        kit_name: project.kit_name,
        framework: project.framework,
      },
      { spaces: 2 }
    );
    if (project.manifest.path.endsWith('.json')) {
      await fs.writeJson(
        path.join(workspacePath, project.manifest.path),
        project.manifest.content,
        { spaces: 2 }
      );
    } else {
      await fs.writeFile(
        path.join(workspacePath, project.manifest.path),
        String(project.manifest.content),
        'utf8'
      );
    }
    for (const [relativePath, body] of Object.entries(project.extraFiles)) {
      const target = path.join(workspacePath, relativePath);
      await fs.ensureDir(path.dirname(target));
      await fs.writeFile(target, body, 'utf8');
    }
  }

  return projects.map((project) => project.name);
}

export async function createPolyglotProjects(input: {
  dist: string;
  workspacePath: string;
  env: NodeJS.ProcessEnv;
}): Promise<{ projectNames: string[]; scaffoldMode: 'cli' | 'observed-fixture' }> {
  const planned = [
    { kit: 'frontend.nextjs', name: 'web' },
    { kit: 'nestjs.standard', name: 'api', port: '3001' },
    { kit: 'fastapi.standard', name: 'service', port: '8000' },
  ] as const;

  const created: string[] = [];
  for (const project of planned) {
    const create = runWorkspaiCli(
      input.dist,
      [
        'create',
        'project',
        project.kit,
        project.name,
        '--yes',
        '--skip-install',
        ...('port' in project ? ['--port', project.port] : []),
      ],
      input.workspacePath,
      input.env
    );
    if (create.status === 0) {
      created.push(project.name);
      continue;
    }

    const seeded = await seedPolyglotProjectsObserved(input.workspacePath);
    const sync = runWorkspaiCli(
      input.dist,
      ['workspace', 'sync', '--json'],
      input.workspacePath,
      input.env
    );
    if (sync.status !== 0) {
      throw new Error(
        `workspace sync after observed project seed failed (${sync.status}):\n${sync.cliOutput.slice(-1500)}`
      );
    }
    return { projectNames: seeded, scaffoldMode: 'observed-fixture' };
  }

  return { projectNames: created, scaffoldMode: 'cli' };
}

export async function createProjectViaCli(input: {
  dist: string;
  workspacePath: string;
  kit: string;
  name: string;
  env: NodeJS.ProcessEnv;
}): Promise<void> {
  const create = runWorkspaiCli(
    input.dist,
    ['create', 'project', input.kit, input.name, '--yes', '--skip-install'],
    input.workspacePath,
    input.env
  );
  if (create.status !== 0) {
    throw new Error(
      `create project ${input.kit} ${input.name} failed (${create.status}):\n${create.cliOutput.slice(-2000)}`
    );
  }
}

export async function listWorkspaceProjects(workspacePath: string): Promise<string[]> {
  const names = new Set<string>();

  async function walk(dir: string): Promise<void> {
    const projectJsonPath = path.join(dir, '.workspai', 'project.json');
    if (await fs.pathExists(projectJsonPath)) {
      const projectJson = (await fs.readJson(projectJsonPath)) as { name?: string };
      if (typeof projectJson.name === 'string' && projectJson.name.trim()) {
        names.add(projectJson.name.trim());
      }
      return;
    }

    let entries: Array<{ name: string; isDirectory(): boolean }>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.workspai') {
        continue;
      }
      await walk(path.join(dir, entry.name));
    }
  }

  await walk(workspacePath);

  const registryPath = path.join(workspacePath, '.workspai', 'workspace-registry.v1.json');
  if (await fs.pathExists(registryPath)) {
    const registry = (await fs.readJson(registryPath)) as {
      projects?: Array<{ slug?: string; name?: string }>;
    };
    for (const project of registry.projects ?? []) {
      const name = project.slug ?? project.name;
      if (typeof name === 'string' && name.trim()) {
        const normalizedName = name.trim();
        const identity = path.basename(normalizedName);
        const alreadyDiscovered = [...names].some(
          (existing) => path.basename(existing) === identity
        );
        if (!alreadyDiscovered) {
          names.add(normalizedName);
        }
      }
    }
  }

  return [...names].sort();
}

async function resolveProjectRootByName(
  workspacePath: string,
  projectName: string
): Promise<string> {
  const directCandidate = path.resolve(workspacePath, projectName);
  const directRelative = path.relative(path.resolve(workspacePath), directCandidate);
  if (
    directRelative &&
    !directRelative.startsWith('..') &&
    !path.isAbsolute(directRelative) &&
    (await fs.pathExists(path.join(directCandidate, '.workspai', 'project.json')))
  ) {
    return directCandidate;
  }
  const queue = [workspacePath];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    const markerPath = path.join(current, '.workspai', 'project.json');
    if (await fs.pathExists(markerPath)) {
      const marker = (await fs.readJson(markerPath)) as { name?: string };
      if (marker.name === projectName || path.basename(current) === projectName) {
        return current;
      }
      continue;
    }
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        entry.name !== '.workspai' &&
        entry.name !== '.git' &&
        entry.name !== 'node_modules'
      ) {
        queue.push(path.join(current, entry.name));
      }
    }
  }
  throw new Error(`Could not resolve project root for ${projectName} in ${workspacePath}`);
}

function resolveStepArgs(step: E2ECliStep, ctx: E2EStepContext, projectName?: string): string[] {
  if (typeof step.args === 'function') {
    return step.args(ctx, projectName);
  }
  return step.args;
}

function artifactsForStep(step: E2ECliStep): string[] {
  const cardArtifactMap: Record<string, string[]> = {
    workspaceModel: ['.workspai/reports/workspace-model.json'],
    intelligenceSnapshot: ['.workspai/reports/workspace-model-snapshot.json'],
    workspaceDiff: ['.workspai/reports/workspace-model-diff-last-run.json'],
    workspaceImpact: ['.workspai/reports/workspace-impact-last-run.json'],
    workspaceVerify: ['.workspai/reports/workspace-verify-last-run.json'],
    workspaceContextAgent: ['.workspai/reports/workspace-context-agent.json'],
    agentGrounding: [
      '.workspai/reports/agent-customization-pack.json',
      '.workspai/reports/INDEX.json',
    ],
    workspaceExplain: ['.workspai/reports/workspace-explain-last-run.json'],
    workspaceWhy: ['.workspai/reports/workspace-why-last-run.json'],
    workspaceTrace: ['.workspai/reports/workspace-trace-last-run.json'],
    doctor: ['.workspai/reports/doctor-last-run.json'],
    analyze: ['.workspai/reports/analyze-last-run.json'],
    readiness: ['.workspai/reports/release-readiness-last-run.json'],
    pipeline: ['.workspai/reports/pipeline-last-run.json'],
    contract: ['.workspai/reports/workspace-contract-verify-last-run.json'],
  };

  const paths = new Set<string>();
  for (const cardId of step.cardIds ?? []) {
    for (const artifact of cardArtifactMap[cardId] ?? []) {
      paths.add(artifact);
    }
  }
  return [...paths];
}

async function checkArtifacts(
  workspacePath: string,
  relativePaths: string[]
): Promise<{ present: string[]; missing: string[] }> {
  const present: string[] = [];
  const missing: string[] = [];
  for (const relativePath of relativePaths) {
    if (await fs.pathExists(path.join(workspacePath, relativePath))) {
      present.push(relativePath);
    } else {
      missing.push(relativePath);
    }
  }
  return { present, missing };
}

export async function runIntelligenceScenario(input: {
  dist: string;
  env: NodeJS.ProcessEnv;
  name: string;
  profile: 'minimal' | 'polyglot';
  workspacePath: string;
  projectNames?: string[];
  steps?: E2ECliStep[];
}): Promise<E2EScenarioResult> {
  const steps = input.steps ?? buildWorkspaceIntelligenceE2ESteps();
  const projectNames = input.projectNames ?? (await listWorkspaceProjects(input.workspacePath));
  const ctx: E2EStepContext = { workspacePath: input.workspacePath, projectNames };
  const results: E2EStepResult[] = [];

  for (const step of steps) {
    if (step.requiresProjects && projectNames.length === 0) {
      continue;
    }

    const targets =
      step.perProject && projectNames.length > 0
        ? projectNames.map((projectName) => ({ projectName }))
        : [{ projectName: undefined }];

    for (const target of targets) {
      const cliArgs = resolveStepArgs(step, ctx, target.projectName);
      if (step.perProject && !target.projectName) {
        continue;
      }

      const required =
        (step.required ?? false) ||
        ((step.requiredWhenProjects ?? false) && projectNames.length > 0);

      const executionCwd =
        step.cwd === 'project' && target.projectName
          ? await resolveProjectRootByName(input.workspacePath, target.projectName)
          : input.workspacePath;
      const run = runWorkspaiCli(input.dist, cliArgs, executionCwd, input.env);
      const artifactPaths = artifactsForStep(step);
      const { present, missing } = await checkArtifacts(input.workspacePath, artifactPaths);
      let verification: E2EStepResult['verification'];
      if (step.id === 'workspaceVerify') {
        const verifyPath = path.join(input.workspacePath, WORKSPACE_VERIFY_REPORT_PATH);
        const verifyPayload = (await fs.readJson(verifyPath).catch(() => null)) as {
          summary?: { verdict?: unknown };
          blockingReasons?: unknown[];
        } | null;
        const verdict = verifyPayload?.summary?.verdict;
        if (verdict === 'ready' || verdict === 'needs-attention' || verdict === 'blocked') {
          verification = {
            verdict,
            blockingReasons: (verifyPayload?.blockingReasons ?? []).filter(
              (reason): reason is string => typeof reason === 'string'
            ),
          };
        }
      }

      results.push({
        id: step.perProject && target.projectName ? `${step.id}:${target.projectName}` : step.id,
        label: step.label,
        cliArgs,
        exitCode: run.status,
        durationMs: run.durationMs,
        required,
        artifactsPresent: present,
        artifactsMissing: missing,
        outputTail: run.cliOutput.slice(-1200),
        projectName: target.projectName,
        ...(verification ? { verification } : {}),
      });
    }
  }

  const { buildDashboardEvidenceBundle } = await import('../../core/dashboardEvidenceBridge.js');
  const bundle = await buildDashboardEvidenceBundle({ workspacePath: input.workspacePath });
  const dashboardCards = Object.fromEntries(
    bundle.cards.map((card: DashboardEvidenceCard) => [card.id, card.status])
  );

  const failedRequiredSteps = results
    .filter((step) => step.required && step.exitCode !== 0)
    .map((step) => step.id);

  return {
    name: input.name,
    profile: input.profile,
    workspacePath: input.workspacePath,
    projectNames,
    steps: results,
    dashboardCards,
    failedRequiredSteps,
  };
}

export function analyzeE2EReport(report: E2EReport): string {
  const lines: string[] = [
    '# Workspace Intelligence Local E2E — Analysis',
    '',
    `Generated: ${report.generatedAt}`,
    `CLI: ${report.workspaiDist}`,
    '',
  ];

  for (const scenario of report.scenarios) {
    lines.push(
      `## ${scenario.name} (${scenario.profile}, ${scenario.projectNames.length} projects)`
    );
    lines.push(`Path: ${scenario.workspacePath}`);
    if (scenario.scaffoldMode) {
      lines.push(`Project scaffold: ${scenario.scaffoldMode}`);
    }
    lines.push('');

    const required = scenario.steps.filter((step) => step.required);
    const optional = scenario.steps.filter((step) => !step.required);
    const requiredPass = required.filter((step) => step.exitCode === 0).length;
    lines.push(
      `- Required steps: ${requiredPass}/${required.length} passed` +
        (scenario.failedRequiredSteps.length
          ? ` — FAILED: ${scenario.failedRequiredSteps.join(', ')}`
          : '')
    );
    const advisoryFailures = scenario.steps
      .filter((step) => !step.required && step.exitCode !== 0)
      .map((step) => step.id);
    const coreFailures = scenario.steps
      .filter(
        (step) =>
          step.exitCode !== 0 &&
          [
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
          ].includes(step.id)
      )
      .map((step) => step.id);
    if (coreFailures.length > 0) {
      lines.push(`- Core chain failures: ${coreFailures.join(', ')}`);
    }
    if (advisoryFailures.length > 0) {
      lines.push(`- Advisory (non-blocking) failures: ${advisoryFailures.join(', ')}`);
    }
    lines.push(
      `- Optional steps: ${optional.filter((step) => step.exitCode === 0).length}/${optional.length} passed`
    );

    const intelligenceCards = [
      'workspaceModel',
      'intelligenceSnapshot',
      'workspaceDiff',
      'workspaceImpact',
      'workspaceVerify',
      'workspaceExplain',
      'workspaceContextAgent',
      'agentGrounding',
    ] as const;
    lines.push('- Intelligence dashboard cards:');
    for (const cardId of intelligenceCards) {
      const status = scenario.dashboardCards[cardId] ?? 'missing';
      lines.push(`  - ${cardId}: ${status}`);
    }

    const missingArtifacts = new Set<string>();
    for (const step of scenario.steps) {
      for (const artifact of step.artifactsMissing) {
        missingArtifacts.add(artifact);
      }
    }
    if (missingArtifacts.size > 0) {
      lines.push(`- Artifacts still missing after steps: ${[...missingArtifacts].join(', ')}`);
    }

    const slowSteps = [...scenario.steps]
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 5)
      .map((step) => `${step.id} (${step.durationMs}ms)`);
    lines.push(`- Slowest steps: ${slowSteps.join(', ')}`);
    lines.push('');
  }

  lines.push('## Cross-scenario notes');
  const emptyVsProjects = report.scenarios.filter((scenario) => scenario.projectNames.length === 0);
  const withProjects = report.scenarios.filter((scenario) => scenario.projectNames.length > 0);
  if (emptyVsProjects.length > 0 && withProjects.length > 0) {
    const emptyVerify = emptyVsProjects[0]?.dashboardCards.workspaceVerify ?? 'missing';
    const projectVerify = withProjects[0]?.dashboardCards.workspaceVerify ?? 'missing';
    lines.push(
      `- Verify posture: empty workspace → ${emptyVerify}; polyglot+projects → ${projectVerify}`
    );
  }
  lines.push(
    '- Polyglot workspaces scaffold as minimal then promote profile via `workspace sync` (avoids blocking Python venv install in local E2E).'
  );
  lines.push(
    '- MCP serve is intentionally excluded (stdio daemon; validate manually with `workspace mcp serve`).'
  );
  lines.push(
    '- Intelligence chain order mirrors extension `buildWorkspaceIntelligenceChainCommands()` plus Phase 4 why/trace/watch/graph.'
  );

  return lines.join('\n');
}

export async function writeE2EReport(report: E2EReport, outputPath?: string): Promise<string> {
  const target =
    outputPath ?? path.join(os.tmpdir(), `workspai-intelligence-e2e-${Date.now()}.json`);
  await fs.writeJson(target, report, { spaces: 2 });
  const analysisPath = target.replace(/\.json$/i, '.analysis.md');
  await fs.writeFile(analysisPath, report.analysis, 'utf8');
  return target;
}

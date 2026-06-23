import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

type RuntimeSurfaceContract = {
  schemaVersion: string;
  lifecycleCommands: string[];
  moduleMutationCommands: string[];
  globalCommands: string[];
  universalCommands: string[];
  coreProjectCommands: string[];
  workspaceSubcommands: string[];
  workspaceIntelligenceSubcommands: string[];
  moduleSuggestionFrameworks: string[];
  moduleUnsupportedFrameworks: string[];
  scaffoldKits: string[];
  createPlanner: {
    nativeCreateKits: string[];
    externalCreateAdopt: string[];
    adoptOnlyRuntimes: string[];
  };
  runtimeMatrix: Record<
    string,
    {
      tier: string;
      scaffold: boolean;
      import: boolean;
      moduleCommands: boolean;
      doctor: string;
      lifecycleCommands: string[];
    }
  >;
};

const repoRoot = path.resolve(__dirname, '../..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function resolveContractPath(): string {
  const explicitPath = process.env.RAPIDKIT_RUNTIME_COMMAND_SURFACE_CONTRACT;
  if (explicitPath?.trim()) {
    return path.resolve(explicitPath.trim());
  }

  const candidates = [
    path.resolve(process.cwd(), '..', 'contracts', 'runtime-command-surface.v1.json'),
    path.resolve(process.cwd(), 'contracts', 'runtime-command-surface.v1.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

function readContract(): RuntimeSurfaceContract {
  const contractPath = resolveContractPath();
  if (!fs.existsSync(contractPath)) {
    throw new Error(`Runtime command surface contract not found: ${contractPath}`);
  }
  return JSON.parse(fs.readFileSync(contractPath, 'utf8')) as RuntimeSurfaceContract;
}

describe('shared runtime command surface contract (extension)', () => {
  it('pins scaffold kit choices exposed by the extension', () => {
    const contract = readContract();
    const packageJson = JSON.parse(read('package.json')) as {
      contributes?: { configuration?: { properties?: Record<string, { enum?: string[] }> } };
    };
    const defaultKitEnum =
      packageJson.contributes?.configuration?.properties?.['workspai.defaultKit']?.enum ?? [];
    const kitsService = read('src/core/kitsService.ts');
    const rapidkitCli = read('src/core/rapidkitCLI.ts');
    const scaffoldKits = read('src/core/scaffoldKits.ts');

    expect(contract.schemaVersion).toBe('rapidkit-runtime-command-surface-v1');
    expect(defaultKitEnum).toEqual(contract.scaffoldKits);
    for (const kit of contract.scaffoldKits) {
      expect(scaffoldKits, kit).toContain(kit);
    }
    expect(rapidkitCli).toContain('SCAFFOLD_KIT_IDS');
    expect(rapidkitCli).toContain('./scaffoldKits');
    expect(kitsService).toContain("from './scaffoldKits'");
    expect(kitsService).toContain('FRONTEND_SCAFFOLD_KITS');
    expect([...contract.createPlanner.nativeCreateKits].sort()).toEqual(
      [...contract.scaffoldKits].sort()
    );
    expect(contract.createPlanner.externalCreateAdopt).toContain('wordpress-site');
    expect(contract.createPlanner.externalCreateAdopt).toContain('laravel');
    expect(contract.createPlanner.adoptOnlyRuntimes).toContain('php');
  });

  it('keeps extension and rapidkit-npm runtime surfaces aligned', () => {
    const extensionContractPath = path.join(
      repoRoot,
      'contracts',
      'runtime-command-surface.v1.json'
    );
    const npmContractPath = path.resolve(
      repoRoot,
      '..',
      'rapidkit-npm',
      'contracts',
      'runtime-command-surface.v1.json'
    );

    if (!fs.existsSync(npmContractPath)) {
      return;
    }

    const extensionContract = JSON.parse(fs.readFileSync(extensionContractPath, 'utf8'));
    const npmContract = JSON.parse(fs.readFileSync(npmContractPath, 'utf8'));
    expect(extensionContract).toEqual(npmContract);
  });

  it('publishes the workspace intelligence capability surface for IDE detection (no regex --help)', () => {
    const contract = readContract();

    // These fields let the extension detect workspace intelligence capabilities
    // from the contract / `rapidkit commands --json` instead of regex-parsing
    // `rapidkit --help` (roadmap items 0.1 / 2.1).
    expect(Array.isArray(contract.workspaceSubcommands)).toBe(true);
    expect(Array.isArray(contract.workspaceIntelligenceSubcommands)).toBe(true);

    for (const subcommand of [
      'model',
      'snapshot',
      'diff',
      'impact',
      'verify',
      'context',
      'agent-sync',
    ]) {
      expect(contract.workspaceIntelligenceSubcommands, subcommand).toContain(subcommand);
    }

    // Intelligence subcommands must be a strict subset of the full surface.
    for (const subcommand of contract.workspaceIntelligenceSubcommands) {
      expect(contract.workspaceSubcommands, subcommand).toContain(subcommand);
    }
  });

  it('keeps AI module suggestions available only for module-capable frameworks', () => {
    const contract = readContract();
    const createProjectModal = read('webview-ui/src/components/CreateProjectModal.tsx');
    const aiCreateModal = read('webview-ui/src/components/AICreateModal.tsx');
    const welcomePanelAiModal = read('src/ui/panels/welcomePanelAiModalMessages.ts');
    const aiService = read('src/core/aiService.ts');
    const moduleSupport = read('webview-ui/src/lib/moduleSupport.ts');

    expect(contract.moduleSuggestionFrameworks).toEqual(['fastapi', 'nestjs']);
    expect(createProjectModal).toContain("framework === 'fastapi' || framework === 'nestjs'");
    expect(welcomePanelAiModal).toContain(
      'AI module suggestions are available only for FastAPI and NestJS projects.'
    );

    for (const framework of contract.moduleUnsupportedFrameworks) {
      if (
        [
          'nextjs',
          'remix',
          'vite-react',
          'vite-vue',
          'vite-svelte',
          'vite-solid',
          'vite-vanilla',
          'nuxt',
          'angular',
          'astro',
          'sveltekit',
        ].includes(framework)
      ) {
        expect(moduleSupport, framework).toContain(`'${framework}'`);
        continue;
      }
      expect(aiService, framework).toContain(`framework === '${framework}'`);
    }

    expect(moduleSupport).toContain('MODULE_UNSUPPORTED_FRONTEND_PROJECT_TYPES');
    expect(moduleSupport).toContain("from '../../../contracts/module-support.v1.json'");

    expect(aiCreateModal).toContain('Go projects do not use the RapidKit module system.');
    expect(aiCreateModal).toContain('.NET projects do not use the RapidKit module system.');
    expect(aiCreateModal).toContain('Spring Boot projects do not use the RapidKit module system.');
  });

  it('pins lifecycle commands behind npm capability gating in project commands', () => {
    const contract = readContract();
    const projectLifecycle = read('src/commands/projectLifecycle.ts');
    const capabilities = read('src/core/projectCommandCapabilities.ts');
    const lifecycleGate = read('src/core/projectLifecycleGate.ts');
    const packageJson = JSON.parse(read('package.json')) as {
      contributes?: { commands?: Array<{ command: string }> };
    };
    const contributedCommands =
      packageJson.contributes?.commands?.map((entry) => entry.command) ?? [];

    const gatedLifecycleCommands = [
      'init',
      'dev',
      'test',
      'build',
      'start',
      'lint',
      'format',
    ] as const;

    expect(contract.lifecycleCommands).toEqual(
      expect.arrayContaining([...gatedLifecycleCommands, 'help'])
    );

    for (const command of gatedLifecycleCommands) {
      expect(projectLifecycle).toContain(
        `gateProjectLifecycleCommand(projectPath, '${command}', projectName)`
      );
    }

    expect(capabilities).toContain("'project', 'commands', '--json'");
    expect(lifecycleGate).toContain('fetchProjectCommandCapabilities');
    expect(lifecycleGate).toContain('gateModuleMutationCommand');

    for (const vscodeCommand of [
      'workspai.projectInit',
      'workspai.projectDev',
      'workspai.projectTest',
      'workspai.projectBuild',
      'workspai.projectStart',
      'workspai.projectLint',
      'workspai.projectFormat',
    ]) {
      expect(contributedCommands, vscodeCommand).toContain(vscodeCommand);
    }
  });

  it('keeps fleet workspace run stages separate from local-only dev', () => {
    const contract = readContract();
    const workspaceOps = read('src/commands/workspaceOperations.ts');
    const capabilities = read('src/core/projectCommandCapabilities.ts');

    const fleetStages = ['init', 'test', 'build', 'start'];

    for (const runtime of ['python', 'node', 'go', 'java', 'dotnet']) {
      const matrix = contract.runtimeMatrix[runtime];
      expect(matrix.lifecycleCommands, runtime).toEqual(expect.arrayContaining(fleetStages));
      expect(matrix.lifecycleCommands, runtime).toContain('dev');
    }

    for (const stage of fleetStages) {
      expect(workspaceOps).toContain(`value: '${stage}'`);
      expect(workspaceOps).toContain(`['workspace', 'run', stage`);
    }

    expect(workspaceOps).toContain("type WorkspaceRunStage = 'init' | 'test' | 'build' | 'start'");
    expect(workspaceOps).not.toContain("['workspace', 'run', 'dev']");
    expect(capabilities).toContain('fleetStages');
    expect(capabilities).toContain('fleetEligible');
  });

  it('keeps import and adopt flows on canonical npm contracts without extension fallbacks', () => {
    const importProject = read('src/commands/importProject.ts');
    const adoptProject = read('src/commands/adoptProject.ts');
    const canonicalLifecycle = read('src/core/canonicalProjectLifecycle.ts');

    expect(importProject).toContain('runCanonicalNpmImport');
    expect(importProject).toContain('describeCanonicalCliFailure');
    expect(importProject).toContain('ensureWorkspaceSkeletonViaNpm');
    expect(importProject).not.toContain('fs.copy');
    expect(importProject).not.toContain('extension-fallback');

    expect(adoptProject).toContain('runCanonicalNpmAdopt');
    expect(adoptProject).not.toContain('writeLocalAdoptionFallback');
    expect(adoptProject).not.toContain('extension-fallback');

    expect(canonicalLifecycle).toContain('isCanonicalCliFailure');
    expect(canonicalLifecycle).toContain('describeCanonicalCliFailure');

    expect(read('src/core/projectCapabilityBridge.ts')).toContain(
      'resolveProjectCapabilitiesPayload'
    );
    expect(read('webview-ui/src/lib/projectCapabilities.ts')).toContain(
      'DASHBOARD_LIFECYCLE_COMMAND_MAP'
    );
    expect(read('webview-ui/src/components/ProjectActions.tsx')).toContain(
      'isDashboardLifecycleCommandSupported'
    );
  });

  it('keeps observed runtimes lifecycle-limited to help in the contract matrix', () => {
    const contract = readContract();
    const observedRuntimes = ['php', 'ruby', 'rust', 'unknown'];

    for (const runtime of observedRuntimes) {
      expect(contract.runtimeMatrix[runtime].lifecycleCommands).toEqual(['help']);
      expect(contract.runtimeMatrix[runtime].moduleCommands).toBe(false);
    }
  });
});

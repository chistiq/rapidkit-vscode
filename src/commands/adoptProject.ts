import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { getExtensionVersion } from '../utils/constants';
import { WorkspaceUsageTracker } from '../utils/workspaceUsageTracker';
import { run } from '../utils/exec';
import { buildNpxRapidkitArgs } from '../utils/platformCapabilities';
import {
  upsertImportedProjectsRegistry,
  type ImportedProjectRegistryEntry,
  type ImportedProjectStack,
} from '../utils/importedProjectsRegistry';

type AdoptableProjectType =
  | ImportedProjectStack
  | 'gofiber'
  | 'gogin'
  | 'laravel'
  | 'symfony'
  | 'python'
  | 'node'
  | 'java';

type AdoptableRuntime = 'python' | 'node' | 'go' | 'java' | 'php' | 'ruby' | 'dotnet' | 'unknown';

interface AdoptDetection {
  key: AdoptableProjectType;
  importStack: ImportedProjectStack;
  runtime: AdoptableRuntime;
  displayName: string;
  supportTier: 'core' | 'extended' | 'observed' | 'unknown';
  moduleSupport: boolean;
  confidence: 'high' | 'medium' | 'low';
  kind: 'backend' | 'frontend' | 'fullstack' | 'package' | 'unknown';
}

interface RapidkitAdoptJsonResult {
  workspacePath?: string;
  workspaceResolution?: string;
  defaultWorkspaceCreated?: boolean;
  dryRun?: boolean;
  adoptedProject?: {
    name?: string;
    path?: string;
    relativePath?: string;
    relationship?: 'imported' | 'adopted';
    stack?: ImportedProjectStack;
    runtime?: string;
    framework?: string;
    frameworkDisplayName?: string;
    supportTier?: string;
    moduleSupport?: boolean;
    confidence?: 'high' | 'medium' | 'low';
    projectJsonPath?: string;
    adoptJsonPath?: string;
    adoptReadinessPath?: string;
    wroteFiles?: boolean;
  };
}

interface AdoptProjectInput {
  projectPath: string;
  projectName?: string;
  projectType?: string;
  workspacePath?: string;
}

const PROJECT_TYPE_ALIASES: Record<string, AdoptDetection> = {
  fastapi: {
    key: 'fastapi',
    importStack: 'fastapi',
    runtime: 'python',
    displayName: 'FastAPI',
    supportTier: 'core',
    moduleSupport: true,
    confidence: 'high',
    kind: 'backend',
  },
  django: {
    key: 'django',
    importStack: 'django',
    runtime: 'python',
    displayName: 'Django',
    supportTier: 'observed',
    moduleSupport: false,
    confidence: 'high',
    kind: 'backend',
  },
  flask: {
    key: 'flask',
    importStack: 'flask',
    runtime: 'python',
    displayName: 'Flask',
    supportTier: 'observed',
    moduleSupport: false,
    confidence: 'high',
    kind: 'backend',
  },
  nestjs: {
    key: 'nestjs',
    importStack: 'nestjs',
    runtime: 'node',
    displayName: 'NestJS',
    supportTier: 'core',
    moduleSupport: true,
    confidence: 'high',
    kind: 'backend',
  },
  nextjs: {
    key: 'nextjs',
    importStack: 'nextjs',
    runtime: 'node',
    displayName: 'Next.js',
    supportTier: 'extended',
    moduleSupport: false,
    confidence: 'high',
    kind: 'frontend',
  },
  remix: {
    key: 'remix',
    importStack: 'remix',
    runtime: 'node',
    displayName: 'Remix',
    supportTier: 'observed',
    moduleSupport: false,
    confidence: 'high',
    kind: 'frontend',
  },
  nuxt: {
    key: 'nuxt',
    importStack: 'nuxt',
    runtime: 'node',
    displayName: 'Nuxt',
    supportTier: 'observed',
    moduleSupport: false,
    confidence: 'high',
    kind: 'frontend',
  },
  react: {
    key: 'react',
    importStack: 'react',
    runtime: 'node',
    displayName: 'React',
    supportTier: 'observed',
    moduleSupport: false,
    confidence: 'medium',
    kind: 'frontend',
  },
  vite: {
    key: 'vite',
    importStack: 'vite',
    runtime: 'node',
    displayName: 'Vite',
    supportTier: 'observed',
    moduleSupport: false,
    confidence: 'medium',
    kind: 'frontend',
  },
  vue: {
    key: 'vue',
    importStack: 'vue',
    runtime: 'node',
    displayName: 'Vue',
    supportTier: 'observed',
    moduleSupport: false,
    confidence: 'medium',
    kind: 'frontend',
  },
  sveltekit: {
    key: 'sveltekit',
    importStack: 'sveltekit',
    runtime: 'node',
    displayName: 'SvelteKit',
    supportTier: 'observed',
    moduleSupport: false,
    confidence: 'high',
    kind: 'frontend',
  },
  svelte: {
    key: 'svelte',
    importStack: 'svelte',
    runtime: 'node',
    displayName: 'Svelte',
    supportTier: 'observed',
    moduleSupport: false,
    confidence: 'medium',
    kind: 'frontend',
  },
  angular: {
    key: 'angular',
    importStack: 'angular',
    runtime: 'node',
    displayName: 'Angular',
    supportTier: 'observed',
    moduleSupport: false,
    confidence: 'high',
    kind: 'frontend',
  },
  astro: {
    key: 'astro',
    importStack: 'astro',
    runtime: 'node',
    displayName: 'Astro',
    supportTier: 'observed',
    moduleSupport: false,
    confidence: 'high',
    kind: 'frontend',
  },
  solid: {
    key: 'solid',
    importStack: 'solid',
    runtime: 'node',
    displayName: 'Solid',
    supportTier: 'observed',
    moduleSupport: false,
    confidence: 'medium',
    kind: 'frontend',
  },
  express: {
    key: 'express',
    importStack: 'express',
    runtime: 'node',
    displayName: 'Express',
    supportTier: 'observed',
    moduleSupport: false,
    confidence: 'medium',
    kind: 'backend',
  },
  koa: {
    key: 'koa',
    importStack: 'koa',
    runtime: 'node',
    displayName: 'Koa',
    supportTier: 'observed',
    moduleSupport: false,
    confidence: 'medium',
    kind: 'backend',
  },
  go: {
    key: 'go',
    importStack: 'go',
    runtime: 'go',
    displayName: 'Go',
    supportTier: 'observed',
    moduleSupport: false,
    confidence: 'medium',
    kind: 'backend',
  },
  springboot: {
    key: 'springboot',
    importStack: 'springboot',
    runtime: 'java',
    displayName: 'Spring Boot',
    supportTier: 'observed',
    moduleSupport: false,
    confidence: 'medium',
    kind: 'backend',
  },
  rails: {
    key: 'rails',
    importStack: 'rails',
    runtime: 'ruby',
    displayName: 'Rails',
    supportTier: 'observed',
    moduleSupport: false,
    confidence: 'medium',
    kind: 'backend',
  },
  dotnet: {
    key: 'dotnet',
    importStack: 'dotnet',
    runtime: 'dotnet',
    displayName: '.NET',
    supportTier: 'observed',
    moduleSupport: false,
    confidence: 'medium',
    kind: 'backend',
  },
};

function unknownDetection(): AdoptDetection {
  return {
    key: 'unknown',
    importStack: 'unknown',
    runtime: 'unknown',
    displayName: 'Unknown',
    supportTier: 'unknown',
    moduleSupport: false,
    confidence: 'low',
    kind: 'unknown',
  };
}

function normalizeProjectType(projectType?: string): AdoptDetection {
  if (!projectType) {
    return unknownDetection();
  }
  return PROJECT_TYPE_ALIASES[projectType.toLowerCase()] ?? unknownDetection();
}

function kitForDetection(detection: AdoptDetection): string {
  if (detection.key === 'fastapi') {
    return 'fastapi.standard';
  }
  if (detection.key === 'nestjs') {
    return 'nestjs.standard';
  }
  if (detection.key === 'go') {
    return 'go.standard';
  }
  if (detection.key === 'springboot') {
    return 'springboot.standard';
  }
  if (detection.key === 'dotnet') {
    return 'dotnet.webapi.clean';
  }
  return `adopted.${detection.key}`;
}

function engineForRuntime(runtime: AdoptableRuntime): string {
  if (runtime === 'python') {
    return 'python';
  }
  if (runtime === 'node') {
    return 'npm';
  }
  if (runtime === 'go') {
    return 'go';
  }
  if (runtime === 'java') {
    return 'maven';
  }
  if (runtime === 'php') {
    return 'composer';
  }
  if (runtime === 'ruby') {
    return 'bundler';
  }
  if (runtime === 'dotnet') {
    return 'dotnet';
  }
  return 'unknown';
}

async function resolveWorkspacePath(inputWorkspacePath?: string): Promise<string | undefined> {
  if (inputWorkspacePath && inputWorkspacePath.length > 0) {
    return inputWorkspacePath;
  }

  const selectedWorkspace = (await vscode.commands.executeCommand(
    'workspai.getSelectedWorkspace'
  )) as { path?: string } | null;
  return selectedWorkspace?.path;
}

async function detectProject(
  projectPath: string,
  projectTypeHint?: string
): Promise<AdoptDetection> {
  const normalizedHint = normalizeProjectType(projectTypeHint);
  if (normalizedHint.key !== 'unknown') {
    return normalizedHint;
  }

  const packageJsonPath = path.join(projectPath, 'package.json');
  const hasPackageJson = await fs.pathExists(packageJsonPath);

  if (hasPackageJson) {
    const detected = await detectNodeProject(packageJsonPath);
    if (detected.key !== 'unknown') {
      return detected;
    }
  }

  if (await fs.pathExists(path.join(projectPath, 'pyproject.toml'))) {
    return PROJECT_TYPE_ALIASES.fastapi;
  }
  if (await fs.pathExists(path.join(projectPath, 'manage.py'))) {
    return PROJECT_TYPE_ALIASES.django;
  }
  if (await fs.pathExists(path.join(projectPath, 'go.mod'))) {
    return PROJECT_TYPE_ALIASES.go;
  }
  if (
    (await fs.pathExists(path.join(projectPath, 'pom.xml'))) ||
    (await fs.pathExists(path.join(projectPath, 'build.gradle'))) ||
    (await fs.pathExists(path.join(projectPath, 'build.gradle.kts')))
  ) {
    return PROJECT_TYPE_ALIASES.springboot;
  }
  if (
    (await hasFileWithExtension(projectPath, '.csproj')) ||
    (await hasFileWithExtension(projectPath, '.sln'))
  ) {
    return PROJECT_TYPE_ALIASES.dotnet;
  }
  if (await fs.pathExists(path.join(projectPath, 'Gemfile'))) {
    return PROJECT_TYPE_ALIASES.rails;
  }

  return unknownDetection();
}

async function detectNodeProject(packageJsonPath: string): Promise<AdoptDetection> {
  try {
    const packageJson = await fs.readJSON(packageJsonPath);
    const deps = {
      ...(packageJson.dependencies ?? {}),
      ...(packageJson.devDependencies ?? {}),
      ...(packageJson.peerDependencies ?? {}),
    } as Record<string, string>;
    const scripts = (packageJson.scripts ?? {}) as Record<string, string>;

    if (deps.next || scripts.dev?.includes('next')) {
      return PROJECT_TYPE_ALIASES.nextjs;
    }
    if (deps['@remix-run/react'] || deps['@remix-run/node']) {
      return PROJECT_TYPE_ALIASES.remix;
    }
    if (deps.nuxt || deps['@nuxt/kit']) {
      return PROJECT_TYPE_ALIASES.nuxt;
    }
    if (deps['@nestjs/core']) {
      return PROJECT_TYPE_ALIASES.nestjs;
    }
    if (deps['@sveltejs/kit']) {
      return PROJECT_TYPE_ALIASES.sveltekit;
    }
    if (deps['@angular/core'] || deps['@angular/cli']) {
      return PROJECT_TYPE_ALIASES.angular;
    }
    if (deps.astro) {
      return PROJECT_TYPE_ALIASES.astro;
    }
    if (deps['solid-js']) {
      return PROJECT_TYPE_ALIASES.solid;
    }
    if (deps.vue) {
      return PROJECT_TYPE_ALIASES.vue;
    }
    if (deps.svelte) {
      return PROJECT_TYPE_ALIASES.svelte;
    }
    if (deps.react || deps['react-dom']) {
      return PROJECT_TYPE_ALIASES.react;
    }
    if (deps.vite || scripts.dev?.includes('vite')) {
      return PROJECT_TYPE_ALIASES.vite;
    }
    if (deps.express) {
      return PROJECT_TYPE_ALIASES.express;
    }
    if (deps.koa) {
      return PROJECT_TYPE_ALIASES.koa;
    }

    return {
      ...unknownDetection(),
      key: 'node',
      runtime: 'node',
      displayName: 'Node.js',
      supportTier: 'observed',
      confidence: 'low',
      kind: 'package',
    };
  } catch {
    return unknownDetection();
  }
}

async function hasFileWithExtension(rootPath: string, extension: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(rootPath, { withFileTypes: true });
    return entries.some((entry) => entry.isFile() && entry.name.endsWith(extension));
  } catch {
    return false;
  }
}

async function hasManagedMarker(projectPath: string): Promise<boolean> {
  const projectMarkerPath = path.join(projectPath, '.rapidkit', 'project.json');
  const contextMarkerPath = path.join(projectPath, '.rapidkit', 'context.json');
  return (await fs.pathExists(projectMarkerPath)) || (await fs.pathExists(contextMarkerPath));
}

function parseAdoptJson(stdout: string): RapidkitAdoptJsonResult | null {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as RapidkitAdoptJsonResult;
  } catch {
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first < 0 || last <= first) {
      return null;
    }

    try {
      return JSON.parse(trimmed.slice(first, last + 1)) as RapidkitAdoptJsonResult;
    } catch {
      return null;
    }
  }
}

async function runCanonicalNpmAdopt(
  workspacePath: string,
  projectPath: string,
  projectName: string
): Promise<RapidkitAdoptJsonResult | null> {
  const result = await run(
    'npx',
    buildNpxRapidkitArgs([
      'adopt',
      projectPath,
      '--workspace',
      workspacePath,
      '--name',
      projectName,
      '--json',
    ]),
    {
      cwd: workspacePath,
      timeout: 120_000,
    }
  );

  if (result.exitCode !== 0) {
    return null;
  }

  const parsed = parseAdoptJson(result.stdout);
  return parsed?.adoptedProject?.path ? parsed : null;
}

async function writeLocalAdoptionFallback(
  workspacePath: string,
  projectPath: string,
  projectName: string,
  detection: AdoptDetection
): Promise<RapidkitAdoptJsonResult> {
  const adoptedAt = new Date().toISOString();
  const rapidkitDir = path.join(projectPath, '.rapidkit');
  const projectJsonPath = path.join(rapidkitDir, 'project.json');
  const contextJsonPath = path.join(rapidkitDir, 'context.json');
  const adoptJsonPath = path.join(rapidkitDir, 'adopt.json');
  const adoptReadinessPath = path.join(rapidkitDir, 'adopt-readiness.json');
  const relativePath = path.relative(workspacePath, projectPath);

  await fs.ensureDir(rapidkitDir);
  await fs.writeJSON(
    projectJsonPath,
    {
      schema_version: 1,
      name: projectName,
      slug: projectName,
      kit_name: kitForDetection(detection),
      runtime: detection.runtime,
      framework: detection.key,
      framework_display_name: detection.displayName,
      project_kind: detection.kind,
      support_tier: detection.supportTier,
      confidence: detection.confidence,
      module_support: detection.moduleSupport,
      relationship: 'adopted',
      managed_by: 'rapidkit-vscode',
      managed_version: getExtensionVersion(),
      managed_at: adoptedAt,
    },
    { spaces: 2 }
  );

  await fs.writeJSON(
    adoptJsonPath,
    {
      version: 1,
      adoptedAt,
      adoptedBy: 'rapidkit-vscode',
      source: 'adopted-local',
      workspacePath,
      projectPath,
      relativePath,
      detection: {
        stack: detection.importStack,
        runtime: detection.runtime,
        framework: detection.key,
        frameworkDisplayName: detection.displayName,
        supportTier: detection.supportTier,
        moduleSupport: detection.moduleSupport,
        confidence: detection.confidence,
        kind: detection.kind,
      },
    },
    { spaces: 2 }
  );

  await fs.writeJSON(
    adoptReadinessPath,
    {
      version: 1,
      generatedAt: adoptedAt,
      status: 'observed',
      summary: `${detection.displayName} project adopted into Workspai workspace context.`,
      checks: [
        {
          id: 'project-marker',
          status: 'pass',
          label: 'Project marker',
          detail: '.rapidkit/project.json was written',
        },
        {
          id: 'workspace-registry',
          status: 'pass',
          label: 'Workspace registry',
          detail: '.rapidkit/imported-projects.json was updated',
        },
        {
          id: 'command-support',
          status: detection.moduleSupport ? 'pass' : 'info',
          label: 'Command support',
          detail: detection.moduleSupport
            ? 'Core module lifecycle commands are available'
            : 'Governance and intelligence commands are available; module lifecycle is advisory',
        },
      ],
    },
    { spaces: 2 }
  );

  await fs.writeJSON(
    contextJsonPath,
    {
      engine: engineForRuntime(detection.runtime),
      adopted_via: 'workspai.adoptProject',
      adopted_at: adoptedAt,
      framework: detection.key,
      framework_display_name: detection.displayName,
      support_tier: detection.supportTier,
    },
    { spaces: 2 }
  );

  const registryEntry: ImportedProjectRegistryEntry = {
    name: projectName,
    path: projectPath,
    relativePath,
    relationship: 'adopted',
    stack: detection.importStack,
    runtime: detection.runtime,
    framework: detection.key,
    frameworkDisplayName: detection.displayName,
    supportTier: detection.supportTier,
    moduleSupport: detection.moduleSupport,
    confidence: detection.confidence,
    source: 'adopted-local',
    importedAt: adoptedAt,
  };
  await upsertImportedProjectsRegistry(workspacePath, [registryEntry]);

  return {
    workspacePath,
    workspaceResolution: 'extension-fallback',
    defaultWorkspaceCreated: false,
    dryRun: false,
    adoptedProject: {
      name: projectName,
      path: projectPath,
      relativePath,
      relationship: 'adopted',
      stack: detection.importStack,
      runtime: detection.runtime,
      framework: detection.key,
      frameworkDisplayName: detection.displayName,
      supportTier: detection.supportTier,
      moduleSupport: detection.moduleSupport,
      confidence: detection.confidence,
      projectJsonPath,
      adoptJsonPath,
      adoptReadinessPath,
      wroteFiles: true,
    },
  };
}

export async function adoptProjectCommand(input: AdoptProjectInput): Promise<boolean> {
  const logger = Logger.getInstance();
  const workspacePath = await resolveWorkspacePath(input.workspacePath);

  if (!input.projectPath) {
    vscode.window.showWarningMessage('Select a project first.');
    return false;
  }

  const projectPath = input.projectPath;
  const projectName = input.projectName ?? path.basename(projectPath);

  try {
    if (!workspacePath) {
      vscode.window.showWarningMessage('Select a Workspai workspace before adopting a project.');
      return false;
    }

    const stat = await fs.stat(projectPath).catch(() => null);
    if (!stat || !stat.isDirectory()) {
      vscode.window.showErrorMessage(`Project path is invalid: ${projectPath}`);
      return false;
    }

    if (await hasManagedMarker(projectPath)) {
      await WorkspaceUsageTracker.getInstance().trackCommandEvent(
        'workspai.convertProjectToManaged',
        workspacePath,
        {
          result: 'already-managed',
          projectName,
          intent: 'explicit-user-confirmation',
        }
      );
      vscode.window.showInformationMessage(
        `Project "${projectName}" is already managed by Workspai.`
      );
      return false;
    }

    const detection = await detectProject(projectPath, input.projectType);

    const choice = await vscode.window.showWarningMessage(
      `Adopt project "${projectName}" into this Workspai workspace?\n\n` +
        `Detected stack: ${detection.displayName}\n` +
        `This will create:\n` +
        `• .rapidkit/project.json\n` +
        `• .rapidkit/adopt.json\n` +
        `• .rapidkit/adopt-readiness.json\n` +
        `• Workspace project registry entry`,
      { modal: true },
      'Adopt',
      'Cancel'
    );

    if (choice !== 'Adopt') {
      await WorkspaceUsageTracker.getInstance().trackCommandEvent(
        'workspai.convertProjectToManaged',
        workspacePath,
        {
          result: 'cancelled',
          projectName,
          detectedType: detection.key,
          intent: 'explicit-user-confirmation',
        }
      );
      return false;
    }

    const adoptionOutcome = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Adopting ${projectName} into Workspai workspace...`,
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 35, message: 'Running RapidKit adopt contract...' });

        let adoptionResult = await runCanonicalNpmAdopt(workspacePath, projectPath, projectName);
        let adoptionEngine: 'rapidkit-npm' | 'extension-fallback' = 'rapidkit-npm';

        if (!adoptionResult) {
          adoptionEngine = 'extension-fallback';
          progress.report({
            increment: 35,
            message: 'CLI unavailable; writing aligned local adoption metadata...',
          });
          adoptionResult = await writeLocalAdoptionFallback(
            workspacePath,
            projectPath,
            projectName,
            detection
          );
        }

        progress.report({ increment: 30, message: 'Refreshing workspace views...' });
        await vscode.commands.executeCommand('workspai.refreshProjects');
        await vscode.commands.executeCommand('workspai.refreshWorkspaces');

        return { adoptionResult, adoptionEngine };
      }
    );

    const adoptedProject = adoptionOutcome.adoptionResult.adoptedProject;
    const detectedType = adoptedProject?.framework ?? detection.key;
    const runtime = adoptedProject?.runtime ?? detection.runtime;
    const supportTier = adoptedProject?.supportTier ?? detection.supportTier;

    await WorkspaceUsageTracker.getInstance().trackCommandEvent(
      'workspai.convertProjectToManaged',
      workspacePath,
      {
        result: 'success',
        projectName,
        detectedType,
        runtime,
        supportTier,
        adoptionEngine: adoptionOutcome.adoptionEngine,
        intent: 'explicit-user-confirmation',
      }
    );

    vscode.window.showInformationMessage(`Project "${projectName}" adopted into Workspai.`);

    logger.info('Project adopted into Workspai workspace', {
      projectPath,
      projectName,
      detectedType,
      runtime,
      supportTier,
      adoptionEngine: adoptionOutcome.adoptionEngine,
    });

    return true;
  } catch (error) {
    await WorkspaceUsageTracker.getInstance().trackCommandEvent(
      'workspai.convertProjectToManaged',
      workspacePath,
      {
        result: 'failed',
        projectName,
        intent: 'explicit-user-confirmation',
      }
    );

    logger.error('Failed to convert project to managed format', error);
    vscode.window.showErrorMessage(
      `Failed to convert project: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

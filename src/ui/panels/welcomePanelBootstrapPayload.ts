import path from 'node:path';
import * as vscode from 'vscode';

import {
  resolveProjectCapabilitiesPayload,
  type WebviewProjectCapabilitiesPayload,
} from '../../core/projectCapabilityBridge';
import {
  clearProjectCapabilityContext,
  syncProjectCapabilityContext,
} from '../../core/projectCapabilityContext';
import { ExamplesService } from '../../core/examplesService';
import { isWorkspacePathAncestor } from '../../core/aiContextResolver';
import { runningServers } from '../../core/runningServers';
import { run } from '../../utils/exec';
import { isPoetryInstalledCached } from '../../utils/poetryHelper';
import { checkPythonEnvironmentCached } from '../../utils/pythonChecker';
import type { RecentWorkspaceEntry } from './welcomePanelRecentWorkspaces';
import type { WelcomePanelProjectType } from './welcomePanelProjectTypeDetection';

export type BootstrapPayloadHost = {
  context: vscode.ExtensionContext;
  webview: vscode.Webview;
  postWebviewMessage: (command: string, data?: unknown) => void;
  getRecentWorkspaces: () => Promise<RecentWorkspaceEntry[]>;
  sendAvailableKits: () => Promise<void>;
  sendModulesCatalog: () => Promise<void>;
  sendWorkspaiSettings: (preferredModelOverride?: string) => Promise<void>;
  sendDashboardEvidence: () => Promise<void> | void;
  sendUiPreferences: (workspacePath?: string) => void;
  getSelectedWorkspaceInfo: () => { name: string; path: string } | null;
  getSelectedProject: () => {
    path: string;
    name: string;
    type?: string;
    workspacePath?: string;
    workspaceName?: string;
  } | null;
  setSelectedProject: (
    project: {
      path: string;
      name: string;
      type?: string;
      workspacePath?: string;
      workspaceName?: string;
    } | null
  ) => void;
  readInstalledModules: (
    projectPath: string
  ) => Promise<{ slug: string; version: string; display_name: string }[]>;
  detectProjectType: (projectPath: string) => Promise<WelcomePanelProjectType>;
};

export function sendWelcomePanelInitialData(host: BootstrapPayloadHost): void {
  sendExtensionVersion(host);
  host.sendUiPreferences();

  const startedAt = Date.now();
  const scheduleLane = (
    lane: string,
    delayMs: number,
    operations: () => readonly unknown[]
  ): void => {
    setTimeout(() => {
      const laneStartedAt = Date.now();
      void Promise.allSettled(operations()).then(() => {
        console.log(
          `[WelcomePanel Bootstrap] ${lane} completed in ${Date.now() - laneStartedAt}ms (total ${Date.now() - startedAt}ms)`
        );
      });
    }, delayMs);
  };

  // These lanes are intentionally independent. A stalled CLI/network probe in
  // one section must never prevent another dashboard section from hydrating.
  scheduleLane('workspace-truth', 0, () => [
    sendRecentWorkspacesPayload(host),
    sendWorkspaceStatus(host),
    host.sendWorkspaiSettings(),
    host.sendDashboardEvidence(),
  ]);
  scheduleLane('catalogs', 25, () => [host.sendAvailableKits(), host.sendModulesCatalog()]);
  scheduleLane('environment-probes', 75, () => [
    sendExampleWorkspaces(host),
    sendWorkspaceToolStatus(host),
  ]);
}

export function sendExtensionVersion(
  host: Pick<BootstrapPayloadHost, 'context' | 'postWebviewMessage'>
): void {
  const version = host.context.extension.packageJSON.version || '0.0.0';
  host.postWebviewMessage('updateVersion', version);
}

export async function sendRecentWorkspacesPayload(host: BootstrapPayloadHost): Promise<void> {
  const workspaces = await host.getRecentWorkspaces();
  host.postWebviewMessage('updateRecentWorkspaces', workspaces);
}

export async function sendExampleWorkspaces(
  host: Pick<BootstrapPayloadHost, 'postWebviewMessage'>,
  options?: { forceRefresh?: boolean }
): Promise<void> {
  try {
    const examplesService = ExamplesService.getInstance();
    if (options?.forceRefresh) {
      await examplesService.invalidateCache();
    }
    const examples = await examplesService.getExamples();

    const enrichedExamples = await Promise.all(
      examples.map(async (example) => {
        const isCloned = await examplesService.isExampleCloned(example.id);
        let cloneStatus: 'not-cloned' | 'cloned' | 'update-available' = 'not-cloned';

        if (isCloned) {
          cloneStatus = 'cloned';
          const updateInfo = await examplesService.checkForUpdates(example.id);
          if (updateInfo.hasUpdate) {
            cloneStatus = 'update-available';
          }
        }

        const repoUrl = example.path
          ? `https://github.com/chistiq/rapidkit-examples/tree/main/${example.path}`
          : 'https://github.com/chistiq/rapidkit-examples';
        const cloneUrl = 'https://github.com/chistiq/rapidkit-examples';

        return {
          ...example,
          repoUrl,
          cloneUrl,
          cloneStatus,
        };
      })
    );

    host.postWebviewMessage('updateExampleWorkspaces', enrichedExamples);
  } catch (error) {
    console.error('[WelcomePanel] Failed to send example workspaces:', error);
    host.postWebviewMessage('updateExampleWorkspaces', []);
  }
}

export async function sendWorkspaceToolStatus(
  host: Pick<BootstrapPayloadHost, 'postWebviewMessage'>
): Promise<void> {
  const python = await checkPythonEnvironmentCached();
  const poetryAvailable = await isPoetryInstalledCached();

  let pipxAvailable = false;
  const pipxCandidates: Array<{ command: string; args: string[] }> =
    process.platform === 'win32'
      ? [
          { command: 'python', args: ['-m', 'pipx', '--version'] },
          { command: 'py', args: ['-m', 'pipx', '--version'] },
          { command: 'pipx', args: ['--version'] },
        ]
      : [
          { command: 'pipx', args: ['--version'] },
          { command: 'python3', args: ['-m', 'pipx', '--version'] },
          { command: 'python', args: ['-m', 'pipx', '--version'] },
        ];

  for (const candidate of pipxCandidates) {
    try {
      const result = await run(candidate.command, candidate.args, {
        timeout: 3000,
        stdio: 'pipe',
      });
      if (result.exitCode === 0) {
        pipxAvailable = true;
        break;
      }
    } catch {
      continue;
    }
  }

  const venvAvailable = python.available && python.venvSupport;
  const preferredInstallMethod = poetryAvailable ? 'poetry' : pipxAvailable ? 'pipx' : 'venv';

  const probeBinaryWithFallbacks = async (
    primaryCmd: string,
    args: string[],
    fallbacks: string[] = []
  ): Promise<{ available: boolean; version: string | null; resolvedPath: string | null }> => {
    const candidates = [primaryCmd, ...fallbacks];
    for (const cmd of candidates) {
      try {
        const result = await run(cmd, args, { timeout: 4000, stdio: 'pipe' });
        if (result.exitCode === 0) {
          const raw = (result.stdout || result.stderr || '').trim();
          const versionMatch = raw.match(/(\d+[.\d]*)/);
          return {
            available: true,
            version: versionMatch?.[0] || null,
            resolvedPath: cmd,
          };
        }
      } catch {
        // try next
      }
    }
    return { available: false, version: null, resolvedPath: null };
  };

  const javaHome = process.env.JAVA_HOME?.trim();
  const mavenHome = (process.env.MAVEN_HOME || process.env.M2_HOME)?.trim();
  const gradleHome = process.env.GRADLE_HOME?.trim();
  const sdkmanBase = `${process.env.HOME || '~'}/.sdkman/candidates`;
  const sep = process.platform === 'win32' ? '\\' : '/';

  const javaFallbacks = [
    ...(javaHome ? [`${javaHome}${sep}bin${sep}java`] : []),
    '/usr/lib/jvm/temurin-21/bin/java',
    '/usr/lib/jvm/java-21-openjdk-amd64/bin/java',
    '/usr/lib/jvm/java-17-openjdk-amd64/bin/java',
    `${sdkmanBase}/java/current/bin/java`,
  ].filter(Boolean);

  const mavenFallbacks = [
    ...(mavenHome ? [`${mavenHome}${sep}bin${sep}mvn`] : []),
    `${sdkmanBase}/maven/current/bin/mvn`,
    '/usr/local/maven/bin/mvn',
  ].filter(Boolean);

  const gradleFallbacks = [
    ...(gradleHome ? [`${gradleHome}${sep}bin${sep}gradle`] : []),
    `${sdkmanBase}/gradle/current/bin/gradle`,
    '/usr/local/gradle/bin/gradle',
  ].filter(Boolean);

  const [javaResult, mavenResult, gradleResult, dotnetResult] = await Promise.all([
    probeBinaryWithFallbacks('java', ['-version'], javaFallbacks),
    probeBinaryWithFallbacks('mvn', ['--version'], mavenFallbacks),
    probeBinaryWithFallbacks('gradle', ['--version'], gradleFallbacks),
    probeBinaryWithFallbacks('dotnet', ['--version']),
  ]);

  host.postWebviewMessage('workspaceToolStatus', {
    pythonAvailable: python.available,
    venvAvailable,
    poetryAvailable,
    pipxAvailable,
    javaAvailable: javaResult.available,
    mavenAvailable: mavenResult.available,
    gradleAvailable: gradleResult.available,
    dotnetAvailable: dotnetResult.available,
    preferredInstallMethod,
  });
}

export async function sendWorkspaceStatus(
  host: BootstrapPayloadHost,
  options?: {
    forceCapabilityRefresh?: boolean;
    workspaceOverride?: { name?: string; path: string } | null;
    shouldApply?: () => boolean;
  }
): Promise<void> {
  const selectedWorkspace =
    options && Object.prototype.hasOwnProperty.call(options, 'workspaceOverride')
      ? (options.workspaceOverride ?? null)
      : host.getSelectedWorkspaceInfo();
  const selectedProject = host.getSelectedProject();
  const fallbackWorkspacePath = selectedProject?.workspacePath;
  const fallbackWorkspaceName =
    selectedProject?.workspaceName ||
    (fallbackWorkspacePath ? path.basename(fallbackWorkspacePath) : undefined);
  const effectiveWorkspace = selectedWorkspace
    ? selectedWorkspace
    : fallbackWorkspacePath
      ? {
          path: fallbackWorkspacePath,
          name: fallbackWorkspaceName || path.basename(fallbackWorkspacePath),
        }
      : null;
  const hasWorkspace = effectiveWorkspace !== null;
  let hasProjectSelected = false;
  let installedModules: { slug: string; version: string; display_name: string }[] = [];
  let projectType: string | undefined;
  let projectCapabilities: WebviewProjectCapabilitiesPayload = { available: false };
  let isRunning = false;
  let runningPort: number | undefined;

  if (!selectedWorkspace && !fallbackWorkspacePath) {
    host.setSelectedProject(null);
  }

  if (
    selectedProject &&
    effectiveWorkspace &&
    isWorkspacePathAncestor(effectiveWorkspace.path, selectedProject.path)
  ) {
    hasProjectSelected = true;
    const selectedProjectPath = selectedProject.path;
    installedModules = await host.readInstalledModules(selectedProjectPath);
    projectCapabilities = await resolveProjectCapabilitiesPayload(selectedProjectPath, {
      forceRefresh: options?.forceCapabilityRefresh === true,
    });
    projectType = (await host.detectProjectType(selectedProjectPath)) ?? undefined;

    if (options?.shouldApply && !options.shouldApply()) {
      return;
    }

    await syncProjectCapabilityContext({
      projectPath: selectedProjectPath,
      projectType,
      forceRefresh: options?.forceCapabilityRefresh === true,
    });

    const runningTerminal = runningServers.get(selectedProjectPath);
    if (runningTerminal) {
      isRunning = true;
      const match = runningTerminal.name.match(/:([0-9]+)/);
      if (match) {
        runningPort = parseInt(match[1], 10);
      }
    }
  }

  if (
    selectedProject &&
    selectedWorkspace &&
    !isWorkspacePathAncestor(selectedWorkspace.path, selectedProject.path)
  ) {
    host.setSelectedProject(null);
  }

  if (!hasProjectSelected) {
    if (options?.shouldApply && !options.shouldApply()) {
      return;
    }
    await clearProjectCapabilityContext();
  }

  const currentProject = host.getSelectedProject();

  if (options?.shouldApply && !options.shouldApply()) {
    return;
  }
  host.postWebviewMessage('updateWorkspaceStatus', {
    hasWorkspace,
    hasProjectSelected,
    workspaceName: effectiveWorkspace?.name,
    workspacePath: effectiveWorkspace?.path,
    projectName: hasProjectSelected ? currentProject?.name : undefined,
    projectPath: hasProjectSelected ? currentProject?.path : undefined,
    projectType,
    installedModules,
    projectCapabilities,
    isRunning,
    runningPort,
  });
}

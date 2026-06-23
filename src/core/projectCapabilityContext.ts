import * as vscode from 'vscode';

import {
  clearProjectCommandCapabilitiesCache,
  fetchProjectCommandCapabilities,
  isProjectCommandSupported,
  type ProjectCommandCapabilitiesSnapshot,
} from './projectCommandCapabilities';
import { resolveProjectCapabilitiesPayload } from './projectCapabilityBridge';
import {
  isModuleInstallSupportedForProjectType,
  isModuleSupportedProjectType,
} from './moduleSupportContract';

export const PROJECT_CAPABILITY_CONTEXT_KEYS = {
  init: 'workspai:projectSupportsInit',
  dev: 'workspai:projectSupportsDev',
  test: 'workspai:projectSupportsTest',
  build: 'workspai:projectSupportsBuild',
  start: 'workspai:projectSupportsStart',
  lint: 'workspai:projectSupportsLint',
  format: 'workspai:projectSupportsFormat',
  modules: 'workspai:projectSupportsModules',
} as const;

type LifecycleCommand = keyof Omit<typeof PROJECT_CAPABILITY_CONTEXT_KEYS, 'modules'>;

function supportsLifecycleCommand(
  capabilities: ProjectCommandCapabilitiesSnapshot | null,
  command: LifecycleCommand,
  projectType?: string
): boolean {
  if (capabilities) {
    return isProjectCommandSupported(capabilities, command);
  }
  return Boolean(projectType);
}

function supportsModuleMutation(
  capabilities: ProjectCommandCapabilitiesSnapshot | null,
  projectType?: string
): boolean {
  if (capabilities) {
    return (
      capabilities.moduleSupport &&
      isProjectCommandSupported(capabilities, 'add') &&
      isProjectCommandSupported(capabilities, 'modules')
    );
  }
  return isModuleInstallSupportedForProjectType(projectType);
}

export async function clearProjectCapabilityContext(): Promise<void> {
  await Promise.all(
    Object.values(PROJECT_CAPABILITY_CONTEXT_KEYS).map((key) =>
      vscode.commands.executeCommand('setContext', key, false)
    )
  );
}

export async function syncProjectCapabilityContext(input: {
  projectPath?: string | null;
  projectType?: string;
  forceRefresh?: boolean;
}): Promise<void> {
  const projectPath = input.projectPath?.trim();
  if (!projectPath) {
    await clearProjectCapabilityContext();
    return;
  }

  const capabilities = await fetchProjectCommandCapabilities(projectPath, {
    forceRefresh: input.forceRefresh === true,
  });

  await Promise.all([
    vscode.commands.executeCommand(
      'setContext',
      PROJECT_CAPABILITY_CONTEXT_KEYS.init,
      supportsLifecycleCommand(capabilities, 'init', input.projectType)
    ),
    vscode.commands.executeCommand(
      'setContext',
      PROJECT_CAPABILITY_CONTEXT_KEYS.dev,
      supportsLifecycleCommand(capabilities, 'dev', input.projectType)
    ),
    vscode.commands.executeCommand(
      'setContext',
      PROJECT_CAPABILITY_CONTEXT_KEYS.test,
      supportsLifecycleCommand(capabilities, 'test', input.projectType)
    ),
    vscode.commands.executeCommand(
      'setContext',
      PROJECT_CAPABILITY_CONTEXT_KEYS.build,
      supportsLifecycleCommand(capabilities, 'build', input.projectType)
    ),
    vscode.commands.executeCommand(
      'setContext',
      PROJECT_CAPABILITY_CONTEXT_KEYS.start,
      supportsLifecycleCommand(capabilities, 'start', input.projectType)
    ),
    vscode.commands.executeCommand(
      'setContext',
      PROJECT_CAPABILITY_CONTEXT_KEYS.lint,
      supportsLifecycleCommand(capabilities, 'lint', input.projectType)
    ),
    vscode.commands.executeCommand(
      'setContext',
      PROJECT_CAPABILITY_CONTEXT_KEYS.format,
      supportsLifecycleCommand(capabilities, 'format', input.projectType)
    ),
    vscode.commands.executeCommand(
      'setContext',
      PROJECT_CAPABILITY_CONTEXT_KEYS.modules,
      supportsModuleMutation(capabilities, input.projectType)
    ),
  ]);
}

export async function invalidateAndRefreshProjectCapabilities(input: {
  projectPath: string;
  projectType?: string;
}): Promise<void> {
  clearProjectCommandCapabilitiesCache(input.projectPath);
  await syncProjectCapabilityContext({
    projectPath: input.projectPath,
    projectType: input.projectType,
    forceRefresh: true,
  });
}

export async function resolveProjectCapabilitiesForWebview(
  projectPath: string,
  options: { forceRefresh?: boolean } = {}
) {
  return resolveProjectCapabilitiesPayload(projectPath, options);
}

export function heuristicModuleSupportFromProjectType(projectType?: string): boolean {
  return isModuleSupportedProjectType(projectType);
}

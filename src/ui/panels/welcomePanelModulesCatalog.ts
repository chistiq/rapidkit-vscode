import path from 'node:path';
import * as fs from 'fs-extra';
import * as vscode from 'vscode';

import { CoreVersionService } from '../../core/coreVersionService';
import { KitsService } from '../../core/kitsService';
import { ModulesCatalogService } from '../../core/modulesCatalogService';
import { MODULES, type ModuleData } from '../../data/modules';
import { resolveCatalogWorkspaceRoot } from '../../utils/coreRuntimeResolver';
import { getWorkspaceVenvRapidkitCandidates } from '../../utils/platformCapabilities';
import type { DashboardSelectedProject } from './welcomePanelDashboardCommands';

type ModuleInfoPayload = ModuleData & Record<string, unknown>;

export type ModulesCatalogHost = {
  getModulesCatalog: () => ModuleData[];
  setModulesCatalog: (modules: ModuleData[]) => void;
  getSelectedWorkspaceInfo: () => { name: string; path: string } | null;
  getSelectedProject: () => DashboardSelectedProject;
  getFallbackWorkspacePath: () => string | undefined;
  postWebviewMessage: (command: string, data?: unknown) => void;
  refreshExampleWorkspaces: () => Promise<void>;
};

const CATALOG_WEBVIEW_COMMANDS = new Set([
  'refreshModules',
  'requestCatalogRefresh',
  'requestAvailableKits',
  'installModule',
  'showModuleDetails',
]);

export function isCatalogWebviewCommand(command: string): boolean {
  return CATALOG_WEBVIEW_COMMANDS.has(command);
}

export function resolveModuleDetailsInput(
  input: unknown,
  catalog: ModuleData[]
): ModuleData | null {
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    const record = input as Partial<ModuleData> & { display_name?: unknown };
    const slug = typeof record.slug === 'string' && record.slug.trim() ? record.slug : undefined;
    const id =
      typeof record.id === 'string' && record.id.trim()
        ? record.id
        : slug?.split('/').filter(Boolean).pop();
    const displayName =
      typeof record.display_name === 'string' && record.display_name.trim()
        ? record.display_name
        : undefined;
    const name =
      typeof record.name === 'string' && record.name.trim()
        ? record.name
        : displayName || id || slug;

    if (!id && !slug && !name) {
      return null;
    }

    return {
      ...record,
      id: id || name || slug || 'unknown',
      name: name || id || slug || 'Unknown module',
      display_name: displayName || name || id || slug || 'Unknown module',
      version:
        typeof record.version === 'string' && record.version.trim() ? record.version : '0.0.0',
      category:
        typeof record.category === 'string' && record.category.trim()
          ? record.category
          : slug?.split('/').filter(Boolean)[1] || 'unknown',
      icon: typeof record.icon === 'string' && record.icon.trim() ? record.icon : '📦',
      description: typeof record.description === 'string' ? record.description : '',
      status:
        record.status === 'beta' || record.status === 'experimental' || record.status === 'stable'
          ? record.status
          : 'stable',
      dependencies: Array.isArray(record.dependencies)
        ? record.dependencies.filter((value): value is string => typeof value === 'string')
        : undefined,
      tags: Array.isArray(record.tags)
        ? record.tags.filter((value): value is string => typeof value === 'string')
        : undefined,
      slug: slug || id || name || 'unknown',
    } as ModuleData;
  }

  if (typeof input !== 'string' || !input.trim()) {
    return null;
  }

  const moduleId = input.trim();
  const moduleData =
    catalog.find((m) => m.id === moduleId || m.slug === moduleId) ||
    MODULES.find((m) => m.id === moduleId || m.slug === moduleId);

  if (moduleData) {
    return moduleData;
  }

  const parts = moduleId.split('/').filter(Boolean);
  return {
    id: parts[parts.length - 1] || moduleId,
    name: parts[parts.length - 1] || moduleId,
    version: '0.0.0',
    category: parts.length >= 3 ? parts[1] : 'unknown',
    icon: '📦',
    description: '',
    status: 'stable',
    tags: [],
    slug: moduleId,
  };
}

export function resolveModulesCatalogWorkspacePath(host: ModulesCatalogHost): string | undefined {
  const selectedWorkspace = host.getSelectedWorkspaceInfo();
  if (selectedWorkspace?.path) {
    return selectedWorkspace.path;
  }

  const selectedProject = host.getSelectedProject();
  if (selectedProject?.path) {
    return selectedProject.workspacePath || path.dirname(selectedProject.path);
  }

  return host.getFallbackWorkspacePath();
}

export async function refreshModulesCatalog(
  host: ModulesCatalogHost,
  options?: { forceRefresh?: boolean }
): Promise<void> {
  const postCatalog = (modules: ModuleData[], meta: Record<string, unknown>) => {
    host.postWebviewMessage('updateModulesCatalog', { modules, meta });
  };

  try {
    const service = ModulesCatalogService.getInstance();
    const rawWorkspacePath = resolveModulesCatalogWorkspacePath(host);
    const workspacePath = (await resolveCatalogWorkspaceRoot(rawWorkspacePath)) || rawWorkspacePath;

    if (options?.forceRefresh && workspacePath) {
      CoreVersionService.getInstance().clearCache(workspacePath);
    }

    const result = await service.getModulesCatalog(workspacePath, {
      forceRefresh: options?.forceRefresh === true,
    });

    host.setModulesCatalog(result.modules);
    postCatalog(result.modules, result.meta);
  } catch (error) {
    console.error('[WelcomePanel] Failed to load modules catalog:', error);
    host.setModulesCatalog(MODULES);
    postCatalog(MODULES, {
      source: 'fallback',
      loadError: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function sendAvailableKits(host: ModulesCatalogHost): Promise<void> {
  try {
    const kitsService = KitsService.getInstance();
    const kits = await kitsService.getKits();

    host.postWebviewMessage('updateAvailableKits', kits);

    console.log('[WelcomePanel] ✅ Available kits sent to webview:', kits.length);
  } catch (error) {
    console.error('[WelcomePanel] Failed to send available kits:', error);
    host.postWebviewMessage('updateAvailableKits', []);
  }
}

export async function showModuleDetails(
  host: ModulesCatalogHost,
  moduleData: ModuleData
): Promise<void> {
  try {
    const selectedProject = host.getSelectedProject();
    let workspacePath: string | undefined;
    if (selectedProject?.path) {
      workspacePath = selectedProject.workspacePath || path.dirname(selectedProject.path);
    } else {
      workspacePath = host.getFallbackWorkspacePath();
    }

    const { run } = await import('../../utils/exec.js');

    let command = 'rapidkit';
    if (workspacePath) {
      const candidates = getWorkspaceVenvRapidkitCandidates(workspacePath);
      for (const candidate of candidates) {
        if (await fs.pathExists(candidate)) {
          command = candidate;
          break;
        }
      }
    }

    const candidates = [
      moduleData.slug,
      moduleData.id,
      moduleData.slug?.split('/').filter(Boolean).pop(),
    ].filter((value, index, self) => value && self.indexOf(value) === index) as string[];

    console.log('[WelcomePanel] Fetching module info for:', candidates);

    let moduleInfo: ModuleInfoPayload | null = null;
    let foundMatch = false;

    for (const candidate of candidates) {
      try {
        const jsonResult = await run(command, ['modules', 'info', candidate, '--json'], {
          cwd: workspacePath,
          shell: false,
          timeout: 5000,
        });
        if (jsonResult.exitCode === 0 && jsonResult.stdout) {
          try {
            const parsed = JSON.parse(jsonResult.stdout) as Record<string, unknown>;
            moduleInfo = { ...moduleData, ...parsed };
            foundMatch = true;
            console.log(
              '[WelcomePanel] Found module info (JSON) for:',
              candidate,
              'version:',
              parsed.version
            );
            console.log('[WelcomePanel] moduleInfo after merge:', {
              name: moduleInfo.display_name,
              version: moduleInfo.version,
              slug: moduleInfo.slug,
            });
            break;
          } catch {
            console.log('[WelcomePanel] Failed to parse JSON for:', candidate);
          }
        }
      } catch {
        console.log('[WelcomePanel] Failed to fetch JSON info for:', candidate);
      }
    }

    if (!foundMatch || !moduleInfo) {
      console.log('[WelcomePanel] Could not fetch module info from CLI, using card data');
      moduleInfo = { ...moduleData };
    }

    console.log('[WelcomePanel] Sending showModuleDetailsModal message:', moduleInfo);
    host.postWebviewMessage('showModuleDetailsModal', moduleInfo);
  } catch (error) {
    console.error('[WelcomePanel] Error showing module details:', error);
    vscode.window.showErrorMessage('Failed to load module details');
  }
}

export async function tryDispatchCatalogWebviewMessage(
  host: ModulesCatalogHost,
  command: string,
  data: unknown
): Promise<boolean> {
  if (!isCatalogWebviewCommand(command)) {
    return false;
  }

  switch (command) {
    case 'refreshModules':
      await refreshModulesCatalog(host, { forceRefresh: true });
      break;
    case 'requestCatalogRefresh':
      await Promise.all([
        host.refreshExampleWorkspaces(),
        refreshModulesCatalog(host, { forceRefresh: true }),
      ]);
      break;
    case 'requestAvailableKits':
      await sendAvailableKits(host);
      break;
    case 'installModule': {
      if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        const moduleData = data as Record<string, unknown>;
        const moduleObj = {
          id: moduleData.id,
          displayName: moduleData.display_name || moduleData.name,
          description: moduleData.description || '',
          category: moduleData.category || 'unknown',
          status: moduleData.status || 'stable',
          tags: moduleData.tags || [],
          dependencies: moduleData.dependencies || [],
          installed: false,
          slug: moduleData.slug || `unknown/${moduleData.id}`,
        };
        await vscode.commands.executeCommand('workspai.addModule', moduleObj);
      }
      break;
    }
    case 'showModuleDetails':
      if (data) {
        const moduleData = resolveModuleDetailsInput(data, host.getModulesCatalog());
        if (moduleData) {
          await showModuleDetails(host, moduleData);
        } else {
          console.error('Module not found:', data);
          vscode.window.showWarningMessage(
            'Module details are not available for this catalog item. Refresh the catalog and try again.'
          );
        }
      }
      break;
  }

  return true;
}

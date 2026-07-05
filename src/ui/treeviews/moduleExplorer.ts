/**
 * Module Explorer TreeView Provider
 * Displays available Workspai modules organized by category
 * Shows installation state: Install, Update, or Installed
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
import { MODULES, CATEGORY_INFO, ModuleData } from '../../data/modules';
import { ModulesCatalogService } from '../../core/modulesCatalogService';
import { resolveCatalogWorkspaceRoot } from '../../utils/coreRuntimeResolver';
import { WorkspaiModule } from '../../types';

interface InstalledModule {
  slug: string;
  version: string;
  display_name: string;
}

export class ModuleExplorerProvider implements vscode.TreeDataProvider<ModuleTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ModuleTreeItem | undefined | null | void> =
    new vscode.EventEmitter<ModuleTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ModuleTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private _currentProjectPath: string | null = null;
  private _currentProjectType: string | null = null;
  private _installedModules: Map<string, InstalledModule> = new Map();
  private _modulesCatalog: ModuleData[] = MODULES;
  private _catalogLoaded = false;
  private _catalogLoadInProgress = false;
  private _catalogLoadError: string | null = null;

  // Static instance for external access
  public static instance: ModuleExplorerProvider | null = null;

  constructor() {
    ModuleExplorerProvider.instance = this;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  async reloadModuleStates(): Promise<void> {
    // Reload installed modules for the current project
    if (this._currentProjectPath) {
      await this._loadInstalledModules();
      this.refresh();
    }
  }

  setProjectPath(projectPath: string | null, projectType?: string): void {
    this._currentProjectPath = projectPath;
    this._currentProjectType = projectType ?? null;
    // Reset catalog loaded flag so catalog is re-fetched for the new project/workspace
    this._catalogLoaded = false;
    this._catalogLoadInProgress = false;
    this._catalogLoadError = null;
    this._loadInstalledModules();
    this.refresh();
  }

  getTreeItem(element: ModuleTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ModuleTreeItem): Promise<ModuleTreeItem[]> {
    if (!element) {
      // No project selected — return empty array so viewsWelcome shows the rich empty state
      if (!this._currentProjectPath) {
        return [];
      }

      // Modules are currently supported only for FastAPI and NestJS projects
      if (
        this._currentProjectType &&
        this._currentProjectType !== 'fastapi' &&
        this._currentProjectType !== 'nestjs'
      ) {
        const isSpring = this._currentProjectType === 'springboot';
        const isGo = this._currentProjectType === 'go';
        const item = new vscode.TreeItem(
          isSpring
            ? 'Modules not available for Spring Boot projects'
            : isGo
              ? 'Modules not available for Go projects'
              : 'Modules not available for Generic projects'
        );
        item.contextValue = 'placeholder';
        item.description = isSpring
          ? 'Spring Boot kit manages dependencies via Maven/Gradle'
          : isGo
            ? 'Go kits manage dependencies via go mod'
            : 'Use Convert to Workspai Project to enable guided module installs';
        item.tooltip =
          'Workspai modules are currently available for FastAPI and NestJS projects only';
        item.collapsibleState = vscode.TreeItemCollapsibleState.None;
        item.iconPath = new vscode.ThemeIcon('info', new vscode.ThemeColor('charts.gray'));
        return [new ModuleTreeItem(item, 'placeholder')];
      }

      // Phase 1: If catalog not loaded yet, show loading state immediately and kick off background load.
      if (!this._catalogLoaded) {
        this._scheduleBackgroundCatalogLoad();
        const item = new vscode.TreeItem('Loading modules…');
        item.contextValue = 'placeholder';
        item.collapsibleState = vscode.TreeItemCollapsibleState.None;
        item.iconPath = new vscode.ThemeIcon('loading~spin');
        return [new ModuleTreeItem(item, 'placeholder')];
      }

      // Phase 2: catalog ready — show categories
      if (this._catalogLoadError) {
        const item = new vscode.TreeItem('Module catalog fallback active');
        item.contextValue = 'placeholder';
        item.description = 'Using bundled modules';
        item.tooltip = `Workspai could not load the live module catalog: ${this._catalogLoadError}`;
        item.collapsibleState = vscode.TreeItemCollapsibleState.None;
        item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow'));
        return [new ModuleTreeItem(item, 'placeholder'), ...this.getModuleCategories()];
      }

      return this.getModuleCategories();
    } else if (element.contextValue === 'category') {
      return this.getModulesInCategory(element.label as string);
    }

    return [];
  }

  /**
   * Background catalog load: runs subprocess / reads disk cache without blocking getChildren.
   * Fires a tree refresh once done.
   */
  private _scheduleBackgroundCatalogLoad(): void {
    if (this._catalogLoadInProgress) {
      return;
    }
    this._catalogLoadInProgress = true;

    this._refreshModulesCatalog()
      .then(() => {
        this._catalogLoadInProgress = false;
        this._onDidChangeTreeData.fire();
      })
      .catch(() => {
        this._catalogLoadInProgress = false;
        this._onDidChangeTreeData.fire(); // show fallback catalog
      });
  }

  private getModuleCategories(): ModuleTreeItem[] {
    const categories = Array.from(new Set(this._modulesCatalog.map((m) => m.category)));

    return categories.map((catKey) => {
      const cat = CATEGORY_INFO[catKey as keyof typeof CATEGORY_INFO] || {
        name: catKey,
        icon: '📦',
      };
      const item = new vscode.TreeItem(cat.name, vscode.TreeItemCollapsibleState.Collapsed);
      item.contextValue = 'category';

      // Map category names to icon names from CATEGORY_INFO
      const iconMap: Record<string, string> = {
        AI: 'sparkle',
        Authentication: 'shield',
        Billing: 'credit-card',
        Business: 'briefcase',
        Cache: 'zap',
        Communication: 'mail',
        Database: 'database',
        Essentials: 'tools',
        Observability: 'pulse',
        Security: 'lock',
        Tasks: 'checklist',
        Users: 'person',
      };

      item.iconPath = new vscode.ThemeIcon(iconMap[cat.name] || 'folder');
      return new ModuleTreeItem(item, 'category');
    });
  }

  private getModulesInCategory(category: string): ModuleTreeItem[] {
    const categoryKey = this.getCategoryKey(category);
    const modulesInCategory = this._modulesCatalog.filter((m) => m.category === categoryKey);

    return modulesInCategory.map((moduleData) => {
      // Check if installed by slug
      const installed = this._installedModules.get(moduleData.slug);
      const statusText = this.getModuleStatus(moduleData, installed);
      const hasUpdate = installed && this.isNewerVersion(moduleData.version, installed.version);

      const item = new vscode.TreeItem(moduleData.name);
      item.description = statusText;

      // Tooltip shows status or prompts for project selection
      if (!this._currentProjectPath) {
        item.tooltip = `${moduleData.description}\nv${moduleData.version}\n\n⚠️ Select a project first to install modules`;
      } else {
        item.tooltip = `${moduleData.description}\nv${moduleData.version}`;
      }

      item.contextValue = 'module';

      // Icon based on installation state
      let iconTheme =
        installed && !hasUpdate
          ? new vscode.ThemeColor('charts.green')
          : hasUpdate
            ? new vscode.ThemeColor('charts.orange')
            : new vscode.ThemeColor('charts.blue');

      // If no project selected, gray out the icon
      if (!this._currentProjectPath) {
        iconTheme = new vscode.ThemeColor('charts.gray');
      }

      item.iconPath = new vscode.ThemeIcon('package', iconTheme);

      // Create full module object for command
      const moduleObj: WorkspaiModule = {
        id: moduleData.id,
        name: moduleData.name,
        displayName: moduleData.name,
        version: moduleData.version,
        description: moduleData.description,
        category: moduleData.category,
        status: moduleData.status as 'stable' | 'beta' | 'experimental' | 'preview',
        tags: moduleData.tags || [],
        dependencies: moduleData.dependencies || [],
        installed: !!installed,
      };

      // Add slug to module object (used by addModule command)
      (moduleObj as any).slug = moduleData.slug;

      // Only add command if project is selected AND (not installed or has update available)
      if (this._currentProjectPath && (!installed || hasUpdate)) {
        // Normalize to webview ModuleData shape (adds display_name required by InstallModuleModal)
        const modalData = { ...moduleData, display_name: moduleData.name };
        item.command = {
          command: 'workspai.showModuleInstallModal',
          title: installed && hasUpdate ? 'Update Module' : 'Install Module',
          arguments: [modalData],
        };
      }

      return new ModuleTreeItem(item, 'module', moduleObj);
    });
  }

  private getCategoryKey(categoryName: string): string {
    const keyMap: Record<string, string> = {
      AI: 'ai',
      Authentication: 'auth',
      Billing: 'billing',
      Business: 'business',
      Cache: 'cache',
      Communication: 'communication',
      Database: 'database',
      Essentials: 'essentials',
      Observability: 'observability',
      Security: 'security',
      Tasks: 'tasks',
      Users: 'users',
    };
    return keyMap[categoryName] || categoryName.toLowerCase();
  }

  private getModuleStatus(
    moduleData: { id: string; name: string; version: string },
    installed?: InstalledModule
  ): string {
    if (!installed) {
      return '↓ Install';
    }

    if (this.isNewerVersion(moduleData.version, installed.version)) {
      return `⟳ Update (v${installed.version} → v${moduleData.version})`;
    }

    return `✓ Installed (v${installed.version})`;
  }

  private isNewerVersion(availableVersion: string, installedVersion: string): boolean {
    if (!installedVersion) {
      return false;
    }

    const available = availableVersion.split('.').map(Number);
    const installed = installedVersion.split('.').map(Number);

    for (let i = 0; i < Math.max(available.length, installed.length); i++) {
      const a = available[i] || 0;
      const b = installed[i] || 0;
      if (a > b) {
        return true;
      }
      if (a < b) {
        return false;
      }
    }
    return false;
  }

  private async _refreshModulesCatalog(forceRefresh = false): Promise<void> {
    try {
      const service = ModulesCatalogService.getInstance();
      let workspacePath: string | undefined;
      if (this._currentProjectPath) {
        workspacePath = path.dirname(this._currentProjectPath);
      }
      workspacePath = (await resolveCatalogWorkspaceRoot(workspacePath)) || workspacePath;

      const result = await service.getModulesCatalog(workspacePath, { forceRefresh });
      if (result.modules.length) {
        this._modulesCatalog = result.modules;
      } else {
        this._modulesCatalog = MODULES;
      }
      this._catalogLoaded = true;
      this._catalogLoadError = null;
    } catch (error) {
      console.error('[ModuleExplorer] Failed to load modules catalog:', error);
      this._modulesCatalog = MODULES;
      this._catalogLoaded = true;
      this._catalogLoadError = error instanceof Error ? error.message : String(error);
    }
  }

  private async _loadInstalledModules(): Promise<void> {
    if (!this._currentProjectPath) {
      this._installedModules.clear();
      return;
    }

    try {
      const primaryPath = path.join(this._currentProjectPath, 'registry.json');
      const legacyPath = path.join(this._currentProjectPath, '.rapidkit', 'registry.json');

      const primaryExists = await fs.pathExists(primaryPath);
      const registryPath = primaryExists ? primaryPath : legacyPath;

      if (await fs.pathExists(registryPath)) {
        const registry = await fs.readJson(registryPath);
        this._installedModules.clear();

        if (registry.installed_modules && Array.isArray(registry.installed_modules)) {
          registry.installed_modules.forEach((mod: InstalledModule) => {
            // Use slug as key directly (no mapping needed)
            this._installedModules.set(mod.slug, mod);
          });
        }
      }
    } catch (error) {
      console.error('[ModuleExplorer] Failed to load installed modules:', error);
      this._installedModules.clear();
    }
  }
}

export class ModuleTreeItem extends vscode.TreeItem {
  constructor(
    item: vscode.TreeItem,
    public readonly contextValue: string,
    public readonly module?: WorkspaiModule
  ) {
    super(item.label!, item.collapsibleState);
    this.description = item.description;
    this.tooltip = item.tooltip;
    this.iconPath = item.iconPath;
    this.command = item.command;
    this.contextValue = contextValue;
  }
}

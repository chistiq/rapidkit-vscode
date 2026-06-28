/**
 * Workspace Explorer TreeView Provider
 * Shows list of Workspai workspaces with actions
 */

import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import archiver from 'archiver';
import { WorkspaiWorkspace } from '../../types';
import { WorkspaceManager } from '../../core/workspaceManager';
import { CoreVersionService, CoreVersionInfo } from '../../core/coreVersionService';
import {
  downloadWorkspaceArchiveToTemp,
  buildWorkspaceArchiveManifest,
  persistWorkspaceShipHandoffManifest,
  extractWorkspaceArchiveToTemp,
  sanitizeWorkspaceArchiveName,
  shouldExcludeWorkspaceArchivePath,
  verifyWorkspaceArchive,
  WORKSPACE_ARCHIVE_MANIFEST_PATH,
} from '../../utils/workspaceArchive';
import { WelcomePanel } from '../panels/welcomePanel';

const WATCHER_REFRESH_DEBOUNCE_MS = 250;

export class WorkspaceExplorerProvider implements vscode.TreeDataProvider<WorkspaceTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<WorkspaceTreeItem | undefined | null | void> =
    new vscode.EventEmitter<WorkspaceTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<WorkspaceTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private workspaceManager = WorkspaceManager.getInstance();
  private versionService = CoreVersionService.getInstance();
  private workspaces: WorkspaiWorkspace[] = [];
  private selectedWorkspace: WorkspaiWorkspace | null = null;
  private fileWatcher?: vscode.FileSystemWatcher;
  private versionInfoCache: Map<string, CoreVersionInfo> = new Map();
  private profileCache: Map<string, string | undefined> = new Map();
  private moduleCountCache: Map<string, number> = new Map();
  private _backgroundLoadInProgress = false;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.loadWorkspaces();
    this.setupFileWatcher();
  }

  private setupFileWatcher(): void {
    // Watch for .rapidkit-workspace file changes
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      '**/.rapidkit-workspace',
      false,
      false,
      false
    );

    this.fileWatcher.onDidCreate(() => this.scheduleRefresh());
    this.fileWatcher.onDidChange(() => this.scheduleRefresh());
    this.fileWatcher.onDidDelete(() => this.scheduleRefresh());
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh();
    }, WATCHER_REFRESH_DEBOUNCE_MS);
  }

  dispose(): void {
    this.fileWatcher?.dispose();
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  async refresh(): Promise<void> {
    this.versionService.clearCache();
    this.versionInfoCache.clear();
    this.profileCache.clear();
    this.moduleCountCache.clear();
    await this.loadWorkspaces();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: WorkspaceTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: WorkspaceTreeItem): Promise<WorkspaceTreeItem[]> {
    if (!element) {
      // Phase 1: Return items immediately using only cached data — no blocking I/O.
      // The sidebar appears instantly; metadata fills in via background load.
      const items = this.workspaces.map((ws) => {
        const isActive = this.selectedWorkspace?.path === ws.path;

        // Use cached version info (undefined on first load — fine)
        const versionInfo = this.versionInfoCache.get(ws.path);
        const item = new WorkspaceTreeItem(ws, 'workspace', isActive, versionInfo);

        const descParts: string[] = [];
        const profile = this.profileCache.get(ws.path);
        if (profile) {
          descParts.push(`[${profile}]`);
        }

        const moduleCount = this.moduleCountCache.get(ws.path);
        if (moduleCount && moduleCount > 0) {
          descParts.push(`[${moduleCount} mod]`);
        }

        if (isActive) {
          descParts.push('Active');
        } else {
          const lastOpened = this.getLastOpenedTime(ws);
          if (lastOpened) {
            descParts.push(lastOpened);
          }
        }

        if (descParts.length > 0) {
          item.description = descParts.join(' • ');
        }

        return item;
      });

      // Phase 2: Kick off background metadata load for any uncached workspaces.
      // Once loaded, fires a full tree refresh so descriptions update automatically.
      this._scheduleBackgroundMetadataLoad();

      return items;
    }

    return [];
  }

  /**
   * Background load: fetches version info, profile, and module count for workspaces
   * that are not yet in cache.  Triggers a tree refresh when done.
   * Never blocks the initial `getChildren` call.
   */
  private _scheduleBackgroundMetadataLoad(): void {
    const pending = this.workspaces.filter(
      (ws) =>
        !this.versionInfoCache.has(ws.path) ||
        !this.profileCache.has(ws.path) ||
        !this.moduleCountCache.has(ws.path)
    );

    if (pending.length === 0 || this._backgroundLoadInProgress) {
      return;
    }

    this._backgroundLoadInProgress = true;

    Promise.all(
      pending.map(async (ws) => {
        const [versionInfo, profile, moduleCount] = await Promise.all([
          this.versionInfoCache.has(ws.path)
            ? Promise.resolve(this.versionInfoCache.get(ws.path)!)
            : this.versionService.getVersionInfo(ws.path),
          this.profileCache.has(ws.path)
            ? Promise.resolve(this.profileCache.get(ws.path))
            : this.getBootstrapProfile(ws.path),
          this.moduleCountCache.has(ws.path)
            ? Promise.resolve(this.moduleCountCache.get(ws.path)!)
            : this._countInstalledModules(ws.path),
        ]);
        this.versionInfoCache.set(ws.path, versionInfo);
        this.profileCache.set(ws.path, profile);
        this.moduleCountCache.set(ws.path, moduleCount);
      })
    )
      .then(() => {
        this._backgroundLoadInProgress = false;
        this._onDidChangeTreeData.fire();
      })
      .catch(() => {
        this._backgroundLoadInProgress = false;
        // Metadata is cosmetic — description badges missing is acceptable
      });
  }

  private async _countInstalledModules(workspacePath: string): Promise<number> {
    let total = 0;
    try {
      const entries = await fs.readdir(workspacePath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) {
          continue;
        }
        const projectPath = path.join(workspacePath, entry.name);
        for (const registryRelPath of ['registry.json', '.rapidkit/registry.json']) {
          const registryPath = path.join(projectPath, registryRelPath);
          if (await fs.pathExists(registryPath)) {
            try {
              const reg = await fs.readJSON(registryPath);
              total += (reg.installed_modules ?? []).length;
            } catch {
              /* skip */
            }
            break;
          }
        }
      }
    } catch {
      /* workspace not readable */
    }
    return total;
  }

  private async getBootstrapProfile(workspacePath: string): Promise<string | undefined> {
    if (this.profileCache.has(workspacePath)) {
      return this.profileCache.get(workspacePath);
    }

    let profile: string | undefined;
    try {
      const manifestPath = path.join(workspacePath, '.rapidkit', 'workspace.json');
      if (await fs.pathExists(manifestPath)) {
        const manifest = await fs.readJSON(manifestPath).catch(() => null);
        if (manifest?.profile && typeof manifest.profile === 'string') {
          profile = manifest.profile;
        }
      }
    } catch {
      profile = undefined;
    }

    this.profileCache.set(workspacePath, profile);
    return profile;
  }

  private getLastOpenedTime(workspace: WorkspaiWorkspace): string | undefined {
    const lastAccessed = (workspace as WorkspaiWorkspace & { lastAccessed?: number }).lastAccessed;
    if (!lastAccessed) {
      return undefined;
    }

    const now = Date.now();
    const diff = now - lastAccessed;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) {
      return 'Just now';
    } else if (minutes < 60) {
      return `${minutes}m ago`;
    } else if (hours < 24) {
      return `${hours}h ago`;
    } else if (days < 7) {
      return `${days}d ago`;
    } else {
      return undefined;
    }
  }

  private async loadWorkspaces(): Promise<void> {
    this.workspaces = await this.workspaceManager.loadWorkspaces();

    // Auto-select first workspace if none selected
    if (!this.selectedWorkspace && this.workspaces.length > 0) {
      this.selectedWorkspace = this.workspaces[0];
      vscode.commands.executeCommand('workspai.workspaceSelected', this.selectedWorkspace);
      // Set context key for toolbar buttons
      vscode.commands.executeCommand('setContext', 'workspai.workspaceSelected', true);
    } else if (this.workspaces.length === 0) {
      // No workspaces - clear context
      vscode.commands.executeCommand('setContext', 'workspai.workspaceSelected', false);
    }
  }

  public async addWorkspace(): Promise<void> {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select Workspace Folder',
      title: 'Add Workspai Workspace',
    });

    if (result && result[0]) {
      const workspace = await this.workspaceManager.addWorkspace(result[0].fsPath);
      if (workspace) {
        await this.refresh();
        const context = (globalThis as { extensionContext?: vscode.ExtensionContext })
          .extensionContext;
        if (context) {
          void WelcomePanel.notifyWorkspaceGovernanceChain(
            workspace.path,
            workspace.name,
            'add',
            context
          );
        }
        vscode.window.showInformationMessage(
          `Workspace "${workspace.name}" added successfully!`,
          'OK'
        );
      }
    }
  }

  public async importWorkspace(): Promise<WorkspaiWorkspace | undefined> {
    // Step 1: Ask user for import type
    const importType = await vscode.window.showQuickPick(
      [
        {
          label: '$(folder) Import Existing Workspace Folder',
          description: 'Register an existing Workspai workspace',
          detail: 'Browse and select a folder containing a Workspai workspace',
          value: 'folder',
        },
        {
          label: '$(archive) Import from Archive',
          description: 'Extract and import from .rapidkit-archive.zip',
          detail: 'Full workspace restore with all files',
          value: 'archive',
        },
        {
          label: '$(cloud-download) Import from Remote Archive',
          description: 'Download, verify, and import a workspace archive URL',
          detail: 'Remote handoff with integrity check before files are written',
          value: 'remote-archive',
        },
      ],
      {
        placeHolder: 'Choose import method',
        title: 'Import Workspace',
      }
    );

    if (!importType) {
      return undefined;
    }

    if (importType.value === 'folder') {
      return this.importFromFolder();
    }

    if (importType.value === 'remote-archive') {
      return this.importFromRemoteArchive();
    }

    return this.importFromArchive();
  }

  private async importFromFolder(): Promise<WorkspaiWorkspace | undefined> {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Import Workspace',
      title: 'Select Workspai Workspace Folder',
    });

    if (!result || !result[0]) {
      return undefined;
    }

    const workspacePath = result[0].fsPath;

    // Show progress while validating
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Validating Workspai workspace...',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 30 });

        // Try to add workspace (includes validation)
        const workspace = await this.workspaceManager.addWorkspace(workspacePath);

        progress.report({ increment: 70 });

        if (workspace) {
          // Successfully imported
          await this.refresh();
          vscode.window.showInformationMessage(
            `✅ Workspace "${workspace.name}" imported successfully!`,
            'OK'
          );
          return workspace;
        }

        // Not a valid Workspai workspace
        vscode.window.showErrorMessage(
          [
            'Invalid Workspai workspace',
            '',
            'The selected folder is not a governed workspace root.',
            '',
            'A valid workspace root must include one of:',
            '- .rapidkit/workspace.json',
            '- .rapidkit-workspace with a Workspai/RapidKit signature',
            '- legacy RapidKit workspace bootstrap files',
            '',
            'If this is a project folder, import or adopt it from an active workspace instead.',
          ].join('\n'),
          'OK'
        );
        return undefined;
      }
    );
  }

  private async importFromArchive(): Promise<WorkspaiWorkspace | undefined> {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: 'Import Archive',
      title: 'Select Workspai Archive',
      filters: {
        'Workspai Archive': ['zip'],
        'All Files': ['*'],
      },
    });

    if (!result || !result[0]) {
      return undefined;
    }

    const archivePath = result[0].fsPath;
    return this.importArchivePath(archivePath);
  }

  private async importFromRemoteArchive(): Promise<WorkspaiWorkspace | undefined> {
    const archiveUrl = await vscode.window.showInputBox({
      title: 'Import Remote Workspace Archive',
      prompt: 'Paste a HTTPS/HTTP .rapidkit-archive.zip URL',
      placeHolder: 'https://example.com/team-workspace.rapidkit-archive.zip',
      ignoreFocusOut: true,
      validateInput: (value) => {
        const trimmed = value.trim();
        if (!trimmed) {
          return 'Archive URL is required.';
        }
        try {
          const parsed = new URL(trimmed);
          return parsed.protocol === 'https:' || parsed.protocol === 'http:'
            ? undefined
            : 'Use a HTTPS or HTTP URL.';
        } catch {
          return 'Enter a valid URL.';
        }
      },
    });

    if (!archiveUrl) {
      return undefined;
    }

    let downloaded: Awaited<ReturnType<typeof downloadWorkspaceArchiveToTemp>> | undefined;
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Downloading workspace archive...',
          cancellable: false,
        },
        async (progress) => {
          progress.report({ increment: 20, message: 'Fetching archive...' });
          downloaded = await downloadWorkspaceArchiveToTemp({ url: archiveUrl.trim() });
          progress.report({ increment: 80, message: 'Download complete.' });
        }
      );

      if (!downloaded) {
        return undefined;
      }

      return this.importArchivePath(downloaded.archivePath, {
        sourceLabel: downloaded.finalUrl,
        cleanupPaths: [downloaded.tempRoot],
      });
    } catch (error) {
      if (downloaded?.tempRoot) {
        await fs.remove(downloaded.tempRoot).catch(() => undefined);
      }
      vscode.window.showErrorMessage(
        `Failed to import remote archive: ${error instanceof Error ? error.message : String(error)}`
      );
      return undefined;
    }
  }

  private async importArchivePath(
    archivePath: string,
    options?: { sourceLabel?: string; cleanupPaths?: string[] }
  ): Promise<WorkspaiWorkspace | undefined> {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Importing workspace from archive...',
        cancellable: false,
      },
      async (progress) => {
        try {
          progress.report({ increment: 10, message: 'Reading archive...' });

          const archiveName = sanitizeWorkspaceArchiveName(path.basename(archivePath));

          progress.report({ increment: 10, message: 'Selecting destination...' });

          // Ask user where to extract
          const destinationResult = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Destination',
            title: `Extract workspace "${archiveName}"`,
          });

          if (!destinationResult || !destinationResult[0]) {
            return undefined;
          }

          const extractPath = path.join(destinationResult[0].fsPath, archiveName);

          progress.report({ increment: 20, message: 'Verifying archive integrity...' });

          const verification = verifyWorkspaceArchive({ archivePath });
          if (verification.status !== 'passed') {
            const details = [
              verification.mismatches.length
                ? `mismatches: ${verification.mismatches.map((item) => item.path).join(', ')}`
                : '',
              verification.missingArchiveEntries.length
                ? `missing entries: ${verification.missingArchiveEntries.join(', ')}`
                : '',
              verification.extraArchiveEntries.length
                ? `unexpected entries: ${verification.extraArchiveEntries.join(', ')}`
                : '',
              verification.missingChecksumFiles.length
                ? `missing checksums: ${verification.missingChecksumFiles.join(', ')}`
                : '',
            ]
              .filter(Boolean)
              .join('; ');
            throw new Error(
              `Archive integrity verification failed${details ? ` (${details})` : ''}.`
            );
          }

          const verificationAction = await vscode.window.showInformationMessage(
            `Archive verified: ${verification.verifiedFiles}/${verification.fileCount} files. Import workspace${options?.sourceLabel ? ` from ${options.sourceLabel}` : ''}?`,
            { modal: true },
            'Import Workspace',
            'Cancel'
          );
          if (verificationAction !== 'Import Workspace') {
            return undefined;
          }

          progress.report({ increment: 10, message: 'Extracting files...' });

          const extracted = await extractWorkspaceArchiveToTemp({ archivePath });

          progress.report({ increment: 30, message: 'Validating workspace...' });

          if (await fs.pathExists(extractPath)) {
            const overwrite = await vscode.window.showWarningMessage(
              `Folder "${archiveName}" already exists. Replace it with the validated archive import?`,
              { modal: true },
              'Replace Workspace',
              'Cancel'
            );
            if (overwrite !== 'Replace Workspace') {
              await fs.remove(extracted.tempRoot).catch(() => undefined);
              return undefined;
            }
            await fs.remove(extractPath);
          }

          await fs.move(extracted.workspaceRoot, extractPath, {
            overwrite: false,
          });
          await fs.remove(extracted.tempRoot).catch(() => undefined);

          progress.report({ increment: 10, message: 'Registering workspace...' });

          // Register workspace
          const workspace = await this.workspaceManager.addWorkspace(extractPath);

          progress.report({ increment: 10, message: 'Done!' });

          if (workspace) {
            await this.refresh();
            const action = await vscode.window.showInformationMessage(
              `✅ Workspace "${workspace.name}" imported successfully from archive!`,
              'Open Workspace',
              'OK'
            );

            if (action === 'Open Workspace') {
              await vscode.commands.executeCommand(
                'vscode.openFolder',
                vscode.Uri.file(extractPath)
              );
            }
            return workspace;
          }

          return undefined;
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to import archive: ${error instanceof Error ? error.message : String(error)}`
          );
          return undefined;
        } finally {
          for (const cleanupPath of options?.cleanupPaths || []) {
            await fs.remove(cleanupPath).catch(() => undefined);
          }
        }
      }
    );
  }

  public async removeWorkspace(workspace: WorkspaiWorkspace): Promise<void> {
    const answer = await vscode.window.showWarningMessage(
      `Remove workspace "${workspace.name}" from the list?\n(Files will not be deleted)`,
      'Remove',
      'Cancel'
    );

    if (answer === 'Remove') {
      await this.workspaceManager.removeWorkspace(workspace.path);
      await this.refresh();
      vscode.window.showInformationMessage(`Workspace "${workspace.name}" removed`, 'OK');
    }
  }

  public async exportWorkspace(workspace: WorkspaiWorkspace): Promise<void> {
    try {
      await this.exportFullWorkspace(workspace);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to export workspace: ${error}`);
    }
  }

  private async exportFullWorkspace(workspace: WorkspaiWorkspace): Promise<void> {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Creating archive for "${workspace.name}"...`,
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 10, message: 'Preparing workspace archive...' });

        // Prompt for save location first
        const saveUri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(
            path.join(os.homedir(), 'Downloads', `${workspace.name}.rapidkit-archive.zip`)
          ),
          filters: {
            'Workspai Archive': ['zip'],
            'All Files': ['*'],
          },
          title: 'Export Full Workspace',
        });

        if (!saveUri) {
          return;
        }

        progress.report({ increment: 10, message: 'Creating ZIP archive...' });

        // Create archive
        const archive = archiver('zip', {
          zlib: { level: 9 }, // Maximum compression
        });

        const output = fs.createWriteStream(saveUri.fsPath);

        // Pipe archive to file
        archive.pipe(output);

        progress.report({ increment: 20, message: 'Adding workspace files...' });

        const manifest = await buildWorkspaceArchiveManifest({
          workspacePath: workspace.path,
          workspaceName: workspace.name,
        });

        // Add workspace directory with exclusions
        archive.directory(
          workspace.path,
          false,
          (entry: { name: string } | false): { name: string } | false => {
            if (shouldExcludeWorkspaceArchivePath(entry && entry.name ? entry.name : '')) {
              return false;
            }
            return entry;
          }
        );
        archive.append(`${JSON.stringify(manifest, null, 2)}\n`, {
          name: WORKSPACE_ARCHIVE_MANIFEST_PATH,
        });

        progress.report({ increment: 30, message: 'Compressing files...' });

        // Finalize archive
        await archive.finalize();

        // Wait for stream to finish
        await new Promise<void>((resolve, reject) => {
          output.on('close', () => resolve());
          output.on('error', reject);
        });

        progress.report({ increment: 20, message: 'Recording ship handoff manifest...' });

        await persistWorkspaceShipHandoffManifest({
          workspacePath: workspace.path,
          workspaceName: workspace.name,
          manifest,
          exportArchivePath: saveUri.fsPath,
        });

        progress.report({ increment: 10, message: 'Done!' });

        // Get archive stats
        const stats = await fs.stat(saveUri.fsPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

        // Success message with actions
        const action = await vscode.window.showInformationMessage(
          `✅ Workspace "${workspace.name}" exported successfully! (${sizeMB} MB)`,
          'Open Folder',
          'OK'
        );

        if (action === 'Open Folder') {
          const folderPath = path.dirname(saveUri.fsPath);
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(folderPath));
        }
      }
    );
  }

  public async autoDiscover(): Promise<void> {
    const message = vscode.window.setStatusBarMessage(
      '$(search) Discovering Workspai workspaces...'
    );

    try {
      const discovered = await this.workspaceManager.autoDiscover();
      message.dispose();

      if (discovered.length > 0) {
        vscode.window.showInformationMessage(
          `Found ${discovered.length} Workspai workspace(s)`,
          'OK'
        );
        await this.refresh();
      } else {
        vscode.window.showInformationMessage('No new Workspai workspaces found', 'OK');
      }
    } catch (error) {
      message.dispose();
      vscode.window.showErrorMessage(`Error discovering workspaces: ${error}`);
    }
  }

  public async selectWorkspace(workspace: WorkspaiWorkspace): Promise<void> {
    this.selectedWorkspace = workspace;

    // Update last accessed time
    await this.workspaceManager.touchWorkspace(workspace.path);

    this._onDidChangeTreeData.fire();

    // Set context for toolbar buttons
    await vscode.commands.executeCommand('setContext', 'workspai.workspaceSelected', true);

    // Fire event for other views to update
    await vscode.commands.executeCommand('workspai.workspaceSelected', workspace);
  }

  public getSelectedWorkspace(): WorkspaiWorkspace | null {
    return this.selectedWorkspace;
  }

  public getWorkspaceByPath(path: string): WorkspaiWorkspace | undefined {
    return this.workspaces.find((ws) => ws.path === path);
  }

  public async quickSwitch(): Promise<void> {
    if (this.workspaces.length === 0) {
      const choice = await vscode.window.showInformationMessage(
        'No workspaces registered yet. Use the default Workspai workspace or create one first.',
        'Use Default Workspace',
        'Create Workspace'
      );
      if (choice === 'Use Default Workspace') {
        const { ensureManagedDefaultWorkspace } =
          await import('../../core/ensureManagedDefaultWorkspace.js');
        const ensured = await ensureManagedDefaultWorkspace();
        await this.refresh();
        const workspace = this.getWorkspaceByPath(ensured.path);
        if (workspace) {
          await this.selectWorkspace(workspace);
        } else {
          await vscode.commands.executeCommand('workspai.selectWorkspace', ensured.path);
        }
        return;
      }
      if (choice === 'Create Workspace') {
        await vscode.commands.executeCommand('workspai.createWorkspace');
      }
      return;
    }

    type WsPick = vscode.QuickPickItem & { ws: WorkspaiWorkspace };
    const picks: WsPick[] = this.workspaces.map((ws) => {
      const isActive = this.selectedWorkspace?.path === ws.path;
      return {
        label: `$(${isActive ? 'folder-opened' : 'folder-library'}) ${ws.name}`,
        description: isActive ? '🟢 Active' : ws.path,
        detail: isActive ? ws.path : undefined,
        ws,
      };
    });

    const selected = await vscode.window.showQuickPick<WsPick>(picks, {
      placeHolder: 'Switch workspace…',
      title: 'Workspai — Quick Switch',
      matchOnDescription: true,
    });

    if (selected) {
      await this.selectWorkspace(selected.ws);
    }
  }
}

export class WorkspaceTreeItem extends vscode.TreeItem {
  constructor(
    public readonly workspace: WorkspaiWorkspace | null,
    public readonly contextValue: string,
    isActive: boolean = false,
    versionInfo?: CoreVersionInfo,
    customLabel?: string
  ) {
    const projectCount = workspace?.projects?.length || 0;
    const label = customLabel || workspace?.name || '';
    const labelWithCount = projectCount > 0 ? `${label} (${projectCount})` : label;

    super(labelWithCount, vscode.TreeItemCollapsibleState.None);

    if (contextValue === 'workspace' && workspace) {
      const projectText = projectCount === 1 ? '1 project' : `${projectCount} projects`;

      // Enhanced tooltip with version info
      let tooltipText = `${workspace.name}\n${workspace.path}\nMode: ${workspace.mode}\n${projectText}`;

      if (versionInfo) {
        const versionService = CoreVersionService.getInstance();
        const statusMsg = versionService.getStatusMessage(versionInfo);
        const locationText = versionInfo.location ? ` (${versionInfo.location})` : '';
        tooltipText += `\n\n🩺 ${statusMsg}${locationText}`;
        if (versionInfo.status === 'update-available') {
          tooltipText += `\n\n💡 Click doctor icon to upgrade`;
        }
      }

      this.tooltip = new vscode.MarkdownString(tooltipText.replace(/\n/g, '  \n'));

      // Icon based on active status
      this.iconPath = new vscode.ThemeIcon(
        workspace.mode === 'demo' ? 'rocket' : isActive ? 'folder-opened' : 'folder-library',
        new vscode.ThemeColor(isActive ? 'charts.green' : 'charts.purple')
      );

      // Make workspace selectable
      this.command = {
        command: 'workspai.selectWorkspace',
        title: 'Select Workspace',
        arguments: [workspace.path], // Pass only the path, not the entire object
      };
    }

    this.contextValue = contextValue;
  }
}

/**
 * RapidKit Core Version Service
 * Checks installed version and available updates
 */

import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import path from 'node:path';
import { run } from '../utils/exec';
import { Logger } from '../utils/logger';
import { getWorkspaceVenvRapidkitCandidates } from '../utils/platformCapabilities';
import { resolveWorkspaceCoreRequirement } from './workspaceCoreRequirement';

export type VersionStatus =
  | 'up-to-date'
  | 'update-available'
  | 'deprecated'
  | 'not-required'
  | 'install-required'
  | 'repair-required'
  | 'error'
  | 'not-installed';

export interface CoreVersionInfo {
  installed?: string;
  latest?: string;
  status: VersionStatus;
  location?: string; // 'global' | 'workspace'
  path?: string;
}

export class CoreVersionService {
  private static instance: CoreVersionService | null = null;
  private logger: Logger;
  private cache: Map<string, { info: CoreVersionInfo; timestamp: number }> = new Map();
  private cacheTtl = 30 * 60 * 1000; // 30 minutes — Python package version changes rarely
  private latestVersionCache: { version?: string; timestamp: number } | null = null;

  private constructor() {
    this.logger = Logger.getInstance();
  }

  static getInstance(): CoreVersionService {
    if (!CoreVersionService.instance) {
      CoreVersionService.instance = new CoreVersionService();
    }
    return CoreVersionService.instance;
  }

  /**
   * Get Core version info for a workspace
   */
  async getVersionInfo(workspacePath: string): Promise<CoreVersionInfo> {
    // Check cache
    const cached = this.cache.get(workspacePath);
    if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
      return cached.info;
    }

    const info = await this._fetchVersionInfo(workspacePath);

    // Cache result
    this.cache.set(workspacePath, {
      info,
      timestamp: Date.now(),
    });

    return info;
  }

  /**
   * Clear cache for a workspace
   */
  clearCache(workspacePath?: string): void {
    if (workspacePath) {
      this.cache.delete(workspacePath);
    } else {
      this.cache.clear();
      this.latestVersionCache = null;
    }
  }

  private async _fetchVersionInfo(workspacePath: string): Promise<CoreVersionInfo> {
    const requirement = await resolveWorkspaceCoreRequirement(workspacePath);
    if (!requirement.required) {
      return { status: 'not-required' };
    }

    const installedInfo = await this._getInstalledVersion(workspacePath);

    if (installedInfo.brokenWorkspaceEnvironment) {
      return {
        status: 'repair-required',
        latest: await this._getLatestVersionCached().catch(() => undefined),
        location: 'workspace',
        path: installedInfo.path,
      };
    }
    if (installedInfo.missingWorkspaceEnvironment) {
      return {
        status: 'install-required',
        latest: await this._getLatestVersionCached().catch(() => undefined),
        location: 'workspace',
        path: path.join(workspacePath, '.venv'),
      };
    }

    if (!installedInfo.version) {
      return {
        status: 'not-installed',
      };
    }

    // Get latest version (optional, can be disabled for performance)
    const latestVersion = await this._getLatestVersionCached().catch(() => undefined);

    // Compare versions
    let status: VersionStatus = 'up-to-date';
    if (latestVersion && this._isNewerVersion(latestVersion, installedInfo.version)) {
      status = 'update-available';
    }

    return {
      installed: installedInfo.version,
      latest: latestVersion,
      status,
      location: installedInfo.location,
      path: installedInfo.path,
    };
  }

  private async _getInstalledVersion(workspacePath: string): Promise<{
    version?: string;
    location?: string;
    path?: string;
    brokenWorkspaceEnvironment?: boolean;
    missingWorkspaceEnvironment?: boolean;
  }> {
    // Priority 1: Workspace .venv (cross-platform)
    const venvCandidates = getWorkspaceVenvRapidkitCandidates(workspacePath);
    for (const venvPath of venvCandidates) {
      if (!(await fs.pathExists(venvPath))) {
        continue;
      }

      try {
        const { stdout } = await run(venvPath, ['--version'], {
          cwd: workspacePath,
          stdio: 'pipe',
        });
        const match = stdout.match(/v?([\d.]+(?:rc\d+)?(?:a\d+)?(?:b\d+)?)/);
        if (match) {
          return {
            version: match[1],
            location: 'workspace',
            path: venvPath,
          };
        }
      } catch {
        // Continue to next candidate
      }
    }

    const workspaceVenv = path.join(workspacePath, '.venv');
    if (await fs.pathExists(workspaceVenv)) {
      return {
        location: 'workspace',
        path: workspaceVenv,
        brokenWorkspaceEnvironment: true,
      };
    }

    return {
      location: 'workspace',
      path: workspaceVenv,
      missingWorkspaceEnvironment: true,
    };
  }

  private async _getLatestVersionCached(): Promise<string | undefined> {
    if (this.latestVersionCache && Date.now() - this.latestVersionCache.timestamp < this.cacheTtl) {
      return this.latestVersionCache.version;
    }

    const version = await this._getLatestVersion().catch(() => undefined);
    this.latestVersionCache = {
      version,
      timestamp: Date.now(),
    };
    return version;
  }

  private async _getLatestVersion(): Promise<string | undefined> {
    try {
      // Check PyPI for latest version
      const { stdout } = await run('pip', ['index', 'versions', 'rapidkit-core'], {
        stdio: 'pipe',
        timeout: 5000,
      });

      // Parse output: "rapidkit-core (0.2.3)"
      const match = stdout.match(/rapidkit-core\s+\(([^)]+)\)/);
      if (match) {
        return match[1];
      }
    } catch (error) {
      this.logger.debug('Failed to check latest version:', error);
    }

    return undefined;
  }

  private _isNewerVersion(latest: string, installed: string): boolean {
    const parseVersion = (v: string) => {
      const match = v.match(/^(\d+)\.(\d+)\.(\d+)/);
      if (!match) {
        return null;
      }
      return {
        major: parseInt(match[1]),
        minor: parseInt(match[2]),
        patch: parseInt(match[3]),
      };
    };

    const latestParsed = parseVersion(latest);
    const installedParsed = parseVersion(installed);

    if (!latestParsed || !installedParsed) {
      return false;
    }

    if (latestParsed.major > installedParsed.major) {
      return true;
    }
    if (latestParsed.major < installedParsed.major) {
      return false;
    }

    if (latestParsed.minor > installedParsed.minor) {
      return true;
    }
    if (latestParsed.minor < installedParsed.minor) {
      return false;
    }

    return latestParsed.patch > installedParsed.patch;
  }

  /**
   * Get color-coded icon for version status
   */
  getStatusIcon(status: VersionStatus): vscode.ThemeIcon {
    switch (status) {
      case 'up-to-date':
        return new vscode.ThemeIcon('pulse', new vscode.ThemeColor('charts.green'));
      case 'update-available':
        return new vscode.ThemeIcon('pulse', new vscode.ThemeColor('charts.yellow'));
      case 'deprecated':
        return new vscode.ThemeIcon('pulse', new vscode.ThemeColor('charts.orange'));
      case 'repair-required':
        return new vscode.ThemeIcon('tools', new vscode.ThemeColor('charts.orange'));
      case 'install-required':
        return new vscode.ThemeIcon('cloud-download', new vscode.ThemeColor('charts.yellow'));
      case 'not-required':
        return new vscode.ThemeIcon('circle-outline');
      case 'error':
      case 'not-installed':
        return new vscode.ThemeIcon('pulse', new vscode.ThemeColor('charts.red'));
      default:
        return new vscode.ThemeIcon('pulse');
    }
  }

  /**
   * Get human-readable status message
   */
  getStatusMessage(info: CoreVersionInfo): string {
    switch (info.status) {
      case 'up-to-date':
        return `✅ Up to date (v${info.installed})`;
      case 'update-available':
        return `🆕 Update available: v${info.latest} (installed: v${info.installed})`;
      case 'deprecated':
        return `⚠️ Version deprecated (v${info.installed})`;
      case 'repair-required':
        return '⚠️ Workspace Python environment needs repair';
      case 'install-required':
        return 'RapidKit Core is not installed in this workspace';
      case 'not-required':
        return 'RapidKit Core is optional for this workspace';
      case 'not-installed':
        return '❌ RapidKit Core not installed';
      case 'error':
        return '❌ Error checking version';
    }
  }
}

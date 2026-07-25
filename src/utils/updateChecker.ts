/**
 * Update checker for the Workspai npm CLI.
 * Checks for available updates and notifies users
 */

import * as vscode from 'vscode';
import { Logger } from './logger';
import { runShellCommandInTerminal } from './terminalExecutor';
import { run } from './exec';
import { buildNpxRapidkitArgs } from './platformCapabilities';

interface VersionInfo {
  current: string | null;
  latest: string | null;
  updateAvailable: boolean;
}

const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const LAST_CHECK_KEY = 'workspai.lastUpdateCheck';
const DISMISSED_VERSION_KEY = 'workspai.dismissedVersion';

/**
 * Get the current Workspai npm version.
 */
export async function getCurrentVersion(): Promise<string | null> {
  const logger = Logger.getInstance();

  try {
    const result = await run('npx', buildNpxRapidkitArgs(['--version']), {
      timeout: 10000,
      reject: false,
    });

    if (result.exitCode === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  } catch (error) {
    logger.debug('Failed to get current Workspai version', error);
  }

  return null;
}

/**
 * Get the latest Workspai npm version from the registry.
 */
export async function getLatestVersion(): Promise<string | null> {
  const logger = Logger.getInstance();

  try {
    const result = await run('npm', ['view', 'workspai', 'version'], {
      timeout: 10000,
      reject: false,
    });

    if (result.exitCode === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  } catch (error) {
    logger.debug('Failed to get latest Workspai version', error);
  }

  return null;
}

/**
 * Compare two semver versions
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 > part2) {
      return 1;
    }
    if (part1 < part2) {
      return -1;
    }
  }

  return 0;
}

/**
 * Check if update is available
 */
export async function checkForUpdates(): Promise<VersionInfo> {
  const logger = Logger.getInstance();

  const current = await getCurrentVersion();
  const latest = await getLatestVersion();

  if (!current || !latest) {
    return {
      current,
      latest,
      updateAvailable: false,
    };
  }

  const updateAvailable = compareVersions(latest, current) > 0;

  logger.debug(`Version check: current=${current}, latest=${latest}, update=${updateAvailable}`);

  return {
    current,
    latest,
    updateAvailable,
  };
}

/**
 * Should we check for updates now?
 */
function shouldCheckForUpdates(context: vscode.ExtensionContext): boolean {
  const lastCheck = context.globalState.get<number>(LAST_CHECK_KEY, 0);
  const now = Date.now();

  return now - lastCheck > UPDATE_CHECK_INTERVAL;
}

/**
 * Show update notification to user
 */
async function showUpdateNotification(
  context: vscode.ExtensionContext,
  versionInfo: VersionInfo
): Promise<void> {
  const logger = Logger.getInstance();

  // Check if user dismissed this version
  const dismissedVersion = context.globalState.get<string>(DISMISSED_VERSION_KEY);
  if (dismissedVersion === versionInfo.latest) {
    logger.debug(`Update notification dismissed for version ${versionInfo.latest}`);
    return;
  }

  const message = `Workspai CLI update available: v${versionInfo.latest} (current: v${versionInfo.current})`;
  const updateAction = '📦 Update Now';
  const releaseNotesAction = '📋 Release Notes';
  const dismissAction = '⏭️ Skip This Version';

  const selected = await vscode.window.showInformationMessage(
    message,
    { modal: false },
    updateAction,
    releaseNotesAction,
    dismissAction
  );

  if (selected === updateAction) {
    // Open terminal and run update command
    runShellCommandInTerminal({
      name: 'Workspai CLI Update',
      command: 'npm',
      args: ['install', '-g', 'workspai'],
    });

    logger.info('User initiated Workspai npm update');
  } else if (selected === releaseNotesAction) {
    // Open release notes
    const url = `https://github.com/chistiq/workspai/releases/tag/v${versionInfo.latest}`;
    vscode.env.openExternal(vscode.Uri.parse(url));

    logger.info('User viewed release notes');
  } else if (selected === dismissAction) {
    // Save dismissed version
    await context.globalState.update(DISMISSED_VERSION_KEY, versionInfo.latest);

    logger.info(`User dismissed update notification for v${versionInfo.latest}`);
  }
}

/**
 * Check for updates and show notification if available
 * Respects check interval and user preferences
 */
export async function checkAndNotifyUpdates(
  context: vscode.ExtensionContext,
  force = false
): Promise<void> {
  const logger = Logger.getInstance();

  // Check if we should run the check
  if (!force && !shouldCheckForUpdates(context)) {
    logger.debug('Skipping update check (too soon)');
    return;
  }

  try {
    const versionInfo = await checkForUpdates();

    // Update last check timestamp
    await context.globalState.update(LAST_CHECK_KEY, Date.now());

    if (versionInfo.updateAvailable) {
      await showUpdateNotification(context, versionInfo);
    } else {
      logger.debug('No updates available');
    }
  } catch (error) {
    logger.error('Update check failed', error);
  }
}

/**
 * Force check for updates (triggered by command)
 */
export async function forceCheckForUpdates(context: vscode.ExtensionContext): Promise<void> {
  const logger = Logger.getInstance();

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Checking Workspai CLI updates...',
      cancellable: false,
    },
    async () => {
      const versionInfo = await checkForUpdates();

      if (versionInfo.updateAvailable) {
        await showUpdateNotification(context, versionInfo);
      } else if (versionInfo.current && versionInfo.latest) {
        vscode.window.showInformationMessage(
          `Workspai CLI is up to date (v${versionInfo.current})`
        );
      } else {
        vscode.window.showWarningMessage(
          'Could not check Workspai CLI updates. The workspai npm package may not be installed.'
        );
      }

      logger.info('Force update check completed', versionInfo);
    }
  );
}

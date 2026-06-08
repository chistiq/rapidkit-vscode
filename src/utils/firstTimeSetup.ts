/**
 * First-time Setup Detection and Guidance
 * Helps users understand what's happening during initial setup
 */

import * as vscode from 'vscode';
import { run } from './exec';
import { Logger } from './logger';
import { buildNpxRapidkitArgs } from './platformCapabilities';

/**
 * Check if this is user's first time using Workspai extension
 */
export async function isFirstTimeSetup(): Promise<boolean> {
  const logger = Logger.getInstance();

  // Check if rapidkit npm is available (cached by npx)
  try {
    const result = await run('npx', buildNpxRapidkitArgs(['--version']), {
      timeout: 3000,
      stdio: 'pipe',
    });

    const isCached = result.exitCode === 0 && result.stdout?.trim();
    logger.debug(`RapidKit npm cached: ${isCached}`);
    return !isCached;
  } catch {
    logger.debug('RapidKit npm not cached, first-time setup');
    return true;
  }
}

/**
 * Show first-time setup welcome message
 */
export async function showFirstTimeSetupMessage(): Promise<boolean> {
  const config = vscode.workspace.getConfiguration('workspai');
  const dontShowAgain = config.get<boolean>('dontShowFirstTimeSetup', false);

  if (dontShowAgain) {
    return false;
  }

  const message =
    '👋 Welcome to Workspai!\n\n' +
    'First-time setup will:\n' +
    '  • Download RapidKit CLI (~5-10 seconds)\n' +
    '  • Create a Python virtual environment\n' +
    '  • Install RapidKit Core engine\n\n' +
    'This may take 30-60 seconds. Ready to continue?';

  const continueAction = 'Continue';
  const learnMoreAction = 'Learn More';
  const dontShowAction = "Don't Show Again";

  const selected = await vscode.window.showInformationMessage(
    message,
    { modal: true },
    continueAction,
    learnMoreAction,
    dontShowAction
  );

  if (selected === learnMoreAction) {
    await vscode.env.openExternal(
      vscode.Uri.parse('https://www.workspai.com/docs/getting-started')
    );
    return false;
  }

  if (selected === dontShowAction) {
    await config.update('dontShowFirstTimeSetup', true, vscode.ConfigurationTarget.Global);
  }

  return selected === continueAction;
}

/**
 * Show detailed progress for first-time setup
 */
export function getFirstTimeProgressMessage(
  stage: 'download' | 'venv' | 'core' | 'validate'
): string {
  const messages = {
    download: 'Downloading RapidKit CLI from npm (first time only)...',
    venv: 'Creating Python virtual environment...',
    core: 'Installing RapidKit Core engine (this may take a minute)...',
    validate: 'Validating workspace setup...',
  };

  return messages[stage] || 'Setting up...';
}

/**
 * Estimate first-time setup duration based on system
 */
export async function estimateFirstTimeSetupDuration(): Promise<string> {
  // Check network speed (roughly)
  const hasGoodConnection = await checkNetworkSpeed();

  if (hasGoodConnection) {
    return '30-45 seconds';
  }

  return '45-90 seconds';
}

/**
 * Quick network speed check
 */
async function checkNetworkSpeed(): Promise<boolean> {
  try {
    const start = Date.now();
    const response = await fetch('https://registry.npmjs.org/rapidkit/latest', {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000),
    });
    const duration = Date.now() - start;

    // If response comes back in < 500ms, assume good connection
    return response.ok && duration < 500;
  } catch {
    return false; // Assume slower connection or network issue
  }
}

/**
 * Show completion message after first-time setup
 */
export async function showFirstTimeSetupComplete(): Promise<void> {
  const message =
    '✅ Workspai setup complete!\n\n' +
    "You're now ready to:\n" +
    '  • Create FastAPI & NestJS projects\n' +
    '  • Add modules (auth, database, caching, etc.)\n' +
    '  • Use the interactive TUI\n\n' +
    'Get started by creating a workspace or project!';

  const createWorkspaceAction = 'Create Workspace';
  const viewDocsAction = 'View Docs';

  const selected = await vscode.window.showInformationMessage(
    message,
    { modal: false },
    createWorkspaceAction,
    viewDocsAction
  );

  if (selected === createWorkspaceAction) {
    await vscode.commands.executeCommand('workspai.createWorkspace');
  } else if (selected === viewDocsAction) {
    await vscode.env.openExternal(vscode.Uri.parse('https://www.workspai.com/docs'));
  }
}

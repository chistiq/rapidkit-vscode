/**
 * Workspace Validation Utility
 * Validates that RapidKit workspaces are properly configured
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { run } from './exec';
import { Logger } from './logger';

export interface WorkspaceValidationResult {
  valid: boolean;
  hasVenv: boolean;
  hasRapidkitCore: boolean;
  venvPath?: string;
  pythonPath?: string;
  rapidkitVersion?: string;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a RapidKit workspace
 * Checks for:
 * - .venv directory (or Poetry venv)
 * - Python in venv
 * - rapidkit-core installed in venv
 */
export async function validateWorkspace(workspacePath: string): Promise<WorkspaceValidationResult> {
  const logger = Logger.getInstance();
  const result: WorkspaceValidationResult = {
    valid: false,
    hasVenv: false,
    hasRapidkitCore: false,
    errors: [],
    warnings: [],
  };

  try {
    // Check if workspace directory exists
    if (!(await fs.pathExists(workspacePath))) {
      result.errors.push(`Workspace directory does not exist: ${workspacePath}`);
      return result;
    }

    // Check for .venv directory
    const venvPath = path.join(workspacePath, '.venv');
    const hasLocalVenv = await fs.pathExists(venvPath);

    if (!hasLocalVenv) {
      // Check for Poetry venv
      const poetryCheck = await checkPoetryVenv(workspacePath);
      if (poetryCheck.found) {
        result.hasVenv = true;
        result.venvPath = poetryCheck.path;
        result.pythonPath = poetryCheck.pythonPath;
        logger.debug(`Found Poetry venv: ${poetryCheck.path}`);
      } else {
        result.errors.push('Workspace does not have a virtual environment (.venv not found)');
        result.warnings.push(
          'Run "npx rapidkit" in the workspace directory to create a proper environment'
        );
        return result;
      }
    } else {
      result.hasVenv = true;
      result.venvPath = venvPath;

      // Find Python in venv
      const pythonPath = getPythonPathInVenv(venvPath);
      result.pythonPath = pythonPath;

      if (!(await fs.pathExists(pythonPath))) {
        result.errors.push(`Python not found in venv: ${pythonPath}`);
        return result;
      }
    }

    // Check if rapidkit-core is installed
    if (result.pythonPath) {
      try {
        const checkRapidkit = await run(
          result.pythonPath,
          ['-c', 'import rapidkit; print(rapidkit.__version__)'],
          { timeout: 3000, stdio: 'pipe', cwd: workspacePath }
        );

        if (checkRapidkit.exitCode === 0) {
          result.hasRapidkitCore = true;
          result.rapidkitVersion = checkRapidkit.stdout?.trim();
          logger.debug(`RapidKit Core version: ${result.rapidkitVersion}`);
        } else {
          result.errors.push('rapidkit-core is not installed in the workspace virtual environment');
          result.warnings.push('Reinstall the workspace or run: pip install rapidkit-core');
        }
      } catch (error) {
        result.errors.push(
          `Failed to check rapidkit-core: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Workspace is valid if it has venv and rapidkit-core
    result.valid = result.hasVenv && result.hasRapidkitCore;

    return result;
  } catch (error) {
    logger.error('Workspace validation error:', error);
    result.errors.push(
      `Validation failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return result;
  }
}

/**
 * Check for Poetry-managed virtual environment
 */
async function checkPoetryVenv(workspacePath: string): Promise<{
  found: boolean;
  path?: string;
  pythonPath?: string;
}> {
  try {
    const poetryCheck = await run('poetry', ['env', 'info', '--path'], {
      cwd: workspacePath,
      timeout: 3000,
      stdio: 'pipe',
    });

    if (poetryCheck.exitCode === 0 && poetryCheck.stdout?.trim()) {
      const venvPath = poetryCheck.stdout.trim();
      const pythonPath = getPythonPathInVenv(venvPath);

      if (await fs.pathExists(pythonPath)) {
        return {
          found: true,
          path: venvPath,
          pythonPath,
        };
      }
    }
  } catch {
    // Poetry not available or command failed
  }

  return { found: false };
}

/**
 * Get Python executable path in a venv
 */
function getPythonPathInVenv(venvPath: string): string {
  const isWindows = process.platform === 'win32';
  return isWindows
    ? path.join(venvPath, 'Scripts', 'python.exe')
    : path.join(venvPath, 'bin', 'python');
}

/**
 * Get a user-friendly error message for workspace validation failures
 */
export function getWorkspaceValidationErrorMessage(result: WorkspaceValidationResult): string {
  if (result.valid) {
    return 'Workspace is valid';
  }

  let message = '⚠️ Workspace validation failed:\n\n';

  if (result.errors.length > 0) {
    message += 'Errors:\n';
    result.errors.forEach((error) => {
      message += `  • ${error}\n`;
    });
  }

  if (result.warnings.length > 0) {
    message += '\nRecommendations:\n';
    result.warnings.forEach((warning) => {
      message += `  • ${warning}\n`;
    });
  }

  return message.trim();
}

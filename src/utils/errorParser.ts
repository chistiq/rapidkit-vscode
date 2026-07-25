/**
 * Error Parser - Extract useful information from Workspai CLI errors
 */

import { Logger } from './logger';

const logger = Logger.getInstance();

export interface ParsedError {
  type: 'core_missing' | 'python_missing' | 'network' | 'permission' | 'unknown';
  title: string;
  message: string;
  suggestion: string;
  canRetry: boolean;
  canFallback: boolean;
}

/**
 * Parse error output from Workspai CLI.
 */
export function parseRapidKitError(stderr: string, stdout: string = ''): ParsedError {
  const fullOutput = `${stderr}\n${stdout}`.toLowerCase();

  // Check for RapidKit Core not available
  if (
    fullOutput.includes('rapidkit_not_available') ||
    fullOutput.includes('not yet available on pypi') ||
    fullOutput.includes('python package is not yet available')
  ) {
    return {
      type: 'core_missing',
      title: 'RapidKit Python Core Not Available',
      message: 'The RapidKit Python package is not yet published to PyPI.',
      suggestion:
        '• Use demo mode to create standalone projects\n' +
        '• Install from source (advanced users)\n' +
        '• Wait for official PyPI release',
      canRetry: false,
      canFallback: true,
    };
  }

  // Check for Python not found
  if (
    fullOutput.includes('python not found') ||
    fullOutput.includes('python3 not found') ||
    fullOutput.includes('python 3.10+ not found')
  ) {
    return {
      type: 'python_missing',
      title: 'Python Not Found',
      message: 'Python 3.10+ is required but not found on your system.',
      suggestion:
        '• Install Python 3.10 or newer\n' +
        '• Ensure Python is in your PATH\n' +
        '• Restart VS Code after installation',
      canRetry: true,
      canFallback: true,
    };
  }

  // Check for network errors
  if (
    fullOutput.includes('enotfound') ||
    fullOutput.includes('getaddrinfo') ||
    fullOutput.includes('network') ||
    fullOutput.includes('timeout')
  ) {
    return {
      type: 'network',
      title: 'Network Error',
      message: 'Failed to download required packages.',
      suggestion:
        '• Check your internet connection\n' +
        "• Check if you're behind a proxy\n" +
        '• Try again in a few moments',
      canRetry: true,
      canFallback: false,
    };
  }

  // Check for directory-already-exists (idempotent scenario, not a real error)
  // Note: this is kept as informational — callers should check workspace existence
  // themselves before calling parseRapidKitError in idempotent flows.
  if (fullOutput.includes('already exists') && fullOutput.includes('director')) {
    return {
      type: 'unknown',
      title: 'Workspace Already Exists',
      message: extractErrorMessage(stderr, stdout) || 'A workspace with this name already exists.',
      suggestion:
        '• Choose a different workspace name\n' +
        '• Or open the existing workspace from the sidebar',
      canRetry: false,
      canFallback: false,
    };
  }

  // Check for permission errors
  if (
    fullOutput.includes('eacces') ||
    fullOutput.includes('permission denied') ||
    fullOutput.includes('eperm')
  ) {
    return {
      type: 'permission',
      title: 'Permission Denied',
      message: 'Insufficient permissions to create files/directories.',
      suggestion:
        '• Choose a different location\n' +
        '• Check folder permissions\n' +
        '• Run VS Code with appropriate permissions',
      canRetry: true,
      canFallback: false,
    };
  }

  // Unknown error
  return {
    type: 'unknown',
    title: 'Operation Failed',
    message: extractErrorMessage(stderr, stdout),
    suggestion:
      '• Check the Output panel for details\n' +
      '• Run "Workspai: Run System Check"\n' +
      '• Visit documentation for troubleshooting',
    canRetry: true,
    canFallback: false,
  };
}

/**
 * Extract clean error message from stderr/stdout
 */
function extractErrorMessage(stderr: string, stdout: string): string {
  // Remove ANSI color codes
  // eslint-disable-next-line no-control-regex
  const clean = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, '');

  const cleanStderr = clean(stderr);
  const cleanStdout = clean(stdout);

  // Look for common error patterns
  const patterns = [
    /❌\s*Error:\s*(.+?)(?:\n|$)/i,
    /Error:\s*(.+?)(?:\n|$)/i,
    /ERROR:\s*(.+?)(?:\n|$)/i,
    /✖\s*(.+?)(?:\n|$)/i,
  ];

  for (const pattern of patterns) {
    const match = cleanStderr.match(pattern) || cleanStdout.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // Fall back to first non-empty line of stderr
  const lines = cleanStderr.split('\n').filter((line) => line.trim());
  if (lines.length > 0) {
    return lines[0].trim();
  }

  return 'An unknown error occurred';
}

/**
 * Format error for display in VS Code
 */
export function formatErrorMessage(parsed: ParsedError): string {
  return `${parsed.title}\n\n${parsed.message}\n\n${parsed.suggestion}`;
}

/**
 * Log detailed error information
 */
export function logDetailedError(stderr: string, stdout: string, exitCode: number) {
  logger.error('Command failed with exit code:', exitCode);

  if (stderr) {
    logger.error('STDERR:', stderr);
  }

  if (stdout) {
    logger.info('STDOUT:', stdout);
  }
}

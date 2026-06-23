/**
 * Doctor Command
 * Run system checks for Workspai requirements
 */

import * as vscode from 'vscode';
import type { IncomingMessage } from 'http';
import * as https from 'https';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { SystemCheckResult } from '../types';
import { getPoetryVersion } from '../utils/poetryHelper';
import { checkPythonEnvironment } from '../utils/pythonChecker';
import { run } from '../utils/exec';
import { WorkspaiCLI } from '../core/rapidkitCLI';
import {
  formatRapidkitNpmVersionLabel,
  normalizeRapidkitNpmVersion,
  sanitizeToolCheckMessage,
} from '../utils/cliOutputSanitizer';

const FETCH_JSON_TIMEOUT_MS = 8000;
const MAX_FETCH_REDIRECTS = 3;

// Helper function to fetch JSON from HTTPS URL (version checking)
const fetchJson = <T = unknown>(
  url: string,
  options?: { redirectCount?: number; initialHost?: string }
): Promise<T> => {
  return new Promise((resolve, reject) => {
    const redirectCount = options?.redirectCount ?? 0;
    if (redirectCount > MAX_FETCH_REDIRECTS) {
      reject(new Error('Too many redirects while fetching version metadata'));
      return;
    }

    const requestUrl = new URL(url);
    const initialHost = options?.initialHost ?? requestUrl.hostname;
    if (requestUrl.hostname !== initialHost) {
      reject(new Error(`Refusing cross-host redirect to ${requestUrl.hostname}`));
      return;
    }

    const req = https.get(requestUrl.toString(), (res: IncomingMessage) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const location = res.headers.location;
        if (typeof location !== 'string' || !location.trim()) {
          reject(new Error('Redirect response missing location header'));
          return;
        }

        const redirectUrl = new URL(location, requestUrl).toString();
        fetchJson<T>(redirectUrl, {
          redirectCount: redirectCount + 1,
          initialHost,
        })
          .then(resolve)
          .catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk: string) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data) as T);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.setTimeout(FETCH_JSON_TIMEOUT_MS, () => {
      req.destroy(new Error(`Request timed out after ${FETCH_JSON_TIMEOUT_MS}ms`));
    });

    req.on('error', reject);
  });
};

// Helper to parse version
const parseVersion = (version: string) => {
  if (!version) {
    return null;
  }
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)((?:rc|alpha|beta)\d*)?$/);
  if (!match) {
    return null;
  }
  return {
    major: parseInt(match[1]),
    minor: parseInt(match[2]),
    patch: parseInt(match[3]),
    prerelease: match[4] || null,
  };
};

// Helper to compare semantic versions
const isNewerVersion = (current: string, latest: string): boolean => {
  if (!current || !latest) {
    return false;
  }
  try {
    const curr = parseVersion(current);
    const last = parseVersion(latest);

    if (!curr || !last) {
      return false;
    }

    // Compare major.minor.patch
    if (last.major > curr.major) {
      return true;
    }
    if (last.major < curr.major) {
      return false;
    }

    if (last.minor > curr.minor) {
      return true;
    }
    if (last.minor < curr.minor) {
      return false;
    }

    if (last.patch > curr.patch) {
      return true;
    }
    if (last.patch < curr.patch) {
      return false;
    }

    // Same version, check prerelease
    if (!curr.prerelease && last.prerelease) {
      return false;
    }
    if (curr.prerelease && !last.prerelease) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
};

async function runSystemChecks(
  progress: vscode.Progress<{ message?: string; increment?: number }>
) {
  const rapidkitCli = new WorkspaiCLI();

  progress.report({ increment: 0, message: 'Checking Python...' });

  const result: SystemCheckResult = {
    passed: true,
    checks: [],
  };

  // Check Python environment comprehensively
  const pythonEnv = await checkPythonEnvironment();

  if (pythonEnv.available) {
    result.checks.push({
      name: 'Python',
      status: 'pass',
      message: `${pythonEnv.version} (${pythonEnv.command})`,
    });

    // Check venv support
    if (pythonEnv.venvSupport) {
      result.checks.push({
        name: 'Python venv',
        status: 'pass',
        message: 'Virtual environment support available',
      });
    } else {
      result.passed = false;
      result.checks.push({
        name: 'Python venv',
        status: 'fail',
        message: pythonEnv.recommendation || 'Virtual environment support missing',
      });
    }

    // Check RapidKit core with version checking
    if (pythonEnv.rapidkitCoreInstalled) {
      let coreMessage = `Installed in system Python`;

      // Try to get version from rapidkit-core
      try {
        const pythonCmd =
          pythonEnv.command || (process.platform === 'win32' ? 'python' : 'python3');
        const coreVerResult = await run(
          pythonCmd,
          ['-c', 'import rapidkit_core; print(rapidkit_core.__version__)'],
          { timeout: 5000, stdio: 'pipe' }
        );
        const coreVersion = coreVerResult.stdout.trim();

        if (coreVersion) {
          coreMessage = `v${coreVersion}`;

          // Check for newer version
          try {
            const data = await fetchJson<{ info?: { version?: string } }>(
              'https://pypi.org/pypi/rapidkit-core/json'
            );
            if (data.info && data.info.version) {
              const latestVersion = data.info.version;
              if (isNewerVersion(coreVersion, latestVersion)) {
                coreMessage += ` → v${latestVersion} available`;
              }
            }
          } catch {
            // Silently fail version check
          }
        }
      } catch {
        // Silently fail version detection
      }

      result.checks.push({
        name: 'RapidKit core',
        status: 'pass',
        message: coreMessage,
      });
    } else {
      result.passed = false;
      result.checks.push({
        name: 'RapidKit core',
        status: 'fail',
        message: 'Not installed - required for Python projects',
      });
    }
  } else {
    result.passed = false;
    result.checks.push({
      name: 'Python',
      status: 'fail',
      message: pythonEnv.recommendation || 'Python 3.10+ not found',
    });
  }

  progress.report({ increment: 20, message: 'Checking Node.js...' });

  // Check Node.js
  try {
    const nodeResult = await run('node', ['--version'], { stdio: 'pipe', timeout: 5000 });
    result.checks.push({
      name: 'Node.js',
      status: 'pass',
      message: nodeResult.stdout,
    });
  } catch {
    result.checks.push({
      name: 'Node.js',
      status: 'warning',
      message: 'Node.js not found (optional for demo mode)',
    });
  }

  progress.report({ increment: 40, message: 'Checking Poetry...' });

  // Check Poetry with enhanced detection
  const poetryVersion = await getPoetryVersion();
  if (poetryVersion) {
    result.checks.push({
      name: 'Poetry',
      status: 'pass',
      message: `Poetry version ${poetryVersion}`,
    });
  } else {
    result.checks.push({
      name: 'Poetry',
      status: 'warning',
      message: 'Poetry not found (optional, but recommended for FastAPI projects)',
    });
  }

  progress.report({ increment: 60, message: 'Checking Git...' });

  // Check Git
  try {
    const gitResult = await run('git', ['--version'], { stdio: 'pipe', timeout: 5000 });
    result.checks.push({
      name: 'Git',
      status: 'pass',
      message: gitResult.stdout,
    });
  } catch {
    result.checks.push({
      name: 'Git',
      status: 'warning',
      message: 'Git not found (optional)',
    });
  }

  progress.report({ increment: 85, message: 'Checking RapidKit npm...' });

  // Check RapidKit npm package - distinguish global vs npx cache
  try {
    let isGlobal = false;
    let version: string | null = null;

    try {
      const direct = await run('rapidkit', ['--version'], { stdio: 'pipe', timeout: 5000 });
      version = normalizeRapidkitNpmVersion(direct.stdout);
      isGlobal = !!version;
    } catch {
      // Not globally available from extension host PATH.
    }

    if (!version) {
      version = await rapidkitCli.getVersion();
    }

    if (!version) {
      throw new Error('RapidKit npm not found');
    }

    let npmMessage = formatRapidkitNpmVersionLabel(version);
    if (isGlobal) {
      npmMessage += ' (globally installed)';
    } else {
      npmMessage += ' (npx cache only)';
    }

    // Check for newer version
    try {
      const data = await fetchJson<{ version?: string }>(
        'https://registry.npmjs.org/rapidkit/latest'
      );
      const latestVersion = data.version;
      if (typeof latestVersion === 'string' && isNewerVersion(version, latestVersion)) {
        npmMessage += ` → v${latestVersion} available`;
      }
    } catch {
      // Silently fail version check
    }

    result.checks.push({
      name: 'RapidKit npm',
      status: isGlobal ? 'pass' : 'fail',
      message: npmMessage + (isGlobal ? '' : ' - global installation recommended'),
    });
  } catch {
    result.passed = false;
    result.checks.push({
      name: 'RapidKit npm',
      status: 'fail',
      message: 'Not found - install globally or ensure npx can resolve rapidkit',
    });
  }

  progress.report({ increment: 85, message: 'Checking Go...' });

  // Check Go
  try {
    const goResult = await run('go', ['version'], { stdio: 'pipe', timeout: 5000 });
    const goVersion = goResult.stdout.trim().replace(/^go version /, '');
    result.checks.push({
      name: 'Go',
      status: 'pass',
      message: goVersion,
    });
  } catch {
    result.checks.push({
      name: 'Go',
      status: 'warning',
      message: 'Not found (required for gofiber.standard / gogin.standard projects)',
    });
  }

  progress.report({ increment: 90, message: 'Checking Java...' });

  // Check Java — try JAVA_HOME first, then common candidates
  const javaHome = process.env['JAVA_HOME'];
  const javaExecutable = javaHome ? path.join(javaHome, 'bin', 'java') : 'java';
  try {
    const javaResult = await run(javaExecutable, ['-version'], { stdio: 'pipe', timeout: 6000 });
    // java -version writes to stderr
    const raw = (javaResult.stderr || javaResult.stdout || '').trim();
    const javaVersion = raw.split('\n')[0] ?? raw;
    result.checks.push({
      name: 'Java (JDK)',
      status: 'pass',
      message: javaVersion,
    });
  } catch {
    result.checks.push({
      name: 'Java (JDK)',
      status: 'warning',
      message: 'Not found (required for springboot.standard projects — install JDK 17+)',
    });
  }

  progress.report({ increment: 94, message: 'Checking Maven...' });

  // Check Maven
  try {
    const mvnResult = await run('mvn', ['--version'], { stdio: 'pipe', timeout: 6000 });
    const mvnRaw = sanitizeToolCheckMessage(
      (mvnResult.stdout || mvnResult.stderr || '').trim().split('\n')[0] ?? ''
    );
    const mvnVersion = mvnRaw.replace(/^Apache Maven /, '').trim();
    if (mvnResult.exitCode !== 0 || !mvnVersion) {
      throw new Error('mvn not found or returned empty version');
    }
    result.checks.push({
      name: 'Maven',
      status: 'pass',
      message: mvnVersion,
    });
  } catch {
    result.checks.push({
      name: 'Maven',
      status: 'warning',
      message: 'Not found (optional — Spring Boot projects include Maven wrapper mvnw)',
    });
  }

  progress.report({ increment: 97, message: 'Checking Gradle...' });

  // Check Gradle
  try {
    const gradleResult = await run('gradle', ['--version'], {
      stdio: 'pipe',
      timeout: 8000,
    });
    const gradleOut = gradleResult.stdout || gradleResult.stderr || '';
    const gradleLine = gradleOut.split('\n').find((l) => l.trim().startsWith('Gradle'));
    const gradleVersion = sanitizeToolCheckMessage(gradleLine?.trim() ?? '');
    if (gradleResult.exitCode !== 0 || !gradleVersion) {
      throw new Error('gradle not found or returned empty version');
    }
    result.checks.push({
      name: 'Gradle',
      status: 'pass',
      message: gradleVersion,
    });
  } catch {
    result.checks.push({
      name: 'Gradle',
      status: 'warning',
      message: 'Not found (optional — Spring Boot projects include Gradle wrapper gradlew)',
    });
  }

  progress.report({ increment: 99, message: 'Checking .NET SDK...' });

  // Check .NET SDK — required for dotnet.webapi.clean scaffold/runtime
  const dotnetRoot = process.env.DOTNET_ROOT?.trim();
  const dotnetCandidates = [
    ...(dotnetRoot
      ? [path.join(dotnetRoot, process.platform === 'win32' ? 'dotnet.exe' : 'dotnet')]
      : []),
    ...(process.platform === 'win32' ? ['C:\\Program Files\\dotnet\\dotnet.exe'] : []),
    '/usr/bin/dotnet',
    '/usr/local/bin/dotnet',
    'dotnet',
  ];
  let dotnetCheckMessage: string | null = null;
  for (const dotnetExecutable of dotnetCandidates) {
    try {
      const dotnetResult = await run(dotnetExecutable, ['--version'], {
        stdio: 'pipe',
        timeout: 6000,
      });
      const dotnetVersion = sanitizeToolCheckMessage(
        (dotnetResult.stdout || dotnetResult.stderr || '').trim().split('\n')[0] ?? ''
      );
      if (dotnetResult.exitCode === 0 && dotnetVersion) {
        dotnetCheckMessage = dotnetVersion;
        break;
      }
    } catch {
      // try next candidate
    }
  }
  if (dotnetCheckMessage) {
    result.checks.push({
      name: '.NET SDK',
      status: 'pass',
      message: dotnetCheckMessage,
    });
  } else {
    result.checks.push({
      name: '.NET SDK',
      status: 'warning',
      message: 'Not found (required for dotnet.webapi.clean projects — install .NET SDK 8+)',
    });
  }

  progress.report({ increment: 100, message: 'Done!' });

  // Show results
  const lines = ['# Workspai System Check\n'];

  for (const check of result.checks) {
    const icon = check.status === 'pass' ? '✅' : check.status === 'warning' ? '⚠' : '❌';
    // Simplify message by removing extra details
    let message = sanitizeToolCheckMessage(check.message);
    // Remove parenthetical details like "(globally installed)", "(python3)", etc.
    message = message.replace(/\s*\([^)]*\)$/g, '');
    lines.push(`${icon} ${check.name}: ${message}`);
  }

  lines.push(
    '\n---\n',
    result.passed ? '✅ All required checks passed!' : '⚠ Some checks failed. See details above.'
  );

  // Show in output channel
  const output = vscode.window.createOutputChannel('Workspai Doctor');
  output.clear();
  output.appendLine(lines.join('\n'));
  output.show();

  return result;
}

export async function doctorCommand() {
  const logger = Logger.getInstance();
  logger.info('Doctor command initiated');

  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Running system checks',
        cancellable: false,
      },
      runSystemChecks
    );

    // Show notification
    if (result.passed) {
      const viewReportAction = '📊 View Full Report';
      const selected = await vscode.window.showInformationMessage(
        '✅ System check passed!',
        { modal: false },
        viewReportAction
      );

      if (selected === viewReportAction) {
        await vscode.commands.executeCommand('workspai.doctor');
      }
    } else {
      const fixIssuesAction = '🔧 View Issues';
      const selected = await vscode.window.showWarningMessage(
        '⚠️ Some system checks failed. See output for details.',
        { modal: false },
        fixIssuesAction
      );

      if (selected === fixIssuesAction) {
        await vscode.commands.executeCommand('workspai.doctor');
      }
    }
  } catch (error) {
    logger.error('Error in doctorCommand', error);
    vscode.window.showErrorMessage(
      `System check failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

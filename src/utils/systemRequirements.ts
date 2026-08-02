/**
 * System Requirements Checker & Auto-Installer
 * Validates Python 3.10+, venv, Node.js, and Git with auto-fix capabilities
 */

import * as vscode from 'vscode';
import { run } from './exec';
import { Logger } from './logger';
import { checkPythonEnvironment, getPythonErrorMessage } from './pythonChecker';
import { appendCommandsToTerminal, runCommandsInTerminal } from './terminalExecutor';

export interface SystemRequirementsResult {
  allMet: boolean;
  python: {
    available: boolean;
    meetsMinimumVersion: boolean; // Python 3.10+
    venvSupport: boolean;
    version?: string;
    canAutoFix: boolean;
    autoFixCommand?: string;
  };
  nodejs: {
    available: boolean;
    version?: string;
  };
  git: {
    available: boolean;
    version?: string;
  };
  java: {
    available: boolean;
    version?: string;
    meetsMinimumVersion: boolean; // JDK 17+
    resolvedPath?: string;
  };
  maven: {
    available: boolean;
    version?: string;
  };
  gradle: {
    available: boolean;
    version?: string;
  };
  dotnet: {
    available: boolean;
    version?: string;
    meetsMinimumVersion: boolean; // SDK 8+
  };
}

/**
 * Check all system requirements
 */
export async function checkSystemRequirements(): Promise<SystemRequirementsResult> {
  const logger = Logger.getInstance();

  const result: SystemRequirementsResult = {
    allMet: false,
    python: {
      available: false,
      meetsMinimumVersion: false,
      venvSupport: false,
      canAutoFix: false,
    },
    nodejs: {
      available: false,
    },
    git: {
      available: false,
    },
    java: {
      available: false,
      meetsMinimumVersion: false,
    },
    maven: {
      available: false,
    },
    gradle: {
      available: false,
    },
    dotnet: {
      available: false,
      meetsMinimumVersion: false,
    },
  };

  // Check Python
  const pythonEnv = await checkPythonEnvironment();
  result.python.available = pythonEnv.available;
  result.python.meetsMinimumVersion = pythonEnv.meetsMinimumVersion;
  result.python.venvSupport = pythonEnv.venvSupport;
  result.python.version = pythonEnv.version;

  // Check if we can auto-fix missing venv (on supported platforms)
  if (pythonEnv.available && !pythonEnv.venvSupport) {
    const autoFixInfo = await checkVenvAutoFix(pythonEnv.version || '');
    result.python.canAutoFix = autoFixInfo.canFix;
    result.python.autoFixCommand = autoFixInfo.command;
  }

  // Check Node.js (optional)
  try {
    const nodeResult = await run('node', ['--version'], { timeout: 2000, stdio: 'pipe' });
    if (nodeResult.exitCode === 0) {
      result.nodejs.available = true;
      result.nodejs.version = nodeResult.stdout?.trim();
    }
  } catch {
    logger.debug('Node.js not found (optional)');
  }

  // Check Git (optional)
  try {
    const gitResult = await run('git', ['--version'], { timeout: 2000, stdio: 'pipe' });
    if (gitResult.exitCode === 0) {
      result.git.available = true;
      result.git.version = gitResult.stdout?.trim();
    }
  } catch {
    logger.debug('Git not found (optional)');
  }

  // Check Java (optional — required for java-only/polyglot workspaces)
  {
    const os = await import('os');
    const path = await import('path');
    const fs = await import('fs');
    const javaHome = process.env.JAVA_HOME?.trim();
    const sdkmanBin = path.join(
      os.homedir(),
      '.sdkman',
      'candidates',
      'java',
      'current',
      'bin',
      'java'
    );
    const candidates: string[] = [
      ...(javaHome
        ? [path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')]
        : []),
      sdkmanBin,
      '/usr/lib/jvm/temurin-21/bin/java',
      '/usr/lib/jvm/java-21-openjdk-amd64/bin/java',
      '/usr/lib/jvm/java-17-openjdk-amd64/bin/java',
      'java',
    ];

    for (const cmd of candidates) {
      try {
        const javaResult = await run(cmd, ['-version'], { timeout: 3000, stdio: 'pipe' });
        if (javaResult.exitCode === 0) {
          const rawOutput = `${javaResult.stdout || ''}\n${javaResult.stderr || ''}`;
          const versionMatch = rawOutput.match(/version\s+"([^"]+)"/i);
          const runtimeMatch = rawOutput.match(/(?:openjdk|java)\s+(\d+(?:[._]\d+)?)/i);
          const versionStr = versionMatch?.[1] || runtimeMatch?.[1] || null;
          const major = versionStr ? parseInt(versionStr.split('.')[0], 10) : 0;
          result.java.available = true;
          result.java.version = versionStr || undefined;
          result.java.meetsMinimumVersion = !isNaN(major) && major >= 17;
          result.java.resolvedPath = cmd === 'java' ? cmd : fs.existsSync(cmd) ? cmd : 'java';
          break;
        }
      } catch {
        // try next candidate
      }
    }
    if (!result.java.available) {
      logger.debug('Java not found (optional — required for Spring Boot)');
    }
  }

  // Check Maven (optional)
  {
    const path = await import('path');
    const mavenHome = (process.env.MAVEN_HOME || process.env.M2_HOME)?.trim();
    const candidates = [
      ...(mavenHome
        ? [path.join(mavenHome, 'bin', process.platform === 'win32' ? 'mvn.cmd' : 'mvn')]
        : []),
      'mvn',
    ];
    for (const cmd of candidates) {
      try {
        const mvnResult = await run(cmd, ['--version'], { timeout: 3000, stdio: 'pipe' });
        if (mvnResult.exitCode === 0) {
          result.maven.available = true;
          result.maven.version = mvnResult.stdout?.trim().split('\n')[0];
          break;
        }
      } catch {
        // try next
      }
    }
    if (!result.maven.available) {
      logger.debug('Maven not found (optional)');
    }
  }

  // Check Gradle (optional)
  {
    const path = await import('path');
    const gradleHome = process.env.GRADLE_HOME?.trim();
    const candidates = [
      ...(gradleHome
        ? [path.join(gradleHome, 'bin', process.platform === 'win32' ? 'gradle.bat' : 'gradle')]
        : []),
      'gradle',
    ];
    for (const cmd of candidates) {
      try {
        const gradleResult = await run(cmd, ['--version'], { timeout: 5000, stdio: 'pipe' });
        if (gradleResult.exitCode === 0) {
          result.gradle.available = true;
          const gradleLine = gradleResult.stdout
            ?.split('\n')
            .find((l: string) => l.includes('Gradle'));
          result.gradle.version = gradleLine?.trim() || gradleResult.stdout?.trim().split('\n')[0];
          break;
        }
      } catch {
        // try next
      }
    }
    if (!result.gradle.available) {
      logger.debug('Gradle not found (optional)');
    }
  }

  // Check .NET SDK (optional — required for dotnet-only/polyglot workspaces)
  {
    const path = await import('path');
    const dotnetRoot = process.env.DOTNET_ROOT?.trim();
    const candidates = [
      ...(dotnetRoot
        ? [path.join(dotnetRoot, process.platform === 'win32' ? 'dotnet.exe' : 'dotnet')]
        : []),
      ...(process.platform === 'win32' ? ['C:\\Program Files\\dotnet\\dotnet.exe'] : []),
      '/usr/bin/dotnet',
      '/usr/local/bin/dotnet',
      'dotnet',
    ];
    for (const cmd of candidates) {
      try {
        const dotnetResult = await run(cmd, ['--version'], { timeout: 3000, stdio: 'pipe' });
        if (dotnetResult.exitCode === 0) {
          const versionStr = dotnetResult.stdout?.trim().split('\n')[0]?.trim();
          const major = versionStr ? parseInt(versionStr.split('.')[0], 10) : 0;
          result.dotnet.available = true;
          result.dotnet.version = versionStr || undefined;
          result.dotnet.meetsMinimumVersion = !isNaN(major) && major >= 8;
          break;
        }
      } catch {
        // try next
      }
    }
    if (!result.dotnet.available) {
      logger.debug('.NET SDK not found (optional — required for ASP.NET Core)');
    }
  }

  // All requirements met?
  result.allMet =
    result.python.available && result.python.meetsMinimumVersion && result.python.venvSupport;

  return result;
}

/**
 * Check if we can auto-fix missing venv support
 */
async function checkVenvAutoFix(pythonVersion: string): Promise<{
  canFix: boolean;
  command?: string;
}> {
  const platform = process.platform;

  // Extract Python version number (e.g., "Python 3.13.5" -> "3.13")
  const versionMatch = pythonVersion.match(/(\d+\.\d+)/);
  const version = versionMatch ? versionMatch[1] : '3';

  // On Linux with apt (Debian/Ubuntu), we can suggest auto-install
  if (platform === 'linux') {
    // Check if apt is available
    try {
      await run('which', ['apt'], { timeout: 1000, stdio: 'pipe' });
      return {
        canFix: true,
        command: `sudo apt update && sudo apt install -y python${version}-venv`,
      };
    } catch {
      // apt not available
    }
  }

  return { canFix: false };
}

/**
 * Attempt to auto-fix missing venv support (with user permission)
 */
export async function autoFixVenvSupport(command: string): Promise<boolean> {
  const logger = Logger.getInstance();

  const terminal = runCommandsInTerminal({
    name: 'Workspai: Install Python venv',
    commands: [`echo "Installing Python venv support..."`, `echo "Command: ${command}"`, command],
  });

  // Wait a bit for installation
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Verify installation
  const verification = await checkPythonEnvironment();
  const success = verification.venvSupport;

  if (success) {
    appendCommandsToTerminal(terminal, [
      `echo "\n✅ Python venv support installed successfully!"`,
      `echo "You can close this terminal now."`,
    ]);
    logger.info('Auto-fix venv support: SUCCESS');
  } else {
    appendCommandsToTerminal(terminal, [
      `echo "\n⚠️ Installation may require manual verification."`,
      `echo "Please restart VS Code after installation completes."`,
    ]);
    logger.warn('Auto-fix venv support: verification failed');
  }

  return success;
}

/**
 * Show smart error message with auto-fix option if available
 */
export async function showSystemRequirementsError(
  requirements: SystemRequirementsResult
): Promise<'retry' | 'install' | 'cancel'> {
  if (!requirements.python.available) {
    // Python not found - can't auto-fix
    const message =
      '❌ Python not found on your system.\n\n' +
      'Workspai project creation requires Python 3.10+ through RapidKit Core.\n\n' +
      'Please install Python from:\n' +
      '  • Ubuntu/Debian: sudo apt install python3.13\n' +
      '  • macOS: brew install python@3.13\n' +
      '  • Windows: python.org/downloads\n\n' +
      'After installing Python, restart VS Code.';

    const setupGuideAction = 'View Setup Guide';
    const selected = await vscode.window.showErrorMessage(
      message,
      { modal: true },
      setupGuideAction
    );

    if (selected === setupGuideAction) {
      await vscode.env.openExternal(
        vscode.Uri.parse('https://www.workspai.dev/learn/create-adopt')
      );
    }

    return 'cancel';
  }

  if (!requirements.python.meetsMinimumVersion) {
    // Python version too old
    const message =
      `❌ Python ${requirements.python.version} is too old.\n\n` +
      'Workspai requires Python 3.10 or higher for RapidKit Core compatibility.\n\n' +
      'Please upgrade Python:\n' +
      '  • Ubuntu/Debian: sudo apt install python3.13\n' +
      '  • macOS: brew install python@3.13\n' +
      '  • Windows: python.org/downloads\n\n' +
      'After upgrading, restart VS Code.';

    const setupGuideAction = 'View Setup Guide';
    const selected = await vscode.window.showErrorMessage(
      message,
      { modal: true },
      setupGuideAction
    );

    if (selected === setupGuideAction) {
      await vscode.env.openExternal(
        vscode.Uri.parse('https://www.workspai.dev/learn/create-adopt')
      );
    }

    return 'cancel';
  }

  if (!requirements.python.venvSupport) {
    // Python found but venv missing

    if (requirements.python.canAutoFix && requirements.python.autoFixCommand) {
      // We can auto-fix!
      const message =
        '⚠️ Python venv support is missing.\n\n' +
        'Workspai can automatically install it for you.\n\n' +
        `Command: ${requirements.python.autoFixCommand}\n\n` +
        'This requires sudo password and will take ~10 seconds.';

      const autoInstallAction = '🔧 Auto Install';
      const manualAction = 'Install Manually';
      const cancelAction = 'Cancel';

      const selected = await vscode.window.showWarningMessage(
        message,
        { modal: true },
        autoInstallAction,
        manualAction,
        cancelAction
      );

      if (selected === autoInstallAction) {
        return 'install';
      } else if (selected === manualAction) {
        await vscode.env.openExternal(
          vscode.Uri.parse('https://www.workspai.dev/learn/create-adopt')
        );
        return 'cancel';
      }

      return 'cancel';
    } else {
      // Can't auto-fix
      const pythonEnv = await checkPythonEnvironment();
      const message = getPythonErrorMessage(pythonEnv);

      const setupGuideAction = 'View Setup Guide';
      const retryAction = 'Retry';

      const selected = await vscode.window.showErrorMessage(
        message,
        { modal: true },
        setupGuideAction,
        retryAction
      );

      if (selected === setupGuideAction) {
        await vscode.env.openExternal(
          vscode.Uri.parse('https://www.workspai.dev/learn/create-adopt')
        );
      } else if (selected === retryAction) {
        return 'retry';
      }

      return 'cancel';
    }
  }

  return 'retry';
}

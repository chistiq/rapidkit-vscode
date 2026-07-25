import * as vscode from 'vscode';
import * as path from 'path';
import { isFrontendScaffoldFramework } from '../core/scaffoldKits';
import { detectPythonVirtualenv } from '../utils/poetryHelper';
import { getSelectedProjectPath } from '../core/selectedProject';
import { WelcomePanel } from '../ui/panels/welcomePanel';
import { Logger } from '../utils/logger';
import { runGatedRapidkitCommandsInTerminal } from '../core/gatedRapidkitTerminal';
import { gateProjectLifecycleCommand } from '../core/projectLifecycleGate';
import {
  interruptTerminal,
  openTerminal,
  runRapidkitCommandsInTerminal,
} from '../utils/terminalExecutor';

async function hasCommandAvailable(command: string): Promise<boolean> {
  try {
    const { execa } = await import('execa');
    const args = command === 'java' ? ['-version'] : ['--version'];
    const result = await execa(command, args, { timeout: 3000, reject: false });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

type ProjectExplorerLike = {
  refresh: () => void;
  getSelectedProject?: () => {
    path: string;
    name: string;
    type: string;
  } | null;
};

let projectExplorerGetter: (() => ProjectExplorerLike | undefined) | undefined;

function warnMissingProjectSelection(commandLabel: string): void {
  vscode.window.showWarningMessage(
    `${commandLabel} needs a selected project. Pick one in the Projects sidebar or Dashboard.`
  );
}

type ProjectCommandItem = {
  project?: {
    path?: unknown;
    name?: unknown;
    type?: unknown;
  };
  projectPath?: unknown;
  preferredAction?: unknown;
};

type ProjectCommandTarget = {
  projectPath?: string;
  projectName: string;
  projectType: string;
  preferredAction?: string;
};

function resolveProjectCommandTarget(item: unknown): ProjectCommandTarget {
  const typed = item && typeof item === 'object' ? (item as ProjectCommandItem) : undefined;

  let projectPathCandidate = typed?.project?.path ?? typed?.projectPath;
  let projectNameCandidate = typed?.project?.name;
  let projectTypeCandidate = typed?.project?.type;

  if (typeof projectPathCandidate !== 'string' || projectPathCandidate.trim().length === 0) {
    const explorerProject = projectExplorerGetter?.()?.getSelectedProject?.();
    if (explorerProject?.path) {
      projectPathCandidate = explorerProject.path;
      projectNameCandidate = explorerProject.name;
      projectTypeCandidate = explorerProject.type;
    } else {
      const fallbackPath = getSelectedProjectPath();
      if (fallbackPath) {
        projectPathCandidate = fallbackPath;
        projectNameCandidate = path.basename(fallbackPath);
      }
    }
  }

  const preferredActionCandidate = typed?.preferredAction;

  return {
    projectPath:
      typeof projectPathCandidate === 'string' && projectPathCandidate.length > 0
        ? projectPathCandidate
        : undefined,
    projectName:
      typeof projectNameCandidate === 'string' && projectNameCandidate.length > 0
        ? projectNameCandidate
        : 'Project',
    projectType:
      typeof projectTypeCandidate === 'string' && projectTypeCandidate.length > 0
        ? projectTypeCandidate
        : 'fastapi',
    preferredAction:
      typeof preferredActionCandidate === 'string' && preferredActionCandidate.length > 0
        ? preferredActionCandidate
        : undefined,
  };
}

function resolveDefaultDevPort(projectType: string): number {
  if (projectType === 'springboot') {
    return 8080;
  }
  if (projectType === 'fastapi') {
    return 8000;
  }
  if (projectType === 'go' || isFrontendScaffoldFramework(projectType)) {
    return 3000;
  }
  if (projectType === 'nestjs') {
    return 8000;
  }
  return 3000;
}

function usesRapidkitDevCommand(projectType: string): boolean {
  return (
    projectType === 'fastapi' ||
    projectType === 'go' ||
    projectType === 'springboot' ||
    projectType === 'nestjs' ||
    projectType === 'dotnet' ||
    isFrontendScaffoldFramework(projectType)
  );
}

function startRapidkitDevTerminal(input: {
  projectName: string;
  projectPath: string;
  port: number;
  defaultPort: number;
  withPortEnv?: boolean;
  withDevPortFlag?: boolean;
  startedMessage: string;
}): vscode.Terminal {
  const env =
    input.withPortEnv && input.port !== input.defaultPort
      ? { PORT: String(input.port) }
      : undefined;
  const commands =
    input.withDevPortFlag && input.port !== input.defaultPort
      ? [['dev', '--port', String(input.port)]]
      : [['dev']];

  const terminal = runRapidkitCommandsInTerminal({
    name: `🚀 ${input.projectName} [:${input.port}]`,
    cwd: input.projectPath,
    env,
    commands,
  });

  if (input.port !== input.defaultPort) {
    vscode.window.showInformationMessage(
      `▶️ Started on port ${input.port} (${input.defaultPort} was busy)`
    );
  } else {
    vscode.window.showInformationMessage(input.startedMessage);
  }

  return terminal;
}

export function registerProjectLifecycleCommands(options: {
  logger: Logger;
  runningServers: Map<string, vscode.Terminal>;
  getProjectExplorer: () => ProjectExplorerLike | undefined;
}): vscode.Disposable[] {
  const { logger, runningServers, getProjectExplorer } = options;
  projectExplorerGetter = getProjectExplorer;

  return [
    vscode.commands.registerCommand('workspai.projectTerminal', async (item: unknown) => {
      const { projectPath, projectName } = resolveProjectCommandTarget(item);
      if (!projectPath) {
        warnMissingProjectSelection('Project Terminal');
        return;
      }
      openTerminal({
        name: `Workspai: ${projectName}`,
        cwd: projectPath,
      });
      logger.info(`Opened terminal for project: ${projectPath}`);
    }),

    vscode.commands.registerCommand('workspai.projectInit', async (item: unknown) => {
      const { projectPath, projectName, projectType } = resolveProjectCommandTarget(item);

      if (!projectPath) {
        warnMissingProjectSelection('Project Init');
        return;
      }

      if (!(await gateProjectLifecycleCommand(projectPath, 'init', projectName))) {
        return;
      }

      runRapidkitCommandsInTerminal({
        name: `📦 ${projectName} [init]`,
        cwd: projectPath,
        commands: [['init']],
      });

      if (projectType === 'springboot') {
        vscode.window.showInformationMessage(
          `Running rapidkit init for ${projectName}. This step can be quiet. It prepares the project, but Spring Boot still needs a Maven/Gradle wrapper or system Maven/Gradle before rapidkit dev can start.`
        );
      }

      logger.info(`Running init for project: ${projectPath}`);
    }),

    vscode.commands.registerCommand('workspai.projectDev', async (item: unknown) => {
      const { projectPath, projectName, projectType } = resolveProjectCommandTarget(item);

      if (!projectPath) {
        warnMissingProjectSelection('Project Dev');
        return;
      }

      if (!(await gateProjectLifecycleCommand(projectPath, 'dev', projectName))) {
        return;
      }

      const fs = await import('fs');

      const isFastAPI = projectType === 'fastapi';
      const isGoProject = projectType === 'go';
      const isSpringBootProject = projectType === 'springboot';

      let isInitialized = false;
      let missingText = '';
      let springHasWrapper = false;
      let springHasSystemBuildTool = false;

      if (isFastAPI) {
        const venvInfo = await detectPythonVirtualenv(projectPath);
        isInitialized = venvInfo.exists;
        missingText = venvInfo.exists ? '' : 'virtualenv (.venv or Poetry cache)';
      } else if (isGoProject) {
        const goSumPath = path.join(projectPath, 'go.sum');
        isInitialized = fs.existsSync(goSumPath);
        missingText = 'go.sum (run go mod tidy)';
      } else if (isSpringBootProject) {
        const hasMaven = fs.existsSync(path.join(projectPath, 'mvnw'));
        const hasGradle =
          fs.existsSync(path.join(projectPath, 'gradlew')) ||
          fs.existsSync(path.join(projectPath, 'gradlew.bat'));
        const hasSystemMaven = await hasCommandAvailable('mvn');
        const hasSystemGradle = await hasCommandAvailable('gradle');

        springHasWrapper = hasMaven || hasGradle;
        springHasSystemBuildTool = hasSystemMaven || hasSystemGradle;
        isInitialized = springHasWrapper || springHasSystemBuildTool;
        missingText = 'Maven/Gradle wrapper or system Maven/Gradle';
      } else if (!isSpringBootProject) {
        const checkPath = path.join(projectPath, 'node_modules');
        isInitialized = fs.existsSync(checkPath);
        missingText = 'node_modules';
      }

      if (isSpringBootProject && !springHasWrapper && !springHasSystemBuildTool) {
        const choice = await vscode.window.showWarningMessage(
          `Project "${projectName}" cannot start yet. No Maven/Gradle wrapper was found in the project, and no system Maven/Gradle was detected. rapidkit init may be quiet, but rapidkit dev will still fail until one of those build tools is available.`,
          'Run Init Only',
          'Open Setup Panel',
          'Cancel'
        );

        if (choice === 'Run Init Only') {
          runRapidkitCommandsInTerminal({
            name: `📦 ${projectName} [init]`,
            cwd: projectPath,
            commands: [['init']],
          });
          vscode.window.showInformationMessage(
            `rapidkit init started for ${projectName}. After it finishes, add Maven/Gradle or generate the wrapper, then run dev again.`
          );
        } else if (choice === 'Open Setup Panel') {
          vscode.commands.executeCommand('workspai.openSetup');
        }

        return;
      }

      // Java pre-flight: check JDK availability before starting Spring Boot
      if (isSpringBootProject) {
        const os = await import('os');
        const javaHome = process.env.JAVA_HOME?.trim();
        const javaExe = process.platform === 'win32' ? 'java.exe' : 'java';
        const javaCandidates = [
          'java',
          ...(javaHome ? [path.join(javaHome, 'bin', javaExe)] : []),
          `/usr/lib/jvm/temurin-21/bin/${javaExe}`,
          `/usr/lib/jvm/java-21-openjdk-amd64/bin/${javaExe}`,
          `/usr/lib/jvm/java-17-openjdk-amd64/bin/${javaExe}`,
          path.join(os.homedir(), '.sdkman', 'candidates', 'java', 'current', 'bin', javaExe),
        ];

        let javaFound = false;
        for (const candidate of javaCandidates) {
          try {
            const { execa } = await import('execa');
            const result = await execa(candidate, ['-version'], { timeout: 3000, reject: false });
            if (result.exitCode === 0) {
              javaFound = true;
              break;
            }
          } catch {
            // try next
          }
        }

        if (!javaFound) {
          const choice = await vscode.window.showErrorMessage(
            `☕ Java (JDK) not found — required to start "${projectName}" (Spring Boot).`,
            'Open Setup Panel',
            'Cancel'
          );
          if (choice === 'Open Setup Panel') {
            vscode.commands.executeCommand('workspai.openSetup');
          }
          return;
        }
      }

      if (!isInitialized) {
        const action = isFastAPI
          ? await vscode.window.showWarningMessage(
              `Project "${projectName}" is not initialized (${missingText} not found)`,
              'Initialize & Start',
              'Start Anyway',
              'Cancel'
            )
          : await vscode.window.showWarningMessage(
              `Project "${projectName}" is not initialized (${missingText} not found)`,
              'Initialize & Start',
              'Cancel'
            );

        if (action === 'Initialize & Start') {
          const terminal = runRapidkitCommandsInTerminal({
            name: `🔧 ${projectName} [init → dev]`,
            cwd: projectPath,
            commands: [['init'], ['dev']],
          });

          runningServers.set(projectPath, terminal);
          getProjectExplorer()?.refresh();

          if (WelcomePanel.currentPanel) {
            WelcomePanel.updateWithProject(projectPath, projectName);
          }

          vscode.window.showInformationMessage(`🔧 Initializing ${projectName}...`);
          logger.info(`Init + Dev for ${projectType} project: ${projectPath}`);
          return;
        } else if (action === 'Start Anyway' && isFastAPI) {
          const terminal = runRapidkitCommandsInTerminal({
            name: `🚀 ${projectName} [:8000]`,
            cwd: projectPath,
            commands: [['dev', '--allow-global-runtime']],
          });

          runningServers.set(projectPath, terminal);
          getProjectExplorer()?.refresh();

          if (WelcomePanel.currentPanel) {
            WelcomePanel.updateWithProject(projectPath, projectName);
          }

          logger.info(`Dev (global runtime) for project: ${projectPath}`);
          return;
        } else {
          return;
        }
      }

      const net = await import('net');
      const defaultPort = resolveDefaultDevPort(projectType);
      let port = defaultPort;

      const MAX_PORT_SCAN_ATTEMPTS = 50;

      const canBindPort = (candidatePort: number): Promise<boolean> => {
        return new Promise((resolve) => {
          const server = net.createServer();
          server.once('error', () => {
            resolve(false);
          });
          server.listen(candidatePort, '0.0.0.0', () => {
            server.close(() => resolve(true));
          });
        });
      };

      const findAvailablePort = async (startPort: number): Promise<number> => {
        for (let i = 0; i < MAX_PORT_SCAN_ATTEMPTS; i += 1) {
          const candidatePort = startPort + i;
          if (await canBindPort(candidatePort)) {
            return candidatePort;
          }
        }

        throw new Error(
          `No available port found after ${MAX_PORT_SCAN_ATTEMPTS} attempts from ${startPort}`
        );
      };

      try {
        port = await findAvailablePort(defaultPort);
      } catch {
        vscode.window.showWarningMessage(
          `Could not find an open port near ${defaultPort}; starting with default port.`
        );
        port = defaultPort;
      }

      let terminal: vscode.Terminal;

      if (isFastAPI) {
        terminal = startRapidkitDevTerminal({
          projectName,
          projectPath,
          port,
          defaultPort,
          withDevPortFlag: true,
          startedMessage: `▶️ Started FastAPI server on port ${port}`,
        });
      } else if (isGoProject) {
        terminal = startRapidkitDevTerminal({
          projectName,
          projectPath,
          port,
          defaultPort,
          withPortEnv: true,
          startedMessage: `▶️ Started Go server on port ${port}`,
        });
      } else if (isSpringBootProject) {
        terminal = startRapidkitDevTerminal({
          projectName,
          projectPath,
          port,
          defaultPort,
          withPortEnv: true,
          startedMessage: `▶️ Started Spring Boot server on port ${port}`,
        });
      } else if (usesRapidkitDevCommand(projectType)) {
        terminal = startRapidkitDevTerminal({
          projectName,
          projectPath,
          port,
          defaultPort,
          withPortEnv: projectType === 'nestjs' || isFrontendScaffoldFramework(projectType),
          startedMessage: `▶️ Started dev server for ${projectName}`,
        });
      } else {
        terminal = startRapidkitDevTerminal({
          projectName,
          projectPath,
          port,
          defaultPort,
          startedMessage: `▶️ Started dev server for ${projectName}`,
        });
      }

      runningServers.set(projectPath, terminal);
      getProjectExplorer()?.refresh();

      if (WelcomePanel.currentPanel) {
        WelcomePanel.updateWithProject(projectPath, projectName);
      }

      logger.info(`Running ${projectType} dev server for project: ${projectPath} on port ${port}`);
    }),

    vscode.commands.registerCommand('workspai.projectStop', async (item: unknown) => {
      const { projectPath, projectName } = resolveProjectCommandTarget(item);
      if (!projectPath) {
        warnMissingProjectSelection('Project Stop');
        return;
      }
      const existingTerminal = runningServers.get(projectPath);
      if (existingTerminal) {
        interruptTerminal(existingTerminal);
        existingTerminal.show();
        vscode.window.showInformationMessage(`⏹️ Stopped server for ${projectName}`);

        runningServers.delete(projectPath);
        getProjectExplorer()?.refresh();

        if (WelcomePanel.currentPanel) {
          WelcomePanel.updateWithProject(projectPath, projectName);
        }

        logger.info(`Stopped dev server for: ${projectPath}`);
      }
    }),

    vscode.commands.registerCommand('workspai.projectTest', async (item: unknown) => {
      const { projectPath, projectName } = resolveProjectCommandTarget(item);

      if (!projectPath) {
        warnMissingProjectSelection('Project Test');
        return;
      }

      if (!(await gateProjectLifecycleCommand(projectPath, 'test', projectName))) {
        return;
      }

      runRapidkitCommandsInTerminal({
        name: `🧪 ${projectName} [test]`,
        cwd: projectPath,
        commands: [['test']],
      });

      logger.info(`Running tests for project: ${projectPath}`);
    }),

    vscode.commands.registerCommand('workspai.projectBuild', async (item: unknown) => {
      const { projectPath, projectName } = resolveProjectCommandTarget(item);

      if (!projectPath) {
        warnMissingProjectSelection('Project Build');
        return;
      }

      if (!(await gateProjectLifecycleCommand(projectPath, 'build', projectName))) {
        return;
      }

      runRapidkitCommandsInTerminal({
        name: `🏗️ ${projectName} [build]`,
        cwd: projectPath,
        commands: [['build']],
      });

      logger.info(`Running build for project: ${projectPath}`);
    }),

    vscode.commands.registerCommand('workspai.projectStart', async (item: unknown) => {
      const { projectPath, projectName } = resolveProjectCommandTarget(item);

      if (!projectPath) {
        warnMissingProjectSelection('Project Start');
        return;
      }

      if (!(await gateProjectLifecycleCommand(projectPath, 'start', projectName))) {
        return;
      }

      const existingTerminal = runningServers.get(projectPath);
      if (existingTerminal) {
        const choice = await vscode.window.showWarningMessage(
          `A server terminal is already tracked for "${projectName}". Stop it before starting a production server?`,
          'Stop & Start',
          'Cancel'
        );
        if (choice !== 'Stop & Start') {
          return;
        }
        interruptTerminal(existingTerminal);
        runningServers.delete(projectPath);
      }

      const terminal = runRapidkitCommandsInTerminal({
        name: `🚀 ${projectName} [start]`,
        cwd: projectPath,
        commands: [['start']],
      });

      runningServers.set(projectPath, terminal);
      getProjectExplorer()?.refresh();

      logger.info(`Running production start for project: ${projectPath}`);
    }),

    vscode.commands.registerCommand('workspai.projectLint', async (item: unknown) => {
      const { projectPath, projectName } = resolveProjectCommandTarget(item);

      if (!projectPath) {
        warnMissingProjectSelection('Project Lint');
        return;
      }

      if (!(await gateProjectLifecycleCommand(projectPath, 'lint', projectName))) {
        return;
      }

      runRapidkitCommandsInTerminal({
        name: `🔍 ${projectName} [lint]`,
        cwd: projectPath,
        commands: [['lint']],
      });

      logger.info(`Running lint for project: ${projectPath}`);
    }),

    vscode.commands.registerCommand('workspai.projectFormat', async (item: unknown) => {
      const { projectPath, projectName } = resolveProjectCommandTarget(item);

      if (!projectPath) {
        warnMissingProjectSelection('Project Format');
        return;
      }

      if (!(await gateProjectLifecycleCommand(projectPath, 'format', projectName))) {
        return;
      }

      runRapidkitCommandsInTerminal({
        name: `✨ ${projectName} [format]`,
        cwd: projectPath,
        commands: [['format']],
      });

      logger.info(`Running format for project: ${projectPath}`);
    }),

    vscode.commands.registerCommand('workspai.projectDoctor', async (item: unknown) => {
      const { projectPath, projectName, preferredAction } = resolveProjectCommandTarget(item);

      if (!projectPath) {
        vscode.window.showErrorMessage(
          'No project path available. Select a project in the sidebar first.'
        );
        return;
      }

      const normalizedPreferredAction = preferredAction?.trim().toLowerCase() ?? '';

      let action: 'check' | 'fix' | undefined;
      if (normalizedPreferredAction === 'check' || normalizedPreferredAction === 'fix') {
        action = normalizedPreferredAction;
      } else {
        const selected = await vscode.window.showQuickPick(
          [
            {
              label: '$(pulse) Check Project Health',
              description: 'Run doctor project',
              value: 'check' as const,
            },
            {
              label: '$(tools) Check & Auto-fix Project',
              description: 'Run doctor project --fix',
              value: 'fix' as const,
            },
          ],
          {
            title: `Project Doctor — ${projectName}`,
            placeHolder: 'Select doctor action',
            ignoreFocusOut: true,
          }
        );

        action = selected?.value;
      }

      if (!action) {
        return;
      }

      await runGatedRapidkitCommandsInTerminal({
        name: `🩺 ${projectName} [doctor:${action}]`,
        cwd: projectPath,
        commands: [action === 'fix' ? ['doctor', 'project', '--fix'] : ['doctor', 'project']],
      });

      logger.info(`Running project doctor (${action}) for project: ${projectPath}`);
    }),

    vscode.commands.registerCommand('workspai.projectBrowser', async (item: unknown) => {
      const { projectPath, projectType } = resolveProjectCommandTarget(item);
      const isFastAPI = projectType === 'fastapi';
      const isSpringBootProject = projectType === 'springboot';

      let port = 8000;
      const runningTerminal = projectPath ? runningServers.get(projectPath) : null;
      if (runningTerminal) {
        const match = runningTerminal.name.match(/:([0-9]+)/);
        if (match) {
          port = parseInt(match[1], 10);
        }
      }

      const url = isSpringBootProject
        ? `http://localhost:${port}/swagger-ui/index.html`
        : `http://localhost:${port}/docs`;
      vscode.env.openExternal(vscode.Uri.parse(url));
      logger.info(`Opening browser: ${url}`);

      if (isFastAPI) {
        vscode.window.showInformationMessage(`Opening ${url}`, 'Open /redoc').then((selection) => {
          if (selection === 'Open /redoc') {
            vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${port}/redoc`));
          }
        });
      } else {
        if (isSpringBootProject) {
          vscode.window
            .showInformationMessage(`Opening ${url}`, 'Open /actuator/health')
            .then((selection) => {
              if (selection === 'Open /actuator/health') {
                vscode.env.openExternal(
                  vscode.Uri.parse(`http://localhost:${port}/actuator/health`)
                );
              }
            });
        } else {
          vscode.window.showInformationMessage(`Opening ${url}`);
        }
      }
    }),
  ];
}

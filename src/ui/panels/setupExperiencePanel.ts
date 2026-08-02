/**
 * Setup Panel
 * Dedicated webview panel for system requirements and toolchain setup
 */

import * as vscode from 'vscode';
import { constants as fsConstants, readFileSync } from 'fs';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import { runCommandsInTerminal } from '../../utils/terminalExecutor';
import { run } from '../../utils/exec';
import {
  buildPackageRunnerInvocationEnv,
  buildNpmCliVersionVerifyCommands,
  buildNpxRapidkitVersionProbeArgs,
  buildRapidkitDisplayCommand,
  parseNpmCliVersionOutput,
  parseGlobalNpmPackageVersionOutput,
  parsePipxRapidkitCoreVersion,
  parseRapidkitCoreVersion,
  discoverPackageRunnerInvocations,
  discoverPythonExecutableCandidates,
} from '../../utils/platformCapabilities';

const SETUP_PREFERENCES_KEY = 'workspai.setup.preferences';

type SetupToolKey =
  | 'python'
  | 'pip'
  | 'pipx'
  | 'poetry'
  | 'go'
  | 'java'
  | 'maven'
  | 'gradle'
  | 'dotnet';
type InstallMethodKey = 'python' | 'core' | 'cli' | 'go' | 'java' | 'dotnet';
type DetectionSource =
  | 'manual-path'
  | 'path'
  | 'fallback'
  | 'workspace'
  | 'package-manager'
  | 'python';
type PathDoctorSuggestion = {
  id: string;
  title: string;
  snippet: string;
  targetFile?: string;
  requiresReload?: 'shell' | 'window' | 'none';
  reason?: string;
};
type SetupDetection = {
  source: DetectionSource;
  command: string;
  note?: string;
  needsShellReload?: boolean;
};
type SetupCheckResult = {
  tool: SetupToolKey;
  command: string;
  ok: boolean;
  output: string;
  summary: string;
  reason:
    | 'manual-path-empty'
    | 'not-found'
    | 'not-executable'
    | 'permission'
    | 'command-not-found'
    | 'path-missing'
    | 'version-mismatch'
    | 'unknown';
  suggestedCommands: string[];
  targetFile?: string;
  requiresReload?: 'shell' | 'window' | 'none';
};

type PathDoctorReport = {
  generatedAt: string;
  shell: string;
  shellName: string;
  targetFile?: string;
  pathEntries: string[];
  missingCommonEntries: string[];
  suggestions: PathDoctorSuggestion[];
  notes: string[];
  needsShellReload: boolean;
};

type SetupPreferences = {
  manualPaths: Partial<Record<SetupToolKey, string>>;
  installMethods: Partial<Record<InstallMethodKey, string>>;
  lastPathDoctorReport?: PathDoctorReport | null;
};

export class SetupPanel {
  public static currentPanel: SetupPanel | undefined;
  private readonly _panel!: vscode.WebviewPanel;
  private _context: vscode.ExtensionContext;
  private _disposables: vscode.Disposable[] = [];
  private _isDisposing = false;
  private _webviewOverride?: vscode.Webview;
  private _embeddedMode = false;
  private static _embeddedBridge: SetupPanel | undefined;

  private static readonly SETUP_WEBVIEW_COMMANDS = new Set<string>([
    'checkInstallStatus',
    'clearRequirementCache',
    'doctor',
    'showWelcome',
    'openUrl',
    'showInfo',
    'getSetupPreferences',
    'setManualPath',
    'clearManualPath',
    'pickManualPath',
    'setInstallMethod',
    'runPathDoctor',
    'validateManualPath',
    'applyPathDoctorSuggestion',
    'copyText',
    'exportSetupReport',
    'installNpmGlobal',
    'upgradeNpmGlobal',
    'installPipCore',
    'upgradePipCore',
    'installPoetry',
    'installPipx',
    'installPipxThenCore',
    'installCoreFallback',
    'installCoreSmart',
    'verifyPython',
    'verifyPip',
    'verifyPipx',
    'verifyCore',
    'verifyNpm',
    'verifyPoetry',
    'verifyGo',
    'installDotnet',
    'verifyDotnet',
    'installJava',
    'installMaven',
    'installGradle',
    'verifyJavaEnv',
    'verifyJava',
    'verifyMaven',
    'verifyGradle',
    'getCacheStats',
  ]);

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this._panel = panel;
    this._context = context;
    this._panel.webview.html = this._getHtmlContent(context);

    // Handle panel disposal
    this._disposables.push(
      this._panel.onDidDispose(() => {
        this._isDisposing = true;
        this.dispose();
      })
    );

    // Register message handler with proper cleanup
    this._disposables.push(
      this._panel.webview.onDidReceiveMessage(
        async (message) => {
          if (this._isDisposing) {
            return;
          }
          await this._handleWebviewMessage(message);
        },
        null,
        this._disposables
      )
    );

    setImmediate(async () => {
      const status = await this._checkInstallationStatus();
      this._safePostMessage({ command: 'statusUpdate', status });
      this._safePostMessage({
        command: 'preferencesUpdate',
        preferences: this._getSetupPreferences(),
      });
      this._safePostMessage({
        command: 'pathDoctorUpdate',
        report: this._getSetupPreferences().lastPathDoctorReport || this._runPathDoctor(),
      });
    });

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public static show(context: vscode.ExtensionContext) {
    void import('./welcomePanel.js').then(({ WelcomePanel }) => {
      WelcomePanel.openSetupTab(context);
    });
  }

  public static isSetupCommand(command: string | undefined): boolean {
    return typeof command === 'string' && SetupPanel.SETUP_WEBVIEW_COMMANDS.has(command);
  }

  private static _getEmbeddedBridge(
    context: vscode.ExtensionContext,
    webview: vscode.Webview
  ): SetupPanel {
    if (!SetupPanel._embeddedBridge) {
      const bridge = Object.create(SetupPanel.prototype) as SetupPanel;
      bridge._context = context;
      bridge._disposables = [];
      bridge._isDisposing = false;
      bridge._embeddedMode = true;
      SetupPanel._embeddedBridge = bridge;
    }

    SetupPanel._embeddedBridge._context = context;
    SetupPanel._embeddedBridge._webviewOverride = webview;
    SetupPanel._embeddedBridge._embeddedMode = true;
    SetupPanel._embeddedBridge._isDisposing = false;
    return SetupPanel._embeddedBridge;
  }

  public static async handleEmbeddedMessage(
    context: vscode.ExtensionContext,
    webview: vscode.Webview,
    message: { command?: string; data?: Record<string, unknown>; url?: string; message?: string }
  ): Promise<boolean> {
    const command = message?.command;
    if (!SetupPanel.isSetupCommand(command)) {
      return false;
    }

    const bridge = SetupPanel._getEmbeddedBridge(context, webview);
    await bridge._handleWebviewMessage(message);
    return true;
  }

  public static bootstrapEmbedded(context: vscode.ExtensionContext, webview: vscode.Webview): void {
    const bridge = SetupPanel._getEmbeddedBridge(context, webview);
    setImmediate(async () => {
      const status = await bridge._checkInstallationStatus();
      bridge._safePostMessage({ command: 'statusUpdate', status });
      bridge._safePostMessage({
        command: 'preferencesUpdate',
        preferences: bridge._getSetupPreferences(),
      });
      bridge._safePostMessage({
        command: 'pathDoctorUpdate',
        report: bridge._getSetupPreferences().lastPathDoctorReport || bridge._runPathDoctor(),
      });
    });
  }

  public dispose() {
    SetupPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private async _handleWebviewMessage(message: {
    command?: string;
    data?: Record<string, unknown>;
    url?: string;
    message?: string;
  }): Promise<void> {
    switch (message.command) {
      case 'checkInstallStatus': {
        const status = await this._checkInstallationStatus();
        this._safePostMessage({ command: 'statusUpdate', status });
        break;
      }
      case 'clearRequirementCache': {
        try {
          const { requirementCache } = await import('../../utils/requirementCache.js');
          requirementCache.invalidateAll();
          vscode.window.showInformationMessage(
            '✅ Cache Cleared\n\nPython and Poetry checks will be performed fresh on next use.'
          );
          // Refresh status to show it's cleared
          const status = await this._checkInstallationStatus();
          this._safePostMessage({ command: 'statusUpdate', status });
        } catch {
          vscode.window.showErrorMessage('Failed to clear cache');
        }
        break;
      }
      case 'doctor':
        vscode.commands.executeCommand('workspai.doctor');
        break;
      case 'showWelcome':
        if (this._embeddedMode) {
          this._safePostMessage({ command: 'setActiveView', data: { view: 'dashboard' } });
        } else {
          vscode.commands.executeCommand('workspai.showWelcome');
        }
        break;
      case 'openUrl': {
        const targetUrl = message.url || message.data?.url;
        if (typeof targetUrl === 'string' && targetUrl.trim()) {
          vscode.env.openExternal(vscode.Uri.parse(targetUrl));
        }
        break;
      }
      case 'showInfo': {
        const infoMessage = message.message || message.data?.message;
        if (typeof infoMessage === 'string' && infoMessage.trim()) {
          vscode.window.showInformationMessage(infoMessage);
        }
        break;
      }
      case 'getSetupPreferences': {
        const prefs = this._getSetupPreferences();
        this._safePostMessage({ command: 'preferencesUpdate', preferences: prefs });
        break;
      }
      case 'setManualPath': {
        const tool = message.data?.tool as SetupToolKey | undefined;
        const manualPath = message.data?.path as string | undefined;
        if (!tool || !manualPath) {
          break;
        }
        const saved = await this._setManualPath(tool, manualPath);
        if (saved) {
          const prefs = this._getSetupPreferences();
          this._safePostMessage({ command: 'preferencesUpdate', preferences: prefs });
          const status = await this._checkInstallationStatus();
          this._safePostMessage({ command: 'statusUpdate', status });
        }
        break;
      }
      case 'clearManualPath': {
        const tool = message.data?.tool as SetupToolKey | undefined;
        if (!tool) {
          break;
        }
        this._clearManualPath(tool);
        const prefs = this._getSetupPreferences();
        this._safePostMessage({ command: 'preferencesUpdate', preferences: prefs });
        const status = await this._checkInstallationStatus();
        this._safePostMessage({ command: 'statusUpdate', status });
        break;
      }
      case 'pickManualPath': {
        const tool = message.data?.tool as SetupToolKey | undefined;
        if (!tool) {
          break;
        }
        const selection = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          openLabel: 'Select executable',
        });
        const picked = selection?.[0]?.fsPath || '';
        this._safePostMessage({ command: 'manualPathPicked', tool, path: picked });
        break;
      }
      case 'setInstallMethod': {
        const key = message.data?.key as InstallMethodKey | undefined;
        const method = message.data?.method as string | undefined;
        if (!key || !method) {
          break;
        }
        this._setInstallMethod(key, method);
        const prefs = this._getSetupPreferences();
        this._safePostMessage({ command: 'preferencesUpdate', preferences: prefs });
        const status = await this._checkInstallationStatus();
        this._safePostMessage({ command: 'statusUpdate', status });
        break;
      }
      case 'runPathDoctor': {
        const report = this._runPathDoctor();
        this._persistPathDoctorReport(report);
        this._safePostMessage({ command: 'pathDoctorUpdate', report });
        break;
      }
      case 'validateManualPath': {
        const tool = message.data?.tool as SetupToolKey | undefined;
        const manualPath = message.data?.path as string | undefined;
        if (!tool) {
          break;
        }
        const report = this._getSetupPreferences().lastPathDoctorReport || this._runPathDoctor();
        const result = await this._runSetupCheck(tool, manualPath, report);
        this._safePostMessage({ command: 'manualPathValidation', result });
        break;
      }
      case 'applyPathDoctorSuggestion': {
        const suggestionId = message.data?.suggestionId as string | undefined;
        if (!suggestionId) {
          break;
        }
        const report = this._getSetupPreferences().lastPathDoctorReport || this._runPathDoctor();
        const applied = await this._applyPathDoctorSuggestion(report, suggestionId);
        if (applied) {
          const nextReport = this._runPathDoctor();
          this._persistPathDoctorReport(nextReport);
          this._safePostMessage({ command: 'pathDoctorUpdate', report: nextReport });
        }
        break;
      }
      case 'copyText': {
        const text = message.data?.text;
        if (typeof text === 'string' && text.trim()) {
          await vscode.env.clipboard.writeText(text);
          vscode.window.showInformationMessage('Copied to clipboard.');
        }
        break;
      }
      case 'exportSetupReport': {
        const status = await this._checkInstallationStatus();
        const preferences = this._getSetupPreferences();
        const report = {
          generatedAt: new Date().toISOString(),
          status,
          preferences,
          pathDoctor: preferences.lastPathDoctorReport || this._runPathDoctor(),
        };

        const uri = await vscode.window.showSaveDialog({
          saveLabel: 'Export setup report',
          filters: { JSON: ['json'] },
          defaultUri: vscode.Uri.file(`${os.homedir()}/workspai-setup-report-${Date.now()}.json`),
        });

        if (uri) {
          const payload = Buffer.from(JSON.stringify(report, null, 2), 'utf8');
          await vscode.workspace.fs.writeFile(uri, payload);
          vscode.window.showInformationMessage(`Setup report exported: ${uri.fsPath}`);
        }
        break;
      }
      case 'installNpmGlobal': {
        runCommandsInTerminal({
          name: 'Install Workspai CLI',
          commands: ['npm install -g workspai'],
        });
        setTimeout(async () => {
          const newStatus = await this._checkInstallationStatus();
          this._safePostMessage({ command: 'statusUpdate', status: newStatus });
        }, 8000);
        break;
      }
      case 'upgradeNpmGlobal': {
        runCommandsInTerminal({
          name: 'Upgrade Workspai CLI',
          commands: ['npm install -g workspai'],
        });
        setTimeout(async () => {
          const newStatus = await this._checkInstallationStatus();
          this._safePostMessage({ command: 'statusUpdate', status: newStatus });
        }, 8000);
        break;
      }
      case 'installPipCore': {
        runCommandsInTerminal({
          name: 'Install RapidKit Core',
          commands: [
            process.platform === 'win32'
              ? 'python -m pipx install --force rapidkit-core'
              : 'pipx install --force rapidkit-core',
          ],
        });
        setTimeout(async () => {
          const newStatus = await this._checkInstallationStatus();
          this._safePostMessage({ command: 'statusUpdate', status: newStatus });
        }, 10000);
        break;
      }
      case 'upgradePipCore': {
        runCommandsInTerminal({
          name: 'Upgrade RapidKit Core',
          commands: [
            process.platform === 'win32'
              ? 'python -m pipx upgrade rapidkit-core'
              : 'pipx upgrade rapidkit-core',
          ],
        });
        setTimeout(async () => {
          const newStatus = await this._checkInstallationStatus();
          this._safePostMessage({ command: 'statusUpdate', status: newStatus });
        }, 10000);
        break;
      }
      case 'installPoetry': {
        const poetryCommands =
          process.platform === 'win32'
            ? ['python -m pip install --user poetry']
            : ['python3 -m pip install --user poetry'];
        runCommandsInTerminal({
          name: 'Install Poetry',
          commands: poetryCommands,
        });
        vscode.window.showInformationMessage('Installing Poetry with pip (user mode).');
        setTimeout(async () => {
          // Invalidate Poetry cache after installation
          try {
            const { requirementCache } = await import('../../utils/requirementCache.js');
            requirementCache.invalidatePoetry();
          } catch {
            // Ignore cache errors
          }
          const newStatus = await this._checkInstallationStatus();
          this._safePostMessage({ command: 'statusUpdate', status: newStatus });
        }, 12000);
        break;
      }
      case 'installPipx': {
        const pipxCommands =
          process.platform === 'win32'
            ? ['python -m pip install --user pipx', 'python -m pipx ensurepath']
            : ['python3 -m pip install --user pipx', 'python3 -m pipx ensurepath'];
        runCommandsInTerminal({
          name: 'Install pipx',
          commands: pipxCommands,
        });
        vscode.window.showInformationMessage(
          'pipx installed. Please restart your terminal or VS Code for PATH changes to take effect.'
        );
        setTimeout(async () => {
          const newStatus = await this._checkInstallationStatus();
          this._safePostMessage({ command: 'statusUpdate', status: newStatus });
        }, 8000);
        break;
      }
      case 'installPipxThenCore': {
        const toolchainCommands =
          process.platform === 'win32'
            ? [
                'python -m pip install --user pipx',
                'python -m pipx ensurepath',
                'python -m pipx install --force rapidkit-core',
              ]
            : [
                'python3 -m pip install --user pipx',
                'python3 -m pipx ensurepath',
                'pipx install --force rapidkit-core',
              ];
        runCommandsInTerminal({
          name: 'Setup Workspai Toolchain',
          commands: toolchainCommands,
        });
        vscode.window.showInformationMessage('Installing pipx and RapidKit Core. Please wait...');
        setTimeout(async () => {
          const newStatus = await this._checkInstallationStatus();
          this._safePostMessage({ command: 'statusUpdate', status: newStatus });
        }, 15000);
        break;
      }
      case 'installCoreFallback': {
        const answer = await vscode.window.showWarningMessage(
          'pipx not found. Install RapidKit Core with pip --user instead? (fallback mode)',
          'Install with pip',
          'Cancel'
        );
        if (answer === 'Install with pip') {
          runCommandsInTerminal({
            name: 'Install RapidKit Core (fallback)',
            commands: [
              process.platform === 'win32'
                ? 'python -m pip install --user rapidkit-core'
                : 'python3 -m pip install --user rapidkit-core',
            ],
          });
          vscode.window.showWarningMessage(
            'RapidKit Core installed via pip. This may conflict with virtualenvs. Consider installing pipx later.'
          );
          setTimeout(async () => {
            const newStatus = await this._checkInstallationStatus();
            this._safePostMessage({ command: 'statusUpdate', status: newStatus });
          }, 10000);
        }
        break;
      }
      case 'installCoreSmart': {
        const installStatus = await this._checkInstallationStatus();

        if (!installStatus.pythonInstalled || !installStatus.pipInstalled) {
          vscode.window.showWarningMessage(
            'Python and pip are required before installing RapidKit Core. Please install Python 3.10+ first.'
          );
          break;
        }

        if (installStatus.pipxInstalled) {
          runCommandsInTerminal({
            name: 'Install RapidKit Core (smart fallback)',
            commands: [
              process.platform === 'win32'
                ? 'python -m pipx install --force rapidkit-core'
                : 'pipx install --force rapidkit-core',
            ],
          });
          vscode.window.showInformationMessage(
            'Installing RapidKit Core with pipx (recommended isolated mode).'
          );
        } else {
          runCommandsInTerminal({
            name: 'Install RapidKit Core (smart fallback)',
            commands: [
              process.platform === 'win32'
                ? 'python -m pip install --user rapidkit-core'
                : 'python3 -m pip install --user rapidkit-core',
            ],
          });
          vscode.window.showInformationMessage(
            'Installing RapidKit Core with pip fallback. You can install pipx later for better isolation.'
          );
        }

        setTimeout(async () => {
          const newStatus = await this._checkInstallationStatus();
          this._safePostMessage({ command: 'statusUpdate', status: newStatus });
        }, 10000);
        break;
      }
      case 'verifyPython': {
        const prefs = this._getSetupPreferences();
        const manualPython = prefs.manualPaths.python;
        runCommandsInTerminal({
          name: 'Verify Python',
          commands: manualPython
            ? [
                `${this._quoteExecutable(manualPython)} --version`,
                'python3 --version',
                'python --version',
              ]
            : ['python3 --version', 'python --version'],
        });
        break;
      }
      case 'verifyPip': {
        const prefs = this._getSetupPreferences();
        const manualPip = prefs.manualPaths.pip;
        runCommandsInTerminal({
          name: 'Verify pip',
          commands: [
            ...(manualPip ? [`${this._quoteExecutable(manualPip)} --version`] : []),
            process.platform === 'win32' ? 'python -m pip --version' : 'python3 -m pip --version',
          ],
        });
        break;
      }
      case 'verifyPipx': {
        const prefs = this._getSetupPreferences();
        const manualPipx = prefs.manualPaths.pipx;
        runCommandsInTerminal({
          name: 'Verify pipx',
          commands: [
            ...(manualPipx ? [`${this._quoteExecutable(manualPipx)} --version`] : []),
            process.platform === 'win32' ? 'python -m pipx --version' : 'pipx --version',
          ],
        });
        break;
      }
      case 'verifyCore': {
        const fs = await import('fs-extra');
        const path = await import('path');
        const quoteExecutable = (value: string) => (value.includes(' ') ? `"${value}"` : value);
        const coreVerifyCommands: string[] = [];

        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        for (const folder of workspaceFolders) {
          const workspacePath = folder.uri.fsPath;
          const workspacePython =
            process.platform === 'win32'
              ? path.join(workspacePath, '.venv', 'Scripts', 'python.exe')
              : path.join(workspacePath, '.venv', 'bin', 'python');
          const workspaceRapidkit =
            process.platform === 'win32'
              ? path.join(workspacePath, '.venv', 'Scripts', 'rapidkit.exe')
              : path.join(workspacePath, '.venv', 'bin', 'rapidkit');

          if (await fs.pathExists(workspacePython)) {
            const pythonExe = quoteExecutable(workspacePython);
            coreVerifyCommands.push(
              `${pythonExe} -m rapidkit --version --json`,
              `${pythonExe} -m pip show rapidkit-core`
            );
          }

          if (await fs.pathExists(workspaceRapidkit)) {
            const rapidkitExe = quoteExecutable(workspaceRapidkit);
            coreVerifyCommands.push(`${rapidkitExe} --version --json`);
          }
        }

        if (process.platform === 'win32') {
          coreVerifyCommands.push(
            'python -m pip show rapidkit-core',
            'py -3 -m pip show rapidkit-core',
            'python -m pipx list'
          );
        } else {
          coreVerifyCommands.push(
            'python3 -m pip show rapidkit-core',
            'python -m pip show rapidkit-core',
            'python3 -m pipx list',
            'pipx list'
          );
        }

        const dedupedCoreVerifyCommands = [...new Set(coreVerifyCommands)];
        runCommandsInTerminal({
          name: 'Verify RapidKit Core',
          commands: dedupedCoreVerifyCommands,
        });
        break;
      }
      case 'verifyNpm': {
        runCommandsInTerminal({
          name: 'Verify Workspai CLI (npm)',
          commands: buildNpmCliVersionVerifyCommands(),
        });
        break;
      }
      case 'verifyPoetry': {
        const path = await import('path');
        const fs = await import('fs-extra');
        const quoteExecutable = (value: string) =>
          value && value.includes(' ') ? `"${value}"` : value;
        const prefs = this._getSetupPreferences();
        const manualPoetry = prefs.manualPaths.poetry;

        const windowsPoetryCandidates = [
          path.join(process.env.APPDATA || '', 'Python', 'Scripts', 'poetry.exe'),
          path.join(
            process.env.USERPROFILE || '',
            'AppData',
            'Roaming',
            'Python',
            'Scripts',
            'poetry.exe'
          ),
          path.join(process.env.USERPROFILE || '', '.local', 'bin', 'poetry.exe'),
        ].filter((candidate) => !!candidate && !candidate.startsWith('Python'));

        const existingWindowsPoetryCommands: string[] = [];
        for (const candidate of windowsPoetryCandidates) {
          try {
            if (await fs.pathExists(candidate)) {
              existingWindowsPoetryCommands.push(`${quoteExecutable(candidate)} --version`);
            }
          } catch {
            // ignore filesystem check errors; we'll rely on standard commands below
          }
        }

        const linuxPoetryCandidate = path.join(process.env.HOME || '', '.local', 'bin', 'poetry');
        const linuxPoetryCommands: string[] = [];
        try {
          if (await fs.pathExists(linuxPoetryCandidate)) {
            linuxPoetryCommands.push(`${quoteExecutable(linuxPoetryCandidate)} --version`);
          }
        } catch {
          // ignore filesystem check errors
        }

        const poetryVerifyCommands =
          process.platform === 'win32'
            ? [
                ...(manualPoetry ? [`${quoteExecutable(manualPoetry)} --version`] : []),
                ...existingWindowsPoetryCommands,
                'poetry --version',
                'python -m poetry --version',
                'py -3 -m poetry --version',
              ]
            : [
                ...(manualPoetry ? [`${quoteExecutable(manualPoetry)} --version`] : []),
                ...linuxPoetryCommands,
                'poetry --version',
                'python3 -m poetry --version',
                'python -m poetry --version',
              ];
        runCommandsInTerminal({
          name: 'Verify Poetry',
          commands: [...new Set(poetryVerifyCommands)],
        });
        break;
      }
      case 'verifyGo': {
        const path = await import('path');
        const os = await import('os');
        const fs = await import('fs-extra');
        const quoteExecutable = (value: string) =>
          value && value.includes(' ') ? `"${value}"` : value;
        const prefs = this._getSetupPreferences();
        const manualGo = prefs.manualPaths.go;

        const isWindows = process.platform === 'win32';
        const goCandidates = isWindows
          ? [
              manualGo || '',
              'go',
              'C:\\Go\\bin\\go.exe',
              'C:\\Program Files\\Go\\bin\\go.exe',
              process.env.GOROOT ? path.join(process.env.GOROOT, 'bin', 'go.exe') : '',
            ]
          : [
              manualGo || '',
              '/usr/local/go/bin/go',
              '/snap/bin/go',
              path.join(os.homedir(), 'go', 'bin', 'go'),
              process.env.GOROOT ? path.join(process.env.GOROOT, 'bin', 'go') : '',
              'go',
            ];

        const goVerifyCommands: string[] = [];
        for (const candidate of goCandidates) {
          if (!candidate || !candidate.trim()) {
            continue;
          }

          if (candidate === 'go') {
            goVerifyCommands.push('go version');
            continue;
          }

          try {
            if (await fs.pathExists(candidate)) {
              goVerifyCommands.push(`${quoteExecutable(candidate)} version`);
            }
          } catch {
            // Ignore filesystem probe errors and keep going.
          }
        }

        runCommandsInTerminal({
          name: 'Verify Go',
          commands: [...new Set(goVerifyCommands)],
        });
        break;
      }
      case 'installDotnet': {
        vscode.env.openExternal(vscode.Uri.parse('https://dotnet.microsoft.com/download'));
        vscode.window.showInformationMessage(
          'Opening .NET downloads — install .NET SDK 8+ for ASP.NET Core workspaces.'
        );
        break;
      }
      case 'verifyDotnet': {
        const prefs = this._getSetupPreferences();
        const manualDotnet = prefs.manualPaths.dotnet;
        runCommandsInTerminal({
          name: 'Verify .NET',
          commands: [
            ...(manualDotnet ? [`${this._quoteExecutable(manualDotnet)} --version`] : []),
            'dotnet --version',
            'dotnet --info',
          ].filter((value, index, array) => array.indexOf(value) === index),
        });
        break;
      }
      case 'installJava': {
        const javaInstallUrl =
          process.platform === 'darwin'
            ? 'https://adoptium.net/temurin/releases/?os=mac'
            : process.platform === 'win32'
              ? 'https://adoptium.net/temurin/releases/?os=windows'
              : 'https://adoptium.net/temurin/releases/?os=linux';
        vscode.env.openExternal(vscode.Uri.parse(javaInstallUrl));
        vscode.window.showInformationMessage(
          'Opening Temurin (Eclipse Adoptium) — recommended JDK 21+ for Spring Boot.'
        );
        break;
      }
      case 'installMaven': {
        if (process.platform === 'linux') {
          runCommandsInTerminal({
            name: 'Install Maven',
            commands: ['sudo apt-get update && sudo apt-get install -y maven'],
          });
          vscode.window.showInformationMessage('Installing Maven via apt…');
        } else if (process.platform === 'darwin') {
          runCommandsInTerminal({
            name: 'Install Maven',
            commands: ['brew install maven'],
          });
          vscode.window.showInformationMessage('Installing Maven via Homebrew…');
        } else {
          vscode.env.openExternal(vscode.Uri.parse('https://maven.apache.org/download.cgi'));
        }
        setTimeout(async () => {
          const newStatus = await this._checkInstallationStatus();
          this._safePostMessage({ command: 'statusUpdate', status: newStatus });
        }, 12000);
        break;
      }
      case 'installGradle': {
        if (process.platform === 'linux') {
          runCommandsInTerminal({
            name: 'Install Gradle',
            commands: ['sudo apt-get update && sudo apt-get install -y gradle'],
          });
          vscode.window.showInformationMessage('Installing Gradle via apt…');
        } else if (process.platform === 'darwin') {
          runCommandsInTerminal({
            name: 'Install Gradle',
            commands: ['brew install gradle'],
          });
          vscode.window.showInformationMessage('Installing Gradle via Homebrew…');
        } else {
          vscode.env.openExternal(vscode.Uri.parse('https://gradle.org/install/'));
        }
        setTimeout(async () => {
          const newStatus = await this._checkInstallationStatus();
          this._safePostMessage({ command: 'statusUpdate', status: newStatus });
        }, 12000);
        break;
      }
      case 'verifyJavaEnv': {
        // Deep Java env probe: java, mvn, gradle + JAVA_HOME check
        const path = await import('path');
        const fs = await import('fs-extra');
        const prefs = this._getSetupPreferences();
        const manualJava = prefs.manualPaths.java;
        const javaCmds: string[] = [];

        if (manualJava) {
          javaCmds.push(`${this._quoteExecutable(manualJava)} -version`);
        }
        if (process.env.JAVA_HOME) {
          const jhJava = path.join(
            process.env.JAVA_HOME,
            'bin',
            process.platform === 'win32' ? 'java.exe' : 'java'
          );
          if (await fs.pathExists(jhJava)) {
            javaCmds.push(`${this._quoteExecutable(jhJava)} -version`);
          }
        }
        javaCmds.push('java -version', 'mvn --version', 'gradle --version');
        if (process.env.JAVA_HOME) {
          javaCmds.push(`echo JAVA_HOME=${process.env.JAVA_HOME}`);
        }
        runCommandsInTerminal({
          name: 'Verify Java Environment',
          commands: [...new Set(javaCmds)],
        });
        break;
      }
      case 'verifyJava': {
        const prefs = this._getSetupPreferences();
        const manualJava = prefs.manualPaths.java;
        const path = await import('path');
        const javaHome = process.env.JAVA_HOME;
        const javaHomeBin = javaHome
          ? path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
          : null;
        runCommandsInTerminal({
          name: 'Verify Java',
          commands: [
            ...(manualJava ? [`${this._quoteExecutable(manualJava)} -version`] : []),
            ...(javaHomeBin ? [`${this._quoteExecutable(javaHomeBin)} -version`] : []),
            'java -version',
          ].filter((v, i, a) => a.indexOf(v) === i),
        });
        break;
      }
      case 'verifyMaven': {
        const prefs = this._getSetupPreferences();
        const manualMaven = prefs.manualPaths.maven;
        const mavenHome = process.env.MAVEN_HOME || process.env.M2_HOME;
        const path = await import('path');
        const mavenHomeBin = mavenHome
          ? path.join(mavenHome, 'bin', process.platform === 'win32' ? 'mvn.cmd' : 'mvn')
          : null;
        runCommandsInTerminal({
          name: 'Verify Maven',
          commands: [
            ...(manualMaven ? [`${this._quoteExecutable(manualMaven)} --version`] : []),
            ...(mavenHomeBin ? [`${this._quoteExecutable(mavenHomeBin)} --version`] : []),
            'mvn --version',
          ].filter((v, i, a) => a.indexOf(v) === i),
        });
        break;
      }
      case 'verifyGradle': {
        const prefs = this._getSetupPreferences();
        const manualGradle = prefs.manualPaths.gradle;
        const gradleHome = process.env.GRADLE_HOME;
        const path = await import('path');
        const gradleHomeBin = gradleHome
          ? path.join(gradleHome, 'bin', process.platform === 'win32' ? 'gradle.bat' : 'gradle')
          : null;
        runCommandsInTerminal({
          name: 'Verify Gradle',
          commands: [
            ...(manualGradle ? [`${this._quoteExecutable(manualGradle)} --version`] : []),
            ...(gradleHomeBin ? [`${this._quoteExecutable(gradleHomeBin)} --version`] : []),
            'gradle --version',
          ].filter((v, i, a) => a.indexOf(v) === i),
        });
        break;
      }
      case 'getCacheStats': {
        try {
          const { requirementCache } = await import('../../utils/requirementCache.js');
          const stats = requirementCache.getStats();
          this._safePostMessage({ command: 'cacheStatsUpdate', stats });
        } catch {
          this._safePostMessage({ command: 'cacheStatsUpdate', stats: null });
        }
        break;
      }
    }
  }

  /**
   * Safely post a message to the webview if it hasn't been disposed
   */
  private _safePostMessage(message: unknown): void {
    const webview = this._webviewOverride ?? this._panel?.webview;
    if (this._isDisposing || !webview) {
      return;
    }
    try {
      webview.postMessage(message);
    } catch {
      // Silently ignore if webview is disposed
    }
  }

  private async _checkInstallationStatus() {
    const { execa } = await import('execa');
    const os = await import('os');
    const preferences = this._getSetupPreferences();

    const status = {
      platform: process.platform,
      isWindows: process.platform === 'win32',
      isMac: process.platform === 'darwin',
      isLinux: process.platform === 'linux',

      nodeInstalled: false,
      nodeVersion: null as string | null,
      npmInstalled: false,
      npmVersion: null as string | null,
      npmLocation: null as string | null,
      npmAvailableViaNpx: false,
      latestNpmVersion: null as string | null,

      pythonInstalled: false,
      pythonVersion: null as string | null,
      pythonNeedsUpgrade: false,
      pipInstalled: false,
      pipVersion: null as string | null,
      pipxInstalled: false,
      pipxVersion: null as string | null,
      poetryInstalled: false,
      poetryVersion: null as string | null,
      goInstalled: false,
      goVersion: null as string | null,
      goPath: null as string | null,
      javaInstalled: false,
      javaVersion: null as string | null,
      mavenInstalled: false,
      mavenVersion: null as string | null,
      gradleInstalled: false,
      gradleVersion: null as string | null,
      dotnetInstalled: false,
      dotnetVersion: null as string | null,
      dotnetPath: null as string | null,

      coreInstalled: false,
      coreVersion: null as string | null,
      coreInstallType: null as 'global' | 'workspace' | null,
      latestCoreVersion: null as string | null,
      latestCoreStable: null as string | null,
      latestCorePrerelease: null as string | null,
      manualPaths: preferences.manualPaths,
      installMethods: preferences.installMethods,
      detections: {} as Partial<Record<SetupToolKey | 'core' | 'cli', SetupDetection>>,
    };

    try {
      const result = await execa('node', ['--version'], {
        shell: status.isWindows,
        timeout: 2000,
      });
      status.nodeInstalled = true;
      status.nodeVersion = result.stdout.trim().replace('v', '');
    } catch {
      // ignore
    }

    const path = await import('path');

    const runVersionProbe = async (
      candidates: string[],
      args: string[],
      parser: (output: string) => string | null
    ): Promise<{ cmd: string; version: string } | null> => {
      for (const cmd of candidates) {
        if (!cmd || !cmd.trim()) {
          continue;
        }
        const useShell = status.isWindows && !cmd.includes('\\') && !cmd.includes('/');
        try {
          const result = await execa(cmd, args, {
            shell: useShell,
            timeout: 2500,
          });
          const output = `${result.stdout || ''} ${result.stderr || ''}`.trim();
          const parsed = parser(output);
          if (parsed) {
            return { cmd, version: parsed };
          }
        } catch {
          continue;
        }
      }
      return null;
    };

    const goCandidates = status.isWindows
      ? [
          preferences.manualPaths.go || '',
          'go',
          'C:\\Go\\bin\\go.exe',
          'C:\\Program Files\\Go\\bin\\go.exe',
          process.env.GOROOT ? path.join(process.env.GOROOT, 'bin', 'go.exe') : '',
        ]
      : [
          preferences.manualPaths.go || '',
          'go',
          '/usr/local/go/bin/go',
          '/snap/bin/go',
          path.join(os.homedir(), 'go', 'bin', 'go'),
          process.env.GOROOT ? path.join(process.env.GOROOT, 'bin', 'go') : '',
        ];

    const goProbe = await runVersionProbe(goCandidates, ['version'], (output) => {
      const match = output.match(/go version go([\d.]+)/i);
      return match?.[1] || null;
    });
    if (goProbe) {
      status.goInstalled = true;
      status.goVersion = goProbe.version;
      status.goPath = goProbe.cmd;
      status.detections.go = this._buildDetection(goProbe.cmd, preferences.manualPaths.go);
    }

    const dotnetCandidates = status.isWindows
      ? [
          preferences.manualPaths.dotnet || '',
          'dotnet',
          'C:\\Program Files\\dotnet\\dotnet.exe',
          process.env.DOTNET_ROOT ? path.join(process.env.DOTNET_ROOT, 'dotnet.exe') : '',
        ]
      : [
          preferences.manualPaths.dotnet || '',
          'dotnet',
          '/usr/bin/dotnet',
          '/usr/local/bin/dotnet',
          process.env.DOTNET_ROOT ? path.join(process.env.DOTNET_ROOT, 'dotnet') : '',
        ];

    const dotnetProbe = await runVersionProbe(dotnetCandidates, ['--version'], (output) => {
      const match = output.match(/(\d+\.\d+\.\d+)/);
      return match?.[1] || null;
    });
    if (dotnetProbe) {
      status.dotnetInstalled = true;
      status.dotnetVersion = dotnetProbe.version;
      status.dotnetPath = dotnetProbe.cmd;
      status.detections.dotnet = this._buildDetection(
        dotnetProbe.cmd,
        preferences.manualPaths.dotnet
      );
    }

    const javaCandidates = status.isWindows
      ? [
          preferences.manualPaths.java || '',
          'java',
          process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'java.exe') : '',
        ]
      : [
          preferences.manualPaths.java || '',
          'java',
          process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'java') : '',
          '/usr/bin/java',
          '/usr/local/bin/java',
          '/usr/lib/jvm/temurin-21/bin/java',
          '/usr/lib/jvm/java-21-openjdk-amd64/bin/java',
          '/usr/lib/jvm/java-17-openjdk-amd64/bin/java',
          path.join(os.homedir(), '.sdkman', 'candidates', 'java', 'current', 'bin', 'java'),
        ];

    const javaProbe = await runVersionProbe(javaCandidates, ['-version'], (output) => {
      const match = output.match(/version\s+"([^"]+)"/i);
      return match?.[1] || null;
    });
    if (javaProbe) {
      status.javaInstalled = true;
      status.javaVersion = javaProbe.version;
      status.detections.java = this._buildDetection(javaProbe.cmd, preferences.manualPaths.java);
    }

    const mavenCandidates = status.isWindows
      ? [
          preferences.manualPaths.maven || '',
          'mvn',
          process.env.MAVEN_HOME ? path.join(process.env.MAVEN_HOME, 'bin', 'mvn.cmd') : '',
          process.env.M2_HOME ? path.join(process.env.M2_HOME, 'bin', 'mvn.cmd') : '',
        ]
      : [
          preferences.manualPaths.maven || '',
          'mvn',
          process.env.MAVEN_HOME ? path.join(process.env.MAVEN_HOME, 'bin', 'mvn') : '',
          process.env.M2_HOME ? path.join(process.env.M2_HOME, 'bin', 'mvn') : '',
          path.join(os.homedir(), '.sdkman', 'candidates', 'maven', 'current', 'bin', 'mvn'),
        ];

    const mavenProbe = await runVersionProbe(mavenCandidates, ['-version'], (output) => {
      const match = output.match(/Apache Maven\s+([\d.]+)/i);
      return match?.[1] || null;
    });
    if (mavenProbe) {
      status.mavenInstalled = true;
      status.mavenVersion = mavenProbe.version;
      status.detections.maven = this._buildDetection(mavenProbe.cmd, preferences.manualPaths.maven);
    }

    const gradleCandidates = status.isWindows
      ? [
          preferences.manualPaths.gradle || '',
          'gradle',
          process.env.GRADLE_HOME ? path.join(process.env.GRADLE_HOME, 'bin', 'gradle.bat') : '',
        ]
      : [
          preferences.manualPaths.gradle || '',
          'gradle',
          process.env.GRADLE_HOME ? path.join(process.env.GRADLE_HOME, 'bin', 'gradle') : '',
          path.join(os.homedir(), '.sdkman', 'candidates', 'gradle', 'current', 'bin', 'gradle'),
        ];

    const gradleProbe = await runVersionProbe(gradleCandidates, ['--version'], (output) => {
      const match = output.match(/Gradle\s+([\d.]+)/i);
      return match?.[1] || null;
    });
    if (gradleProbe) {
      status.gradleInstalled = true;
      status.gradleVersion = gradleProbe.version;
      status.detections.gradle = this._buildDetection(
        gradleProbe.cmd,
        preferences.manualPaths.gradle
      );
    }

    for (const npmInvocation of discoverPackageRunnerInvocations(
      'npm',
      process.platform,
      process.env,
      os.homedir()
    )) {
      try {
        const listResult = await execa(
          npmInvocation.command,
          [...npmInvocation.prefixArgs, 'list', '-g', 'workspai', '--depth=0'],
          {
            shell: status.isWindows,
            timeout: 3500,
            reject: false,
            env: buildPackageRunnerInvocationEnv(npmInvocation),
          }
        );
        const version = parseGlobalNpmPackageVersionOutput(listResult.stdout || '');
        if (listResult.exitCode === 0 && listResult.stdout.includes('workspai@') && version) {
          status.npmVersion = version;
          status.npmInstalled = true;
          status.npmLocation = npmInvocation.command;
          status.detections.cli = {
            source: 'package-manager',
            command: `${npmInvocation.command} list -g workspai --depth=0`,
            note: 'Detected as a global npm package, including Node version-manager installs.',
          };
          break;
        }
      } catch {
        continue;
      }
    }

    // Check if Workspai is available via npx (even if not globally installed).
    if (!status.npmInstalled) {
      for (const npxInvocation of discoverPackageRunnerInvocations(
        'npx',
        process.platform,
        process.env,
        os.homedir()
      )) {
        try {
          const npxResult = await execa(
            npxInvocation.command,
            [...npxInvocation.prefixArgs, ...buildNpxRapidkitVersionProbeArgs()],
            {
              shell: status.isWindows,
              timeout: 5000,
              reject: false,
              env: buildPackageRunnerInvocationEnv(npxInvocation),
            }
          );
          const parsedVersion = parseNpmCliVersionOutput(npxResult.stdout);
          if (npxResult.exitCode === 0 && parsedVersion) {
            status.npmVersion = parsedVersion;
            status.npmAvailableViaNpx = true;
            status.npmLocation = npxInvocation.command;
            status.detections.cli = {
              source: 'package-manager',
              command: buildRapidkitDisplayCommand(['--version']),
              note: 'CLI is executable through npx; a global install is optional.',
            };
            break;
          }
        } catch {
          continue;
        }
      }
    }

    const pythonCommands = [
      ...(status.isWindows
        ? [preferences.manualPaths.python || '', 'py', 'python3', 'python']
        : [
            preferences.manualPaths.python || '',
            'python3',
            'python',
            'python3.10',
            'python3.11',
            'python3.12',
            'python3.13',
          ]),
      ...discoverPythonExecutableCandidates(process.platform, process.env, os.homedir()),
    ].filter((value, index, values) => Boolean(value.trim()) && values.indexOf(value) === index);

    for (const cmd of pythonCommands) {
      try {
        const result = await execa(cmd, ['--version'], {
          shell: status.isWindows,
          timeout: 2000,
        });
        status.pythonInstalled = true;
        const versionString = result.stdout.trim().replace('Python ', '');
        status.pythonVersion = versionString;
        status.detections.python = this._buildDetection(cmd, preferences.manualPaths.python);

        const versionMatch = versionString.match(/^(\d+)\.(\d+)/);
        if (versionMatch) {
          const major = parseInt(versionMatch[1]);
          const minor = parseInt(versionMatch[2]);
          if (major < 3 || (major === 3 && minor < 10)) {
            status.pythonNeedsUpgrade = true;
          }
        }
        break;
      } catch {
        continue;
      }
    }

    if (status.pythonInstalled) {
      const pipVariants = status.isWindows
        ? [
            ...(preferences.manualPaths.pip
              ? [{ cmd: preferences.manualPaths.pip, args: ['--version'] }]
              : []),
            { cmd: 'py', args: ['-m', 'pip', '--version'] },
            { cmd: 'pip3', args: ['--version'] },
            { cmd: 'pip', args: ['--version'] },
          ]
        : [
            ...(preferences.manualPaths.pip
              ? [{ cmd: preferences.manualPaths.pip, args: ['--version'] }]
              : []),
            { cmd: 'pip3', args: ['--version'] },
            { cmd: 'pip', args: ['--version'] },
            ...pythonCommands.map((cmd) => ({ cmd, args: ['-m', 'pip', '--version'] })),
          ];

      for (const variant of pipVariants) {
        try {
          const result = await execa(variant.cmd, variant.args, {
            shell: status.isWindows,
            timeout: 3000,
          });
          status.pipInstalled = true;
          const versionMatch = result.stdout.match(/pip ([\d.]+)/);
          status.pipVersion = versionMatch ? versionMatch[1] : 'unknown';
          status.detections.pip = this._buildDetection(variant.cmd, preferences.manualPaths.pip);
          break;
        } catch {
          continue;
        }
      }
    }

    if (status.pythonInstalled && status.pipInstalled) {
      try {
        const result = await execa(preferences.manualPaths.pipx || 'pipx', ['--version'], {
          shell: status.isWindows,
          timeout: 3000,
        });
        status.pipxInstalled = true;
        status.pipxVersion =
          result.stdout.match(/pipx ([\d.]+)/)?.[1] ||
          result.stdout.match(/([\d.]+)/)?.[1] ||
          'unknown';
        status.detections.pipx = this._buildDetection(
          preferences.manualPaths.pipx || 'pipx',
          preferences.manualPaths.pipx
        );
      } catch {
        if (status.isWindows) {
          try {
            const fallback = await execa('python', ['-m', 'pipx', '--version'], {
              shell: false,
              timeout: 3000,
            });
            status.pipxInstalled = true;
            status.pipxVersion =
              fallback.stdout.match(/pipx ([\d.]+)/)?.[1] ||
              fallback.stdout.match(/([\d.]+)/)?.[1] ||
              'unknown';
            status.detections.pipx = {
              source: 'fallback',
              command: 'python -m pipx --version',
              note: 'pipx works through Python module invocation.',
            };
          } catch {
            status.pipxInstalled = false;
          }
        } else {
          status.pipxInstalled = false;
        }
      }
    }

    if (status.pythonInstalled && status.pipInstalled) {
      const poetryCandidates = status.isWindows
        ? [
            ...(preferences.manualPaths.poetry
              ? [{ cmd: preferences.manualPaths.poetry, args: ['--version'], shell: false }]
              : []),
            { cmd: 'poetry', args: ['--version'], shell: false },
            { cmd: 'python', args: ['-m', 'poetry', '--version'], shell: false },
            { cmd: 'py', args: ['-3', '-m', 'poetry', '--version'], shell: false },
            {
              cmd: path.join(process.env.APPDATA || '', 'Python', 'Scripts', 'poetry.exe'),
              args: ['--version'],
              shell: false,
            },
            {
              cmd: path.join(
                process.env.USERPROFILE || '',
                'AppData',
                'Roaming',
                'Python',
                'Scripts',
                'poetry.exe'
              ),
              args: ['--version'],
              shell: false,
            },
            {
              cmd: path.join(process.env.USERPROFILE || '', '.local', 'bin', 'poetry.exe'),
              args: ['--version'],
              shell: false,
            },
          ]
        : [
            ...(preferences.manualPaths.poetry
              ? [{ cmd: preferences.manualPaths.poetry, args: ['--version'], shell: false }]
              : []),
            { cmd: 'poetry', args: ['--version'], shell: false },
            {
              cmd: path.join(os.homedir(), '.local', 'bin', 'poetry'),
              args: ['--version'],
              shell: false,
            },
            { cmd: 'python3', args: ['-m', 'poetry', '--version'], shell: false },
            { cmd: 'python', args: ['-m', 'poetry', '--version'], shell: false },
          ];

      let poetryDetected = false;
      for (const candidate of poetryCandidates) {
        if (!candidate.cmd || !candidate.cmd.trim()) {
          continue;
        }
        try {
          const result = await execa(candidate.cmd, candidate.args, {
            shell: candidate.shell,
            timeout: 3000,
          });
          status.poetryInstalled = true;
          status.poetryVersion =
            result.stdout.match(/Poetry .*version ([\d.]+)/)?.[1] ||
            result.stdout.match(/([\d.]+)/)?.[1] ||
            'unknown';
          status.detections.poetry = this._buildDetection(
            candidate.cmd,
            preferences.manualPaths.poetry
          );
          poetryDetected = true;
          break;
        } catch {
          continue;
        }
      }

      if (!poetryDetected) {
        status.poetryInstalled = false;
      }
    }

    type CoreDetectResult = {
      version: string;
      installType: 'global' | 'workspace';
      source: string;
    };

    const looksLikeCoreCliOutput = (output: string): boolean => {
      const normalized = (output || '').toLowerCase();
      return (
        normalized.includes('rapidkit version') ||
        normalized.includes('rapidkit core cli') ||
        normalized.includes('global commands:') ||
        normalized.includes('rapidkit-core')
      );
    };

    const detectViaPipxList = async (): Promise<CoreDetectResult | null> => {
      try {
        const listResult = await execa('pipx', ['list'], {
          shell: status.isWindows,
          timeout: 4000,
          reject: false,
        });
        const listOutput = listResult.stdout + listResult.stderr;
        const version = parsePipxRapidkitCoreVersion(listOutput);
        if (version) {
          return {
            version,
            installType: 'global',
            source: 'pipx-list',
          };
        }
      } catch {
        // ignore
      }
      return null;
    };

    const detectViaPipxVenv = async (): Promise<CoreDetectResult | null> => {
      if (status.isWindows) {
        return null;
      }

      try {
        const fs = await import('fs-extra');
        const path = await import('path');
        const venvPython = path.join(
          os.homedir(),
          '.local',
          'share',
          'pipx',
          'venvs',
          'rapidkit-core',
          'bin',
          'python'
        );
        if (!(await fs.pathExists(venvPython))) {
          return null;
        }
        const result = await execa(
          venvPython,
          ['-c', 'import rapidkit_core; print(rapidkit_core.__version__)'],
          { timeout: 2500 }
        );
        const version = result.stdout.trim();
        if (version) {
          return { version, installType: 'global', source: 'pipx-venv' };
        }
      } catch {
        // ignore
      }
      return null;
    };

    const detectViaRapidkitOnPath = async (): Promise<CoreDetectResult | null> => {
      try {
        const cmdResult = await execa('rapidkit', ['--version'], {
          shell: status.isWindows,
          timeout: 2500,
          reject: false,
        });
        const rawOutput = (cmdResult.stdout || '').trim();
        let looksLikeCore = looksLikeCoreCliOutput(rawOutput);

        // If --version is ambiguous (e.g., bare semver from npm CLI), validate via --help.
        if (!looksLikeCore) {
          try {
            const helpResult = await execa('rapidkit', ['--help'], {
              shell: status.isWindows,
              timeout: 3000,
              reject: false,
            });
            looksLikeCore = looksLikeCoreCliOutput(helpResult.stdout || '');
          } catch {
            looksLikeCore = false;
          }
        }

        if (!looksLikeCore) {
          return null;
        }

        const version = parseRapidkitCoreVersion(rawOutput);
        if (!version) {
          return null;
        }

        let resolvedPath = '';
        try {
          const whichCmd = status.isWindows ? 'where' : 'which';
          const whichResult = await execa(whichCmd, ['rapidkit'], {
            shell: status.isWindows,
            timeout: 2000,
            reject: false,
          });
          resolvedPath = (whichResult.stdout || '').split(/\r?\n/)[0]?.trim() || '';
        } catch {
          // ignore
        }

        const lowerPath = resolvedPath.toLowerCase();
        const likelyGlobal =
          lowerPath.includes('/.local/bin/') ||
          lowerPath.includes('\\.local\\bin\\') ||
          lowerPath.includes('/pipx/') ||
          lowerPath.includes('\\pipx\\') ||
          lowerPath.includes('/pyenv/shims/') ||
          lowerPath.includes('\\pyenv\\shims\\');

        return {
          version,
          installType: likelyGlobal ? 'global' : 'workspace',
          source: 'rapidkit-path',
        };
      } catch {
        return null;
      }
    };

    const detectViaWorkspaceVenvRunner = async (): Promise<CoreDetectResult | null> => {
      try {
        const fs = await import('fs-extra');
        const path = await import('path');
        const workspaceFolders = vscode.workspace.workspaceFolders || [];

        for (const folder of workspaceFolders) {
          const workspacePath = folder.uri.fsPath;
          const candidates = status.isWindows
            ? [
                path.join(workspacePath, '.venv', 'Scripts', 'rapidkit.exe'),
                path.join(workspacePath, '.venv', 'Scripts', 'python.exe'),
              ]
            : [
                path.join(workspacePath, '.venv', 'bin', 'rapidkit'),
                path.join(workspacePath, '.venv', 'bin', 'python'),
              ];

          for (const candidate of candidates) {
            if (!(await fs.pathExists(candidate))) {
              continue;
            }

            const isPythonBinary = /python(?:\.exe)?$/i.test(candidate);
            const probeArgs = isPythonBinary
              ? ['-m', 'rapidkit', '--version', '--json']
              : ['--version', '--json'];

            try {
              const probe = await execa(candidate, probeArgs, {
                shell: false,
                timeout: 2500,
                reject: false,
                cwd: workspacePath,
              });

              if (probe.exitCode !== 0) {
                continue;
              }

              const raw = (probe.stdout || '').trim();
              if (!raw) {
                continue;
              }

              const version = parseRapidkitCoreVersion(raw);
              if (!version) {
                continue;
              }

              return {
                version,
                installType: 'workspace',
                source: 'workspace-venv-runner',
              };
            } catch {
              continue;
            }
          }
        }
      } catch {
        // ignore
      }

      return null;
    };

    const detectViaWorkspacePoetry = async (): Promise<CoreDetectResult | null> => {
      try {
        const result = await execa('poetry', ['show', 'rapidkit-core'], {
          shell: status.isWindows,
          reject: false,
          timeout: 3000,
        });
        if (result.exitCode !== 0) {
          return null;
        }
        const match = result.stdout.match(/version\s+:\s+(\S+)/);
        if (match?.[1]) {
          return { version: match[1], installType: 'workspace', source: 'poetry-show' };
        }
      } catch {
        // ignore
      }
      return null;
    };

    const detectViaPythonImport = async (): Promise<CoreDetectResult | null> => {
      for (const cmd of pythonCommands) {
        try {
          const result = await execa(
            cmd,
            ['-c', 'import rapidkit_core; print(rapidkit_core.__version__)'],
            {
              shell: status.isWindows,
              timeout: 2500,
              reject: true,
            }
          );
          const version = result.stdout.trim();
          if (version && !version.includes('command not found')) {
            const parsedVersion = parseRapidkitCoreVersion(version);
            if (parsedVersion) {
              return {
                version: parsedVersion,
                installType: 'global',
                source: `python-import:${cmd}`,
              };
            }
          }
        } catch {
          continue;
        }
      }
      return null;
    };

    const detectViaPipShow = async (): Promise<CoreDetectResult | null> => {
      const pipCommands = [
        ...pythonCommands.map((cmd) => ({ cmd, args: ['-m', 'pip', 'show', 'rapidkit-core'] })),
        ...(status.isWindows ? ['pip', 'pip3'] : ['pip3', 'pip']).map((cmd) => ({
          cmd,
          args: ['show', 'rapidkit-core'],
        })),
      ];
      for (const candidate of pipCommands) {
        try {
          const result = await execa(candidate.cmd, candidate.args, {
            shell: status.isWindows,
            timeout: 2500,
          });
          const versionMatch = result.stdout.match(/Version:\s*(\S+)/);
          const version = versionMatch?.[1] ? parseRapidkitCoreVersion(versionMatch[1]) : null;
          if (version) {
            return {
              version,
              installType: 'global',
              source: `pip-show:${candidate.cmd}`,
            };
          }
        } catch {
          continue;
        }
      }
      return null;
    };

    const detectViaConda = async (): Promise<CoreDetectResult | null> => {
      try {
        const result = await execa('conda', ['list', 'rapidkit-core'], {
          shell: status.isWindows,
          timeout: 3000,
        });
        if (!result.stdout.includes('rapidkit-core')) {
          return null;
        }
        const lines = result.stdout.split('\n');
        for (const line of lines) {
          if (line.includes('rapidkit-core')) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2) {
              return { version: parts[1], installType: 'workspace', source: 'conda-list' };
            }
          }
        }
      } catch {
        // ignore
      }
      return null;
    };

    const detectionMethods: Array<() => Promise<CoreDetectResult | null>> = [
      detectViaPipxList,
      detectViaPipxVenv,
      detectViaRapidkitOnPath,
      detectViaWorkspaceVenvRunner,
      detectViaWorkspacePoetry,
      detectViaPythonImport,
      detectViaPipShow,
      detectViaConda,
    ];

    for (const detect of detectionMethods) {
      try {
        const found = await detect();
        if (!found) {
          continue;
        }
        status.coreInstalled = true;
        status.coreVersion = found.version;
        status.coreInstallType = found.installType;
        status.detections.core = {
          source:
            found.source === 'workspace-venv-runner'
              ? 'workspace'
              : found.source.startsWith('python-import:') || found.source.startsWith('pip-show:')
                ? 'python'
                : found.source.startsWith('pipx-')
                  ? 'package-manager'
                  : found.installType === 'workspace'
                    ? 'workspace'
                    : 'path',
          command: found.source,
          note:
            found.installType === 'workspace'
              ? 'Core detected inside the current workspace environment.'
              : found.source.startsWith('python-import:') || found.source.startsWith('pip-show:')
                ? 'Core detected in the active Python environment.'
                : 'Core detected in a global/shared environment.',
        };
        break;
      } catch {
        continue;
      }
    }

    const fetchJson = (url: string): Promise<Record<string, unknown>> => {
      return new Promise((resolve, reject) => {
        https
          .get(url, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
              const redirectLocation = res.headers.location;
              if (!redirectLocation) {
                reject(new Error('Missing redirect location header.'));
                return;
              }
              fetchJson(redirectLocation).then(resolve).catch(reject);
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
                const parsed = JSON.parse(data);
                if (!parsed || typeof parsed !== 'object') {
                  reject(new Error('Invalid JSON payload.'));
                  return;
                }
                resolve(parsed as Record<string, unknown>);
              } catch (e) {
                reject(e);
              }
            });
          })
          .on('error', reject);
      });
    };

    try {
      try {
        // Force npm to fetch latest version without cache
        const npmResult = await execa(
          'npm',
          ['view', 'workspai', 'version', '--registry=https://registry.npmjs.org/'],
          { timeout: 8000 }
        );
        status.latestNpmVersion = npmResult.stdout.trim();
      } catch {
        try {
          const data = await fetchJson('https://registry.npmjs.org/workspai/latest');
          status.latestNpmVersion =
            typeof data.version === 'string' ? data.version : status.latestNpmVersion;
        } catch {
          // ignore
        }
      }

      try {
        const data = await fetchJson('https://pypi.org/pypi/rapidkit-core/json');

        const releasesObject =
          data.releases && typeof data.releases === 'object' ? data.releases : {};
        const releases = Object.keys(releasesObject);
        if (releases.length > 0) {
          const stableVersions: string[] = [];
          const prereleaseVersions: string[] = [];

          // Separate stable from pre-release
          releases.forEach((ver) => {
            if (ver.match(/\d+\.\d+\.\d+$/)) {
              // Pure X.Y.Z = stable
              stableVersions.push(ver);
            } else if (ver.match(/rc|alpha|beta|a\d|b\d/i)) {
              // Has RC/alpha/beta = prerelease
              prereleaseVersions.push(ver);
            }
          });

          // Sort helper
          const sortVersions = (versions: string[]) => {
            return versions.sort((a, b) => {
              const aParts = a.split(/[.-]/).map((p) => parseInt(p) || 0);
              const bParts = b.split(/[.-]/).map((p) => parseInt(p) || 0);
              for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
                const diff = (bParts[i] || 0) - (aParts[i] || 0);
                if (diff !== 0) {
                  return diff;
                }
              }
              return 0;
            });
          };

          if (stableVersions.length > 0) {
            status.latestCoreStable = sortVersions(stableVersions)[0];
          }
          if (prereleaseVersions.length > 0) {
            status.latestCorePrerelease = sortVersions(prereleaseVersions)[0];
          }

          // Fallback: use PyPI's reported latest
          const infoRecord =
            data.info && typeof data.info === 'object'
              ? (data.info as Record<string, unknown>)
              : undefined;
          const reported =
            infoRecord && typeof infoRecord.version === 'string' ? infoRecord.version : undefined;
          if (reported) {
            if (reported.match(/\d+\.\d+\.\d+$/)) {
              status.latestCoreStable = reported;
            }
          }

          // Backwards compat: latestCoreVersion = stable or prerelease
          status.latestCoreVersion = status.latestCoreStable || status.latestCorePrerelease;
        }
      } catch {
        // ignore
      }
    } catch {
      // ignore
    }

    return status;
  }

  private _quoteExecutable(value: string): string {
    return value.includes(' ') ? `"${value}"` : value;
  }

  private _buildDetection(command: string, manualPath?: string): SetupDetection {
    const normalizedCommand = (command || '').trim();
    const normalizedManual = (manualPath || '').trim();
    if (normalizedManual && normalizedCommand === normalizedManual) {
      return {
        source: 'manual-path',
        command: normalizedCommand,
        note: 'Detected using the manual path override.',
      };
    }

    const looksLikeBareCommand =
      normalizedCommand !== '' &&
      !normalizedCommand.includes('/') &&
      !normalizedCommand.includes('\\');

    return {
      source: looksLikeBareCommand ? 'path' : 'fallback',
      command: normalizedCommand,
      note: looksLikeBareCommand
        ? 'Detected from the current PATH environment.'
        : 'Detected via a fallback probe outside the current PATH.',
    };
  }

  private _getDefaultProfileForShell(shellName: string): string | undefined {
    const home = os.homedir();

    if (process.platform === 'win32') {
      const profileRoot = process.env.USERPROFILE || home;
      const documents = profileRoot ? path.join(profileRoot, 'Documents') : home;
      return path.join(documents, 'PowerShell', 'Microsoft.PowerShell_profile.ps1');
    }

    switch (shellName) {
      case 'zsh':
        return path.join(home, '.zshrc');
      case 'fish':
        return path.join(home, '.config', 'fish', 'config.fish');
      case 'bash':
      default:
        return path.join(home, '.bashrc');
    }
  }

  private _resolveShellProfile() {
    const shellRaw = process.env.SHELL || process.env.COMSPEC || 'unknown';
    const shellName = process.platform === 'win32' ? 'powershell' : path.basename(shellRaw);
    const targetFile = this._getDefaultProfileForShell(shellName);
    return {
      shell: shellRaw,
      shellName,
      targetFile,
    };
  }

  private _getPathDoctorEntries(): string[] {
    const rawPath = process.env.PATH || '';
    return rawPath
      .split(path.delimiter)
      .map((entry: string) => entry.trim())
      .filter((entry: string) => Boolean(entry));
  }

  private _commonPathEntries(): string[] {
    if (process.platform === 'win32') {
      const javaHome = process.env.JAVA_HOME;
      return [
        path.join(
          process.env.USERPROFILE || '',
          'AppData',
          'Local',
          'Programs',
          'Python',
          'Python311',
          'Scripts'
        ),
        path.join(process.env.USERPROFILE || '', '.local', 'bin'),
        ...(javaHome ? [path.join(javaHome, 'bin')] : []),
        path.join(process.env.USERPROFILE || '', '.sdkman', 'candidates', 'java', 'current', 'bin'),
        path.join(
          process.env.USERPROFILE || '',
          '.sdkman',
          'candidates',
          'maven',
          'current',
          'bin'
        ),
        path.join(
          process.env.USERPROFILE || '',
          '.sdkman',
          'candidates',
          'gradle',
          'current',
          'bin'
        ),
      ].filter(Boolean);
    }

    const javaHome = process.env.JAVA_HOME;
    const mavenHome = process.env.MAVEN_HOME || process.env.M2_HOME;
    const gradleHome = process.env.GRADLE_HOME;
    const sdkmanBase = path.join(os.homedir(), '.sdkman', 'candidates');

    return [
      path.join(os.homedir(), '.local', 'bin'),
      '/usr/local/go/bin',
      '/snap/bin',
      // Java locations
      ...(javaHome ? [path.join(javaHome, 'bin')] : []),
      '/usr/lib/jvm/temurin-21/bin',
      '/usr/lib/jvm/java-21-openjdk-amd64/bin',
      '/usr/lib/jvm/java-17-openjdk-amd64/bin',
      '/usr/local/lib/jvm/bin',
      path.join(sdkmanBase, 'java', 'current', 'bin'),
      // Maven locations
      ...(mavenHome ? [path.join(mavenHome, 'bin')] : []),
      path.join(sdkmanBase, 'maven', 'current', 'bin'),
      '/usr/local/maven/bin',
      // Gradle locations
      ...(gradleHome ? [path.join(gradleHome, 'bin')] : []),
      path.join(sdkmanBase, 'gradle', 'current', 'bin'),
      '/usr/local/gradle/bin',
      // asdf (Java)
      path.join(os.homedir(), '.asdf', 'shims'),
    ].filter(Boolean);
  }

  private _buildPathExportSnippet(entries: string[], shellName: string): string {
    if (process.platform === 'win32') {
      const joined = entries.join(';');
      return `[Environment]::SetEnvironmentVariable("Path", $env:Path + ";${joined}", "User")`;
    }

    if (shellName === 'fish') {
      return entries.map((entry) => `fish_add_path ${entry}`).join('\n');
    }

    return entries.map((entry) => `export PATH="$PATH:${entry}"`).join('\n');
  }

  private _normalizeSnippet(snippet: string): string[] {
    return snippet
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  private _suggestCommandsForReason(
    tool: SetupToolKey,
    reason: SetupCheckResult['reason'],
    report: PathDoctorReport,
    manualPath?: string
  ): string[] {
    const commands: string[] = [];
    const targetFile = report.targetFile;

    if (reason === 'path-missing' && manualPath && targetFile) {
      const entry = path.dirname(manualPath);
      commands.push(this._buildPathExportSnippet([entry], report.shellName));
      if (process.platform !== 'win32') {
        commands.push(`source ${targetFile}`);
      }
      return commands;
    }

    if (reason === 'not-executable' && manualPath && process.platform !== 'win32') {
      commands.push(`chmod +x ${this._quoteExecutable(manualPath)}`);
      return commands;
    }

    if (tool === 'go') {
      return process.platform === 'win32'
        ? ['winget install GoLang.Go']
        : ['sudo apt-get install golang-go'];
    }

    if (tool === 'poetry') {
      return process.platform === 'win32'
        ? ['python -m pip install --user poetry']
        : ['python3 -m pip install --user poetry'];
    }

    if (tool === 'pipx') {
      return process.platform === 'win32'
        ? ['python -m pip install --user pipx', 'python -m pipx ensurepath']
        : ['python3 -m pip install --user pipx', 'python3 -m pipx ensurepath'];
    }

    if (tool === 'python' || tool === 'pip') {
      return process.platform === 'win32'
        ? ['winget install Python.Python.3.13']
        : ['sudo apt-get install python3 python3-pip'];
    }

    if (tool === 'java') {
      return process.platform === 'win32'
        ? ['winget install EclipseAdoptium.Temurin.17.JDK']
        : ['sudo apt-get install openjdk-17-jdk'];
    }

    if (tool === 'maven') {
      return process.platform === 'win32'
        ? ['winget install Apache.Maven']
        : ['sudo apt-get install maven'];
    }

    if (tool === 'gradle') {
      return process.platform === 'win32'
        ? ['winget install Gradle.Gradle']
        : ['sudo apt-get install gradle'];
    }

    return [];
  }

  private async _runSetupCheck(
    tool: SetupToolKey,
    candidatePath: string | undefined,
    report: PathDoctorReport
  ): Promise<SetupCheckResult> {
    const fs = await import('fs-extra');
    const path = await import('path');
    const normalized =
      (candidatePath || '').trim() || this._getSetupPreferences().manualPaths[tool] || '';

    if (!normalized) {
      return {
        tool,
        command: '',
        ok: false,
        output: 'Manual path is empty.',
        summary: 'Enter a binary path first, then run Validate.',
        reason: 'manual-path-empty',
        suggestedCommands: [],
        targetFile: report.targetFile,
        requiresReload: 'none',
      };
    }

    if (!(await fs.pathExists(normalized))) {
      return {
        tool,
        command: normalized,
        ok: false,
        output: 'Path does not exist.',
        summary: `The selected ${tool} binary was not found at ${normalized}.`,
        reason: 'not-found',
        suggestedCommands: this._suggestCommandsForReason(tool, 'not-found', report, normalized),
        targetFile: report.targetFile,
        requiresReload: 'none',
      };
    }

    if (process.platform !== 'win32') {
      try {
        await fs.access(normalized, fsConstants.X_OK);
      } catch {
        return {
          tool,
          command: normalized,
          ok: false,
          output: 'File exists but is not executable.',
          summary: `The file exists, but VS Code cannot execute ${normalized}.`,
          reason: 'not-executable',
          suggestedCommands: this._suggestCommandsForReason(
            tool,
            'not-executable',
            report,
            normalized
          ),
          targetFile: report.targetFile,
          requiresReload: 'none',
        };
      }
    }

    const probeArgs = this._getSetupCheckArgs(tool);
    const result = await this._safeRun(normalized, probeArgs);
    const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();

    if (result.exitCode === 0) {
      const binDir = path.dirname(normalized);
      const inPath = report.pathEntries.includes(binDir);
      return {
        tool,
        command: `${this._quoteExecutable(normalized)} ${probeArgs.join(' ')}`.trim(),
        ok: true,
        output,
        summary: inPath
          ? `${tool} validated successfully and is reachable from PATH.`
          : `${tool} validated successfully through manual path override.`,
        reason: inPath ? 'unknown' : 'path-missing',
        suggestedCommands: inPath
          ? []
          : this._suggestCommandsForReason(tool, 'path-missing', report, normalized),
        targetFile: report.targetFile,
        requiresReload: inPath ? 'none' : 'shell',
      };
    }

    const lower = output.toLowerCase();
    let reason: SetupCheckResult['reason'] = 'unknown';
    if (lower.includes('permission denied') || lower.includes('eacces')) {
      reason = 'permission';
    } else if (lower.includes('command not found') || lower.includes('is not recognized')) {
      reason = 'command-not-found';
    }

    return {
      tool,
      command: `${this._quoteExecutable(normalized)} ${probeArgs.join(' ')}`.trim(),
      ok: false,
      output,
      summary:
        reason === 'permission'
          ? `The binary exists, but execution was blocked by permissions.`
          : `Validation failed for ${tool}. Review the output and suggested repair commands.`,
      reason,
      suggestedCommands: this._suggestCommandsForReason(tool, reason, report, normalized),
      targetFile: report.targetFile,
      requiresReload: 'none',
    };
  }

  private _getSetupCheckArgs(tool: SetupToolKey): string[] {
    switch (tool) {
      case 'java':
        return ['-version'];
      case 'go':
        return ['version'];
      default:
        return ['--version'];
    }
  }

  private async _safeRun(command: string, args: string[]) {
    try {
      return await run(command, args, {
        timeout: 3000,
        stdio: 'pipe',
        shell: false,
      });
    } catch {
      return {
        stdout: '',
        stderr: '',
        exitCode: 1,
      };
    }
  }

  private async _applyPathDoctorSuggestion(
    report: PathDoctorReport,
    suggestionId: string
  ): Promise<boolean> {
    const fs = await import('fs-extra');
    const suggestion = report.suggestions.find((item) => item.id === suggestionId);
    if (!suggestion?.targetFile || !suggestion.snippet.trim()) {
      return false;
    }

    const targetFile = suggestion.targetFile;
    await fs.ensureFile(targetFile);
    const current = (await fs.readFile(targetFile, 'utf8').catch(() => '')) || '';
    const lines = this._normalizeSnippet(suggestion.snippet);
    const missingLines = lines.filter((line) => !current.includes(line));

    if (missingLines.length === 0) {
      vscode.window.showInformationMessage('PATH snippet already exists in your shell profile.');
      return true;
    }

    const separator = current.endsWith('\n') || current.length === 0 ? '' : '\n';
    const nextContent = `${current}${separator}\n# Added by Workspai Setup\n${missingLines.join('\n')}\n`;
    await fs.writeFile(targetFile, nextContent, 'utf8');
    vscode.window.showInformationMessage(
      `PATH snippet applied to ${targetFile}. Reload your shell or VS Code window.`
    );
    return true;
  }

  private _defaultSetupPreferences(): SetupPreferences {
    return {
      manualPaths: {},
      installMethods: {
        python: 'recommended',
        core: 'recommended',
        cli: 'recommended',
        go: 'recommended',
        java: 'recommended',
        dotnet: 'recommended',
      },
      lastPathDoctorReport: null,
    };
  }

  private _getSetupPreferences(): SetupPreferences {
    const defaults = this._defaultSetupPreferences();
    const saved = this._context.globalState.get<SetupPreferences>(SETUP_PREFERENCES_KEY);
    if (!saved) {
      return defaults;
    }
    return {
      ...defaults,
      ...saved,
      manualPaths: {
        ...defaults.manualPaths,
        ...(saved.manualPaths || {}),
      },
      installMethods: {
        ...defaults.installMethods,
        ...(saved.installMethods || {}),
      },
    };
  }

  private _saveSetupPreferences(preferences: SetupPreferences) {
    void this._context.globalState.update(SETUP_PREFERENCES_KEY, preferences);
  }

  private async _setManualPath(tool: SetupToolKey, manualPath: string): Promise<boolean> {
    const fs = await import('fs-extra');
    const normalized = manualPath.trim();
    if (!normalized) {
      vscode.window.showWarningMessage('Manual path cannot be empty.');
      return false;
    }

    const exists = await fs.pathExists(normalized);
    if (!exists) {
      vscode.window.showWarningMessage(`Path not found: ${normalized}`);
      return false;
    }

    const prefs = this._getSetupPreferences();
    prefs.manualPaths = {
      ...prefs.manualPaths,
      [tool]: normalized,
    };
    this._saveSetupPreferences(prefs);
    vscode.window.showInformationMessage(`${tool} manual path saved.`);
    return true;
  }

  private _clearManualPath(tool: SetupToolKey) {
    const prefs = this._getSetupPreferences();
    const nextPaths = { ...prefs.manualPaths };
    delete nextPaths[tool];
    prefs.manualPaths = nextPaths;
    this._saveSetupPreferences(prefs);
  }

  private _setInstallMethod(key: InstallMethodKey, method: string) {
    const prefs = this._getSetupPreferences();
    prefs.installMethods = {
      ...prefs.installMethods,
      [key]: method,
    };
    this._saveSetupPreferences(prefs);
  }

  private _persistPathDoctorReport(report: PathDoctorReport) {
    const prefs = this._getSetupPreferences();
    prefs.lastPathDoctorReport = report;
    this._saveSetupPreferences(prefs);
  }

  private _runPathDoctor(): PathDoctorReport {
    const { shell, shellName, targetFile } = this._resolveShellProfile();
    const pathEntries = this._getPathDoctorEntries();
    const commonEntries = this._commonPathEntries();
    const missingCommonEntries = commonEntries.filter((entry) => !pathEntries.includes(entry));
    const suggestions: PathDoctorSuggestion[] = [];

    if (missingCommonEntries.length > 0) {
      suggestions.push({
        id: 'path-export',
        title:
          process.platform === 'win32'
            ? 'Add missing entries to your PowerShell profile'
            : `Append missing entries to ${targetFile || 'your shell profile'}`,
        snippet: this._buildPathExportSnippet(missingCommonEntries, shellName),
        targetFile,
        requiresReload: missingCommonEntries.length > 0 ? 'shell' : 'none',
        reason: 'Common tool locations exist outside the current PATH.',
      });
    }

    const notes = [
      `Detection priority: Manual Path > PATH > Fallbacks.`,
      `If Setup detects a tool but terminal says command not found, your shell profile likely needs a PATH update.`,
      targetFile
        ? `After editing ${targetFile}, reload the shell or VS Code window so integrated terminals inherit the new PATH.`
        : 'After editing your shell profile, reload the shell or VS Code window.',
    ];

    return {
      generatedAt: new Date().toISOString(),
      shell,
      shellName,
      targetFile,
      pathEntries,
      missingCommonEntries,
      suggestions,
      notes,
      needsShellReload: missingCommonEntries.length > 0,
    };
  }

  private _getReactHtmlContent(context: vscode.ExtensionContext): string {
    const rapidkitIconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'media', 'icons', 'rapidkit.svg')
    );
    const pythonIconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'media', 'icons', 'python.svg')
    );
    const pypiIconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'media', 'icons', 'pypi.svg')
    );
    const npmIconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'media', 'icons', 'npm.svg')
    );
    const goIconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'media', 'icons', 'go.svg')
    );
    const springIconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'media', 'icons', 'springboot.svg')
    );
    const poetryIconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'media', 'icons', 'poetry.svg')
    );
    const scriptUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview.js')
    );
    const cssUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview.css')
    );
    const cssFilePath = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview.css').fsPath;
    let inlineCss = '';
    try {
      inlineCss = readFileSync(cssFilePath, 'utf8');
    } catch {
      inlineCss = '';
    }
    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; connect-src 'none'; frame-src 'none'; media-src 'none'; object-src 'none'; style-src ${this._panel.webview.cspSource} 'unsafe-inline'; font-src ${this._panel.webview.cspSource}; img-src ${this._panel.webview.cspSource} https:; script-src 'nonce-${nonce}';"
  />
  <title>Workspai Setup & Installation</title>
  <link rel="icon" type="image/svg+xml" href="${rapidkitIconUri}" />
  ${inlineCss ? `<style>${inlineCss}</style>` : ''}
  <link rel="stylesheet" type="text/css" href="${cssUri}">
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.RAPIDKIT_ICON_URI = '${rapidkitIconUri}';
    window.PYTHON_ICON_URI = '${pythonIconUri}';
    window.PYPI_ICON_URI = '${pypiIconUri}';
    window.NPM_ICON_URI = '${npmIconUri}';
    window.GO_ICON_URI = '${goIconUri}';
    window.SPRING_ICON_URI = '${springIconUri}';
    window.POETRY_ICON_URI = '${poetryIconUri}';
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private _getNonce(): string {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  private _getHtmlContent(context: vscode.ExtensionContext): string {
    return this._getReactHtmlContent(context);
  }
}

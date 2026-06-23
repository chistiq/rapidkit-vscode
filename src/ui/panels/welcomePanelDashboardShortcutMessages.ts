import path from 'node:path';
import * as fs from 'fs-extra';
import * as vscode from 'vscode';

import type { AIModalContext } from '../../core/aiService';
import { getWebviewMessageDataRecord, readStringField } from '../../contracts/webviewProtocol';
import { runCommandsInTerminal } from '../../utils/terminalExecutor';

export type DashboardShortcutMessageHost = {
  context: vscode.ExtensionContext;
  showAiModal: (context: vscode.ExtensionContext, aiContext: AIModalContext) => void;
};

const DASHBOARD_SHORTCUT_WEBVIEW_COMMANDS = new Set([
  'openDocs',
  'openGitHub',
  'openMarketplace',
  'openUrl',
  'upgradeCore',
  'workspaceContract',
  'workspaceImportShare',
  'debugWithAI',
  'workspaceBrain',
  'aiForWorkspace',
  'aiForModule',
  'aiFixPreviewLite',
  'aiChangeImpactLite',
  'aiTerminalBridge',
  'aiWorkspaceMemoryWizard',
]);

export function isDashboardShortcutWebviewCommand(command: string): boolean {
  return DASHBOARD_SHORTCUT_WEBVIEW_COMMANDS.has(command);
}

export async function tryDispatchDashboardShortcutWebviewMessage(
  host: DashboardShortcutMessageHost,
  command: string,
  data: unknown
): Promise<boolean> {
  if (!isDashboardShortcutWebviewCommand(command)) {
    return false;
  }

  const payload = getWebviewMessageDataRecord({ command, data });

  switch (command) {
    case 'openDocs':
      await vscode.env.openExternal(vscode.Uri.parse('https://www.workspai.com/docs'));
      break;
    case 'openGitHub':
      await vscode.env.openExternal(vscode.Uri.parse('https://github.com/rapidkit/rapidkit'));
      break;
    case 'openMarketplace':
      await vscode.env.openExternal(
        vscode.Uri.parse('https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit')
      );
      break;
    case 'openUrl': {
      const url = readStringField(payload, 'url');
      if (url) {
        await vscode.env.openExternal(vscode.Uri.parse(url));
      }
      break;
    }
    case 'upgradeCore': {
      const workspacePath = readStringField(payload, 'path');
      const targetVersion = readStringField(payload, 'version');
      if (!workspacePath) {
        break;
      }

      const venvPath = path.join(workspacePath, '.venv');
      const hasVenv = await fs.pathExists(venvPath);

      runCommandsInTerminal({
        name: 'Upgrade RapidKit Core',
        cwd: workspacePath,
        commands: [hasVenv ? 'poetry update rapidkit-core' : 'pipx upgrade rapidkit-core'],
      });

      vscode.window.showInformationMessage(
        `Upgrading RapidKit Core${targetVersion ? ` to v${targetVersion}` : ''}...`,
        'OK'
      );
      break;
    }
    case 'workspaceContract':
      await vscode.commands.executeCommand('workspai.workspaceContract');
      break;
    case 'workspaceImportShare':
      await vscode.commands.executeCommand('workspai.importWorkspaceShareBundle');
      break;
    case 'debugWithAI':
      await vscode.commands.executeCommand('workspai.debugWithAI');
      break;
    case 'workspaceBrain':
      await vscode.commands.executeCommand('workspai.workspaceBrain');
      break;
    case 'aiForWorkspace':
      await vscode.commands.executeCommand('workspai.openWorkspaceAdvisor', {
        workspace: {
          name: readStringField(payload, 'workspaceName') || 'Workspace',
          path: readStringField(payload, 'workspacePath'),
        },
        source: 'dashboard',
        trigger: 'legacy-ai-for-workspace',
      });
      break;
    case 'aiForModule':
      host.showAiModal(host.context, {
        type: 'module',
        name: readStringField(payload, 'moduleName') || 'Module',
        moduleSlug: readStringField(payload, 'moduleSlug'),
      });
      break;
    case 'aiFixPreviewLite':
      await vscode.commands.executeCommand('workspai.aiFixPreviewLite', {
        source: 'dashboard',
        trigger: 'card_click',
      });
      break;
    case 'aiChangeImpactLite':
      await vscode.commands.executeCommand('workspai.aiChangeImpactLite', {
        source: 'dashboard',
        trigger: 'card_click',
      });
      break;
    case 'aiTerminalBridge':
      await vscode.commands.executeCommand('workspai.aiTerminalBridge', {
        source: 'dashboard',
        trigger: 'card_click',
      });
      break;
    case 'aiWorkspaceMemoryWizard':
      await vscode.commands.executeCommand('workspai.aiWorkspaceMemoryWizard', {
        source: 'dashboard',
        trigger: 'incident_studio',
      });
      break;
  }

  return true;
}

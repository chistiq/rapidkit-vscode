import * as vscode from 'vscode';

import { runRapidkitCommandsInTerminal } from '../utils/terminalExecutor';
import { gateRapidkitCliArgs } from './rapidkitEnterpriseCliGate';

export type GatedRapidkitTerminalOptions = {
  name: string;
  cwd?: string;
  env?: Record<string, string>;
  commands: string[][];
};

export async function runGatedRapidkitCommandsInTerminal(
  options: GatedRapidkitTerminalOptions
): Promise<boolean> {
  for (const args of options.commands) {
    const gate = await gateRapidkitCliArgs({
      args,
      cwd: options.cwd,
      featureLabel: options.name,
    });
    if (!gate.allowed) {
      const choice = await vscode.window.showWarningMessage(gate.error, 'Open Setup');
      if (choice === 'Open Setup') {
        await vscode.commands.executeCommand('workspai.openSetup');
      }
      return false;
    }
  }

  runRapidkitCommandsInTerminal(options);
  return true;
}

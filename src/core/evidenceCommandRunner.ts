import * as vscode from 'vscode';

import { resolveDashboardCommandContract } from './dashboardCommandContracts.js';
import { run } from '../utils/exec.js';
import { buildRapidkitDisplayCommand } from '../utils/platformCapabilities.js';

const OUTPUT_CHANNEL_NAME = 'Workspai Evidence';

let outputChannel: vscode.OutputChannel | undefined;

export function getWorkspaiEvidenceOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  }
  return outputChannel;
}

export type EvidenceCliRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  displayCommand: string;
};

function appendEvidenceLog(label: string, detail: string): void {
  const channel = getWorkspaiEvidenceOutputChannel();
  channel.appendLine(`[${new Date().toISOString()}] ${label}`);
  if (detail.trim()) {
    channel.appendLine(detail.trimEnd());
  }
  channel.appendLine('');
}

export async function runEvidenceCliCommand(options: {
  workspacePath: string;
  cliArgs: string[];
  label: string;
  env?: Record<string, string>;
  revealOutput?: boolean;
}): Promise<EvidenceCliRunResult> {
  const displayCommand = buildRapidkitDisplayCommand(options.cliArgs);

  appendEvidenceLog(`${options.label} · ${options.workspacePath}`, `$ ${displayCommand}`);

  const result = await run('npx', ['rapidkit', ...options.cliArgs], {
    cwd: options.workspacePath,
    env: {
      ...process.env,
      ...options.env,
    },
    timeout: 15 * 60 * 1000,
  });

  const stdout = typeof result.stdout === 'string' ? result.stdout : String(result.stdout ?? '');
  const stderr = typeof result.stderr === 'string' ? result.stderr : String(result.stderr ?? '');

  if (stdout.trim()) {
    appendEvidenceLog(`${options.label} · stdout`, stdout);
  }
  if (stderr.trim()) {
    appendEvidenceLog(`${options.label} · stderr`, stderr);
  }

  appendEvidenceLog(
    `${options.label} · exit ${result.exitCode ?? 1}`,
    result.exitCode === 0 ? 'Completed successfully.' : 'Command failed.'
  );

  if (options.revealOutput !== false && result.exitCode !== 0) {
    getWorkspaiEvidenceOutputChannel().show(true);
  }

  return {
    exitCode: result.exitCode ?? 1,
    stdout,
    stderr,
    displayCommand,
  };
}

export async function runDashboardEvidenceContractCli(options: {
  command: string;
  workspacePath: string;
  workspaceName?: string;
  data?: Record<string, unknown>;
}): Promise<EvidenceCliRunResult | undefined> {
  const contract = resolveDashboardCommandContract(options.command);
  if (!contract?.cliArgs?.length) {
    return undefined;
  }

  if (contract.executionMode !== 'terminal-rapidkit') {
    return undefined;
  }

  const cliArgs = [...contract.cliArgs];
  if (
    options.command === 'workspaceBootstrap' &&
    typeof options.data?.profile === 'string' &&
    options.data.profile.trim()
  ) {
    cliArgs.push('--profile', options.data.profile.trim());
  }

  return runEvidenceCliCommand({
    workspacePath: options.workspacePath,
    cliArgs,
    label: contract.label,
  });
}

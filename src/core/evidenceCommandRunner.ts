import * as vscode from 'vscode';

import { resolveDashboardCommandContract } from './dashboardCommandContracts.js';
import { run } from '../utils/exec.js';
import {
  buildRapidkitExecutionSpec,
  warmRapidkitNpmPackageResolution,
} from '../utils/platformCapabilities.js';
import { gateRapidkitCliArgs } from './rapidkitEnterpriseCliGate.js';

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

export function revealWorkspaiEvidenceOutputForUser(): void {
  const channel = getWorkspaiEvidenceOutputChannel();
  channel.appendLine(
    `[${new Date().toISOString()}] Opened from Workspai dashboard. Background CLI runs append stdout/stderr here.`
  );
  channel.appendLine(
    'If this panel looks empty, run a dashboard card (Run) or use Open artifact file for JSON on disk.'
  );
  channel.appendLine('');
  channel.show(true);
}

export async function runEvidenceCliCommand(options: {
  workspacePath: string;
  cliArgs: string[];
  label: string;
  env?: Record<string, string>;
  revealOutput?: boolean;
}): Promise<EvidenceCliRunResult> {
  const gate = await gateRapidkitCliArgs({
    args: options.cliArgs,
    cwd: options.workspacePath,
    featureLabel: options.label,
  });
  if (!gate.allowed) {
    appendEvidenceLog(`${options.label} · blocked`, gate.error);
    return {
      exitCode: 1,
      stdout: '',
      stderr: gate.error,
      displayCommand: `rapidkit ${options.cliArgs.join(' ')}`.trim(),
    };
  }

  const execution = buildRapidkitExecutionSpec(options.cliArgs);
  const displayCommand = execution.displayCommand;

  appendEvidenceLog(`${options.label} · ${options.workspacePath}`, `$ ${displayCommand}`);
  await warmRapidkitNpmPackageResolution();

  const result = await run(execution.command, execution.args, {
    cwd: options.workspacePath,
    env: {
      ...process.env,
      ...options.env,
    },
    shell: execution.shell,
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

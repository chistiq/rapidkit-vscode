import * as vscode from 'vscode';
import { buildRapidkitCommand, buildShellCommand, quoteShellArg } from './platformCapabilities';
import { resolveCoreRuntime } from './coreRuntimeResolver';

export type TerminalExecutionOptions = {
  name: string;
  cwd?: string;
  env?: Record<string, string>;
  commands: string[];
};

export type TerminalOpenOptions = {
  name: string;
  cwd?: string;
  env?: Record<string, string>;
};

export function openTerminal(options: TerminalOpenOptions): vscode.Terminal {
  const terminal = vscode.window.createTerminal({
    name: options.name,
    cwd: options.cwd,
    env: options.env,
  });

  terminal.show();
  return terminal;
}

export function runCommandsInTerminal(options: TerminalExecutionOptions): vscode.Terminal {
  const terminal = openTerminal(options);
  appendCommandsToTerminal(terminal, options.commands);

  return terminal;
}

export function appendCommandsToTerminal(terminal: vscode.Terminal, commands: string[]): void {
  for (const command of commands) {
    terminal.sendText(command);
  }
}

export function interruptTerminal(terminal: vscode.Terminal): void {
  terminal.sendText('\x03');
}

export function runRapidkitCommandsInTerminal(options: {
  name: string;
  cwd?: string;
  env?: Record<string, string>;
  commands: string[][];
}): vscode.Terminal {
  const builtCommands = options.commands.map((args) => buildRapidkitCommand(args));
  return runCommandsInTerminal({
    name: options.name,
    cwd: options.cwd,
    env: options.env,
    commands: builtCommands,
  });
}

export function buildCoreRapidkitShellCommand(executable: string, args: string[]): string {
  return [quoteShellArg(executable), ...args.map((arg) => quoteShellArg(arg))].join(' ');
}

export async function runCoreRapidkitCommandsInTerminal(options: {
  name: string;
  cwd: string;
  env?: Record<string, string>;
  commands: string[][];
}): Promise<vscode.Terminal> {
  const runtime = await resolveCoreRuntime(options.cwd);
  const builtCommands = options.commands.map((args) =>
    runtime.executable
      ? buildCoreRapidkitShellCommand(runtime.executable, args)
      : buildRapidkitCommand(args)
  );

  return runCommandsInTerminal({
    name: options.name,
    cwd: options.cwd,
    env: options.env,
    commands: builtCommands,
  });
}

export function runShellCommandInTerminal(options: {
  name: string;
  cwd?: string;
  env?: Record<string, string>;
  command: string;
  args?: string[];
}): vscode.Terminal {
  const built = buildShellCommand(options.command, options.args || []);
  return runCommandsInTerminal({
    name: options.name,
    cwd: options.cwd,
    env: options.env,
    commands: [built],
  });
}

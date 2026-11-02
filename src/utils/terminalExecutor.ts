import * as vscode from 'vscode';
import * as path from 'path';
import { resolveBundledCliRuntime } from '../core/bundledCliRuntime';
import {
  shouldRequestCliLogEventsForRapidkitTerminal,
  shouldTrackRapidkitEvidenceTerminal,
  trackWorkspaceEvidenceTerminal,
  withCliLogEventEnv,
} from '../core/evidenceTerminalTracker';
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
  preserveFocus?: boolean;
  cwd?: string;
  env?: Record<string, string>;
};

export function openTerminal(options: TerminalOpenOptions): vscode.Terminal {
  const terminal = vscode.window.createTerminal({
    name: options.name,
    cwd: options.cwd,
    env: options.env,
  });

  if (options.preserveFocus === undefined) {
    terminal.show();
  } else {
    terminal.show(options.preserveFocus);
  }
  return terminal;
}

export function runCommandsInTerminal(options: TerminalExecutionOptions): vscode.Terminal {
  const terminal = openTerminal(options);
  appendCommandsToTerminal(terminal, [
    ...(options.cwd ? [buildShellCommand('cd', [options.cwd])] : []),
    ...options.commands,
  ]);

  return terminal;
}

export function appendCommandsToTerminal(terminal: vscode.Terminal, commands: string[]): void {
  for (const command of commands) {
    sendTerminalInput(terminal, command);
  }
}

/** Send stdin without treating it as another shell command. */
export function sendTerminalInput(
  terminal: vscode.Terminal,
  text: string,
  addNewLine?: boolean
): void {
  const input: [string, boolean?] = addNewLine === undefined ? [text] : [text, addNewLine];
  terminal.sendText(...input);
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
  const shouldTrackEvidence = Boolean(options.cwd) && shouldTrackRapidkitEvidenceTerminal(options);
  const shouldRequestCliLogEvents = shouldRequestCliLogEventsForRapidkitTerminal(options);
  const requestedEnv = withCliLogEventEnv(options.env, shouldRequestCliLogEvents);
  const bundledRuntime = resolveBundledCliRuntime();
  const builtCommands = options.commands.map((args) =>
    bundledRuntime
      ? buildShellCommand(bundledRuntime.terminalCommand, args)
      : buildRapidkitCommand(args)
  );
  let terminalEnv = requestedEnv;
  if (bundledRuntime) {
    const configuredPathKey = Object.keys(requestedEnv ?? {}).find(
      (key) => key.toLowerCase() === 'path'
    );
    const inheritedPathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path');
    const pathKey = configuredPathKey ?? inheritedPathKey ?? 'PATH';
    const inheritedPath = requestedEnv?.[pathKey] ?? process.env[pathKey] ?? process.env.PATH ?? '';
    const pathEntries = inheritedPath
      .split(path.delimiter)
      .filter(Boolean)
      .filter((entry) => path.resolve(entry) !== path.resolve(bundledRuntime.terminalBin));
    terminalEnv = {
      ...(requestedEnv ?? {}),
      [pathKey]: [bundledRuntime.terminalBin, ...pathEntries].join(path.delimiter),
      WORKSPAI_EXTENSION_NODE: bundledRuntime.command,
      WORKSPAI_EXTENSION_CLI_ENTRY: bundledRuntime.entry,
    };
  }
  const terminal = runCommandsInTerminal({
    name: options.name,
    cwd: options.cwd,
    env: terminalEnv,
    commands: builtCommands,
  });

  if (options.cwd && shouldTrackEvidence) {
    trackWorkspaceEvidenceTerminal(terminal, options.cwd);
  }

  return terminal;
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
  if (!runtime.executable) {
    return runRapidkitCommandsInTerminal(options);
  }
  const builtCommands = options.commands.map((args) =>
    buildCoreRapidkitShellCommand(runtime.executable as string, args)
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

import * as vscode from 'vscode';

import {
  isCliLogEvent,
  shouldRefreshEvidenceForCliLogEvent,
  type CliLogEvent,
} from './cliLogEventContract';

const trackedEvidenceTerminals = new WeakMap<vscode.Terminal, { workspacePath: string }>();

const EVIDENCE_TERMINAL_HINT =
  /Workspace Model|Intelligence|Workspace Diff|Workspace Impact|Agent Context|Agent Grounding|Workspace Verify|Governance Pipeline|Analyze Workspace|Readiness|Workspace Sync|Workspace Run|Autopilot Release|Doctor|workspace run/i;

const WORKSPACE_SUBCOMMANDS_THAT_REFRESH_EVIDENCE = new Set([
  'model',
  'snapshot',
  'diff',
  'impact',
  'verify',
  'context',
  'agent-sync',
  'sync',
  'run',
  'policy',
]);

export function trackWorkspaceEvidenceTerminal(
  terminal: vscode.Terminal,
  workspacePath: string
): void {
  if (!workspacePath.trim()) {
    return;
  }
  trackedEvidenceTerminals.set(terminal, { workspacePath });
}

export function isWorkspaceEvidenceTerminalName(name: string | undefined): boolean {
  const normalized = name?.trim() ?? '';
  return (
    (normalized.startsWith('Workspai:') || normalized.startsWith('Workspai ')) &&
    EVIDENCE_TERMINAL_HINT.test(normalized)
  );
}

export function shouldTrackRapidkitEvidenceTerminal(options: {
  name: string;
  cwd?: string;
  commands: string[][];
}): boolean {
  if (!options.cwd?.trim()) {
    return false;
  }

  const commandProducesWorkspaceEvidence = options.commands.some((args) => {
    const [command, subcommand] = args;
    if (command === 'workspace') {
      return Boolean(subcommand && WORKSPACE_SUBCOMMANDS_THAT_REFRESH_EVIDENCE.has(subcommand));
    }
    if (command === 'doctor') {
      return subcommand === 'workspace';
    }
    if (command === 'autopilot') {
      return subcommand === 'release';
    }
    return command === 'analyze' || command === 'readiness' || command === 'pipeline';
  });

  if (commandProducesWorkspaceEvidence) {
    return true;
  }

  const commandIsKnownNonWorkspaceEvidence = options.commands.some((args) => {
    const [command, subcommand] = args;
    return command === 'doctor' && subcommand !== 'workspace';
  });

  if (commandIsKnownNonWorkspaceEvidence) {
    return false;
  }

  return isWorkspaceEvidenceTerminalName(options.name);
}

export function shouldRequestCliLogEventsForRapidkitTerminal(options: {
  name: string;
  cwd?: string;
  commands: string[][];
}): boolean {
  return shouldTrackRapidkitEvidenceTerminal(options);
}

export function withCliLogEventEnv(
  env: Record<string, string> | undefined,
  enabled: boolean
): Record<string, string> | undefined {
  if (!enabled) {
    return env;
  }

  return {
    ...(env ?? {}),
    RAPIDKIT_LOG_FORMAT: 'json',
  };
}

export function shouldRefreshEvidenceOnCliLogEvent(event: unknown): event is CliLogEvent {
  return isCliLogEvent(event) && shouldRefreshEvidenceForCliLogEvent(event);
}

export function shouldRefreshEvidenceOnTerminalClose(terminal: vscode.Terminal): boolean {
  if (trackedEvidenceTerminals.has(terminal)) {
    return true;
  }

  return isWorkspaceEvidenceTerminalName(terminal.name);
}

export function resolveWorkspacePathForEvidenceTerminal(
  terminal: vscode.Terminal
): string | undefined {
  return trackedEvidenceTerminals.get(terminal)?.workspacePath;
}

import { openTerminal, sendTerminalInput } from '../utils/terminalExecutor.js';
import crypto from 'node:crypto';
import path from 'node:path';
import { resolveStudioScopePath } from './studioScopePath.js';
import fs from 'fs-extra';
import * as vscode from 'vscode';
import type {
  StudioAgentToolContext,
  StudioAgentToolDefinition,
  StudioAgentToolResult,
} from './studioAgentToolRegistry.js';

type Entry = {
  id: string;
  sessionId: string;
  root: string;
  scope: string;
  terminal: vscode.Terminal;
  execution?: vscode.TerminalShellExecution;
  output: string;
  outputOffset: number;
  state: 'running' | 'exited' | 'closed';
  background: boolean;
  exitCode?: number;
  subscriptions: vscode.Disposable[];
  waiters: Set<() => void>;
  startupWaiters: Set<() => void>;
};
export class StudioInteractiveTerminalManager implements vscode.Disposable {
  private readonly entries = new Map<string, Entry>();
  private wake(entry: Entry): void {
    [...entry.waiters].forEach((wake) => wake());
  }
  private close(entry: Entry): void {
    entry.state = 'closed';
    entry.subscriptions.splice(0).forEach((subscription) => subscription.dispose());
    this.wake(entry);
    [...entry.startupWaiters].forEach((wake) => wake());
  }
  private appendOutput(entry: Entry, text: string): void {
    entry.output += text;
    if (entry.output.length > 64_000) {
      const removed = entry.output.length - 64_000;
      entry.outputOffset += removed;
      entry.output = entry.output.slice(removed);
    }
    this.wake(entry);
  }
  private owned(id: string, context: StudioAgentToolContext): Entry {
    const entry = this.entries.get(id);
    if (
      !entry ||
      entry.sessionId !== context.sessionId ||
      entry.root !== path.resolve(context.workspacePath) ||
      entry.scope !== path.resolve(context.projectPath ?? context.workspacePath)
    ) {
      throw new Error('Terminal is not owned by this session and workspace.');
    }
    return entry;
  }
  hasRunning(sessionId: string): boolean {
    return [...this.entries.values()].some(
      (entry) => entry.sessionId === sessionId && entry.state === 'running' && !entry.background
    );
  }
  cancelSession(sessionId: string): void {
    for (const entry of this.entries.values()) {
      if (entry.sessionId === sessionId && entry.state === 'running') {
        this.close(entry);
        entry.terminal.dispose();
      }
    }
  }
  private observation(entry: Entry, offset = 0): StudioAgentToolResult {
    const begin = Math.max(offset, entry.outputOffset);
    return {
      ok: true,
      output: {
        terminalId: entry.id,
        state: entry.state,
        background: entry.background,
        exitCode: entry.exitCode,
        output: entry.output.slice(begin - entry.outputOffset),
        offset: entry.outputOffset + entry.output.length,
        truncated: offset < entry.outputOffset,
        instruction:
          entry.state === 'running'
            ? 'Command is still running. Read output, supply necessary input, or use another tool while it runs. Do not claim it succeeded.'
            : entry.exitCode === undefined
              ? 'The terminal closed without an observed exit code. Do not treat closure as success.'
              : `Observed exit code: ${entry.exitCode}.`,
      },
    };
  }
  async start(
    raw: Record<string, unknown>,
    context: StudioAgentToolContext
  ): Promise<StudioAgentToolResult> {
    if (context.signal.aborted) {
      return { ok: false, error: 'Terminal command was cancelled before execution.' };
    }
    const command = typeof raw.command === 'string' ? raw.command.trim() : '';
    if (raw.background !== undefined && typeof raw.background !== 'boolean') {
      throw new Error('background must be a boolean.');
    }
    if (!command || command.length > 16_000 || command.includes('\0')) {
      throw new Error('Terminal command must contain 1 to 16000 characters without NUL bytes.');
    }
    const root = path.resolve(context.projectPath ?? context.workspacePath);
    const cwd = await fs.realpath(
      resolveStudioScopePath(context, typeof raw.cwd === 'string' ? raw.cwd : '.')
    );
    const canonicalRoot = await fs.realpath(root);
    const relative = path.relative(canonicalRoot, cwd);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Terminal directory must stay within the selected scope.');
    }
    if (this.hasRunning(context.sessionId)) {
      throw new Error(
        'This session already owns a running command. Read its output or stop it before starting another terminal command.'
      );
    }
    const terminal = openTerminal({ name: 'Workspai Assistant', cwd, preserveFocus: true });
    const entry: Entry = {
      id: crypto.randomUUID(),
      sessionId: context.sessionId,
      root: path.resolve(context.workspacePath),
      scope: path.resolve(context.projectPath ?? context.workspacePath),
      terminal,
      output: '',
      outputOffset: 0,
      state: 'running',
      background: raw.background === true,
      subscriptions: [],
      waiters: new Set(),
      startupWaiters: new Set(),
    };
    this.entries.set(entry.id, entry);
    entry.subscriptions.push(
      vscode.window.onDidCloseTerminal((closed) => {
        if (closed === terminal) {
          this.close(entry);
        }
      })
    );
    const integration =
      terminal.shellIntegration ??
      (await new Promise<vscode.TerminalShellIntegration | undefined>((resolve) => {
        const finish = (value: vscode.TerminalShellIntegration | undefined) => {
          clearTimeout(timer);
          subscription.dispose();
          context.signal.removeEventListener('abort', onAbort);
          entry.startupWaiters.delete(onAbort);
          resolve(value);
        };
        const subscription = vscode.window.onDidChangeTerminalShellIntegration((event) => {
          if (event.terminal === terminal) {
            finish(event.shellIntegration);
          }
        });
        const timer = setTimeout(() => finish(undefined), 5_000);
        const onAbort = () => finish(undefined);
        entry.startupWaiters.add(onAbort);
        context.signal.addEventListener('abort', onAbort, { once: true });
        if (context.signal.aborted || entry.state === 'closed') {
          onAbort();
        }
      }));
    if (!integration || context.signal.aborted || entry.state === 'closed') {
      this.close(entry);
      terminal.dispose();
      return {
        ok: false,
        error:
          'Terminal shell integration is unavailable or the request was cancelled. No command was sent. Enable VS Code shell integration, or use run-workspace-command / a registered host tool.',
      };
    }
    const abort = () => {
      this.close(entry);
      terminal.dispose();
    };
    context.signal.addEventListener('abort', abort, { once: true });
    entry.subscriptions.push({ dispose: () => context.signal.removeEventListener('abort', abort) });
    entry.subscriptions.push(
      vscode.window.onDidEndTerminalShellExecution((event) => {
        if (entry.state === 'running' && event.execution === entry.execution) {
          entry.state = 'exited';
          entry.exitCode = event.exitCode;
          context.signal.removeEventListener('abort', abort);
          this.wake(entry);
        }
      })
    );
    try {
      entry.execution = integration.executeCommand(command);
      const stream = entry.execution.read();
      void (async () => {
        try {
          for await (const chunk of stream) {
            this.appendOutput(entry, chunk);
          }
        } catch (error) {
          this.appendOutput(entry, `\nTerminal output stream failed: ${String(error)}`);
        }
      })();
    } catch (error) {
      this.close(entry);
      terminal.dispose();
      return {
        ok: false,
        error: `Terminal command could not start or its output could not be observed: ${String(error)}`,
      };
    }
    return { ...this.observation(entry), changed: true };
  }
  async read(
    raw: Record<string, unknown>,
    context: StudioAgentToolContext
  ): Promise<StudioAgentToolResult> {
    const entry = this.owned(String(raw.terminalId ?? ''), context);
    const offset =
      typeof raw.offset === 'number' && Number.isFinite(raw.offset)
        ? Math.max(0, Math.trunc(raw.offset))
        : 0;
    const started = Date.now();
    if (
      entry.state === 'running' &&
      offset >= entry.outputOffset + entry.output.length &&
      !context.signal.aborted
    ) {
      const waitMs =
        typeof raw.waitMs === 'number' && Number.isFinite(raw.waitMs)
          ? Math.min(30_000, Math.max(0, raw.waitMs))
          : 5_000;
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          context.signal.removeEventListener('abort', finish);
          entry.waiters.delete(finish);
          resolve();
        };
        const timer = setTimeout(finish, waitMs);
        entry.waiters.add(finish);
        context.signal.addEventListener('abort', finish, { once: true });
        if (
          context.signal.aborted ||
          entry.state !== 'running' ||
          offset < entry.outputOffset + entry.output.length
        ) {
          finish();
        }
      });
    }
    const result = this.observation(entry, offset);
    return {
      ...result,
      output: { ...(result.output as Record<string, unknown>), waitedMs: Date.now() - started },
    };
  }
  input(raw: Record<string, unknown>, context: StudioAgentToolContext): StudioAgentToolResult {
    const entry = this.owned(String(raw.terminalId ?? ''), context);
    if (entry.state !== 'running') {
      throw new Error('Terminal command is no longer running.');
    }
    if (typeof raw.text !== 'string' || raw.text.length > 8_000 || raw.text.includes('\0')) {
      throw new Error('Terminal input must be at most 8000 characters without NUL bytes.');
    }
    if (context.signal.aborted) {
      return { ok: false, error: 'Terminal input was cancelled.' };
    }
    sendTerminalInput(entry.terminal, raw.text, raw.addNewLine !== false);
    return { ...this.observation(entry), changed: true };
  }
  stop(raw: Record<string, unknown>, context: StudioAgentToolContext): StudioAgentToolResult {
    const entry = this.owned(String(raw.terminalId ?? ''), context);
    this.close(entry);
    entry.terminal.dispose();
    return this.observation(entry);
  }
  dispose(): void {
    for (const entry of this.entries.values()) {
      this.close(entry);
      entry.terminal.dispose();
    }
    this.entries.clear();
  }
}
export function studioInteractiveTerminalTools(
  manager: StudioInteractiveTerminalManager
): StudioAgentToolDefinition[] {
  const properties = { terminalId: { type: 'string', minLength: 1 } };
  const approval = (name: string, raw: unknown) => {
    const fingerprint = crypto
      .createHash('sha256')
      .update(JSON.stringify({ name, raw }))
      .digest('hex');
    return {
      risk: 'invasive' as const,
      approval: {
        fingerprint,
        title:
          name === 'start-terminal' ? 'Run this terminal command?' : 'Send this terminal input?',
        summary:
          'Interactive shell commands can change files and external systems. Review this exact invocation.',
        displayCommand: JSON.stringify(raw),
        scope: 'workspace' as const,
        reasons: ['Interactive shell effects require explicit approval.'],
        execution: 'once' as const,
        allowedExecutions: ['once' as const],
      },
    };
  };
  return [
    {
      name: 'start-terminal',
      title: 'Run interactive terminal command',
      description:
        'Start an approved shell command in a visible VS Code terminal with live output, persistent process and interactive stdin. Returns a terminalId; use read-terminal for output/exit status. Set background=true only for an intentionally persistent service requested by the user; inspect its output and health before reporting it as running. Background services do not block final source verification or starting another command. Prefer run-workspace-command for bounded commands. Exact one-run approval includes the background flag.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['command'],
        properties: {
          command: { type: 'string', minLength: 1, maxLength: 16_000 },
          cwd: { type: 'string' },
          background: { type: 'boolean' },
        },
      },
      activity: 'change',
      risk: 'invasive',
      authorize: (raw) => {
        const command = (raw as Record<string, unknown>)?.command;
        const bootstrap =
          typeof command === 'string'
            ? /^(?:npx\s+(?:(?:--yes|-y)\s+)?)?(?:workspai|wspai)\s+agent\s+bootstrap(?:\s+(.*))?$/i.exec(
                command.trim()
              )
            : null;
        const remaining =
          bootstrap?.[1]
            ?.replace(/(?:^|\s)--for-agent(?:=|\s+)generic(?=\s|$)/g, ' ')
            .replace(/(?:^|\s)--project(?:=|\s+)(?:"[^"\r\n]+"|'[^'\r\n]+'|[^\s;&|]+)/g, ' ')
            .replace(/(?:^|\s)--(?:strict|json)(?=\s|$)/g, ' ')
            .trim() ?? '';
        // Redirect only the equivalent generic preflight. Explicit versions,
        // other hosts, custom flags and shell workflows retain terminal access.
        if (bootstrap && !remaining) {
          throw new Error(
            'Use inspect-project-agent-entry for this read-only agent bootstrap. Supply the registered project identity from inspect-workspace; the tool resolves its directory and bundled runtime without terminal approval. No terminal was started. Continue the user task with applicable source and project tools if grounding is unavailable.'
          );
        }
        return approval('start-terminal', raw);
      },
      execute: (raw, context) => manager.start(raw as Record<string, unknown>, context),
    },
    {
      name: 'read-terminal',
      title: 'Read terminal output',
      description:
        "Read bounded output and observed exit status of this session's terminal. Use the returned offset for incremental reads; waitMs allows up to 30 seconds of waiting for a running command. Running or closed-without-exit-code is not success.",
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['terminalId'],
        properties: {
          ...properties,
          offset: { type: 'integer', minimum: 0 },
          waitMs: { type: 'integer', minimum: 0, maximum: 30_000 },
        },
      },
      activity: 'inspect',
      risk: 'read',
      execute: async (raw, context) => manager.read(raw as Record<string, unknown>, context),
    },
    {
      name: 'send-terminal-input',
      title: 'Send terminal input',
      description:
        "Send approved stdin to this session's running command, for prompts and REPLs. Prefer user entry in the visible terminal for secrets.",
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['terminalId', 'text'],
        properties: {
          ...properties,
          text: { type: 'string', maxLength: 8_000 },
          addNewLine: { type: 'boolean' },
        },
      },
      activity: 'change',
      risk: 'invasive',
      authorize: (raw) => approval('send-terminal-input', raw),
      execute: async (raw, context) => manager.input(raw as Record<string, unknown>, context),
    },
    {
      name: 'stop-terminal',
      title: 'Stop owned terminal',
      description:
        "Close this session's terminal and terminate its running command. This does not undo file or external effects.",
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['terminalId'],
        properties,
      },
      activity: 'change',
      risk: 'safe-write',
      execute: async (raw, context) => manager.stop(raw as Record<string, unknown>, context),
    },
  ];
}

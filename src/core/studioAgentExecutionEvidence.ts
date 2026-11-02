import type { StudioAgentPersistedSession } from './studioAgentEvents.js';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Execution receipts outrank a model-authored ledger; keep them across context compaction. */
export function studioAgentExecutionEvidence(session: StudioAgentPersistedSession) {
  const request = [...session.events].reverse().find((event) => event.type === 'request.started');
  const events = session.events.filter((event) => event.sequence > (request?.sequence ?? 0));
  const commands = new Map<
    string,
    {
      sequence: number;
      command: string;
      cwd: string;
      purpose: unknown;
      ok: boolean;
      exitCode: unknown;
      timedOut: boolean;
      supersedesFailure: boolean;
      processOutcome: 'passed' | 'failed' | 'unknown';
      sourceRestored: boolean;
      toolError?: string;
    }
  >();
  const terminals = new Map<
    string,
    { sequence: number; command: string; cwd: string; state: unknown; exitCode: unknown }
  >();
  let verification: { sequence: number; ok: unknown; blocking: unknown } | undefined;
  let reviewSequence: number | undefined;
  for (const event of events) {
    const data = record(event.data);
    const output = record(data.output);
    const input = record(data.input);
    if (
      ['create-workspace', 'onboard-project'].includes(String(data.toolName)) &&
      Array.isArray(output.commands)
    ) {
      for (const raw of output.commands) {
        const receipt = record(raw);
        const args = Array.isArray(receipt.args) ? receipt.args : [];
        const cwd = String(receipt.cwd ?? 'owned created workspace');
        commands.set(JSON.stringify([cwd, 'workspai', args]), {
          sequence: event.sequence,
          command: ['workspai', ...args].join(' ').slice(0, 800),
          cwd,
          purpose:
            data.toolName === 'onboard-project'
              ? 'project onboarding'
              : 'workspace/project creation',
          ok: receipt.exitCode === 0,
          exitCode: receipt.exitCode ?? null,
          timedOut: false,
          supersedesFailure: false,
          processOutcome:
            receipt.exitCode === 0
              ? 'passed'
              : typeof receipt.exitCode === 'number'
                ? 'failed'
                : 'unknown',
          sourceRestored: false,
        });
      }
    }
    if (
      data.toolName === 'onboard-project' &&
      event.type === 'tool.progress' &&
      data.commandReceipt
    ) {
      const receipt = record(data.commandReceipt);
      const args = Array.isArray(receipt.args) ? receipt.args : [];
      const cwd = String(receipt.cwd ?? 'project source');
      commands.set(JSON.stringify([cwd, 'workspai', args]), {
        sequence: event.sequence,
        command: ['workspai', ...args].join(' ').slice(0, 800),
        cwd,
        purpose: 'project onboarding',
        ok: receipt.exitCode === 0,
        exitCode: receipt.exitCode ?? null,
        timedOut: false,
        supersedesFailure: false,
        processOutcome:
          receipt.exitCode === 0
            ? 'passed'
            : typeof receipt.exitCode === 'number'
              ? 'failed'
              : 'unknown',
        sourceRestored: false,
      });
    }
    if (
      ['tool.completed', 'tool.failed'].includes(event.type) &&
      data.toolName === 'run-workspace-command' &&
      data.authorizationRejected !== true
    ) {
      const args = Array.isArray(input.args)
        ? input.args
        : Array.isArray(output.args)
          ? output.args
          : [];
      const executable = String(input.executable ?? output.executable ?? '');
      const cwd = String(input.cwd ?? 'scope root');
      const key = JSON.stringify([cwd, executable, args]);
      const previous = commands.get(key);
      commands.set(key, {
        sequence: event.sequence,
        command: [executable, ...args].join(' ').slice(0, 800),
        cwd,
        purpose: input.purpose ?? output.purpose,
        ok: event.type === 'tool.completed' && data.ok === true,
        exitCode: output.exitCode ?? null,
        timedOut: output.timedOut === true,
        supersedesFailure: previous?.ok === false || previous?.supersedesFailure === true,
        processOutcome:
          output.exitCode === 0
            ? 'passed'
            : typeof output.exitCode === 'number'
              ? 'failed'
              : 'unknown',
        sourceRestored: Boolean(output.rollback),
        ...(typeof data.error === 'string' ? { toolError: data.error.slice(0, 400) } : {}),
      });
    }
    if (event.type === 'tool.completed' && typeof output.terminalId === 'string') {
      const previous = terminals.get(output.terminalId);
      terminals.set(output.terminalId, {
        sequence: event.sequence,
        command:
          typeof input.command === 'string'
            ? input.command.slice(0, 800)
            : (previous?.command ?? 'Owned terminal'),
        cwd: typeof input.cwd === 'string' ? input.cwd : (previous?.cwd ?? 'scope root'),
        state: output.state,
        exitCode: output.exitCode ?? previous?.exitCode ?? null,
      });
    }
    if (event.type === 'verify.completed') {
      verification = { sequence: event.sequence, ok: data.ok, blocking: data.cardBlocking };
    }
    if (
      event.type === 'tool.completed' &&
      data.toolName === 'inspect-workspace-changes' &&
      data.ok === true
    ) {
      reviewSequence = event.sequence;
    }
  }
  const receipts = [...commands.values()].sort((a, b) => a.sequence - b.sequence);
  return {
    terminals: [...terminals.values()].slice(-12),
    commands: receipts.slice(-24),
    omittedCommands: Math.max(0, receipts.length - 24),
    verification,
    reviewSequence,
    ledgerUpdatedSequence: session.taskLedger?.updatedSequence,
    guidance:
      'Observed receipts are not verification. processOutcome is the actual process; ok includes source admission/retention. sourceRestored leaves verification open; an exit-zero rollback is not a compiler failure. Latest accepted results supersede earlier failures in the same scope. Ledger notes can be stale; reconcile them against these receipts. Do not deny recorded installs/checks or rerun successes without a relevant later change or distinct check. Do not attribute unrelated pre-existing Git changes to this request.',
  };
}

export function describeStudioExecutionReceipts(
  session: StudioAgentPersistedSession
): string | undefined {
  const evidence = studioAgentExecutionEvidence(session);
  const lines = [
    ...(session.executionTarget
      ? [`- Active execution target: ${session.executionTarget.name}.`]
      : []),
    ...evidence.terminals
      .filter((terminal) => terminal.state === 'exited')
      .map(
        (terminal) => `- ${terminal.command} [${terminal.cwd}]: exit ${String(terminal.exitCode)}.`
      ),
    ...evidence.commands.map(
      (command) =>
        `- ${command.command} [${command.cwd}]: ${command.ok ? 'passed' : command.processOutcome === 'passed' ? 'process passed; tool outcome not accepted' : 'failed'}, exit ${String(command.exitCode)}${command.sourceRestored ? '; source changes restored, verification remains open' : ''}${command.timedOut ? ', timed out' : ''}${command.supersedesFailure && command.ok ? '; supersedes an earlier failure' : ''}.`
    ),
  ];
  return lines.length ? `Recorded command results:\n${lines.join('\n')}` : undefined;
}

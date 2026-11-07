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
      terminationSignal?: string;
      supersedesFailure: boolean;
      processOutcome: 'passed' | 'failed' | 'unknown' | 'not-started';
      sourceRestored: boolean;
      toolError?: string;
    }
  >();
  const terminals = new Map<
    string,
    { sequence: number; command: string; cwd: string; state: unknown; exitCode: unknown }
  >();
  let verification: { sequence: number; ok: unknown; blocking: unknown } | undefined;
  const mutations = new Map(
    (session.sourceChangeReceipts ?? []).map((receipt) => [receipt.transactionId, receipt])
  );
  let reviewSequence: number | undefined;
  for (const event of events) {
    const data = record(event.data);
    const output = record(data.output);
    const input = record(data.input);
    const transaction = record(output.transaction);
    if (
      ['tool.completed', 'tool.failed', 'tool.progress'].includes(event.type) &&
      typeof transaction.transactionId === 'string' &&
      typeof transaction.state === 'string'
    ) {
      const rawPaths = Array.isArray(output.fileChanges)
        ? output.fileChanges.map((file) => record(file).relativePath)
        : Array.isArray(output.changedPaths)
          ? output.changedPaths
          : [];
      const previous = mutations.get(transaction.transactionId);
      if (!previous || previous.sequence <= event.sequence) {
        mutations.set(transaction.transactionId, {
          transactionId: transaction.transactionId,
          requestId: event.requestId,
          sequence: event.sequence,
          state: transaction.state,
          paths: rawPaths.length
            ? [
                ...new Set(rawPaths.filter((value): value is string => typeof value === 'string')),
              ].slice(0, 128)
            : (previous?.paths ?? []),
        });
      }
    }
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
        ...(typeof output.terminationSignal === 'string'
          ? { terminationSignal: output.terminationSignal }
          : {}),
        supersedesFailure: previous?.ok === false || previous?.supersedesFailure === true,
        processOutcome:
          output.executed === false ||
          data.terminalReason === 'workspace-command-checkpoint-unavailable'
            ? 'not-started'
            : output.exitCode === 0
              ? 'passed'
              : typeof output.exitCode === 'number' ||
                  output.terminationSignal ||
                  output.timedOut === true
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
    projectOperations: (session.projectOperations ?? []).slice(-6),
    commands: receipts.slice(-24),
    mutations: [...mutations.values()].slice(-24),
    omittedCommands: Math.max(0, receipts.length - 24),
    verification,
    reviewSequence,
    ledgerUpdatedSequence: session.taskLedger?.updatedSequence,
    guidance:
      'Observed receipts are not verification. processOutcome is the actual process; ok includes source admission/retention. sourceRestored leaves verification open; an exit-zero rollback is not a compiler failure. Latest accepted results supersede earlier failures in the same scope. Ledger notes can be stale; reconcile them against these receipts. Applied/closed mutation receipts remain real effects even if a later stale edit fails. Never claim those edits were not applied unless their own receipt records rollback. Reinspect current source before retrying stale oldText; do not repeat an already accepted patch. Do not deny recorded installs/checks or rerun successes without a relevant later change or distinct check. Do not attribute unrelated pre-existing Git changes to this request.',
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
    ...evidence.commands.map((command) =>
      command.processOutcome === 'not-started'
        ? `- ${command.command} [${command.cwd}]: not started; no process exit code.`
        : `- ${command.command} [${command.cwd}]: ${command.ok ? 'passed' : command.processOutcome === 'passed' ? 'process passed; tool outcome not accepted' : 'failed'}, ${command.terminationSignal ? `terminated by ${command.terminationSignal}` : `exit ${String(command.exitCode)}`}${command.sourceRestored ? '; source changes restored, verification remains open' : ''}${command.timedOut ? ', timed out' : ''}${command.supersedesFailure && command.ok ? '; supersedes an earlier failure' : ''}.`
    ),
  ];
  const changes = evidence.mutations.map(
    (mutation) =>
      `- ${mutation.transactionId}: ${mutation.state}; ${mutation.paths.slice(0, 12).join(', ') || 'source checkpoint'}${mutation.paths.length > 12 ? `; ${mutation.paths.length - 12} more paths` : ''}.`
  );
  return (
    [
      lines.length ? `Recorded command results:\n${lines.join('\n')}` : undefined,
      changes.length
        ? `Recorded source changes (application is not verification):\n${changes.join('\n')}`
        : undefined,
    ]
      .filter(Boolean)
      .join('\n\n') || undefined
  );
}

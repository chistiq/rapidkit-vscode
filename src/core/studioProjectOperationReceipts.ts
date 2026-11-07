import type { StudioAgentPersistedSession } from './studioAgentEvents.js';
import type { StudioAgentToolResult } from './studioAgentToolRegistry.js';

export type StudioProjectOperationReceipt = {
  requestId: string;
  sequence: number;
  operation: 'adopt' | 'import' | 'create';
  source: string;
  destination: string;
  status: 'succeeded' | 'partial';
  commands: Array<{ args: string[]; exitCode: number | null }>;
};

/** Receipts explain ownership/grounding effects; they grant no execution authority. */
export function rememberStudioProjectOperation(
  session: StudioAgentPersistedSession,
  tool: string,
  result: StudioAgentToolResult,
  requestId: string,
  sequence: number
): void {
  if (
    !['onboard-project', 'create-workspace'].includes(tool) ||
    !result.output ||
    typeof result.output !== 'object' ||
    Array.isArray(result.output)
  ) {
    return;
  }
  const output = result.output as Record<string, unknown>;
  if (!Array.isArray(output.commands)) {
    return;
  }
  const commands = output.commands
    .flatMap((raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return [];
      }
      const command = raw as Record<string, unknown>;
      return Array.isArray(command.args) && command.args.every((arg) => typeof arg === 'string')
        ? [
            {
              args: (command.args as string[]).slice(0, 16).map((arg) => arg.slice(0, 500)),
              exitCode: typeof command.exitCode === 'number' ? command.exitCode : null,
            },
          ]
        : [];
    })
    .slice(-4);
  if (!commands.length) {
    return;
  }
  const operation = tool === 'create-workspace' ? 'create' : output.operation;
  if (!['adopt', 'import', 'create'].includes(String(operation))) {
    return;
  }
  const receipt: StudioProjectOperationReceipt = {
    requestId,
    sequence,
    operation: operation as StudioProjectOperationReceipt['operation'],
    source: String(
      output.projectPath ??
        session.executionTarget?.workspacePath ??
        session.projectPath ??
        session.workspacePath
    ).slice(0, 2_000),
    destination: String(
      output.workspacePath ?? session.executionTarget?.workspacePath ?? session.workspacePath
    ).slice(0, 2_000),
    status:
      result.ok && commands.every((command) => command.exitCode === 0) ? 'succeeded' : 'partial',
    commands,
  };
  session.projectOperations = [
    ...(session.projectOperations ?? []).filter(
      (entry) => entry.requestId !== requestId || entry.sequence !== sequence
    ),
    receipt,
  ].slice(-24);
}

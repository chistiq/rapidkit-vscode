import type {
  StudioAgentToolApprovalGrant,
  StudioAgentToolResult,
} from './studioAgentToolRegistry.js';
import { requireStudioWorkspaceDirectory } from './studioWorkspaceAvailability.js';
import {
  assertStudioWorkspaceCommandApproval,
  describeStudioWorkspaceCommandFailure,
  resolveStudioWorkspaceCommandPlan,
  runStudioWorkspaceCommand,
  type StudioWorkspaceCommandExecution,
  type StudioWorkspaceCommandRequest,
  type StudioWorkspaceProcessEvent,
} from './studioWorkspaceCommand.js';
import {
  beginStudioWorkspaceSourceTransaction,
  disposeStudioWorkspaceSourceTransaction,
  inspectStudioWorkspaceSourceTransaction,
  rollbackStudioWorkspaceSourceTransaction,
  type StudioWorkspaceSourceRollback,
  type StudioWorkspaceSourceTransaction,
  type StudioWorkspaceSourceSnapshot,
  type StudioSourceCheckpointFailure,
} from './studioWorkspaceSourceSnapshot.js';

const workspaceCommandTails = new Map<string, Promise<void>>();

async function withWorkspaceCommandTransactionLock<T>(
  sourceRoot: string,
  operation: () => Promise<T>
): Promise<T> {
  const key = sourceRoot.toLowerCase();
  const predecessor = workspaceCommandTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const owned = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = predecessor.catch(() => undefined).then(() => owned);
  workspaceCommandTails.set(key, tail);
  await predecessor.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (workspaceCommandTails.get(key) === tail) {
      workspaceCommandTails.delete(key);
    }
  }
}

type ExecutedWorkspaceCommandOutput = StudioWorkspaceCommandExecution & {
  executed?: true;
  transactionId: string;
  /** Temporary execution checkpoint identity, distinct from a durable native review receipt. */
  commandTransactionId?: string;
  changedPaths: string[];
  observedSourceChange: boolean;
  sourceFingerprint?: string;
  recoveryCheckpoint?: { transactionId: string; backupPath: string };
  observationScopes: string[];
  diagnosticOutcome?: 'clean' | 'findings';
  authorization?: {
    fingerprint: string;
    approvedBy?: string;
    approvedAt?: string;
    execution: 'once' | 'session' | 'project';
  };
  rollback?: StudioWorkspaceSourceRollback & {
    reason: 'unapproved-mutation' | 'failed-command';
  };
  sourceRecovery?: {
    state: 'restored';
    requiresMutationDeclaration: boolean;
    instruction: string;
  };
  effects: {
    source: boolean;
    repositoryMetadata: boolean;
    externalSystem: boolean;
    verificationScopes: string[];
    sourceCheckpointCoverage: 'complete' | 'not-applicable' | 'unavailable';
    nonSourceRollbackCoverage: 'none';
  };
};

export type StudioWorkspaceCommandTransactionOutput =
  | ExecutedWorkspaceCommandOutput
  | (Partial<Omit<ExecutedWorkspaceCommandOutput, 'executed'>> & {
      executed: false;
      checkpointFailure?: StudioSourceCheckpointFailure;
      recovery: { kind: 'source-scope'; instruction: string };
    });

export async function executeStudioWorkspaceCommandTransaction(input: {
  workspacePath: string;
  projectPath?: string;
  request: StudioWorkspaceCommandRequest;
  approval?: StudioAgentToolApprovalGrant;
  evidenceGeneration?: string;
  signal?: AbortSignal;
  reportProcessEvent?(event: StudioWorkspaceProcessEvent): Promise<void> | void;
  isExpectedDiagnosticFindingExit?(input: {
    command: string;
    exitCode: number | null;
    stdout: string;
    stderr: string;
  }): boolean;
  retainSourceChanges?(input: {
    transaction: StudioWorkspaceSourceTransaction;
    after: StudioWorkspaceSourceSnapshot;
    changedPaths: string[];
  }): Promise<Record<string, unknown>>;
}): Promise<StudioAgentToolResult<StudioWorkspaceCommandTransactionOutput>> {
  const plan = resolveStudioWorkspaceCommandPlan({
    workspacePath: input.workspacePath,
    projectPath: input.projectPath,
    request: input.request,
  });
  assertStudioWorkspaceCommandApproval({ plan, approval: input.approval });
  await requireStudioWorkspaceDirectory(plan.cwd);

  // Linked projects may live outside the managed workspace. The command root
  // is therefore the selected project when present, not the registry root.
  const sourceRoot = input.projectPath ?? input.workspacePath;
  return withWorkspaceCommandTransactionLock(sourceRoot, async () => {
    let checkpointFailure: StudioSourceCheckpointFailure | undefined;
    const transaction = await beginStudioWorkspaceSourceTransaction({
      workspacePath: sourceRoot,
      onUnavailable: (failure) => {
        checkpointFailure = failure;
      },
    });
    if (!transaction) {
      return {
        ok: false,
        changed: false,
        error: `The command was not started: its source checkpoint is incomplete${checkpointFailure ? ` (${checkpointFailure.code}${checkpointFailure.limit ? `; observed ${checkpointFailure.observed ?? 'unknown'}, limit ${checkpointFailure.limit}` : ''})` : ''}. Select an appropriate narrower source directory or an independent creation target, then use an approved tool there. Do not retry this unchanged broad scope or bypass checkpoint coverage.`,
        output: {
          executed: false,
          displayCommand: plan.displayCommand,
          cwd: plan.cwd,
          exitCode: null,
          checkpointFailure,
          recovery: {
            kind: 'source-scope',
            instruction:
              'No process ran and no files changed. Reassess the requested destination. Use select-project for an existing project, create-workspace for a suitable new owned workspace, or another applicable scoped tool. Preserve explicit user destinations; obtain exact approval for a changed destination/action. If no safe route exists, explain the specific checkpoint limitation and ask only for essential input.',
          },
        },
      };
    }

    let disposeCheckpoint = true;
    const recoveryCheckpoint = {
      transactionId: transaction.id,
      backupPath: transaction.backupPath,
    };
    try {
      const execution = await runStudioWorkspaceCommand(plan, {
        signal: input.signal,
        onProcessEvent: input.reportProcessEvent,
      });
      const inspected = await inspectStudioWorkspaceSourceTransaction(transaction);
      if (!inspected) {
        // Without a stable post-command snapshot we cannot distinguish command
        // effects from concurrent work. Keep the private backup and execution
        // receipt rather than overwriting user edits or silently losing recovery.
        disposeCheckpoint = false;
        return {
          ok: false,
          changed: true,
          requiresUserDecision: true,
          terminalReason: 'workspace-command-post-checkpoint-unavailable',
          error:
            'The command ran, but source inspection was incomplete. Concurrent work was preserved and a private recovery checkpoint was retained. Inspect the recorded execution before continuing; do not blindly repeat the command.',
          output: {
            ...execution,
            transactionId: transaction.id,
            changedPaths: [],
            observedSourceChange: false,
            recoveryCheckpoint,
            observationScopes: plan.observationScopes,
            effects: {
              source: true,
              repositoryMetadata: plan.repositoryMetadataEffects,
              externalSystem: plan.externalSideEffects,
              verificationScopes: plan.effectScopes,
              sourceCheckpointCoverage: 'unavailable',
              nonSourceRollbackCoverage: 'none',
            },
          },
        };
      }

      const sourceChanged = inspected.changedPaths.length > 0;
      const diagnosticFindings = Boolean(
        input.isExpectedDiagnosticFindingExit?.({
          command: plan.displayCommand,
          exitCode: execution.exitCode,
          stdout: execution.stdout,
          stderr: execution.stderr,
        })
      );
      const commandObserved = execution.exitCode === 0 || diagnosticFindings;
      const rollbackReason =
        sourceChanged && !plan.mutatesSource
          ? 'unapproved-mutation'
          : sourceChanged && !commandObserved
            ? 'failed-command'
            : undefined;

      if (rollbackReason) {
        disposeCheckpoint = false;
        try {
          const rollback = await rollbackStudioWorkspaceSourceTransaction(
            transaction,
            inspected.changedPaths,
            inspected.after
          );
          disposeCheckpoint = true;
          const recoverable = !plan.externalSideEffects && !plan.repositoryMetadataEffects;
          const recoveryInstruction =
            'Inspect the recorded process result and changed paths. Source was restored to the pre-command checkpoint; earlier request edits remain. ' +
            (rollbackReason === 'unapproved-mutation'
              ? 'If these outputs are appropriate for the task, retry the same command with allowSourceChanges:true and obtain its exact approval. Keep the original purpose. Otherwise choose another tool or deliver the useful result with this limitation.'
              : 'Diagnose the failed command and choose a corrected action. Do not repeat an unchanged failure or claim verification passed.');
          return {
            ok: false,
            changed: false,
            ...(input.evidenceGeneration ? { evidenceGeneration: input.evidenceGeneration } : {}),
            ...(!recoverable
              ? {
                  terminalReason: 'workspace-command-source-restored-non-source-effects-unverified',
                }
              : {}),
            error:
              rollbackReason === 'unapproved-mutation'
                ? `The process exited with code ${String(execution.exitCode)}, but its source changes were not declared and approved. Studio restored the exact pre-command checkpoint. ${recoverable ? recoveryInstruction : 'Inspect non-source effects before continuing.'}`
                : `${describeStudioWorkspaceCommandFailure(execution)}\nStudio restored the exact pre-command source checkpoint.${
                    plan.externalSideEffects || plan.repositoryMetadataEffects
                      ? ' Repository metadata or external-system effects are outside that checkpoint and must be inspected separately.'
                      : ''
                  }`,
            output: {
              ...execution,
              transactionId: transaction.id,
              changedPaths: inspected.changedPaths,
              observedSourceChange: true,
              sourceFingerprint: rollback.restoredFingerprint,
              rollback: { ...rollback, reason: rollbackReason },
              ...(recoverable
                ? {
                    sourceRecovery: {
                      state: 'restored' as const,
                      requiresMutationDeclaration: rollbackReason === 'unapproved-mutation',
                      instruction: recoveryInstruction,
                    },
                  }
                : {}),
              effects: {
                source: sourceChanged,
                repositoryMetadata: plan.repositoryMetadataEffects,
                externalSystem: plan.externalSideEffects,
                verificationScopes: plan.effectScopes,
                sourceCheckpointCoverage: 'complete',
                nonSourceRollbackCoverage: 'none',
              },
              observationScopes: plan.observationScopes,
            },
          };
        } catch (error) {
          return {
            ok: false,
            changed: true,
            requiresUserDecision: true,
            ...(input.evidenceGeneration ? { evidenceGeneration: input.evidenceGeneration } : {}),
            terminalReason: 'workspace-command-rollback-failed',
            error:
              `The command changed source and automatic rollback could not be proven: ` +
              (error instanceof Error ? error.message : String(error)),
            output: {
              ...execution,
              recoveryCheckpoint,
              transactionId: transaction.id,
              changedPaths: inspected.changedPaths,
              observedSourceChange: true,
              sourceFingerprint: inspected.after.fingerprint,
              effects: {
                source: sourceChanged,
                repositoryMetadata: plan.repositoryMetadataEffects,
                externalSystem: plan.externalSideEffects,
                verificationScopes: plan.effectScopes,
                sourceCheckpointCoverage: 'complete',
                nonSourceRollbackCoverage: 'none',
              },
              observationScopes: plan.observationScopes,
            },
          };
        }
      }

      let retained: Record<string, unknown> = {};
      if (sourceChanged && input.retainSourceChanges) {
        try {
          retained = await input.retainSourceChanges({
            transaction,
            after: inspected.after,
            changedPaths: inspected.changedPaths,
          });
        } catch (error) {
          disposeCheckpoint = false;
          let rollback: StudioWorkspaceSourceRollback | undefined;
          let rollbackError: unknown;
          try {
            rollback = await rollbackStudioWorkspaceSourceTransaction(
              transaction,
              inspected.changedPaths,
              inspected.after
            );
            disposeCheckpoint = true;
          } catch (failure) {
            rollbackError = failure;
          }
          return {
            ok: false,
            changed: !rollback,
            requiresUserDecision: !rollback,
            terminalReason: rollback
              ? 'workspace-command-retention-failed-source-restored'
              : 'workspace-command-retention-failed-recovery-required',
            error:
              'The command ran, but its durable request checkpoint could not be retained. ' +
              (rollback
                ? 'Source changes were restored. '
                : 'Automatic restoration was refused; a private recovery checkpoint was retained. ' +
                  String(rollbackError) +
                  ' ') +
              'Inspect the recorded execution and external effects before continuing; do not blindly repeat the command. ' +
              String(error),
            output: {
              ...execution,
              transactionId: transaction.id,
              changedPaths: inspected.changedPaths,
              observedSourceChange: true,
              sourceFingerprint: rollback?.restoredFingerprint ?? inspected.after.fingerprint,
              ...(rollback
                ? { rollback: { ...rollback, reason: 'failed-command' as const } }
                : { recoveryCheckpoint }),
              effects: {
                source: true,
                repositoryMetadata: plan.repositoryMetadataEffects,
                externalSystem: plan.externalSideEffects,
                verificationScopes: plan.effectScopes,
                sourceCheckpointCoverage: 'complete',
                nonSourceRollbackCoverage: 'none',
              },
              observationScopes: plan.observationScopes,
            },
          };
        }
      }

      return {
        ok: commandObserved,
        changed: sourceChanged,
        ...(input.evidenceGeneration ? { evidenceGeneration: input.evidenceGeneration } : {}),
        output: {
          ...execution,
          ...retained,
          transactionId:
            typeof retained.nativeTransactionId === 'string'
              ? retained.nativeTransactionId
              : transaction.id,
          commandTransactionId: transaction.id,
          changedPaths: inspected.changedPaths,
          observedSourceChange: sourceChanged,
          sourceFingerprint: inspected.after.fingerprint,
          effects: {
            source: sourceChanged,
            repositoryMetadata: plan.repositoryMetadataEffects,
            externalSystem: plan.externalSideEffects,
            verificationScopes: plan.effectScopes,
            sourceCheckpointCoverage: sourceChanged ? 'complete' : 'not-applicable',
            nonSourceRollbackCoverage: 'none',
          },
          observationScopes: plan.observationScopes,
          ...(commandObserved
            ? { diagnosticOutcome: diagnosticFindings ? ('findings' as const) : ('clean' as const) }
            : {}),
          ...(plan.requiresExplicitApproval
            ? {
                authorization: {
                  fingerprint: plan.authorizationFingerprint,
                  approvedBy: input.approval?.approvedBy,
                  approvedAt: input.approval?.approvedAt,
                  execution: input.approval?.execution ?? ('once' as const),
                },
              }
            : {}),
        },
        ...(commandObserved ? {} : { error: describeStudioWorkspaceCommandFailure(execution) }),
      };
    } finally {
      if (disposeCheckpoint) {
        await disposeStudioWorkspaceSourceTransaction(transaction);
      }
    }
  });
}

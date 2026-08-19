import type { DashboardCommandExecutionChannel } from '../contracts/dashboardCommandExecutionChannel';
import { resolveDashboardCommandExecutionChannel } from '../contracts/dashboardCommandExecutionChannel';
import type { DashboardCommandContract } from './dashboardCommandContracts';
import { resolveDashboardCommandContract } from './dashboardCommandContracts';
import type { DashboardCommandCapabilityRequirement } from './dashboardCommandCapabilityRequirement';
import { resolveDashboardCommandCapabilityRequirement } from './dashboardCommandCapabilityRequirement';
import type { WorkspaceCommandSafetyPolicy } from './workspaceCommandSafety';
import { resolveWorkspaceCommandSafetyPolicy } from './workspaceCommandSafety';

export type DashboardCommandExecutionPlan = {
  commandId: string;
  contract?: DashboardCommandContract;
  cliArgs: string[];
  executionChannel?: DashboardCommandExecutionChannel;
  capabilityRequirement?: DashboardCommandCapabilityRequirement;
  safetyPolicy?: WorkspaceCommandSafetyPolicy;
  isCliBacked: boolean;
};

/**
 * Host-side execution truth for dashboard commands.
 *
 * The JSON dashboard command surface is intentionally webview-facing metadata.
 * CLI args, capability requirements, and terminal/background posture live here
 * so host code can apply one execution discipline without leaking privileged
 * command details into the webview contract.
 */
export function resolveDashboardCommandExecutionPlan(
  commandId: string,
  commandData?: Record<string, unknown>
): DashboardCommandExecutionPlan {
  const contract = resolveDashboardCommandContract(commandId);
  const cliArgs = contract?.cliArgs ?? [];

  return {
    commandId,
    contract,
    cliArgs,
    executionChannel: resolveDashboardCommandExecutionChannel(commandId, commandData),
    capabilityRequirement: resolveDashboardCommandCapabilityRequirement(contract),
    safetyPolicy: resolveWorkspaceCommandSafetyPolicy(commandId),
    isCliBacked: cliArgs.length > 0,
  };
}

/**
 * Studio evidence refresh must keep every agent consumer, not a single-host
 * slice. Dashboard contracts may pin `--target vscode`; the repair host
 * widens that to `all` before invoking the CLI producer.
 */
export function preserveAllAgentConsumersForStudioRefresh(cliArgs: readonly string[]): string[] {
  const args = [...cliArgs];
  const targetIndex = args.indexOf('--target');
  if (targetIndex >= 0 && targetIndex + 1 < args.length) {
    args[targetIndex + 1] = 'all';
  }
  return args;
}

export type StudioGovernedCommandAttempt = {
  blockerSignature?: string;
  evidenceGeneration: string;
  count: number;
};

export type StudioGovernedCommandReuseDecision =
  | { allow: true; nextAttempt: StudioGovernedCommandAttempt }
  | {
      allow: false;
      nextAttempt?: StudioGovernedCommandAttempt;
      evidenceGeneration: string;
      blockerSignature?: string;
      error: string;
    };

/**
 * Same evidence generation cannot be refreshed twice. The same semantic
 * blocker cannot be refreshed more than twice. Callers must persist
 * `nextAttempt` even when the second identical generation is rejected, so the
 * third call surfaces the attempt-cap copy.
 */
export function decideStudioGovernedCommandReuse(input: {
  commandId: string;
  evidenceGeneration: string;
  blockerSignature?: string;
  priorAttempt?: StudioGovernedCommandAttempt;
  observedGeneration?: string;
}): StudioGovernedCommandReuseDecision {
  const sameEpoch =
    input.priorAttempt?.blockerSignature === input.blockerSignature &&
    input.priorAttempt?.evidenceGeneration === input.evidenceGeneration;
  const attemptsForBlocker = sameEpoch ? (input.priorAttempt?.count ?? 0) : 0;
  if (attemptsForBlocker >= 2) {
    return {
      allow: false,
      evidenceGeneration: input.evidenceGeneration,
      ...(input.blockerSignature ? { blockerSignature: input.blockerSignature } : {}),
      error: `${input.commandId} already ran twice for the same semantic blocker. Do not refresh again; inspect its output and repair the source cause or choose the next dependency.`,
    };
  }
  const nextAttempt: StudioGovernedCommandAttempt = {
    ...(input.blockerSignature ? { blockerSignature: input.blockerSignature } : {}),
    evidenceGeneration: input.evidenceGeneration,
    count: attemptsForBlocker + 1,
  };
  if (input.observedGeneration === input.evidenceGeneration) {
    return {
      allow: false,
      nextAttempt,
      evidenceGeneration: input.evidenceGeneration,
      error: `${input.commandId} already ran against this evidence generation. Inspect the observation or choose the next producer in the chain.`,
    };
  }
  return { allow: true, nextAttempt };
}

export function applyStudioGovernedCommandReuse<TCommand extends string>(input: {
  commandId: TCommand;
  evidenceGeneration: string;
  blockerSignature?: string;
  attempts: Map<TCommand, StudioGovernedCommandAttempt>;
  generations: Map<TCommand, string>;
}): StudioGovernedCommandReuseDecision {
  const decision = decideStudioGovernedCommandReuse({
    commandId: input.commandId,
    evidenceGeneration: input.evidenceGeneration,
    ...(input.blockerSignature ? { blockerSignature: input.blockerSignature } : {}),
    priorAttempt: input.attempts.get(input.commandId),
    observedGeneration: input.generations.get(input.commandId),
  });
  if (decision.nextAttempt) {
    input.attempts.set(input.commandId, decision.nextAttempt);
  }
  if (decision.allow) {
    input.generations.set(input.commandId, input.evidenceGeneration);
  }
  return decision;
}

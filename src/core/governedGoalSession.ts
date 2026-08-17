import type { VerifiedGoalContractPayload } from './verifiedGoalIntent.js';
import {
  findGoalPackForVerifiedGoal,
  isGoalLifecycleResult,
  isGoalPlanResult,
  readPreparedVerifiedGoal,
  readGoalExecutionPolicy,
  readGoalVerificationAttempts,
  readGoalIndex,
  runGoalCommand,
  type GoalCommandResult,
} from './workspaceGoals.js';

export type GovernedGoalSessionBinding = {
  goalPackId: string;
  governedGoal: GovernedGoalSessionDescriptor;
  verifiedGoal?: VerifiedGoalContractPayload;
  maxAttempts: number;
  attemptsUsed: number;
};

export type GovernedGoalSessionDescriptor = {
  schemaVersion: 'workspai.studio-governed-goal.v1';
  id: string;
  fingerprint: string;
  objective: string;
  category: import('./workspaceGoals.js').GoalCategory;
  scope: import('./workspaceGoals.js').GoalEntry['scope'];
  completionMode: 'deterministic-verification' | 'evidence-review';
};

type GoalRunner = (input: {
  workspacePath: string;
  args: string[];
  label: string;
}) => Promise<GoalCommandResult>;

function commandFailure(result: GoalCommandResult, incompatibleMessage: string): Error {
  return new Error(result.ok ? incompatibleMessage : result.error);
}

/**
 * Establish the immutable CLI lifecycle before a model receives mutation tools.
 * Keeping this orchestration outside the webview host makes the boundary usable
 * by future native Chat and package consumers without duplicating Goal policy.
 */
export async function prepareGovernedGoalSession(input: {
  workspacePath: string;
  objective: string;
  projectName?: string;
  consumer?: 'generic' | 'claude' | 'codex';
  onPhase?: (label: string) => void;
  run?: GoalRunner;
  readPreparedGoal?: typeof readPreparedVerifiedGoal;
  readExecutionPolicy?: typeof readGoalExecutionPolicy;
  readVerificationAttempts?: typeof readGoalVerificationAttempts;
  readIndex?: typeof readGoalIndex;
}): Promise<GovernedGoalSessionBinding> {
  const run = input.run ?? runGoalCommand;
  const args = [input.objective, '--for-agent', input.consumer ?? 'generic'];
  if (input.projectName) {
    args.push('--scope', `project:${input.projectName}`);
  }
  input.onPhase?.('Defining an evidence-bound CLI-governed Goal...');
  const planned = await run({
    workspacePath: input.workspacePath,
    args,
    label: 'Define governed Goal',
  });
  if (!planned.ok || !isGoalPlanResult(planned.value)) {
    throw commandFailure(planned, 'Workspai CLI returned an incompatible Goal plan.');
  }
  if (planned.value.result !== 'planned') {
    throw new Error(
      `Goal requires review before execution (${planned.value.result}). Open Workspai: Review Governed Goals to resolve its scope or evidence requirements.`
    );
  }

  const goalPackId = planned.value.goalPack.id;
  const index = await (input.readIndex ?? readGoalIndex)(input.workspacePath);
  const plannedEntry =
    index.kind === 'valid' ? index.value.goals.find((entry) => entry.id === goalPackId) : undefined;
  if (!plannedEntry) {
    throw new Error(
      'The planned Goal Pack is unavailable or does not match the intent compiled for this request.'
    );
  }
  const policy = await (input.readExecutionPolicy ?? readGoalExecutionPolicy)(
    input.workspacePath,
    plannedEntry
  );
  if (!policy) {
    throw new Error('The immutable Goal execution policy is missing or incompatible.');
  }
  const hasDeterministicVerifier = (
    ['release-readiness', 'dependency-security', 'test-coverage'] as const
  ).includes(
    plannedEntry.category as 'release-readiness' | 'dependency-security' | 'test-coverage'
  );
  input.onPhase?.('Activating the immutable Goal Pack...');
  const activated = await run({
    workspacePath: input.workspacePath,
    args: ['--activate', goalPackId],
    label: 'Activate governed Goal',
  });
  if (!activated.ok || !isGoalLifecycleResult(activated.value)) {
    throw commandFailure(activated, 'Workspai CLI returned an incompatible Goal activation.');
  }
  if (activated.value.goal?.id !== goalPackId || activated.value.goal.lifecycle !== 'active') {
    throw new Error('Workspai CLI did not activate the planned Goal Pack.');
  }

  const governedGoal: GovernedGoalSessionDescriptor = {
    schemaVersion: 'workspai.studio-governed-goal.v1',
    id: plannedEntry.id,
    fingerprint: plannedEntry.fingerprint,
    objective: plannedEntry.objective,
    category: plannedEntry.category,
    scope: plannedEntry.scope,
    completionMode: hasDeterministicVerifier ? 'deterministic-verification' : 'evidence-review',
  };
  const repairAttemptsUsed =
    plannedEntry.repairTransactionIds?.length ?? (plannedEntry.repairTransactionId ? 1 : 0);
  if (!hasDeterministicVerifier) {
    input.onPhase?.('Binding the Goal Pack to evidence, scope, and review policy...');
    return {
      goalPackId,
      governedGoal,
      maxAttempts: policy.maxAttempts,
      attemptsUsed: repairAttemptsUsed,
    };
  }

  input.onPhase?.('Binding deterministic verification to the Goal...');
  const prepared = await run({
    workspacePath: input.workspacePath,
    args: ['--prepare', goalPackId],
    label: 'Prepare governed Goal verification',
  });
  if (!prepared.ok || !isGoalLifecycleResult(prepared.value)) {
    throw commandFailure(
      prepared,
      'Workspai CLI returned an incompatible Goal verification contract.'
    );
  }
  if (
    prepared.value.goal?.id !== goalPackId ||
    prepared.value.goal.lifecycle !== 'verification-ready' ||
    !prepared.value.verifiedGoalId
  ) {
    throw new Error(
      'This Goal does not yet have a deterministic verification adapter. Its Goal Pack was retained for review, but no source mutation was started.'
    );
  }
  const verifiedGoal = await (input.readPreparedGoal ?? readPreparedVerifiedGoal)(
    input.workspacePath,
    prepared.value.verifiedGoalId
  );
  if (!verifiedGoal || verifiedGoal.id !== prepared.value.verifiedGoalId) {
    throw new Error('The CLI prepared Goal verification, but its bound contract is unavailable.');
  }
  const attemptsUsed = await (input.readVerificationAttempts ?? readGoalVerificationAttempts)(
    input.workspacePath,
    verifiedGoal
  );
  if (attemptsUsed === null) {
    throw new Error(
      'The CLI prepared Goal verification, but its status attempt record is invalid.'
    );
  }
  return {
    goalPackId,
    governedGoal,
    verifiedGoal,
    maxAttempts: policy.maxAttempts,
    attemptsUsed: Math.max(attemptsUsed, repairAttemptsUsed),
  };
}

export async function restoreGovernedGoalSession(input: {
  workspacePath: string;
  governedGoal?: GovernedGoalSessionDescriptor;
  verifiedGoal?: VerifiedGoalContractPayload;
  readVerificationAttempts?: typeof readGoalVerificationAttempts;
}): Promise<GovernedGoalSessionBinding> {
  if (!input.governedGoal && !input.verifiedGoal) {
    throw new Error('The durable Goal session has no canonical Goal Pack binding.');
  }
  const [verifiedGoalPack, index] = await Promise.all([
    input.verifiedGoal
      ? findGoalPackForVerifiedGoal(input.workspacePath, input.verifiedGoal.id)
      : Promise.resolve(null),
    readGoalIndex(input.workspacePath),
  ]);
  const goalPack =
    input.governedGoal && index.kind === 'valid'
      ? (index.value.goals.find((entry) => entry.id === input.governedGoal?.id) ?? null)
      : verifiedGoalPack;
  if (
    !goalPack ||
    index.kind !== 'valid' ||
    index.value.activeGoalId !== goalPack.id ||
    goalPack.lifecycle === 'cancelled' ||
    goalPack.lifecycle === 'verified'
  ) {
    throw new Error(
      'The durable Goal session is no longer linked to an active canonical Goal Pack. Review the workspace Goal index before resuming.'
    );
  }
  const policy = await readGoalExecutionPolicy(input.workspacePath, goalPack);
  if (!policy) {
    throw new Error('The durable Goal session has no compatible immutable execution policy.');
  }
  const attemptsUsed = input.verifiedGoal
    ? await (input.readVerificationAttempts ?? readGoalVerificationAttempts)(
        input.workspacePath,
        input.verifiedGoal
      )
    : 0;
  if (attemptsUsed === null) {
    throw new Error('The durable Goal session has no compatible verification attempt record.');
  }
  const repairAttemptsUsed =
    goalPack.repairTransactionIds?.length ?? (goalPack.repairTransactionId ? 1 : 0);
  const governedGoal: GovernedGoalSessionDescriptor = input.governedGoal ?? {
    schemaVersion: 'workspai.studio-governed-goal.v1',
    id: goalPack.id,
    fingerprint: goalPack.fingerprint,
    objective: goalPack.objective,
    category: goalPack.category,
    scope: goalPack.scope,
    completionMode: 'deterministic-verification',
  };
  if (
    governedGoal.fingerprint !== goalPack.fingerprint ||
    governedGoal.objective !== goalPack.objective ||
    governedGoal.category !== goalPack.category
  ) {
    throw new Error('The durable Goal session does not match its canonical Goal Pack.');
  }
  return {
    goalPackId: goalPack.id,
    governedGoal,
    ...(input.verifiedGoal ? { verifiedGoal: input.verifiedGoal } : {}),
    maxAttempts: policy.maxAttempts,
    attemptsUsed: Math.max(attemptsUsed, repairAttemptsUsed),
  };
}

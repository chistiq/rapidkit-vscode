import chainContractJson from '../../contracts/workspace-intelligence-chain.v1.json';

export const WORKSPACE_INTELLIGENCE_CHAIN_SCHEMA_VERSION =
  'workspai-workspace-intelligence-chain-v1' as const;

export type WorkspaceIntelligenceChainContractStep = {
  id: string;
  ordinal: number;
  phase: string;
  label: string;
  command: string[];
  consumerArgs?: Record<string, string[]>;
  consumes: string[];
  produces: string[];
  dependsOn: string[];
  exitPolicy: 'stop-on-error' | 'continue-on-structured-verdict';
  purpose: string;
};

export type WorkspaceIntelligenceExecutionOperation = {
  id: string;
  executionPoint: string;
  artifacts: string[];
  failurePolicy: string;
  purpose: string;
};

export type WorkspaceIntelligenceExecutionMilestone = {
  id: string;
  label: string;
  kind: 'preflight' | 'stage';
  phase: string;
  purpose: string;
};

type WorkspaceIntelligenceChainContract = {
  schemaVersion: string;
  invariant: string;
  executionEnvelope: {
    rule: string;
    operations: WorkspaceIntelligenceExecutionOperation[];
  };
  steps: WorkspaceIntelligenceChainContractStep[];
  consumers: {
    agents: {
      canonicalReadOrder: string[];
      entrypoints: string[];
      rule: string;
    };
  };
};

const contract = chainContractJson as WorkspaceIntelligenceChainContract;

function labelFromContractId(id: string): string {
  return id
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function getWorkspaceIntelligenceChainSteps(
  consumer = 'vscode'
): WorkspaceIntelligenceChainContractStep[] {
  return contract.steps.map((step) => ({
    ...step,
    command: [...step.command, ...(step.consumerArgs?.[consumer] ?? [])],
    ...(step.consumerArgs
      ? {
          consumerArgs: Object.fromEntries(
            Object.entries(step.consumerArgs).map(([key, args]) => [key, [...args]])
          ),
        }
      : {}),
    consumes: [...step.consumes],
    produces: [...step.produces],
    dependsOn: [...step.dependsOn],
  }));
}

export function getWorkspaceIntelligenceExecutionMilestones(): WorkspaceIntelligenceExecutionMilestone[] {
  const steps = getWorkspaceIntelligenceChainSteps();
  const operations = contract.executionEnvelope.operations;
  const consumedOperations = new Set<string>();
  const milestones: WorkspaceIntelligenceExecutionMilestone[] = [];

  steps.forEach((step, index) => {
    const previous = steps[index - 1];
    for (const operation of operations) {
      const beforeCurrent = operation.executionPoint === `before:${step.id}`;
      const betweenStages =
        previous && operation.executionPoint === `after:${previous.id}-before:${step.id}`;
      if (!beforeCurrent && !betweenStages) {
        continue;
      }
      consumedOperations.add(operation.id);
      milestones.push({
        id: operation.id,
        label: labelFromContractId(operation.id),
        kind: 'preflight',
        phase: 'preflight',
        purpose: operation.purpose,
      });
    }
    milestones.push({
      id: step.id,
      label: step.label,
      kind: 'stage',
      phase: step.phase,
      purpose: step.purpose,
    });
  });

  const unplaced = operations.filter((operation) => !consumedOperations.has(operation.id));
  if (unplaced.length > 0) {
    throw new Error(
      `Workspace Intelligence contract contains unplaced execution operations: ${unplaced
        .map((operation) => operation.id)
        .join(', ')}`
    );
  }
  return milestones;
}

export function getWorkspaceIntelligenceAgentReadOrder(): string[] {
  return [...contract.consumers.agents.canonicalReadOrder];
}

export function getWorkspaceIntelligenceChainInvariant(): string {
  return `${contract.invariant} ${contract.executionEnvelope.rule}`;
}

export function isWorkspaceIntelligenceMilestoneId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    getWorkspaceIntelligenceExecutionMilestones().some((milestone) => milestone.id === value)
  );
}

export function resolveWorkspaceIntelligenceRunMilestone(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const report = value as Record<string, unknown>;
  const preflight = Array.isArray(report.preflight) ? report.preflight : [];
  const stages = Array.isArray(report.stages) ? report.stages : [];
  const observations = [...preflight, ...stages].filter(
    (entry): entry is Record<string, unknown> =>
      Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
  );
  const byId = new Map(
    observations
      .filter((entry) => typeof entry.id === 'string')
      .map((entry) => [String(entry.id), entry])
  );
  const milestones = getWorkspaceIntelligenceExecutionMilestones();
  const blocked = milestones.find((milestone) => {
    const status = byId.get(milestone.id)?.status;
    return status === 'blocked' || status === 'failed';
  });
  if (blocked) {
    return blocked.id;
  }

  return [...milestones].reverse().find((milestone) => byId.get(milestone.id)?.status === 'passed')
    ?.id;
}

export function validateWorkspaceIntelligenceChainContract(): string[] {
  const errors: string[] = [];
  if (contract.schemaVersion !== WORKSPACE_INTELLIGENCE_CHAIN_SCHEMA_VERSION) {
    errors.push(`Unsupported intelligence chain schema: ${contract.schemaVersion}`);
  }
  const seen = new Set<string>();
  contract.steps.forEach((step, index) => {
    if (step.ordinal !== index + 1) {
      errors.push(`Invalid chain ordinal: ${step.id}`);
    }
    if (seen.has(step.id)) {
      errors.push(`Duplicate chain step: ${step.id}`);
    }
    for (const dependency of step.dependsOn) {
      if (!seen.has(dependency)) {
        errors.push(`Forward or missing dependency: ${step.id} -> ${dependency}`);
      }
    }
    if (step.command.length < 2) {
      errors.push(`Chain step has no executable command: ${step.id}`);
    }
    seen.add(step.id);
  });
  try {
    const milestones = getWorkspaceIntelligenceExecutionMilestones();
    if (new Set(milestones.map((milestone) => milestone.id)).size !== milestones.length) {
      errors.push('Duplicate Workspace Intelligence execution milestone.');
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return errors;
}

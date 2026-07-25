import {
  WORKSPACE_MODEL_DIFF_REPORT_PATH,
  WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH,
} from './workspaceIntelligencePaths';
export {
  resolveWorkspacePathForEvidenceTerminal,
  shouldRefreshEvidenceOnTerminalClose,
  trackWorkspaceEvidenceTerminal,
} from './evidenceTerminalTracker';
import { fetchRuntimeCommandSurface } from './runtimeCommandSurface';
import {
  runWorkspaceIntelligenceCommandWithProgress,
  runWorkspaceIntelligenceSequenceWithProgress,
  type IntelligenceSequenceStep,
} from './workspaceIntelligenceProgressRunner';
import { getWorkspaceIntelligenceChainSteps } from './workspaceIntelligenceChainContract';

/** Phase 4 narrative steps — optional; gated by workspace subcommand surface, not intelligence gate. */
export const WORKSPACE_INTELLIGENCE_PHASE4_SUBCOMMANDS = ['why', 'trace'] as const;

export function buildWorkspaceIntelligenceUnifiedRunnerCommand(): string[] {
  return ['workspace', 'intelligence', 'run', '--for-agent', 'vscode', '--json'];
}

export function buildWorkspaceIntelligenceCoreChainCommands(): string[][] {
  return getWorkspaceIntelligenceChainSteps().map((step) => step.command);
}

export function buildWorkspaceIntelligencePhase4ChainCommands(): string[][] {
  return [
    ['workspace', 'why', 'release-blocked', '--json', '--write'],
    ['workspace', 'trace', '--from', WORKSPACE_MODEL_DIFF_REPORT_PATH, '--json', '--write'],
  ];
}

export function buildWorkspaceIntelligenceChainCommands(options?: {
  includePhase4?: boolean;
}): string[][] {
  const core = buildWorkspaceIntelligenceCoreChainCommands();
  if (!options?.includePhase4) {
    return core;
  }
  return [...core, ...buildWorkspaceIntelligencePhase4ChainCommands()];
}

export async function resolveWorkspaceIntelligencePhase4Available(cwd: string): Promise<boolean> {
  const surface = await fetchRuntimeCommandSurface({ cwd });
  if (!surface) {
    return false;
  }
  const advertised = new Set(surface.workspaceSubcommands);
  return WORKSPACE_INTELLIGENCE_PHASE4_SUBCOMMANDS.every((subcommand) =>
    advertised.has(subcommand)
  );
}

export function buildWorkspaceImpactLensCommands(scope?: string): string[][] {
  const impactCommand = [
    'workspace',
    'impact',
    '--from',
    WORKSPACE_MODEL_DIFF_REPORT_PATH,
    '--json',
  ];
  if (scope?.trim()) {
    impactCommand.push('--scope', scope.trim());
  }

  return [
    ['workspace', 'snapshot', '--json'],
    ['workspace', 'diff', '--from', WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH, '--json'],
    impactCommand,
  ];
}

function labelForCommand(command: string[], fallback: string): string {
  const [, subcommand] = command;
  if (command[0] === 'doctor') {
    return 'Doctor Evidence';
  }
  if (command[0] === 'readiness') {
    return 'Readiness Evidence';
  }
  if (command[0] === 'analyze') {
    return 'Analyze Evidence';
  }
  if (command[0] === 'workspace' && command[1] === 'contract') {
    return 'Contract Evidence';
  }
  switch (subcommand) {
    case 'model':
      return 'Model';
    case 'snapshot':
      return 'Snapshot';
    case 'diff':
      return 'Diff';
    case 'impact':
      return 'Impact';
    case 'verify':
      return 'Verify';
    case 'context':
      return 'Agent Context';
    case 'agent-sync':
      return 'Agent Grounding';
    case 'explain':
      return 'Explain';
    case 'why':
      return 'Why';
    case 'trace':
      return 'Trace';
    default:
      return fallback;
  }
}

function commandsAddressSameStage(left: string[], right: string[]): boolean {
  if (left[0] !== right[0]) {
    return false;
  }
  if (left[0] !== 'workspace') {
    return left[0] === 'doctor' ? left[1] === right[1] : true;
  }
  if (left[1] !== right[1]) {
    return false;
  }
  if (left[1] === 'contract') {
    return left[2] === right[2];
  }
  return true;
}

export function toWorkspaceIntelligenceSequenceSteps(
  commands: string[][]
): IntelligenceSequenceStep[] {
  const contractedSteps = getWorkspaceIntelligenceChainSteps();
  return commands.map((command, index) => {
    const contractedStep = contractedSteps.find((step) =>
      commandsAddressSameStage(step.command, command)
    );
    return {
      command,
      label: contractedStep?.label ?? labelForCommand(command, `Step ${index + 1}`),
      ...(contractedStep ? { exitPolicy: contractedStep.exitPolicy } : {}),
    };
  });
}

export async function dispatchWorkspaceIntelligenceChain(input: {
  workspacePath: string;
  workspaceName: string;
  label?: string;
}): Promise<void> {
  const includePhase4 = await resolveWorkspaceIntelligencePhase4Available(input.workspacePath);
  const result = await runWorkspaceIntelligenceCommandWithProgress({
    title: input.label ?? `Intelligence Chain — ${input.workspaceName}`,
    cwd: input.workspacePath,
    command: buildWorkspaceIntelligenceUnifiedRunnerCommand(),
    featureLabel: 'Workspace Intelligence',
    suppressFailureMessage: true,
  });
  if (!includePhase4 || !result || result.failed) {
    return;
  }
  await runWorkspaceIntelligenceSequenceWithProgress({
    title: `${input.label ?? `Intelligence Chain — ${input.workspaceName}`} · Narrative`,
    cwd: input.workspacePath,
    steps: toWorkspaceIntelligenceSequenceSteps(buildWorkspaceIntelligencePhase4ChainCommands()),
  });
}

export async function dispatchWorkspaceImpactLens(input: {
  workspacePath: string;
  workspaceName: string;
  scope?: string;
  label?: string;
}): Promise<void> {
  await runWorkspaceIntelligenceSequenceWithProgress({
    title: input.label ?? `Workspace Advisor — ${input.workspaceName}`,
    cwd: input.workspacePath,
    steps: toWorkspaceIntelligenceSequenceSteps(buildWorkspaceImpactLensCommands(input.scope)),
  });
}

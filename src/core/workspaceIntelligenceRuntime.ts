import {
  WORKSPACE_IMPACT_REPORT_PATH,
  WORKSPACE_MODEL_DIFF_REPORT_PATH,
  WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH,
} from './workspaceIntelligencePaths';
import {
  buildWorkspaceAgentContextCliArgs,
  buildWorkspaceAgentSyncCliArgs,
} from './agentContextPack';
export {
  resolveWorkspacePathForEvidenceTerminal,
  shouldRefreshEvidenceOnTerminalClose,
  trackWorkspaceEvidenceTerminal,
} from './evidenceTerminalTracker';
import { fetchRuntimeCommandSurface } from './runtimeCommandSurface';
import {
  runWorkspaceIntelligenceSequenceWithProgress,
  type IntelligenceSequenceStep,
} from './workspaceIntelligenceProgressRunner';

/** Phase 4 narrative steps — optional; gated by workspace subcommand surface, not intelligence gate. */
export const WORKSPACE_INTELLIGENCE_PHASE4_SUBCOMMANDS = ['why', 'trace'] as const;

export function buildWorkspaceIntelligenceCoreChainCommands(): string[][] {
  return [
    ['workspace', 'model', '--json', '--write'],
    ['workspace', 'snapshot', '--json'],
    ['workspace', 'diff', '--from', WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH, '--json'],
    ['workspace', 'impact', '--from', WORKSPACE_MODEL_DIFF_REPORT_PATH, '--json'],
    ['workspace', 'verify', '--from-impact', WORKSPACE_IMPACT_REPORT_PATH, '--json'],
    buildWorkspaceAgentContextCliArgs(),
    buildWorkspaceAgentSyncCliArgs(),
    ['workspace', 'explain', 'release-blocked', '--json', '--write'],
  ];
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

const WORKSPACE_INTELLIGENCE_CHAIN_LABELS = [
  'Model',
  'Snapshot',
  'Diff',
  'Impact',
  'Verify',
  'Agent Context',
  'Agent Grounding',
  'Explain',
  'Why',
  'Trace',
];

function labelForCommand(command: string[], fallback: string): string {
  const [, subcommand] = command;
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

function toSequenceSteps(commands: string[][]): IntelligenceSequenceStep[] {
  return commands.map((command, index) => ({
    command,
    label: labelForCommand(
      command,
      WORKSPACE_INTELLIGENCE_CHAIN_LABELS[index] ?? `Step ${index + 1}`
    ),
  }));
}

export async function dispatchWorkspaceIntelligenceChain(input: {
  workspacePath: string;
  workspaceName: string;
  label?: string;
}): Promise<void> {
  const includePhase4 = await resolveWorkspaceIntelligencePhase4Available(input.workspacePath);
  await runWorkspaceIntelligenceSequenceWithProgress({
    title: input.label ?? `Intelligence Chain — ${input.workspaceName}`,
    cwd: input.workspacePath,
    steps: toSequenceSteps(buildWorkspaceIntelligenceChainCommands({ includePhase4 })),
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
    steps: toSequenceSteps(buildWorkspaceImpactLensCommands(input.scope)),
  });
}

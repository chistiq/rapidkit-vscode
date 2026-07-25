export type WorkspaceCommandInvocationSource =
  | 'dashboard'
  | 'studio'
  | 'sidebar'
  | 'command-palette'
  | 'automation';

export type WorkspaceCommandPresetId =
  | 'default'
  | 'preview'
  | 'incremental'
  | 'cached'
  | 'strict'
  | 'minimal'
  | 'enterprise'
  | 'hooks'
  | 'from-impact';

export type WorkspaceCommandPreset = {
  id: WorkspaceCommandPresetId;
  label: string;
  description: string;
  detail: string;
  args: string[];
  requiresArtifact?: boolean;
};

export type WorkspaceCommandPresetGroup = {
  commandId: string;
  title: string;
  placeHolder: string;
  presets: WorkspaceCommandPreset[];
};

export const DASHBOARD_WORKSPACE_COMMAND_SOURCE: WorkspaceCommandInvocationSource = 'dashboard';

export const WORKSPACE_COMMAND_PRESET_GROUPS: Record<string, WorkspaceCommandPresetGroup> = {
  workspaceModel: {
    commandId: 'workspaceModel',
    title: 'Workspace Model',
    placeHolder: 'Choose how to build the workspace model',
    presets: [
      {
        id: 'default',
        label: 'Write canonical model',
        description: '--json --write',
        detail: 'Best for dashboard cards, Studio, and agent-ready evidence.',
        args: ['workspace', 'model', '--json', '--write'],
      },
      {
        id: 'preview',
        label: 'Preview JSON only',
        description: '--json',
        detail: 'Inspect the model without writing report files.',
        args: ['workspace', 'model', '--json'],
      },
      {
        id: 'incremental',
        label: 'Incremental rebuild',
        description: '--incremental --json --write',
        detail: 'Reuse unchanged project inputs while refreshing written evidence.',
        args: ['workspace', 'model', '--incremental', '--json', '--write'],
      },
      {
        id: 'cached',
        label: 'Read from cache',
        description: '--cache --json',
        detail: 'Fast inspection path when cache freshness is acceptable.',
        args: ['workspace', 'model', '--cache', '--json'],
      },
    ],
  },
  workspaceContextAgent: {
    commandId: 'workspaceContextAgent',
    title: 'Agent Context Pack',
    placeHolder: 'Choose agent-context output mode',
    presets: [
      {
        id: 'default',
        label: 'Write agent context',
        description: '--for-agent --json --write',
        detail: 'Writes the reusable workspace-context-agent report.',
        args: ['workspace', 'context', '--for-agent', '--json', '--write'],
      },
      {
        id: 'preview',
        label: 'Preview JSON only',
        description: '--for-agent --json',
        detail: 'Inspect agent context without changing files.',
        args: ['workspace', 'context', '--for-agent', '--json'],
      },
      {
        id: 'minimal',
        label: 'Write context only',
        description: '--write --no-agent-sync',
        detail: 'Skip automatic agent-sync when only the context report should change.',
        args: ['workspace', 'context', '--for-agent', '--json', '--write', '--no-agent-sync'],
      },
    ],
  },
  workspaceAgentSync: {
    commandId: 'workspaceAgentSync',
    title: 'Agent Grounding Sync',
    placeHolder: 'Choose agent-grounding target',
    presets: [
      {
        id: 'enterprise',
        label: 'Enterprise grounding',
        description: '--preset enterprise --target vscode',
        detail: 'Writes AGENTS.md, IDE surfaces, reports index, skills, and MCP design.',
        args: [
          'workspace',
          'agent-sync',
          '--write',
          '--refresh-context',
          '--json',
          '--preset',
          'enterprise',
          '--target',
          'vscode',
        ],
      },
      {
        id: 'minimal',
        label: 'Minimal grounding',
        description: '--preset minimal --target vscode',
        detail: 'Smaller generated surface for lightweight workspaces.',
        args: [
          'workspace',
          'agent-sync',
          '--write',
          '--refresh-context',
          '--json',
          '--preset',
          'minimal',
          '--target',
          'vscode',
        ],
      },
      {
        id: 'strict',
        label: 'Strict CI-style gate',
        description: '--strict',
        detail: 'Fail when required reports are missing or stale.',
        args: [
          'workspace',
          'agent-sync',
          '--write',
          '--refresh-context',
          '--json',
          '--preset',
          'enterprise',
          '--target',
          'vscode',
          '--strict',
        ],
      },
      {
        id: 'hooks',
        label: 'Enterprise + hooks',
        description: '--experimental-hooks',
        detail: 'Also writes optional advisory VS Code agent hooks.',
        args: [
          'workspace',
          'agent-sync',
          '--write',
          '--refresh-context',
          '--json',
          '--preset',
          'enterprise',
          '--target',
          'vscode',
          '--experimental-hooks',
        ],
      },
    ],
  },
  workspaceVerify: {
    commandId: 'workspaceVerify',
    title: 'Workspace Verify',
    placeHolder: 'Choose verification mode',
    presets: [
      {
        id: 'default',
        label: 'Verify current workspace',
        description: '--json',
        detail: 'Best default for sidebar checks and dashboard refresh.',
        args: ['workspace', 'verify', '--json'],
      },
      {
        id: 'strict',
        label: 'Strict release gate',
        description: '--strict --json',
        detail: 'Use when warnings and stale evidence should fail the gate.',
        args: ['workspace', 'verify', '--strict', '--json'],
      },
      {
        id: 'from-impact',
        label: 'Verify from impact report',
        description: '--from-impact <report> --json',
        detail: 'Use after workspace impact generated a blast-radius report.',
        args: ['workspace', 'verify', '--from-impact', '<impact-report>', '--json'],
        requiresArtifact: true,
      },
    ],
  },
  workspaceDiff: {
    commandId: 'workspaceDiff',
    title: 'Workspace Diff',
    placeHolder: 'Choose diff input and output mode',
    presets: [
      {
        id: 'default',
        label: 'Diff from baseline report',
        description: '--from <baseline> --json',
        detail: 'Compare the current model with a snapshot, model report, or git-backed baseline.',
        args: ['workspace', 'diff', '--from', '<baseline-report>', '--json'],
        requiresArtifact: true,
      },
    ],
  },
  workspaceImpact: {
    commandId: 'workspaceImpact',
    title: 'Workspace Impact',
    placeHolder: 'Choose impact input mode',
    presets: [
      {
        id: 'default',
        label: 'Impact from diff/report',
        description: '--from <change-report> --json',
        detail: 'Resolve blast radius from a diff, snapshot, or model report.',
        args: ['workspace', 'impact', '--from', '<change-report>', '--json'],
        requiresArtifact: true,
      },
    ],
  },
  workspaceExplain: {
    commandId: 'workspaceExplain',
    title: 'Workspace Explain',
    placeHolder: 'Choose explanation output mode',
    presets: [
      {
        id: 'default',
        label: 'Write release-blocked explanation',
        description: 'release-blocked --json --write',
        detail: 'Best for dashboard, Studio, and agent handoff artifacts.',
        args: ['workspace', 'explain', '<target>', '--json', '--write'],
      },
      {
        id: 'preview',
        label: 'Preview explanation JSON',
        description: 'release-blocked --json',
        detail: 'Inspect the narrative without writing report files.',
        args: ['workspace', 'explain', '<target>', '--json'],
      },
    ],
  },
  workspaceWhy: {
    commandId: 'workspaceWhy',
    title: 'Workspace Why',
    placeHolder: 'Choose why output mode',
    presets: [
      {
        id: 'default',
        label: 'Write why narrative',
        description: 'release-blocked --json --write',
        detail: 'Alias of explain for human-friendly blocker investigation.',
        args: ['workspace', 'why', '<target>', '--json', '--write'],
      },
      {
        id: 'preview',
        label: 'Preview why JSON',
        description: 'release-blocked --json',
        detail: 'Inspect the narrative without writing report files.',
        args: ['workspace', 'why', '<target>', '--json'],
      },
    ],
  },
  workspaceTrace: {
    commandId: 'workspaceTrace',
    title: 'Workspace Trace',
    placeHolder: 'Choose trace input and output mode',
    presets: [
      {
        id: 'default',
        label: 'Write diff-to-gates trace',
        description: '--from <diff> --json --write',
        detail: 'Trace a diff through impact and verification gates for agents and Studio.',
        args: ['workspace', 'trace', '--from', '<diff-report>', '--json', '--write'],
        requiresArtifact: true,
      },
      {
        id: 'preview',
        label: 'Preview trace JSON',
        description: '--from <diff> --json',
        detail: 'Inspect trace output without writing report files.',
        args: ['workspace', 'trace', '--from', '<diff-report>', '--json'],
        requiresArtifact: true,
      },
    ],
  },
  workspaceRemediationPlan: {
    commandId: 'workspaceRemediationPlan',
    title: 'Workspace Repair Plan',
    placeHolder: 'Choose repair-plan output mode',
    presets: [
      {
        id: 'default',
        label: 'Write Studio repair plan',
        description: '--ci --json --write --include-paths',
        detail: 'Best for Studio: writes cross-artifact repair steps with file paths.',
        args: ['workspace', 'remediation-plan', '--ci', '--json', '--write', '--include-paths'],
      },
      {
        id: 'preview',
        label: 'Preview repair plan JSON',
        description: '--ci --json --include-paths',
        detail: 'Inspect the plan without writing report files.',
        args: ['workspace', 'remediation-plan', '--ci', '--json', '--include-paths'],
      },
    ],
  },
};

export function getWorkspaceCommandPresetGroup(
  commandId: string
): WorkspaceCommandPresetGroup | undefined {
  return WORKSPACE_COMMAND_PRESET_GROUPS[commandId];
}

export function getWorkspaceCommandPreset(
  commandId: string,
  presetId: string | undefined
): WorkspaceCommandPreset | undefined {
  const group = getWorkspaceCommandPresetGroup(commandId);
  return group?.presets.find((preset) => preset.id === presetId);
}

export function shouldPromptForWorkspaceCommandPreset(input: {
  source?: unknown;
  preset?: unknown;
  forcePresetPrompt?: unknown;
}): boolean {
  if (input.forcePresetPrompt === true) {
    return true;
  }
  if (typeof input.preset === 'string' && input.preset.trim().length > 0) {
    return false;
  }
  return input.source !== DASHBOARD_WORKSPACE_COMMAND_SOURCE && input.source !== 'studio';
}

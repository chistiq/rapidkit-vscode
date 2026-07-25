import {
  buildAgentGroundingSyncCliSnippet,
  buildIntelligenceChainCliSnippet,
  WORKSPACE_IMPACT_REPORT_PATH,
} from './workspaceIntelligencePaths';

export type IncidentCliActionScope = 'workspace' | 'project';

export type IncidentCliActionEntry = {
  id: string;
  scope: IncidentCliActionScope;
  label: string;
  detail: string;
  command: string;
  stability: 'stable' | 'advanced';
  actionTypes?: string[];
};

// Source-driven from the Workspai CLI command surface:
// doctor [scope], readiness, workspace <action>, workspace run <stage>, init/dev/build/test/shell.
const INCIDENT_CLI_ACTION_ENTRIES: IncidentCliActionEntry[] = [
  {
    id: 'workspace-doctor',
    scope: 'workspace',
    label: 'Run workspace doctor',
    detail: 'Deterministic workspace health check from doctor evidence pipeline.',
    command: 'npx workspai doctor workspace',
    stability: 'stable',
    actionTypes: ['doctor-workspace-check'],
  },
  {
    id: 'workspace-doctor-fix',
    scope: 'workspace',
    label: 'Apply doctor safe fixes',
    detail: 'Runs doctor autofix for known, safe remediation paths.',
    command: 'npx workspai doctor workspace --fix',
    stability: 'stable',
    actionTypes: ['doctor-fix', 'doctor-workspace-fix'],
  },
  {
    id: 'workspace-readiness-json',
    scope: 'workspace',
    label: 'Generate readiness JSON',
    detail: 'Machine-readable release readiness artifact for CI and governance.',
    command: 'npx workspai readiness --json',
    stability: 'stable',
    actionTypes: ['release-readiness-commander'],
  },
  {
    id: 'workspace-pipeline-json',
    scope: 'workspace',
    label: 'Run governance pipeline',
    detail:
      'Orchestrates sync, doctor, analyze, readiness, and autopilot with pipeline-last-run.json evidence.',
    command: 'npx workspai pipeline --json --strict',
    stability: 'stable',
    actionTypes: ['release-readiness-commander', 'governance-pipeline'],
  },
  {
    id: 'workspace-archive',
    scope: 'workspace',
    label: 'Build customer archive',
    detail: 'Create workspace archive manifest for ship handoff evidence.',
    command: 'npx workspai workspace export --output team-workspace.rapidkit-archive.zip --json',
    stability: 'stable',
  },
  {
    id: 'workspace-autopilot-release',
    scope: 'workspace',
    label: 'Run autopilot release',
    detail: 'Execute fleet autopilot release gate after readiness and verify evidence.',
    command: 'npx workspai autopilot release',
    stability: 'stable',
    actionTypes: ['release-readiness-commander'],
  },
  {
    id: 'workspace-analyze-json',
    scope: 'workspace',
    label: 'Run workspace analyze',
    detail: 'Strict analyze report used by verify-gates and release posture.',
    command: 'npx workspai analyze --json',
    stability: 'stable',
  },
  {
    id: 'workspace-policy-show',
    scope: 'workspace',
    label: 'Show workspace policy',
    detail: 'Inspect effective workspace policy and governance posture.',
    command: 'npx workspai workspace policy show',
    stability: 'advanced',
    actionTypes: ['view-compliance-report'],
  },
  {
    id: 'workspace-sync',
    scope: 'workspace',
    label: 'Sync workspace projects',
    detail: 'Refresh workspace project inventory from filesystem state.',
    command: 'npx workspai workspace sync',
    stability: 'advanced',
  },
  {
    id: 'workspace-intelligence-chain',
    scope: 'workspace',
    label: 'Run intelligence chain',
    detail:
      'Model → snapshot → diff → advisor → verify → agent context with workspace intelligence reports.',
    command: buildIntelligenceChainCliSnippet(),
    stability: 'advanced',
    actionTypes: ['workspace-intelligence-chain'],
  },
  {
    id: 'workspace-agent-grounding-sync',
    scope: 'workspace',
    label: 'Agent grounding sync',
    detail: 'Write INDEX.json, AGENTS.md, and Copilot/Cursor/Claude hooks from workspace evidence.',
    command: buildAgentGroundingSyncCliSnippet(),
    stability: 'stable',
    actionTypes: ['workspace-agent-sync', 'agent-grounding'],
  },
  {
    id: 'workspace-context-agent-json',
    scope: 'workspace',
    label: 'Agent context pack',
    detail: 'Write workspace-context-agent.json for Workspai AI and Copilot Chat #file attachment.',
    command: 'npx workspai workspace context --for-agent --json --write',
    stability: 'advanced',
    actionTypes: ['workspace-context-agent', 'agent-context'],
  },
  {
    id: 'workspace-verify-json',
    scope: 'workspace',
    label: 'Workspace verify',
    detail: 'Evaluate Workspace Advisor verification evidence from workspace-impact-last-run.json.',
    command: `npx workspai workspace verify --from-impact ${WORKSPACE_IMPACT_REPORT_PATH} --json`,
    stability: 'stable',
    actionTypes: ['workspace-verify', 'verify-pack-autopilot'],
  },
  {
    id: 'workspace-model-json',
    scope: 'workspace',
    label: 'Workspace model',
    detail: 'Canonical workspace project graph and command surface artifact.',
    command: 'npx workspai workspace model --json --write',
    stability: 'advanced',
    actionTypes: ['workspace-model'],
  },
  {
    id: 'workspace-run-init',
    scope: 'workspace',
    label: 'Run workspace init',
    detail:
      'Mirrored full-init alias (same behavior as `workspai init` and `workspai workspace init` at workspace root).',
    command: 'npx workspai workspace run init',
    stability: 'advanced',
  },
  {
    id: 'workspace-run-test',
    scope: 'workspace',
    label: 'Run workspace test',
    detail: 'Execute workspace-wide test stage across selected projects.',
    command: 'npx workspai workspace run test',
    stability: 'advanced',
  },
  {
    id: 'workspace-run-build',
    scope: 'workspace',
    label: 'Run workspace build',
    detail: 'Execute workspace-wide build stage across selected projects.',
    command: 'npx workspai workspace run build',
    stability: 'advanced',
  },
  {
    id: 'workspace-run-start',
    scope: 'workspace',
    label: 'Run workspace start',
    detail: 'Execute workspace-wide start stage across selected projects.',
    command: 'npx workspai workspace run start',
    stability: 'advanced',
  },
  {
    id: 'project-init',
    scope: 'project',
    label: 'Initialize project dependencies',
    detail: 'Install and align project dependencies for local execution.',
    command: 'npx workspai init',
    stability: 'stable',
    actionTypes: ['project-init'],
  },
  {
    id: 'project-doctor',
    scope: 'project',
    label: 'Run project doctor',
    detail: 'Deterministic project health check for the selected service scope.',
    command: 'npx workspai doctor project',
    stability: 'stable',
    actionTypes: ['doctor-project-check'],
  },
  {
    id: 'project-test',
    scope: 'project',
    label: 'Run project tests',
    detail: 'Execute project test suite as deterministic verification.',
    command: 'npx workspai test',
    stability: 'stable',
    actionTypes: ['project-test', 'verify-pack-autopilot'],
  },
  {
    id: 'project-build',
    scope: 'project',
    label: 'Build project',
    detail: 'Compile/build project artifacts and detect build-time regressions.',
    command: 'npx workspai build',
    stability: 'stable',
    actionTypes: ['project-build'],
  },
  {
    id: 'project-shell-activate',
    scope: 'project',
    label: 'Print shell activation snippet',
    detail: 'Shows activation snippet for current project workspace shell.',
    command: 'npx workspai shell activate',
    stability: 'advanced',
    actionTypes: ['project-shell-activate'],
  },
  {
    id: 'project-browser-smoke-test',
    scope: 'project',
    label: 'Run browser smoke test',
    detail:
      'Open project in VS Code browser and verify key UI surfaces with AI-guided smoke test (VS Code 1.119+ browser agent tools).',
    command: 'npx workspai dev',
    stability: 'advanced',
    actionTypes: ['browser-smoke-test'],
  },
];

export function resolveIncidentCliActionByActionType(
  actionType: string | null | undefined,
  hasProjectSelected: boolean
): IncidentCliActionEntry | undefined {
  if (!actionType || !actionType.trim()) {
    return undefined;
  }

  const normalized = actionType.trim();
  const matrix = buildIncidentCliActionMatrix(hasProjectSelected);
  const all = [...matrix.workspace, ...matrix.project];
  return all.find((entry) => (entry.actionTypes || []).includes(normalized));
}

export function resolveIncidentCliActionIdByActionType(
  actionType: string | null | undefined,
  hasProjectSelected: boolean
): string | undefined {
  return resolveIncidentCliActionByActionType(actionType, hasProjectSelected)?.id;
}

export function buildIncidentCliActionMatrix(hasProjectSelected: boolean): {
  workspace: IncidentCliActionEntry[];
  project: IncidentCliActionEntry[];
} {
  const workspace = INCIDENT_CLI_ACTION_ENTRIES.filter((entry) => entry.scope === 'workspace');
  const project = hasProjectSelected
    ? INCIDENT_CLI_ACTION_ENTRIES.filter((entry) => entry.scope === 'project')
    : [];

  return { workspace, project };
}

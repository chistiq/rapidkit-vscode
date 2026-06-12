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

// Source-driven from rapidkit-npm command surface:
// doctor [scope], readiness, workspace <action>, workspace run <stage>, init/dev/build/test/shell.
const INCIDENT_CLI_ACTION_ENTRIES: IncidentCliActionEntry[] = [
  {
    id: 'workspace-doctor',
    scope: 'workspace',
    label: 'Run workspace doctor',
    detail: 'Deterministic workspace health check from doctor evidence pipeline.',
    command: 'npx rapidkit doctor workspace',
    stability: 'stable',
    actionTypes: ['doctor-workspace-check'],
  },
  {
    id: 'workspace-doctor-fix',
    scope: 'workspace',
    label: 'Apply doctor safe fixes',
    detail: 'Runs doctor autofix for known, safe remediation paths.',
    command: 'npx rapidkit doctor workspace --fix',
    stability: 'stable',
    actionTypes: ['doctor-fix', 'doctor-workspace-fix'],
  },
  {
    id: 'workspace-readiness-json',
    scope: 'workspace',
    label: 'Generate readiness JSON',
    detail: 'Machine-readable release readiness artifact for CI and governance.',
    command: 'npx rapidkit readiness --json',
    stability: 'stable',
  },
  {
    id: 'workspace-policy-show',
    scope: 'workspace',
    label: 'Show workspace policy',
    detail: 'Inspect effective workspace policy and governance posture.',
    command: 'npx rapidkit workspace policy show',
    stability: 'advanced',
    actionTypes: ['view-compliance-report'],
  },
  {
    id: 'workspace-sync',
    scope: 'workspace',
    label: 'Sync workspace projects',
    detail: 'Refresh workspace project inventory from filesystem state.',
    command: 'npx rapidkit workspace sync',
    stability: 'advanced',
  },
  {
    id: 'workspace-run-init',
    scope: 'workspace',
    label: 'Run workspace init',
    detail:
      'Mirrored full-init alias (same behavior as `rapidkit init` and `rapidkit workspace init` at workspace root).',
    command: 'npx rapidkit workspace run init',
    stability: 'advanced',
  },
  {
    id: 'workspace-run-test',
    scope: 'workspace',
    label: 'Run workspace test',
    detail: 'Execute workspace-wide test stage across selected projects.',
    command: 'npx rapidkit workspace run test',
    stability: 'advanced',
  },
  {
    id: 'workspace-run-build',
    scope: 'workspace',
    label: 'Run workspace build',
    detail: 'Execute workspace-wide build stage across selected projects.',
    command: 'npx rapidkit workspace run build',
    stability: 'advanced',
  },
  {
    id: 'workspace-run-start',
    scope: 'workspace',
    label: 'Run workspace start',
    detail: 'Execute workspace-wide start stage across selected projects.',
    command: 'npx rapidkit workspace run start',
    stability: 'advanced',
  },
  {
    id: 'project-init',
    scope: 'project',
    label: 'Initialize project dependencies',
    detail: 'Install and align project dependencies for local execution.',
    command: 'npx rapidkit init',
    stability: 'stable',
    actionTypes: ['project-init'],
  },
  {
    id: 'project-doctor',
    scope: 'project',
    label: 'Run project doctor',
    detail: 'Deterministic project health check for the selected service scope.',
    command: 'npx rapidkit doctor project',
    stability: 'stable',
    actionTypes: ['doctor-project-check'],
  },
  {
    id: 'project-test',
    scope: 'project',
    label: 'Run project tests',
    detail: 'Execute project test suite as deterministic verification.',
    command: 'npx rapidkit test',
    stability: 'stable',
    actionTypes: ['project-test', 'verify-pack-autopilot'],
  },
  {
    id: 'project-build',
    scope: 'project',
    label: 'Build project',
    detail: 'Compile/build project artifacts and detect build-time regressions.',
    command: 'npx rapidkit build',
    stability: 'stable',
    actionTypes: ['project-build'],
  },
  {
    id: 'project-shell-activate',
    scope: 'project',
    label: 'Print shell activation snippet',
    detail: 'Shows activation snippet for current project workspace shell.',
    command: 'npx rapidkit shell activate',
    stability: 'advanced',
    actionTypes: ['project-shell-activate'],
  },
  {
    id: 'project-browser-smoke-test',
    scope: 'project',
    label: 'Run browser smoke test',
    detail:
      'Open project in VS Code browser and verify key UI surfaces with AI-guided smoke test (VS Code 1.119+ browser agent tools).',
    command: 'npx rapidkit dev',
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

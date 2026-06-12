export type DashboardCommandScope = 'workspace' | 'project' | 'module' | 'system';

export type DashboardCommandHandler = 'webview-local' | 'extension-host';

export type DashboardCommandMeta = {
  id: string;
  label: string;
  scope: DashboardCommandScope;
  handler: DashboardCommandHandler;
  trackActivity: boolean;
};

export const DASHBOARD_COMMAND_REGISTRY = {
  openSetup: {
    id: 'openSetup',
    label: 'Open Setup',
    scope: 'system',
    handler: 'webview-local',
    trackActivity: false,
  },
  openCreateWorkspace: {
    id: 'openCreateWorkspace',
    label: 'Create Workspace',
    scope: 'system',
    handler: 'webview-local',
    trackActivity: false,
  },
  refreshModules: {
    id: 'refreshModules',
    label: 'Refresh Modules',
    scope: 'system',
    handler: 'extension-host',
    trackActivity: false,
  },
  quickSwitchWorkspace: {
    id: 'quickSwitchWorkspace',
    label: 'Switch Workspace',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
  },
  checkWorkspaceHealth: {
    id: 'checkWorkspaceHealth',
    label: 'Workspace Doctor',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
  },
  exportWorkspace: {
    id: 'exportWorkspace',
    label: 'Export Workspace',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
  },
  workspaceBootstrap: {
    id: 'workspaceBootstrap',
    label: 'Workspace Bootstrap',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
  },
  workspaceAnalyze: {
    id: 'workspaceAnalyze',
    label: 'Workspace Analyze',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
  },
  workspaceReadiness: {
    id: 'workspaceReadiness',
    label: 'Release Readiness',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
  },
  workspaceAutopilotRelease: {
    id: 'workspaceAutopilotRelease',
    label: 'Autopilot Release',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
  },
  workspaceShare: {
    id: 'workspaceShare',
    label: 'Share Bundle',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
  },
  workspaceSnapshotCreate: {
    id: 'workspaceSnapshotCreate',
    label: 'Create Snapshot',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
  },
  workspacePolicyShow: {
    id: 'workspacePolicyShow',
    label: 'Policy Review',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
  },
  mirrorSync: {
    id: 'mirrorSync',
    label: 'Mirror Sync',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
  },
  mirrorStatus: {
    id: 'mirrorStatus',
    label: 'Mirror Status',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
  },
  cacheStatus: {
    id: 'cacheStatus',
    label: 'Cache Status',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
  },
  workspaceInfra: {
    id: 'workspaceInfra',
    label: 'Infra Plan',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
  },
  workspaceArchive: {
    id: 'workspaceArchive',
    label: 'Archive',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
  },
  projectTerminal: {
    id: 'projectTerminal',
    label: 'Project Terminal',
    scope: 'project',
    handler: 'extension-host',
    trackActivity: true,
  },
  projectInit: {
    id: 'projectInit',
    label: 'Project Init',
    scope: 'project',
    handler: 'extension-host',
    trackActivity: true,
  },
  projectDev: {
    id: 'projectDev',
    label: 'Project Dev',
    scope: 'project',
    handler: 'extension-host',
    trackActivity: true,
  },
  projectStop: {
    id: 'projectStop',
    label: 'Project Stop',
    scope: 'project',
    handler: 'extension-host',
    trackActivity: true,
  },
  projectTest: {
    id: 'projectTest',
    label: 'Project Test',
    scope: 'project',
    handler: 'extension-host',
    trackActivity: true,
  },
  projectDoctor: {
    id: 'projectDoctor',
    label: 'Project Doctor',
    scope: 'project',
    handler: 'extension-host',
    trackActivity: true,
  },
  projectArchitecture: {
    id: 'projectArchitecture',
    label: 'Architecture Map',
    scope: 'project',
    handler: 'extension-host',
    trackActivity: true,
  },
  projectIncident: {
    id: 'projectIncident',
    label: 'Incident Studio',
    scope: 'project',
    handler: 'extension-host',
    trackActivity: true,
  },
  projectAI: {
    id: 'projectAI',
    label: 'Ask AI',
    scope: 'project',
    handler: 'extension-host',
    trackActivity: true,
  },
  projectRelease: {
    id: 'projectRelease',
    label: 'Release Commander',
    scope: 'project',
    handler: 'extension-host',
    trackActivity: true,
  },
  projectImpact: {
    id: 'projectImpact',
    label: 'Change Impact',
    scope: 'project',
    handler: 'extension-host',
    trackActivity: true,
  },
  projectBrowser: {
    id: 'projectBrowser',
    label: 'Project Browser',
    scope: 'project',
    handler: 'extension-host',
    trackActivity: true,
  },
  projectBuild: {
    id: 'projectBuild',
    label: 'Project Build',
    scope: 'project',
    handler: 'extension-host',
    trackActivity: true,
  },
  projectLint: {
    id: 'projectLint',
    label: 'Project Lint',
    scope: 'project',
    handler: 'extension-host',
    trackActivity: true,
  },
  projectFormat: {
    id: 'projectFormat',
    label: 'Project Format',
    scope: 'project',
    handler: 'extension-host',
    trackActivity: true,
  },
  moduleDiff: {
    id: 'moduleDiff',
    label: 'Module Diff',
    scope: 'module',
    handler: 'extension-host',
    trackActivity: true,
  },
  moduleRollback: {
    id: 'moduleRollback',
    label: 'Module Rollback',
    scope: 'module',
    handler: 'extension-host',
    trackActivity: true,
  },
  moduleUninstall: {
    id: 'moduleUninstall',
    label: 'Module Uninstall',
    scope: 'module',
    handler: 'extension-host',
    trackActivity: true,
  },
  moduleUpgrade: {
    id: 'moduleUpgrade',
    label: 'Module Upgrade',
    scope: 'module',
    handler: 'extension-host',
    trackActivity: true,
  },
} as const satisfies Record<string, DashboardCommandMeta>;

export type DashboardCommand = keyof typeof DASHBOARD_COMMAND_REGISTRY;

export function isDashboardCommand(command: string): command is DashboardCommand {
  return Object.prototype.hasOwnProperty.call(DASHBOARD_COMMAND_REGISTRY, command);
}

export function getDashboardCommandMeta(command: string): DashboardCommandMeta | undefined {
  return isDashboardCommand(command) ? DASHBOARD_COMMAND_REGISTRY[command] : undefined;
}

export function shouldTrackDashboardCommand(command: string): boolean {
  return getDashboardCommandMeta(command)?.trackActivity ?? true;
}

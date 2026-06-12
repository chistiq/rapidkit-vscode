export type DashboardCommandScope = 'workspace' | 'project' | 'module' | 'system';

export type DashboardCommandExecutionMode =
  | 'webview-local'
  | 'extension-host-handler'
  | 'vscode-command'
  | 'terminal-rapidkit'
  | 'terminal-shell';

export type DashboardCommandPayloadKind =
  | 'none'
  | 'workspace'
  | 'project-path'
  | 'project-context'
  | 'module-maintenance';

export type DashboardCommandContract = {
  id: string;
  label: string;
  scope: DashboardCommandScope;
  executionMode: DashboardCommandExecutionMode;
  trackActivity: boolean;
  requiresWorkspace?: boolean;
  requiresProject?: boolean;
  cliArgs?: string[];
  vscodeCommand?: string;
  payloadKind?: DashboardCommandPayloadKind;
  payloadDefaults?: Record<string, unknown>;
};

export const DASHBOARD_COMMAND_CONTRACTS = {
  openSetup: {
    id: 'openSetup',
    label: 'Open Setup',
    scope: 'system',
    executionMode: 'webview-local',
    trackActivity: false,
  },
  openCreateWorkspace: {
    id: 'openCreateWorkspace',
    label: 'Create Workspace',
    scope: 'system',
    executionMode: 'webview-local',
    trackActivity: false,
  },
  refreshModules: {
    id: 'refreshModules',
    label: 'Refresh Modules',
    scope: 'system',
    executionMode: 'extension-host-handler',
    trackActivity: false,
  },
  quickSwitchWorkspace: {
    id: 'quickSwitchWorkspace',
    label: 'Switch Workspace',
    scope: 'workspace',
    executionMode: 'vscode-command',
    trackActivity: true,
    vscodeCommand: 'workspai.quickSwitchWorkspace',
  },
  checkWorkspaceHealth: {
    id: 'checkWorkspaceHealth',
    label: 'Workspace Doctor',
    scope: 'workspace',
    executionMode: 'vscode-command',
    trackActivity: true,
    requiresWorkspace: true,
    cliArgs: ['doctor', 'workspace'],
    vscodeCommand: 'workspai.checkWorkspaceHealth',
  },
  exportWorkspace: {
    id: 'exportWorkspace',
    label: 'Export Workspace',
    scope: 'workspace',
    executionMode: 'vscode-command',
    trackActivity: true,
    requiresWorkspace: true,
    vscodeCommand: 'workspai.exportWorkspace',
  },
  workspaceBootstrap: {
    id: 'workspaceBootstrap',
    label: 'Workspace Bootstrap',
    scope: 'workspace',
    executionMode: 'terminal-rapidkit',
    trackActivity: true,
    requiresWorkspace: true,
    cliArgs: ['bootstrap'],
    vscodeCommand: 'workspai.workspaceBootstrap',
  },
  workspaceSetup: {
    id: 'workspaceSetup',
    label: 'Setup',
    scope: 'workspace',
    executionMode: 'terminal-rapidkit',
    trackActivity: true,
    requiresWorkspace: true,
    cliArgs: ['setup'],
    vscodeCommand: 'workspai.workspaceSetup',
  },
  workspaceAnalyze: {
    id: 'workspaceAnalyze',
    label: 'Workspace Analyze',
    scope: 'workspace',
    executionMode: 'terminal-rapidkit',
    trackActivity: true,
    requiresWorkspace: true,
    cliArgs: ['analyze', '--json'],
    vscodeCommand: 'workspai.workspaceAnalyze',
  },
  workspaceReadiness: {
    id: 'workspaceReadiness',
    label: 'Release Readiness',
    scope: 'workspace',
    executionMode: 'terminal-rapidkit',
    trackActivity: true,
    requiresWorkspace: true,
    cliArgs: ['readiness'],
    vscodeCommand: 'workspai.workspaceReadiness',
  },
  workspaceAutopilotRelease: {
    id: 'workspaceAutopilotRelease',
    label: 'Autopilot Release',
    scope: 'workspace',
    executionMode: 'terminal-rapidkit',
    trackActivity: true,
    requiresWorkspace: true,
    cliArgs: ['autopilot', 'release'],
    vscodeCommand: 'workspai.workspaceAutopilotRelease',
  },
  workspaceShare: {
    id: 'workspaceShare',
    label: 'Share Bundle',
    scope: 'workspace',
    executionMode: 'vscode-command',
    trackActivity: true,
    requiresWorkspace: true,
    vscodeCommand: 'workspai.exportWorkspaceShareBundle',
  },
  workspaceSnapshotCreate: {
    id: 'workspaceSnapshotCreate',
    label: 'Create Snapshot',
    scope: 'workspace',
    executionMode: 'terminal-rapidkit',
    trackActivity: true,
    requiresWorkspace: true,
    cliArgs: ['snapshot', 'create'],
    vscodeCommand: 'workspai.workspaceSnapshotCreate',
  },
  workspacePolicyShow: {
    id: 'workspacePolicyShow',
    label: 'Policy Review',
    scope: 'workspace',
    executionMode: 'terminal-rapidkit',
    trackActivity: true,
    requiresWorkspace: true,
    cliArgs: ['workspace', 'policy', 'show'],
    vscodeCommand: 'workspai.workspacePolicyShow',
  },
  mirrorSync: {
    id: 'mirrorSync',
    label: 'Mirror Sync',
    scope: 'workspace',
    executionMode: 'terminal-rapidkit',
    trackActivity: true,
    requiresWorkspace: true,
    cliArgs: ['mirror', 'sync'],
    vscodeCommand: 'workspai.mirrorSync',
  },
  mirrorStatus: {
    id: 'mirrorStatus',
    label: 'Mirror Status',
    scope: 'workspace',
    executionMode: 'terminal-rapidkit',
    trackActivity: true,
    requiresWorkspace: true,
    cliArgs: ['mirror', 'status'],
    vscodeCommand: 'workspai.mirrorStatus',
  },
  cacheStatus: {
    id: 'cacheStatus',
    label: 'Cache Status',
    scope: 'workspace',
    executionMode: 'terminal-rapidkit',
    trackActivity: true,
    requiresWorkspace: true,
    cliArgs: ['cache', 'status'],
    vscodeCommand: 'workspai.cacheStatus',
  },
  workspaceInfra: {
    id: 'workspaceInfra',
    label: 'Infra Plan',
    scope: 'workspace',
    executionMode: 'terminal-rapidkit',
    trackActivity: true,
    requiresWorkspace: true,
    cliArgs: ['infra', 'plan'],
    vscodeCommand: 'workspai.infra',
  },
  workspaceArchive: {
    id: 'workspaceArchive',
    label: 'Archive',
    scope: 'workspace',
    executionMode: 'terminal-rapidkit',
    trackActivity: true,
    requiresWorkspace: true,
    cliArgs: ['workspace', 'archive'],
    vscodeCommand: 'workspai.workspaceArchive',
  },
  projectTerminal: {
    id: 'projectTerminal',
    label: 'Project Terminal',
    scope: 'project',
    executionMode: 'vscode-command',
    trackActivity: true,
    requiresProject: true,
    vscodeCommand: 'workspai.projectTerminal',
  },
  projectInit: {
    id: 'projectInit',
    label: 'Project Init',
    scope: 'project',
    executionMode: 'terminal-rapidkit',
    trackActivity: true,
    requiresProject: true,
    cliArgs: ['init'],
    vscodeCommand: 'workspai.projectInit',
  },
  projectDev: {
    id: 'projectDev',
    label: 'Project Dev',
    scope: 'project',
    executionMode: 'terminal-rapidkit',
    trackActivity: true,
    requiresProject: true,
    cliArgs: ['dev'],
    vscodeCommand: 'workspai.projectDev',
  },
  projectStop: {
    id: 'projectStop',
    label: 'Project Stop',
    scope: 'project',
    executionMode: 'terminal-shell',
    trackActivity: true,
    requiresProject: true,
    vscodeCommand: 'workspai.projectStop',
  },
  projectTest: {
    id: 'projectTest',
    label: 'Project Test',
    scope: 'project',
    executionMode: 'terminal-rapidkit',
    trackActivity: true,
    requiresProject: true,
    cliArgs: ['test'],
    vscodeCommand: 'workspai.projectTest',
  },
  projectDoctor: {
    id: 'projectDoctor',
    label: 'Project Doctor',
    scope: 'project',
    executionMode: 'terminal-rapidkit',
    trackActivity: true,
    requiresProject: true,
    cliArgs: ['doctor', 'project'],
    vscodeCommand: 'workspai.projectDoctor',
    payloadKind: 'project-path',
    payloadDefaults: {
      preferredAction: 'check',
    },
  },
  projectArchitecture: {
    id: 'projectArchitecture',
    label: 'Architecture Map',
    scope: 'project',
    executionMode: 'vscode-command',
    trackActivity: true,
    requiresProject: true,
    vscodeCommand: 'workspai.openArchitectureMap',
    payloadKind: 'project-context',
  },
  projectIncident: {
    id: 'projectIncident',
    label: 'Incident Studio',
    scope: 'project',
    executionMode: 'vscode-command',
    trackActivity: true,
    requiresProject: true,
    vscodeCommand: 'workspai.openIncidentStudio',
    payloadKind: 'project-context',
  },
  projectAI: {
    id: 'projectAI',
    label: 'Ask AI',
    scope: 'project',
    executionMode: 'vscode-command',
    trackActivity: true,
    requiresProject: true,
    vscodeCommand: 'workspai.aiForProject',
    payloadKind: 'project-context',
  },
  projectRelease: {
    id: 'projectRelease',
    label: 'Release Commander',
    scope: 'project',
    executionMode: 'vscode-command',
    trackActivity: true,
    requiresProject: true,
    vscodeCommand: 'workspai.aiReleaseReadinessCommander',
    payloadKind: 'project-context',
    payloadDefaults: {
      source: 'dashboard',
      trigger: 'project_actions',
    },
  },
  projectImpact: {
    id: 'projectImpact',
    label: 'Change Impact',
    scope: 'project',
    executionMode: 'vscode-command',
    trackActivity: true,
    requiresProject: true,
    vscodeCommand: 'workspai.aiChangeImpactLite',
    payloadKind: 'project-context',
    payloadDefaults: {
      source: 'dashboard',
      trigger: 'project_actions',
    },
  },
  projectBrowser: {
    id: 'projectBrowser',
    label: 'Project Browser',
    scope: 'project',
    executionMode: 'vscode-command',
    trackActivity: true,
    requiresProject: true,
    vscodeCommand: 'workspai.projectBrowser',
  },
  projectBuild: {
    id: 'projectBuild',
    label: 'Project Build',
    scope: 'project',
    executionMode: 'terminal-rapidkit',
    trackActivity: true,
    requiresProject: true,
    cliArgs: ['build'],
    vscodeCommand: 'workspai.projectBuild',
  },
  projectLint: {
    id: 'projectLint',
    label: 'Project Lint',
    scope: 'project',
    executionMode: 'terminal-rapidkit',
    trackActivity: true,
    requiresProject: true,
    cliArgs: ['lint'],
    vscodeCommand: 'workspai.projectLint',
  },
  projectFormat: {
    id: 'projectFormat',
    label: 'Project Format',
    scope: 'project',
    executionMode: 'terminal-rapidkit',
    trackActivity: true,
    requiresProject: true,
    cliArgs: ['format'],
    vscodeCommand: 'workspai.projectFormat',
  },
  moduleDiff: {
    id: 'moduleDiff',
    label: 'Module Diff',
    scope: 'module',
    executionMode: 'vscode-command',
    trackActivity: true,
    requiresProject: true,
    cliArgs: ['diff', 'module', '<slug>'],
    vscodeCommand: 'workspai.moduleDiff',
  },
  moduleRollback: {
    id: 'moduleRollback',
    label: 'Module Rollback',
    scope: 'module',
    executionMode: 'vscode-command',
    trackActivity: true,
    requiresProject: true,
    cliArgs: ['rollback', 'module', '<slug>'],
    vscodeCommand: 'workspai.moduleRollback',
  },
  moduleUninstall: {
    id: 'moduleUninstall',
    label: 'Module Uninstall',
    scope: 'module',
    executionMode: 'vscode-command',
    trackActivity: true,
    requiresProject: true,
    cliArgs: ['uninstall', 'module', '<slug>'],
    vscodeCommand: 'workspai.moduleUninstall',
  },
  moduleUpgrade: {
    id: 'moduleUpgrade',
    label: 'Module Upgrade',
    scope: 'module',
    executionMode: 'vscode-command',
    trackActivity: true,
    requiresProject: true,
    cliArgs: ['upgrade', 'module', '<slug>'],
    vscodeCommand: 'workspai.moduleUpgrade',
  },
  moduleCheckpoint: {
    id: 'moduleCheckpoint',
    label: 'Module Checkpoint',
    scope: 'module',
    executionMode: 'vscode-command',
    trackActivity: true,
    requiresProject: true,
    cliArgs: ['checkpoint', 'module', '<slug>'],
    vscodeCommand: 'workspai.moduleCheckpoint',
  },
  importWorkspace: {
    id: 'importWorkspace',
    label: 'Import Workspace',
    scope: 'system',
    executionMode: 'vscode-command',
    trackActivity: true,
    vscodeCommand: 'workspai.importWorkspace',
  },
} as const satisfies Record<string, DashboardCommandContract>;

export type DashboardCommandId = keyof typeof DASHBOARD_COMMAND_CONTRACTS;

export function resolveDashboardCommandContract(
  command: string
): DashboardCommandContract | undefined {
  return DASHBOARD_COMMAND_CONTRACTS[command as DashboardCommandId];
}

export function getDashboardCommandActivity(command: string): {
  label: string;
  scope: DashboardCommandScope;
} {
  const contract = resolveDashboardCommandContract(command);
  if (contract) {
    return { label: contract.label, scope: contract.scope };
  }
  return {
    label: command.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
    scope: 'system',
  };
}

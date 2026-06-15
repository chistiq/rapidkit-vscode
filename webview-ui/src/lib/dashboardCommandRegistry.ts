export type DashboardCommandScope = 'workspace' | 'project' | 'module' | 'system';
export type DashboardEvidenceCardId =
  | 'doctor'
  | 'projectDoctor'
  | 'pipeline'
  | 'analyze'
  | 'readiness'
  | 'bootstrap'
  | 'workspaceSync'
  | 'foundation'
  | 'contract'
  | 'autopilot'
  | 'snapshot'
  | 'share'
  | 'archive'
  | 'mirror'
  | 'cache'
  | 'policy'
  | 'infra';

export type DashboardCommandHandler = 'webview-local' | 'extension-host';

export type DashboardCommandMeta = {
  id: string;
  label: string;
  scope: DashboardCommandScope;
  handler: DashboardCommandHandler;
  trackActivity: boolean;
  affectedEvidenceCardIds?: DashboardEvidenceCardId[];
  refreshEvidence?: boolean;
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
  importWorkspace: {
    id: 'importWorkspace',
    label: 'Import Workspace',
    scope: 'system',
    handler: 'extension-host',
    trackActivity: true,
  },
  importProject: {
    id: 'importProject',
    label: 'Import Project',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
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
    affectedEvidenceCardIds: ['doctor'],
    refreshEvidence: true,
  },
  exportWorkspace: {
    id: 'exportWorkspace',
    label: 'Export Workspace',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['archive'],
    refreshEvidence: true,
  },
  workspaceBootstrap: {
    id: 'workspaceBootstrap',
    label: 'Workspace Bootstrap',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['bootstrap', 'doctor'],
    refreshEvidence: true,
  },
  workspaceSetup: {
    id: 'workspaceSetup',
    label: 'Setup',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['doctor'],
    refreshEvidence: true,
  },
  workspaceSync: {
    id: 'workspaceSync',
    label: 'Workspace Sync',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['workspaceSync', 'contract'],
    refreshEvidence: true,
  },
  workspaceFoundationEnsure: {
    id: 'workspaceFoundationEnsure',
    label: 'Foundation Ensure',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['foundation'],
    refreshEvidence: true,
  },
  workspaceContractInspect: {
    id: 'workspaceContractInspect',
    label: 'Contract Inspect',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['contract'],
    refreshEvidence: true,
  },
  workspaceContractVerify: {
    id: 'workspaceContractVerify',
    label: 'Contract Verify',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['contract'],
    refreshEvidence: true,
  },
  workspaceContractInit: {
    id: 'workspaceContractInit',
    label: 'Contract Init',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['contract'],
    refreshEvidence: true,
  },
  workspaceContractGraph: {
    id: 'workspaceContractGraph',
    label: 'Workspace Graph',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
  },
  workspaceRunTest: {
    id: 'workspaceRunTest',
    label: 'Workspace Test',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    refreshEvidence: true,
  },
  workspaceRunInit: {
    id: 'workspaceRunInit',
    label: 'Workspace Init',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    refreshEvidence: true,
  },
  workspaceRunBuild: {
    id: 'workspaceRunBuild',
    label: 'Workspace Build',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    refreshEvidence: true,
  },
  workspaceRunStart: {
    id: 'workspaceRunStart',
    label: 'Workspace Start',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    refreshEvidence: true,
  },
  workspaceTerminal: {
    id: 'workspaceTerminal',
    label: 'Workspace Terminal',
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
    affectedEvidenceCardIds: ['analyze'],
    refreshEvidence: true,
  },
  workspaceReadiness: {
    id: 'workspaceReadiness',
    label: 'Release Readiness',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['readiness'],
    refreshEvidence: true,
  },
  workspacePipeline: {
    id: 'workspacePipeline',
    label: 'Governance Pipeline',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['pipeline', 'doctor', 'analyze', 'readiness', 'autopilot'],
    refreshEvidence: true,
  },
  workspaceAutopilotRelease: {
    id: 'workspaceAutopilotRelease',
    label: 'Autopilot Release',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['autopilot', 'readiness'],
    refreshEvidence: true,
  },
  workspaceShare: {
    id: 'workspaceShare',
    label: 'Share Bundle',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['share'],
    refreshEvidence: true,
  },
  workspaceSnapshotCreate: {
    id: 'workspaceSnapshotCreate',
    label: 'Create Snapshot',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['snapshot'],
    refreshEvidence: true,
  },
  workspaceSnapshot: {
    id: 'workspaceSnapshot',
    label: 'Snapshot Tools',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['snapshot'],
    refreshEvidence: true,
  },
  workspaceSnapshotList: {
    id: 'workspaceSnapshotList',
    label: 'List Snapshots',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['snapshot'],
    refreshEvidence: true,
  },
  workspaceSnapshotInspect: {
    id: 'workspaceSnapshotInspect',
    label: 'Inspect Snapshot',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['snapshot'],
    refreshEvidence: true,
  },
  workspaceSnapshotRestore: {
    id: 'workspaceSnapshotRestore',
    label: 'Restore Snapshot',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['snapshot'],
    refreshEvidence: true,
  },
  workspacePolicyShow: {
    id: 'workspacePolicyShow',
    label: 'Policy Review',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['policy'],
    refreshEvidence: true,
  },
  mirrorSync: {
    id: 'mirrorSync',
    label: 'Mirror Sync',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['mirror'],
    refreshEvidence: true,
  },
  mirrorStatus: {
    id: 'mirrorStatus',
    label: 'Mirror Status',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['mirror'],
    refreshEvidence: true,
  },
  cacheStatus: {
    id: 'cacheStatus',
    label: 'Cache Status',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['cache'],
    refreshEvidence: true,
  },
  workspaceInfra: {
    id: 'workspaceInfra',
    label: 'Infra Plan',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['infra'],
    refreshEvidence: true,
  },
  workspaceArchive: {
    id: 'workspaceArchive',
    label: 'Archive Tools',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['archive'],
    refreshEvidence: true,
  },
  workspaceArchiveVerify: {
    id: 'workspaceArchiveVerify',
    label: 'Verify Archive',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['archive'],
    refreshEvidence: true,
  },
  workspaceArchiveInspect: {
    id: 'workspaceArchiveInspect',
    label: 'Inspect Archive',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['archive'],
    refreshEvidence: true,
  },
  workspaceArchiveDoctor: {
    id: 'workspaceArchiveDoctor',
    label: 'Doctor Archive',
    scope: 'workspace',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['archive'],
    refreshEvidence: true,
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
    refreshEvidence: true,
  },
  projectDoctor: {
    id: 'projectDoctor',
    label: 'Project Doctor',
    scope: 'project',
    handler: 'extension-host',
    trackActivity: true,
    affectedEvidenceCardIds: ['projectDoctor'],
    refreshEvidence: true,
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
  moduleCheckpoint: {
    id: 'moduleCheckpoint',
    label: 'Module Checkpoint',
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

export function getDashboardCommandAffectedEvidenceCards(
  command: string
): DashboardEvidenceCardId[] {
  return getDashboardCommandMeta(command)?.affectedEvidenceCardIds ?? [];
}

export function shouldRefreshDashboardEvidenceAfterCommand(command: string): boolean {
  return getDashboardCommandMeta(command)?.refreshEvidence === true;
}

import { DASHBOARD_COMMAND_SURFACE, type DashboardCommandId } from './dashboardCommandSurface';

export type DashboardCommandExecutionChannel = 'terminal' | 'background';

type DashboardCommand = DashboardCommandId;

function isDashboardCommand(command: string): command is DashboardCommand {
  return Object.prototype.hasOwnProperty.call(DASHBOARD_COMMAND_SURFACE, command);
}

/**
 * Commands that run via progress UI / evidence output — never the integrated terminal.
 * Mirrors handlers in workspaceIntelligence.ts, governanceGate.ts, and related modules.
 */
export const DASHBOARD_BACKGROUND_COMMANDS = new Set<DashboardCommand>([
  'importProject',
  'adoptProject',
  'exportWorkspace',
  'workspacePipeline',
  'workspaceModel',
  'workspaceEvaluationReport',
  'workspaceEvaluationStatus',
  'workspaceGraphSearch',
  'workspaceGraphExportJsonLd',
  'workspaceGraphExportGraphMl',
  'workspaceGraphExportGexf',
  'workspaceIntelligenceSnapshot',
  'workspaceDiff',
  'workspaceImpact',
  'workspaceContextAgent',
  'workspaceAgentSync',
  'workspaceVerify',
  'workspaceExplain',
  'workspaceWhy',
  'workspaceTrace',
  'workspaceRemediationPlan',
  'workspaceIntelligenceChain',
  'workspaceImpactLens',
  'workspaceImpactLensCli',
  'workspaceArchive',
  'workspaceArchiveVerify',
  'workspaceArchiveInspect',
  'workspaceArchiveDoctor',
]);

/** Rapidkit CLI commands that normally open an integrated terminal (unless evidence direct-run). */
export const DASHBOARD_TERMINAL_RAPIDKIT_COMMANDS = new Set<DashboardCommand>([
  'workspaceBootstrap',
  'workspaceSetup',
  'workspaceSync',
  'workspaceFoundationEnsure',
  'workspaceContractInspect',
  'workspaceContractVerify',
  'workspaceContractInit',
  'workspaceContractGraph',
  'workspaceRunTest',
  'workspaceRunInit',
  'workspaceRunBuild',
  'workspaceRunStart',
  'workspaceRunStage',
  'workspaceInit',
  'workspaceWatch',
  'workspaceMcp',
  'workspaceAnalyze',
  'workspaceReadiness',
  'workspaceAutopilotRelease',
  'workspaceSnapshot',
  'workspaceSnapshotCreate',
  'workspaceSnapshotList',
  'workspaceSnapshotInspect',
  'workspaceSnapshotRestore',
  'workspacePolicyShow',
  'workspacePolicySet',
  'cacheClear',
  'cachePrune',
  'cacheRepair',
  'mirrorSync',
  'mirrorStatus',
  'mirrorVerify',
  'mirrorRotate',
  'cacheStatus',
  'workspaceInfra',
  'infraPlan',
  'infraUp',
  'infraDown',
  'infraStatus',
  'projectInit',
  'projectDev',
  'projectTest',
  'projectDoctor',
  'projectBuild',
  'projectLint',
  'projectFormat',
  'moduleDiff',
  'moduleRollback',
  'moduleUninstall',
  'moduleUpgrade',
  'moduleCheckpoint',
]);

export const DASHBOARD_TERMINAL_SHELL_COMMANDS = new Set<DashboardCommand>([
  'workspaceTerminal',
  'projectTerminal',
  'projectStop',
]);

/** VS Code handlers that still dispatch CLI into a terminal (not silent background). */
export const DASHBOARD_TERMINAL_VSCODE_COMMANDS = new Set<DashboardCommand>([
  'checkWorkspaceHealth',
  'workspaceShare',
  'mirrorOps',
  'workspaceContractOpen',
  'infraOpenCompose',
]);

export function resolveDashboardCommandExecutionChannel(
  command: string,
  commandData?: Record<string, unknown>
): DashboardCommandExecutionChannel | undefined {
  if (!isDashboardCommand(command)) {
    return undefined;
  }

  if (DASHBOARD_BACKGROUND_COMMANDS.has(command)) {
    return 'background';
  }

  if (
    commandData?.evidenceDirectRun === true &&
    DASHBOARD_TERMINAL_RAPIDKIT_COMMANDS.has(command)
  ) {
    return 'background';
  }

  if (
    DASHBOARD_TERMINAL_RAPIDKIT_COMMANDS.has(command) ||
    DASHBOARD_TERMINAL_SHELL_COMMANDS.has(command) ||
    DASHBOARD_TERMINAL_VSCODE_COMMANDS.has(command)
  ) {
    return 'terminal';
  }

  return undefined;
}

export function dashboardCommandExecutionChannelLabel(
  channel: DashboardCommandExecutionChannel
): string {
  return channel === 'terminal' ? 'Terminal' : 'Background';
}

import type { DashboardCommand } from '@/lib/dashboardCommandRegistry';
import type { DashboardEvidenceCardId } from '@/lib/dashboardCommandRegistry';

export type DashboardOperateZone =
  | 'quick'
  | 'build'
  | 'share'
  | 'intelligence'
  | 'governance'
  | 'cli';

export const DEFAULT_DASHBOARD_OPERATE_ZONE: DashboardOperateZone = 'quick';

export type DashboardOperateZoneDefinition = {
  id: DashboardOperateZone;
  label: string;
  description: string;
  anchorId: string;
};

export const DASHBOARD_OPERATE_ZONES: ReadonlyArray<DashboardOperateZoneDefinition> = [
  {
    id: 'quick',
    label: 'Quick',
    description: 'Doctor, pipeline, graph, test',
    anchorId: 'dashboard-operate-quick',
  },
  {
    id: 'build',
    label: 'Build',
    description: 'Scaffold, import, adopt',
    anchorId: 'dashboard-operate-build',
  },
  {
    id: 'share',
    label: 'Share',
    description: 'Archive, export, Studio',
    anchorId: 'dashboard-operate-share',
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    description: 'Model, snapshot, agent context',
    anchorId: 'dashboard-operate-intelligence',
  },
  {
    id: 'governance',
    label: 'Governance',
    description: 'Bootstrap, sync, mirror, policy',
    anchorId: 'dashboard-operate-governance',
  },
  {
    id: 'cli',
    label: 'CLI',
    description: 'Command reference',
    anchorId: 'dashboard-operate-cli',
  },
] as const;

export function scrollToDashboardOperateZone(zone: DashboardOperateZone): void {
  const definition = DASHBOARD_OPERATE_ZONES.find((entry) => entry.id === zone);
  if (!definition) {
    return;
  }
  const target = document.getElementById(definition.anchorId);
  if (!target) {
    return;
  }
  if (target instanceof HTMLDetailsElement) {
    target.open = true;
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Retry scroll until Run zone anchors exist (panel mount / accordion paint). */
export function scrollToDashboardOperateZoneWithRetry(
  zone: DashboardOperateZone,
  options?: { maxAttempts?: number; intervalMs?: number }
): void {
  const maxAttempts = options?.maxAttempts ?? 12;
  const intervalMs = options?.intervalMs ?? 50;
  const definition = DASHBOARD_OPERATE_ZONES.find((entry) => entry.id === zone);
  if (!definition) {
    return;
  }

  let attempt = 0;
  const tryScroll = () => {
    const target = document.getElementById(definition.anchorId);
    if (target) {
      scrollToDashboardOperateZone(zone);
      return;
    }
    attempt += 1;
    if (attempt < maxAttempts) {
      window.setTimeout(tryScroll, intervalMs);
    }
  };

  window.requestAnimationFrame(tryScroll);
}

const EVIDENCE_CARD_OPERATE_ZONES: Partial<Record<DashboardEvidenceCardId, DashboardOperateZone>> =
  {
    doctor: 'quick',
    pipeline: 'quick',
    analyze: 'quick',
    workspaceRun: 'quick',
    projectDoctor: 'quick',
    importReadiness: 'build',
    bootstrap: 'governance',
    setup: 'governance',
    workspaceSync: 'governance',
    foundation: 'governance',
    contract: 'governance',
    readiness: 'governance',
    mirror: 'governance',
    cache: 'governance',
    policy: 'governance',
    infra: 'governance',
    autopilot: 'governance',
    workspaceModel: 'intelligence',
    intelligenceSnapshot: 'intelligence',
    workspaceDiff: 'intelligence',
    workspaceImpact: 'intelligence',
    workspaceIntelligenceRun: 'intelligence',
    workspaceVerify: 'intelligence',
    workspaceExplain: 'intelligence',
    workspaceWhy: 'intelligence',
    workspaceTrace: 'intelligence',
    workspaceWatch: 'intelligence',
    workspaceMcp: 'intelligence',
    workspaceContextAgent: 'intelligence',
    agentGrounding: 'intelligence',
    share: 'share',
    archive: 'share',
    snapshot: 'share',
  };

const COMMAND_OPERATE_ZONES: Partial<Record<DashboardCommand, DashboardOperateZone>> = {
  checkWorkspaceHealth: 'quick',
  workspacePipeline: 'quick',
  workspaceAnalyze: 'quick',
  workspaceRunTest: 'quick',
  workspaceRunInit: 'quick',
  workspaceRunBuild: 'quick',
  workspaceRunStart: 'quick',
  workspaceContractGraph: 'quick',
  workspaceTerminal: 'quick',
  projectDoctor: 'quick',
  workspaceBootstrap: 'governance',
  workspaceSetup: 'governance',
  workspaceSync: 'governance',
  workspaceFoundationEnsure: 'governance',
  workspaceContractInspect: 'governance',
  workspaceContractVerify: 'governance',
  workspaceReadiness: 'governance',
  mirrorStatus: 'governance',
  mirrorOps: 'governance',
  mirrorSync: 'governance',
  cacheStatus: 'governance',
  workspacePolicyShow: 'governance',
  workspaceInfra: 'governance',
  workspaceAutopilotRelease: 'governance',
  workspaceModel: 'intelligence',
  workspaceIntelligenceSnapshot: 'intelligence',
  workspaceDiff: 'intelligence',
  workspaceImpact: 'intelligence',
  workspaceVerify: 'intelligence',
  workspaceExplain: 'intelligence',
  workspaceWhy: 'intelligence',
  workspaceTrace: 'intelligence',
  workspaceWatch: 'intelligence',
  workspaceMcp: 'intelligence',
  workspaceContextAgent: 'intelligence',
  workspaceAgentSync: 'intelligence',
  workspaceIntelligenceChain: 'intelligence',
  workspaceImpactLens: 'intelligence',
  workspaceImpactLensCli: 'intelligence',
  workspaceShare: 'share',
  exportWorkspace: 'share',
  workspaceArchive: 'share',
  workspaceSnapshotCreate: 'share',
  importProject: 'build',
  adoptProject: 'build',
  refreshModules: 'build',
};

export function resolveEvidenceCardOperateZone(
  cardId: DashboardEvidenceCardId
): DashboardOperateZone | undefined {
  return EVIDENCE_CARD_OPERATE_ZONES[cardId];
}

export function resolveCommandOperateZone(
  command: DashboardCommand
): DashboardOperateZone | undefined {
  return COMMAND_OPERATE_ZONES[command];
}

export function dashboardOperateZoneForOpsChainStep(
  step: 'bootstrap' | 'doctor' | 'analyze' | 'readiness'
): DashboardOperateZone | undefined {
  if (step === 'bootstrap') {
    return 'governance';
  }
  if (step === 'doctor') {
    return 'quick';
  }
  return undefined;
}

export function dashboardOperateZoneForIncidentTarget(
  target:
    | 'doctor'
    | 'analyze'
    | 'readiness'
    | 'release'
    | 'impact'
    | 'model'
    | 'pipeline'
    | undefined
): DashboardOperateZone | undefined {
  if (target === 'doctor') {
    return 'quick';
  }
  if (target === 'analyze') {
    return 'quick';
  }
  if (target === 'readiness' || target === 'pipeline') {
    return 'governance';
  }
  if (target === 'release') {
    return 'share';
  }
  if (target === 'impact' || target === 'model') {
    return 'intelligence';
  }
  return undefined;
}

/**
 * Workspace Usage Tracker
 * Tracks VS Code Extension interaction with workspaces
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { Logger } from './logger';
import {
  readWorkspaceMarker,
  updateWorkspaceMetadata,
  writeWorkspaceMarker,
} from './workspaceMarker';
import { getExtensionVersion } from './constants';
import { WorkspaceManager } from '../core/workspaceManager';
import { SIDEBAR_ACTION_SURFACE } from '../contracts/sidebarActionSurface';

export interface CommandTelemetrySummary {
  workspacePath: string;
  timeWindow: CommandTelemetryTimeWindow;
  windowStartAt: string | null;
  windowEndAt: string;
  totalEvents: number;
  lastCommand: string | null;
  lastCommandAt: string | null;
  lastCommandProps: Record<string, string | number | boolean>;
  commandUsage: Array<{ command: string; count: number }>;
  surfaceBreakdown: CommandTelemetrySurfaceBreakdown;
}

export interface CommandTelemetrySurfaceBreakdown {
  actionEvents: number;
  askEvents: number;
  actionVsAskShare: number | null;
  bySurface: Array<{
    surface: 'action' | 'chat' | 'aimodal' | 'onboarding' | 'other';
    count: number;
    share: number;
  }>;
}

export interface OnboardingExperimentVariantStats {
  variant: string;
  shown: number;
  clicked: number;
  dismissed: number;
  clickThroughRate: number;
}

export interface OnboardingExperimentStats {
  workspacePath: string;
  timeWindow: CommandTelemetryTimeWindow;
  windowStartAt: string | null;
  windowEndAt: string;
  primaryShown: number;
  primaryActionCounts: Array<{ action: string; count: number }>;
  followupShown: number;
  followupClicked: number;
  followupDismissed: number;
  overallFollowupClickThroughRate: number;
  variants: OnboardingExperimentVariantStats[];
}

export interface StudioCtaVariantStats {
  variant: string;
  loopStarted: number;
  nextActionClicked: number;
  actionExecuted: number;
  verifyPassed: number;
  verifyFailed: number;
  verifyCompletionRate: number | null;
  actionVsAskShare: number | null;
  loopCompleted: number;
  abandoned: number;
}

export interface StudioCtaVariantBreakdown {
  workspacePath: string;
  timeWindow: CommandTelemetryTimeWindow;
  windowStartAt: string | null;
  windowEndAt: string;
  variants: StudioCtaVariantStats[];
}

export interface StudioHardGateThresholds {
  verifyPhaseReachMin: number;
  bridgeRouteCompletionMin: number;
}

export interface StudioHardGateStatus {
  workspacePath: string;
  timeWindow: CommandTelemetryTimeWindow;
  windowStartAt: string | null;
  windowEndAt: string;
  thresholds: StudioHardGateThresholds;
  metrics: {
    loopStarted: number;
    nextActionClicked: number;
    actionExecuted: number;
    verifyOutcomes: number;
    verifyPhaseReach: number | null;
    bridgeRouteCompletionRate: number | null;
  };
  gates: {
    verifyPhaseReachPass: boolean;
    bridgeRouteCompletionPass: boolean;
    telemetryEvidencePass: boolean;
    overallPass: boolean;
  };
}

export interface StudioPredictionKpiThresholds {
  predictivePrecisionMin: number;
  falseAlarmRateMax: number;
  preventedIncidentRateMin: number;
}

export type StudioPredictionKpiAggregationKey =
  | 'prevented_incident_rate'
  | 'predictive_precision'
  | 'false_alarm_rate';

export interface StudioPredictionKpiAggregationMetric {
  key: StudioPredictionKpiAggregationKey;
  numerator: number;
  denominator: number;
  value: number | null;
  unit: 'percent';
  eventCommands: string[];
}

export interface StudioPredictionKpiStatus {
  workspacePath: string;
  timeWindow: CommandTelemetryTimeWindow;
  windowStartAt: string | null;
  windowEndAt: string;
  thresholds: StudioPredictionKpiThresholds;
  aggregation: Record<StudioPredictionKpiAggregationKey, StudioPredictionKpiAggregationMetric>;
  metrics: {
    predictionShown: number;
    predictionAccepted: number;
    predictionVerified: number;
    predictionFalsified: number;
    predictionIgnored: number;
    predictivePrecision: number | null;
    falseAlarmRate: number | null;
    preventedIncidentRate: number | null;
    acceptanceRate: number | null;
    verificationCoverage: number | null;
  };
  gates: {
    telemetryEvidencePass: boolean;
    predictivePrecisionPass: boolean;
    falseAlarmRatePass: boolean;
    preventedIncidentRatePass: boolean;
    overallPass: boolean;
  };
}

export interface StudioPredictionPortfolioKpiStatus {
  scope: 'explicit-workspaces' | 'registered-workspaces';
  workspacePaths: string[];
  evaluatedWorkspaceCount: number;
  telemetryWorkspaceCount: number;
  timeWindow: CommandTelemetryTimeWindow;
  windowStartAt: string | null;
  windowEndAt: string;
  thresholds: StudioPredictionKpiThresholds;
  aggregation: Record<StudioPredictionKpiAggregationKey, StudioPredictionKpiAggregationMetric>;
  metrics: StudioPredictionKpiStatus['metrics'] & {
    workspacePassCount: number;
    workspaceFailCount: number;
  };
  gates: StudioPredictionKpiStatus['gates'];
  workspaceStatuses: StudioPredictionKpiStatus[];
  privacy: {
    actorModel: 'workspace-marker-only';
    actorIdPresent: false;
  };
}

export interface RepeatRateActorStatus {
  actorKey: string;
  eventCount: number;
  activeHourCount: number;
  repeated: boolean;
  lastEventAt: string | null;
}

export interface RepeatRateActorModelStatus {
  scope: 'explicit-workspaces' | 'registered-workspaces';
  workspaceCount: number;
  timeWindow: CommandTelemetryTimeWindow;
  windowStartAt: string | null;
  windowEndAt: string;
  activeActorCount: number;
  repeatActorCount: number;
  repeatRate: number | null;
  actors: RepeatRateActorStatus[];
  privacy: {
    actorModel: 'pseudonymous-workspace-marker';
    rawUserIdPresent: false;
    rawWorkspacePathInActorKey: false;
  };
}

export interface ArchitectureReasoningKpiThresholds {
  architectureBreakagePreventedRateMin: number;
  architectureFalseAlarmRateMax: number;
}

export interface ArchitectureReasoningKpiStatus {
  workspacePath: string;
  timeWindow: CommandTelemetryTimeWindow;
  windowStartAt: string | null;
  windowEndAt: string;
  thresholds: ArchitectureReasoningKpiThresholds;
  metrics: {
    architectureWarningShown: number;
    architectureWarningAccepted: number;
    architectureBreakagePrevented: number;
    architectureWarningFalsified: number;
    architectureUnknownScopeBlocked: number;
    architectureBreakagePreventedRate: number | null;
    architectureFalseAlarmRate: number | null;
    architectureAcceptanceRate: number | null;
  };
  gates: {
    telemetryEvidencePass: boolean;
    architectureBreakagePreventedRatePass: boolean;
    architectureFalseAlarmRatePass: boolean;
    overallPass: boolean;
  };
}

export interface SandboxKpiThresholds {
  sandboxSimulationPassRateMin: number;
  unsafeApplyEscapeRateMax: number;
}

export interface SandboxKpiStatus {
  workspacePath: string;
  timeWindow: CommandTelemetryTimeWindow;
  windowStartAt: string | null;
  windowEndAt: string;
  thresholds: SandboxKpiThresholds;
  metrics: {
    sandboxSimulationStarted: number;
    sandboxSimulationPassed: number;
    sandboxSimulationFailed: number;
    unsafeApplyEscaped: number;
    sandboxSimulationPassRate: number | null;
    unsafeApplyEscapeRate: number | null;
  };
  gates: {
    telemetryEvidencePass: boolean;
    sandboxSimulationPassRatePass: boolean;
    unsafeApplyEscapeRatePass: boolean;
    overallPass: boolean;
  };
}

export interface StudioRollbackKpiThresholds {
  verifyAutoRollbackSuccessRateMin: number;
  falseConfidenceRateMax: number;
}

export interface StudioRollbackKpiStatus {
  workspacePath: string;
  timeWindow: CommandTelemetryTimeWindow;
  windowStartAt: string | null;
  windowEndAt: string;
  thresholds: StudioRollbackKpiThresholds;
  metrics: {
    verifyFailed: number;
    rollbackAttempted: number;
    rollbackSucceeded: number;
    verifyAutoRollbackSuccessRate: number | null;
    falseConfidenceRate: number | null;
  };
  gates: {
    telemetryEvidencePass: boolean;
    verifyAutoRollbackSuccessRatePass: boolean;
    falseConfidenceRatePass: boolean;
    overallPass: boolean;
  };
}

export interface StudioStabilizationKpiThresholds {
  routePrecisionMin: number;
  routeFallbackNonSuccessShareMax: number;
  verifyPathCompletionRateMin: number;
  verifyIncompleteWarningRateMax: number;
  topVerifyPathMissReasonShareMax: number;
  falseConfidenceRateMax: number;
  rollbackRecoverySuccessRateMin: number;
  repeatVerifiedResolutionRateMin: number;
}

export interface StudioStabilizationKpiStatus {
  workspacePath: string;
  timeWindow: CommandTelemetryTimeWindow;
  windowStartAt: string | null;
  windowEndAt: string;
  thresholds: StudioStabilizationKpiThresholds;
  metrics: {
    nextActionClicked: number;
    routeMatchedWithoutFallback: number;
    routeFallbackCount: number;
    routePrecision: number | null;
    routeFallbackNonSuccessShare: number | null;
    verifyRequired: number;
    verifyPathPresent: number;
    verifyPathCompletionRate: number | null;
    verifyIncompleteWarningCount: number;
    verifyIncompleteWarningRate: number | null;
    verifyFailed: number;
    rollbackAttempted: number;
    rollbackSucceeded: number;
    falseConfidenceRate: number | null;
    rollbackRecoverySuccessRate: number | null;
    repeatedIncidentDetected: number;
    repeatVerifiedResolved: number;
    repeatVerifiedResolutionRate: number | null;
    repeatVerifiedWithArtifactReady?: number;
    repeatVerifiedWithArtifactRate?: number | null;
    fallbackReasonBreakdown?: {
      success: number;
      bare_keyword_only: number;
      fix_preview_fallback: number;
      orchestrate_default: number;
      other: number;
    };
    verifyPathReasonTop?: Array<{
      reason: string;
      count: number;
    }>;
    topVerifyPathMissReasonShare?: number | null;
    recoveryClassBreakdown?: {
      auto_rollback: number;
      manual_recovery: number;
      unspecified: number;
    };
  };
  gates: {
    telemetryEvidencePass: boolean;
    routePrecisionPass: boolean;
    routeFallbackNonSuccessSharePass: boolean;
    verifyPathCompletionRatePass: boolean;
    verifyIncompleteWarningRatePass: boolean;
    falseConfidenceRatePass: boolean;
    rollbackRecoverySuccessRatePass: boolean;
    repeatVerifiedResolutionRatePass: boolean;
    topVerifyPathMissReasonSharePass: boolean;
    overallPass: boolean;
  };
}

export interface StudioReproPackKpiThresholds {
  reproPackShareRateMin: number;
  replayToResolutionRateMin: number;
}

export interface StudioReproPackKpiStatus {
  workspacePath: string;
  timeWindow: CommandTelemetryTimeWindow;
  windowStartAt: string | null;
  windowEndAt: string;
  thresholds: StudioReproPackKpiThresholds;
  metrics: {
    reproPackCaptured: number;
    reproPackExported: number;
    reproPackImported: number;
    incidentReplayReady: number;
    incidentReplayMemoryEnriched: number;
    reproPackShareRate: number | null;
    replayToResolutionRate: number | null;
  };
  gates: {
    telemetryEvidencePass: boolean;
    reproPackShareRatePass: boolean;
    replayToResolutionRatePass: boolean;
    overallPass: boolean;
  };
}

export interface ReleaseReadinessValidationKpiStatus {
  workspacePath: string;
  timeWindow: CommandTelemetryTimeWindow;
  windowStartAt: string | null;
  windowEndAt: string;
  metrics: {
    releaseReadinessArtifactsExported: number;
    goDecisionsExported: number;
    noGoDecisionsExported: number;
    decisionsValidated: number;
    decisionsCorrect: number;
    noGoDecisionsValidated: number;
    noGoPreventedIncident: number;
    releaseReadinessDecisionAccuracy: number | null;
    noGoPreventedIncidentRate: number | null;
  };
  gates: {
    telemetryEvidencePass: boolean;
    releaseReadinessDecisionAccuracyAvailable: boolean;
    noGoPreventedIncidentRateAvailable: boolean;
    overallPass: boolean;
  };
}

export interface EnterpriseStabilizationGateWindowResult {
  window: 'last7d' | 'last30d';
  windowStartAt: string | null;
  windowEndAt: string;
  /** S01: route precision gate */
  routePrecisionPass: boolean;
  /** S02: verify path completion gate */
  verifyPathCompletionPass: boolean;
  /** S03: false confidence rate gate */
  falseConfidencePass: boolean;
  /** S04: rollback recovery success gate */
  rollbackRecoveryPass: boolean;
  /** S05: repeat verified resolution gate */
  repeatVerifiedResolutionPass: boolean;
  /** Repro pack share rate gate */
  reproPackSharePass: boolean;
  /** Release readiness evidence available */
  releaseReadinessEvidencePass: boolean;
  /** Hard gate: verify phase reach + bridge route completion */
  hardGatePass: boolean;
  overallPass: boolean;
}

export interface EnterpriseStabilizationGateStatus {
  workspacePath: string;
  evaluatedAt: string;
  last7d: EnterpriseStabilizationGateWindowResult | null;
  last30d: EnterpriseStabilizationGateWindowResult | null;
  /**
   * Number of windows (0, 1, or 2) where overallPass is true.
   * Freeze rule: expansion is only allowed when consecutiveWindowsPass >= 2.
   */
  consecutiveWindowsPass: number;
  expansionFrozen: boolean;
  freezeReason: string | null;
}

export interface ClarificationGateKpiThresholds {
  clarificationRateVsAskMax: number;
}

export interface ClarificationGateKpiStatus {
  workspacePath: string;
  timeWindow: CommandTelemetryTimeWindow;
  windowStartAt: string | null;
  windowEndAt: string;
  thresholds: ClarificationGateKpiThresholds;
  metrics: {
    chatAskCount: number;
    aimodalAskCount: number;
    totalAskCount: number;
    chatClarificationGateCount: number;
    aimodalClarificationGateCount: number;
    clarificationGateCount: number;
    clarificationRateVsAsk: number | null;
  };
  gates: {
    telemetryEvidencePass: boolean;
    clarificationRateVsAskPass: boolean;
    overallPass: boolean;
  };
}

export interface PerformanceSloThresholds {
  firstChunkLatencyP95MaxMs: number;
  syncLatencyP95MaxMs: number;
  boardRenderLatencyP95MaxMs: number;
}

export interface PerformanceSloStatus {
  workspacePath: string;
  timeWindow: CommandTelemetryTimeWindow;
  windowStartAt: string | null;
  windowEndAt: string;
  thresholds: PerformanceSloThresholds;
  metrics: {
    firstChunkSampleCount: number;
    syncSampleCount: number;
    boardRenderSampleCount: number;
    firstChunkLatencyP95Ms: number | null;
    syncLatencyP95Ms: number | null;
    boardRenderLatencyP95Ms: number | null;
  };
  gates: {
    telemetryEvidencePass: boolean;
    firstChunkLatencyPass: boolean;
    syncLatencyPass: boolean;
    boardRenderLatencyPass: boolean;
    overallPass: boolean;
  };
}

export type CommandTelemetryTimeWindow = 'all' | 'last24h' | 'last7d' | 'last30d';

type TelemetrySurface = 'action' | 'chat' | 'aimodal' | 'onboarding' | 'other';

interface TelemetryCommandEvent {
  command: string;
  at: string;
  props?: Record<string, string | number | boolean>;
}

interface TelemetryHourlyUsageBucket {
  hour: string;
  usage: Record<string, number>;
}

interface OnboardingTelemetryAggregate {
  primaryShown: number;
  primaryActionUsage: Record<string, number>;
  followupShownByVariant: Record<string, number>;
  followupClickedByVariant: Record<string, number>;
  followupDismissedByVariant: Record<string, number>;
}

interface OnboardingTelemetryHourlyUsageBucket {
  hour: string;
  aggregate: OnboardingTelemetryAggregate;
}

interface TelemetrySurfaceAllowlistRule {
  surface: Exclude<TelemetrySurface, 'other'>;
  pattern: RegExp;
}

const MAX_RECENT_COMMAND_EVENTS = 500;
const MAX_HOURLY_USAGE_BUCKETS = 24 * 14;
const MAX_LATENCY_SAMPLES = 500;

interface LatencySampleEvent {
  event:
    | 'workspai.perf.first_chunk_latency'
    | 'workspai.perf.sync_latency'
    | 'workspai.perf.board_render_latency';
  ms: number;
  at: string;
}

const TELEMETRY_SURFACE_ORDER: TelemetrySurface[] = [
  'action',
  'chat',
  'aimodal',
  'onboarding',
  'other',
];

const TELEMETRY_SURFACE_ALLOWLIST: TelemetrySurfaceAllowlistRule[] = [
  {
    surface: 'action',
    pattern:
      /^workspai\.ai(Orchestrate|QuickActions|FixPreviewLite|ChangeImpactLite|TerminalBridge|WorkspaceMemoryWizard|RecipePacks|ForWorkspace|ForProject|ForModule|CreateProject)$/,
  },
  {
    surface: 'chat',
    pattern: /^workspai\.chat\.(ask|debug|clarification_gate)$/,
  },
  {
    surface: 'aimodal',
    pattern: /^workspai\.aimodal\.(ask|debug|clarification_gate)$/,
  },
  {
    surface: 'onboarding',
    pattern:
      /^workspai\.onboarding\.(primary\.shown|primary\.action|followup\.shown|followup\.action)$/,
  },
  {
    surface: 'action',
    pattern:
      /^workspai\.studio\.(loop_started|next_action_clicked|action_executed|verify_passed|verify_failed|verified_outcome_ready_for_artifact|outcome_memory_suggestion_ready|loop_completed|abandoned|prediction_shown|prediction_accepted|prediction_verified|prediction_falsified|rollback_attempted|rollback_succeeded|rollback_failed|incident_repro_pack_captured|incident_repro_pack_exported|incident_repro_pack_imported|incident_replay_ready|incident_replay_memory_enriched|repeated_incident_detected|verify_incomplete_warning|team_expansion_triggered)$/,
  },
  {
    surface: 'action',
    pattern:
      /^workspai\.studio\.(release_readiness_artifact_exported|release_readiness_go_decision_exported|release_readiness_no_go_decision_exported|release_readiness_decision_validated|release_readiness_decision_correct|release_readiness_no_go_decision_validated|release_readiness_no_go_prevented_incident)$/,
  },
  {
    surface: 'action',
    pattern:
      /^workspai\.studio\.(architecture_warning_shown|architecture_warning_accepted|architecture_breakage_prevented|architecture_warning_falsified|architecture_unknown_scope_blocked)$/,
  },
  {
    surface: 'action',
    pattern:
      /^workspai\.studio\.(sandbox_simulation_started|sandbox_simulation_passed|sandbox_simulation_failed|unsafe_apply_escaped)$/,
  },
];

export class WorkspaceUsageTracker {
  private static instance: WorkspaceUsageTracker;
  private logger: Logger;
  private trackedWorkspaces = new Set<string>();
  private commandTelemetryWriteQueue = new Map<string, Promise<void>>();
  private unknownTelemetrySurfaceCommands = new Set<string>();

  private constructor() {
    this.logger = Logger.getInstance();
  }

  static getInstance(): WorkspaceUsageTracker {
    if (!WorkspaceUsageTracker.instance) {
      WorkspaceUsageTracker.instance = new WorkspaceUsageTracker();
    }
    return WorkspaceUsageTracker.instance;
  }

  private sanitizeTelemetryProps(
    properties: Record<string, unknown> | undefined
  ): Record<string, string | number | boolean> {
    if (!properties) {
      return {};
    }

    const sanitized: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (value === null || value === undefined) {
        continue;
      }
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private resolveWorkspacePath(preferredWorkspacePath?: string): string | null {
    if (preferredWorkspacePath) {
      return preferredWorkspacePath;
    }

    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const folder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
      if (folder) {
        return folder.uri.fsPath;
      }
    }

    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
  }

  private parseRecentEvents(value: unknown): TelemetryCommandEvent[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const record = item as Record<string, unknown>;
        const command = typeof record.command === 'string' ? record.command : '';
        const at = typeof record.at === 'string' ? record.at : '';
        if (!command || !at || Number.isNaN(Date.parse(at))) {
          return null;
        }

        const propsRaw = record.props;
        const sanitizedProps =
          propsRaw && typeof propsRaw === 'object'
            ? this.sanitizeTelemetryProps(propsRaw as Record<string, unknown>)
            : undefined;

        return {
          command,
          at,
          ...(sanitizedProps && Object.keys(sanitizedProps).length > 0
            ? { props: sanitizedProps }
            : {}),
        } satisfies TelemetryCommandEvent;
      })
      .filter((entry): entry is TelemetryCommandEvent => entry !== null)
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }

  private normalizeProjectPathForTelemetry(value?: string): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim().replace(/\\/g, '/').toLowerCase();
    return normalized.length > 0 ? normalized : null;
  }

  private filterRecentEventsByProjectPath(
    events: TelemetryCommandEvent[],
    projectPathFilter?: string
  ): TelemetryCommandEvent[] {
    const normalizedProjectPath = this.normalizeProjectPathForTelemetry(projectPathFilter);
    if (!normalizedProjectPath) {
      return events;
    }

    return events.filter((entry) => {
      const rawProjectPath = entry.props?.projectPath;
      if (typeof rawProjectPath !== 'string') {
        return false;
      }
      const normalizedEventPath = this.normalizeProjectPathForTelemetry(rawProjectPath);
      return normalizedEventPath === normalizedProjectPath;
    });
  }

  private buildUsageFromRecentEvents(
    recentEvents: TelemetryCommandEvent[],
    windowStartMs: number | null
  ): Map<string, number> {
    const usageMap = new Map<string, number>();
    for (const event of recentEvents) {
      const eventMs = Date.parse(event.at);
      if (Number.isNaN(eventMs) || (windowStartMs !== null && eventMs < windowStartMs)) {
        continue;
      }
      usageMap.set(event.command, (usageMap.get(event.command) ?? 0) + 1);
    }
    return usageMap;
  }

  private getWindowStartMs(timeWindow: CommandTelemetryTimeWindow, nowMs: number): number | null {
    if (timeWindow === 'last24h') {
      return nowMs - 24 * 60 * 60 * 1000;
    }
    if (timeWindow === 'last7d') {
      return nowMs - 7 * 24 * 60 * 60 * 1000;
    }
    if (timeWindow === 'last30d') {
      return nowMs - 30 * 24 * 60 * 60 * 1000;
    }
    return null;
  }

  private toHourBucketIso(timeMs: number): string {
    const date = new Date(timeMs);
    date.setUTCMinutes(0, 0, 0);
    return date.toISOString();
  }

  private toActorKey(workspacePath: string): string {
    return crypto
      .createHash('sha256')
      .update(`workspai-workspace-actor:${workspacePath}`)
      .digest('hex')
      .slice(0, 16);
  }

  private parseHourlyUsage(value: unknown): TelemetryHourlyUsageBucket[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const record = item as Record<string, unknown>;
        const hour = typeof record.hour === 'string' ? record.hour : '';
        if (!hour || Number.isNaN(Date.parse(hour))) {
          return null;
        }

        const usageRaw = record.usage;
        if (!usageRaw || typeof usageRaw !== 'object') {
          return null;
        }

        const usageEntries = Object.entries(usageRaw as Record<string, unknown>)
          .map(([command, count]) => ({
            command,
            count: typeof count === 'number' && Number.isFinite(count) ? count : 0,
          }))
          .filter((entry) => entry.command.length > 0 && entry.count > 0);

        if (usageEntries.length === 0) {
          return null;
        }

        const usage: Record<string, number> = {};
        for (const entry of usageEntries) {
          usage[entry.command] = entry.count;
        }

        return { hour, usage } satisfies TelemetryHourlyUsageBucket;
      })
      .filter((entry): entry is TelemetryHourlyUsageBucket => entry !== null)
      .sort((a, b) => Date.parse(a.hour) - Date.parse(b.hour));
  }

  private toPositiveInteger(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return 0;
    }
    return Math.floor(value);
  }

  private sanitizeCountMap(value: unknown): Record<string, number> {
    if (!value || typeof value !== 'object') {
      return {};
    }

    const sanitized: Record<string, number> = {};
    for (const [rawKey, rawCount] of Object.entries(value as Record<string, unknown>)) {
      const key = rawKey.trim();
      const count = this.toPositiveInteger(rawCount);
      if (!key || count <= 0) {
        continue;
      }
      sanitized[key] = count;
    }

    return sanitized;
  }

  private createEmptyOnboardingTelemetryAggregate(): OnboardingTelemetryAggregate {
    return {
      primaryShown: 0,
      primaryActionUsage: {},
      followupShownByVariant: {},
      followupClickedByVariant: {},
      followupDismissedByVariant: {},
    };
  }

  private parseOnboardingTelemetryAggregate(value: unknown): OnboardingTelemetryAggregate {
    if (!value || typeof value !== 'object') {
      return this.createEmptyOnboardingTelemetryAggregate();
    }

    const record = value as Record<string, unknown>;
    return {
      primaryShown: this.toPositiveInteger(record.primaryShown),
      primaryActionUsage: this.sanitizeCountMap(record.primaryActionUsage),
      followupShownByVariant: this.sanitizeCountMap(record.followupShownByVariant),
      followupClickedByVariant: this.sanitizeCountMap(record.followupClickedByVariant),
      followupDismissedByVariant: this.sanitizeCountMap(record.followupDismissedByVariant),
    };
  }

  private hasOnboardingTelemetryData(aggregate: OnboardingTelemetryAggregate): boolean {
    return (
      aggregate.primaryShown > 0 ||
      Object.keys(aggregate.primaryActionUsage).length > 0 ||
      Object.keys(aggregate.followupShownByVariant).length > 0 ||
      Object.keys(aggregate.followupClickedByVariant).length > 0 ||
      Object.keys(aggregate.followupDismissedByVariant).length > 0
    );
  }

  private mergeCountMaps(
    base: Record<string, number>,
    delta: Record<string, number>
  ): Record<string, number> {
    const merged = { ...base };
    for (const [key, count] of Object.entries(delta)) {
      merged[key] = (merged[key] ?? 0) + count;
    }
    return merged;
  }

  private mergeOnboardingTelemetryAggregates(
    base: OnboardingTelemetryAggregate,
    delta: OnboardingTelemetryAggregate
  ): OnboardingTelemetryAggregate {
    return {
      primaryShown: base.primaryShown + delta.primaryShown,
      primaryActionUsage: this.mergeCountMaps(base.primaryActionUsage, delta.primaryActionUsage),
      followupShownByVariant: this.mergeCountMaps(
        base.followupShownByVariant,
        delta.followupShownByVariant
      ),
      followupClickedByVariant: this.mergeCountMaps(
        base.followupClickedByVariant,
        delta.followupClickedByVariant
      ),
      followupDismissedByVariant: this.mergeCountMaps(
        base.followupDismissedByVariant,
        delta.followupDismissedByVariant
      ),
    };
  }

  private parseOnboardingHourlyUsage(value: unknown): OnboardingTelemetryHourlyUsageBucket[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const record = item as Record<string, unknown>;
        const hour = typeof record.hour === 'string' ? record.hour : '';
        if (!hour || Number.isNaN(Date.parse(hour))) {
          return null;
        }

        const aggregate = this.parseOnboardingTelemetryAggregate(record.aggregate);
        if (!this.hasOnboardingTelemetryData(aggregate)) {
          return null;
        }

        return {
          hour,
          aggregate,
        } satisfies OnboardingTelemetryHourlyUsageBucket;
      })
      .filter((entry): entry is OnboardingTelemetryHourlyUsageBucket => entry !== null)
      .sort((a, b) => Date.parse(a.hour) - Date.parse(b.hour));
  }

  private extractOnboardingTelemetryDelta(
    command: string,
    props: Record<string, string | number | boolean>
  ): OnboardingTelemetryAggregate | null {
    const delta = this.createEmptyOnboardingTelemetryAggregate();

    if (command === 'workspai.onboarding.primary.shown') {
      delta.primaryShown = 1;
      return delta;
    }

    if (command === 'workspai.onboarding.primary.action') {
      const action =
        typeof props.action === 'string' && props.action.trim().length > 0
          ? props.action.trim()
          : 'unknown';
      delta.primaryActionUsage[action] = 1;
      return delta;
    }

    if (command === 'workspai.onboarding.followup.shown') {
      const variant =
        typeof props.variant === 'string' && props.variant.trim().length > 0
          ? props.variant.trim()
          : 'unknown';
      delta.followupShownByVariant[variant] = 1;
      return delta;
    }

    if (command === 'workspai.onboarding.followup.action') {
      const action =
        typeof props.action === 'string' && props.action.trim().length > 0
          ? props.action.trim()
          : 'unknown';
      const variant =
        typeof props.variant === 'string' && props.variant.trim().length > 0
          ? props.variant.trim()
          : 'unknown';

      if (action === 'open-ai-flows') {
        delta.followupClickedByVariant[variant] = 1;
      } else if (action === 'dismissed') {
        delta.followupDismissedByVariant[variant] = 1;
      }

      return this.hasOnboardingTelemetryData(delta) ? delta : null;
    }

    return null;
  }

  private mergeOnboardingHourlyUsage(
    existingBuckets: OnboardingTelemetryHourlyUsageBucket[],
    delta: OnboardingTelemetryAggregate,
    atIso: string
  ): OnboardingTelemetryHourlyUsageBucket[] {
    const hourIso = this.toHourBucketIso(Date.parse(atIso));
    const buckets = existingBuckets.map((bucket) => ({
      hour: bucket.hour,
      aggregate: this.parseOnboardingTelemetryAggregate(bucket.aggregate),
    }));

    const existingBucket = buckets.find((bucket) => bucket.hour === hourIso);
    if (existingBucket) {
      existingBucket.aggregate = this.mergeOnboardingTelemetryAggregates(
        existingBucket.aggregate,
        delta
      );
    } else {
      buckets.push({ hour: hourIso, aggregate: delta });
    }

    buckets.sort((a, b) => Date.parse(a.hour) - Date.parse(b.hour));
    return buckets.slice(-MAX_HOURLY_USAGE_BUCKETS);
  }

  private buildOnboardingAggregateFromHourlyBuckets(
    hourlyBuckets: OnboardingTelemetryHourlyUsageBucket[],
    windowStartMs: number,
    windowEndMs: number
  ): OnboardingTelemetryAggregate {
    let aggregate = this.createEmptyOnboardingTelemetryAggregate();

    for (const bucket of hourlyBuckets) {
      const hourMs = Date.parse(bucket.hour);
      if (Number.isNaN(hourMs) || hourMs < windowStartMs || hourMs > windowEndMs) {
        continue;
      }

      aggregate = this.mergeOnboardingTelemetryAggregates(aggregate, bucket.aggregate);
    }

    return aggregate;
  }

  private buildOnboardingAggregateFromEvents(
    events: TelemetryCommandEvent[]
  ): OnboardingTelemetryAggregate {
    let aggregate = this.createEmptyOnboardingTelemetryAggregate();

    for (const event of events) {
      const delta = this.extractOnboardingTelemetryDelta(event.command, event.props ?? {});
      if (!delta) {
        continue;
      }

      aggregate = this.mergeOnboardingTelemetryAggregates(aggregate, delta);
    }

    return aggregate;
  }

  private buildOnboardingVariantStats(
    aggregate: OnboardingTelemetryAggregate
  ): OnboardingExperimentVariantStats[] {
    const variantSet = new Set<string>([
      ...Object.keys(aggregate.followupShownByVariant),
      ...Object.keys(aggregate.followupClickedByVariant),
      ...Object.keys(aggregate.followupDismissedByVariant),
    ]);

    const preferredVariantOrder = new Map<string, number>([
      ['control', 0],
      ['compact', 1],
    ]);

    return [...variantSet]
      .map((variant) => {
        const shown = aggregate.followupShownByVariant[variant] ?? 0;
        const clicked = aggregate.followupClickedByVariant[variant] ?? 0;
        const dismissed = aggregate.followupDismissedByVariant[variant] ?? 0;
        return {
          variant,
          shown,
          clicked,
          dismissed,
          clickThroughRate: shown > 0 ? Number(((clicked / shown) * 100).toFixed(2)) : 0,
        };
      })
      .sort((a, b) => {
        const aOrder = preferredVariantOrder.get(a.variant) ?? 100;
        const bOrder = preferredVariantOrder.get(b.variant) ?? 100;
        if (aOrder !== bOrder) {
          return aOrder - bOrder;
        }
        return a.variant.localeCompare(b.variant);
      });
  }

  private mergeHourlyUsage(
    existingBuckets: TelemetryHourlyUsageBucket[],
    command: string,
    atIso: string
  ): TelemetryHourlyUsageBucket[] {
    const hourIso = this.toHourBucketIso(Date.parse(atIso));
    const buckets = existingBuckets.map((bucket) => ({
      hour: bucket.hour,
      usage: { ...bucket.usage },
    }));

    const existingBucket = buckets.find((bucket) => bucket.hour === hourIso);
    if (existingBucket) {
      existingBucket.usage[command] = (existingBucket.usage[command] ?? 0) + 1;
    } else {
      buckets.push({ hour: hourIso, usage: { [command]: 1 } });
    }

    buckets.sort((a, b) => Date.parse(a.hour) - Date.parse(b.hour));
    return buckets.slice(-MAX_HOURLY_USAGE_BUCKETS);
  }

  private buildUsageFromHourlyBuckets(
    hourlyBuckets: TelemetryHourlyUsageBucket[],
    windowStartMs: number,
    windowEndMs: number
  ): Map<string, number> {
    const usageMap = new Map<string, number>();

    for (const bucket of hourlyBuckets) {
      const hourMs = Date.parse(bucket.hour);
      if (Number.isNaN(hourMs) || hourMs < windowStartMs || hourMs > windowEndMs) {
        continue;
      }

      for (const [command, count] of Object.entries(bucket.usage)) {
        usageMap.set(command, (usageMap.get(command) ?? 0) + count);
      }
    }

    return usageMap;
  }

  private countEventsFromUsageMap(usageMap: Map<string, number>): number {
    let total = 0;
    for (const count of usageMap.values()) {
      total += count;
    }
    return total;
  }

  private getActiveHoursFromRecentEvents(
    recentEvents: TelemetryCommandEvent[],
    windowStartMs: number | null
  ): Set<string> {
    const activeHours = new Set<string>();
    for (const event of recentEvents) {
      const eventMs = Date.parse(event.at);
      if (Number.isNaN(eventMs) || (windowStartMs !== null && eventMs < windowStartMs)) {
        continue;
      }
      activeHours.add(this.toHourBucketIso(eventMs));
    }
    return activeHours;
  }

  private getActiveHoursFromHourlyUsage(
    hourlyUsage: TelemetryHourlyUsageBucket[],
    windowStartMs: number,
    windowEndMs: number
  ): Set<string> {
    const activeHours = new Set<string>();
    for (const bucket of hourlyUsage) {
      const hourMs = Date.parse(bucket.hour);
      if (Number.isNaN(hourMs) || hourMs < windowStartMs || hourMs > windowEndMs) {
        continue;
      }
      if (Object.values(bucket.usage).some((count) => count > 0)) {
        activeHours.add(bucket.hour);
      }
    }
    return activeHours;
  }

  private parseCommandUsage(value: unknown): Map<string, number> {
    const usageMap = new Map<string, number>();
    if (!value || typeof value !== 'object') {
      return usageMap;
    }

    for (const [command, count] of Object.entries(value as Record<string, unknown>)) {
      if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
        usageMap.set(command, count);
      }
    }

    return usageMap;
  }

  private buildStudioUsageMap(input: {
    commandUsage: unknown;
    hourlyUsage: TelemetryHourlyUsageBucket[];
    recentEvents: TelemetryCommandEvent[];
    timeWindow: CommandTelemetryTimeWindow;
    windowStartMs: number | null;
    windowEndMs: number;
    preferredCommands?: string[];
  }): Map<string, number> {
    if (input.timeWindow === 'all') {
      const commandUsageMap = this.parseCommandUsage(input.commandUsage);
      const preferredCommands = input.preferredCommands ?? [];
      const hasPreferredUsage = preferredCommands.some((command) => commandUsageMap.has(command));
      if (hasPreferredUsage) {
        return commandUsageMap;
      }
    }

    if (input.windowStartMs !== null && input.hourlyUsage.length > 0) {
      return this.buildUsageFromHourlyBuckets(
        input.hourlyUsage,
        input.windowStartMs,
        input.windowEndMs
      );
    }

    const usageMap = new Map<string, number>();
    for (const event of input.recentEvents) {
      if (input.windowStartMs !== null && Date.parse(event.at) < input.windowStartMs) {
        continue;
      }
      usageMap.set(event.command, (usageMap.get(event.command) ?? 0) + 1);
    }

    return usageMap;
  }

  private percent(numerator: number, denominator: number): number | null {
    return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(2)) : null;
  }

  private buildPredictionKpiAggregation(input: {
    predictionShown: number;
    predictionVerified: number;
    predictionFalsified: number;
  }): Record<StudioPredictionKpiAggregationKey, StudioPredictionKpiAggregationMetric> {
    const predictionOutcomes = input.predictionVerified + input.predictionFalsified;

    return {
      prevented_incident_rate: {
        key: 'prevented_incident_rate',
        numerator: input.predictionVerified,
        denominator: input.predictionShown,
        value: this.percent(input.predictionVerified, input.predictionShown),
        unit: 'percent',
        eventCommands: ['workspai.studio.prediction_verified', 'workspai.studio.prediction_shown'],
      },
      predictive_precision: {
        key: 'predictive_precision',
        numerator: input.predictionVerified,
        denominator: predictionOutcomes,
        value: this.percent(input.predictionVerified, predictionOutcomes),
        unit: 'percent',
        eventCommands: [
          'workspai.studio.prediction_verified',
          'workspai.studio.prediction_falsified',
        ],
      },
      false_alarm_rate: {
        key: 'false_alarm_rate',
        numerator: input.predictionFalsified,
        denominator: predictionOutcomes,
        value: this.percent(input.predictionFalsified, predictionOutcomes),
        unit: 'percent',
        eventCommands: [
          'workspai.studio.prediction_falsified',
          'workspai.studio.prediction_verified',
        ],
      },
    };
  }

  private resolvePredictionKpiThresholds(
    thresholds: Partial<StudioPredictionKpiThresholds> = {}
  ): StudioPredictionKpiThresholds {
    return {
      predictivePrecisionMin:
        typeof thresholds.predictivePrecisionMin === 'number'
          ? thresholds.predictivePrecisionMin
          : 65,
      falseAlarmRateMax:
        typeof thresholds.falseAlarmRateMax === 'number' ? thresholds.falseAlarmRateMax : 35,
      preventedIncidentRateMin:
        typeof thresholds.preventedIncidentRateMin === 'number'
          ? thresholds.preventedIncidentRateMin
          : 20,
    };
  }

  private resolveArchitectureReasoningKpiThresholds(
    thresholds: Partial<ArchitectureReasoningKpiThresholds> = {}
  ): ArchitectureReasoningKpiThresholds {
    return {
      architectureBreakagePreventedRateMin:
        typeof thresholds.architectureBreakagePreventedRateMin === 'number'
          ? thresholds.architectureBreakagePreventedRateMin
          : 20,
      architectureFalseAlarmRateMax:
        typeof thresholds.architectureFalseAlarmRateMax === 'number'
          ? thresholds.architectureFalseAlarmRateMax
          : 35,
    };
  }

  private resolveSandboxKpiThresholds(
    thresholds: Partial<SandboxKpiThresholds> = {}
  ): SandboxKpiThresholds {
    return {
      sandboxSimulationPassRateMin:
        typeof thresholds.sandboxSimulationPassRateMin === 'number'
          ? thresholds.sandboxSimulationPassRateMin
          : 70,
      unsafeApplyEscapeRateMax:
        typeof thresholds.unsafeApplyEscapeRateMax === 'number'
          ? thresholds.unsafeApplyEscapeRateMax
          : 5,
    };
  }

  private async enqueueCommandTelemetryWrite(
    workspacePath: string,
    writeTask: () => Promise<void>
  ): Promise<void> {
    const previous = this.commandTelemetryWriteQueue.get(workspacePath) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(writeTask);
    this.commandTelemetryWriteQueue.set(workspacePath, next);

    try {
      await next;
    } finally {
      if (this.commandTelemetryWriteQueue.get(workspacePath) === next) {
        this.commandTelemetryWriteQueue.delete(workspacePath);
      }
    }
  }

  private getTelemetrySurface(command: string): TelemetrySurface {
    if (this.isTrackedSidebarTelemetryCommand(command)) {
      return 'action';
    }

    for (const rule of TELEMETRY_SURFACE_ALLOWLIST) {
      if (rule.pattern.test(command)) {
        return rule.surface;
      }
    }

    // Controlled fallback for known families while action stays strict allowlist-based.
    if (command.startsWith('workspai.chat.')) {
      return 'chat';
    }
    if (command.startsWith('workspai.aimodal.')) {
      return 'aimodal';
    }
    if (command.startsWith('workspai.onboarding.')) {
      return 'onboarding';
    }

    if (command.startsWith('workspai.ai') && !this.unknownTelemetrySurfaceCommands.has(command)) {
      this.unknownTelemetrySurfaceCommands.add(command);
      this.logger.debug(`Unclassified AI telemetry command treated as other surface: ${command}`);
    }

    return 'other';
  }

  private isTrackedSidebarTelemetryCommand(command: string): boolean {
    const prefix = 'workspai.sidebar.';
    if (!command.startsWith(prefix)) {
      return false;
    }

    const actionId = command.slice(prefix.length);
    const action = (
      SIDEBAR_ACTION_SURFACE as Record<string, { trackActivity?: boolean } | undefined>
    )[actionId];
    return action?.trackActivity === true;
  }

  private buildSurfaceBreakdown(
    commandUsage: Array<{ command: string; count: number }>,
    totalEvents: number
  ): CommandTelemetrySurfaceBreakdown {
    const countsBySurface = new Map<TelemetrySurface, number>();

    for (const surface of TELEMETRY_SURFACE_ORDER) {
      countsBySurface.set(surface, 0);
    }

    for (const entry of commandUsage) {
      const surface = this.getTelemetrySurface(entry.command);
      countsBySurface.set(surface, (countsBySurface.get(surface) ?? 0) + entry.count);
    }

    const actionEvents = countsBySurface.get('action') ?? 0;
    const askEvents = (countsBySurface.get('chat') ?? 0) + (countsBySurface.get('aimodal') ?? 0);
    const actionVsAskBase = actionEvents + askEvents;

    const bySurface = TELEMETRY_SURFACE_ORDER.map((surface) => {
      const count = countsBySurface.get(surface) ?? 0;
      return {
        surface,
        count,
        share: totalEvents > 0 ? Number(((count / totalEvents) * 100).toFixed(2)) : 0,
      };
    });

    return {
      actionEvents,
      askEvents,
      actionVsAskShare:
        actionVsAskBase > 0 ? Number(((actionEvents / actionVsAskBase) * 100).toFixed(2)) : null,
      bySurface,
    };
  }

  /**
   * Lightweight command telemetry persisted in workspace marker metadata.
   * This is local usage telemetry used for feature adoption insight.
   */
  async trackCommandEvent(
    command: string,
    preferredWorkspacePath?: string,
    properties?: Record<string, unknown>
  ): Promise<void> {
    const workspacePath = this.resolveWorkspacePath(preferredWorkspacePath);
    if (!workspacePath) {
      return;
    }

    try {
      await this.enqueueCommandTelemetryWrite(workspacePath, async () => {
        const marker = await readWorkspaceMarker(workspacePath);
        if (!marker) {
          return;
        }

        const custom = marker.metadata?.custom ?? {};
        const existingTelemetryRaw = custom.workspaiTelemetry;
        const existingTelemetry =
          existingTelemetryRaw && typeof existingTelemetryRaw === 'object'
            ? (existingTelemetryRaw as Record<string, unknown>)
            : {};

        const usageRaw = existingTelemetry.commandUsage;
        const usage =
          usageRaw && typeof usageRaw === 'object'
            ? { ...(usageRaw as Record<string, unknown>) }
            : {};

        const currentCount = typeof usage[command] === 'number' ? (usage[command] as number) : 0;
        usage[command] = currentCount + 1;

        const recentEvents = this.parseRecentEvents(existingTelemetry.recentEvents);
        const hourlyUsage = this.parseHourlyUsage(existingTelemetry.hourlyUsage);
        const onboardingAggregate = this.parseOnboardingTelemetryAggregate(
          existingTelemetry.onboardingAggregate
        );
        const onboardingHourlyUsage = this.parseOnboardingHourlyUsage(
          existingTelemetry.onboardingHourlyUsage
        );
        const sanitizedProps = this.sanitizeTelemetryProps(properties);
        const onboardingDelta = this.extractOnboardingTelemetryDelta(command, sanitizedProps);

        const now = new Date().toISOString();
        const nextEvent: TelemetryCommandEvent = {
          command,
          at: now,
          ...(Object.keys(sanitizedProps).length > 0 ? { props: sanitizedProps } : {}),
        };
        const nextRecentEvents = [...recentEvents, nextEvent].slice(-MAX_RECENT_COMMAND_EVENTS);
        const nextHourlyUsage = this.mergeHourlyUsage(hourlyUsage, command, now);
        const nextOnboardingAggregate = onboardingDelta
          ? this.mergeOnboardingTelemetryAggregates(onboardingAggregate, onboardingDelta)
          : onboardingAggregate;
        const nextOnboardingHourlyUsage = onboardingDelta
          ? this.mergeOnboardingHourlyUsage(onboardingHourlyUsage, onboardingDelta, now)
          : onboardingHourlyUsage;

        const nextTelemetry: Record<string, unknown> = {
          ...existingTelemetry,
          commandUsage: usage,
          recentEvents: nextRecentEvents,
          hourlyUsage: nextHourlyUsage,
          ...(this.hasOnboardingTelemetryData(nextOnboardingAggregate)
            ? { onboardingAggregate: nextOnboardingAggregate }
            : {}),
          ...(nextOnboardingHourlyUsage.length > 0
            ? { onboardingHourlyUsage: nextOnboardingHourlyUsage }
            : {}),
          lastCommand: command,
          lastCommandAt: now,
          lastCommandProps: sanitizedProps,
        };

        await updateWorkspaceMetadata(workspacePath, {
          custom: {
            ...custom,
            workspaiTelemetry: nextTelemetry,
          },
        });

        this.logger.debug(
          `Tracked command event: ${command} (count: ${currentCount + 1}) in ${workspacePath}`
        );
      });
    } catch (error) {
      this.logger.debug(`Failed to track command event (${command}): ${error}`);
    }
  }

  /**
   * Returns local command telemetry summary for developer inspection.
   * Reads from workspace marker metadata.custom.workspaiTelemetry.
   */
  async getCommandTelemetrySummary(
    preferredWorkspacePath?: string,
    timeWindow: CommandTelemetryTimeWindow = 'all'
  ): Promise<CommandTelemetrySummary | null> {
    const workspacePath = this.resolveWorkspacePath(preferredWorkspacePath);
    if (!workspacePath) {
      return null;
    }

    try {
      const marker = await readWorkspaceMarker(workspacePath);
      if (!marker) {
        return null;
      }

      const telemetryRaw = marker.metadata?.custom?.workspaiTelemetry;
      const telemetry =
        telemetryRaw && typeof telemetryRaw === 'object'
          ? (telemetryRaw as Record<string, unknown>)
          : {};

      const recentEvents = this.parseRecentEvents(telemetry.recentEvents);
      const hourlyUsage = this.parseHourlyUsage(telemetry.hourlyUsage);
      const nowMs = Date.now();
      const windowStartMs = this.getWindowStartMs(timeWindow, nowMs);

      const filteredRecentEvents =
        windowStartMs === null
          ? recentEvents
          : recentEvents.filter((entry) => Date.parse(entry.at) >= windowStartMs);

      const usageRaw = telemetry.commandUsage;
      const usageEntries =
        usageRaw && typeof usageRaw === 'object'
          ? Object.entries(usageRaw as Record<string, unknown>)
          : [];

      const allTimeUsage = usageEntries
        .map(([command, count]) => ({
          command,
          count: typeof count === 'number' && Number.isFinite(count) ? count : 0,
        }))
        .filter((entry) => entry.count > 0)
        .sort((a, b) => b.count - a.count || a.command.localeCompare(b.command));

      const filteredUsageMap = new Map<string, number>();
      if (windowStartMs !== null && hourlyUsage.length > 0) {
        const hourlyMap = this.buildUsageFromHourlyBuckets(hourlyUsage, windowStartMs, nowMs);
        for (const [command, count] of hourlyMap.entries()) {
          filteredUsageMap.set(command, count);
        }
      } else {
        for (const event of filteredRecentEvents) {
          const current = filteredUsageMap.get(event.command) ?? 0;
          filteredUsageMap.set(event.command, current + 1);
        }
      }

      const filteredUsage = [...filteredUsageMap.entries()]
        .map(([command, count]) => ({ command, count }))
        .sort((a, b) => b.count - a.count || a.command.localeCompare(b.command));

      const commandUsage = timeWindow === 'all' ? allTimeUsage : filteredUsage;
      const totalEvents = commandUsage.reduce((sum, entry) => sum + entry.count, 0);
      const surfaceBreakdown = this.buildSurfaceBreakdown(commandUsage, totalEvents);

      const lastEvent =
        timeWindow === 'all'
          ? recentEvents[recentEvents.length - 1]
          : filteredRecentEvents[filteredRecentEvents.length - 1];

      return {
        workspacePath,
        timeWindow,
        windowStartAt: windowStartMs === null ? null : new Date(windowStartMs).toISOString(),
        windowEndAt: new Date(nowMs).toISOString(),
        totalEvents,
        lastCommand: lastEvent?.command ?? null,
        lastCommandAt: lastEvent?.at ?? null,
        lastCommandProps: this.sanitizeTelemetryProps(
          telemetry.lastCommandProps as Record<string, unknown> | undefined
        ),
        commandUsage,
        surfaceBreakdown,
      };
    } catch (error) {
      this.logger.debug(`Failed to read command telemetry summary: ${error}`);
      return null;
    }
  }

  /**
   * Returns onboarding A/B experiment stats from aggregate/hourly telemetry with event fallback.
   */
  async getOnboardingExperimentStats(
    preferredWorkspacePath?: string,
    timeWindow: CommandTelemetryTimeWindow = 'all'
  ): Promise<OnboardingExperimentStats | null> {
    const workspacePath = this.resolveWorkspacePath(preferredWorkspacePath);
    if (!workspacePath) {
      return null;
    }

    try {
      const marker = await readWorkspaceMarker(workspacePath);
      if (!marker) {
        return null;
      }

      const telemetryRaw = marker.metadata?.custom?.workspaiTelemetry;
      const telemetry =
        telemetryRaw && typeof telemetryRaw === 'object'
          ? (telemetryRaw as Record<string, unknown>)
          : {};

      const recentEvents = this.parseRecentEvents(telemetry.recentEvents);
      const onboardingAggregate = this.parseOnboardingTelemetryAggregate(
        telemetry.onboardingAggregate
      );
      const onboardingHourlyUsage = this.parseOnboardingHourlyUsage(
        telemetry.onboardingHourlyUsage
      );
      const nowMs = Date.now();
      const windowStartMs = this.getWindowStartMs(timeWindow, nowMs);

      const filteredRecentEvents =
        windowStartMs === null
          ? recentEvents
          : recentEvents.filter((entry) => Date.parse(entry.at) >= windowStartMs);

      let selectedAggregate = this.createEmptyOnboardingTelemetryAggregate();
      if (timeWindow === 'all') {
        selectedAggregate = this.hasOnboardingTelemetryData(onboardingAggregate)
          ? onboardingAggregate
          : this.buildOnboardingAggregateFromEvents(recentEvents);
      } else if (windowStartMs !== null && onboardingHourlyUsage.length > 0) {
        selectedAggregate = this.buildOnboardingAggregateFromHourlyBuckets(
          onboardingHourlyUsage,
          windowStartMs,
          nowMs
        );

        // Fallback for old markers where buckets may not exist for this interval yet.
        if (
          !this.hasOnboardingTelemetryData(selectedAggregate) &&
          filteredRecentEvents.length > 0
        ) {
          selectedAggregate = this.buildOnboardingAggregateFromEvents(filteredRecentEvents);
        }
      } else {
        selectedAggregate = this.buildOnboardingAggregateFromEvents(filteredRecentEvents);
      }

      const variants = this.buildOnboardingVariantStats(selectedAggregate);

      const followupShown = variants.reduce((sum, item) => sum + item.shown, 0);
      const followupClicked = variants.reduce((sum, item) => sum + item.clicked, 0);
      const followupDismissed = variants.reduce((sum, item) => sum + item.dismissed, 0);

      const sortedPrimaryActions = Object.entries(selectedAggregate.primaryActionUsage)
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count || a.action.localeCompare(b.action));

      return {
        workspacePath,
        timeWindow,
        windowStartAt: windowStartMs === null ? null : new Date(windowStartMs).toISOString(),
        windowEndAt: new Date(nowMs).toISOString(),
        primaryShown: selectedAggregate.primaryShown,
        primaryActionCounts: sortedPrimaryActions,
        followupShown,
        followupClicked,
        followupDismissed,
        overallFollowupClickThroughRate:
          followupShown > 0 ? Number(((followupClicked / followupShown) * 100).toFixed(2)) : 0,
        variants,
      };
    } catch (error) {
      this.logger.debug(`Failed to read onboarding experiment stats: ${error}`);
      return null;
    }
  }

  /**
   * Returns Incident Studio KPI breakdown grouped by CTA experiment variant.
   * Uses event props.ctaVariant tracked on workspai.studio.* command events.
   */
  async getStudioCtaVariantBreakdown(
    preferredWorkspacePath?: string,
    timeWindow: CommandTelemetryTimeWindow = 'last7d',
    projectPathFilter?: string
  ): Promise<StudioCtaVariantBreakdown | null> {
    const workspacePath = this.resolveWorkspacePath(preferredWorkspacePath);
    if (!workspacePath) {
      return null;
    }

    try {
      const marker = await readWorkspaceMarker(workspacePath);
      if (!marker) {
        return null;
      }

      const telemetryRaw = marker.metadata?.custom?.workspaiTelemetry;
      const telemetry =
        telemetryRaw && typeof telemetryRaw === 'object'
          ? (telemetryRaw as Record<string, unknown>)
          : {};

      const recentEvents = this.parseRecentEvents(telemetry.recentEvents);
      const nowMs = Date.now();
      const windowStartMs = this.getWindowStartMs(timeWindow, nowMs);
      const filteredRecentEvents =
        windowStartMs === null
          ? recentEvents
          : recentEvents.filter((entry) => Date.parse(entry.at) >= windowStartMs);
      const scopedRecentEvents = this.filterRecentEventsByProjectPath(
        filteredRecentEvents,
        projectPathFilter
      );

      const studioEvents = scopedRecentEvents.filter((entry) =>
        entry.command.startsWith('workspai.studio.')
      );

      const aggregate = new Map<string, StudioCtaVariantStats>();
      const ensureVariant = (variant: string) => {
        const key = variant.trim() || 'unknown';
        const existing = aggregate.get(key);
        if (existing) {
          return existing;
        }
        const created: StudioCtaVariantStats = {
          variant: key,
          loopStarted: 0,
          nextActionClicked: 0,
          actionExecuted: 0,
          verifyPassed: 0,
          verifyFailed: 0,
          verifyCompletionRate: null,
          actionVsAskShare: null,
          loopCompleted: 0,
          abandoned: 0,
        };
        aggregate.set(key, created);
        return created;
      };

      for (const entry of studioEvents) {
        const variantProp = entry.props?.ctaVariant;
        const variant = typeof variantProp === 'string' ? variantProp : 'unknown';
        const bucket = ensureVariant(variant);

        if (entry.command === 'workspai.studio.loop_started') {
          bucket.loopStarted += 1;
        } else if (entry.command === 'workspai.studio.next_action_clicked') {
          bucket.nextActionClicked += 1;
        } else if (entry.command === 'workspai.studio.action_executed') {
          bucket.actionExecuted += 1;
        } else if (entry.command === 'workspai.studio.verify_passed') {
          bucket.verifyPassed += 1;
        } else if (entry.command === 'workspai.studio.verify_failed') {
          bucket.verifyFailed += 1;
        } else if (entry.command === 'workspai.studio.loop_completed') {
          bucket.loopCompleted += 1;
        } else if (entry.command === 'workspai.studio.abandoned') {
          bucket.abandoned += 1;
        }
      }

      const variants = [...aggregate.values()]
        .map((item) => {
          const verifyOutcomes = item.verifyPassed + item.verifyFailed;
          const actionAskBase = item.actionExecuted + item.nextActionClicked;
          return {
            ...item,
            verifyCompletionRate:
              item.actionExecuted > 0
                ? Number(((verifyOutcomes / item.actionExecuted) * 100).toFixed(2))
                : null,
            actionVsAskShare:
              actionAskBase > 0
                ? Number(((item.actionExecuted / actionAskBase) * 100).toFixed(2))
                : null,
          };
        })
        .sort((a, b) => {
          const order = new Map<string, number>([
            ['single', 0],
            ['multi', 1],
            ['unknown', 2],
          ]);
          const aOrder = order.get(a.variant) ?? 100;
          const bOrder = order.get(b.variant) ?? 100;
          if (aOrder !== bOrder) {
            return aOrder - bOrder;
          }
          return a.variant.localeCompare(b.variant);
        });

      return {
        workspacePath,
        timeWindow,
        windowStartAt: windowStartMs === null ? null : new Date(windowStartMs).toISOString(),
        windowEndAt: new Date(nowMs).toISOString(),
        variants,
      };
    } catch (error) {
      this.logger.debug(`Failed to read studio CTA variant breakdown: ${error}`);
      return null;
    }
  }

  async getStudioHardGateStatus(
    preferredWorkspacePath?: string,
    timeWindow: CommandTelemetryTimeWindow = 'last7d',
    thresholds: Partial<StudioHardGateThresholds> = {},
    projectPathFilter?: string
  ): Promise<StudioHardGateStatus | null> {
    const variantBreakdown = await this.getStudioCtaVariantBreakdown(
      preferredWorkspacePath,
      timeWindow,
      projectPathFilter
    );
    if (!variantBreakdown) {
      return null;
    }

    const resolvedThresholds: StudioHardGateThresholds = {
      verifyPhaseReachMin:
        typeof thresholds.verifyPhaseReachMin === 'number' ? thresholds.verifyPhaseReachMin : 80,
      bridgeRouteCompletionMin:
        typeof thresholds.bridgeRouteCompletionMin === 'number'
          ? thresholds.bridgeRouteCompletionMin
          : 95,
    };

    const metrics = variantBreakdown.variants.reduce(
      (acc, variant) => {
        acc.loopStarted += variant.loopStarted;
        acc.nextActionClicked += variant.nextActionClicked;
        acc.actionExecuted += variant.actionExecuted;
        acc.verifyOutcomes += variant.verifyPassed + variant.verifyFailed;
        return acc;
      },
      {
        loopStarted: 0,
        nextActionClicked: 0,
        actionExecuted: 0,
        verifyOutcomes: 0,
      }
    );

    const verifyPhaseReach =
      metrics.actionExecuted > 0
        ? Number(((metrics.verifyOutcomes / metrics.actionExecuted) * 100).toFixed(2))
        : null;

    const bridgeRouteCompletionRate =
      metrics.loopStarted > 0
        ? Number(((metrics.actionExecuted / metrics.loopStarted) * 100).toFixed(2))
        : null;

    const verifyPhaseReachPass =
      verifyPhaseReach !== null && verifyPhaseReach >= resolvedThresholds.verifyPhaseReachMin;
    const bridgeRouteCompletionPass =
      bridgeRouteCompletionRate !== null &&
      bridgeRouteCompletionRate >= resolvedThresholds.bridgeRouteCompletionMin;
    const telemetryEvidencePass = metrics.loopStarted > 0;

    return {
      workspacePath: variantBreakdown.workspacePath,
      timeWindow: variantBreakdown.timeWindow,
      windowStartAt: variantBreakdown.windowStartAt,
      windowEndAt: variantBreakdown.windowEndAt,
      thresholds: resolvedThresholds,
      metrics: {
        ...metrics,
        verifyPhaseReach,
        bridgeRouteCompletionRate,
      },
      gates: {
        verifyPhaseReachPass,
        bridgeRouteCompletionPass,
        telemetryEvidencePass,
        overallPass: verifyPhaseReachPass && bridgeRouteCompletionPass && telemetryEvidencePass,
      },
    };
  }

  async getStudioPredictionKpiStatus(
    preferredWorkspacePath?: string,
    timeWindow: CommandTelemetryTimeWindow = 'last7d',
    thresholds: Partial<StudioPredictionKpiThresholds> = {}
  ): Promise<StudioPredictionKpiStatus | null> {
    const workspacePath = this.resolveWorkspacePath(preferredWorkspacePath);
    if (!workspacePath) {
      return null;
    }

    try {
      const marker = await readWorkspaceMarker(workspacePath);
      if (!marker) {
        return null;
      }

      const telemetryRaw = marker.metadata?.custom?.workspaiTelemetry;
      const telemetry =
        telemetryRaw && typeof telemetryRaw === 'object'
          ? (telemetryRaw as Record<string, unknown>)
          : {};

      const recentEvents = this.parseRecentEvents(telemetry.recentEvents);
      const hourlyUsage = this.parseHourlyUsage(telemetry.hourlyUsage);
      const nowMs = Date.now();
      const windowStartMs = this.getWindowStartMs(timeWindow, nowMs);
      const predictionUsageMap = this.buildStudioUsageMap({
        commandUsage: telemetry.commandUsage,
        hourlyUsage,
        recentEvents,
        timeWindow,
        windowStartMs,
        windowEndMs: nowMs,
        preferredCommands: [
          'workspai.studio.prediction_shown',
          'workspai.studio.prediction_accepted',
          'workspai.studio.prediction_verified',
          'workspai.studio.prediction_falsified',
        ],
      });

      const predictionShown = predictionUsageMap.get('workspai.studio.prediction_shown') ?? 0;
      const predictionAccepted = predictionUsageMap.get('workspai.studio.prediction_accepted') ?? 0;
      const predictionVerified = predictionUsageMap.get('workspai.studio.prediction_verified') ?? 0;
      const predictionFalsified =
        predictionUsageMap.get('workspai.studio.prediction_falsified') ?? 0;

      const predictionIgnored = Math.max(0, predictionShown - predictionAccepted);
      const predictionOutcomes = predictionVerified + predictionFalsified;
      const aggregation = this.buildPredictionKpiAggregation({
        predictionShown,
        predictionVerified,
        predictionFalsified,
      });
      const predictivePrecision = aggregation.predictive_precision.value;
      const falseAlarmRate = aggregation.false_alarm_rate.value;
      const preventedIncidentRate = aggregation.prevented_incident_rate.value;
      const acceptanceRate =
        predictionShown > 0
          ? Number(((predictionAccepted / predictionShown) * 100).toFixed(2))
          : null;
      const verificationCoverage =
        predictionAccepted > 0
          ? Number(((predictionOutcomes / predictionAccepted) * 100).toFixed(2))
          : null;

      const resolvedThresholds = this.resolvePredictionKpiThresholds(thresholds);

      const telemetryEvidencePass = predictionShown > 0;
      const predictivePrecisionPass =
        predictivePrecision !== null &&
        predictivePrecision >= resolvedThresholds.predictivePrecisionMin;
      const falseAlarmRatePass =
        falseAlarmRate !== null && falseAlarmRate <= resolvedThresholds.falseAlarmRateMax;
      const preventedIncidentRatePass =
        preventedIncidentRate !== null &&
        preventedIncidentRate >= resolvedThresholds.preventedIncidentRateMin;

      return {
        workspacePath,
        timeWindow,
        windowStartAt: windowStartMs === null ? null : new Date(windowStartMs).toISOString(),
        windowEndAt: new Date(nowMs).toISOString(),
        thresholds: resolvedThresholds,
        aggregation,
        metrics: {
          predictionShown,
          predictionAccepted,
          predictionVerified,
          predictionFalsified,
          predictionIgnored,
          predictivePrecision,
          falseAlarmRate,
          preventedIncidentRate,
          acceptanceRate,
          verificationCoverage,
        },
        gates: {
          telemetryEvidencePass,
          predictivePrecisionPass,
          falseAlarmRatePass,
          preventedIncidentRatePass,
          overallPass:
            telemetryEvidencePass &&
            predictivePrecisionPass &&
            falseAlarmRatePass &&
            preventedIncidentRatePass,
        },
      };
    } catch (error) {
      this.logger.debug(`Failed to read studio prediction KPI status: ${error}`);
      return null;
    }
  }

  async getStudioPredictionPortfolioKpiStatus(
    workspacePaths?: string[],
    timeWindow: CommandTelemetryTimeWindow = 'last7d',
    thresholds: Partial<StudioPredictionKpiThresholds> = {}
  ): Promise<StudioPredictionPortfolioKpiStatus | null> {
    const explicitWorkspacePaths = (workspacePaths ?? [])
      .filter((workspacePath): workspacePath is string => typeof workspacePath === 'string')
      .map((workspacePath) => workspacePath.trim())
      .filter((workspacePath) => workspacePath.length > 0);

    const scope: StudioPredictionPortfolioKpiStatus['scope'] =
      explicitWorkspacePaths.length > 0 ? 'explicit-workspaces' : 'registered-workspaces';
    const resolvedWorkspacePaths =
      explicitWorkspacePaths.length > 0
        ? explicitWorkspacePaths
        : (await WorkspaceManager.getInstance().loadWorkspaces()).map(
            (workspace) => workspace.path
          );

    const workspacePathSet = new Set<string>();
    const uniqueWorkspacePaths = resolvedWorkspacePaths.filter((workspacePath) => {
      if (workspacePathSet.has(workspacePath)) {
        return false;
      }
      workspacePathSet.add(workspacePath);
      return true;
    });

    if (uniqueWorkspacePaths.length === 0) {
      return null;
    }

    const workspaceStatuses = (
      await Promise.all(
        uniqueWorkspacePaths.map((workspacePath) =>
          this.getStudioPredictionKpiStatus(workspacePath, timeWindow, thresholds)
        )
      )
    ).filter((status): status is StudioPredictionKpiStatus => status !== null);

    const nowMs = Date.now();
    const windowStartMs = this.getWindowStartMs(timeWindow, nowMs);
    const resolvedThresholds = this.resolvePredictionKpiThresholds(thresholds);

    const totals = workspaceStatuses.reduce(
      (acc, status) => {
        acc.predictionShown += status.metrics.predictionShown;
        acc.predictionAccepted += status.metrics.predictionAccepted;
        acc.predictionVerified += status.metrics.predictionVerified;
        acc.predictionFalsified += status.metrics.predictionFalsified;
        acc.workspacePassCount += status.gates.overallPass ? 1 : 0;
        return acc;
      },
      {
        predictionShown: 0,
        predictionAccepted: 0,
        predictionVerified: 0,
        predictionFalsified: 0,
        workspacePassCount: 0,
      }
    );

    const predictionIgnored = Math.max(0, totals.predictionShown - totals.predictionAccepted);
    const predictionOutcomes = totals.predictionVerified + totals.predictionFalsified;
    const aggregation = this.buildPredictionKpiAggregation({
      predictionShown: totals.predictionShown,
      predictionVerified: totals.predictionVerified,
      predictionFalsified: totals.predictionFalsified,
    });
    const predictivePrecision = aggregation.predictive_precision.value;
    const falseAlarmRate = aggregation.false_alarm_rate.value;
    const preventedIncidentRate = aggregation.prevented_incident_rate.value;
    const acceptanceRate = this.percent(totals.predictionAccepted, totals.predictionShown);
    const verificationCoverage = this.percent(predictionOutcomes, totals.predictionAccepted);

    const telemetryEvidencePass = totals.predictionShown > 0;
    const predictivePrecisionPass =
      predictivePrecision !== null &&
      predictivePrecision >= resolvedThresholds.predictivePrecisionMin;
    const falseAlarmRatePass =
      falseAlarmRate !== null && falseAlarmRate <= resolvedThresholds.falseAlarmRateMax;
    const preventedIncidentRatePass =
      preventedIncidentRate !== null &&
      preventedIncidentRate >= resolvedThresholds.preventedIncidentRateMin;

    return {
      scope,
      workspacePaths: uniqueWorkspacePaths,
      evaluatedWorkspaceCount: uniqueWorkspacePaths.length,
      telemetryWorkspaceCount: workspaceStatuses.filter(
        (status) => status.gates.telemetryEvidencePass
      ).length,
      timeWindow,
      windowStartAt: windowStartMs === null ? null : new Date(windowStartMs).toISOString(),
      windowEndAt: new Date(nowMs).toISOString(),
      thresholds: resolvedThresholds,
      aggregation,
      metrics: {
        predictionShown: totals.predictionShown,
        predictionAccepted: totals.predictionAccepted,
        predictionVerified: totals.predictionVerified,
        predictionFalsified: totals.predictionFalsified,
        predictionIgnored,
        predictivePrecision,
        falseAlarmRate,
        preventedIncidentRate,
        acceptanceRate,
        verificationCoverage,
        workspacePassCount: totals.workspacePassCount,
        workspaceFailCount: workspaceStatuses.length - totals.workspacePassCount,
      },
      gates: {
        telemetryEvidencePass,
        predictivePrecisionPass,
        falseAlarmRatePass,
        preventedIncidentRatePass,
        overallPass:
          telemetryEvidencePass &&
          predictivePrecisionPass &&
          falseAlarmRatePass &&
          preventedIncidentRatePass,
      },
      workspaceStatuses,
      privacy: {
        actorModel: 'workspace-marker-only',
        actorIdPresent: false,
      },
    };
  }

  async getRepeatRateActorModelStatus(
    workspacePaths?: string[],
    timeWindow: CommandTelemetryTimeWindow = 'last7d'
  ): Promise<RepeatRateActorModelStatus | null> {
    const explicitWorkspacePaths = (workspacePaths ?? [])
      .filter((workspacePath): workspacePath is string => typeof workspacePath === 'string')
      .map((workspacePath) => workspacePath.trim())
      .filter((workspacePath) => workspacePath.length > 0);

    const scope: RepeatRateActorModelStatus['scope'] =
      explicitWorkspacePaths.length > 0 ? 'explicit-workspaces' : 'registered-workspaces';
    const resolvedWorkspacePaths =
      explicitWorkspacePaths.length > 0
        ? explicitWorkspacePaths
        : (await WorkspaceManager.getInstance().loadWorkspaces()).map(
            (workspace) => workspace.path
          );

    const seenWorkspacePaths = new Set<string>();
    const uniqueWorkspacePaths = resolvedWorkspacePaths.filter((workspacePath) => {
      if (seenWorkspacePaths.has(workspacePath)) {
        return false;
      }
      seenWorkspacePaths.add(workspacePath);
      return true;
    });

    if (uniqueWorkspacePaths.length === 0) {
      return null;
    }

    const nowMs = Date.now();
    const windowStartMs = this.getWindowStartMs(timeWindow, nowMs);
    const actors: RepeatRateActorStatus[] = [];

    for (const workspacePath of uniqueWorkspacePaths) {
      const marker = await readWorkspaceMarker(workspacePath);
      if (!marker) {
        continue;
      }

      const telemetryRaw = marker.metadata?.custom?.workspaiTelemetry;
      const telemetry =
        telemetryRaw && typeof telemetryRaw === 'object'
          ? (telemetryRaw as Record<string, unknown>)
          : {};
      const recentEvents = this.parseRecentEvents(telemetry.recentEvents);
      const hourlyUsage = this.parseHourlyUsage(telemetry.hourlyUsage);
      const usageMap =
        timeWindow === 'all'
          ? this.parseCommandUsage(telemetry.commandUsage)
          : windowStartMs !== null && hourlyUsage.length > 0
            ? this.buildUsageFromHourlyBuckets(hourlyUsage, windowStartMs, nowMs)
            : this.buildStudioUsageMap({
                commandUsage: telemetry.commandUsage,
                hourlyUsage,
                recentEvents,
                timeWindow,
                windowStartMs,
                windowEndMs: nowMs,
                preferredCommands: [
                  'workspai.studio.prediction_shown',
                  'workspai.studio.prediction_accepted',
                  'workspai.studio.prediction_verified',
                  'workspai.studio.prediction_falsified',
                ],
              });
      const eventCount = this.countEventsFromUsageMap(usageMap);
      if (eventCount <= 0) {
        continue;
      }

      const activeHours =
        windowStartMs !== null && hourlyUsage.length > 0
          ? this.getActiveHoursFromHourlyUsage(hourlyUsage, windowStartMs, nowMs)
          : this.getActiveHoursFromRecentEvents(recentEvents, windowStartMs);
      const activeHourCount = activeHours.size;
      const filteredRecentEvents =
        timeWindow === 'all'
          ? recentEvents
          : recentEvents.filter((event) => Date.parse(event.at) >= (windowStartMs ?? 0));
      const lastRecentEvent = filteredRecentEvents[filteredRecentEvents.length - 1];

      actors.push({
        actorKey: this.toActorKey(workspacePath),
        eventCount,
        activeHourCount,
        repeated: timeWindow === 'all' ? eventCount >= 2 : activeHourCount >= 2,
        lastEventAt: lastRecentEvent?.at ?? null,
      });
    }

    const repeatActorCount = actors.filter((actor) => actor.repeated).length;
    const activeActorCount = actors.length;

    return {
      scope,
      workspaceCount: uniqueWorkspacePaths.length,
      timeWindow,
      windowStartAt: windowStartMs === null ? null : new Date(windowStartMs).toISOString(),
      windowEndAt: new Date(nowMs).toISOString(),
      activeActorCount,
      repeatActorCount,
      repeatRate: this.percent(repeatActorCount, activeActorCount),
      actors,
      privacy: {
        actorModel: 'pseudonymous-workspace-marker',
        rawUserIdPresent: false,
        rawWorkspacePathInActorKey: false,
      },
    };
  }

  async getArchitectureReasoningKpiStatus(
    preferredWorkspacePath?: string,
    timeWindow: CommandTelemetryTimeWindow = 'last7d',
    thresholds: Partial<ArchitectureReasoningKpiThresholds> = {}
  ): Promise<ArchitectureReasoningKpiStatus | null> {
    const workspacePath = this.resolveWorkspacePath(preferredWorkspacePath);
    if (!workspacePath) {
      return null;
    }

    try {
      const marker = await readWorkspaceMarker(workspacePath);
      if (!marker) {
        return null;
      }

      const telemetryRaw = marker.metadata?.custom?.workspaiTelemetry;
      const telemetry =
        telemetryRaw && typeof telemetryRaw === 'object'
          ? (telemetryRaw as Record<string, unknown>)
          : {};
      const recentEvents = this.parseRecentEvents(telemetry.recentEvents);
      const hourlyUsage = this.parseHourlyUsage(telemetry.hourlyUsage);
      const nowMs = Date.now();
      const windowStartMs = this.getWindowStartMs(timeWindow, nowMs);
      const usageMap =
        timeWindow === 'all'
          ? this.parseCommandUsage(telemetry.commandUsage)
          : windowStartMs !== null && hourlyUsage.length > 0
            ? this.buildUsageFromHourlyBuckets(hourlyUsage, windowStartMs, nowMs)
            : this.buildStudioUsageMap({
                commandUsage: telemetry.commandUsage,
                hourlyUsage,
                recentEvents,
                timeWindow,
                windowStartMs,
                windowEndMs: nowMs,
                preferredCommands: [
                  'workspai.studio.prediction_shown',
                  'workspai.studio.prediction_accepted',
                  'workspai.studio.prediction_verified',
                  'workspai.studio.prediction_falsified',
                ],
              });

      const architectureWarningShown =
        usageMap.get('workspai.studio.architecture_warning_shown') ?? 0;
      const architectureWarningAccepted =
        usageMap.get('workspai.studio.architecture_warning_accepted') ?? 0;
      const architectureBreakagePrevented =
        usageMap.get('workspai.studio.architecture_breakage_prevented') ?? 0;
      const architectureWarningFalsified =
        usageMap.get('workspai.studio.architecture_warning_falsified') ?? 0;
      const architectureUnknownScopeBlocked =
        usageMap.get('workspai.studio.architecture_unknown_scope_blocked') ?? 0;
      const architectureOutcomes = architectureBreakagePrevented + architectureWarningFalsified;
      const architectureBreakagePreventedRate = this.percent(
        architectureBreakagePrevented,
        architectureWarningShown
      );
      const architectureFalseAlarmRate = this.percent(
        architectureWarningFalsified,
        architectureOutcomes
      );
      const architectureAcceptanceRate = this.percent(
        architectureWarningAccepted,
        architectureWarningShown
      );
      const resolvedThresholds = this.resolveArchitectureReasoningKpiThresholds(thresholds);
      const telemetryEvidencePass = architectureWarningShown > 0;
      const architectureBreakagePreventedRatePass =
        architectureBreakagePreventedRate !== null &&
        architectureBreakagePreventedRate >=
          resolvedThresholds.architectureBreakagePreventedRateMin;
      const architectureFalseAlarmRatePass =
        architectureFalseAlarmRate !== null &&
        architectureFalseAlarmRate <= resolvedThresholds.architectureFalseAlarmRateMax;

      return {
        workspacePath,
        timeWindow,
        windowStartAt: windowStartMs === null ? null : new Date(windowStartMs).toISOString(),
        windowEndAt: new Date(nowMs).toISOString(),
        thresholds: resolvedThresholds,
        metrics: {
          architectureWarningShown,
          architectureWarningAccepted,
          architectureBreakagePrevented,
          architectureWarningFalsified,
          architectureUnknownScopeBlocked,
          architectureBreakagePreventedRate,
          architectureFalseAlarmRate,
          architectureAcceptanceRate,
        },
        gates: {
          telemetryEvidencePass,
          architectureBreakagePreventedRatePass,
          architectureFalseAlarmRatePass,
          overallPass:
            telemetryEvidencePass &&
            architectureBreakagePreventedRatePass &&
            architectureFalseAlarmRatePass,
        },
      };
    } catch (error) {
      this.logger.debug(`Failed to read architecture reasoning KPI status: ${error}`);
      return null;
    }
  }

  async getSandboxKpiStatus(
    preferredWorkspacePath?: string,
    timeWindow: CommandTelemetryTimeWindow = 'last7d',
    thresholds: Partial<SandboxKpiThresholds> = {}
  ): Promise<SandboxKpiStatus | null> {
    const workspacePath = this.resolveWorkspacePath(preferredWorkspacePath);
    if (!workspacePath) {
      return null;
    }

    try {
      const marker = await readWorkspaceMarker(workspacePath);
      if (!marker) {
        return null;
      }

      const telemetryRaw = marker.metadata?.custom?.workspaiTelemetry;
      const telemetry =
        telemetryRaw && typeof telemetryRaw === 'object'
          ? (telemetryRaw as Record<string, unknown>)
          : {};
      const recentEvents = this.parseRecentEvents(telemetry.recentEvents);
      const hourlyUsage = this.parseHourlyUsage(telemetry.hourlyUsage);
      const nowMs = Date.now();
      const windowStartMs = this.getWindowStartMs(timeWindow, nowMs);
      const usageMap =
        timeWindow === 'all'
          ? this.parseCommandUsage(telemetry.commandUsage)
          : windowStartMs !== null && hourlyUsage.length > 0
            ? this.buildUsageFromHourlyBuckets(hourlyUsage, windowStartMs, nowMs)
            : this.buildStudioUsageMap({
                commandUsage: telemetry.commandUsage,
                hourlyUsage,
                recentEvents,
                timeWindow,
                windowStartMs,
                windowEndMs: nowMs,
                preferredCommands: [
                  'workspai.studio.prediction_shown',
                  'workspai.studio.prediction_accepted',
                  'workspai.studio.prediction_verified',
                  'workspai.studio.prediction_falsified',
                ],
              });

      const sandboxSimulationStarted =
        usageMap.get('workspai.studio.sandbox_simulation_started') ?? 0;
      const sandboxSimulationPassed =
        usageMap.get('workspai.studio.sandbox_simulation_passed') ?? 0;
      const sandboxSimulationFailed =
        usageMap.get('workspai.studio.sandbox_simulation_failed') ?? 0;
      const unsafeApplyEscaped = usageMap.get('workspai.studio.unsafe_apply_escaped') ?? 0;
      const sandboxSimulationOutcomes = sandboxSimulationPassed + sandboxSimulationFailed;
      const sandboxSimulationPassRate = this.percent(
        sandboxSimulationPassed,
        sandboxSimulationOutcomes
      );
      const unsafeApplyEscapeRate = this.percent(
        unsafeApplyEscaped,
        Math.max(sandboxSimulationStarted, sandboxSimulationOutcomes)
      );
      const resolvedThresholds = this.resolveSandboxKpiThresholds(thresholds);
      const telemetryEvidencePass = sandboxSimulationStarted > 0 || sandboxSimulationOutcomes > 0;
      const sandboxSimulationPassRatePass =
        sandboxSimulationPassRate !== null &&
        sandboxSimulationPassRate >= resolvedThresholds.sandboxSimulationPassRateMin;
      const unsafeApplyEscapeRatePass =
        unsafeApplyEscapeRate !== null &&
        unsafeApplyEscapeRate <= resolvedThresholds.unsafeApplyEscapeRateMax;

      return {
        workspacePath,
        timeWindow,
        windowStartAt: windowStartMs === null ? null : new Date(windowStartMs).toISOString(),
        windowEndAt: new Date(nowMs).toISOString(),
        thresholds: resolvedThresholds,
        metrics: {
          sandboxSimulationStarted,
          sandboxSimulationPassed,
          sandboxSimulationFailed,
          unsafeApplyEscaped,
          sandboxSimulationPassRate,
          unsafeApplyEscapeRate,
        },
        gates: {
          telemetryEvidencePass,
          sandboxSimulationPassRatePass,
          unsafeApplyEscapeRatePass,
          overallPass:
            telemetryEvidencePass && sandboxSimulationPassRatePass && unsafeApplyEscapeRatePass,
        },
      };
    } catch (error) {
      this.logger.debug(`Failed to read sandbox KPI status: ${error}`);
      return null;
    }
  }

  async getStudioRollbackKpiStatus(
    preferredWorkspacePath?: string,
    timeWindow: CommandTelemetryTimeWindow = 'last7d',
    thresholds: Partial<StudioRollbackKpiThresholds> = {},
    projectPathFilter?: string
  ): Promise<StudioRollbackKpiStatus | null> {
    const workspacePath = this.resolveWorkspacePath(preferredWorkspacePath);
    if (!workspacePath) {
      return null;
    }

    try {
      const marker = await readWorkspaceMarker(workspacePath);
      if (!marker) {
        return null;
      }

      const telemetryRaw = marker.metadata?.custom?.workspaiTelemetry;
      const telemetry =
        telemetryRaw && typeof telemetryRaw === 'object'
          ? (telemetryRaw as Record<string, unknown>)
          : {};

      const recentEvents = this.parseRecentEvents(telemetry.recentEvents);
      const nowMs = Date.now();
      const windowStartMs = this.getWindowStartMs(timeWindow, nowMs);
      const filteredRecentEvents =
        windowStartMs === null
          ? recentEvents
          : recentEvents.filter((entry) => Date.parse(entry.at) >= windowStartMs);
      const scopedRecentEvents = this.filterRecentEventsByProjectPath(
        filteredRecentEvents,
        projectPathFilter
      );

      let verifyFailed = 0;
      let rollbackAttempted = 0;
      let rollbackSucceeded = 0;

      for (const entry of scopedRecentEvents) {
        if (entry.command === 'workspai.studio.verify_failed') {
          verifyFailed += 1;
        } else if (entry.command === 'workspai.studio.rollback_attempted') {
          rollbackAttempted += 1;
        } else if (entry.command === 'workspai.studio.rollback_succeeded') {
          rollbackSucceeded += 1;
        }
      }

      const verifyAutoRollbackSuccessRate =
        rollbackAttempted > 0
          ? Number(((rollbackSucceeded / rollbackAttempted) * 100).toFixed(2))
          : null;
      // falseConfidenceRate is only meaningful when rollback was actually attempted.
      // When rollbackAttempted === 0 the user may be recovering manually; returning null
      // prevents a spurious 100% gate failure driven purely by unrecovered verify failures.
      const falseConfidenceRate =
        rollbackAttempted > 0
          ? Number((((verifyFailed - rollbackSucceeded) / verifyFailed) * 100).toFixed(2))
          : null;

      const resolvedThresholds: StudioRollbackKpiThresholds = {
        verifyAutoRollbackSuccessRateMin:
          typeof thresholds.verifyAutoRollbackSuccessRateMin === 'number'
            ? thresholds.verifyAutoRollbackSuccessRateMin
            : 60,
        falseConfidenceRateMax:
          typeof thresholds.falseConfidenceRateMax === 'number'
            ? thresholds.falseConfidenceRateMax
            : 40,
      };

      const telemetryEvidencePass = verifyFailed > 0 || rollbackAttempted > 0;
      // null means the feature was not used in the measured window — treat as N/A (pass).
      const verifyAutoRollbackSuccessRatePass =
        verifyAutoRollbackSuccessRate === null ||
        verifyAutoRollbackSuccessRate >= resolvedThresholds.verifyAutoRollbackSuccessRateMin;
      const falseConfidenceRatePass =
        falseConfidenceRate === null ||
        falseConfidenceRate <= resolvedThresholds.falseConfidenceRateMax;

      return {
        workspacePath,
        timeWindow,
        windowStartAt: windowStartMs === null ? null : new Date(windowStartMs).toISOString(),
        windowEndAt: new Date(nowMs).toISOString(),
        thresholds: resolvedThresholds,
        metrics: {
          verifyFailed,
          rollbackAttempted,
          rollbackSucceeded,
          verifyAutoRollbackSuccessRate,
          falseConfidenceRate,
        },
        gates: {
          telemetryEvidencePass,
          verifyAutoRollbackSuccessRatePass,
          falseConfidenceRatePass,
          overallPass:
            telemetryEvidencePass && verifyAutoRollbackSuccessRatePass && falseConfidenceRatePass,
        },
      };
    } catch (error) {
      this.logger.debug(`Failed to read studio rollback KPI status: ${error}`);
      return null;
    }
  }

  async getStudioStabilizationKpiStatus(
    preferredWorkspacePath?: string,
    timeWindow: CommandTelemetryTimeWindow = 'last7d',
    thresholds: Partial<StudioStabilizationKpiThresholds> = {},
    projectPathFilter?: string
  ): Promise<StudioStabilizationKpiStatus | null> {
    const workspacePath = this.resolveWorkspacePath(preferredWorkspacePath);
    if (!workspacePath) {
      return null;
    }

    try {
      const marker = await readWorkspaceMarker(workspacePath);
      if (!marker) {
        return null;
      }

      const telemetryRaw = marker.metadata?.custom?.workspaiTelemetry;
      const telemetry =
        telemetryRaw && typeof telemetryRaw === 'object'
          ? (telemetryRaw as Record<string, unknown>)
          : {};

      const recentEvents = this.parseRecentEvents(telemetry.recentEvents);
      const hourlyUsage = this.parseHourlyUsage(telemetry.hourlyUsage);
      const nowMs = Date.now();
      const windowStartMs = this.getWindowStartMs(timeWindow, nowMs);
      const filteredRecentEvents =
        windowStartMs === null
          ? recentEvents
          : recentEvents.filter((entry) => Date.parse(entry.at) >= windowStartMs);
      const scopedRecentEvents = this.filterRecentEventsByProjectPath(
        filteredRecentEvents,
        projectPathFilter
      );

      const usageMap = projectPathFilter
        ? this.buildUsageFromRecentEvents(scopedRecentEvents, null)
        : this.buildStudioUsageMap({
            commandUsage: telemetry.commandUsage,
            hourlyUsage,
            recentEvents,
            timeWindow,
            windowStartMs,
            windowEndMs: nowMs,
            preferredCommands: [
              'workspai.studio.next_action_clicked',
              'workspai.studio.verify_passed',
              'workspai.studio.verify_failed',
              'workspai.studio.verify_incomplete_warning',
              'workspai.studio.rollback_attempted',
              'workspai.studio.rollback_succeeded',
              'workspai.studio.repeated_incident_detected',
            ],
          });

      const nextActionClicked = usageMap.get('workspai.studio.next_action_clicked') ?? 0;
      const verifyPassed = usageMap.get('workspai.studio.verify_passed') ?? 0;
      const verifyFailed = usageMap.get('workspai.studio.verify_failed') ?? 0;
      const rollbackAttempted = usageMap.get('workspai.studio.rollback_attempted') ?? 0;
      const rollbackSucceeded = usageMap.get('workspai.studio.rollback_succeeded') ?? 0;
      const repeatedIncidentDetected =
        usageMap.get('workspai.studio.repeated_incident_detected') ?? 0;
      const verifyIncompleteWarningCount =
        usageMap.get('workspai.studio.verify_incomplete_warning') ?? 0;

      let routeMatchedWithoutFallback = 0;
      let routeFallbackCount = 0;
      let verifyRequired = 0;
      let verifyPathPresent = 0;
      let repeatVerifiedResolved = 0;
      let repeatVerifiedWithArtifactReady = 0;
      const fallbackReasonBreakdown = {
        success: 0,
        bare_keyword_only: 0,
        fix_preview_fallback: 0,
        orchestrate_default: 0,
        other: 0,
      };
      const verifyPathReasonCount = new Map<string, number>();
      const recoveryClassBreakdown = {
        auto_rollback: 0,
        manual_recovery: 0,
        unspecified: 0,
      };

      for (const entry of scopedRecentEvents) {
        if (entry.command === 'workspai.studio.next_action_clicked') {
          const fallbackReason = entry.props?.fallbackReason;
          if (typeof fallbackReason === 'string') {
            if (fallbackReason === 'success') {
              routeMatchedWithoutFallback += 1;
              fallbackReasonBreakdown.success += 1;
            } else {
              routeFallbackCount += 1;
              if (fallbackReason === 'bare_keyword_only') {
                fallbackReasonBreakdown.bare_keyword_only += 1;
              } else if (fallbackReason === 'fix_preview_fallback') {
                fallbackReasonBreakdown.fix_preview_fallback += 1;
              } else if (fallbackReason === 'orchestrate_default') {
                fallbackReasonBreakdown.orchestrate_default += 1;
              } else {
                fallbackReasonBreakdown.other += 1;
              }
            }
          } else {
            // Legacy telemetry did not include fallbackReason; treat as success for continuity.
            routeMatchedWithoutFallback += 1;
            fallbackReasonBreakdown.success += 1;
          }
        }

        if (
          entry.command === 'workspai.studio.verify_passed' ||
          entry.command === 'workspai.studio.verify_failed'
        ) {
          const verifyRequiredProp = entry.props?.verifyRequired;
          const verifyRequiredFlag =
            typeof verifyRequiredProp === 'boolean' ? verifyRequiredProp : true;

          if (!verifyRequiredFlag) {
            continue;
          }

          verifyRequired += 1;

          const verifyPathPresentProp = entry.props?.verifyPathPresent;
          const verifyCompletenessAdequateProp = entry.props?.verifyCompletenessAdequate;
          const verifyPathPresentFlag =
            typeof verifyPathPresentProp === 'boolean'
              ? verifyPathPresentProp
              : typeof verifyCompletenessAdequateProp === 'boolean'
                ? verifyCompletenessAdequateProp
                : entry.command === 'workspai.studio.verify_passed';

          const verifyPathReasonRaw = entry.props?.verifyPathReason;
          const verifyPathReason =
            typeof verifyPathReasonRaw === 'string' && verifyPathReasonRaw.trim().length > 0
              ? verifyPathReasonRaw.trim().toLowerCase()
              : verifyPathPresentFlag
                ? 'ok'
                : 'unspecified';
          if (!verifyPathPresentFlag) {
            verifyPathReasonCount.set(
              verifyPathReason,
              (verifyPathReasonCount.get(verifyPathReason) ?? 0) + 1
            );
          }

          if (verifyPathPresentFlag) {
            verifyPathPresent += 1;
          }

          if (entry.command === 'workspai.studio.verify_passed') {
            const repeatedIncidentProp = entry.props?.repeatedIncident;
            if (repeatedIncidentProp === true) {
              repeatVerifiedResolved += 1;
            }
          }
        }

        // Track recovery class from rollback events
        if (
          entry.command === 'workspai.studio.rollback_attempted' ||
          entry.command === 'workspai.studio.rollback_succeeded' ||
          entry.command === 'workspai.studio.rollback_failed'
        ) {
          const recoveryClass = entry.props?.recoveryClass;
          if (typeof recoveryClass === 'string') {
            if (recoveryClass === 'auto_rollback') {
              recoveryClassBreakdown.auto_rollback += 1;
            } else if (recoveryClass === 'manual_recovery') {
              recoveryClassBreakdown.manual_recovery += 1;
            } else {
              recoveryClassBreakdown.unspecified += 1;
            }
          } else {
            recoveryClassBreakdown.unspecified += 1;
          }
        }

        // Track S05 cohort validation: repeated incidents with artifact ready
        if (entry.command === 'workspai.studio.verified_outcome_ready_for_artifact') {
          const repeatedIncidentProp = entry.props?.repeatedIncident;
          const replayReadyProp = entry.props?.replayReady;
          if (repeatedIncidentProp === true && replayReadyProp === true) {
            repeatVerifiedWithArtifactReady += 1;
          }
        }
      }

      const routePrecision = this.percent(routeMatchedWithoutFallback, nextActionClicked);
      const routeFallbackNonSuccessShare = this.percent(routeFallbackCount, nextActionClicked);
      const verifyPathCompletionRate = this.percent(verifyPathPresent, verifyRequired);
      const verifyIncompleteWarningRate = this.percent(
        verifyIncompleteWarningCount,
        verifyRequired
      );
      const falseConfidenceRate =
        verifyFailed > 0
          ? Number((((verifyFailed - rollbackSucceeded) / verifyFailed) * 100).toFixed(2))
          : null;
      const rollbackRecoverySuccessRate = this.percent(rollbackSucceeded, rollbackAttempted);
      const repeatVerifiedResolutionRate = this.percent(
        repeatVerifiedResolved,
        repeatedIncidentDetected
      );
      const repeatVerifiedWithArtifactRate = this.percent(
        repeatVerifiedWithArtifactReady,
        repeatedIncidentDetected
      );
      const verifyPathReasonTop = [...verifyPathReasonCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([reason, count]) => ({ reason, count }));
      const topVerifyPathMissReasonShare =
        verifyPathReasonTop.length > 0
          ? this.percent(
              verifyPathReasonTop[0].count,
              [...verifyPathReasonCount.values()].reduce((sum, count) => sum + count, 0)
            )
          : null;

      const resolvedThresholds: StudioStabilizationKpiThresholds = {
        routePrecisionMin:
          typeof thresholds.routePrecisionMin === 'number' ? thresholds.routePrecisionMin : 85,
        routeFallbackNonSuccessShareMax:
          typeof thresholds.routeFallbackNonSuccessShareMax === 'number'
            ? thresholds.routeFallbackNonSuccessShareMax
            : 20,
        verifyPathCompletionRateMin:
          typeof thresholds.verifyPathCompletionRateMin === 'number'
            ? thresholds.verifyPathCompletionRateMin
            : 60,
        verifyIncompleteWarningRateMax:
          typeof thresholds.verifyIncompleteWarningRateMax === 'number'
            ? thresholds.verifyIncompleteWarningRateMax
            : 40,
        topVerifyPathMissReasonShareMax:
          typeof thresholds.topVerifyPathMissReasonShareMax === 'number'
            ? thresholds.topVerifyPathMissReasonShareMax
            : 30,
        falseConfidenceRateMax:
          typeof thresholds.falseConfidenceRateMax === 'number'
            ? thresholds.falseConfidenceRateMax
            : 40,
        rollbackRecoverySuccessRateMin:
          typeof thresholds.rollbackRecoverySuccessRateMin === 'number'
            ? thresholds.rollbackRecoverySuccessRateMin
            : 60,
        repeatVerifiedResolutionRateMin:
          typeof thresholds.repeatVerifiedResolutionRateMin === 'number'
            ? thresholds.repeatVerifiedResolutionRateMin
            : 50,
      };

      const telemetryEvidencePass =
        nextActionClicked > 0 || verifyPassed > 0 || verifyFailed > 0 || rollbackAttempted > 0;
      const routePrecisionPass =
        routePrecision !== null && routePrecision >= resolvedThresholds.routePrecisionMin;
      const routeFallbackNonSuccessSharePass =
        routeFallbackNonSuccessShare !== null &&
        routeFallbackNonSuccessShare <= resolvedThresholds.routeFallbackNonSuccessShareMax;
      const verifyPathCompletionRatePass =
        verifyPathCompletionRate !== null &&
        verifyPathCompletionRate >= resolvedThresholds.verifyPathCompletionRateMin;
      const verifyIncompleteWarningRatePass =
        verifyIncompleteWarningRate === null ||
        verifyIncompleteWarningRate <= resolvedThresholds.verifyIncompleteWarningRateMax;
      const falseConfidenceRatePass =
        falseConfidenceRate !== null &&
        falseConfidenceRate <= resolvedThresholds.falseConfidenceRateMax;
      const rollbackRecoverySuccessRatePass =
        rollbackRecoverySuccessRate !== null &&
        rollbackRecoverySuccessRate >= resolvedThresholds.rollbackRecoverySuccessRateMin;
      const repeatVerifiedResolutionRatePass =
        repeatVerifiedResolutionRate === null ||
        repeatVerifiedResolutionRate >= resolvedThresholds.repeatVerifiedResolutionRateMin;
      const topVerifyPathMissReasonSharePass =
        topVerifyPathMissReasonShare === null ||
        topVerifyPathMissReasonShare <= resolvedThresholds.topVerifyPathMissReasonShareMax;

      return {
        workspacePath,
        timeWindow,
        windowStartAt: windowStartMs === null ? null : new Date(windowStartMs).toISOString(),
        windowEndAt: new Date(nowMs).toISOString(),
        thresholds: resolvedThresholds,
        metrics: {
          nextActionClicked,
          routeMatchedWithoutFallback,
          routeFallbackCount,
          routePrecision,
          routeFallbackNonSuccessShare,
          verifyRequired,
          verifyPathPresent,
          verifyPathCompletionRate,
          verifyIncompleteWarningCount,
          verifyIncompleteWarningRate,
          verifyFailed,
          rollbackAttempted,
          rollbackSucceeded,
          falseConfidenceRate,
          rollbackRecoverySuccessRate,
          repeatedIncidentDetected,
          repeatVerifiedResolved,
          repeatVerifiedResolutionRate,
          repeatVerifiedWithArtifactReady,
          repeatVerifiedWithArtifactRate,
          fallbackReasonBreakdown,
          verifyPathReasonTop,
          topVerifyPathMissReasonShare,
          recoveryClassBreakdown,
        },
        gates: {
          telemetryEvidencePass,
          routePrecisionPass,
          routeFallbackNonSuccessSharePass,
          verifyPathCompletionRatePass,
          verifyIncompleteWarningRatePass,
          falseConfidenceRatePass,
          rollbackRecoverySuccessRatePass,
          repeatVerifiedResolutionRatePass,
          topVerifyPathMissReasonSharePass,
          overallPass:
            telemetryEvidencePass &&
            routePrecisionPass &&
            verifyPathCompletionRatePass &&
            falseConfidenceRatePass &&
            rollbackRecoverySuccessRatePass &&
            repeatVerifiedResolutionRatePass,
        },
      };
    } catch (error) {
      this.logger.debug(`Failed to read studio stabilization KPI status: ${error}`);
      return null;
    }
  }

  async getStudioReproPackKpiStatus(
    preferredWorkspacePath?: string,
    timeWindow: CommandTelemetryTimeWindow = 'last7d',
    thresholds: Partial<StudioReproPackKpiThresholds> = {},
    projectPathFilter?: string
  ): Promise<StudioReproPackKpiStatus | null> {
    const workspacePath = this.resolveWorkspacePath(preferredWorkspacePath);
    if (!workspacePath) {
      return null;
    }

    try {
      const marker = await readWorkspaceMarker(workspacePath);
      if (!marker) {
        return null;
      }

      const telemetryRaw = marker.metadata?.custom?.workspaiTelemetry;
      const telemetry =
        telemetryRaw && typeof telemetryRaw === 'object'
          ? (telemetryRaw as Record<string, unknown>)
          : {};

      const recentEvents = this.parseRecentEvents(telemetry.recentEvents);
      const hourlyUsage = this.parseHourlyUsage(telemetry.hourlyUsage);
      const nowMs = Date.now();
      const windowStartMs = this.getWindowStartMs(timeWindow, nowMs);
      const filteredRecentEvents =
        windowStartMs === null
          ? recentEvents
          : recentEvents.filter((entry) => Date.parse(entry.at) >= windowStartMs);
      const scopedRecentEvents = this.filterRecentEventsByProjectPath(
        filteredRecentEvents,
        projectPathFilter
      );
      const usageMap = projectPathFilter
        ? this.buildUsageFromRecentEvents(scopedRecentEvents, null)
        : this.buildStudioUsageMap({
            commandUsage: telemetry.commandUsage,
            hourlyUsage,
            recentEvents,
            timeWindow,
            windowStartMs,
            windowEndMs: nowMs,
            preferredCommands: [
              'workspai.studio.incident_repro_pack_captured',
              'workspai.studio.incident_repro_pack_exported',
              'workspai.studio.incident_repro_pack_imported',
              'workspai.studio.incident_replay_ready',
              'workspai.studio.incident_replay_memory_enriched',
            ],
          });

      const reproPackCaptured = usageMap.get('workspai.studio.incident_repro_pack_captured') ?? 0;
      const reproPackExported = usageMap.get('workspai.studio.incident_repro_pack_exported') ?? 0;
      const reproPackImported = usageMap.get('workspai.studio.incident_repro_pack_imported') ?? 0;
      const incidentReplayReady = usageMap.get('workspai.studio.incident_replay_ready') ?? 0;
      const incidentReplayMemoryEnriched =
        usageMap.get('workspai.studio.incident_replay_memory_enriched') ?? 0;

      const reproPackShareRate = this.percent(reproPackExported, reproPackCaptured);
      const replayToResolutionRate = this.percent(incidentReplayMemoryEnriched, reproPackImported);

      const resolvedThresholds: StudioReproPackKpiThresholds = {
        reproPackShareRateMin:
          typeof thresholds.reproPackShareRateMin === 'number'
            ? thresholds.reproPackShareRateMin
            : 20,
        replayToResolutionRateMin:
          typeof thresholds.replayToResolutionRateMin === 'number'
            ? thresholds.replayToResolutionRateMin
            : 60,
      };

      const telemetryEvidencePass = reproPackCaptured > 0 || reproPackImported > 0;
      const reproPackShareRatePass =
        reproPackShareRate !== null &&
        reproPackShareRate >= resolvedThresholds.reproPackShareRateMin;
      const replayToResolutionRatePass =
        replayToResolutionRate !== null &&
        replayToResolutionRate >= resolvedThresholds.replayToResolutionRateMin;

      return {
        workspacePath,
        timeWindow,
        windowStartAt: windowStartMs === null ? null : new Date(windowStartMs).toISOString(),
        windowEndAt: new Date(nowMs).toISOString(),
        thresholds: resolvedThresholds,
        metrics: {
          reproPackCaptured,
          reproPackExported,
          reproPackImported,
          incidentReplayReady,
          incidentReplayMemoryEnriched,
          reproPackShareRate,
          replayToResolutionRate,
        },
        gates: {
          telemetryEvidencePass,
          reproPackShareRatePass,
          replayToResolutionRatePass,
          overallPass:
            telemetryEvidencePass && reproPackShareRatePass && replayToResolutionRatePass,
        },
      };
    } catch (error) {
      this.logger.debug(`Failed to read studio repro pack KPI status: ${error}`);
      return null;
    }
  }

  async getReleaseReadinessValidationKpiStatus(
    preferredWorkspacePath?: string,
    timeWindow: CommandTelemetryTimeWindow = 'last30d',
    projectPathFilter?: string
  ): Promise<ReleaseReadinessValidationKpiStatus | null> {
    const workspacePath = this.resolveWorkspacePath(preferredWorkspacePath);
    if (!workspacePath) {
      return null;
    }

    try {
      const marker = await readWorkspaceMarker(workspacePath);
      if (!marker) {
        return null;
      }

      const telemetryRaw = marker.metadata?.custom?.workspaiTelemetry;
      const telemetry =
        telemetryRaw && typeof telemetryRaw === 'object'
          ? (telemetryRaw as Record<string, unknown>)
          : {};

      const recentEvents = this.parseRecentEvents(telemetry.recentEvents);
      const hourlyUsage = this.parseHourlyUsage(telemetry.hourlyUsage);
      const nowMs = Date.now();
      const windowStartMs = this.getWindowStartMs(timeWindow, nowMs);
      const filteredRecentEvents =
        windowStartMs === null
          ? recentEvents
          : recentEvents.filter((entry) => Date.parse(entry.at) >= windowStartMs);
      const scopedRecentEvents = this.filterRecentEventsByProjectPath(
        filteredRecentEvents,
        projectPathFilter
      );
      const usageMap = projectPathFilter
        ? this.buildUsageFromRecentEvents(scopedRecentEvents, null)
        : this.buildStudioUsageMap({
            commandUsage: telemetry.commandUsage,
            hourlyUsage,
            recentEvents,
            timeWindow,
            windowStartMs,
            windowEndMs: nowMs,
            preferredCommands: [
              'workspai.studio.release_readiness_artifact_exported',
              'workspai.studio.release_readiness_go_decision_exported',
              'workspai.studio.release_readiness_no_go_decision_exported',
              'workspai.studio.release_readiness_decision_validated',
              'workspai.studio.release_readiness_decision_correct',
              'workspai.studio.release_readiness_no_go_decision_validated',
              'workspai.studio.release_readiness_no_go_prevented_incident',
            ],
          });

      const releaseReadinessArtifactsExported =
        usageMap.get('workspai.studio.release_readiness_artifact_exported') ?? 0;
      const goDecisionsExported =
        usageMap.get('workspai.studio.release_readiness_go_decision_exported') ?? 0;
      const noGoDecisionsExported =
        usageMap.get('workspai.studio.release_readiness_no_go_decision_exported') ?? 0;
      const decisionsValidated =
        usageMap.get('workspai.studio.release_readiness_decision_validated') ?? 0;
      const decisionsCorrect =
        usageMap.get('workspai.studio.release_readiness_decision_correct') ?? 0;
      const noGoDecisionsValidated =
        usageMap.get('workspai.studio.release_readiness_no_go_decision_validated') ?? 0;
      const noGoPreventedIncident =
        usageMap.get('workspai.studio.release_readiness_no_go_prevented_incident') ?? 0;

      const releaseReadinessDecisionAccuracy = this.percent(decisionsCorrect, decisionsValidated);
      const noGoPreventedIncidentRate = this.percent(noGoPreventedIncident, noGoDecisionsValidated);

      const telemetryEvidencePass =
        releaseReadinessArtifactsExported > 0 ||
        decisionsValidated > 0 ||
        noGoDecisionsExported > 0;
      const releaseReadinessDecisionAccuracyAvailable = decisionsValidated > 0;
      const noGoPreventedIncidentRateAvailable = noGoDecisionsValidated > 0;

      return {
        workspacePath,
        timeWindow,
        windowStartAt: windowStartMs === null ? null : new Date(windowStartMs).toISOString(),
        windowEndAt: new Date(nowMs).toISOString(),
        metrics: {
          releaseReadinessArtifactsExported,
          goDecisionsExported,
          noGoDecisionsExported,
          decisionsValidated,
          decisionsCorrect,
          noGoDecisionsValidated,
          noGoPreventedIncident,
          releaseReadinessDecisionAccuracy,
          noGoPreventedIncidentRate,
        },
        gates: {
          telemetryEvidencePass,
          releaseReadinessDecisionAccuracyAvailable,
          noGoPreventedIncidentRateAvailable,
          overallPass:
            telemetryEvidencePass &&
            releaseReadinessDecisionAccuracyAvailable &&
            noGoPreventedIncidentRateAvailable,
        },
      };
    } catch (error) {
      this.logger.debug(`Failed to read release readiness validation KPI status: ${error}`);
      return null;
    }
  }

  /**
   * Returns clarification-gate KPI: absolute counts and rate vs ask events.
   * Useful for dashboards that need to track how often users are blocked by the
   * clarification gate relative to how often they successfully invoke ask.
   */
  async getClarificationGateKpiStatus(
    preferredWorkspacePath?: string,
    timeWindow: CommandTelemetryTimeWindow = 'last7d',
    thresholds: Partial<ClarificationGateKpiThresholds> = {}
  ): Promise<ClarificationGateKpiStatus | null> {
    const workspacePath = this.resolveWorkspacePath(preferredWorkspacePath);
    if (!workspacePath) {
      return null;
    }

    try {
      const marker = await readWorkspaceMarker(workspacePath);
      if (!marker) {
        return null;
      }

      const telemetryRaw = marker.metadata?.custom?.workspaiTelemetry;
      const telemetry =
        telemetryRaw && typeof telemetryRaw === 'object'
          ? (telemetryRaw as Record<string, unknown>)
          : {};

      const recentEvents = this.parseRecentEvents(telemetry.recentEvents);
      const hourlyUsage = this.parseHourlyUsage(telemetry.hourlyUsage);
      const nowMs = Date.now();
      const windowStartMs = this.getWindowStartMs(timeWindow, nowMs);

      const usageMap = this.buildStudioUsageMap({
        commandUsage: telemetry.commandUsage,
        hourlyUsage,
        recentEvents,
        timeWindow,
        windowStartMs,
        windowEndMs: nowMs,
        preferredCommands: [
          'workspai.chat.ask',
          'workspai.aimodal.ask',
          'workspai.chat.clarification_gate',
          'workspai.aimodal.clarification_gate',
        ],
      });

      const chatAskCount = usageMap.get('workspai.chat.ask') ?? 0;
      const aimodalAskCount = usageMap.get('workspai.aimodal.ask') ?? 0;
      const chatClarificationGateCount = usageMap.get('workspai.chat.clarification_gate') ?? 0;
      const aimodalClarificationGateCount =
        usageMap.get('workspai.aimodal.clarification_gate') ?? 0;

      const totalAskCount = chatAskCount + aimodalAskCount;
      const clarificationGateCount = chatClarificationGateCount + aimodalClarificationGateCount;
      const clarificationRateVsAsk = this.percent(clarificationGateCount, totalAskCount);

      const resolvedThresholds: ClarificationGateKpiThresholds = {
        clarificationRateVsAskMax:
          typeof thresholds.clarificationRateVsAskMax === 'number'
            ? thresholds.clarificationRateVsAskMax
            : 40,
      };

      const telemetryEvidencePass = totalAskCount > 0 || clarificationGateCount > 0;
      const clarificationRateVsAskPass =
        clarificationRateVsAsk === null ||
        clarificationRateVsAsk <= resolvedThresholds.clarificationRateVsAskMax;

      return {
        workspacePath,
        timeWindow,
        windowStartAt: windowStartMs === null ? null : new Date(windowStartMs).toISOString(),
        windowEndAt: new Date(nowMs).toISOString(),
        thresholds: resolvedThresholds,
        metrics: {
          chatAskCount,
          aimodalAskCount,
          totalAskCount,
          chatClarificationGateCount,
          aimodalClarificationGateCount,
          clarificationGateCount,
          clarificationRateVsAsk,
        },
        gates: {
          telemetryEvidencePass,
          clarificationRateVsAskPass,
          overallPass: telemetryEvidencePass && clarificationRateVsAskPass,
        },
      };
    } catch (error) {
      this.logger.debug(`Failed to read clarification gate KPI status: ${error}`);
      return null;
    }
  }

  /**
   * Records a latency sample for a named performance SLO event (first-chunk, sync, board-render).
   * Samples are stored in the workspace marker under workspaiTelemetry.latencySamples.
   */
  async recordLatencySample(
    event: LatencySampleEvent['event'],
    ms: number,
    preferredWorkspacePath?: string
  ): Promise<boolean> {
    const workspacePath = this.resolveWorkspacePath(preferredWorkspacePath);
    if (!workspacePath) {
      return false;
    }

    const key = workspacePath;
    const writeOp = (this.commandTelemetryWriteQueue.get(key) ?? Promise.resolve()).then(
      async () => {
        try {
          const marker = await readWorkspaceMarker(workspacePath);
          if (!marker) {
            return;
          }

          const telemetryRaw = marker.metadata?.custom?.workspaiTelemetry;
          const telemetry: Record<string, unknown> =
            telemetryRaw && typeof telemetryRaw === 'object'
              ? { ...(telemetryRaw as Record<string, unknown>) }
              : {};

          const rawSamples = telemetry.latencySamples;
          const existingSamples: LatencySampleEvent[] = Array.isArray(rawSamples)
            ? (rawSamples as LatencySampleEvent[]).filter(
                (s) =>
                  s &&
                  typeof s === 'object' &&
                  typeof s.event === 'string' &&
                  typeof s.ms === 'number' &&
                  typeof s.at === 'string'
              )
            : [];

          const newSample: LatencySampleEvent = { event, ms, at: new Date().toISOString() };
          const updatedSamples = [...existingSamples, newSample].slice(-MAX_LATENCY_SAMPLES);

          telemetry.latencySamples = updatedSamples;

          await updateWorkspaceMetadata(workspacePath, {
            custom: {
              ...(marker.metadata?.custom ?? {}),
              workspaiTelemetry: telemetry,
            },
          });
        } catch (err) {
          this.logger.debug(`Failed to record latency sample: ${err}`);
        }
      }
    );

    this.commandTelemetryWriteQueue.set(key, writeOp);
    await writeOp;
    return true;
  }

  /**
   * Returns P95 latency SLO compliance status for first-chunk, sync, and board-render events.
   */
  async getPerformanceSloStatus(
    preferredWorkspacePath?: string,
    timeWindow: CommandTelemetryTimeWindow = 'last7d',
    thresholds: Partial<PerformanceSloThresholds> = {}
  ): Promise<PerformanceSloStatus | null> {
    const workspacePath = this.resolveWorkspacePath(preferredWorkspacePath);
    if (!workspacePath) {
      return null;
    }

    try {
      const marker = await readWorkspaceMarker(workspacePath);
      if (!marker) {
        return null;
      }

      const telemetryRaw = marker.metadata?.custom?.workspaiTelemetry;
      const telemetry =
        telemetryRaw && typeof telemetryRaw === 'object'
          ? (telemetryRaw as Record<string, unknown>)
          : {};

      const rawSamples = telemetry.latencySamples;
      const allSamples: LatencySampleEvent[] = Array.isArray(rawSamples)
        ? (rawSamples as LatencySampleEvent[]).filter(
            (s) =>
              s &&
              typeof s === 'object' &&
              typeof s.event === 'string' &&
              typeof s.ms === 'number' &&
              typeof s.at === 'string' &&
              !Number.isNaN(Date.parse(s.at))
          )
        : [];

      const nowMs = Date.now();
      const windowStartMs = this.getWindowStartMs(timeWindow, nowMs);

      const windowedSamples =
        windowStartMs === null
          ? allSamples
          : allSamples.filter((s) => {
              const t = Date.parse(s.at);
              return t >= windowStartMs && t <= nowMs;
            });

      const pick = (eventName: LatencySampleEvent['event']) =>
        windowedSamples.filter((s) => s.event === eventName).map((s) => s.ms);

      const computeP95 = (values: number[]): number | null => {
        if (values.length === 0) {
          return null;
        }
        const sorted = [...values].sort((a, b) => a - b);
        const idx = Math.ceil(sorted.length * 0.95) - 1;
        return sorted[Math.max(0, idx)];
      };

      const firstChunkSamples = pick('workspai.perf.first_chunk_latency');
      const syncSamples = pick('workspai.perf.sync_latency');
      const boardRenderSamples = pick('workspai.perf.board_render_latency');

      const firstChunkLatencyP95Ms = computeP95(firstChunkSamples);
      const syncLatencyP95Ms = computeP95(syncSamples);
      const boardRenderLatencyP95Ms = computeP95(boardRenderSamples);

      const resolvedThresholds: PerformanceSloThresholds = {
        firstChunkLatencyP95MaxMs:
          typeof thresholds.firstChunkLatencyP95MaxMs === 'number'
            ? thresholds.firstChunkLatencyP95MaxMs
            : 3000,
        syncLatencyP95MaxMs:
          typeof thresholds.syncLatencyP95MaxMs === 'number'
            ? thresholds.syncLatencyP95MaxMs
            : 2000,
        boardRenderLatencyP95MaxMs:
          typeof thresholds.boardRenderLatencyP95MaxMs === 'number'
            ? thresholds.boardRenderLatencyP95MaxMs
            : 500,
      };

      const telemetryEvidencePass =
        firstChunkSamples.length > 0 || syncSamples.length > 0 || boardRenderSamples.length > 0;

      const firstChunkLatencyPass =
        firstChunkLatencyP95Ms === null ||
        firstChunkLatencyP95Ms <= resolvedThresholds.firstChunkLatencyP95MaxMs;
      const syncLatencyPass =
        syncLatencyP95Ms === null || syncLatencyP95Ms <= resolvedThresholds.syncLatencyP95MaxMs;
      const boardRenderLatencyPass =
        boardRenderLatencyP95Ms === null ||
        boardRenderLatencyP95Ms <= resolvedThresholds.boardRenderLatencyP95MaxMs;

      return {
        workspacePath,
        timeWindow,
        windowStartAt: windowStartMs === null ? null : new Date(windowStartMs).toISOString(),
        windowEndAt: new Date(nowMs).toISOString(),
        thresholds: resolvedThresholds,
        metrics: {
          firstChunkSampleCount: firstChunkSamples.length,
          syncSampleCount: syncSamples.length,
          boardRenderSampleCount: boardRenderSamples.length,
          firstChunkLatencyP95Ms,
          syncLatencyP95Ms,
          boardRenderLatencyP95Ms,
        },
        gates: {
          telemetryEvidencePass,
          firstChunkLatencyPass,
          syncLatencyPass,
          boardRenderLatencyPass,
          overallPass:
            telemetryEvidencePass &&
            firstChunkLatencyPass &&
            syncLatencyPass &&
            boardRenderLatencyPass,
        },
      };
    } catch (error) {
      this.logger.debug(`Failed to read performance SLO status: ${error}`);
      return null;
    }
  }

  /**
   * Enterprise Stabilization Gate v1 — evaluates all S01-S05 KPIs plus release readiness
   * in both last7d and last30d windows. Returns a combined gate status used to enforce the
   * loop expansion freeze rule: expansion is allowed only when both windows pass.
   */
  async getEnterpriseStabilizationGateStatus(
    preferredWorkspacePath?: string,
    projectPathFilter?: string
  ): Promise<EnterpriseStabilizationGateStatus | null> {
    const workspacePath = this.resolveWorkspacePath(preferredWorkspacePath);
    if (!workspacePath) {
      return null;
    }

    try {
      const [
        stabilization7d,
        stabilization30d,
        reproPackKpi7d,
        reproPackKpi30d,
        releaseReadiness7d,
        releaseReadiness30d,
        hardGate7d,
        hardGate30d,
      ] = await Promise.all([
        this.getStudioStabilizationKpiStatus(workspacePath, 'last7d', {}, projectPathFilter),
        this.getStudioStabilizationKpiStatus(workspacePath, 'last30d', {}, projectPathFilter),
        this.getStudioReproPackKpiStatus(workspacePath, 'last7d', {}, projectPathFilter),
        this.getStudioReproPackKpiStatus(workspacePath, 'last30d', {}, projectPathFilter),
        this.getReleaseReadinessValidationKpiStatus(workspacePath, 'last7d', projectPathFilter),
        this.getReleaseReadinessValidationKpiStatus(workspacePath, 'last30d', projectPathFilter),
        this.getStudioHardGateStatus(workspacePath, 'last7d', {}, projectPathFilter),
        this.getStudioHardGateStatus(workspacePath, 'last30d', {}, projectPathFilter),
      ]);

      const evaluateWindow = (
        window: 'last7d' | 'last30d',
        stabilization: StudioStabilizationKpiStatus | null,
        reproPackKpi: StudioReproPackKpiStatus | null,
        releaseReadiness: ReleaseReadinessValidationKpiStatus | null,
        hardGate: StudioHardGateStatus | null
      ): EnterpriseStabilizationGateWindowResult => {
        const windowEndAt = stabilization?.windowEndAt ?? new Date().toISOString();
        const windowStartAt = stabilization?.windowStartAt ?? null;

        const routePrecisionPass = stabilization?.gates.routePrecisionPass ?? false;
        const verifyPathCompletionPass = stabilization?.gates.verifyPathCompletionRatePass ?? false;
        const falseConfidencePass = stabilization?.gates.falseConfidenceRatePass ?? false;
        const rollbackRecoveryPass = stabilization?.gates.rollbackRecoverySuccessRatePass ?? false;
        const repeatVerifiedResolutionPass =
          stabilization?.gates.repeatVerifiedResolutionRatePass ?? false;
        const reproPackSharePass = reproPackKpi?.gates.reproPackShareRatePass ?? false;
        const releaseReadinessEvidencePass = releaseReadiness?.gates.telemetryEvidencePass ?? false;
        const hardGatePass = hardGate?.gates.overallPass ?? false;

        const overallPass =
          routePrecisionPass &&
          verifyPathCompletionPass &&
          falseConfidencePass &&
          rollbackRecoveryPass &&
          repeatVerifiedResolutionPass &&
          reproPackSharePass &&
          releaseReadinessEvidencePass &&
          hardGatePass;

        return {
          window,
          windowStartAt,
          windowEndAt,
          routePrecisionPass,
          verifyPathCompletionPass,
          falseConfidencePass,
          rollbackRecoveryPass,
          repeatVerifiedResolutionPass,
          reproPackSharePass,
          releaseReadinessEvidencePass,
          hardGatePass,
          overallPass,
        };
      };

      const last7dResult = evaluateWindow(
        'last7d',
        stabilization7d,
        reproPackKpi7d,
        releaseReadiness7d,
        hardGate7d
      );
      const last30dResult = evaluateWindow(
        'last30d',
        stabilization30d,
        reproPackKpi30d,
        releaseReadiness30d,
        hardGate30d
      );

      const consecutiveWindowsPass =
        (last7dResult.overallPass ? 1 : 0) + (last30dResult.overallPass ? 1 : 0);
      const expansionFrozen = consecutiveWindowsPass < 2;

      let freezeReason: string | null = null;
      if (expansionFrozen) {
        if (consecutiveWindowsPass === 0) {
          freezeReason = 'Neither last7d nor last30d window passes all enterprise gate criteria.';
        } else {
          // One window passes, find which one failed
          const failingWindow = !last7dResult.overallPass ? last7dResult : last30dResult;
          const failedGates: string[] = [];
          if (!failingWindow.routePrecisionPass) {
            failedGates.push('S01 Route Precision');
          }
          if (!failingWindow.verifyPathCompletionPass) {
            failedGates.push('S02 Verify Path Quality');
          }
          if (!failingWindow.falseConfidencePass) {
            failedGates.push('S03 False Confidence Rate');
          }
          if (!failingWindow.rollbackRecoveryPass) {
            failedGates.push('S04 Rollback Recovery');
          }
          if (!failingWindow.repeatVerifiedResolutionPass) {
            failedGates.push('S05 Repeat Verified Resolution');
          }
          if (!failingWindow.reproPackSharePass) {
            failedGates.push('Repro Pack Share Rate');
          }
          if (!failingWindow.releaseReadinessEvidencePass) {
            failedGates.push('Release Readiness Evidence');
          }
          if (!failingWindow.hardGatePass) {
            failedGates.push('Hard Gate (verify phase reach)');
          }
          freezeReason = `${failingWindow.window} window failing: ${failedGates.join(', ')}.`;
        }
      }

      return {
        workspacePath,
        evaluatedAt: new Date().toISOString(),
        last7d: last7dResult,
        last30d: last30dResult,
        consecutiveWindowsPass,
        expansionFrozen,
        freezeReason,
      };
    } catch (error) {
      this.logger.debug(`Failed to evaluate enterprise stabilization gate: ${error}`);
      return null;
    }
  }

  /**
   * Clears command telemetry payload from workspace marker custom metadata.
   */
  async clearCommandTelemetry(preferredWorkspacePath?: string): Promise<boolean> {
    const workspacePath = this.resolveWorkspacePath(preferredWorkspacePath);
    if (!workspacePath) {
      return false;
    }

    try {
      const marker = await readWorkspaceMarker(workspacePath);
      if (!marker) {
        return false;
      }

      if (!marker.metadata?.custom) {
        return true;
      }

      const custom = { ...marker.metadata.custom };
      if (!('workspaiTelemetry' in custom)) {
        return true;
      }

      delete custom.workspaiTelemetry;

      const metadata = { ...(marker.metadata ?? {}) };
      if (Object.keys(custom).length > 0) {
        metadata.custom = custom;
      } else {
        delete metadata.custom;
      }

      await writeWorkspaceMarker(workspacePath, {
        ...marker,
        metadata,
      });

      this.logger.debug(`Cleared command telemetry in ${workspacePath}`);
      return true;
    } catch (error) {
      this.logger.debug(`Failed to clear command telemetry: ${error}`);
      return false;
    }
  }

  /**
   * Track that a workspace was opened in VS Code
   * Updates the workspace marker with VS Code metadata
   */
  async trackWorkspaceOpen(workspacePath: string): Promise<void> {
    // Only track once per session
    if (this.trackedWorkspaces.has(workspacePath)) {
      return;
    }

    try {
      const marker = await readWorkspaceMarker(workspacePath);

      if (!marker) {
        // Not a RapidKit workspace
        return;
      }

      const currentCount = marker.metadata?.vscode?.openCount || 0;
      const wasCreatedViaExtension = marker.metadata?.vscode?.createdViaExtension || false;

      await updateWorkspaceMetadata(workspacePath, {
        vscode: {
          extensionVersion: getExtensionVersion(),
          createdViaExtension: wasCreatedViaExtension,
          lastOpenedAt: new Date().toISOString(),
          openCount: currentCount + 1,
        },
      });

      this.trackedWorkspaces.add(workspacePath);
      this.logger.debug(`Tracked workspace open: ${workspacePath} (count: ${currentCount + 1})`);
    } catch (error) {
      // Silent fail - tracking is optional
      this.logger.debug(`Failed to track workspace open: ${error}`);
    }
  }

  /**
   * Initialize tracking for active workspaces
   */
  async initialize(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
      return;
    }

    for (const folder of workspaceFolders) {
      await this.trackWorkspaceOpen(folder.uri.fsPath);
    }
  }
}

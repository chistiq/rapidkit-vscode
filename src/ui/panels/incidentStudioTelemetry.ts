export type IncidentStudioCommandSummary = {
  totalEvents: number;
  lastCommand: string | null;
  lastCommandAt: string | null;
  commandUsage: Array<{ command: string; count: number }>;
  surfaceBreakdown: {
    actionEvents: number;
    askEvents: number;
    actionVsAskShare: number | null;
  };
};

export type IncidentStudioOnboardingSummary = {
  followupShown: number;
  followupClicked: number;
  overallFollowupClickThroughRate: number;
};

export type IncidentStudioCtaVariantBreakdown = {
  workspacePath: string;
  timeWindow: 'all' | 'last24h' | 'last7d' | 'last30d';
  windowStartAt: string | null;
  windowEndAt: string;
  variants: Array<{
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
  }>;
};

export type IncidentStudioTelemetryPayload = {
  commandSummary: IncidentStudioCommandSummary | null;
  onboardingSummary: IncidentStudioOnboardingSummary | null;
  ctaVariantBreakdown?: IncidentStudioCtaVariantBreakdown | null;
  studioHardGateStatus?: {
    workspacePath: string;
    timeWindow: 'all' | 'last24h' | 'last7d' | 'last30d';
    windowStartAt: string | null;
    windowEndAt: string;
    thresholds: {
      verifyPhaseReachMin: number;
      bridgeRouteCompletionMin: number;
    };
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
  } | null;
  studioRollbackKpiStatus?: {
    workspacePath: string;
    timeWindow: 'all' | 'last24h' | 'last7d' | 'last30d';
    windowStartAt: string | null;
    windowEndAt: string;
    thresholds: {
      verifyAutoRollbackSuccessRateMin: number;
      falseConfidenceRateMax: number;
    };
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
  } | null;
  studioStabilizationKpiStatus?: {
    workspacePath: string;
    timeWindow: 'all' | 'last24h' | 'last7d' | 'last30d';
    windowStartAt: string | null;
    windowEndAt: string;
    thresholds: {
      routePrecisionMin: number;
      routeFallbackNonSuccessShareMax?: number;
      verifyPathCompletionRateMin: number;
      verifyIncompleteWarningRateMax?: number;
      topVerifyPathMissReasonShareMax?: number;
      falseConfidenceRateMax: number;
      rollbackRecoverySuccessRateMin: number;
      repeatVerifiedResolutionRateMin: number;
    };
    metrics: {
      nextActionClicked: number;
      routeMatchedWithoutFallback: number;
      routeFallbackCount: number;
      routePrecision: number | null;
      routeFallbackNonSuccessShare?: number | null;
      verifyRequired: number;
      verifyPathPresent: number;
      verifyPathCompletionRate: number | null;
      verifyIncompleteWarningCount?: number;
      verifyIncompleteWarningRate?: number | null;
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
      routeFallbackNonSuccessSharePass?: boolean;
      verifyPathCompletionRatePass: boolean;
      verifyIncompleteWarningRatePass?: boolean;
      falseConfidenceRatePass: boolean;
      rollbackRecoverySuccessRatePass: boolean;
      repeatVerifiedResolutionRatePass: boolean;
      topVerifyPathMissReasonSharePass?: boolean;
      overallPass: boolean;
    };
  } | null;
  studioReproPackKpiStatus?: {
    workspacePath: string;
    timeWindow: 'all' | 'last24h' | 'last7d' | 'last30d';
    windowStartAt: string | null;
    windowEndAt: string;
    thresholds: {
      reproPackShareRateMin: number;
      replayToResolutionRateMin: number;
    };
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
  } | null;
  releaseReadinessValidationKpiStatus?: {
    workspacePath: string;
    timeWindow: 'all' | 'last24h' | 'last7d' | 'last30d';
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
  } | null;
  verifiedOutcomeLoopStatus?: {
    workspacePath: string | null;
    timeWindow: 'all' | 'last24h' | 'last7d' | 'last30d' | null;
    loopStarted: number;
    verifiedOutcomes: number;
    /** verifiedOutcomes / loopStarted * 100; null when loopStarted === 0 */
    verifiedOutcomeRate: number | null;
    reusableArtifacts: {
      reproPacksExported: number;
      replayReady: number;
      memoryEnriched: number;
      releaseArtifactsExported: number;
    };
    conversionRates: {
      replayToResolutionRate: number | null;
      releaseDecisionAccuracy: number | null;
      noGoPreventedIncidentRate: number | null;
    };
    gates: {
      reproEvidencePass: boolean;
      releaseEvidencePass: boolean;
      overallPass: boolean;
    };
  } | null;
  enterpriseStabilizationGateStatus?: {
    workspacePath: string;
    evaluatedAt: string;
    last7d: {
      window: 'last7d' | 'last30d';
      windowStartAt: string | null;
      windowEndAt: string;
      routePrecisionPass: boolean;
      verifyPathCompletionPass: boolean;
      falseConfidencePass: boolean;
      rollbackRecoveryPass: boolean;
      repeatVerifiedResolutionPass: boolean;
      reproPackSharePass: boolean;
      releaseReadinessEvidencePass: boolean;
      hardGatePass: boolean;
      overallPass: boolean;
    } | null;
    last30d: {
      window: 'last7d' | 'last30d';
      windowStartAt: string | null;
      windowEndAt: string;
      routePrecisionPass: boolean;
      verifyPathCompletionPass: boolean;
      falseConfidencePass: boolean;
      rollbackRecoveryPass: boolean;
      repeatVerifiedResolutionPass: boolean;
      reproPackSharePass: boolean;
      releaseReadinessEvidencePass: boolean;
      hardGatePass: boolean;
      overallPass: boolean;
    } | null;
    consecutiveWindowsPass: number;
    expansionFrozen: boolean;
    freezeReason: string | null;
  } | null;
  doctorTreatmentStatus?: {
    evaluatedAt: string | null;
    trend: 'baseline' | 'stable' | 'improving' | 'regressing' | 'unknown';
    baselineAvailable: boolean;
    scoreDeltaPercent: number | null;
    netIssueDelta: number | null;
    newIssueCount: number;
    resolvedIssueCount: number;
    regressionSignals: number;
    improvementSignals: number;
    mixedScopeWarnings: number;
    scopedChecks: number;
    aggregatedChecks: number;
    dominantScope: string | null;
    traceabilityCoverageRate: number | null;
    probeFailures: number;
    probeWarnings: number;
  } | null;
  doctorSummary?: unknown | null;
};

export type CachedIncidentStudioTelemetry = IncidentStudioTelemetryPayload & {
  timestamp: number;
};

function attachCtaVariantBreakdownToDoctorSummary(
  doctorSummary: unknown | null,
  ctaVariantBreakdown: IncidentStudioCtaVariantBreakdown | null | undefined
): unknown | null {
  if (!doctorSummary || typeof doctorSummary !== 'object' || Array.isArray(doctorSummary)) {
    return doctorSummary;
  }

  return {
    ...(doctorSummary as Record<string, unknown>),
    ctaVariantBreakdown: ctaVariantBreakdown ?? null,
  };
}

function buildVerifiedOutcomeLoopStatus(
  ctaVariantBreakdown: IncidentStudioCtaVariantBreakdown | null | undefined,
  studioReproPackKpiStatus: IncidentStudioTelemetryPayload['studioReproPackKpiStatus'],
  releaseReadinessValidationKpiStatus: IncidentStudioTelemetryPayload['releaseReadinessValidationKpiStatus']
): IncidentStudioTelemetryPayload['verifiedOutcomeLoopStatus'] {
  const loopStarted =
    ctaVariantBreakdown?.variants.reduce((sum, variant) => sum + variant.loopStarted, 0) ?? 0;
  const verifiedOutcomes =
    ctaVariantBreakdown?.variants.reduce((sum, variant) => sum + variant.verifyPassed, 0) ?? 0;
  const verifiedOutcomeRate =
    loopStarted > 0 ? Number(((verifiedOutcomes / loopStarted) * 100).toFixed(2)) : null;

  if (!ctaVariantBreakdown && !studioReproPackKpiStatus && !releaseReadinessValidationKpiStatus) {
    return null;
  }

  const workspacePath =
    ctaVariantBreakdown?.workspacePath ||
    studioReproPackKpiStatus?.workspacePath ||
    releaseReadinessValidationKpiStatus?.workspacePath ||
    null;
  const timeWindow =
    ctaVariantBreakdown?.timeWindow ||
    studioReproPackKpiStatus?.timeWindow ||
    releaseReadinessValidationKpiStatus?.timeWindow ||
    null;

  return {
    workspacePath,
    timeWindow,
    loopStarted,
    verifiedOutcomes,
    verifiedOutcomeRate,
    reusableArtifacts: {
      reproPacksExported: studioReproPackKpiStatus?.metrics.reproPackExported ?? 0,
      replayReady: studioReproPackKpiStatus?.metrics.incidentReplayReady ?? 0,
      memoryEnriched: studioReproPackKpiStatus?.metrics.incidentReplayMemoryEnriched ?? 0,
      releaseArtifactsExported:
        releaseReadinessValidationKpiStatus?.metrics.releaseReadinessArtifactsExported ?? 0,
    },
    conversionRates: {
      replayToResolutionRate: studioReproPackKpiStatus?.metrics.replayToResolutionRate ?? null,
      releaseDecisionAccuracy:
        releaseReadinessValidationKpiStatus?.metrics.releaseReadinessDecisionAccuracy ?? null,
      noGoPreventedIncidentRate:
        releaseReadinessValidationKpiStatus?.metrics.noGoPreventedIncidentRate ?? null,
    },
    gates: {
      reproEvidencePass: Boolean(studioReproPackKpiStatus?.gates.overallPass),
      releaseEvidencePass: Boolean(releaseReadinessValidationKpiStatus?.gates.overallPass),
      overallPass: Boolean(
        studioReproPackKpiStatus?.gates.overallPass &&
        releaseReadinessValidationKpiStatus?.gates.overallPass
      ),
    },
  };
}

function toFiniteNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function buildDoctorTreatmentStatus(
  doctorSummary: unknown | null
): IncidentStudioTelemetryPayload['doctorTreatmentStatus'] {
  if (!doctorSummary || typeof doctorSummary !== 'object' || Array.isArray(doctorSummary)) {
    return null;
  }

  const summary = doctorSummary as Record<string, unknown>;
  const driftDelta =
    summary.driftDelta &&
    typeof summary.driftDelta === 'object' &&
    !Array.isArray(summary.driftDelta)
      ? (summary.driftDelta as Record<string, unknown>)
      : null;
  const scopeProvenance =
    summary.scopeProvenance &&
    typeof summary.scopeProvenance === 'object' &&
    !Array.isArray(summary.scopeProvenance)
      ? (summary.scopeProvenance as Record<string, unknown>)
      : null;
  const scoreBreakdown = Array.isArray(summary.scoreBreakdown)
    ? summary.scoreBreakdown.filter((entry) => entry && typeof entry === 'object')
    : [];
  const projects = Array.isArray(summary.projects)
    ? summary.projects.filter((entry) => entry && typeof entry === 'object')
    : [];

  const baselineAvailable = Boolean(driftDelta?.baselineAvailable);
  const netIssueDelta = driftDelta ? toFiniteNumber(driftDelta.netIssueDelta) : null;
  const newIssueCount = driftDelta ? (toFiniteNumber(driftDelta.newIssueCount) ?? 0) : 0;
  const resolvedIssueCount = driftDelta ? (toFiniteNumber(driftDelta.resolvedIssueCount) ?? 0) : 0;
  const scoreDeltaPercent = driftDelta
    ? driftDelta.scoreDeltaPercent === null
      ? null
      : toFiniteNumber(driftDelta.scoreDeltaPercent)
    : null;

  const systemStatusChanges = Array.isArray(driftDelta?.systemStatusChanges)
    ? driftDelta?.systemStatusChanges.filter((entry) => entry && typeof entry === 'object')
    : [];
  const regressedProjects = Array.isArray(driftDelta?.regressedProjects)
    ? driftDelta?.regressedProjects.filter((entry) => typeof entry === 'string')
    : [];
  const improvedProjects = Array.isArray(driftDelta?.improvedProjects)
    ? driftDelta?.improvedProjects.filter((entry) => typeof entry === 'string')
    : [];

  let regressionSignals = regressedProjects.length;
  let improvementSignals = improvedProjects.length;
  for (const change of systemStatusChanges) {
    const row = change as Record<string, unknown>;
    const from = typeof row.from === 'string' ? row.from.toLowerCase() : '';
    const to = typeof row.to === 'string' ? row.to.toLowerCase() : '';
    if ((from === 'pass' || from === 'warn') && to === 'fail') {
      regressionSignals += 1;
    }
    if ((from === 'fail' || from === 'warn') && to === 'pass') {
      improvementSignals += 1;
    }
  }

  let probeFailures = 0;
  let probeWarnings = 0;
  for (const project of projects) {
    const probes = (project as Record<string, unknown>).probes;
    if (!Array.isArray(probes)) {
      continue;
    }
    for (const probe of probes) {
      if (!probe || typeof probe !== 'object') {
        continue;
      }
      const row = probe as Record<string, unknown>;
      const severity = typeof row.severity === 'string' ? row.severity.toLowerCase() : '';
      const status = typeof row.status === 'string' ? row.status.toLowerCase() : '';
      if (severity === 'error' || status === 'fail') {
        probeFailures += 1;
      } else if (severity === 'warn' || status === 'warn') {
        probeWarnings += 1;
      }
    }
  }

  regressionSignals += probeFailures;
  improvementSignals += Math.max(0, resolvedIssueCount - regressedProjects.length);

  const traceableCount = scoreBreakdown.reduce((acc, entry) => {
    const row = entry as Record<string, unknown>;
    return typeof row.policyRuleId === 'string' && row.policyRuleId.trim().length > 0
      ? acc + 1
      : acc;
  }, 0);
  const traceabilityCoverageRate =
    scoreBreakdown.length > 0
      ? Number(((traceableCount / scoreBreakdown.length) * 100).toFixed(2))
      : null;

  const scopedChecks = scopeProvenance ? (toFiniteNumber(scopeProvenance.scopedCount) ?? 0) : 0;
  const aggregatedChecks = scopeProvenance
    ? (toFiniteNumber(scopeProvenance.aggregatedCount) ?? 0)
    : 0;
  const mixedScopeWarnings = scopeProvenance
    ? (toFiniteNumber(scopeProvenance.mixedCount) ?? 0)
    : 0;
  const dominantScope =
    scopeProvenance && typeof scopeProvenance.dominantScope === 'string'
      ? scopeProvenance.dominantScope
      : null;

  const trend: NonNullable<IncidentStudioTelemetryPayload['doctorTreatmentStatus']>['trend'] =
    !baselineAvailable && !driftDelta
      ? 'unknown'
      : !baselineAvailable
        ? 'baseline'
        : (netIssueDelta ?? 0) > 0
          ? 'regressing'
          : (netIssueDelta ?? 0) < 0
            ? 'improving'
            : 'stable';

  if (
    !driftDelta &&
    !scopeProvenance &&
    scoreBreakdown.length === 0 &&
    probeFailures === 0 &&
    probeWarnings === 0
  ) {
    return null;
  }

  return {
    evaluatedAt: typeof summary.generatedAt === 'string' ? summary.generatedAt : null,
    trend,
    baselineAvailable,
    scoreDeltaPercent,
    netIssueDelta,
    newIssueCount,
    resolvedIssueCount,
    regressionSignals,
    improvementSignals,
    mixedScopeWarnings,
    scopedChecks,
    aggregatedChecks,
    dominantScope,
    traceabilityCoverageRate,
    probeFailures,
    probeWarnings,
  };
}

export function shouldUseIncidentStudioTelemetryCache(
  cachedData: CachedIncidentStudioTelemetry | undefined,
  now: number,
  ttlMs: number
): boolean {
  return Boolean(cachedData && now - cachedData.timestamp < ttlMs);
}

export function buildIncidentStudioTelemetryFromCache(
  cachedData: CachedIncidentStudioTelemetry,
  doctorSummary: unknown | null
): IncidentStudioTelemetryPayload {
  const releaseReadinessValidationKpiStatus =
    cachedData.releaseReadinessValidationKpiStatus ?? null;
  const verifiedOutcomeLoopStatus =
    cachedData.verifiedOutcomeLoopStatus ??
    buildVerifiedOutcomeLoopStatus(
      cachedData.ctaVariantBreakdown ?? null,
      cachedData.studioReproPackKpiStatus ?? null,
      releaseReadinessValidationKpiStatus
    );
  const nextDoctorTreatmentStatus =
    buildDoctorTreatmentStatus(doctorSummary) ?? cachedData.doctorTreatmentStatus ?? null;

  return {
    commandSummary: cachedData.commandSummary,
    onboardingSummary: cachedData.onboardingSummary,
    ctaVariantBreakdown: cachedData.ctaVariantBreakdown ?? null,
    studioHardGateStatus: cachedData.studioHardGateStatus ?? null,
    studioRollbackKpiStatus: cachedData.studioRollbackKpiStatus ?? null,
    studioStabilizationKpiStatus: cachedData.studioStabilizationKpiStatus ?? null,
    studioReproPackKpiStatus: cachedData.studioReproPackKpiStatus ?? null,
    releaseReadinessValidationKpiStatus,
    verifiedOutcomeLoopStatus,
    enterpriseStabilizationGateStatus: cachedData.enterpriseStabilizationGateStatus ?? null,
    doctorTreatmentStatus: nextDoctorTreatmentStatus,
    // Always prefer the doctor snapshot freshly read from disk.
    doctorSummary: attachCtaVariantBreakdownToDoctorSummary(
      doctorSummary,
      cachedData.ctaVariantBreakdown ?? null
    ),
  };
}

function normalizeProjectPathForScope(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/**
 * When Incident Studio runs in project scope, doctor KPI cards should reflect
 * the selected project rather than the full workspace aggregate.
 */
export function filterDoctorSummaryForProjectScope(
  doctorSummary: unknown | null,
  projectPath?: string
): unknown | null {
  if (!doctorSummary || typeof doctorSummary !== 'object' || Array.isArray(doctorSummary)) {
    return doctorSummary;
  }

  const normalizedProjectPath =
    typeof projectPath === 'string' && projectPath.trim().length > 0
      ? normalizeProjectPathForScope(projectPath.trim())
      : undefined;

  if (!normalizedProjectPath) {
    return doctorSummary;
  }

  const summary = doctorSummary as Record<string, unknown>;
  const projects = Array.isArray(summary.projects)
    ? summary.projects.filter((entry) => {
        if (!entry || typeof entry !== 'object') {
          return false;
        }
        const path = (entry as Record<string, unknown>).path;
        return (
          typeof path === 'string' && normalizeProjectPathForScope(path) === normalizedProjectPath
        );
      })
    : [];

  if (projects.length === 0) {
    return {
      ...summary,
      projectCount: 0,
      projectsWithIssues: 0,
      issueCount: 0,
      scopeProvenance: {
        ...(typeof summary.scopeProvenance === 'object' && summary.scopeProvenance
          ? (summary.scopeProvenance as Record<string, unknown>)
          : {}),
        scopedCount: 0,
        aggregatedCount: 0,
        mixedCount: 0,
        dominantScope: 'project',
      },
      projects: [],
    };
  }

  let passed = 0;
  let warnings = 0;
  let errors = 0;
  let issueCount = 0;

  for (const project of projects) {
    const row = project as Record<string, unknown>;
    issueCount += Number(row.issues ?? 0);
    const probes = Array.isArray(row.probes) ? row.probes : [];
    for (const probe of probes) {
      if (!probe || typeof probe !== 'object') {
        continue;
      }
      const status = String((probe as Record<string, unknown>).status ?? '').toLowerCase();
      const severity = String((probe as Record<string, unknown>).severity ?? '').toLowerCase();
      if (status === 'pass' || status === 'passed') {
        passed += 1;
      } else if (severity === 'error' || status === 'fail' || status === 'failed') {
        errors += 1;
      } else if (severity === 'warn' || status === 'warn' || status === 'warning') {
        warnings += 1;
      }
    }
  }

  const total = passed + warnings + errors;
  const percent = total > 0 ? Math.round((passed / total) * 100) : 0;

  return {
    ...summary,
    projectCount: projects.length,
    projectsWithIssues: projects.filter(
      (entry) => Number((entry as Record<string, unknown>).issues ?? 0) > 0
    ).length,
    issueCount,
    health: {
      passed,
      warnings,
      errors,
      total,
      percent,
    },
    scopeProvenance: {
      ...(typeof summary.scopeProvenance === 'object' && summary.scopeProvenance
        ? (summary.scopeProvenance as Record<string, unknown>)
        : {}),
      scopedCount: total,
      aggregatedCount: 0,
      mixedCount: 0,
      dominantScope: 'project',
    },
    projects,
  };
}

export function buildIncidentStudioTelemetryPayload(
  commandSummary: {
    totalEvents: number;
    lastCommand: string | null;
    lastCommandAt: string | null;
    commandUsage: Array<{ command: string; count: number }>;
    surfaceBreakdown: {
      actionEvents: number;
      askEvents: number;
      actionVsAskShare: number | null;
    };
  } | null,
  onboardingSummary: {
    followupShown: number;
    followupClicked: number;
    overallFollowupClickThroughRate: number;
  } | null,
  ctaVariantBreakdown: {
    workspacePath: string;
    timeWindow: 'all' | 'last24h' | 'last7d' | 'last30d';
    windowStartAt: string | null;
    windowEndAt: string;
    variants: Array<{
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
    }>;
  } | null,
  doctorSummary: unknown | null,
  studioHardGateStatus?: IncidentStudioTelemetryPayload['studioHardGateStatus'],
  studioRollbackKpiStatus?: IncidentStudioTelemetryPayload['studioRollbackKpiStatus'],
  studioStabilizationKpiStatus?: IncidentStudioTelemetryPayload['studioStabilizationKpiStatus'],
  studioReproPackKpiStatus?: IncidentStudioTelemetryPayload['studioReproPackKpiStatus'],
  releaseReadinessValidationKpiStatus?: IncidentStudioTelemetryPayload['releaseReadinessValidationKpiStatus'],
  enterpriseStabilizationGateStatus?: IncidentStudioTelemetryPayload['enterpriseStabilizationGateStatus']
): IncidentStudioTelemetryPayload {
  const nextCtaVariantBreakdown = ctaVariantBreakdown
    ? {
        workspacePath: ctaVariantBreakdown.workspacePath,
        timeWindow: ctaVariantBreakdown.timeWindow,
        windowStartAt: ctaVariantBreakdown.windowStartAt,
        windowEndAt: ctaVariantBreakdown.windowEndAt,
        variants: ctaVariantBreakdown.variants,
      }
    : null;
  const nextVerifiedOutcomeLoopStatus = buildVerifiedOutcomeLoopStatus(
    nextCtaVariantBreakdown,
    studioReproPackKpiStatus ?? null,
    releaseReadinessValidationKpiStatus ?? null
  );

  return {
    commandSummary: commandSummary
      ? {
          totalEvents: commandSummary.totalEvents,
          lastCommand: commandSummary.lastCommand,
          lastCommandAt: commandSummary.lastCommandAt,
          commandUsage: commandSummary.commandUsage,
          surfaceBreakdown: {
            actionEvents: commandSummary.surfaceBreakdown.actionEvents,
            askEvents: commandSummary.surfaceBreakdown.askEvents,
            actionVsAskShare: commandSummary.surfaceBreakdown.actionVsAskShare,
          },
        }
      : null,
    onboardingSummary: onboardingSummary
      ? {
          followupShown: onboardingSummary.followupShown,
          followupClicked: onboardingSummary.followupClicked,
          overallFollowupClickThroughRate: onboardingSummary.overallFollowupClickThroughRate,
        }
      : null,
    ctaVariantBreakdown: nextCtaVariantBreakdown,
    studioHardGateStatus: studioHardGateStatus ?? null,
    studioRollbackKpiStatus: studioRollbackKpiStatus ?? null,
    studioStabilizationKpiStatus: studioStabilizationKpiStatus ?? null,
    studioReproPackKpiStatus: studioReproPackKpiStatus ?? null,
    releaseReadinessValidationKpiStatus: releaseReadinessValidationKpiStatus ?? null,
    verifiedOutcomeLoopStatus: nextVerifiedOutcomeLoopStatus,
    enterpriseStabilizationGateStatus: enterpriseStabilizationGateStatus ?? null,
    doctorTreatmentStatus: buildDoctorTreatmentStatus(doctorSummary),
    doctorSummary: attachCtaVariantBreakdownToDoctorSummary(doctorSummary, nextCtaVariantBreakdown),
  };
}

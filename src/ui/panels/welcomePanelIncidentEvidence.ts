import type { WorkspaiContractRuntimeEvidence } from '../../core/workspaiContractRuntime';
import type { classifyIncidentActionPolicy } from './incidentStudioPromptPolicy';
import { derivePredictionConfidenceBand } from './welcomePanelIncidentPolicy';
import type {
  IncidentMemoryInfluenceAuditEntry,
  IncidentWorkspaceGraphSnapshot,
} from './welcomePanel.shared.js';

type IncidentActionPolicy = ReturnType<typeof classifyIncidentActionPolicy>;

export function buildIncidentDiagnosisEvidence(input: {
  actionPolicy: IncidentActionPolicy;
  verifyReady: boolean;
  verifySuccess: boolean;
  doctorEvidence?: {
    healthScoreText: string;
    generatedAt?: string;
    passed?: number;
    warnings?: number;
    errors?: number;
  };
  impactAssessment: {
    affectedFiles: string[];
    affectedModules: string[];
    likelyFailureMode?: string;
    verifyChecklist: string[];
  };
  predictiveWarning?: {
    warningId: string;
  };
  contractRuntimeEvidence?: WorkspaiContractRuntimeEvidence;
  verifyCommandPack?: {
    qualityScore: number;
    readiness: 'ready' | 'needs-attention';
  };
  graphSnapshot: {
    nodes: Array<{ filePath?: string }>;
  };
}): {
  confidence: number;
  confidenceBand: 'low' | 'medium' | 'high';
  signalSources: string[];
  relatedFiles: string[];
  recommendedFocus?: string;
} {
  const signalSources: string[] = [];
  let confidenceScore = 25;

  if (input.doctorEvidence) {
    signalSources.push('doctor-evidence');
    confidenceScore += 25;
  }

  if (input.graphSnapshot.nodes.length > 0) {
    signalSources.push('system-graph');
    confidenceScore += 20;
  }

  if (
    input.impactAssessment.affectedFiles.length > 0 ||
    input.impactAssessment.affectedModules.length > 0
  ) {
    signalSources.push('impact-analysis');
    confidenceScore += 15;
  }

  if (input.predictiveWarning) {
    signalSources.push('predictive-warning');
    confidenceScore += 10;
  }

  if (input.contractRuntimeEvidence?.evaluated) {
    signalSources.push('contract-validation');
    confidenceScore += input.contractRuntimeEvidence.errors.length > 0 ? -8 : 8;
  }

  if (input.verifyCommandPack) {
    signalSources.push('verify-command-pack');
    confidenceScore += input.verifyCommandPack.readiness === 'ready' ? 8 : -10;
    if (input.verifyCommandPack.qualityScore < 60) {
      confidenceScore -= 6;
    }
  }

  if (input.verifyReady) {
    signalSources.push('verify-evidence-ready');
    confidenceScore += 8;
  }

  if (!input.verifySuccess) {
    signalSources.push('verify-failed');
    confidenceScore -= 12;
  }

  if (input.actionPolicy.requiresImpactReview) {
    confidenceScore += 5;
  }

  const confidence = Math.max(0, Math.min(100, confidenceScore));
  const confidenceBand = derivePredictionConfidenceBand(confidence);
  const relatedFiles = Array.from(
    new Set([
      ...input.impactAssessment.affectedFiles,
      ...input.graphSnapshot.nodes
        .map((node) => node.filePath)
        .filter((filePath): filePath is string => Boolean(filePath)),
    ])
  ).slice(0, 8);

  const recommendedFocus =
    input.impactAssessment.likelyFailureMode || input.impactAssessment.verifyChecklist[0];

  return {
    confidence,
    confidenceBand,
    signalSources,
    relatedFiles,
    recommendedFocus,
  };
}

export function buildMemoryInfluenceAuditTimeline(input: {
  actionId: string;
  actionType: string;
  graphSnapshot: IncidentWorkspaceGraphSnapshot;
  decisionClarityMissingFields: string[];
  releaseGateBlockedReasons: string[];
  incidentReproPackId?: string;
  releaseReadinessArtifactId?: string;
}): IncidentMemoryInfluenceAuditEntry[] {
  const now = new Date().toISOString();
  const memoryPolicy = input.graphSnapshot.memory;

  const decisionArtifacts = {
    actionId: input.actionId,
    reproPackId: input.incidentReproPackId,
    releaseReadinessArtifactId: input.releaseReadinessArtifactId,
  };

  const entries: IncidentMemoryInfluenceAuditEntry[] = [
    {
      memoryEventId: `memory-${input.actionId}-context`,
      timestamp: now,
      source: 'workspace-memory',
      influenceKind: 'context',
      summary: memoryPolicy.hasMemory
        ? `Workspace memory context was attached to ${input.actionType} decision flow.`
        : `No persisted workspace memory context was available for ${input.actionType}.`,
      policyProfile: memoryPolicy.policyProfile,
      sensitivity: memoryPolicy.sensitivity,
      localProcessingMode: memoryPolicy.localProcessingMode,
      decisionArtifacts,
    },
    {
      memoryEventId: `memory-${input.actionId}-policy`,
      timestamp: now,
      source: 'workspace-memory',
      influenceKind: 'policy',
      summary: `Memory policy profile ${memoryPolicy.policyProfile} (${memoryPolicy.sensitivity}) enforced localProcessingMode=${String(
        memoryPolicy.localProcessingMode
      )}.`,
      policyProfile: memoryPolicy.policyProfile,
      sensitivity: memoryPolicy.sensitivity,
      localProcessingMode: memoryPolicy.localProcessingMode,
      decisionArtifacts,
    },
    {
      memoryEventId: `memory-${input.actionId}-decision`,
      timestamp: now,
      source: 'workspace-memory',
      influenceKind: 'decision',
      summary:
        input.decisionClarityMissingFields.length > 0
          ? `Decision clarity remained gated by ${input.decisionClarityMissingFields.length} missing field(s).`
          : 'Decision clarity contract remained complete under current memory policy constraints.',
      policyProfile: memoryPolicy.policyProfile,
      sensitivity: memoryPolicy.sensitivity,
      localProcessingMode: memoryPolicy.localProcessingMode,
      decisionArtifacts,
    },
  ];

  if (input.incidentReproPackId || input.releaseReadinessArtifactId) {
    entries.push({
      memoryEventId: `memory-${input.actionId}-artifact-link`,
      timestamp: now,
      source: 'workspace-memory',
      influenceKind: 'artifact-link',
      summary:
        input.releaseGateBlockedReasons.length > 0
          ? `Audit linkage recorded with ${input.releaseGateBlockedReasons.length} release-gate blocked reason(s).`
          : 'Audit linkage recorded between memory influence and generated decision artifacts.',
      policyProfile: memoryPolicy.policyProfile,
      sensitivity: memoryPolicy.sensitivity,
      localProcessingMode: memoryPolicy.localProcessingMode,
      decisionArtifacts,
    });
  }

  return entries;
}

export function buildIncidentReproPackEvidence(input: {
  actionType: string;
  actionId: string;
  conversationId: string;
  workspacePath?: string;
  verifySuccess: boolean;
  conversationHistoryTurns: number;
  doctorEvidence?: {
    healthScoreText: string;
    generatedAt?: string;
    passed?: number;
    warnings?: number;
    errors?: number;
  };
  rollbackEvidence?: {
    attempted: boolean;
  };
  sandboxEvidence?: {
    status: 'passed' | 'failed' | 'skipped';
  };
  impactAssessment: {
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    likelyFailureMode?: string;
    verifyChecklist: string[];
    affectedFiles: string[];
  };
  releaseGateEvidence: {
    blockedReasons: string[];
  };
  diagnosisEvidence: {
    relatedFiles: string[];
  };
}):
  | {
      packId: string;
      status: 'captured' | 'failed' | 'skipped';
      capturedAt: string;
      schemaVersion: 'v1';
      workspacePath: string;
      conversationId: string;
      actionId: string;
      redaction: {
        policy: string;
        applied: boolean;
        redactedFields: string[];
      };
      summary: {
        historyTurns: number;
        hasDoctorEvidence: boolean;
        hasRollbackEvidence: boolean;
        hasSandboxEvidence: boolean;
        hasPredictiveWarning: boolean;
        verifySuccess: boolean;
        affectedFilesCount: number;
        blockedReasonCount: number;
      };
      replayPayload: {
        workspacePath: string;
        conversationId: string;
        actionType: string;
        riskLevel: 'low' | 'medium' | 'high' | 'critical';
        likelyFailureMode?: string;
        verifyChecklist: string[];
        blockedReasons: string[];
        relatedFiles: string[];
      };
      exportHint?: string;
      sensitivityLabel?: 'internal' | 'restricted' | 'confidential';
      memoryInfluenceAuditTimeline?: IncidentMemoryInfluenceAuditEntry[];
    }
  | undefined {
  if (input.actionType !== 'incident-repro-pack' || !input.workspacePath) {
    return undefined;
  }

  const capturedAt = new Date().toISOString();
  const packId = `incident-repro-${input.actionId}-${Date.now().toString(36)}`;

  return {
    packId,
    status: 'captured',
    capturedAt,
    schemaVersion: 'v1',
    workspacePath: input.workspacePath,
    conversationId: input.conversationId,
    actionId: input.actionId,
    redaction: {
      policy: 'incident-studio-default',
      applied: true,
      redactedFields: ['authorization', 'token', 'password', 'secret', 'apiKey'],
    },
    summary: {
      historyTurns: input.conversationHistoryTurns,
      hasDoctorEvidence: Boolean(input.doctorEvidence),
      hasRollbackEvidence: Boolean(input.rollbackEvidence?.attempted),
      hasSandboxEvidence: Boolean(input.sandboxEvidence),
      hasPredictiveWarning: Boolean(input.impactAssessment.likelyFailureMode),
      verifySuccess: input.verifySuccess,
      affectedFilesCount: input.impactAssessment.affectedFiles.length,
      blockedReasonCount: input.releaseGateEvidence.blockedReasons.length,
    },
    replayPayload: {
      workspacePath: input.workspacePath,
      conversationId: input.conversationId,
      actionType: input.actionType,
      riskLevel: input.impactAssessment.riskLevel,
      likelyFailureMode: input.impactAssessment.likelyFailureMode,
      verifyChecklist: input.impactAssessment.verifyChecklist.slice(0, 8),
      blockedReasons: input.releaseGateEvidence.blockedReasons.slice(0, 8),
      relatedFiles: input.diagnosisEvidence.relatedFiles.slice(0, 10),
    },
    exportHint:
      'Use share/export flow for secure handoff: keep redaction enabled and include replay checklist + blocked reasons.',
    sensitivityLabel:
      input.impactAssessment.riskLevel === 'critical'
        ? 'confidential'
        : input.impactAssessment.riskLevel === 'high'
          ? 'restricted'
          : 'internal',
  };
}

export function buildReleaseReadinessCommanderArtifact(input: {
  actionType: string;
  actionId: string;
  workspacePath?: string;
  confidence: number;
  verifySuccess: boolean;
  releaseGateEvidence: {
    scopeKnown: boolean;
    verifyPathPresent: boolean;
    rollbackPathPresent: boolean;
    blockedReasons: string[];
  };
  sandboxEvidence?: {
    status: 'passed' | 'failed' | 'skipped';
  };
  doctorEvidence?: {
    errors?: number;
    warnings?: number;
  };
}):
  | {
      artifactId: string;
      schemaVersion: 'v1';
      generatedAt: string;
      workspacePath: string;
      actionId: string;
      decision: 'go' | 'no-go';
      confidence: number;
      blockingReasons: string[];
      evidence: {
        verifyPackContractStatus: 'passed' | 'failed' | 'skipped' | 'unavailable';
        sandboxStatus: 'passed' | 'failed' | 'skipped' | 'unavailable';
        doctorErrors: number;
        doctorWarnings: number;
        scopeKnown: boolean;
        verifyPathPresent: boolean;
        rollbackPathPresent: boolean;
      };
      summary: {
        goNoGoRationale: string;
        recommendedNextStep: string;
      };
    }
  | undefined {
  if (input.actionType !== 'release-readiness-commander' || !input.workspacePath) {
    return undefined;
  }

  const verifyPackContractStatus =
    input.sandboxEvidence?.status === 'passed' ||
    input.sandboxEvidence?.status === 'failed' ||
    input.sandboxEvidence?.status === 'skipped'
      ? input.sandboxEvidence.status
      : 'unavailable';

  const evidence = {
    verifyPackContractStatus,
    sandboxStatus: verifyPackContractStatus,
    doctorErrors: Math.max(0, input.doctorEvidence?.errors ?? 0),
    doctorWarnings: Math.max(0, input.doctorEvidence?.warnings ?? 0),
    scopeKnown: input.releaseGateEvidence.scopeKnown,
    verifyPathPresent: input.releaseGateEvidence.verifyPathPresent,
    rollbackPathPresent: input.releaseGateEvidence.rollbackPathPresent,
  } as const;

  const blockingReasons = Array.from(
    new Set([
      ...input.releaseGateEvidence.blockedReasons,
      ...(evidence.doctorErrors > 0 ? [`Doctor reported ${evidence.doctorErrors} error(s)`] : []),
      ...(evidence.verifyPackContractStatus !== 'passed'
        ? [`Verify-pack contract status is ${evidence.verifyPackContractStatus}`]
        : []),
      ...(!evidence.scopeKnown ? ['Affected scope is unknown'] : []),
      ...(!evidence.verifyPathPresent ? ['Verify path is missing'] : []),
      ...(!evidence.rollbackPathPresent ? ['Rollback path is missing'] : []),
    ])
  ).slice(0, 12);

  const decision: 'go' | 'no-go' =
    input.verifySuccess &&
    blockingReasons.length === 0 &&
    evidence.verifyPackContractStatus === 'passed' &&
    evidence.rollbackPathPresent
      ? 'go'
      : 'no-go';

  const goNoGoRationale =
    decision === 'go'
      ? 'All release-readiness checks are green with no unresolved blockers.'
      : 'One or more release-readiness blockers are unresolved; ship should remain blocked.';

  const recommendedNextStep =
    decision === 'go'
      ? 'Proceed with release gate execution and keep rollback path documented in the release note.'
      : blockingReasons[0]
        ? `Resolve blocker: ${blockingReasons[0]}, then regenerate the commander artifact.`
        : 'Collect missing evidence and rerun release readiness commander.';

  return {
    artifactId: `release-readiness-${input.actionId}-${Date.now().toString(36)}`,
    schemaVersion: 'v1',
    generatedAt: new Date().toISOString(),
    workspacePath: input.workspacePath,
    actionId: input.actionId,
    decision,
    confidence: Math.max(0, Math.min(100, Math.round(input.confidence))),
    blockingReasons,
    evidence,
    summary: {
      goNoGoRationale,
      recommendedNextStep,
    },
  };
}

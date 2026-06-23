import { isWorkspacePathAncestor } from '../../core/aiContextResolver';
import {
  applyPatches,
  extractPatchesFromAiResponse,
  type MultiFilePatchResult,
} from '../../core/patchApplyEngine';
import { runSandboxSimulation } from '../../core/sandboxSimulation';
import { WorkspaceUsageTracker } from '../../utils/workspaceUsageTracker';
import { buildIncidentMemoryEnrichmentSuggestion } from './incidentStudioMemory';
import {
  assessVerifyCompleteness,
  classifyIncidentActionPolicy,
  isIncidentActionAllowlisted,
  labelDiagnosisConfidence,
} from './incidentStudioPromptPolicy';
import type { IncidentWave2ContractsResult } from './welcomePanelIncidentWave2';
import type { IncidentWave2ContractsInput } from './welcomePanelIncidentWave2';
import {
  buildIncidentDiagnosisEvidence,
  buildIncidentReproPackEvidence,
  buildMemoryInfluenceAuditTimeline,
  buildReleaseReadinessCommanderArtifact,
} from './welcomePanelIncidentEvidence';
import { buildInlineQueryFromAction } from './welcomePanelChatBrainInlineQuery';
import type { ChatBrainConversation } from './welcomePanelChatBrainQuery';
import type { ChatBrainQueryPayload } from './welcomePanelChatBrainQuery';
import type { WebviewFromExtensionMessage } from '../../contracts/webviewProtocol';
import type { SandboxVerifyCommand } from '../../core/sandboxSimulation';
import type { IncidentWorkspaceGraphSnapshot } from './welcomePanel.shared.js';
import {
  deriveIncidentVerifyCommandPack,
  resolveIncidentRollbackRuntimePolicy,
} from './welcomePanelIncidentPolicy';

export type ChatBrainExecuteActionHost = {
  chatBrainConversations: Map<string, ChatBrainConversation>;
  postChatBrainWebviewMessage: (message: WebviewFromExtensionMessage) => void;
  trackStudioEvent: (
    eventName: string,
    workspacePath?: string,
    properties?: Record<string, unknown>
  ) => void;
  readGitDirtyEntries: (
    workspacePath: string
  ) => Promise<Array<{ path: string; untracked: boolean }> | null>;
  runAiChatQuery: (data: ChatBrainQueryPayload, requestId?: string) => Promise<void>;
  getWorkspaceGraphSnapshot: (
    options?:
      | string
      | {
          workspacePath?: string;
          projectPath?: string;
          projectName?: string;
          projectType?: string;
          scopeIntent?: 'workspace' | 'project';
        }
  ) => Promise<IncidentWorkspaceGraphSnapshot>;
  readDoctorEvidenceSummary: (workspacePath?: string) => Promise<
    | {
        healthScoreText: string;
        generatedAt?: string;
        passed?: number;
        warnings?: number;
        errors?: number;
      }
    | undefined
  >;
  resolveIncidentRollbackRuntimePolicy: (input: {
    workspacePath?: string;
    actionPolicy: ReturnType<typeof classifyIncidentActionPolicy>;
    rollbackApprovalToken?: unknown;
  }) => ReturnType<typeof resolveIncidentRollbackRuntimePolicy>;
  attemptIncidentAutoRollback: (
    workspacePath: string,
    baselineEntries: Array<{ path: string; untracked: boolean }> | null,
    rollbackRuntimePolicy: ReturnType<typeof resolveIncidentRollbackRuntimePolicy>
  ) => Promise<{
    attempted: boolean;
    status: 'succeeded' | 'partial' | 'failed' | 'skipped' | 'unavailable';
    reason?: string;
    attemptedAt: string;
    candidateFiles: string[];
    restoredFiles: string[];
    failedFiles: string[];
    suggestedNextStep?: string;
  }>;
  buildIncidentWave2Contracts: (
    input: IncidentWave2ContractsInput
  ) => Promise<IncidentWave2ContractsResult>;
  buildSandboxVerifyCommands: (input: {
    actionType: string;
    inlineQuery: string;
    impactVerifyChecklist: string[];
    conversationId?: string;
    projectType?: string;
    projectPath?: string;
  }) => SandboxVerifyCommand[];
  deriveIncidentVerifyCommandPack: (
    input: Parameters<typeof deriveIncidentVerifyCommandPack>[0]
  ) => ReturnType<typeof deriveIncidentVerifyCommandPack>;
  getUiPreferences: (workspacePath?: string) => {
    incidentAutoLearningPrompt: boolean;
    [key: string]: unknown;
  };
  emitArchitectureReasoningRuntimeEvents: (input: {
    conversationId: string;
    actionId: string;
    actionType: string;
    workspacePath: string;
    framework?: string;
    wave2Contracts: IncidentWave2ContractsResult;
    verifySuccess: boolean;
  }) => void;
  persistIncidentReplayLearning: (input: {
    workspacePath: string;
    packId: string;
    actionType: string;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    likelyFailureMode?: string;
    verifyChecklist: string[];
    blockedReasons: string[];
    relatedFiles: string[];
  }) => Promise<boolean>;
};

export type ChatBrainExecuteActionPayload = Record<string, unknown>;

export async function handleAiChatExecuteAction(
  host: ChatBrainExecuteActionHost,
  data: ChatBrainExecuteActionPayload,
  requestId?: string
): Promise<void> {
  const conversationId = typeof data?.conversationId === 'string' ? data.conversationId : undefined;
  const actionId = typeof data?.actionId === 'string' ? data.actionId : `action-${Date.now()}`;
  const actionType = typeof data?.actionType === 'string' ? data.actionType : '';
  const conv = conversationId ? host.chatBrainConversations.get(conversationId) : undefined;

  if (!actionType) {
    host.postChatBrainWebviewMessage({
      command: 'aiChatError',
      data: {
        conversationId,
        code: 'INVALID_INPUT',
        message: 'Action type is required.',
        retryable: false,
      },
      meta: { requestId, version: 'v1' },
    });
    return;
  }

  if (!conversationId) {
    host.postChatBrainWebviewMessage({
      command: 'aiChatError',
      data: {
        conversationId: '',
        code: 'INVALID_INPUT',
        message: 'conversationId is required.',
        retryable: false,
      },
      meta: { requestId, version: 'v1' },
    });
    return;
  }

  const actionProjectPath =
    typeof data?.projectPath === 'string' && data.projectPath.trim()
      ? data.projectPath.trim()
      : undefined;
  const actionProjectType =
    typeof data?.projectType === 'string' && data.projectType.trim()
      ? data.projectType.trim()
      : undefined;

  if (!isIncidentActionAllowlisted(actionType)) {
    if (conv) {
      host.trackStudioEvent('workspai.studio.abandoned', conv.workspacePath, {
        conversationId,
        actionId,
        actionType,
        reason: 'action_not_allowlisted',
        framework: conv.framework ?? 'unknown',
        projectPath: conv.projectPath,
      });
    }

    host.postChatBrainWebviewMessage({
      command: 'aiChatActionResult',
      data: {
        conversationId,
        actionId,
        success: false,
        outputSummary: `${actionType} blocked by action allowlist policy`,
        verificationRequired: false,
        verifyPolicy: {
          requiresVerifyPath: true,
          requiresImpactReview: true,
          allowCompletionClaimWithoutVerify: false,
        },
      },
      meta: { requestId, version: 'v1' },
    });

    host.postChatBrainWebviewMessage({
      command: 'aiChatError',
      data: {
        conversationId,
        code: 'ACTION_NOT_ALLOWED',
        message: `Action type "${actionType}" is not in the approved allowlist.`,
        retryable: false,
      },
      meta: { requestId, version: 'v1' },
    });
    return;
  }

  const explicitWorkspacePath =
    typeof data?.workspacePath === 'string' && data.workspacePath.trim()
      ? data.workspacePath.trim()
      : undefined;

  if (conv?.workspacePath && explicitWorkspacePath) {
    const sameWorkspace = conv.workspacePath === explicitWorkspacePath;
    const sameHierarchy =
      isWorkspacePathAncestor(conv.workspacePath, explicitWorkspacePath) ||
      isWorkspacePathAncestor(explicitWorkspacePath, conv.workspacePath);

    if (!sameWorkspace && !sameHierarchy) {
      host.postChatBrainWebviewMessage({
        command: 'aiChatError',
        data: {
          conversationId,
          code: 'WORKSPACE_SCOPE_VIOLATION',
          message: 'Action payload workspace does not match the active conversation workspace.',
          retryable: false,
        },
        meta: { requestId, version: 'v1' },
      });
      return;
    }
  }

  const projectPathInPayload = actionProjectPath;

  if (conv?.workspacePath && projectPathInPayload) {
    if (!isWorkspacePathAncestor(conv.workspacePath, projectPathInPayload)) {
      host.postChatBrainWebviewMessage({
        command: 'aiChatError',
        data: {
          conversationId,
          code: 'WORKSPACE_SCOPE_VIOLATION',
          message: 'Action project path is outside the active workspace scope.',
          retryable: false,
        },
        meta: { requestId, version: 'v1' },
      });
      return;
    }
  }

  const actionPolicy = classifyIncidentActionPolicy(actionType);
  const workspacePath = explicitWorkspacePath || conv?.workspacePath;
  const telemetryProjectPath = projectPathInPayload || conv?.projectPath;
  const telemetryScopeProps = telemetryProjectPath ? { projectPath: telemetryProjectPath } : {};
  const shouldAttemptAutoRollback =
    actionPolicy.riskClass === 'guarded-mutating' ||
    actionPolicy.riskClass === 'high-risk-mutating';
  const rollbackBaselineEntries =
    shouldAttemptAutoRollback && workspacePath
      ? await host.readGitDirtyEntries(workspacePath)
      : null;

  if (conv) {
    conv.actionCount += 1;
    conv.phase = 'verify';
    conv.lastActivityAt = Date.now();
    host.chatBrainConversations.set(conversationId, conv);

    host.trackStudioEvent('workspai.studio.action_executed', conv.workspacePath, {
      conversationId,
      actionId,
      actionType,
      actionRiskClass: actionPolicy.riskClass,
      actionRiskLevel: actionPolicy.riskLevel,
      framework: conv.framework ?? 'unknown',
      ...telemetryScopeProps,
      actionCount: conv.actionCount,
      timeToFirstActionMs: Date.now() - conv.startedAt,
    });
  }

  // Tell the Studio the action is starting
  host.postChatBrainWebviewMessage({
    command: 'aiChatActionProgress',
    data: {
      conversationId,
      actionId,
      stage: 'gathering context',
      progress: 20,
      note: `Preparing ${actionType} analysis\u2026`,
    },
    meta: { requestId, version: 'v1' },
  });

  // Build the inline query — no modal opened
  // Derive scope intent: explicit projectPath in action payload or conversation = project scope.
  const actionScopeIntent: 'workspace' | 'project' =
    projectPathInPayload || conv?.projectPath ? 'project' : 'workspace';
  const inlineQuery = await buildInlineQueryFromAction(
    actionType,
    data?.payload as Record<string, unknown> | undefined,
    actionScopeIntent
  );

  host.postChatBrainWebviewMessage({
    command: 'aiChatActionProgress',
    data: {
      conversationId,
      actionId,
      stage: 'streaming',
      progress: 40,
      note: 'Sending to AI\u2026',
    },
    meta: { requestId, version: 'v1' },
  });

  // Route through Chat Brain — answer streams into the Studio thread
  await host.runAiChatQuery(
    {
      conversationId: conversationId ?? '',
      message: inlineQuery,
      workspacePath,
      projectPath: actionProjectPath,
      projectName: data?.projectName,
      projectType: actionProjectType,
      modelId: data?.modelId,
    },
    requestId
  );

  const activeWorkspacePath =
    workspacePath || host.chatBrainConversations.get(conversationId)?.workspacePath;
  const graphSnapshot = await host.getWorkspaceGraphSnapshot({
    workspacePath: activeWorkspacePath,
    projectPath: projectPathInPayload || conv?.projectPath,
    projectName:
      typeof data?.projectName === 'string' && data.projectName.trim()
        ? data.projectName.trim()
        : conv?.projectName,
    projectType:
      typeof data?.projectType === 'string' && data.projectType.trim()
        ? data.projectType.trim()
        : conv?.projectType,
    scopeIntent: actionScopeIntent,
  });
  const doctorEvidence = await host.readDoctorEvidenceSummary(activeWorkspacePath);
  const verifyEvidenceAvailable = Boolean(doctorEvidence);
  const verifyReady = !actionPolicy.requiresVerifyPath || verifyEvidenceAvailable;
  const verifySuccess = verifyReady && (doctorEvidence?.errors ?? 0) === 0;
  const rollbackRuntimePolicy = host.resolveIncidentRollbackRuntimePolicy({
    workspacePath: activeWorkspacePath,
    actionPolicy,
    rollbackApprovalToken: data?.rollbackApproval,
  });
  const rollbackEvidence =
    !verifySuccess && shouldAttemptAutoRollback && activeWorkspacePath
      ? await host.attemptIncidentAutoRollback(
          activeWorkspacePath,
          rollbackBaselineEntries,
          rollbackRuntimePolicy
        )
      : undefined;
  const convAfterQuery = host.chatBrainConversations.get(conversationId);
  const lastResponseText = convAfterQuery?.lastActionResponseText ?? '';
  const explicitScopeFilePaths =
    lastResponseText && activeWorkspacePath
      ? extractPatchesFromAiResponse(lastResponseText, {
          actionId,
          workspacePath: activeWorkspacePath,
        }).map((patch) => patch.relativePath)
      : [];
  const wave2Contracts = await host.buildIncidentWave2Contracts({
    requestId,
    conversationId,
    actionId,
    actionType,
    actionQuery: inlineQuery,
    workspacePath: activeWorkspacePath,
    actionPolicy,
    graphSnapshot,
    doctorEvidence,
    verifyReady,
    verifySuccess,
    rollbackRuntimePolicy,
    explicitScopeFilePaths,
  });
  const releaseGateBlockedReasons = wave2Contracts.releaseGateEvidence.blockedReasons;
  const isMutatingAction =
    actionPolicy.riskClass === 'guarded-mutating' ||
    actionPolicy.riskClass === 'high-risk-mutating';
  const releaseGateCompletionBlocked =
    (isMutatingAction || actionPolicy.requiresImpactReview || actionPolicy.requiresVerifyPath) &&
    releaseGateBlockedReasons.length > 0;
  const unknownScopeMutationBlocked =
    (isMutatingAction || actionPolicy.requiresImpactReview) &&
    wave2Contracts.impactAssessment.blockMutationWhenScopeUnknown &&
    (!wave2Contracts.releaseGateEvidence.scopeKnown ||
      wave2Contracts.impactAssessment.impactScoreContract?.scopeKnown === false);
  const effectiveVerifySuccess = verifySuccess && !releaseGateCompletionBlocked;
  const sandboxEvidence =
    activeWorkspacePath &&
    (actionPolicy.riskClass === 'guarded-mutating' ||
      actionPolicy.riskClass === 'high-risk-mutating')
      ? await runSandboxSimulation({
          workspacePath: activeWorkspacePath,
          actionId,
          riskClass: actionPolicy.riskClass,
          verifyCommands: host.buildSandboxVerifyCommands({
            actionType,
            inlineQuery,
            impactVerifyChecklist: wave2Contracts.impactAssessment.verifyChecklist,
            conversationId,
            projectType: actionProjectType,
            projectPath: actionProjectPath,
          }),
          rollbackHint:
            rollbackEvidence?.suggestedNextStep ||
            'Keep apply blocked until simulation evidence and deterministic verification both pass.',
          defaultTimeoutMs: 20000,
        })
      : undefined;
  const verifyCommandPack = host.deriveIncidentVerifyCommandPack({
    actionType,
    actionPolicy,
    workspacePath: activeWorkspacePath,
    projectPath: actionProjectPath,
    projectType: actionProjectType,
    impactAssessment: wave2Contracts.impactAssessment,
    releaseGateEvidence: wave2Contracts.releaseGateEvidence,
    doctorEvidence,
  });
  const decisionClarityMissingFields: Array<
    'situation' | 'nextStep' | 'verifyPlan' | 'impactScope' | 'rollbackPlan'
  > = [];
  const decisionClaritySituation =
    wave2Contracts.impactAssessment.likelyFailureMode || inlineQuery.trim();
  const primaryVerifyCommand =
    verifyCommandPack.commands.find((entry) => entry.required)?.command ||
    verifyCommandPack.commands[0]?.command;
  const decisionClarityNextStep =
    wave2Contracts.predictiveWarning?.nextSafeAction ||
    (verifyCommandPack.blockedReasons[0]
      ? `Resolve verify blocker: ${verifyCommandPack.blockedReasons[0]}.`
      : undefined) ||
    (primaryVerifyCommand
      ? 'Run the primary verify step and inspect the result before claiming completion.'
      : undefined);
  const hasNextStep = Boolean(decisionClarityNextStep);
  const requiredVerifyCommandCount = verifyCommandPack.commands.filter(
    (entry) => entry.required
  ).length;
  const hasImpactScope = wave2Contracts.impactAssessment.affectedFiles.length > 0;
  // Derive rollback plan: prefer explicit post-execution evidence (rollback step or
  // sandbox simulation), but fall back to a git-revert suggestion from the impact
  // assessment so mutating actions are not blocked on the very first run when no
  // rollback or sandbox has been executed yet.
  const rollbackAffectedFiles = wave2Contracts.impactAssessment.affectedFiles;
  const derivedRollbackPlan =
    rollbackEvidence?.suggestedNextStep ||
    sandboxEvidence?.recommendedRollbackPath ||
    (rollbackAffectedFiles.length > 0
      ? rollbackAffectedFiles.length <= 12
        ? `git checkout -- ${rollbackAffectedFiles
            .map((filePath) => `"${filePath.replace(/"/g, '\\"')}"`)
            .join(' ')}`
        : 'git checkout -- .'
      : undefined);
  const hasRollbackPlan = Boolean(derivedRollbackPlan);
  if (!decisionClaritySituation) {
    decisionClarityMissingFields.push('situation');
  }
  if ((isMutatingAction || actionPolicy.requiresImpactReview) && !hasImpactScope) {
    decisionClarityMissingFields.push('impactScope');
  }
  if ((isMutatingAction || actionPolicy.requiresVerifyPath) && !hasNextStep) {
    decisionClarityMissingFields.push('nextStep');
  }
  if ((isMutatingAction || actionPolicy.requiresVerifyPath) && requiredVerifyCommandCount === 0) {
    decisionClarityMissingFields.push('verifyPlan');
  }
  if ((isMutatingAction || actionPolicy.requiresImpactReview) && !hasRollbackPlan) {
    decisionClarityMissingFields.push('rollbackPlan');
  }
  const decisionClarityCompletionBlocked = decisionClarityMissingFields.length > 0;
  const completionSuccess = effectiveVerifySuccess && !decisionClarityCompletionBlocked;
  const decisionClarityVerifyPlan =
    verifyCommandPack.commands
      .filter((entry) => entry.required)
      .map((entry) => entry.command)
      .filter((command) => typeof command === 'string' && command.trim().length > 0) || [];

  if (conv && actionType === 'verify-pack-autopilot') {
    host.trackStudioEvent('workspai.studio.verify_pack_autopilot_generated', conv.workspacePath, {
      conversationId,
      actionId,
      actionType,
      qualityScore: verifyCommandPack.qualityScore,
      readiness: verifyCommandPack.readiness,
      requiredCommandCount: verifyCommandPack.commands.filter((entry) => entry.required).length,
      blockedReasonCount: verifyCommandPack.blockedReasons.length,
      framework: conv.framework ?? 'unknown',
      ...telemetryScopeProps,
    });

    if (verifyCommandPack.readiness === 'ready') {
      host.trackStudioEvent('workspai.studio.verify_pack_autopilot_ready', conv.workspacePath, {
        conversationId,
        actionId,
        actionType,
        qualityScore: verifyCommandPack.qualityScore,
        requiredCommandCount: verifyCommandPack.commands.filter((entry) => entry.required).length,
        framework: conv.framework ?? 'unknown',
        ...telemetryScopeProps,
      });
    }
  }
  const diagnosisEvidence = buildIncidentDiagnosisEvidence({
    actionPolicy,
    verifyReady,
    verifySuccess: effectiveVerifySuccess,
    doctorEvidence,
    impactAssessment: wave2Contracts.impactAssessment,
    predictiveWarning: wave2Contracts.predictiveWarning,
    contractRuntimeEvidence: wave2Contracts.contractRuntimeEvidence,
    verifyCommandPack,
    graphSnapshot: wave2Contracts.systemGraphSnapshot,
  });
  const decisionClarityImpactScope = Array.from(
    new Set([
      ...wave2Contracts.impactAssessment.affectedFiles,
      ...wave2Contracts.impactAssessment.affectedModules.map(
        (moduleName) => `module:${moduleName}`
      ),
      ...wave2Contracts.impactAssessment.affectedTests.map((testName) => `test:${testName}`),
    ])
  ).slice(0, 8);
  const decisionClarityEvidenceLinks = Array.from(
    new Set([
      ...diagnosisEvidence.signalSources,
      ...(wave2Contracts.predictiveWarning?.telemetrySeed.evidenceSources || []),
    ])
  ).slice(0, 8);
  const decisionClarityContract = {
    situation: decisionClaritySituation || diagnosisEvidence.recommendedFocus || undefined,
    reason:
      wave2Contracts.impactAssessment.rationale[0] ||
      diagnosisEvidence.recommendedFocus ||
      undefined,
    impactScope: decisionClarityImpactScope,
    risk: {
      confidenceBand: diagnosisEvidence.confidenceBand,
      confidence: diagnosisEvidence.confidence,
      mutating: isMutatingAction || actionPolicy.requiresImpactReview,
    },
    nextStep: decisionClarityNextStep,
    verifyPlan:
      decisionClarityVerifyPlan.length > 0
        ? decisionClarityVerifyPlan
        : wave2Contracts.impactAssessment.verifyChecklist,
    rollbackPlan: derivedRollbackPlan,
    evidenceLinks: decisionClarityEvidenceLinks,
    requiredMissingFields: decisionClarityMissingFields,
    mutationReady:
      !decisionClarityCompletionBlocked &&
      !releaseGateCompletionBlocked &&
      !unknownScopeMutationBlocked &&
      effectiveVerifySuccess,
  };
  const incidentReproPackEvidence = buildIncidentReproPackEvidence({
    actionType,
    actionId,
    conversationId,
    workspacePath: activeWorkspacePath,
    verifySuccess: effectiveVerifySuccess,
    conversationHistoryTurns: conv?.history.length ?? 0,
    doctorEvidence,
    rollbackEvidence,
    sandboxEvidence,
    impactAssessment: wave2Contracts.impactAssessment,
    releaseGateEvidence: wave2Contracts.releaseGateEvidence,
    diagnosisEvidence,
  });
  const releaseReadinessCommanderArtifact = buildReleaseReadinessCommanderArtifact({
    actionType,
    actionId,
    workspacePath: activeWorkspacePath,
    confidence: diagnosisEvidence.confidence,
    verifySuccess: effectiveVerifySuccess,
    releaseGateEvidence: wave2Contracts.releaseGateEvidence,
    sandboxEvidence,
    doctorEvidence,
  });
  const memoryInfluenceAuditTimeline = buildMemoryInfluenceAuditTimeline({
    actionId,
    actionType,
    graphSnapshot,
    decisionClarityMissingFields,
    releaseGateBlockedReasons,
    incidentReproPackId: incidentReproPackEvidence?.packId,
    releaseReadinessArtifactId: releaseReadinessCommanderArtifact?.artifactId,
  });

  if (incidentReproPackEvidence) {
    incidentReproPackEvidence.memoryInfluenceAuditTimeline = memoryInfluenceAuditTimeline;
  }

  if (conv && wave2Contracts.predictiveWarning) {
    host.trackStudioEvent('workspai.studio.prediction_shown', conv.workspacePath, {
      conversationId,
      actionId,
      actionType,
      predictionKey: wave2Contracts.predictiveWarning.telemetrySeed.predictionKey,
      confidenceBand: wave2Contracts.predictiveWarning.confidenceBand,
      riskLevel: wave2Contracts.impactAssessment.riskLevel,
      framework: conv.framework ?? 'unknown',
      ...telemetryScopeProps,
    });
  }

  if (conv) {
    if (completionSuccess) {
      conv.verifyPassedAt = Date.now();
      conv.phase = 'learn';
    } else {
      conv.phase = 'verify';
    }
    conv.lastScopeKnown = wave2Contracts.releaseGateEvidence.scopeKnown;
    conv.lastUnknownScopeMutationBlocked = unknownScopeMutationBlocked;
    conv.lastActivityAt = Date.now();
    host.chatBrainConversations.set(conversationId, conv);

    const verifyCompletenessCheck = assessVerifyCompleteness(
      actionPolicy,
      wave2Contracts.impactAssessment.verifyChecklist
    );
    const verifyRequired = actionPolicy.requiresVerifyPath || actionPolicy.requiresImpactReview;
    const verifyPathPresent = verifyCompletenessCheck.adequate;
    const repeatedIncident = conv.repeatedIncidentDetected === true;
    const uiPrefs = host.getUiPreferences();
    const memorySuggestion =
      completionSuccess && uiPrefs.incidentAutoLearningPrompt
        ? buildIncidentMemoryEnrichmentSuggestion({
            verifySuccess: completionSuccess,
            actionType,
            likelyFailureMode: wave2Contracts.impactAssessment.likelyFailureMode,
            verifyChecklist: wave2Contracts.impactAssessment.verifyChecklist,
          })
        : null;
    if (!verifyCompletenessCheck.adequate) {
      host.trackStudioEvent('workspai.studio.verify_incomplete_warning', conv.workspacePath, {
        conversationId,
        actionId,
        actionType,
        reason: verifyCompletenessCheck.reason,
        verifyRequired,
        framework: conv.framework ?? 'unknown',
        ...telemetryScopeProps,
      });
    }

    const diagnosisConfidenceLabel = labelDiagnosisConfidence(
      wave2Contracts.releaseGateEvidence.scopeKnown ? 'known' : 'partial',
      wave2Contracts.impactAssessment.confidence / 100
    );

    host.trackStudioEvent(
      completionSuccess ? 'workspai.studio.verify_passed' : 'workspai.studio.verify_failed',
      conv.workspacePath,
      {
        conversationId,
        actionId,
        actionType,
        verifyReady,
        verifyRequired,
        verifyPathPresent,
        verifyPathReason: verifyCompletenessCheck.reason ?? 'ok',
        repeatedIncident,
        diagnosisConfidenceLabel,
        verifyCompletenessAdequate: verifyCompletenessCheck.adequate,
        decisionClarityCompletionBlocked,
        decisionClarityMissingFieldCount: decisionClarityMissingFields.length,
        unknownScopeMutationBlocked,
        releaseGateCompletionBlocked,
        releaseGateBlockedReasonCount: releaseGateBlockedReasons.length,
        framework: conv.framework ?? 'unknown',
        ...telemetryScopeProps,
        errors: doctorEvidence?.errors ?? 0,
        warnings: doctorEvidence?.warnings ?? 0,
        passed: doctorEvidence?.passed ?? 0,
      }
    );

    if (completionSuccess) {
      host.trackStudioEvent(
        'workspai.studio.verified_outcome_ready_for_artifact',
        conv.workspacePath,
        {
          conversationId,
          actionId,
          actionType,
          framework: conv.framework ?? 'unknown',
          outcomeContractVersion: 'v2',
          verifyRequired,
          verifyPathPresent,
          repeatedIncident,
          verifyChecklistCount: wave2Contracts.impactAssessment.verifyChecklist.length,
          blockedReasonCount: wave2Contracts.releaseGateEvidence.blockedReasons.length,
          affectedFilesCount: wave2Contracts.impactAssessment.affectedFiles.length,
          releaseGateBlocked: releaseGateCompletionBlocked,
          memorySuggestionReady: Boolean(memorySuggestion),
          replayReady: Boolean(incidentReproPackEvidence),
          ...telemetryScopeProps,
        }
      );
    }

    if (wave2Contracts.predictiveWarning) {
      host.trackStudioEvent(
        completionSuccess
          ? 'workspai.studio.prediction_falsified'
          : 'workspai.studio.prediction_verified',
        conv.workspacePath,
        {
          conversationId,
          actionId,
          actionType,
          predictionKey: wave2Contracts.predictiveWarning.telemetrySeed.predictionKey,
          warningId: wave2Contracts.predictiveWarning.warningId,
          verifySuccess: completionSuccess,
          framework: conv.framework ?? 'unknown',
          ...telemetryScopeProps,
        }
      );
    }

    host.emitArchitectureReasoningRuntimeEvents({
      conversationId,
      actionId,
      actionType,
      workspacePath: conv.workspacePath ?? activeWorkspacePath ?? '',
      framework: conv.framework,
      wave2Contracts,
      verifySuccess: completionSuccess,
    });

    if (incidentReproPackEvidence) {
      host.trackStudioEvent('workspai.studio.incident_repro_pack_captured', conv.workspacePath, {
        conversationId,
        actionId,
        actionType,
        packId: incidentReproPackEvidence.packId,
        redactionApplied: incidentReproPackEvidence.redaction.applied,
        verifySuccess,
        framework: conv.framework ?? 'unknown',
        ...telemetryScopeProps,
      });

      host.trackStudioEvent('workspai.studio.incident_replay_ready', conv.workspacePath, {
        conversationId,
        actionId,
        actionType,
        packId: incidentReproPackEvidence.packId,
        blockedReasonCount: incidentReproPackEvidence.summary.blockedReasonCount,
        verifyChecklistCount: incidentReproPackEvidence.replayPayload.verifyChecklist.length,
        framework: conv.framework ?? 'unknown',
        ...telemetryScopeProps,
      });
    }

    if (completionSuccess && conv.importedIncidentReplay && conv.workspacePath) {
      const replayMemorySaved = await host.persistIncidentReplayLearning({
        workspacePath: conv.workspacePath,
        packId: conv.importedIncidentReplay.packId,
        actionType: conv.importedIncidentReplay.actionType,
        riskLevel: conv.importedIncidentReplay.riskLevel,
        likelyFailureMode:
          wave2Contracts.impactAssessment.likelyFailureMode ||
          conv.importedIncidentReplay.likelyFailureMode,
        verifyChecklist:
          wave2Contracts.impactAssessment.verifyChecklist.length > 0
            ? wave2Contracts.impactAssessment.verifyChecklist
            : conv.importedIncidentReplay.verifyChecklist,
        blockedReasons:
          wave2Contracts.releaseGateEvidence.blockedReasons.length > 0
            ? wave2Contracts.releaseGateEvidence.blockedReasons
            : conv.importedIncidentReplay.blockedReasons,
        relatedFiles:
          wave2Contracts.impactAssessment.affectedFiles.length > 0
            ? wave2Contracts.impactAssessment.affectedFiles
            : conv.importedIncidentReplay.relatedFiles,
      });

      if (replayMemorySaved) {
        host.trackStudioEvent(
          'workspai.studio.incident_replay_memory_enriched',
          conv.workspacePath,
          {
            conversationId,
            actionId,
            actionType,
            packId: conv.importedIncidentReplay.packId,
            framework: conv.framework ?? 'unknown',
            ...telemetryScopeProps,
          }
        );
      }

      delete conv.importedIncidentReplay;
      host.chatBrainConversations.set(conversationId, conv);
    } else if (completionSuccess && conv.workspacePath) {
      // Non-imported verified outcomes should also enrich team-reuse memory.
      // Without this, reuse enrichment is biased toward imported replay flows only.
      const replayMemorySaved = await host.persistIncidentReplayLearning({
        workspacePath: conv.workspacePath,
        packId: incidentReproPackEvidence?.packId || `verified-outcome-${actionId}`,
        actionType,
        riskLevel: wave2Contracts.impactAssessment.riskLevel,
        likelyFailureMode: wave2Contracts.impactAssessment.likelyFailureMode,
        verifyChecklist: wave2Contracts.impactAssessment.verifyChecklist,
        blockedReasons: wave2Contracts.releaseGateEvidence.blockedReasons,
        relatedFiles: wave2Contracts.impactAssessment.affectedFiles,
      });

      if (replayMemorySaved) {
        host.trackStudioEvent(
          'workspai.studio.incident_replay_memory_enriched',
          conv.workspacePath,
          {
            conversationId,
            actionId,
            actionType,
            packId: incidentReproPackEvidence?.packId || `verified-outcome-${actionId}`,
            framework: conv.framework ?? 'unknown',
            source: 'verified_outcome',
            ...telemetryScopeProps,
          }
        );
      }
    }

    if (rollbackEvidence?.attempted) {
      const rollbackRecoveryClass =
        rollbackEvidence.status === 'succeeded'
          ? 'full'
          : rollbackEvidence.restoredFiles.length > 0
            ? 'partial'
            : 'none';
      host.trackStudioEvent('workspai.studio.rollback_attempted', conv.workspacePath, {
        conversationId,
        actionId,
        actionType,
        rollbackStatus: rollbackEvidence.status,
        recoveryClass: rollbackRecoveryClass,
        verifyFailureRecovered: !completionSuccess && rollbackEvidence.status === 'succeeded',
        restoredCount: rollbackEvidence.restoredFiles.length,
        failedCount: rollbackEvidence.failedFiles.length,
        framework: conv.framework ?? 'unknown',
        ...telemetryScopeProps,
      });

      host.trackStudioEvent(
        rollbackEvidence.status === 'succeeded'
          ? 'workspai.studio.rollback_succeeded'
          : 'workspai.studio.rollback_failed',
        conv.workspacePath,
        {
          conversationId,
          actionId,
          actionType,
          rollbackStatus: rollbackEvidence.status,
          recoveryClass: rollbackRecoveryClass,
          verifyFailureRecovered: !completionSuccess && rollbackEvidence.status === 'succeeded',
          restoredCount: rollbackEvidence.restoredFiles.length,
          failedCount: rollbackEvidence.failedFiles.length,
          framework: conv.framework ?? 'unknown',
          ...telemetryScopeProps,
        }
      );
    }

    if (completionSuccess && uiPrefs.incidentAutoLearningPrompt) {
      if (!memorySuggestion) {
        return;
      }

      host.trackStudioEvent('workspai.studio.outcome_memory_suggestion_ready', conv.workspacePath, {
        conversationId,
        actionId,
        actionType,
        verifyChecklistCount: wave2Contracts.impactAssessment.verifyChecklist.length,
        framework: conv.framework ?? 'unknown',
        ...telemetryScopeProps,
      });

      host.postChatBrainWebviewMessage({
        command: 'aiChatSuggestedQuestions',
        data: {
          conversationId,
          messageId: `learn-${Date.now()}`,
          questions: memorySuggestion.questions,
        },
        meta: { requestId, version: 'v1' },
      });

      host.postChatBrainWebviewMessage({
        command: 'aiChatActionBoard',
        data: {
          conversationId,
          messageId: `learn-board-${Date.now()}`,
          board: {
            id: `learn-board-${Date.now()}`,
            type: 'learning',
            title: memorySuggestion.title,
            summary: memorySuggestion.summary,
            data: {
              route: 'workspace-memory-wizard',
              confidence: 90,
            },
            actions: [
              {
                id: `learn-action-${Date.now()}`,
                label: memorySuggestion.primaryActionLabel,
                actionType: 'workspace-memory-wizard',
                riskLevel: 'low',
              },
            ],
          },
        },
        meta: { requestId, version: 'v1' },
      });
    }
  }

  // ── Multi-file patch extraction (A02 / A03) ────────────────────────────────
  let multiFilePatchResult: MultiFilePatchResult | undefined;
  const isPatchAction = actionType === 'apply-module-gen' || actionType === 'apply-debug-patch';
  if (isPatchAction && activeWorkspacePath) {
    const convAfterQuery = host.chatBrainConversations.get(conversationId);
    const lastResponseText = convAfterQuery?.lastActionResponseText ?? '';

    if (lastResponseText) {
      const rawPatches = extractPatchesFromAiResponse(lastResponseText, {
        actionId,
        workspacePath: activeWorkspacePath,
      });

      if (rawPatches.length > 0) {
        // For A03 (apply-debug-patch), only auto-apply when sandboxEvidence says safeToApply.
        // For A02 (apply-module-gen), send patches as 'pending' for user to review.
        const shouldAutoApply =
          actionType === 'apply-debug-patch' &&
          !unknownScopeMutationBlocked &&
          !releaseGateCompletionBlocked &&
          !decisionClarityCompletionBlocked &&
          sandboxEvidence?.safeToApply === true &&
          actionPolicy.riskClass !== 'high-risk-mutating';

        if (shouldAutoApply) {
          multiFilePatchResult = await applyPatches({
            actionId,
            workspacePath: activeWorkspacePath,
            patches: rawPatches,
            branchSafeApply: true,
            verificationPassed: sandboxEvidence?.status === 'passed',
            verificationNote: sandboxEvidence?.reason,
          });
        } else {
          // Return patches as 'pending' — user applies/rejects via UI
          multiFilePatchResult = {
            patchId: `patch-${actionId}-${Date.now().toString(36)}`,
            generatedAt: new Date().toISOString(),
            actionId,
            patches: rawPatches.map((p) => ({ ...p, status: 'pending' as const })),
            appliedCount: 0,
            rejectedCount: 0,
            failedCount: 0,
          };
        }

        await WorkspaceUsageTracker.getInstance().trackCommandEvent(
          'workspai.patch.extracted',
          activeWorkspacePath,
          {
            actionId,
            actionType,
            patchCount: rawPatches.length,
            autoApplied: shouldAutoApply,
          }
        );
      }
    }
  }

  // Mark action resolved (stream already showed the result)
  host.postChatBrainWebviewMessage({
    command: 'aiChatActionResult',
    data: {
      conversationId,
      actionId,
      success: completionSuccess,
      outputSummary: releaseGateCompletionBlocked
        ? `${actionType} - blocked by release gate: ${
            releaseGateBlockedReasons[0] ||
            'verify, scope, and rollback requirements are not satisfied'
          }`
        : decisionClarityCompletionBlocked
          ? `${actionType} - blocked by decision clarity contract: ${decisionClarityMissingFields[0] || 'required fields are missing'}`
          : completionSuccess
            ? `${actionType} \u2014 result shown in conversation above`
            : rollbackEvidence
              ? `${actionType} \u2014 verification failed; rollback status: ${rollbackEvidence.status}`
              : verifyReady
                ? `${actionType} \u2014 verification failed; review output and retry safely`
                : `${actionType} \u2014 verification required before completion claim`,
      verificationRequired: !verifyReady || decisionClarityCompletionBlocked,
      verifyPolicy: {
        requiresVerifyPath: actionPolicy.requiresVerifyPath,
        requiresImpactReview: actionPolicy.requiresImpactReview,
        allowCompletionClaimWithoutVerify: actionPolicy.allowCompletionClaimWithoutVerify,
      },
      evidence: doctorEvidence
        ? {
            source: 'doctor-last-run',
            ...doctorEvidence,
          }
        : undefined,
      diagnosis: diagnosisEvidence,
      rollback: rollbackEvidence,
      sandboxSimulation: sandboxEvidence,
      incidentReproPack: incidentReproPackEvidence,
      releaseReadinessCommander: releaseReadinessCommanderArtifact,
      memoryInfluenceAuditTimeline,
      multiFilePatch: multiFilePatchResult,
      systemGraphSnapshot: wave2Contracts.systemGraphSnapshot,
      impactAssessment: wave2Contracts.impactAssessment,
      predictiveWarning: wave2Contracts.predictiveWarning,
      releaseGateEvidence: wave2Contracts.releaseGateEvidence,
      contractRuntimeEvidence: wave2Contracts.contractRuntimeEvidence,
      verifyCommandPack,
      decisionClarity: decisionClarityContract,
      phase: conv?.phase,
    },
    meta: { requestId, version: 'v1' },
  });
}

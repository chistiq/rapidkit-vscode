import {
  indexProjectSystemGraph,
  queryProjectSystemGraphImpact,
  scoreSystemGraphImpactDeterministic,
  buildImpactScoreContractV1,
  type ImpactScoreContractV1,
} from '../../core/systemGraphIndexer';
import { evaluateIncidentC07Gates } from '../../core/incidentC07Integration';
import {
  boostConfidenceForResolvedScope,
  filterScopeBlockedReasons,
  resolveIncidentScopeEvidence,
  resolveScopeSeedFilePaths,
} from '../../core/incidentStudioScopeEvidence';
import {
  evaluateWorkspaiContractRuntime,
  type WorkspaiContractRuntimeEvidence,
} from '../../core/workspaiContractRuntime';
import { readWorkspaceImpactReport } from '../../core/workspaceImpactReader';
import { WorkspaceUsageTracker } from '../../utils/workspaceUsageTracker';
import { buildIncidentPredictiveWarning } from './incidentPredictiveWarning';
import {
  assessVerifyCompleteness,
  type classifyIncidentActionPolicy,
} from './incidentStudioPromptPolicy';
import type { IncidentWorkspaceGraphSnapshot } from './welcomePanel.shared.js';

type IncidentActionPolicy = ReturnType<typeof classifyIncidentActionPolicy>;

export type IncidentWave2ContractsInput = {
  requestId?: string;
  conversationId?: string;
  actionId: string;
  actionType: string;
  actionQuery?: string;
  workspacePath?: string;
  resolveFallbackWorkspacePath?: () => string | undefined;
  actionPolicy: IncidentActionPolicy;
  graphSnapshot: IncidentWorkspaceGraphSnapshot;
  doctorEvidence?: {
    healthScoreText: string;
    generatedAt?: string;
    passed?: number;
    warnings?: number;
    errors?: number;
  };
  verifyReady: boolean;
  verifySuccess: boolean;
  rollbackRuntimePolicy?: {
    approvalMode: 'never' | 'high-risk-only' | 'mutating-only' | 'always';
    requiresManualApproval: boolean;
    approvedByUser: boolean;
    protectedPathPrefixes: string[];
  };
  explicitScopeFilePaths?: string[];
};

export type IncidentWave2ContractsResult = {
  systemGraphSnapshot: {
    requestId?: string;
    workspacePath: string;
    projectPath?: string;
    graphVersion: string;
    nodes: Array<{
      id: string;
      type:
        | 'route'
        | 'controller'
        | 'service'
        | 'model'
        | 'datastore'
        | 'test'
        | 'infra-service'
        | 'db-schema';
      label: string;
      filePath?: string;
      confidence: number;
    }>;
    edges: Array<{
      sourceId: string;
      targetId: string;
      relation: string;
    }>;
    summary: {
      nodeCount: number;
      edgeCount: number;
      supportedTopology: string;
    };
  };
  impactAssessment: {
    requestId?: string;
    source: string[];
    confidence: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    affectedFiles: string[];
    affectedModules: string[];
    affectedTests: string[];
    impactScoreContract: ImpactScoreContractV1;
    likelyFailureMode?: string;
    rationale: string[];
    verifyChecklist: string[];
    blockMutationWhenScopeUnknown: boolean;
  };
  predictiveWarning?: {
    requestId?: string;
    warningId: string;
    confidenceBand: 'low' | 'medium' | 'high';
    predictedFailure?: string;
    affectedScopeSummary?: string;
    nextSafeAction?: string;
    verifyChecklist: string[];
    telemetrySeed: {
      predictionKey: string;
      evidenceSources: string[];
    };
  };
  releaseGateEvidence: {
    requestId?: string;
    scopeKnown: boolean;
    verifyPathPresent: boolean;
    rollbackPathPresent: boolean;
    confidenceSufficient: boolean;
    blockedReasons: string[];
  };
  architectureTelemetry: {
    warningCount: number;
    warnings: string[];
    unknownScopeBlocked: boolean;
  };
  contractRuntimeEvidence: WorkspaiContractRuntimeEvidence;
};

export async function buildIncidentWave2Contracts(
  input: IncidentWave2ContractsInput
): Promise<IncidentWave2ContractsResult> {
  const workspacePath =
    input.workspacePath ||
    input.graphSnapshot.workspace.path ||
    input.resolveFallbackWorkspacePath?.() ||
    '';
  const selectedProjectPath = input.graphSnapshot.project.selectedProject?.path;
  const indexedGraph = await indexProjectSystemGraph({
    workspacePath,
    projectPath: selectedProjectPath || undefined,
    framework: input.graphSnapshot.project.framework,
    kit: input.graphSnapshot.project.kit,
  });
  const predictionKpiStatus = workspacePath
    ? await WorkspaceUsageTracker.getInstance().getStudioPredictionKpiStatus(workspacePath)
    : null;

  const moduleSeeds =
    indexedGraph.topModules.length > 0
      ? indexedGraph.topModules.slice(0, 4)
      : input.graphSnapshot.topology.topModules.slice(0, 4);
  const actionSeedTokens = input.actionType
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3)
    .slice(0, 3);
  const scopeSeedFilePaths = resolveScopeSeedFilePaths({
    selectedProjectPath,
    explicitScopeFilePaths: input.explicitScopeFilePaths ?? [],
  });
  const impactQuery = queryProjectSystemGraphImpact(indexedGraph, {
    seedFilePaths: scopeSeedFilePaths,
    seedModules: Array.from(new Set([...moduleSeeds, ...actionSeedTokens])),
    maxDepth: 2,
    maxNodes: 36,
  });
  const deterministicScore = scoreSystemGraphImpactDeterministic({
    impactQuery,
    graphSnapshot: indexedGraph,
    doctorErrors: input.doctorEvidence?.errors ?? 0,
    doctorWarnings: input.doctorEvidence?.warnings ?? 0,
    requiresImpactReview: input.actionPolicy.requiresImpactReview,
    requiresVerifyPath: input.actionPolicy.requiresVerifyPath,
    riskClass: input.actionPolicy.riskClass,
  });
  const workspaceImpactReport = workspacePath
    ? await readWorkspaceImpactReport(workspacePath)
    : null;
  let impactScoreContract = buildImpactScoreContractV1({
    impactQuery,
    scoring: deterministicScore,
    graphSnapshot: indexedGraph,
    generatedAt: new Date().toISOString(),
  });

  const nodes: Array<{
    id: string;
    type:
      | 'route'
      | 'controller'
      | 'service'
      | 'model'
      | 'datastore'
      | 'test'
      | 'infra-service'
      | 'db-schema';
    label: string;
    filePath?: string;
    confidence: number;
    symbolName?: string;
    startLine?: number;
  }> =
    indexedGraph.nodes.length > 0
      ? indexedGraph.nodes.map((node) => ({
          id: node.id,
          type: node.type,
          label: node.label,
          filePath: node.filePath,
          confidence: node.confidence,
          symbolName: node.symbolName,
          startLine: node.startLine,
        }))
      : moduleSeeds.map((moduleName) => ({
          id: `service:${moduleName}`,
          type: 'service',
          label: `${moduleName} service`,
          filePath: `src/${moduleName}`,
          confidence: 70,
        }));

  const edges: Array<{
    sourceId: string;
    targetId: string;
    relation: string;
  }> =
    indexedGraph.edges.length > 0
      ? indexedGraph.edges.map((edge) => ({
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          relation: edge.relation,
        }))
      : [];

  if (
    selectedProjectPath &&
    nodes.length > 0 &&
    !nodes.some((node) => node.type === 'route' || node.type === 'controller')
  ) {
    nodes.unshift({
      id: 'route:entry',
      type: 'route',
      label: 'project entry route',
      filePath: selectedProjectPath,
      confidence: 65,
    });
    edges.push({
      sourceId: 'route:entry',
      targetId: nodes[1].id,
      relation: 'calls',
    });
  }

  if (edges.length === 0) {
    for (let index = 0; index < moduleSeeds.length - 1; index += 1) {
      edges.push({
        sourceId: `service:${moduleSeeds[index]}`,
        targetId: `service:${moduleSeeds[index + 1]}`,
        relation: 'depends-on',
      });
    }
  }

  const contractRuntimeEvidence = await evaluateWorkspaiContractRuntime({
    workspacePath,
    projectPath: selectedProjectPath,
  });

  const sources = ['graph'];
  if (input.graphSnapshot.evidence.hasDoctorEvidence) {
    sources.push('doctor');
  }
  if (input.graphSnapshot.evidence.hasGitDiff) {
    sources.push('runtime');
  }
  if (selectedProjectPath) {
    sources.push('selection');
  }
  if (contractRuntimeEvidence.evaluated) {
    sources.push('contracts');
  }

  const affectedModules =
    impactQuery.impactedModules.length > 0
      ? impactQuery.impactedModules.slice(0, 3)
      : moduleSeeds.slice(0, 3);
  const affectedFilesFromGraph =
    impactQuery.impactedNodes.length > 0
      ? impactQuery.impactedNodes
          .map((node) => node.filePath)
          .filter(
            (filePath): filePath is string => typeof filePath === 'string' && filePath.length > 0
          )
          .slice(0, 8)
      : nodes
          .map((node) => node.filePath)
          .filter(
            (filePath): filePath is string => typeof filePath === 'string' && filePath.length > 0
          )
          .slice(0, 8);
  const affectedFiles = Array.from(
    new Set([
      ...(selectedProjectPath ? [selectedProjectPath] : []),
      ...affectedFilesFromGraph,
      ...affectedModules.map((moduleName) => `src/${moduleName}`),
    ])
  );
  const affectedTests = Array.from(
    new Set([
      ...impactQuery.candidateTests.slice(0, 4),
      ...nodes
        .filter((node) => node.type === 'test' && typeof node.filePath === 'string')
        .map((node) => node.filePath as string)
        .slice(0, 4),
      ...affectedModules.map((moduleName) => `tests/${moduleName}.spec.ts`),
    ])
  );

  const likelyFailureMode =
    deterministicScore.likelyFailureMode ||
    ((input.doctorEvidence?.errors ?? 0) > 0
      ? `${input.doctorEvidence?.errors} doctor error(s) indicate unresolved runtime risk.`
      : input.actionPolicy.requiresImpactReview
        ? 'Mutation may break downstream modules if applied without impact review.'
        : undefined);

  const verifyChecklist: string[] = [];
  if (input.actionPolicy.requiresImpactReview) {
    verifyChecklist.push('Run change-impact-lite and review affected modules before apply.');
  }
  if (input.actionPolicy.requiresVerifyPath) {
    verifyChecklist.push('Run deterministic verify command and capture output evidence.');
  }
  if ((input.doctorEvidence?.errors ?? 0) > 0) {
    verifyChecklist.push(
      `Resolve ${input.doctorEvidence?.errors} doctor error(s) before completion claim.`
    );
  }
  if (verifyChecklist.length === 0) {
    verifyChecklist.push('No blocking verify checks detected for this action class.');
  }
  if (impactQuery.unknownScope && input.actionPolicy.requiresImpactReview) {
    verifyChecklist.push(
      'Scope is uncertain. Ask for clarification before mutation recommendation.'
    );
  }
  if (deterministicScore.architectureWarnings.length > 0) {
    verifyChecklist.push(
      `Architecture warning: ${deterministicScore.architectureWarnings[0]}. Run focused impact review before apply.`
    );
  }
  if (contractRuntimeEvidence.errors.length > 0) {
    verifyChecklist.push(
      `Fix Workspai contract errors before apply: ${contractRuntimeEvidence.errors[0]}`
    );
  }
  if (contractRuntimeEvidence.warnings.length > 0) {
    verifyChecklist.push(
      `Review Workspai contract warnings: ${contractRuntimeEvidence.warnings[0]}`
    );
  }
  if (!contractRuntimeEvidence.evaluated && input.actionPolicy.requiresImpactReview) {
    verifyChecklist.push(
      'No C06 Workspai contracts found. Add architecture.config, project.mapping, and execution.policy for stronger architecture control.'
    );
  }

  const c07GateEvaluation = await evaluateIncidentC07Gates({
    workspacePath,
    projectPath: selectedProjectPath,
    actionType: input.actionType,
    actionPolicy: {
      riskClass: input.actionPolicy.riskClass,
      riskLevel: input.actionPolicy.riskLevel,
      requiresImpactReview: input.actionPolicy.requiresImpactReview,
      requiresVerifyPath: input.actionPolicy.requiresVerifyPath,
    },
    verifyReady: input.verifyReady,
    verifySuccess: input.verifySuccess,
    verifyChecklist,
    doctorErrors: input.doctorEvidence?.errors ?? 0,
    rollbackApproved:
      !input.rollbackRuntimePolicy?.requiresManualApproval ||
      input.rollbackRuntimePolicy.approvedByUser,
  });

  if (c07GateEvaluation.scopeBlocked) {
    verifyChecklist.push('C07 gate blocked mutation: architecture scope is uncertain.');
  }

  const scopeEvidence = resolveIncidentScopeEvidence({
    requiresImpactReview: input.actionPolicy.requiresImpactReview,
    graphScopeKnown: deterministicScore.scopeKnown,
    c07ScopeBlocked: c07GateEvaluation.scopeBlocked,
    affectedFiles,
    affectedModules,
    affectedTests,
    explicitScopeFilePaths: input.explicitScopeFilePaths ?? [],
    selectedProjectPath,
    workspaceImpactReport,
    actionType: input.actionType,
  });

  if (scopeEvidence.supplementalAffectedFiles.length > 0) {
    for (const filePath of scopeEvidence.supplementalAffectedFiles) {
      if (!affectedFiles.includes(filePath)) {
        affectedFiles.push(filePath);
      }
    }
  }

  const scopeKnown = scopeEvidence.scopeKnown;
  const confidence = boostConfidenceForResolvedScope(
    Math.max(0, Math.min(100, deterministicScore.confidence)),
    scopeEvidence,
    input.actionPolicy.requiresImpactReview
  );

  if (scopeKnown && !impactScoreContract.scopeKnown) {
    impactScoreContract = {
      ...impactScoreContract,
      scopeKnown: true,
      confidence,
      blockedReasons: filterScopeBlockedReasons(impactScoreContract.blockedReasons, scopeEvidence),
    };
  }

  if (scopeKnown && scopeEvidence.useNpmImpactReview) {
    sources.push('npm-impact');
    const impactReviewIndex = verifyChecklist.findIndex((item) => /change-impact-lite/i.test(item));
    if (impactReviewIndex >= 0) {
      verifyChecklist[impactReviewIndex] =
        'Review workspace-impact-last-run.json npm blast-radius evidence before apply.';
    }
  }

  const verifyCompletenessCheck = assessVerifyCompleteness(input.actionPolicy, verifyChecklist);
  const verifyPathPresent = verifyCompletenessCheck.adequate;
  const rollbackPathPresent =
    (input.actionPolicy.riskClass === 'informational' ||
      input.actionPolicy.riskClass === 'non-mutating-executable' ||
      input.verifyReady) &&
    (!input.rollbackRuntimePolicy?.requiresManualApproval ||
      input.rollbackRuntimePolicy.approvedByUser);
  const confidenceSufficient = confidence >= (input.actionPolicy.requiresImpactReview ? 60 : 50);

  const blockedReasons: string[] = [];
  if (input.actionPolicy.requiresImpactReview && !scopeKnown) {
    blockedReasons.push('Affected scope is unknown while impact review is required.');
  }
  if (input.actionPolicy.requiresVerifyPath && !input.verifyReady) {
    blockedReasons.push('Verification evidence is missing for a verify-first action.');
  }
  if (
    input.actionPolicy.requiresVerifyPath &&
    !verifyPathPresent &&
    verifyCompletenessCheck.reason
  ) {
    blockedReasons.push(verifyCompletenessCheck.reason);
  }
  if (!rollbackPathPresent) {
    if (
      input.rollbackRuntimePolicy?.requiresManualApproval &&
      !input.rollbackRuntimePolicy.approvedByUser
    ) {
      blockedReasons.push(
        `Rollback policy (${input.rollbackRuntimePolicy.approvalMode}) requires manual approval before auto-restore can run.`
      );
    } else {
      blockedReasons.push('Rollback path is unavailable for this risk class.');
    }
  }
  if (!confidenceSufficient) {
    blockedReasons.push('Impact confidence is below release-safe threshold.');
  }
  if (!input.verifySuccess && (input.doctorEvidence?.errors ?? 0) > 0) {
    blockedReasons.push(`${input.doctorEvidence?.errors} doctor error(s) remain unresolved.`);
  }
  blockedReasons.push(...contractRuntimeEvidence.errors);
  blockedReasons.push(
    ...filterScopeBlockedReasons(deterministicScore.blockedReasons, scopeEvidence)
  );
  blockedReasons.push(...c07GateEvaluation.blockedReasons);

  const dedupedBlockedReasons = Array.from(
    new Set(
      filterScopeBlockedReasons(blockedReasons, scopeEvidence).filter(
        (reason) => reason.trim().length > 0
      )
    )
  );

  const architectureWarnings = Array.from(
    new Set(
      [
        ...contractRuntimeEvidence.warnings,
        ...(contractRuntimeEvidence.evaluated ? [contractRuntimeEvidence.summary] : []),
        ...deterministicScore.architectureWarnings,
        ...(c07GateEvaluation.scopeBlocked
          ? ['C07 gate blocked mutation due to uncertain architecture scope.']
          : []),
      ]
        .filter((warning) => typeof warning === 'string' && warning.trim().length > 0)
        .map((warning) => warning.trim())
    )
  );
  const unknownScopeBlocked =
    c07GateEvaluation.scopeBlocked ||
    (!scopeKnown &&
      dedupedBlockedReasons.some((reason) => /scope is unknown|scope is uncertain/i.test(reason)));

  const predictiveWarningNeeded =
    input.actionPolicy.requiresImpactReview || (input.doctorEvidence?.errors ?? 0) > 0;
  const warningId = `${input.conversationId || 'conv'}:${input.actionId}:prediction`;
  const predictionKey = `${input.actionType}:${warningId}`;
  const predictiveWarning = predictiveWarningNeeded
    ? buildIncidentPredictiveWarning({
        impactAssessment: {
          confidence,
          riskLevel: deterministicScore.riskLevel,
          affectedFiles,
          affectedModules,
          affectedTests,
          likelyFailureMode,
          rationale: [
            'Impact is derived from workspace graph topology and doctor/runtime evidence.',
            input.actionPolicy.requiresImpactReview
              ? 'Action policy requires impact review before completion claim.'
              : 'Action policy allows lower-risk execution path.',
            ...(c07GateEvaluation.evaluated
              ? [
                  c07GateEvaluation.scopeBlocked
                    ? 'C07 architecture gates blocked mutation due to uncertain mapping scope.'
                    : 'C07 architecture gates passed for the current action path.',
                ]
              : []),
            ...deterministicScore.architectureWarnings.slice(0, 2),
            ...deterministicScore.rationale.slice(0, 3),
          ],
          verifyChecklist,
        },
        actionPolicy: input.actionPolicy,
        doctorEvidence: input.doctorEvidence,
        graphSummary: {
          nodeCount: nodes.length,
          edgeCount: edges.length,
          supportedTopology:
            indexedGraph.supportedTopology ||
            input.graphSnapshot.project.kit ||
            input.graphSnapshot.project.framework,
        },
        evidenceSources: sources,
        telemetryStatus: predictionKpiStatus,
        verifyReady: input.verifyReady,
        verifySuccess: input.verifySuccess,
        signalContext: {
          actionType: input.actionType,
          queryText: input.actionQuery,
        },
      })
    : null;

  return {
    systemGraphSnapshot: {
      requestId: input.requestId,
      workspacePath,
      projectPath: selectedProjectPath,
      graphVersion: input.graphSnapshot.snapshotVersion || 'v1',
      nodes,
      edges,
      summary: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        supportedTopology:
          indexedGraph.supportedTopology ||
          input.graphSnapshot.project.kit ||
          input.graphSnapshot.project.framework,
      },
    },
    impactAssessment: {
      requestId: input.requestId,
      source: sources,
      confidence,
      riskLevel: deterministicScore.riskLevel,
      affectedFiles,
      affectedModules,
      affectedTests,
      impactScoreContract,
      likelyFailureMode,
      rationale: [
        'Impact is derived from workspace graph topology and doctor/runtime evidence.',
        ...(contractRuntimeEvidence.evaluated ? [contractRuntimeEvidence.summary] : []),
        input.actionPolicy.requiresImpactReview
          ? 'Action policy requires impact review before completion claim.'
          : 'Action policy allows lower-risk execution path.',
        ...(c07GateEvaluation.evaluated
          ? [
              c07GateEvaluation.scopeBlocked
                ? 'C07 architecture gates blocked mutation due to uncertain mapping scope.'
                : 'C07 architecture gates passed for the current action path.',
            ]
          : []),
        ...deterministicScore.architectureWarnings.slice(0, 2),
        ...deterministicScore.rationale.slice(0, 3),
      ],
      verifyChecklist,
      blockMutationWhenScopeUnknown:
        input.actionPolicy.requiresImpactReview ||
        input.actionPolicy.requiresVerifyPath ||
        c07GateEvaluation.scopeBlocked,
    },
    predictiveWarning: predictiveWarning
      ? {
          requestId: input.requestId,
          warningId,
          confidenceBand: predictiveWarning.confidenceBand,
          predictedFailure: predictiveWarning.predictedFailure,
          affectedScopeSummary: predictiveWarning.affectedScopeSummary,
          nextSafeAction: predictiveWarning.nextSafeAction,
          verifyChecklist: predictiveWarning.verifyChecklist,
          telemetrySeed: {
            predictionKey,
            evidenceSources: predictiveWarning.evidenceSources,
          },
        }
      : undefined,
    releaseGateEvidence: {
      requestId: input.requestId,
      scopeKnown,
      verifyPathPresent,
      rollbackPathPresent,
      confidenceSufficient,
      blockedReasons: dedupedBlockedReasons,
    },
    architectureTelemetry: {
      warningCount: architectureWarnings.length,
      warnings: architectureWarnings.slice(0, 4),
      unknownScopeBlocked,
    },
    contractRuntimeEvidence,
  };
}

export async function buildIncidentWave2ContractsWithFallback(
  input: IncidentWave2ContractsInput,
  resolveFallbackWorkspacePath: () => string | undefined
): Promise<IncidentWave2ContractsResult> {
  return buildIncidentWave2Contracts({
    ...input,
    resolveFallbackWorkspacePath:
      input.resolveFallbackWorkspacePath ?? resolveFallbackWorkspacePath,
  });
}

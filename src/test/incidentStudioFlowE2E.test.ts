import { describe, expect, it } from 'vitest';

import {
  buildIncidentChatExecuteActionPayload,
  buildIncidentChatQueryPayload,
  normalizeIncidentImpactAssessmentPayload,
  normalizeIncidentPredictiveWarningPayload,
  normalizeIncidentReleaseGateEvidencePayload,
  normalizeIncidentActionResultPayload,
  normalizeIncidentPartialFailurePayload,
  normalizeIncomingIncidentStudioOpen,
  normalizeIncidentProtocolMeta,
  normalizeIncidentSystemGraphSnapshotPayload,
  normalizeIncidentWorkspaceGraphSnapshot,
  isIncidentDuplicateRequest,
  type IncidentProjectSelection,
} from '../../webview-ui/src/lib/incidentStudioPayload';
import {
  getActionResultPresentation,
  getBoardActionGuardHint,
} from '../../webview-ui/src/lib/incidentStudioVerifyPolicy';
import { reconcileIncidentStudioSyncSelection } from '../../webview-ui/src/lib/incidentStudioLifecycle';
import { classifyIncidentActionPolicy } from '../ui/panels/incidentStudioPromptPolicy';
import {
  buildIncidentStudioTelemetryFromCache,
  type CachedIncidentStudioTelemetry,
} from '../ui/panels/incidentStudioTelemetry';
import {
  buildIncidentWorkspaceGraphFixture,
  getIncidentFixtureSupportedTopology,
  INCIDENT_STUDIO_SUPPORTED_KIT_FIXTURES,
} from './fixtures/incidentStudioGraphFixtures';

describe('incidentStudioFlowE2E', () => {
  it('keeps Diagnose -> Plan -> Verify flow stable across all supported kits', () => {
    for (const fixture of INCIDENT_STUDIO_SUPPORTED_KIT_FIXTURES) {
      const supportedTopology = getIncidentFixtureSupportedTopology(fixture);
      const openPayload = normalizeIncomingIncidentStudioOpen({
        workspacePath: ` ${fixture.workspacePath} `,
        workspaceName: ` ${fixture.workspaceName} `,
        projectPath: ` ${fixture.projectPath} `,
        projectName: ` ${fixture.projectName} `,
        projectType: ` ${fixture.projectType} `,
        initialQuery: 'diagnose launch blockers token=top-secret',
      });

      expect(openPayload).not.toBeNull();
      expect(openPayload?.projectSelection?.path).toBe(fixture.projectPath);
      expect(openPayload?.initialQuery).toContain('token=[REDACTED]');

      const graph = normalizeIncidentWorkspaceGraphSnapshot(
        buildIncidentWorkspaceGraphFixture(fixture)
      );

      expect(graph?.memory.policyProfile).toBe('balanced');
      expect(graph?.memory.sensitivity).toBe('normal');
      expect(graph?.memory.localProcessingMode).toBe(false);
      expect(graph?.evidence.localProcessingMode).toBe(false);

      const syncResult = reconcileIncidentStudioSyncSelection(fixture.workspacePath, null, {
        workspacePath: fixture.workspacePath,
        graph,
      });

      expect(syncResult.shouldApply).toBe(true);
      expect(syncResult.selectionChanged).toBe(true);
      expect(syncResult.projectSelection).toEqual({
        path: fixture.projectPath,
        name: fixture.projectName,
        type: fixture.projectType,
      });

      const projectSelection = syncResult.projectSelection as IncidentProjectSelection;

      // Diagnose: query payload must remain project-scoped and sanitized.
      const diagnosePayload = buildIncidentChatQueryPayload({
        conversationId: 'conv-flow-1',
        workspacePath: fixture.workspacePath,
        requestId: 'diag-1',
        message: 'Analyze current errors. authorization: Bearer secret-123',
        projectSelection,
      });

      expect(diagnosePayload).toMatchObject({
        conversationId: 'conv-flow-1',
        workspacePath: fixture.workspacePath,
        projectPath: fixture.projectPath,
        projectName: fixture.projectName,
        projectType: fixture.projectType,
      });
      expect(diagnosePayload.message).toContain('authorization:[REDACTED]');

      // Plan: execution metadata must match the host-side policy classification.
      const planPolicy = classifyIncidentActionPolicy('doctor-fix');
      const planPayload = buildIncidentChatExecuteActionPayload({
        conversationId: 'conv-flow-1',
        actionId: 'action-flow-1',
        actionType: 'doctor-fix',
        workspacePath: fixture.workspacePath,
        requestId: 'plan-1',
        projectSelection,
      });

      expect(planPayload.execution).toEqual(
        expect.objectContaining({
          riskClass: planPolicy.riskClass,
          riskLevel: planPolicy.riskLevel,
          requiresImpactReview: planPolicy.requiresImpactReview,
          requiresVerifyPath: planPolicy.requiresVerifyPath,
          allowCompletionClaimWithoutVerify: planPolicy.allowCompletionClaimWithoutVerify,
        })
      );

      expect(getBoardActionGuardHint(planPayload.execution)).toBe(
        'Verification is required before claiming success.'
      );

      // Verify (pending): result should not be presented as success.
      const verifyPending = normalizeIncidentActionResultPayload({
        success: false,
        verificationRequired: true,
        verifyPolicy: planPayload.execution,
        outputSummary: 'doctor-fix - verification required before completion claim',
      });
      expect(getActionResultPresentation(verifyPending)).toEqual({
        tone: 'warning',
        title: 'Verification required',
        description: 'doctor-fix - verification required before completion claim',
      });

      // Verify (passed): deterministic evidence should flip result presentation to success.
      const verifyPassed = normalizeIncidentActionResultPayload({
        success: true,
        verificationRequired: false,
        verifyPolicy: planPayload.execution,
        outputSummary: 'doctor-fix - result shown in conversation above',
        evidence: {
          source: 'doctor-last-run',
          passed: 6,
          warnings: 0,
          errors: 0,
        },
      });
      expect(verifyPassed.evidence?.errors).toBe(0);
      expect(getActionResultPresentation(verifyPassed)).toEqual({
        tone: 'success',
        title: 'Verification passed',
        description: 'doctor-fix - result shown in conversation above',
      });

      const systemGraphSnapshot = normalizeIncidentSystemGraphSnapshotPayload({
        requestId: 'graph-flow-1',
        workspacePath: fixture.workspacePath,
        projectPath: fixture.projectPath,
        graphVersion: 'v1',
        nodes: fixture.modules.map((moduleName) => ({
          id: `service:${moduleName}`,
          type: 'service',
          label: `${moduleName} service`,
          filePath: `src/${moduleName}`,
          confidence: 70,
        })),
        edges: fixture.modules.slice(0, 1).map((moduleName, index) => ({
          sourceId: `service:${moduleName}`,
          targetId: `service:${fixture.modules[index + 1] || moduleName}`,
          relation: 'depends-on',
        })),
        summary: {
          nodeCount: fixture.modules.length,
          edgeCount: fixture.modules.length > 1 ? 1 : 0,
          supportedTopology,
        },
      });

      expect(systemGraphSnapshot?.workspacePath).toBe(fixture.workspacePath);
      expect(systemGraphSnapshot?.summary.supportedTopology).toBe(supportedTopology);

      const impactAssessment = normalizeIncidentImpactAssessmentPayload({
        requestId: 'impact-flow-1',
        source: ['graph', 'doctor'],
        confidence: 78,
        riskLevel: planPayload.execution.riskLevel,
        affectedModules: fixture.modules.slice(0, 2),
        affectedFiles: [fixture.projectPath],
        affectedTests: fixture.modules.slice(0, 1).map((name) => `tests/${name}.spec.ts`),
        likelyFailureMode: 'downstream service regression risk',
        rationale: ['C07 architecture gates passed for the current action path.'],
        verifyChecklist: ['Run deterministic verification command'],
        blockMutationWhenScopeUnknown: true,
      });

      expect(impactAssessment.blockMutationWhenScopeUnknown).toBe(true);
      expect(impactAssessment.affectedModules.length).toBeGreaterThan(0);
      expect(impactAssessment.rationale).toContain(
        'C07 architecture gates passed for the current action path.'
      );

      const predictiveWarning = normalizeIncidentPredictiveWarningPayload({
        requestId: 'predictive-flow-1',
        warningId: `warn-${supportedTopology}`,
        confidenceBand: 'medium',
        predictedFailure: 'likely downstream timeout',
        affectedScopeSummary: impactAssessment.affectedModules.join(', '),
        nextSafeAction: 'Run change-impact-lite and verify before apply.',
        verifyChecklist: impactAssessment.verifyChecklist,
        telemetrySeed: {
          predictionKey: `pred-${supportedTopology}`,
          evidenceSources: impactAssessment.sources,
        },
      });

      expect(predictiveWarning.telemetrySeed.predictionKey).toContain(supportedTopology);
      expect(predictiveWarning.verifyChecklist.length).toBeGreaterThan(0);

      const releaseGateEvidence = normalizeIncidentReleaseGateEvidencePayload({
        requestId: 'gate-flow-1',
        scopeKnown: impactAssessment.affectedModules.length > 0,
        verifyPathPresent: impactAssessment.verifyChecklist.length > 0,
        rollbackPathPresent: true,
        confidenceSufficient: impactAssessment.confidence >= 60,
        blockedReasons: [],
      });

      expect(releaseGateEvidence.scopeKnown).toBe(true);
      expect(releaseGateEvidence.verifyPathPresent).toBe(true);
      expect(releaseGateEvidence.confidenceSufficient).toBe(true);
      expect(releaseGateEvidence.blockedReasons).toEqual([]);
    }
  });

  it('enforces guarded mutate flow for inline-command with warning -> failure progression', () => {
    const policy = classifyIncidentActionPolicy('inline-command');
    expect(policy.requiresImpactReview).toBe(true);
    expect(policy.requiresVerifyPath).toBe(true);

    expect(getBoardActionGuardHint(policy)).toBe(
      'Workspace Advisor review and verification are required before claiming success.'
    );

    const verifyPending = normalizeIncidentActionResultPayload({
      success: false,
      verificationRequired: true,
      verifyPolicy: policy,
      outputSummary: 'inline-command - verification required before completion claim',
    });
    expect(getActionResultPresentation(verifyPending).tone).toBe('warning');

    const verifyFailed = normalizeIncidentActionResultPayload({
      success: false,
      verificationRequired: false,
      verifyPolicy: policy,
      outputSummary: 'inline-command - command exited with failures',
    });
    expect(getActionResultPresentation(verifyFailed)).toEqual({
      tone: 'failure',
      title: 'Verification failed',
      description: 'inline-command - command exited with failures',
    });

    const rollbackFailure = normalizeIncidentActionResultPayload({
      success: false,
      verificationRequired: false,
      verifyPolicy: policy,
      outputSummary: 'inline-command - rollback attempted after verify failure',
      rollback: {
        attempted: true,
        status: 'succeeded',
        candidateFiles: ['src/orders/service.ts'],
        restoredFiles: ['src/orders/service.ts'],
        failedFiles: [],
      },
    });

    expect(rollbackFailure.rollback).toEqual({
      attempted: true,
      status: 'succeeded',
      reason: undefined,
      attemptedAt: undefined,
      candidateFiles: ['src/orders/service.ts'],
      restoredFiles: ['src/orders/service.ts'],
      failedFiles: [],
      suggestedNextStep: undefined,
    });
    expect(getActionResultPresentation(rollbackFailure).tone).toBe('failure');
  });

  it('keeps decision clarity contract block in verification-required warning state', () => {
    const policy = classifyIncidentActionPolicy('inline-command');
    expect(policy.requiresImpactReview).toBe(true);
    expect(policy.requiresVerifyPath).toBe(true);

    const blockedByDecisionClarity = normalizeIncidentActionResultPayload({
      success: false,
      verificationRequired: true,
      verifyPolicy: policy,
      outputSummary: 'inline-command - blocked by decision clarity contract: rollbackPlan',
      diagnosis: {
        confidence: 82,
        confidenceBand: 'high',
        signalSources: ['doctor-evidence', 'system-graph'],
        relatedFiles: ['src/orders/service.ts'],
      },
      verifyCommandPack: {
        qualityScore: 84,
        readiness: 'ready',
        rationale: 'deterministic checks are available',
        commands: [
          {
            label: 'run verify',
            command: 'npm run test:integration',
            scope: 'project',
            required: true,
          },
        ],
        blockedReasons: [],
      },
    });

    expect(blockedByDecisionClarity.decisionClarity?.mutationReady).toBe(false);
    expect(blockedByDecisionClarity.decisionClarity?.requiredMissingFields).toContain(
      'rollbackPlan'
    );
    expect(getActionResultPresentation(blockedByDecisionClarity)).toEqual({
      tone: 'warning',
      title: 'Verification required',
      description: 'inline-command - blocked by decision clarity contract: rollbackPlan',
    });
  });

  it('guards finalization from duplicate request IDs during verify completion', () => {
    const doneMeta = normalizeIncidentProtocolMeta({
      requestId: ' req-done-1 ',
      version: ' v1 ',
    });

    expect(doneMeta).toEqual({
      requestId: 'req-done-1',
      version: 'v1',
    });

    expect(isIncidentDuplicateRequest('req-done-1', doneMeta.requestId)).toBe(true);
    expect(isIncidentDuplicateRequest('req-done-1', 'req-done-2')).toBe(false);
  });

  it('ignores stale workspace sync payloads during rapid workspace switching', () => {
    const fixture = INCIDENT_STUDIO_SUPPORTED_KIT_FIXTURES[0];
    const otherFixture = INCIDENT_STUDIO_SUPPORTED_KIT_FIXTURES[1];

    const staleSync = reconcileIncidentStudioSyncSelection(fixture.workspacePath, null, {
      workspacePath: otherFixture.workspacePath,
      graph: normalizeIncidentWorkspaceGraphSnapshot(
        buildIncidentWorkspaceGraphFixture(otherFixture)
      ),
    });

    expect(staleSync.shouldApply).toBe(false);
    expect(staleSync.selectionChanged).toBe(false);
    expect(staleSync.projectSelection).toBeNull();
  });

  it('keeps partial-failure payload retry semantics deterministic for stream interruptions', () => {
    const timeoutFailure = normalizeIncidentPartialFailurePayload({
      code: ' TIMEOUT ',
      message: ' Upstream stream timed out ',
      retryable: true,
    });

    expect(timeoutFailure).toEqual({
      code: 'TIMEOUT',
      message: 'Upstream stream timed out',
      retryable: true,
    });

    const duplicateFailure = normalizeIncidentPartialFailurePayload({
      code: ' DUPLICATE_REQUEST ',
      message: ' Duplicate requestId detected ',
      retryable: false,
    });

    expect(duplicateFailure).toEqual({
      code: 'DUPLICATE_REQUEST',
      message: 'Duplicate requestId detected',
      retryable: false,
    });
  });

  it('preserves precise unknown-scope blocked reasons in release gate contract payload', () => {
    const policy = classifyIncidentActionPolicy('inline-command');
    expect(policy.requiresImpactReview).toBe(true);
    expect(policy.requiresVerifyPath).toBe(true);

    const defaultFailClosedImpact = normalizeIncidentImpactAssessmentPayload({
      requestId: 'impact-default-c07',
      source: ['graph'],
      confidence: 62,
      riskLevel: 'high',
      affectedFiles: ['src/orders/service.ts'],
      affectedModules: ['orders'],
      affectedTests: ['tests/orders.spec.ts'],
      verifyChecklist: ['Run deterministic verify command'],
    });

    expect(defaultFailClosedImpact.blockMutationWhenScopeUnknown).toBe(true);

    const releaseGateEvidence = normalizeIncidentReleaseGateEvidencePayload({
      requestId: ' gate-unknown-1 ',
      scopeKnown: false,
      verifyPathPresent: false,
      rollbackPathPresent: false,
      confidenceSufficient: false,
      blockedReasons: [
        'Affected scope is unknown while impact review is required.',
        'C07 gate evaluation unavailable; block mutation until architecture scope is confirmed. token=raw-secret',
        'C07 gate evaluation unavailable; block mutation until architecture scope is confirmed. token=raw-secret',
        'Scope is unknown for an impact-reviewed action.',
        'Verification evidence is missing for a verify-first action.',
        'Affected scope is unknown while impact review is required.',
      ],
    });

    expect(releaseGateEvidence).toEqual({
      requestId: 'gate-unknown-1',
      scopeKnown: false,
      verifyPathPresent: false,
      rollbackPathPresent: false,
      confidenceSufficient: false,
      blockedReasons: [
        'Affected scope is unknown while impact review is required.',
        'C07 gate evaluation unavailable; block mutation until architecture scope is confirmed. token=[REDACTED]',
        'Scope is unknown for an impact-reviewed action.',
        'Verification evidence is missing for a verify-first action.',
      ],
    });
  });

  it('enforces host-level decision clarity block on aiChatActionResult when mandatory fields are missing', () => {
    // Simulate a mutating action (inline-command) that returns verify=true but is missing:
    //   - impactScope (diagnosis.relatedFiles is empty → no affected scope)
    //   - nextStep + verifyPlan (no verifyCommandPack)
    //   - rollbackPlan (no rollback.suggestedNextStep)
    const policy = classifyIncidentActionPolicy('inline-command');

    const blockedResult = normalizeIncidentActionResultPayload({
      success: false,
      verificationRequired: true,
      verifyPolicy: policy,
      outputSummary: 'inline-command - blocked by decision clarity contract: impactScope',
      diagnosis: {
        confidence: 75,
        confidenceBand: 'medium',
        signalSources: ['doctor-evidence'],
        relatedFiles: [], // empty → impactScope missing for mutating flow
      },
      // no verifyCommandPack → nextStep + verifyPlan missing
      // no rollback.suggestedNextStep, no sandboxSimulation.recommendedRollbackPath → rollbackPlan missing
    });

    // All mandatory CLC1 fields absent for a mutating flow
    expect(blockedResult.decisionClarity?.mutationReady).toBe(false);
    expect(blockedResult.decisionClarity?.requiredMissingFields).toContain('impactScope');
    expect(blockedResult.decisionClarity?.requiredMissingFields).toContain('nextStep');
    expect(blockedResult.decisionClarity?.requiredMissingFields).toContain('verifyPlan');
    expect(blockedResult.decisionClarity?.requiredMissingFields).toContain('rollbackPlan');

    // Host-level: verificationRequired must remain true
    expect(blockedResult.verificationRequired).toBe(true);

    // Presentation layer must show warning, not success
    const presentation = getActionResultPresentation(blockedResult);
    expect(presentation.tone).toBe('warning');
    expect(presentation.title).toBe('Verification required');
    expect(presentation.description).toContain('blocked by decision clarity contract');

    // Case 2: providing all mandatory fields flips mutationReady to true
    const clearedResult = normalizeIncidentActionResultPayload({
      success: true,
      verificationRequired: false,
      verifyPolicy: policy,
      outputSummary: 'inline-command - result shown in conversation above',
      diagnosis: {
        confidence: 85,
        confidenceBand: 'high',
        signalSources: ['doctor-evidence', 'system-graph'],
        relatedFiles: ['src/payments/service.ts'], // impactScope present
      },
      verifyCommandPack: {
        qualityScore: 90,
        readiness: 'ready',
        rationale: 'deterministic verify available',
        commands: [
          {
            label: 'run integration tests',
            command: 'npm run test:integration',
            scope: 'project',
            required: true, // nextStep + verifyPlan present
          },
        ],
        blockedReasons: [],
      },
      rollback: {
        attempted: false,
        status: 'skipped',
        candidateFiles: ['src/payments/service.ts'],
        restoredFiles: [],
        failedFiles: [],
        suggestedNextStep: 'git checkout src/payments/service.ts', // rollbackPlan present
      },
    });

    expect(clearedResult.decisionClarity?.mutationReady).toBe(true);
    expect(clearedResult.decisionClarity?.requiredMissingFields).toHaveLength(0);
    expect(clearedResult.verificationRequired).toBe(false);
    expect(getActionResultPresentation(clearedResult).tone).toBe('success');
  });

  it('keeps doctor treatment telemetry envelope stable during cache-only refresh windows', () => {
    const cachedTelemetry: CachedIncidentStudioTelemetry = {
      commandSummary: {
        totalEvents: 14,
        lastCommand: 'workspai.studio.loop_started',
        lastCommandAt: '2026-05-09T02:00:00.000Z',
        commandUsage: [{ command: 'workspai.studio.loop_started', count: 14 }],
        surfaceBreakdown: {
          actionEvents: 12,
          askEvents: 2,
          actionVsAskShare: 85.71,
        },
      },
      onboardingSummary: {
        followupShown: 5,
        followupClicked: 3,
        overallFollowupClickThroughRate: 60,
      },
      ctaVariantBreakdown: {
        workspacePath: '/tmp/demo',
        timeWindow: 'last7d',
        windowStartAt: '2026-05-02T02:00:00.000Z',
        windowEndAt: '2026-05-09T02:00:00.000Z',
        variants: [
          {
            variant: 'multi',
            loopStarted: 5,
            nextActionClicked: 4,
            actionExecuted: 3,
            verifyPassed: 2,
            verifyFailed: 1,
            verifyCompletionRate: 100,
            actionVsAskShare: 80,
            loopCompleted: 2,
            abandoned: 1,
          },
        ],
      },
      doctorTreatmentStatus: {
        evaluatedAt: '2026-05-09T01:58:00.000Z',
        trend: 'stable',
        baselineAvailable: true,
        scoreDeltaPercent: 0,
        netIssueDelta: 0,
        newIssueCount: 0,
        resolvedIssueCount: 0,
        regressionSignals: 0,
        improvementSignals: 1,
        mixedScopeWarnings: 0,
        scopedChecks: 6,
        aggregatedChecks: 0,
        dominantScope: 'project',
        traceabilityCoverageRate: 100,
        probeFailures: 0,
        probeWarnings: 1,
      },
      doctorSummary: {
        workspaceName: 'demo',
      },
      timestamp: Date.now(),
    };

    // Simulate a refresh where doctor evidence file is temporarily unavailable.
    const payload = buildIncidentStudioTelemetryFromCache(cachedTelemetry, null);

    expect(payload.doctorTreatmentStatus).toEqual(cachedTelemetry.doctorTreatmentStatus);
    expect(payload.commandSummary).toEqual(cachedTelemetry.commandSummary);
    expect(payload.onboardingSummary).toEqual(cachedTelemetry.onboardingSummary);
    expect(payload.ctaVariantBreakdown?.timeWindow).toBe('last7d');
    expect(payload.doctorSummary).toBeNull();
  });
});

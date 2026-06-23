import { describe, expect, it } from 'vitest';

import {
  buildIncidentActionExecutionMetadata,
  buildIncidentChatExecuteActionPayload,
  buildIncidentChatQueryPayload,
  buildIncidentChatSyncWorkspacePayload,
  buildIncidentChatApplyPatchPayload,
  buildIncidentChatStartPayload,
  isIncidentDuplicateRequest,
  normalizeIncidentActionProgressPayload,
  normalizeIncidentActionResultPayload,
  normalizeIncidentDonePayload,
  normalizeIncidentImpactAssessmentPayload,
  normalizeIncidentPredictiveWarningPayload,
  normalizeIncidentPartialFailurePayload,
  normalizeIncidentProtocolMeta,
  normalizeIncidentReleaseGateEvidencePayload,
  normalizeIncidentSystemGraphSnapshotPayload,
  normalizeIncidentWorkspaceGraphSnapshot,
  normalizeIncomingIncidentStudioOpen,
} from '../../webview-ui/src/lib/incidentStudioPayload';
import { classifyIncidentActionPolicy } from '../ui/panels/incidentStudioPromptPolicy';
import {
  buildIncidentWorkspaceGraphFixture,
  getIncidentFixtureSupportedTopology,
  INCIDENT_STUDIO_SUPPORTED_KIT_FIXTURES,
} from './fixtures/incidentStudioGraphFixtures';
import { INCIDENT_PROTOCOL_FIXTURES } from './fixtures/incidentStudioProtocolFixtures';

describe('incidentStudioPayload', () => {
  it('normalizes openIncidentStudio message with trimmed project-scoped fields', () => {
    const normalized = normalizeIncomingIncidentStudioOpen({
      workspacePath: ' /tmp/wsp ',
      workspaceName: ' Demo Workspace ',
      projectPath: ' /tmp/wsp/orders-api ',
      projectName: ' Orders API ',
      projectType: ' springboot ',
      initialQuery: ' analyze launch blockers ',
      preferredDisplayMode: ' full ',
      preferredArchitectureLensView: ' dependency ',
    });

    expect(normalized).toEqual({
      workspacePath: '/tmp/wsp',
      workspaceName: 'Demo Workspace',
      initialQuery: 'analyze launch blockers',
      composerHandoff: undefined,
      projectSelection: {
        path: '/tmp/wsp/orders-api',
        name: 'Orders API',
        type: 'springboot',
      },
      preferredDisplayMode: 'full',
      preferredArchitectureLensView: 'dependency',
    });
  });

  it('falls back workspaceName and removes project scope when project path is missing', () => {
    const normalized = normalizeIncomingIncidentStudioOpen({
      workspacePath: '/tmp/wsp',
      workspaceName: '   ',
      projectPath: '   ',
      projectName: 'Ignored',
      projectType: 'Ignored',
    });

    expect(normalized).toEqual({
      workspacePath: '/tmp/wsp',
      workspaceName: '/tmp/wsp',
      initialQuery: undefined,
      composerHandoff: undefined,
      projectSelection: null,
      preferredDisplayMode: undefined,
      preferredArchitectureLensView: undefined,
    });
  });

  it('normalizes composerHandoff for evidence prefill handoffs', () => {
    const normalized = normalizeIncomingIncidentStudioOpen({
      workspacePath: '/tmp/wsp',
      initialQuery: 'Fix pipeline blockers',
      composerHandoff: 'prefill',
    });

    expect(normalized?.composerHandoff).toBe('prefill');
    expect(normalized?.initialQuery).toBe('Fix pipeline blockers');
  });

  it('drops unsupported Incident Studio preferences', () => {
    const normalized = normalizeIncomingIncidentStudioOpen({
      workspacePath: '/tmp/wsp',
      preferredDisplayMode: 'advanced',
      preferredArchitectureLensView: 'force-graph',
    });

    expect(normalized).toEqual({
      workspacePath: '/tmp/wsp',
      workspaceName: '/tmp/wsp',
      initialQuery: undefined,
      projectSelection: null,
      preferredDisplayMode: undefined,
      preferredArchitectureLensView: undefined,
    });
  });

  it('returns null when workspacePath is missing', () => {
    expect(normalizeIncomingIncidentStudioOpen({ workspacePath: '   ' })).toBeNull();
    expect(normalizeIncomingIncidentStudioOpen(null)).toBeNull();
  });

  it('builds aiChatStart payload with project fields when project selection exists', () => {
    const payload = buildIncidentChatStartPayload({
      workspacePath: '/tmp/wsp',
      requestId: 'cb-1',
      resumeConversationId: 'conv-1',
      projectSelection: {
        path: '/tmp/wsp/orders-api',
        name: 'orders-api',
        type: 'springboot',
      },
    });

    expect(payload).toMatchObject({
      workspacePath: '/tmp/wsp',
      requestId: 'cb-1',
      resumeConversationId: 'conv-1',
      projectPath: '/tmp/wsp/orders-api',
      projectName: 'orders-api',
      projectType: 'springboot',
    });
  });

  it('builds aiChatQuery payload without project fields when project selection is absent', () => {
    const payload = buildIncidentChatQueryPayload({
      conversationId: 'conv-1',
      workspacePath: '/tmp/wsp',
      requestId: 'cbq-1',
      message: 'show launch blockers',
    });

    expect(payload).toEqual({
      conversationId: 'conv-1',
      workspacePath: '/tmp/wsp',
      requestId: 'cbq-1',
      modelId: undefined,
      message: 'show launch blockers',
    });
  });

  it('builds aiChatSyncWorkspace payload with optional force refresh', () => {
    expect(
      buildIncidentChatSyncWorkspacePayload({
        workspacePath: '/tmp/wsp',
        requestId: 'sync-1',
        forceRefresh: true,
      })
    ).toEqual({
      workspacePath: '/tmp/wsp',
      requestId: 'sync-1',
      forceRefresh: true,
    });

    expect(
      buildIncidentChatSyncWorkspacePayload({
        workspacePath: '/tmp/wsp',
        requestId: 'sync-2',
      })
    ).toEqual({
      workspacePath: '/tmp/wsp',
      requestId: 'sync-2',
    });
  });

  it('builds aiChatSyncWorkspace payload with project selection', () => {
    expect(
      buildIncidentChatSyncWorkspacePayload({
        workspacePath: '/tmp/wsp',
        requestId: 'sync-3',
        projectSelection: { path: '/tmp/wsp/api', name: 'api', type: 'fastapi' },
      })
    ).toEqual({
      workspacePath: '/tmp/wsp',
      requestId: 'sync-3',
      projectPath: '/tmp/wsp/api',
      projectName: 'api',
      projectType: 'fastapi',
    });
  });

  it('builds aiChatApplyPatch payload', () => {
    expect(
      buildIncidentChatApplyPatchPayload({
        conversationId: 'conv-1',
        patchId: 'patch-1',
        acceptedPaths: ['src/a.ts'],
        branchSafeApply: true,
        workspacePath: '/tmp/wsp',
        requestId: 'patch-req-1',
      })
    ).toEqual({
      conversationId: 'conv-1',
      patchId: 'patch-1',
      acceptedPaths: ['src/a.ts'],
      branchSafeApply: true,
      workspacePath: '/tmp/wsp',
      requestId: 'patch-req-1',
    });
  });

  it('builds aiChatExecuteAction payload with project fields for project-scoped actions', () => {
    const payload = buildIncidentChatExecuteActionPayload({
      conversationId: 'conv-1',
      actionId: 'action-1',
      actionType: 'doctor-fix',
      workspacePath: '/tmp/wsp',
      requestId: 'cba-1',
      modelId: 'gpt-4o',
      projectSelection: {
        path: '/tmp/wsp/orders-api',
        name: 'orders-api',
        type: 'springboot',
      },
    });

    expect(payload).toMatchObject({
      conversationId: 'conv-1',
      actionId: 'action-1',
      actionType: 'doctor-fix',
      workspacePath: '/tmp/wsp',
      requestId: 'cba-1',
      modelId: 'gpt-4o',
      projectPath: '/tmp/wsp/orders-api',
      projectName: 'orders-api',
      projectType: 'springboot',
      execution: {
        riskClass: 'non-mutating-executable',
        riskLevel: 'medium',
        requiresImpactReview: false,
        requiresVerifyPath: true,
        allowCompletionClaimWithoutVerify: false,
      },
    });
  });

  it('classifies execute-action metadata for known and unknown action types', () => {
    const doctorFix = buildIncidentActionExecutionMetadata('doctor-fix');
    const unknown = buildIncidentActionExecutionMetadata('unknown-action');

    expect(doctorFix).toEqual({
      riskClass: 'non-mutating-executable',
      riskLevel: 'medium',
      requiresImpactReview: false,
      requiresVerifyPath: true,
      allowCompletionClaimWithoutVerify: false,
    });

    expect(unknown).toEqual({
      riskClass: 'high-risk-mutating',
      riskLevel: 'critical',
      requiresImpactReview: true,
      requiresVerifyPath: true,
      allowCompletionClaimWithoutVerify: false,
    });
  });

  it('keeps execute payload metadata in parity with host-side incident action policy', () => {
    const actionTypes = [
      'change-impact-lite',
      'terminal-bridge',
      'fix-preview-lite',
      'workspace-memory-wizard',
      'doctor-fix',
      'recipe-pack',
      'verify-pack-autopilot',
      'incident-repro-pack',
      'release-readiness-commander',
      'inline-command',
      'custom-mutate-action',
    ];

    for (const actionType of actionTypes) {
      const {
        riskClass,
        riskLevel,
        requiresImpactReview,
        requiresVerifyPath,
        allowCompletionClaimWithoutVerify,
      } = classifyIncidentActionPolicy(actionType);

      expect(buildIncidentActionExecutionMetadata(actionType)).toEqual(
        expect.objectContaining({
          riskClass,
          riskLevel,
          requiresImpactReview,
          requiresVerifyPath,
          allowCompletionClaimWithoutVerify,
        })
      );
    }
  });

  it('normalizes canonical workspace graph snapshot for incident studio', () => {
    const graph = normalizeIncidentWorkspaceGraphSnapshot({
      snapshotVersion: 'v1',
      workspace: { path: ' /tmp/wsp ', name: ' Demo ' },
      project: {
        framework: 'springboot',
        kit: 'springboot.standard',
        selectedProject: {
          path: ' /tmp/wsp/orders-api ',
          name: ' Orders API ',
          type: ' springboot ',
        },
      },
      topology: {
        modulesCount: 4,
        topModules: ['auth', 'billing'],
      },
      doctor: {
        hasEvidence: true,
        generatedAt: '2026-04-27T12:00:00.000Z',
        health: {
          passed: 7,
          warnings: 1,
          errors: 0,
          total: 8,
          percent: 88,
        },
      },
      git: {
        diffStat: '2 files changed',
        hasDiffContext: true,
      },
      memory: {
        context: 'Monorepo with strict module boundaries.',
        conventionsCount: 2,
        decisionsCount: 1,
        hasMemory: true,
        policyProfile: 'strict',
        sensitivity: 'sensitive',
        localProcessingMode: true,
      },
      telemetry: {
        totalEvents: 32,
        lastCommand: 'workspai.studio.loop_started',
        onboardingFollowupClickThroughRate: 41,
      },
      evidence: {
        hasDoctorEvidence: true,
        hasGitDiff: true,
        hasWorkspaceMemory: true,
        localProcessingMode: true,
        projectScoped: true,
      },
      completeness: 'fresh',
      lastUpdatedAt: 123,
    });

    expect(graph).toMatchObject({
      snapshotVersion: 'v1',
      workspace: { path: '/tmp/wsp', name: 'Demo' },
      project: {
        framework: 'springboot',
        kit: 'springboot.standard',
        selectedProject: {
          path: '/tmp/wsp/orders-api',
          name: 'Orders API',
          type: 'springboot',
        },
      },
      evidence: {
        hasDoctorEvidence: true,
        hasGitDiff: true,
        hasWorkspaceMemory: true,
        localProcessingMode: true,
        projectScoped: true,
      },
      memory: {
        policyProfile: 'strict',
        sensitivity: 'sensitive',
        localProcessingMode: true,
      },
      completeness: 'fresh',
    });
  });

  it('keeps graph evidence complete across supported workspace kit fixtures', () => {
    for (const fixture of INCIDENT_STUDIO_SUPPORTED_KIT_FIXTURES) {
      const supportedTopology = getIncidentFixtureSupportedTopology(fixture);
      const graph = normalizeIncidentWorkspaceGraphSnapshot(
        buildIncidentWorkspaceGraphFixture(fixture)
      );

      expect(graph).toMatchObject({
        workspace: {
          path: fixture.workspacePath,
          name: fixture.workspaceName,
        },
        project: {
          framework: fixture.framework,
          kit: supportedTopology,
          selectedProject: {
            path: fixture.projectPath,
            name: fixture.projectName,
            type: fixture.projectType,
          },
        },
        topology: {
          modulesCount: fixture.modules.length,
          topModules: fixture.modules,
        },
        doctor: {
          hasEvidence: true,
        },
        git: {
          hasDiffContext: true,
        },
        memory: {
          hasMemory: true,
          conventionsCount: 2,
          decisionsCount: 1,
          policyProfile: 'balanced',
          sensitivity: 'normal',
          localProcessingMode: false,
        },
        evidence: {
          hasDoctorEvidence: true,
          hasGitDiff: true,
          hasWorkspaceMemory: true,
          localProcessingMode: false,
          projectScoped: true,
        },
        completeness: 'fresh',
      });
    }
  });

  it('defaults workspace memory policy profile for legacy graph payloads', () => {
    const graph = normalizeIncidentWorkspaceGraphSnapshot({
      snapshotVersion: 'v1',
      workspace: { path: '/tmp/legacy' },
      project: {
        framework: 'unknown',
        kit: 'unknown',
        selectedProject: null,
      },
      topology: {
        modulesCount: 0,
        topModules: [],
      },
      doctor: {
        hasEvidence: false,
      },
      git: {
        diffStat: 'none',
        hasDiffContext: false,
      },
      memory: {
        conventionsCount: 0,
        decisionsCount: 0,
        hasMemory: false,
      },
      telemetry: {
        totalEvents: 0,
        lastCommand: null,
        onboardingFollowupClickThroughRate: 0,
      },
      evidence: {
        hasDoctorEvidence: false,
        hasGitDiff: false,
        hasWorkspaceMemory: false,
        projectScoped: false,
      },
      completeness: 'partial',
      lastUpdatedAt: 1,
    });

    expect(graph?.memory.policyProfile).toBe('balanced');
    expect(graph?.memory.sensitivity).toBe('normal');
    expect(graph?.memory.localProcessingMode).toBe(false);
    expect(graph?.evidence.localProcessingMode).toBe(false);
  });

  it('returns null when workspace path is missing in workspace graph snapshot', () => {
    expect(
      normalizeIncidentWorkspaceGraphSnapshot({
        workspace: { path: '   ' },
      })
    ).toBeNull();
  });

  it('keeps protocol fixture contracts stable for start/query/execute', () => {
    const start = buildIncidentChatStartPayload({
      workspacePath: INCIDENT_PROTOCOL_FIXTURES.start.payload.workspacePath,
      requestId: INCIDENT_PROTOCOL_FIXTURES.start.payload.requestId,
      resumeConversationId: INCIDENT_PROTOCOL_FIXTURES.start.payload.resumeConversationId,
      projectSelection: {
        path: INCIDENT_PROTOCOL_FIXTURES.start.payload.projectPath,
        name: INCIDENT_PROTOCOL_FIXTURES.start.payload.projectName,
        type: INCIDENT_PROTOCOL_FIXTURES.start.payload.projectType,
      },
    });

    const query = buildIncidentChatQueryPayload({
      conversationId: INCIDENT_PROTOCOL_FIXTURES.query.payload.conversationId,
      workspacePath: INCIDENT_PROTOCOL_FIXTURES.query.payload.workspacePath,
      requestId: INCIDENT_PROTOCOL_FIXTURES.query.payload.requestId,
      message: INCIDENT_PROTOCOL_FIXTURES.query.payload.message,
      modelId: INCIDENT_PROTOCOL_FIXTURES.query.payload.modelId,
      projectSelection: {
        path: INCIDENT_PROTOCOL_FIXTURES.query.payload.projectPath,
        name: INCIDENT_PROTOCOL_FIXTURES.query.payload.projectName,
        type: INCIDENT_PROTOCOL_FIXTURES.query.payload.projectType,
      },
    });

    const execute = buildIncidentChatExecuteActionPayload({
      conversationId: INCIDENT_PROTOCOL_FIXTURES.execute.payload.conversationId,
      actionId: INCIDENT_PROTOCOL_FIXTURES.execute.payload.actionId,
      actionType: INCIDENT_PROTOCOL_FIXTURES.execute.payload.actionType,
      workspacePath: INCIDENT_PROTOCOL_FIXTURES.execute.payload.workspacePath,
      requestId: INCIDENT_PROTOCOL_FIXTURES.execute.payload.requestId,
      modelId: INCIDENT_PROTOCOL_FIXTURES.execute.payload.modelId,
      projectSelection: {
        path: INCIDENT_PROTOCOL_FIXTURES.execute.payload.projectPath,
        name: INCIDENT_PROTOCOL_FIXTURES.execute.payload.projectName,
        type: INCIDENT_PROTOCOL_FIXTURES.execute.payload.projectType,
      },
    });

    expect(start.requestId).toBe(INCIDENT_PROTOCOL_FIXTURES.start.payload.requestId);
    expect(start.resumeConversationId).toBe(
      INCIDENT_PROTOCOL_FIXTURES.start.payload.resumeConversationId
    );

    expect(query).toMatchObject({
      conversationId: INCIDENT_PROTOCOL_FIXTURES.query.payload.conversationId,
      requestId: INCIDENT_PROTOCOL_FIXTURES.query.payload.requestId,
      modelId: INCIDENT_PROTOCOL_FIXTURES.query.payload.modelId,
    });

    expect(execute).toMatchObject({
      conversationId: INCIDENT_PROTOCOL_FIXTURES.execute.payload.conversationId,
      requestId: INCIDENT_PROTOCOL_FIXTURES.execute.payload.requestId,
      actionType: INCIDENT_PROTOCOL_FIXTURES.execute.payload.actionType,
    });
  });

  it('detects duplicate request ids and normalizes request metadata', () => {
    const meta = normalizeIncidentProtocolMeta({
      requestId: ' cb-query-1 ',
      version: ' v1 ',
    });

    expect(meta).toEqual({
      requestId: 'cb-query-1',
      version: 'v1',
    });

    expect(isIncidentDuplicateRequest('cb-query-1', meta.requestId)).toBe(true);
    expect(isIncidentDuplicateRequest('cb-query-1', 'cb-query-2')).toBe(false);
    expect(isIncidentDuplicateRequest(null, 'cb-query-1')).toBe(false);
  });

  it('normalizes partial-failure payload with safe defaults', () => {
    expect(
      normalizeIncidentPartialFailurePayload({
        code: ' PARTIAL_FAILURE ',
        message: ' Stream interrupted ',
        retryable: false,
      })
    ).toEqual({
      code: 'PARTIAL_FAILURE',
      message: 'Stream interrupted',
      retryable: false,
    });

    expect(normalizeIncidentPartialFailurePayload({})).toEqual({
      code: 'PARTIAL_FAILURE',
      message: 'Incident Studio request completed with partial failure.',
      retryable: true,
    });
  });

  it('preserves timeout-specific retry semantics in partial-failure payloads', () => {
    expect(
      normalizeIncidentPartialFailurePayload({
        code: ' TIMEOUT ',
        message: ' Request exceeded response budget ',
        retryable: true,
      })
    ).toEqual({
      code: 'TIMEOUT',
      message: 'Request exceeded response budget',
      retryable: true,
    });
  });

  it('redacts secrets from incoming query and partial failure payload text fields', () => {
    const normalizedOpen = normalizeIncomingIncidentStudioOpen({
      workspacePath: '/tmp/wsp',
      workspaceName: 'Demo',
      initialQuery: 'authorization: Bearer super-secret-token',
      projectPath: '/tmp/wsp/orders-api',
      projectName: 'api_key=prod-123',
      projectType: 'springboot',
    });

    expect(normalizedOpen?.initialQuery).toContain('[REDACTED]');
    expect(normalizedOpen?.projectSelection?.name).toContain('[REDACTED]');
    expect(normalizedOpen?.initialQuery).not.toContain('super-secret-token');

    const queryPayload = buildIncidentChatQueryPayload({
      conversationId: 'conv-1',
      workspacePath: '/tmp/wsp',
      requestId: 'cbq-redact',
      message: 'token=abc123',
    });
    expect(queryPayload.message).toContain('[REDACTED]');
    expect(queryPayload.message).not.toContain('abc123');

    const partial = normalizeIncidentPartialFailurePayload({
      message: 'password: hello123',
    });
    expect(partial.message).toContain('[REDACTED]');
    expect(partial.message).not.toContain('hello123');
  });

  it('normalizes action-result payload and drops malformed verify policy fields', () => {
    const normalized = normalizeIncidentActionResultPayload({
      success: true,
      outputSummary: 'authorization: Bearer top-secret',
      verificationRequired: true,
      verifyPolicy: {
        requiresVerifyPath: true,
        requiresImpactReview: 'yes',
        allowCompletionClaimWithoutVerify: false,
      },
      evidence: {
        source: 'doctor-last-run',
        healthScoreText: 'token=abc123',
        passed: 7,
        warnings: 1,
        errors: 0,
      },
    });

    expect(normalized).toMatchObject({
      success: true,
      outputSummary: 'authorization:[REDACTED]',
      verificationRequired: true,
      verifyPolicy: {
        requiresVerifyPath: true,
        requiresImpactReview: undefined,
        allowCompletionClaimWithoutVerify: false,
      },
      evidence: {
        source: 'doctor-last-run',
        healthScoreText: 'token=[REDACTED]',
        generatedAt: undefined,
        passed: 7,
        warnings: 1,
        errors: 0,
      },
      decisionClarity: {
        situation: 'authorization:[REDACTED]',
        reason: undefined,
        impactScope: [],
        risk: {
          confidenceBand: 'low',
          confidence: 0,
          mutating: true,
        },
        nextStep: undefined,
        verifyPlan: [],
        rollbackPlan: undefined,
        evidenceLinks: [],
        requiredMissingFields: ['nextStep', 'verifyPlan', 'impactScope', 'rollbackPlan'],
        mutationReady: false,
      },
    });
  });

  it('normalizes rollback evidence in action-result payload', () => {
    const normalized = normalizeIncidentActionResultPayload({
      success: false,
      outputSummary: 'inline-command failed after mutation',
      rollback: {
        attempted: true,
        status: ' partial ',
        reason: 'git restore partially failed due to locked file',
        attemptedAt: ' 2026-04-28T21:00:00.000Z ',
        candidateFiles: ['src/orders/service.ts', 'src/orders/service.ts'],
        restoredFiles: ['src/orders/service.ts'],
        failedFiles: ['src/orders/worker.ts'],
        suggestedNextStep: 'Run git status and restore remaining files manually.',
      },
    });

    expect(normalized.rollback).toEqual({
      attempted: true,
      status: 'partial',
      reason: 'git restore partially failed due to locked file',
      attemptedAt: '2026-04-28T21:00:00.000Z',
      candidateFiles: ['src/orders/service.ts'],
      restoredFiles: ['src/orders/service.ts'],
      failedFiles: ['src/orders/worker.ts'],
      suggestedNextStep: 'Run git status and restore remaining files manually.',
    });
  });

  it('normalizes diagnosis evidence in action-result payload', () => {
    const normalized = normalizeIncidentActionResultPayload({
      success: false,
      diagnosis: {
        confidence: 82,
        confidenceBand: ' HIGH ',
        signalSources: ['doctor-evidence', 'system-graph', 'doctor-evidence'],
        relatedFiles: ['src/orders/service.ts', 'src/orders/controller.ts'],
        recommendedFocus: 'authorization: Bearer secret-token',
      },
    });

    expect(normalized.diagnosis).toEqual({
      confidence: 82,
      confidenceBand: 'high',
      signalSources: ['doctor-evidence', 'system-graph'],
      relatedFiles: ['src/orders/service.ts', 'src/orders/controller.ts'],
      recommendedFocus: 'authorization:[REDACTED]',
    });
  });

  it('normalizes sandbox simulation evidence in action-result payload', () => {
    const normalized = normalizeIncidentActionResultPayload({
      success: false,
      sandboxSimulation: {
        actionId: ' action-123 ',
        workspacePath: ' /tmp/wsp ',
        riskClass: ' high-risk-mutating ',
        mode: 'verify-pack-simulation',
        status: ' failed ',
        startedAt: ' 2026-04-30T20:00:00.000Z ',
        completedAt: ' 2026-04-30T20:00:02.000Z ',
        durationMs: 2000,
        commandResults: [
          {
            label: 'verify: rapidkit',
            command: 'rapidkit',
            args: ['doctor', '--fix'],
            exitCode: 1,
            stdout: 'token=abc123',
            stderr: 'connection refused',
            durationMs: 1200,
          },
        ],
        recommendedRollbackPath: 'Restore workspace to previous baseline before retry.',
        safeToApply: false,
        reason: 'Sandbox verify command failed.',
      },
    });

    expect(normalized.sandboxSimulation).toEqual({
      actionId: 'action-123',
      workspacePath: '/tmp/wsp',
      riskClass: 'high-risk-mutating',
      mode: 'verify-pack-simulation',
      status: 'failed',
      startedAt: '2026-04-30T20:00:00.000Z',
      completedAt: '2026-04-30T20:00:02.000Z',
      durationMs: 2000,
      commandResults: [
        {
          label: 'verify: rapidkit',
          command: 'rapidkit',
          args: ['doctor', '--fix'],
          exitCode: 1,
          stdout: 'token=[REDACTED]',
          stderr: 'connection refused',
          durationMs: 1200,
        },
      ],
      recommendedRollbackPath: 'Restore workspace to previous baseline before retry.',
      safeToApply: false,
      reason: 'Sandbox verify command failed.',
    });
  });

  it('normalizes incident repro pack evidence in action-result payload', () => {
    const normalized = normalizeIncidentActionResultPayload({
      success: false,
      actionId: ' action-42 ',
      incidentReproPack: {
        packId: ' repro-001 ',
        status: ' captured ',
        capturedAt: ' 2026-05-01T09:00:00.000Z ',
        schemaVersion: 'v1',
        workspacePath: ' /tmp/wsp ',
        conversationId: ' conv-42 ',
        actionId: ' action-42 ',
        redaction: {
          policy: ' default ',
          applied: true,
          redactedFields: ['token', 'authorization', 'token'],
        },
        summary: {
          historyTurns: 6,
          hasDoctorEvidence: true,
          hasRollbackEvidence: false,
          hasSandboxEvidence: true,
          hasPredictiveWarning: true,
          verifySuccess: false,
          affectedFilesCount: 4,
          blockedReasonCount: 2,
        },
        replayPayload: {
          workspacePath: ' /tmp/wsp ',
          conversationId: ' conv-42 ',
          actionType: ' incident-repro-pack ',
          riskLevel: ' high ',
          likelyFailureMode: 'authorization: Bearer my-secret',
          verifyChecklist: ['Run doctor workspace', 'token=abc123'],
          blockedReasons: ['scope unknown'],
          relatedFiles: ['src/orders/service.ts', 'src/orders/service.ts'],
        },
        exportHint: 'password=super-secret',
      },
      memoryInfluenceAuditTimeline: [
        {
          memoryEventId: ' mem-evt-1 ',
          timestamp: ' 2026-05-11T08:00:00.000Z ',
          source: ' workspace-memory ',
          influenceKind: ' decision ',
          summary: 'token=abc123 affected recommendation quality',
          policyProfile: ' strict ',
          sensitivity: ' sensitive ',
          localProcessingMode: true,
          decisionArtifacts: {
            actionId: ' action-42 ',
            reproPackId: ' repro-001 ',
            releaseReadinessArtifactId: ' rrc-001 ',
          },
        },
      ],
    });

    expect(normalized.incidentReproPack).toEqual({
      packId: 'repro-001',
      status: 'captured',
      capturedAt: '2026-05-01T09:00:00.000Z',
      schemaVersion: 'v1',
      workspacePath: '/tmp/wsp',
      conversationId: 'conv-42',
      actionId: 'action-42',
      redaction: {
        policy: 'default',
        applied: true,
        redactedFields: ['token', 'authorization'],
      },
      summary: {
        historyTurns: 6,
        hasDoctorEvidence: true,
        hasRollbackEvidence: false,
        hasSandboxEvidence: true,
        hasPredictiveWarning: true,
        verifySuccess: false,
        affectedFilesCount: 4,
        blockedReasonCount: 2,
      },
      replayPayload: {
        workspacePath: '/tmp/wsp',
        conversationId: 'conv-42',
        actionType: 'incident-repro-pack',
        riskLevel: 'high',
        likelyFailureMode: 'authorization:[REDACTED]',
        verifyChecklist: ['Run doctor workspace', 'token=[REDACTED]'],
        blockedReasons: ['scope unknown'],
        relatedFiles: ['src/orders/service.ts'],
      },
      exportHint: 'password=[REDACTED]',
      sensitivityLabel: 'restricted',
    });

    expect(normalized.memoryInfluenceAuditTimeline).toEqual([
      {
        memoryEventId: 'mem-evt-1',
        timestamp: '2026-05-11T08:00:00.000Z',
        source: 'workspace-memory',
        influenceKind: 'decision',
        summary: 'token=[REDACTED] affected recommendation quality',
        policyProfile: 'strict',
        sensitivity: 'sensitive',
        localProcessingMode: true,
        decisionArtifacts: {
          actionId: 'action-42',
          reproPackId: 'repro-001',
          releaseReadinessArtifactId: 'rrc-001',
        },
      },
    ]);
  });

  it('normalizes release readiness commander artifact in action-result payload', () => {
    const normalized = normalizeIncidentActionResultPayload({
      success: false,
      actionId: ' action-rrc ',
      releaseReadinessCommander: {
        artifactId: ' rrc-001 ',
        schemaVersion: 'v1',
        generatedAt: ' 2026-05-03T10:00:00.000Z ',
        workspacePath: ' /tmp/wsp ',
        actionId: ' action-rrc ',
        decision: ' no-go ',
        confidence: 63.2,
        blockingReasons: ['scope unknown', 'verify path missing', 'scope unknown'],
        evidence: {
          verifyPackContractStatus: ' failed ',
          sandboxStatus: ' skipped ',
          doctorErrors: 2,
          doctorWarnings: 1,
          scopeKnown: false,
          verifyPathPresent: false,
          rollbackPathPresent: true,
        },
        summary: {
          goNoGoRationale: 'authorization: Bearer secret-token',
          recommendedNextStep: 'token=abc123',
        },
      },
    });

    expect(normalized.releaseReadinessCommander).toEqual({
      artifactId: 'rrc-001',
      schemaVersion: 'v1',
      generatedAt: '2026-05-03T10:00:00.000Z',
      workspacePath: '/tmp/wsp',
      actionId: 'action-rrc',
      decision: 'no-go',
      confidence: 63.2,
      blockingReasons: ['scope unknown', 'verify path missing'],
      evidence: {
        verifyPackContractStatus: 'failed',
        sandboxStatus: 'skipped',
        doctorErrors: 2,
        doctorWarnings: 1,
        scopeKnown: false,
        verifyPathPresent: false,
        rollbackPathPresent: true,
      },
      summary: {
        goNoGoRationale: 'authorization:[REDACTED]',
        recommendedNextStep: 'token=[REDACTED]',
      },
    });
  });

  it('normalizes C06 contract runtime evidence in action-result payload', () => {
    const normalized = normalizeIncidentActionResultPayload({
      success: false,
      contractRuntimeEvidence: {
        evaluated: true,
        source: ' mixed ',
        availableKinds: ['architecture.config', 'project.mapping', 'project.mapping'],
        missingKinds: ['execution.policy'],
        errors: ['C06 contract error: execution.policy version is required'],
        warnings: ['C06 contract warning: architecture.config has no services'],
        summary: 'token=abc123',
      },
    });

    expect(normalized.contractRuntimeEvidence).toEqual({
      evaluated: true,
      source: 'mixed',
      availableKinds: ['architecture.config', 'project.mapping'],
      missingKinds: ['execution.policy'],
      errors: ['C06 contract error: execution.policy version is required'],
      warnings: ['C06 contract warning: architecture.config has no services'],
      summary: 'token=[REDACTED]',
    });
  });

  it('normalizes verify command pack evidence in action-result payload', () => {
    const normalized = normalizeIncidentActionResultPayload({
      success: false,
      verifyCommandPack: {
        qualityScore: 88.7,
        readiness: ' ready ',
        rationale: 'token=abc123',
        commands: [
          {
            label: ' Workspace doctor ',
            command: ' rapidkit doctor workspace ',
            scope: ' workspace ',
            required: true,
          },
          {
            label: ' Targeted test ',
            command: ' vitest run src/test/incidentStudioStressGate.test.ts ',
            scope: ' project ',
            required: false,
          },
        ],
        blockedReasons: ['scope unknown', 'scope unknown'],
      },
    });

    expect(normalized.verifyCommandPack).toEqual({
      qualityScore: 88.7,
      readiness: 'ready',
      rationale: 'token=[REDACTED]',
      commands: [
        {
          label: 'Workspace doctor',
          command: 'rapidkit doctor workspace',
          scope: 'workspace',
          required: true,
        },
        {
          label: 'Targeted test',
          command: 'vitest run src/test/incidentStudioStressGate.test.ts',
          scope: 'project',
          required: false,
        },
      ],
      blockedReasons: ['scope unknown'],
    });

    expect(normalized.decisionClarity).toEqual({
      situation: undefined,
      reason: undefined,
      impactScope: [],
      risk: {
        confidenceBand: 'low',
        confidence: 0,
        mutating: false,
      },
      nextStep: 'Resolve verify blocker: scope unknown.',
      verifyPlan: ['rapidkit doctor workspace'],
      rollbackPlan: undefined,
      evidenceLinks: ['scope unknown'],
      requiredMissingFields: ['situation'],
      mutationReady: false,
    });
  });

  it('marks decision clarity as mutation-ready when mandatory fields are present for mutating flow', () => {
    const normalized = normalizeIncidentActionResultPayload({
      success: false,
      outputSummary: 'Orders write path failed after config change.',
      verifyPolicy: {
        requiresVerifyPath: true,
        requiresImpactReview: true,
      },
      diagnosis: {
        confidence: 78,
        confidenceBand: 'high',
        signalSources: ['doctor-evidence', 'system-graph'],
        relatedFiles: ['src/orders/service.ts', 'src/orders/repository.ts'],
        recommendedFocus: 'Dependency chain changed in persistence layer.',
      },
      verifyCommandPack: {
        qualityScore: 90,
        readiness: 'ready',
        rationale: 'Run required checks before any apply step.',
        commands: [
          {
            label: 'integration verify',
            command: 'npm run test:integration',
            scope: 'project',
            required: true,
          },
        ],
        blockedReasons: [],
      },
      rollback: {
        attempted: false,
        status: 'skipped',
        suggestedNextStep: 'Restore affected files with git restore and rerun verify.',
      },
    });

    expect(normalized.decisionClarity).toEqual({
      situation: 'Orders write path failed after config change.',
      reason: 'Dependency chain changed in persistence layer.',
      impactScope: ['src/orders/service.ts', 'src/orders/repository.ts'],
      risk: {
        confidenceBand: 'high',
        confidence: 78,
        mutating: true,
      },
      nextStep: 'Run the primary verify step and inspect the result before claiming completion.',
      verifyPlan: ['npm run test:integration'],
      rollbackPlan: 'Restore affected files with git restore and rerun verify.',
      evidenceLinks: ['doctor-evidence', 'system-graph'],
      requiredMissingFields: [],
      mutationReady: true,
    });
  });

  it('normalizes action-progress payload with clamped progress and safe defaults', () => {
    expect(
      normalizeIncidentActionProgressPayload({
        stage: 'streaming',
        progress: 140,
        note: 'password=hello123',
      })
    ).toEqual({
      stage: 'streaming',
      progress: 100,
      note: 'password=[REDACTED]',
    });

    expect(normalizeIncidentActionProgressPayload({})).toEqual({
      stage: 'running',
      progress: 0,
      note: undefined,
    });
  });

  it('normalizes done payload and redacts sensitive final text tokens', () => {
    expect(
      normalizeIncidentDonePayload({
        modelId: ' gpt-5 ',
        finalText: 'Use api_key=prod-123 for this request',
      })
    ).toEqual({
      modelId: 'gpt-5',
      finalText: 'Use api_key=[REDACTED] for this request',
    });

    expect(normalizeIncidentDonePayload(null)).toEqual({
      modelId: undefined,
      finalText: undefined,
    });
  });

  it('normalizes system graph snapshot payload for architecture-aware flow contracts', () => {
    const normalized = normalizeIncidentSystemGraphSnapshotPayload({
      requestId: ' req-graph-1 ',
      workspacePath: ' /tmp/wsp ',
      projectPath: ' /tmp/wsp/orders-api ',
      graphVersion: ' v2 ',
      nodes: [
        {
          id: 'route.orders.create',
          type: 'route',
          label: 'Create order route',
          filePath: 'src/routes/orders.ts',
          confidence: 120,
        },
        {
          id: 'service.orders',
          type: 'service',
          label: 'Orders service',
          confidence: -5,
        },
        { type: 'model' },
      ],
      edges: [
        {
          sourceId: 'route.orders.create',
          targetId: 'service.orders',
          relation: 'calls',
        },
        {
          sourceId: '',
          targetId: 'service.orders',
          relation: 'invalid',
        },
      ],
      summary: {
        supportedTopology: ' fastapi-monolith ',
      },
    });

    expect(normalized).toEqual({
      requestId: 'req-graph-1',
      workspacePath: '/tmp/wsp',
      projectPath: '/tmp/wsp/orders-api',
      graphVersion: 'v2',
      nodes: [
        {
          id: 'route.orders.create',
          type: 'route',
          label: 'Create order route',
          filePath: 'src/routes/orders.ts',
          confidence: 100,
        },
        {
          id: 'service.orders',
          type: 'service',
          label: 'Orders service',
          filePath: undefined,
          confidence: 0,
        },
      ],
      edges: [
        {
          sourceId: 'route.orders.create',
          targetId: 'service.orders',
          relation: 'calls',
        },
      ],
      summary: {
        nodeCount: 2,
        edgeCount: 1,
        supportedTopology: 'fastapi-monolith',
      },
    });

    expect(normalizeIncidentSystemGraphSnapshotPayload({ workspacePath: '   ' })).toBeNull();
  });

  it('normalizes impact assessment payload with fail-safe mutation blocking defaults', () => {
    expect(
      normalizeIncidentImpactAssessmentPayload({
        requestId: ' impact-1 ',
        source: ['graph', 'doctor', 'graph'],
        confidence: 141,
        riskLevel: 'critical',
        affectedFiles: ['src/orders/service.ts', 'src/orders/service.ts'],
        affectedModules: ['orders'],
        affectedTests: ['tests/orders/service.spec.ts'],
        likelyFailureMode: ' null pointer in orders flow ',
        rationale: ['edge route->service changed'],
        verifyChecklist: ['run order tests'],
        blockMutationWhenScopeUnknown: false,
        impactScoreContract: {
          schemaVersion: ' e1-impact-score-contract.v1 ',
          scoringModelVersion: ' c11-deterministic.v1 ',
          scopeModelVersion: ' graph-seed-scope.v1 ',
          generatedAt: ' 2026-05-12T00:00:00.000Z ',
          supportedTopology: ' node.backend ',
          scopeKnown: true,
          confidence: 88,
          riskLevel: 'high',
          impactedModules: ['orders', 'payments', 'orders'],
          candidateTests: ['tests/orders/service.spec.ts'],
          crossServiceBoundaryPaths: ['orders -> payments'],
          signalCounts: {
            impactedNodeCount: 7,
            impactedEdgeCount: 5,
            impactedModuleCount: 2,
            candidateTestCount: 1,
            crossServiceBoundaryCount: 1,
          },
          blockedReasons: ['review cross-service impact', 'review cross-service impact'],
          architectureWarnings: ['boundary hop'],
          likelyFailureMode: ' downstream timeout ',
        },
      })
    ).toEqual({
      requestId: 'impact-1',
      sources: ['graph', 'doctor'],
      confidence: 100,
      riskLevel: 'critical',
      affectedFiles: ['src/orders/service.ts'],
      affectedModules: ['orders'],
      affectedTests: ['tests/orders/service.spec.ts'],
      impactScoreContract: {
        schemaVersion: 'e1-impact-score-contract.v1',
        scoringModelVersion: 'c11-deterministic.v1',
        scopeModelVersion: 'graph-seed-scope.v1',
        generatedAt: '2026-05-12T00:00:00.000Z',
        supportedTopology: 'node.backend',
        scopeKnown: true,
        confidence: 88,
        riskLevel: 'high',
        impactedModules: ['orders', 'payments'],
        candidateTests: ['tests/orders/service.spec.ts'],
        crossServiceBoundaryPaths: ['orders -> payments'],
        signalCounts: {
          impactedNodeCount: 7,
          impactedEdgeCount: 5,
          impactedModuleCount: 2,
          candidateTestCount: 1,
          crossServiceBoundaryCount: 1,
        },
        blockedReasons: ['review cross-service impact'],
        architectureWarnings: ['boundary hop'],
        likelyFailureMode: 'downstream timeout',
      },
      likelyFailureMode: 'null pointer in orders flow',
      rationale: ['edge route->service changed'],
      verifyChecklist: ['run order tests'],
      blockMutationWhenScopeUnknown: false,
    });

    expect(normalizeIncidentImpactAssessmentPayload({})).toMatchObject({
      requestId: undefined,
      sources: [],
      confidence: 0,
      riskLevel: 'medium',
      affectedFiles: [],
      blockMutationWhenScopeUnknown: true,
    });
  });

  it('normalizes predictive warning payload and defaults confidence safely', () => {
    expect(
      normalizeIncidentPredictiveWarningPayload({
        requestId: ' pred-1 ',
        warningId: ' warn-1 ',
        confidenceBand: 'high',
        predictedFailure: ' timeout risk in checkout ',
        affectedScopeSummary: 'orders-api + payment-worker',
        nextSafeAction: 'run staged verify pack',
        verifyChecklist: ['npm run test:orders'],
        telemetrySeed: {
          predictionKey: ' pred-key-1 ',
          evidenceSources: ['graph', 'doctor'],
        },
      })
    ).toEqual({
      requestId: 'pred-1',
      warningId: 'warn-1',
      confidenceBand: 'high',
      predictedFailure: 'timeout risk in checkout',
      affectedScopeSummary: 'orders-api + payment-worker',
      nextSafeAction: 'run staged verify pack',
      verifyChecklist: ['npm run test:orders'],
      telemetrySeed: {
        predictionKey: 'pred-key-1',
        evidenceSources: ['graph', 'doctor'],
      },
    });

    expect(normalizeIncidentPredictiveWarningPayload({ requestId: 'pred-2' })).toMatchObject({
      warningId: 'pred-2',
      confidenceBand: 'medium',
      telemetrySeed: {
        predictionKey: 'pred-2',
      },
    });
  });

  it('normalizes release gate evidence payload with fail-safe boolean defaults', () => {
    expect(
      normalizeIncidentReleaseGateEvidencePayload({
        requestId: ' gate-1 ',
        scopeKnown: true,
        verifyPathPresent: true,
        rollbackPathPresent: false,
        confidenceSufficient: true,
        blockedReasons: ['rollback path missing', 'rollback path missing'],
      })
    ).toEqual({
      requestId: 'gate-1',
      scopeKnown: true,
      verifyPathPresent: true,
      rollbackPathPresent: false,
      confidenceSufficient: true,
      blockedReasons: ['rollback path missing'],
    });

    expect(normalizeIncidentReleaseGateEvidencePayload({})).toEqual({
      requestId: undefined,
      scopeKnown: false,
      verifyPathPresent: false,
      rollbackPathPresent: false,
      confidenceSufficient: false,
      blockedReasons: [],
    });
  });

  it('preserves AI action proof metadata for latest outcome presentation', () => {
    const normalized = normalizeIncidentActionResultPayload({
      success: true,
      summary: 'AI action verify completed successfully.',
      outputSummary: 'AI action verify completed successfully.',
      proof: {
        schemaVersion: 'workspai.ai-action-proof-summary.v1',
        evidenceRequired: true,
        evidencePresent: true,
        evidenceSha256Present: true,
        transcriptRequired: true,
        transcriptCommandCount: 2,
        failedCommandCount: 0,
        rollbackProofRequired: true,
        rollbackPlanPresent: true,
        complete: true,
        issues: ['ignored duplicate?', 'kept for display'],
      },
      proofEvent: {
        schemaVersion: 'workspai.studio.proof-event.v1',
        actionId: 'ai-action-verify',
        status: 'completed',
        summary: 'Verify completed.',
        generatedAt: '2026-06-19T00:00:00.000Z',
        evidencePath: '/tmp/evidence.json',
        evidenceSha256: 'a'.repeat(64),
        commandCount: 2,
        failedCommandCount: 0,
        source: 'ai-action',
      },
      evidencePath: '/tmp/evidence.json',
      evidenceSha256: 'a'.repeat(64),
      evidenceSizeBytes: 2048,
      commandCount: 2,
      failedCommandCount: 0,
      failedCommands: ['npm test'],
    });

    expect(normalized.proof).toMatchObject({
      schemaVersion: 'workspai.ai-action-proof-summary.v1',
      evidencePresent: true,
      transcriptCommandCount: 2,
      rollbackProofRequired: true,
      complete: true,
    });
    expect(normalized.proofEvent).toMatchObject({
      schemaVersion: 'workspai.studio.proof-event.v1',
      actionId: 'ai-action-verify',
      status: 'completed',
      evidenceSha256: 'a'.repeat(64),
      commandCount: 2,
      source: 'ai-action',
    });
    expect(normalized.evidenceSha256).toBe('a'.repeat(64));
    expect(normalized.failedCommands).toEqual(['npm test']);

    expect(
      normalizeIncidentActionResultPayload({
        success: true,
        proof: { schemaVersion: 'wrong' },
        proofEvent: { schemaVersion: 'wrong' },
      })
    ).toMatchObject({
      proof: undefined,
      proofEvent: undefined,
    });
  });
});

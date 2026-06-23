import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: () => undefined,
    }),
  },
  Uri: { file: (value: string) => ({ fsPath: value }) },
}));

import {
  buildIncidentDiagnosisEvidence,
  buildIncidentReproPackEvidence,
  buildMemoryInfluenceAuditTimeline,
  buildReleaseReadinessCommanderArtifact,
} from '../ui/panels/welcomePanelIncidentEvidence';

describe('welcomePanelIncidentEvidence', () => {
  const actionPolicy = {
    requiresImpactReview: true,
    requiresVerifyPath: true,
    riskClass: 'guarded-mutating' as const,
  };

  it('builds diagnosis confidence from doctor and graph signals', () => {
    const result = buildIncidentDiagnosisEvidence({
      actionPolicy,
      verifyReady: true,
      verifySuccess: false,
      doctorEvidence: {
        healthScoreText: '80%',
        passed: 8,
        warnings: 1,
        errors: 0,
      },
      impactAssessment: {
        affectedFiles: ['src/api.ts'],
        affectedModules: ['api'],
        verifyChecklist: ['Run targeted tests'],
      },
      graphSnapshot: {
        nodes: [{ filePath: 'src/api.ts' }],
      },
    });

    expect(result.signalSources).toContain('doctor-evidence');
    expect(result.signalSources).toContain('verify-failed');
    expect(result.confidenceBand).toBe('high');
    expect(result.relatedFiles).toContain('src/api.ts');
  });

  it('records memory influence audit entries with policy metadata', () => {
    const timeline = buildMemoryInfluenceAuditTimeline({
      actionId: 'act-1',
      actionType: 'incident-repro-pack',
      graphSnapshot: {
        memory: {
          hasMemory: true,
          policyProfile: 'enterprise-default',
          sensitivity: 'internal',
          localProcessingMode: true,
        },
      },
      decisionClarityMissingFields: ['verifyPlan'],
      releaseGateBlockedReasons: ['scope unknown'],
      incidentReproPackId: 'pack-1',
    });

    expect(timeline).toHaveLength(4);
    expect(timeline[0]?.policyProfile).toBe('enterprise-default');
    expect(timeline[3]?.influenceKind).toBe('artifact-link');
  });

  it('builds repro pack and release readiness artifacts for supported action types', () => {
    const repro = buildIncidentReproPackEvidence({
      actionType: 'incident-repro-pack',
      actionId: 'act-2',
      conversationId: 'conv-1',
      workspacePath: '/tmp/ws',
      verifySuccess: false,
      conversationHistoryTurns: 3,
      impactAssessment: {
        riskLevel: 'high',
        verifyChecklist: ['rapidkit doctor workspace'],
        affectedFiles: ['AGENTS.md'],
      },
      releaseGateEvidence: { blockedReasons: ['scope unknown'] },
      diagnosisEvidence: { relatedFiles: ['AGENTS.md'] },
    });

    const release = buildReleaseReadinessCommanderArtifact({
      actionType: 'release-readiness-commander',
      actionId: 'act-3',
      workspacePath: '/tmp/ws',
      confidence: 72,
      verifySuccess: false,
      releaseGateEvidence: {
        scopeKnown: false,
        verifyPathPresent: false,
        rollbackPathPresent: false,
        blockedReasons: ['scope unknown'],
      },
    });

    expect(repro?.status).toBe('captured');
    expect(repro?.sensitivityLabel).toBe('restricted');
    expect(release?.decision).toBe('no-go');
    expect(release?.blockingReasons.length).toBeGreaterThan(0);
  });
});

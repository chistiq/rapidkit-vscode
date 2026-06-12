import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ActionOutcomePanel } from '../../webview-ui/src/components/StudioRedesign/regions/ActionOutcomePanel';
import { buildActionOutcomePresentation } from '../../webview-ui/src/lib/incidentStudioActionOutcomePresentation';

describe('ActionOutcomePanel presentation', () => {
  it('renders guarded NO-GO headline and decision clarity evidence', () => {
    const presentation = buildActionOutcomePresentation(
      {
        success: true,
        outputSummary: 'All checks passed locally.',
        releaseReadinessCommander: {
          artifactId: 'artifact-no-go-1',
          schemaVersion: 'v1',
          generatedAt: '2026-05-12T10:00:00Z',
          workspacePath: '/workspace/acme',
          actionId: 'action-1',
          decision: 'no-go',
          confidence: 82,
          blockingReasons: ['Rollback path is missing'],
          evidence: {
            verifyPackContractStatus: 'failed',
            sandboxStatus: 'failed',
            doctorErrors: 0,
            doctorWarnings: 0,
            scopeKnown: true,
            verifyPathPresent: true,
            rollbackPathPresent: false,
          },
          summary: {
            goNoGoRationale: 'NO-GO because rollback evidence is incomplete.',
            recommendedNextStep: 'Define rollback path and rerun verification.',
          },
        },
        decisionClarity: {
          situation: 'Orders write path failed after config change.',
          reason: 'Dependency chain changed in persistence layer.',
          impactScope: ['src/orders/service.ts'],
          risk: { confidenceBand: 'high', confidence: 78, mutating: true },
          nextStep: 'npm run test:integration',
          verifyPlan: ['npm run test:integration'],
          rollbackPlan: 'git checkout src/orders/service.ts',
          evidenceLinks: ['doctor-evidence', 'system-graph'],
          requiredMissingFields: [],
          mutationReady: true,
        },
      },
      []
    );

    expect(presentation).not.toBeNull();
    const html = renderToStaticMarkup(
      createElement(ActionOutcomePanel, { presentation: presentation! })
    );

    expect(html).toContain('Release blocked (NO-GO evidence)');
    expect(html).toContain('Evidence: doctor-evidence | system-graph');
    expect(html).toContain('studio-action-outcome');
  });

  it('renders repro pack and memory influence timeline blocks', () => {
    const presentation = buildActionOutcomePresentation({
      success: false,
      outputSummary: 'Captured repro pack for auth regression.',
      incidentReproPack: {
        packId: 'repro-pack-42',
        status: 'captured',
        capturedAt: '2026-05-11T04:00:00Z',
        schemaVersion: 'v1',
        workspacePath: '/workspace/acme',
        conversationId: 'conv-1',
        actionId: 'action-1',
        redaction: { policy: 'strict', applied: true, redactedFields: ['token'] },
        summary: {
          historyTurns: 4,
          hasDoctorEvidence: true,
          hasRollbackEvidence: false,
          hasSandboxEvidence: false,
          hasPredictiveWarning: true,
          verifySuccess: false,
          affectedFilesCount: 2,
          blockedReasonCount: 1,
        },
        replayPayload: {
          workspacePath: '/workspace/acme',
          conversationId: 'conv-1',
          actionType: 'doctor-fix',
          riskLevel: 'high',
          verifyChecklist: ['npm run test:integration'],
          blockedReasons: ['scope unknown'],
          relatedFiles: ['src/orders/service.ts'],
        },
        sensitivityLabel: 'restricted',
      },
      memoryInfluenceAuditTimeline: [
        {
          memoryEventId: 'memory-action-1-decision',
          timestamp: '2026-05-11T04:00:01Z',
          source: 'workspace-memory',
          influenceKind: 'decision',
          summary: 'Workspace memory context informed verify-first next step.',
          policyProfile: 'strict',
          sensitivity: 'sensitive',
          localProcessingMode: true,
          decisionArtifacts: { actionId: 'action-1', reproPackId: 'repro-pack-42' },
        },
      ],
    });

    expect(presentation).not.toBeNull();
    const html = renderToStaticMarkup(
      createElement(ActionOutcomePanel, { presentation: presentation! })
    );

    expect(html).toContain('repro-pack-42');
    expect(html).toContain('RESTRICTED');
    expect(html).toContain('Memory influence timeline');
  });

  it('renders repro pack and patch review actions when callbacks are wired', () => {
    const presentation = buildActionOutcomePresentation({
      success: false,
      outputSummary: 'Patch ready for review.',
      incidentReproPack: {
        packId: 'repro-pack-actions',
        status: 'captured',
        capturedAt: '2026-05-11T04:00:00Z',
        schemaVersion: 'v1',
        workspacePath: '/workspace/acme',
        conversationId: 'conv-1',
        actionId: 'action-1',
        redaction: { policy: 'strict', applied: true, redactedFields: [] },
        summary: {
          historyTurns: 2,
          hasDoctorEvidence: true,
          hasRollbackEvidence: false,
          hasSandboxEvidence: false,
          hasPredictiveWarning: false,
          verifySuccess: false,
          affectedFilesCount: 1,
          blockedReasonCount: 0,
        },
        replayPayload: {
          workspacePath: '/workspace/acme',
          conversationId: 'conv-1',
          actionType: 'fix',
          riskLevel: 'low',
          verifyChecklist: ['npm test'],
          blockedReasons: [],
          relatedFiles: ['src/a.ts'],
        },
        sensitivityLabel: 'internal',
      },
      multiFilePatch: {
        patchId: 'patch-99',
        generatedAt: '2026-05-11T04:00:00Z',
        actionId: 'action-1',
        patches: [
          {
            relativePath: 'src/a.ts',
            isNewFile: false,
            patchedContent: 'export const ok = true;',
            hunks: [],
            status: 'pending',
          },
        ],
        appliedCount: 0,
        rejectedCount: 0,
        failedCount: 0,
      },
    });

    expect(presentation).not.toBeNull();
    const html = renderToStaticMarkup(
      createElement(ActionOutcomePanel, {
        presentation: presentation!,
        actionResult: {
          success: false,
          outputSummary: 'Patch ready for review.',
          incidentReproPack: {
            packId: 'repro-pack-actions',
            status: 'captured',
            capturedAt: '2026-05-11T04:00:00Z',
            schemaVersion: 'v1',
            workspacePath: '/workspace/acme',
            conversationId: 'conv-1',
            actionId: 'action-1',
            redaction: { policy: 'strict', applied: true, redactedFields: [] },
            summary: {
              historyTurns: 2,
              hasDoctorEvidence: true,
              hasRollbackEvidence: false,
              hasSandboxEvidence: false,
              hasPredictiveWarning: false,
              verifySuccess: false,
              affectedFilesCount: 1,
              blockedReasonCount: 0,
            },
            replayPayload: {
              workspacePath: '/workspace/acme',
              conversationId: 'conv-1',
              actionType: 'fix',
              riskLevel: 'low',
              verifyChecklist: ['npm test'],
              blockedReasons: [],
              relatedFiles: ['src/a.ts'],
            },
            sensitivityLabel: 'internal',
          },
          multiFilePatch: {
            patchId: 'patch-99',
            generatedAt: '2026-05-11T04:00:00Z',
            actionId: 'action-1',
            patches: [
              {
                relativePath: 'src/a.ts',
                isNewFile: false,
                patchedContent: 'export const ok = true;',
                hunks: [],
                status: 'pending',
              },
            ],
            appliedCount: 0,
            rejectedCount: 0,
            failedCount: 0,
          },
        },
        callbacks: {
          onExportReproPack: () => undefined,
          onImportReproPack: () => undefined,
          onReplayReproPack: () => undefined,
          onApplyPatch: () => undefined,
        },
      })
    );

    expect(html).toContain('Export');
    expect(html).toContain('Import');
    expect(html).toContain('Replay');
    expect(html).toContain('Multi-file patch review');
    expect(html).toContain('src/a.ts');
    expect(html).toContain('Apply selected patches');
  });
});

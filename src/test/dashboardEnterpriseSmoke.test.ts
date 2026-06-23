import { describe, expect, it } from 'vitest';

import { buildDashboardEvidenceBundle } from '../core/dashboardEvidenceBridge';
import {
  deriveDashboardReleaseGateReadiness,
  isWorkspaceEmptyForRelease,
} from '../../webview-ui/src/lib/dashboardReleaseReadiness';
import { resolveStudioCodeChangeActionBlockReason } from '../../webview-ui/src/lib/studioCodeChangeGate';
import { EVIDENCE_CARD_COMMANDS } from '../../webview-ui/src/lib/dashboardEvidenceActions';

describe('dashboard enterprise smoke scenarios', () => {
  it('empty workspace: release hub blocked and no analyze for fix-lens', async () => {
    const bundle = await buildDashboardEvidenceBundle({
      workspacePath: '/tmp/empty-workspace',
      projectPath: undefined,
    });

    const modelCard = bundle.cards.find((card) => card.id === 'workspaceModel');
    if (modelCard) {
      modelCard.metrics = { projectCount: 0 };
    }

    expect(
      isWorkspaceEmptyForRelease({
        cards: bundle.cards,
        activity: [],
        onboarding: {
          isFreshInstall: false,
          recentWorkspaceCount: 1,
          hasActiveWorkspace: true,
        },
      })
    ).toBe(true);

    const releaseGate = deriveDashboardReleaseGateReadiness({
      cards: bundle.cards,
      activity: [],
      onboarding: {
        isFreshInstall: false,
        recentWorkspaceCount: 1,
        hasActiveWorkspace: true,
      },
    });
    expect(releaseGate.releaseReady).toBe(false);
    expect(resolveStudioCodeChangeActionBlockReason('fix-lens', null)).not.toBeNull();
  });

  it('polyglot workspace with projects: verify stage required before release', () => {
    const evidence = {
      cards: [
        {
          id: 'workspaceModel',
          label: 'Model',
          status: 'pass',
          summary: 'polyglot',
          scope: 'workspace',
          metrics: { projectCount: 3 },
        },
        {
          id: 'readiness',
          label: 'Readiness',
          status: 'pass',
          summary: 'ok',
          scope: 'workspace',
        },
        {
          id: 'analyze',
          label: 'Analyze',
          status: 'warn',
          summary: 'attention',
          scope: 'workspace',
        },
        {
          id: 'workspaceVerify',
          label: 'Verify',
          status: 'missing',
          summary: 'missing',
          scope: 'workspace',
        },
      ],
      activity: [],
      onboarding: {
        isFreshInstall: false,
        recentWorkspaceCount: 2,
        hasActiveWorkspace: true,
      },
    };

    const gate = deriveDashboardReleaseGateReadiness(evidence);
    expect(gate.releaseReady).toBe(false);
    expect(gate.needsStudioVerify).toBe(true);
  });

  it('imported project bundle includes import readiness and studio doctor target', async () => {
    const fs = await import('fs-extra');
    const os = await import('os');
    const path = await import('path');

    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wsp-import-smoke-'));
    const workspacePath = path.join(root, 'workspace');
    const projectPath = path.join(workspacePath, 'api');
    await fs.ensureDir(path.join(projectPath, '.rapidkit'));
    await fs.writeJson(path.join(projectPath, '.rapidkit', 'import-readiness.json'), {
      status: 'review',
      generatedAt: '2026-01-01T00:00:00.000Z',
      detection: { frameworkDisplayName: 'NestJS' },
      checks: [],
    });

    const bundle = await buildDashboardEvidenceBundle({
      workspacePath,
      projectPath,
      projectName: 'api',
    });

    const importCard = bundle.cards.find((card) => card.id === 'importReadiness');
    expect(importCard?.status).toBe('warn');
    expect(importCard?.incidentStudioTarget).toBe('doctor');
    expect(EVIDENCE_CARD_COMMANDS.importReadiness).toBe('projectDoctor');
  });
});

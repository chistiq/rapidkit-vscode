import { describe, expect, it } from 'vitest';

import { buildAnalyzeLoadKey } from '../../webview-ui/src/lib/analyzeScopeKey';
import {
  isAnalyzeEvidencePending,
  parseReportExistsResult,
  parseReportLoadedMessage,
} from '../../webview-ui/src/lib/analyzeReportBridge';

describe('smoke: Incident Studio analyze', () => {
  it('resolves loading to empty state (not infinite spinner)', () => {
    expect(
      isAnalyzeEvidencePending({
        isLoading: false,
        report: null,
        error: null,
        exists: false,
      })
    ).toBe(false);
  });

  it('stays pending until reportLoaded even when exists=false arrives first', () => {
    expect(
      isAnalyzeEvidencePending({
        isLoading: true,
        report: null,
        error: null,
        exists: false,
      })
    ).toBe(true);
  });

  it('surfaces host errors before report body', () => {
    const parsed = parseReportLoadedMessage({ data: null, error: 'Report file not found' });
    expect(parsed.error).toBe('Report file not found');
    expect(
      isAnalyzeEvidencePending({
        isLoading: false,
        report: parsed.report,
        error: parsed.error,
        exists: parseReportExistsResult({ exists: false }),
      })
    ).toBe(false);
  });
});

describe('smoke: dashboard section navigation', () => {
  it('normalizes persisted dashboard section values', async () => {
    const { normalizeDashboardSection, dashboardSectionNeedsCatalog } =
      await import('../../webview-ui/src/lib/dashboardSections');

    expect(normalizeDashboardSection('catalog')).toBe('catalog');
    expect(normalizeDashboardSection('workspaces')).toBe('catalog');
    expect(normalizeDashboardSection('invalid')).toBe('overview');
    expect(normalizeDashboardSection('evidence')).toBe('evidence');
    expect(normalizeDashboardSection('repair')).toBe('repair');
    expect(normalizeDashboardSection('operate')).toBe('operate');
    expect(dashboardSectionNeedsCatalog('console')).toBe(true);
    expect(dashboardSectionNeedsCatalog('overview')).toBe(false);
    expect(dashboardSectionNeedsCatalog('evidence')).toBe(false);

    const {
      dashboardSectionForOpsChainStep,
      dashboardSectionForIncidentTarget,
      dashboardSectionLabel,
      dashboardSectionScope,
    } = await import('../../webview-ui/src/lib/dashboardSections');

    expect(dashboardSectionForOpsChainStep('doctor')).toBe('operate');
    expect(dashboardSectionForOpsChainStep('analyze')).toBe('repair');
    expect(dashboardSectionForIncidentTarget('doctor')).toBe('operate');
    expect(dashboardSectionForIncidentTarget('release')).toBe('repair');
    expect(dashboardSectionLabel('operate')).toBe('Run');
    expect(dashboardSectionScope('console')).toBe('lifecycle');
  });

  it('formats home health summaries from evidence cards', async () => {
    const {
      formatHomeEvidenceDetail,
      formatHomeGovernanceDetail,
      homeEvidenceMetricValue,
      homeGovernanceMetricValue,
    } = await import('../../webview-ui/src/lib/dashboardEvidence');

    const evidence = {
      cards: [
        {
          id: 'doctor',
          label: 'Doctor',
          status: 'pass',
          summary: 'All checks passed',
          scope: 'workspace',
        },
        {
          id: 'pipeline',
          label: 'Pipeline',
          status: 'warn',
          summary: 'Readiness gate pending',
          scope: 'workspace',
        },
      ],
      activity: [],
      onboarding: {
        isFreshInstall: false,
        recentWorkspaceCount: 1,
        hasActiveWorkspace: true,
      },
    };

    expect(homeEvidenceMetricValue(evidence, 0)).toBe('Healthy');
    expect(formatHomeEvidenceDetail(evidence)).toContain('Doctor: All checks passed');
    expect(homeGovernanceMetricValue(evidence, 0, true)).toBe('Needs attention');
    expect(formatHomeGovernanceDetail(evidence)).toContain('Pipeline: Readiness gate pending');
  });
});

describe('smoke: module framework support', () => {
  it('allows installs only for FastAPI and NestJS projects', async () => {
    const { isModuleInstallSupported, isUnsupportedModuleProjectType, getProjectFrameworkLabel } =
      await import('../../webview-ui/src/lib/moduleSupport');

    expect(isModuleInstallSupported('fastapi', true)).toBe(true);
    expect(isModuleInstallSupported('nestjs', true)).toBe(true);
    expect(isModuleInstallSupported('go', true)).toBe(false);
    expect(isModuleInstallSupported('nextjs', true)).toBe(false);
    expect(isModuleInstallSupported('fastapi', false)).toBe(false);
    expect(isUnsupportedModuleProjectType('dotnet')).toBe(true);
    expect(isUnsupportedModuleProjectType('remix')).toBe(true);
    expect(getProjectFrameworkLabel('springboot')).toBe('Spring Boot');
  });
});

describe('smoke: dashboard next steps', () => {
  it('prioritizes bootstrap compliance fixes', async () => {
    const { buildDashboardNextSteps } = await import('../../webview-ui/src/lib/dashboardNextSteps');

    const steps = buildDashboardNextSteps({
      workspaceStatus: {
        hasWorkspace: true,
        workspacePath: '/tmp/ws',
        hasProjectSelected: true,
        projectType: 'fastapi',
      },
      activeWorkspace: {
        name: 'ws',
        path: '/tmp/ws',
        complianceStatus: 'failing',
      },
      installStatusChecked: true,
      coreInstalled: true,
      evidence: {
        cards: [
          {
            id: 'bootstrap',
            label: 'Bootstrap compliance',
            status: 'fail',
            summary: 'Policy drift detected',
          },
        ],
        activity: [],
        onboarding: {
          isFreshInstall: false,
          recentWorkspaceCount: 1,
          hasActiveWorkspace: true,
        },
      },
    });

    expect(steps[0]?.id).toBe('bootstrap-fix');
    expect(steps[0]?.section).toBe('operate');
  });

  it('defers fresh-install CTAs to Welcome onboarding (empty next steps)', async () => {
    const { buildDashboardNextSteps } = await import('../../webview-ui/src/lib/dashboardNextSteps');

    const steps = buildDashboardNextSteps({
      workspaceStatus: {
        hasWorkspace: false,
      },
      installStatusChecked: true,
      coreInstalled: true,
      evidence: {
        cards: [],
        activity: [],
        onboarding: {
          isFreshInstall: true,
          recentWorkspaceCount: 0,
          hasActiveWorkspace: false,
        },
      },
    });

    expect(steps).toEqual([]);
  });

  it('surfaces doctor blockers from evidence cards', async () => {
    const { buildDashboardNextSteps } = await import('../../webview-ui/src/lib/dashboardNextSteps');

    const steps = buildDashboardNextSteps({
      workspaceStatus: {
        hasWorkspace: true,
        workspacePath: '/tmp/ws',
        hasProjectSelected: true,
        projectType: 'fastapi',
      },
      installStatusChecked: true,
      coreInstalled: true,
      evidence: {
        cards: [
          {
            id: 'doctor',
            label: 'Doctor',
            status: 'fail',
            blocking: true,
            summary: '2 errors blocking release',
            blockers: ['2 errors blocking release'],
          },
        ],
        activity: [],
        onboarding: {
          isFreshInstall: false,
          recentWorkspaceCount: 1,
          hasActiveWorkspace: true,
        },
      },
    });

    expect(steps[0]?.id).toBe('doctor-errors');
    expect(steps[0]?.section).toBe('operate');
  });

  it('routes analyze blockers to the evidence section', async () => {
    const { buildDashboardNextSteps } = await import('../../webview-ui/src/lib/dashboardNextSteps');

    const steps = buildDashboardNextSteps({
      workspaceStatus: {
        hasWorkspace: true,
        workspacePath: '/tmp/ws',
        hasProjectSelected: true,
        projectType: 'fastapi',
      },
      installStatusChecked: true,
      coreInstalled: true,
      evidence: {
        cards: [
          {
            id: 'analyze',
            label: 'Analyze',
            status: 'fail',
            blocking: true,
            summary: 'Strict analyze failed',
            blockers: ['Strict analyze failed'],
          },
        ],
        activity: [],
        onboarding: {
          isFreshInstall: false,
          recentWorkspaceCount: 1,
          hasActiveWorkspace: true,
        },
      },
    });

    expect(steps[0]?.id).toBe('analyze-blockers');
    expect(steps[0]?.section).toBe('repair');
  });

  it('counts actionable evidence attention from outcome cards', async () => {
    const { countEvidenceAttention } = await import('../../webview-ui/src/lib/dashboardEvidence');

    expect(
      countEvidenceAttention({
        cards: [
          { id: 'doctor', label: 'Doctor', status: 'fail', summary: 'blocked' },
          { id: 'analyze', label: 'Analyze', status: 'warn', summary: 'warnings' },
          { id: 'readiness', label: 'Readiness', status: 'pass', summary: 'ok' },
        ],
        activity: [],
        onboarding: {
          isFreshInstall: false,
          recentWorkspaceCount: 1,
          hasActiveWorkspace: true,
        },
      })
    ).toBe(2);
  });

  it('routes blocked ops chain to the current step tab', async () => {
    const { buildDashboardNextSteps } = await import('../../webview-ui/src/lib/dashboardNextSteps');

    const doctorBlocked = buildDashboardNextSteps({
      workspaceStatus: { hasWorkspace: true, workspacePath: '/tmp/ws' },
      installStatusChecked: true,
      coreInstalled: true,
      evidence: {
        cards: [],
        activity: [],
        opsChain: {
          id: 'chain-1',
          workspacePath: '/tmp/ws',
          triggeredBy: 'create',
          steps: ['bootstrap', 'doctor', 'analyze', 'readiness'],
          currentStep: 'doctor',
          completedSteps: ['bootstrap'],
          status: 'blocked',
          startedAt: Date.now(),
          updatedAt: Date.now(),
        },
        onboarding: {
          isFreshInstall: false,
          recentWorkspaceCount: 1,
          hasActiveWorkspace: true,
        },
      },
    });

    expect(doctorBlocked[0]?.section).toBe('operate');

    const analyzeBlocked = buildDashboardNextSteps({
      workspaceStatus: { hasWorkspace: true, workspacePath: '/tmp/ws' },
      installStatusChecked: true,
      coreInstalled: true,
      evidence: {
        cards: [],
        activity: [],
        opsChain: {
          id: 'chain-2',
          workspacePath: '/tmp/ws',
          triggeredBy: 'add',
          steps: ['bootstrap', 'doctor', 'analyze', 'readiness'],
          currentStep: 'analyze',
          completedSteps: ['bootstrap', 'doctor'],
          status: 'blocked',
          startedAt: Date.now(),
          updatedAt: Date.now(),
        },
        onboarding: {
          isFreshInstall: false,
          recentWorkspaceCount: 1,
          hasActiveWorkspace: true,
        },
      },
    });

    expect(analyzeBlocked[0]?.section).toBe('repair');
  });

  it('counts operate attention from governance cards and workspace hints', async () => {
    const { countOperateAttention } = await import('../../webview-ui/src/lib/dashboardEvidence');

    expect(
      countOperateAttention({
        evidence: {
          cards: [
            {
              id: 'doctor',
              label: 'Doctor',
              status: 'fail',
              summary: 'blocked',
              scope: 'workspace',
            },
            { id: 'mirror', label: 'Mirror', status: 'pass', summary: 'ok', scope: 'workspace' },
          ],
          activity: [],
          onboarding: {
            isFreshInstall: false,
            recentWorkspaceCount: 1,
            hasActiveWorkspace: true,
          },
        },
        mirrorStatus: 'stale',
      })
    ).toBe(2);
  });
});

describe('smoke: project scope analyze reload key', () => {
  it('changes load key when project scope changes', () => {
    const workspace = '/tmp/ws';
    const projectA = '/tmp/ws/api-a';
    const projectB = '/tmp/ws/api-b';

    expect(buildAnalyzeLoadKey(workspace, null)).not.toBe(buildAnalyzeLoadKey(workspace, projectA));
    expect(buildAnalyzeLoadKey(workspace, projectA)).not.toBe(
      buildAnalyzeLoadKey(workspace, projectB)
    );
  });
});

describe('smoke: dashboard catalog load truthfulness', () => {
  it('marks catalog ready only from host ack, data, or timeout', async () => {
    const {
      resolveCatalogTemplatesReady,
      resolveCatalogModulesReady,
      catalogShowsFallbackBanner,
      shouldRequestCatalogRefresh,
    } = await import('../../webview-ui/src/lib/dashboardCatalogLoad');

    expect(resolveCatalogTemplatesReady(false, 0, false)).toBe(false);
    expect(resolveCatalogTemplatesReady(true, 0, false)).toBe(true);
    expect(resolveCatalogTemplatesReady(false, 2, false)).toBe(true);
    expect(resolveCatalogTemplatesReady(false, 0, true)).toBe(true);

    expect(resolveCatalogModulesReady(false, false, false)).toBe(false);
    expect(resolveCatalogModulesReady(true, false, false)).toBe(true);
    expect(resolveCatalogModulesReady(false, true, false)).toBe(true);

    expect(catalogShowsFallbackBanner('fallback')).toBe(true);
    expect(catalogShowsFallbackBanner('cache')).toBe(true);
    expect(catalogShowsFallbackBanner('live')).toBe(false);

    expect(shouldRequestCatalogRefresh(true, 'dashboard')).toBe(true);
    expect(shouldRequestCatalogRefresh(true, 'welcome')).toBe(false);
  });
});

describe('smoke: dashboard command dispatch', () => {
  it('tracks activity for operational dashboard commands only', async () => {
    const { buildDashboardCommandPayload, buildDashboardDispatchMessages } =
      await import('../../webview-ui/src/lib/dashboardDispatch');

    expect(buildDashboardDispatchMessages('openSetup')).toEqual([{ command: 'openSetup' }]);
    expect(buildDashboardDispatchMessages('projectDoctor')).toEqual([
      {
        command: 'trackDashboardCommand',
        data: {
          command: 'projectDoctor',
          affectedEvidenceCardIds: ['projectDoctor', 'importReadiness'],
        },
      },
      { command: 'projectDoctor', data: undefined },
    ]);
    expect(buildDashboardDispatchMessages('refreshModules', { path: '/tmp/ws' })).toEqual([
      { command: 'refreshModules', data: { path: '/tmp/ws' } },
    ]);

    expect(
      buildDashboardCommandPayload(
        'importProject',
        { useDefaultWorkspace: true, trigger: 'dashboard-import-handoff' },
        { path: '/stale/ws', workspacePath: '/stale/ws' },
        '/stale/ws'
      )
    ).toEqual({
      useDefaultWorkspace: true,
      trigger: 'dashboard-import-handoff',
    });

    expect(
      buildDashboardCommandPayload(
        'workspaceAnalyze',
        undefined,
        { path: '/active/ws', workspacePath: '/active/ws' },
        '/active/ws'
      ).workspacePath
    ).toBe('/active/ws');
  });
});

describe('smoke: evidence sparse empty state', () => {
  it('detects sparse evidence for active workspaces', async () => {
    const { evidenceIsSparse } = await import('../../webview-ui/src/lib/dashboardEvidence');

    expect(evidenceIsSparse(null, true)).toBe(true);
    expect(evidenceIsSparse({ cards: [], activity: [] }, true)).toBe(true);
    expect(
      evidenceIsSparse(
        {
          cards: [{ id: 'doctor', label: 'Doctor', status: 'missing', summary: 'not run' }],
          activity: [],
        },
        true
      )
    ).toBe(true);
    expect(
      evidenceIsSparse(
        {
          cards: [{ id: 'doctor', label: 'Doctor', status: 'pass', summary: 'ok' }],
          activity: [],
        },
        true
      )
    ).toBe(false);
    expect(evidenceIsSparse(null, false)).toBe(false);
  });
});

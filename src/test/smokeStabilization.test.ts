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
    expect(normalizeDashboardSection('invalid')).toBe('overview');
    expect(dashboardSectionNeedsCatalog('console')).toBe(true);
    expect(dashboardSectionNeedsCatalog('overview')).toBe(false);
  });
});

describe('smoke: module framework support', () => {
  it('allows installs only for FastAPI and NestJS projects', async () => {
    const { isModuleInstallSupported, isUnsupportedModuleProjectType, getProjectFrameworkLabel } =
      await import('../../webview-ui/src/lib/moduleSupport');

    expect(isModuleInstallSupported('fastapi', true)).toBe(true);
    expect(isModuleInstallSupported('nestjs', true)).toBe(true);
    expect(isModuleInstallSupported('go', true)).toBe(false);
    expect(isModuleInstallSupported('fastapi', false)).toBe(false);
    expect(isUnsupportedModuleProjectType('dotnet')).toBe(true);
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
            summary: '2 errors blocking release',
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

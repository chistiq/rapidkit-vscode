import { describe, expect, it } from 'vitest';

import {
  buildDashboardNavigationTelemetryCommand,
  normalizeDashboardNavigationSection,
} from '../../src/core/dashboardNavigationTelemetry';

describe('dashboardNavigationTelemetry', () => {
  it('normalizes legacy workspaces section to catalog', () => {
    expect(normalizeDashboardNavigationSection('workspaces')).toBe('catalog');
    expect(buildDashboardNavigationTelemetryCommand('workspaces')).toBe('dashboard.nav.catalog');
  });

  it('builds section and operate-zone navigation commands', () => {
    expect(buildDashboardNavigationTelemetryCommand('overview')).toBe('dashboard.nav.overview');
    expect(buildDashboardNavigationTelemetryCommand('operate')).toBe('dashboard.nav.operate');
    expect(buildDashboardNavigationTelemetryCommand('operate', 'governance')).toBe(
      'dashboard.nav.operate.governance'
    );
    expect(buildDashboardNavigationTelemetryCommand('operate', 'invalid')).toBe(
      'dashboard.nav.operate'
    );
  });

  it('maps ops chain and incident targets to Run zones', async () => {
    const {
      dashboardOperateZoneForOpsChainStep,
      dashboardOperateZoneForIncidentTarget,
      resolveCommandOperateZone,
    } = await import('../../webview-ui/src/lib/dashboardOperateZones');

    expect(dashboardOperateZoneForOpsChainStep('bootstrap')).toBe('governance');
    expect(dashboardOperateZoneForOpsChainStep('doctor')).toBe('quick');
    expect(dashboardOperateZoneForOpsChainStep('analyze')).toBeUndefined();
    expect(dashboardOperateZoneForIncidentTarget('doctor')).toBe('quick');
    expect(dashboardOperateZoneForIncidentTarget('analyze')).toBe('quick');
    expect(dashboardOperateZoneForIncidentTarget('readiness')).toBe('governance');
    expect(dashboardOperateZoneForIncidentTarget('release')).toBe('share');
    expect(dashboardOperateZoneForIncidentTarget('impact')).toBe('intelligence');
    expect(dashboardOperateZoneForIncidentTarget('model')).toBe('intelligence');
    expect(dashboardOperateZoneForIncidentTarget('pipeline')).toBe('governance');
    expect(resolveCommandOperateZone('projectDoctor')).toBe('quick');
    expect(resolveCommandOperateZone('workspaceRunInit')).toBe('quick');
    expect(resolveCommandOperateZone('workspaceRunStart')).toBe('quick');
    expect(resolveCommandOperateZone('workspaceExplain')).toBe('intelligence');
  });

  it('lists studio handoff labels aligned with dashboard tabs', async () => {
    const { DASHBOARD_STUDIO_HANDOFF_LINKS } =
      await import('../../webview-ui/src/lib/dashboardStudioHandoff');
    const labels = DASHBOARD_STUDIO_HANDOFF_LINKS.map((link) => link.label);
    expect(labels).toEqual(['Repair', 'Run', 'Project', 'Home']);
  });

  it('resolves studio return context from dashboard section and Run zone', async () => {
    const { resolveDashboardStudioReturnContext } =
      await import('../../webview-ui/src/lib/dashboardStudioReturnContext');

    expect(
      resolveDashboardStudioReturnContext({
        dashboardSection: 'evidence',
        lastNavigation: null,
        requestedOperateZone: null,
      })
    ).toEqual({ section: 'evidence' });

    expect(
      resolveDashboardStudioReturnContext({
        dashboardSection: 'operate',
        lastNavigation: { section: 'operate', operateZone: 'build' },
        requestedOperateZone: null,
      })
    ).toEqual({ section: 'operate', operateZone: 'build' });

    expect(
      resolveDashboardStudioReturnContext({
        dashboardSection: 'operate',
        lastNavigation: { section: 'evidence' },
        requestedOperateZone: 'intelligence',
      })
    ).toEqual({ section: 'operate', operateZone: 'intelligence' });
  });
});

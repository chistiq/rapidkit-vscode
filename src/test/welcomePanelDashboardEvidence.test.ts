import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('vscode', () => ({}));

describe('welcomePanelDashboardEvidence', () => {
  it('exports dashboard evidence assembly and host wiring hooks', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelDashboardEvidence.ts'),
      'utf8'
    );
    const welcomePanelSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanel.ts'),
      'utf8'
    );

    expect(source).toContain('export async function sendDashboardEvidence');
    expect(source).toContain('export function resolveDashboardProjectContext');
    expect(source).toContain('export function isActiveDashboardWorkspace');
    expect(source).toContain('buildDashboardEvidenceBundle');
    expect(source).toContain('buildRetentionAnalyticsPayload');
    expect(source).toContain(
      'const retentionCohortSummary = buildRetentionAnalyticsPayload(host.context)'
    );
    expect(source).toContain("postWebviewMessage(\n    'dashboardEvidence'");
    expect(source).toContain('onboarding:');
    expect(source).toContain('cohortSummary: retentionCohortSummary');
    expect(source).toContain('refreshMode:');
    const hostFactoriesSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelDashboardHostFactories.ts'),
      'utf8'
    );
    expect(hostFactoriesSource).toContain("'dashboardCommandFailed'");
    expect(hostFactoriesSource).toContain(
      'cardIds: resolveEvidenceCardIdsForDashboardCommand(command)'
    );
    expect(hostFactoriesSource).toContain('exitCode: details?.exitCode');
    expect(hostFactoriesSource).toContain('stderrTail: details?.stderrTail');
    expect(hostFactoriesSource).toContain('postDashboardEvidenceRefreshFailed');
    expect(hostFactoriesSource).toContain("command: 'dashboardEvidenceRefresh'");
    expect(welcomePanelSource).toContain('_dashboardEvidenceHost()');
    expect(welcomePanelSource).toContain('sendDashboardEvidence(this._dashboardEvidenceHost()');
    expect(welcomePanelSource).not.toContain('buildDashboardEvidenceBundle({');
  });

  it('keeps adopted project context when the project is registered to the active workspace', async () => {
    const { resolveDashboardProjectContext } =
      await import('../ui/panels/welcomePanelDashboardEvidence');

    expect(
      resolveDashboardProjectContext('/workspaces/saas-platform-wsp', {
        name: 'rapidkit-front-pro',
        path: '/repo/Rapid/Front/rapidkit-front-pro',
        workspacePath: '/workspaces/saas-platform-wsp',
      })
    ).toEqual({
      projectPath: '/repo/Rapid/Front/rapidkit-front-pro',
      projectName: 'rapidkit-front-pro',
    });
  });

  it('drops unrelated external project context when it is not registered to the active workspace', async () => {
    const { resolveDashboardProjectContext } =
      await import('../ui/panels/welcomePanelDashboardEvidence');

    expect(
      resolveDashboardProjectContext('/workspaces/saas-platform-wsp', {
        name: 'other',
        path: '/repo/other',
        workspacePath: '/workspaces/other-wsp',
      })
    ).toEqual({});
  });
});

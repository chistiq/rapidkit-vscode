import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('welcomePanelDashboardCommands webview dispatch', () => {
  it('exports contract-registry dispatch ahead of the welcomePanel switch', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const dashboardSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelDashboardCommands.ts'),
      'utf8'
    );
    const welcomePanelSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanel.ts'),
      'utf8'
    );
    const dispatchSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelWebviewMessageDispatch.ts'),
      'utf8'
    );
    const dashboardMessageDispatcherSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelDashboardMessageDispatcher.ts'),
      'utf8'
    );
    const combinedWelcomePanelSource = `${welcomePanelSource}\n${dispatchSource}\n${dashboardMessageDispatcherSource}`;

    expect(dashboardSource).toContain(
      'export async function tryDispatchDashboardContractWebviewMessage'
    );
    expect(dashboardSource).toContain('resolveDashboardCommandContract(command)');
    expect(dashboardSource).toContain('await executeDashboardContractCommand(host, command, data)');
    expect(dashboardSource).toContain('host.postDashboardCommandFailed(command, reason');
    expect(dashboardSource).toContain('Open the mapped evidence card');
    expect(dashboardSource).toContain('const workspacePath = explicitPath || selectedPath ||');
    expect(dashboardSource).toContain("typeof data?.workspacePath === 'string'");
    expect(dispatchSource).toContain('tryDispatchDashboardWebviewMessage');
    expect(combinedWelcomePanelSource).toContain('tryDispatchDashboardContractWebviewMessage(');
    expect(welcomePanelSource).toContain('dispatchWelcomePanelWebviewMessage');
    expect(welcomePanelSource).not.toContain("case 'workspaceAnalyze':");
  });
});

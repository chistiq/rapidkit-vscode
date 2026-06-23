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
    const combinedWelcomePanelSource = `${welcomePanelSource}\n${dispatchSource}`;

    expect(dashboardSource).toContain(
      'export async function tryDispatchDashboardContractWebviewMessage'
    );
    expect(dashboardSource).toContain('resolveDashboardCommandContract(command)');
    expect(dashboardSource).toContain('await executeDashboardContractCommand(host, command, data)');
    expect(combinedWelcomePanelSource).toContain('tryDispatchDashboardContractWebviewMessage(');
    expect(welcomePanelSource).toContain('dispatchWelcomePanelWebviewMessage');
    expect(welcomePanelSource).not.toContain("case 'workspaceAnalyze':");
  });
});

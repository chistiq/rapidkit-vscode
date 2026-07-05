import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { DASHBOARD_COMMAND_CONTRACTS } from '../core/dashboardCommandContracts';
import { SIDEBAR_ACTION_SURFACE } from '../contracts/sidebarActionSurface';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function collectPostMessageCommands(source: string): string[] {
  return Array.from(source.matchAll(/\b(?:vscode\.)?postMessage\(\s*['"]([^'"]+)['"]/g)).map(
    (match) => match[1]
  );
}

function collectQuotedCommandsFromSource(source: string): string[] {
  return Array.from(source.matchAll(/['"]([a-z][A-Za-z0-9]+)['"]/g)).map((match) => match[1]);
}

function collectPrimaryWebviewPostedCommands(): string[] {
  const files = [
    'webview-ui/src/App.tsx',
    'webview-ui/src/components/Footer.tsx',
    'webview-ui/src/components/WorkspaiSettingsPanel.tsx',
    'webview-ui/src/components/CreateProjectModal.tsx',
    'webview-ui/src/components/CreateWorkspaceModal.tsx',
    'webview-ui/src/components/ExampleWorkspaces.tsx',
    'webview-ui/src/lib/dashboardNavigationTelemetry.ts',
  ];
  return [...new Set(files.flatMap((file) => collectPostMessageCommands(read(file))))].sort();
}

function collectPrimaryHostHandledCommands(): string[] {
  const messageFiles = [
    'src/ui/panels/welcomePanelAiCreationMessages.ts',
    'src/ui/panels/welcomePanelAiModalMessages.ts',
    'src/ui/panels/welcomePanelAnalyzeReportMessages.ts',
    'src/ui/panels/welcomePanelCreationNavigationMessages.ts',
    'src/ui/panels/welcomePanelDashboardLifecycleMessages.ts',
    'src/ui/panels/welcomePanelDashboardShortcutMessages.ts',
    'src/ui/panels/welcomePanelIncidentStudioMessages.ts',
    'src/ui/panels/welcomePanelModulesCatalog.ts',
    'src/ui/panels/welcomePanelReadyMessages.ts',
    'src/ui/panels/welcomePanelWorkspaceSelectionMessages.ts',
    'src/ui/panels/welcomePanelWorkspaiSettingsMessages.ts',
  ];
  const sourceCommands = messageFiles.flatMap((file) =>
    collectQuotedCommandsFromSource(read(file))
  );
  const contractCommands = Object.keys(DASHBOARD_COMMAND_CONTRACTS);
  return [...new Set([...sourceCommands, ...contractCommands])].sort();
}

function collectSidebarPostedCommands(): string[] {
  const files = [
    'webview-ui/src/sidebar/SecondarySidebar.tsx',
    'webview-ui/src/sidebar/ModelPicker.tsx',
  ];
  return [...new Set(files.flatMap((file) => collectPostMessageCommands(read(file))))].sort();
}

function collectSidebarHandledCommands(): string[] {
  const dispatcherCommands = collectQuotedCommandsFromSource(
    read('src/ui/webviews/actionsWebviewMessageDispatcher.ts')
  );
  const surfaceCommands = Object.keys(SIDEBAR_ACTION_SURFACE);
  return [...new Set([...dispatcherCommands, ...surfaceCommands])].sort();
}

describe('webview command parity', () => {
  it('keeps primary dashboard posted commands backed by host message handlers', () => {
    const posted = collectPrimaryWebviewPostedCommands();
    const handled = new Set(collectPrimaryHostHandledCommands());
    const missing = posted.filter((command) => !handled.has(command));

    expect(missing).toEqual([]);
  });

  it('keeps secondary sidebar posted commands backed by host message handlers', () => {
    const posted = collectSidebarPostedCommands();
    const handled = new Set(collectSidebarHandledCommands());
    const missing = posted.filter((command) => !handled.has(command));

    expect(missing).toEqual([]);
  });
});

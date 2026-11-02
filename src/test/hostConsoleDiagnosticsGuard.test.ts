import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '../..');

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('host console diagnostics guard', () => {
  it('keeps module catalog failures visible to the operator', () => {
    const source = read('src/ui/panels/welcomePanelModulesCatalog.ts');
    const cli = read('src/core/rapidkitCLI.ts');

    expect(source).toContain('postCatalog(MODULES, {');
    expect(source).toContain("source: 'fallback'");
    expect(source).toContain('loadError:');
    expect(source).toContain("host.postWebviewMessage('availableKitsLoadError', {");
    expect(source).toContain("console.error('[WelcomePanel] Failed to send available kits:'");
    expect(source).toContain("vscode.window.showErrorMessage('Failed to load module details')");
    expect(source).toContain(
      'Module details are not available for this catalog item. Refresh the catalog and try again.'
    );
    expect(cli).toContain('Resolved RapidKit Core executable could not be started.');
    expect(cli).not.toContain(
      'Preferred workspace rapidkit executable failed; falling back to discovery chain.'
    );
  });

  it('keeps treeview scan failures visible instead of empty console-only panes', () => {
    const modules = read('src/ui/treeviews/moduleExplorer.ts');
    const projects = read('src/ui/treeviews/projectExplorer.ts');

    expect(modules).toContain('_catalogLoadError');
    expect(modules).toContain('Module catalog fallback active');
    expect(modules).toContain('Reference only · install disabled');
    expect(modules).toContain('exact workspace Core catalog could not be verified');
    expect(modules).toContain('fetchProjectCommandCapabilities');
    expect(modules).toContain('isModuleMutationSupported');
    expect(modules).toContain("this._catalogSource !== 'fallback'");

    expect(projects).toContain('_projectLoadError');
    expect(projects).toContain('Project scan failed');
    expect(projects).toContain('Refresh workspace');
    expect(projects).toContain('Workspai could not scan projects for this workspace');
  });

  it('resolves the module catalog from the selected project before the workspace fallback', () => {
    const source = read('src/ui/panels/welcomePanelModulesCatalog.ts');
    const selectedProjectIndex = source.indexOf(
      'const selectedProject = host.getSelectedProject()'
    );
    const selectedWorkspaceIndex = source.indexOf(
      'const selectedWorkspace = host.getSelectedWorkspaceInfo()'
    );

    expect(selectedProjectIndex).toBeGreaterThan(-1);
    expect(selectedWorkspaceIndex).toBeGreaterThan(selectedProjectIndex);
    expect(source).toContain('selectedProject.workspacePath || path.dirname(selectedProject.path)');
  });

  it('keeps example workspace clone and update failures visible and recoverable', () => {
    const source = read('src/ui/panels/welcomePanelExampleWorkspaces.ts');

    expect(source).toContain(
      'vscode.window.showErrorMessage(`Failed to clone example: ${message}`)'
    );
    expect(source).toContain("host.postWebviewMessage('setCloning', { exampleName: null })");
    expect(source).toContain(
      'vscode.window.showErrorMessage(`Failed to update example: ${message}`)'
    );
    expect(source).toContain("host.postWebviewMessage('setUpdating', { exampleName: null })");
  });

  it('keeps bootstrap example-workspace failures from leaving Library in loading state', () => {
    const source = read('src/ui/panels/welcomePanelBootstrapPayload.ts');

    expect(source).toContain(
      "host.postWebviewMessage('updateExampleWorkspaces', enrichedExamples)"
    );
    expect(source).toContain("host.postWebviewMessage('updateExampleWorkspaces', [])");
  });

  it('keeps service-cache diagnostics behind stale-cache or bundled fallback contracts', () => {
    const examples = read('src/core/examplesService.ts');
    const kits = read('src/core/kitsService.ts');

    expect(examples).toContain('Using stale cache as fallback');
    expect(examples).toContain('return this._getPublishedCatalog(cached.metadata)');
    expect(examples).toContain('profileWorkspaces');
    expect(examples).toContain('return this._getFallbackExamples()');
    expect(kits).toContain('Using stale cache as fallback');
    expect(kits).toContain("source: 'stale-cache'");
    expect(kits).toContain("source: 'bundled-fallback'");
    expect(kits).toContain('kits: this._mergeWithFallback(cached.kits)');
    expect(kits).toContain('kits: this._getFallbackKits()');
    expect(kits).toContain('error: message');
  });

  it('keeps dashboard evidence refresh failures mapped into webview state', () => {
    const lifecycle = read('src/ui/panels/welcomePanelDashboardLifecycleMessages.ts');
    const factories = read('src/ui/panels/welcomePanelDashboardHostFactories.ts');
    const app = read('webview-ui/src/App.tsx');

    expect(lifecycle).toContain('sendDashboardEvidenceOrPostFailure');
    expect(lifecycle).toContain('host.postDashboardEvidenceRefreshFailed?.({');
    expect(factories).toContain("postWebviewMessage('dashboardCommandFailed'");
    expect(app).toContain("case 'dashboardCommandFailed':");
    expect(app).toContain('setDashboardCommandNotice');
    expect(app).toContain('setDashboardCommandFailures');
    expect(app).toContain('clearPendingEvidenceForCommand');
    expect(app).toContain('setPendingEvidenceRefreshCardIds');
  });

  it('keeps dashboard setup and release command throws mapped into visible card state', () => {
    const source = read('src/ui/panels/welcomePanelDashboardCommands.ts');

    expect(source).toContain('tryDispatchDashboardContractWebviewMessage');
    expect(source).toContain('try {');
    expect(source).toContain('await executeDashboardContractCommand(host, command, data)');
    expect(source).toContain('host.postDashboardCommandFailed(command, reason');
    expect(source).toContain('void vscode.window.showErrorMessage(reason)');
    expect(source).toContain('Open the mapped evidence card');
  });

  it('keeps Advisor action failures visible in the secondary sidebar', () => {
    const provider = read('src/ui/webviews/actionsWebviewProvider.ts');
    const sidebar = read('webview-ui/src/sidebar/SecondarySidebar.tsx');
    const styles = read('webview-ui/src/sidebar/sidebar.css');

    expect(provider).toContain("sidebarAdvisorActionResult'");
    expect(provider).toContain("status: 'failed'");
    expect(provider).toContain('Workspace Advisor action failed');
    expect(provider).toContain('nextAction:');
    expect(sidebar).toContain('advisorActionFailure');
    expect(sidebar).toContain("case 'sidebarAdvisorActionResult':");
    expect(sidebar).toContain('ws-sidebar__advisor-alert');
    expect(styles).toContain('.ws-sidebar__advisor-alert');
  });

  it('keeps Studio action failures visible with a guided next action', () => {
    const provider = read('src/ui/webviews/actionsWebviewProvider.ts');
    const failureParser = read('webview-ui/src/lib/studioVerifyFailure.ts');
    const repairResult = read('webview-ui/src/sidebar/StudioRepairResult.tsx');
    const sidebar = read('webview-ui/src/sidebar/SecondarySidebar.tsx');

    expect(provider).toContain('buildSidebarStudioActionFailurePayload');
    expect(provider).toContain('studioActionFailureNextAction');
    expect(provider).toContain('sidebarStudioActionResult');
    expect(provider).toContain("action: 'refresh-ship-loop'");
    expect(failureParser).toContain('nextAction');
    expect(failureParser).toContain("'refresh-ship-loop': 'Ship-loop refresh failed'");
    expect(sidebar).toContain("data.action === 'refresh-ship-loop'");
    expect(repairResult).toContain('verifyFailure.nextAction');
  });
});

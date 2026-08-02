import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

/**
 * Guards the React Create-tab migration (roadmap 2.11d). The React secondary
 * sidebar and the host `ActionsWebviewProvider` must agree on the create
 * protocol; these source-text checks fail the build if either side drifts.
 */
describe('React Create tab ↔ host protocol parity (roadmap 2.11d)', () => {
  const secondary = read('webview-ui/src/sidebar/SecondarySidebar.tsx');
  const provider = read('src/ui/webviews/actionsWebviewProvider.ts');
  const dispatcher = read('src/ui/webviews/actionsWebviewMessageDispatcher.ts');
  const welcomePanel = read('src/ui/panels/welcomePanel.ts');
  const bootstrapPayload = read('src/ui/panels/welcomePanelBootstrapPayload.ts');
  const managedDefaultWorkspace = read('src/core/ensureManagedDefaultWorkspace.ts');

  it('posts the create outbound commands the host handles', () => {
    const outbound = [
      'sidebarAiCreatePlan',
      'sidebarAiCreateConfirm',
      'sidebarManualCreate',
      'sidebarCreatedWorkspaceBootstrap',
      'sidebarFocusView',
      'sidebarOpenDashboard',
      'sidebarRefreshScope',
      'sidebarRefreshModels',
      'setPreferredModel',
    ];
    for (const command of outbound) {
      expect(secondary, `React should post "${command}"`).toContain(`'${command}'`);
      expect(dispatcher, `host should handle "${command}"`).toContain(`command: '${command}'`);
    }
  });

  it('handles every create-related inbound command the host emits', () => {
    const inbound = [
      'sidebarActivateTab',
      'sidebarAiScope',
      'sidebarAiModelsList',
      'sidebarAiCreateThinking',
      'sidebarAiCreatePlan',
      'sidebarAiCreateProgress',
      'sidebarAiCreateDone',
      'sidebarAiCreateError',
      'sidebarManualCreateResult',
    ];
    for (const command of inbound) {
      expect(secondary, `React should handle inbound "${command}"`).toContain(`case '${command}'`);
      expect(provider, `host should emit "${command}"`).toContain(`'${command}'`);
    }
  });

  it('keeps the manual-create profile + framework option tables aligned with the host', () => {
    const createTypes = read('webview-ui/src/sidebar/createTypes.ts');
    // Profiles accepted by _runSidebarManualCreate.
    for (const profile of [
      'minimal',
      'python-only',
      'node-only',
      'go-only',
      'java-only',
      'dotnet-only',
      'polyglot',
      'enterprise',
    ]) {
      expect(createTypes, `profile option "${profile}"`).toContain(`'${profile}'`);
    }
    // Framework keys mapped by _runSidebarManualCreate.frameworkMap.
    for (const framework of [
      'fastapi-standard',
      'fastapi-ddd',
      'nestjs-standard',
      'springboot-standard',
      'gofiber-standard',
      'gogin-standard',
      'dotnet-webapi-clean',
      'rust-axum',
      'php-laravel',
      'nextjs',
      'react-router',
      'vite-react',
      'vite-vue',
      'vite-svelte',
      'vite-solid',
      'vite-vanilla',
      'nuxt',
      'angular',
      'astro',
      'sveltekit',
      'desktop-tauri',
      'desktop-electron',
      'vscode-extension',
    ]) {
      expect(createTypes, `framework option "${framework}"`).toContain(`'${framework}'`);
    }
  });

  it('exposes every existing-software onboarding path through the contract surface', () => {
    const actionContract = read('src/contracts/sidebar-action-surface.v1.json');
    const createTab = read('webview-ui/src/sidebar/CreateTab.tsx');
    const addDrawer = read('webview-ui/src/sidebar/drawers/CreateAddDrawer.tsx');
    for (const [actionId, command] of [
      ['adoptExistingProject', 'workspai.adoptProject'],
      ['importExistingProject', 'workspai.importProject'],
      ['importExistingWorkspace', 'workspai.importWorkspace'],
    ]) {
      expect(actionContract).toContain(`\"${actionId}\"`);
      expect(actionContract).toContain(`\"vscodeCommand\": \"${command}\"`);
      expect(createTab).toContain(
        actionId === 'adoptExistingProject'
          ? 'onAdoptProject'
          : actionId === 'importExistingProject'
            ? 'onImportProject'
            : 'onImportWorkspace'
      );
    }
    expect(addDrawer).toContain('Existing software');
    expect(addDrawer).toContain('Adopt project');
    expect(addDrawer).toContain('Import project');
    expect(addDrawer).toContain('Import workspace');
  });

  it('keeps manual project naming aligned with the CLI validation boundary', () => {
    const projectDrawer = read('webview-ui/src/sidebar/drawers/ManualProjectDrawer.tsx');
    expect(projectDrawer).toContain('/^[a-z][a-z0-9_-]*$/');
    expect(projectDrawer).toContain('value.length < 2 || value.length > 214');
    for (const reserved of [
      'test',
      'tests',
      'src',
      'dist',
      'build',
      'lib',
      'python',
      'pip',
      'poetry',
      'node',
      'npm',
      'rapidkit',
    ]) {
      expect(projectDrawer).toContain(`'${reserved}'`);
    }
  });

  it('the secondary sidebar is rendered by the React root for the secondary variant', () => {
    const app = read('webview-ui/src/sidebar/SidebarApp.tsx');
    expect(app).toContain("variant === 'secondary-sidebar'");
    expect(app).toContain('<SecondarySidebar />');
  });

  it('keeps AI chat messages minimal without a Workspai avatar or activity ring', () => {
    const createTab = read('webview-ui/src/sidebar/CreateTab.tsx');
    const sidebarMessage = read('webview-ui/src/sidebar/SidebarMessage.tsx');
    const sidebarCss = read('webview-ui/src/sidebar/sidebar.css');
    expect(createTab).toContain('SidebarMessage');
    expect(createTab).toContain('LoadingDots');
    expect(createTab).toContain('ws-sidebar__dots');
    expect(sidebarMessage).not.toContain('SidebarAgentAvatar');
    expect(sidebarMessage).not.toContain('agentActive');
    expect(sidebarCss).not.toContain('ws-sidebar__agent-avatar');
    expect(sidebarCss).not.toContain('ws-sidebar-avatar-spin');
  });

  it('identifies the project target as a visible Workspai workspace badge', () => {
    const projectDrawer = read('webview-ui/src/sidebar/drawers/ManualProjectDrawer.tsx');
    const sidebarCss = read('webview-ui/src/sidebar/sidebar.css');
    expect(projectDrawer).toContain('Default Workspai location');
    expect(projectDrawer).not.toContain('Default RapidKit location');
    expect(projectDrawer).toContain('ws-drawer-target-badge');
    expect(projectDrawer).toContain('MapPin');
    expect(sidebarCss).toContain('.ws-drawer-target-badge');
  });

  it('keeps the composer selector, add drawer, quick starts, and manual lanes on one target', () => {
    const createTab = read('webview-ui/src/sidebar/CreateTab.tsx');
    const addDrawer = read('webview-ui/src/sidebar/drawers/CreateAddDrawer.tsx');
    const presets = read('webview-ui/src/lib/creationPresets.ts');

    expect(createTab).toContain("scope.workspacePath ? 'project' : 'workspace'");
    expect(createTab).toContain('target={createTarget}');
    expect(createTab).toContain('onTargetChange={setCreateTarget}');
    expect(createTab).toContain("setCreateTarget('workspace')");
    expect(createTab).toContain("setCreateTarget('project')");
    expect(createTab).toContain('resolveCreatePlaceholder(');
    expect(createTab).toContain('setCreateTarget(contextualTarget)');
    expect(createTab).toContain('setCreateTarget(activeSession?.target ?? contextualTarget)');
    expect(createTab).toContain('setCreateTarget(session.target)');
    expect(addDrawer).toContain('quickStartsForCreateTarget(stackLane, target)');
    expect(addDrawer).toContain('role="radiogroup"');
    expect(addDrawer).toContain('Workspace quick starts');
    expect(addDrawer).toContain('Project quick starts');
    expect(presets).toContain('one scaffold');
  });

  it('streams manual create progress steps before the final result', () => {
    expect(provider).toContain('_postCreateTimelineStep');
    expect(provider).toContain("label: 'Preparing project scaffold…'");
    expect(provider).toContain("'Running RapidKit scaffold'");
    expect(provider).toContain('ensureManagedDefaultWorkspace');
    expect(provider).toContain('workspacePath');
    expect(provider).toContain('projectPath');
    expect(provider).toContain('directWorkspacePath');
    expect(provider).toContain('directWorkspacePath ?? workspacePath');
    expect(provider).toContain('WelcomePanel.refreshDashboardForWorkspacePath(workspacePath)');
    expect(provider).toContain('await syncWorkspaceAfterInlineCreate(workspacePath)');
    expect(provider).toContain('_runSidebarCreatedWorkspaceBootstrap');
    expect(provider).toContain("vscode.commands.executeCommand('workspai.workspaceBootstrap'");
    expect(provider).toContain('workspacePath,');
    expect(welcomePanel).toContain('workspaceOverride');
    expect(bootstrapPayload).toContain(
      'options?.workspaceOverride ?? host.getSelectedWorkspaceInfo()'
    );
    expect(secondary).toContain('sidebarCreatedWorkspaceBootstrap');
    expect(secondary).toContain('handleBootstrapCreatedWorkspace');
    expect(secondary).toContain('onBootstrapWorkspace={handleBootstrapCreatedWorkspace}');
    const createTab = read('webview-ui/src/sidebar/CreateTab.tsx');
    expect(createTab).toContain('Bootstrap workspace');
    expect(createTab).toContain('message.workspacePath');
    expect(createTab).toContain('const canBootstrapWorkspace = Boolean(message.workspacePath)');
    expect(createTab).toContain(
      "workspaceName: message.mode === 'workspace' ? message.name : undefined"
    );
    expect(createTab).not.toContain("message.mode === 'workspace' && message.workspacePath");
    expect(createTab).toContain('function displayNameFromPath');
    expect(createTab).toContain('Project: {projectLabel}');
    expect(createTab).toContain('Workspace: {workspaceLabel}');
    expect(createTab).not.toContain('message.projectPath\\n                ? message.projectPath');
    expect(secondary).toContain('createMode');
    expect(secondary).toContain('setScope((previous)');
    expect(secondary).toContain('Create project "');
    expect(secondary).toContain('frameworkLabel');
    expect(secondary).toContain('workspaceName: scope.workspaceName');
    expect(secondary).toContain('workspacePath: scope.workspacePath');
    expect(secondary).toContain('setScope((previous) => ({');
    expect(secondary).toContain('workspacePath: input.workspacePath');
    expect(provider).toContain('const scope = resolveExplicitWorkspaceScope(payloadRecord.scope)');
    expect(provider).toContain('let workspacePath = scope.workspacePath');
    expect(managedDefaultWorkspace).toContain("profile: 'polyglot'");
    expect(managedDefaultWorkspace).toContain('skipPythonEngine: true');
    expect(managedDefaultWorkspace).toContain('skipGit: true');
    expect(managedDefaultWorkspace).toContain(
      'await ensureWorkspaceViaNpm(workspacePath, workspaceName)'
    );
  });

  it('never routes fallback onboarding back to the legacy rapidkit npm package', () => {
    const createWorkspace = read('src/commands/createWorkspace.ts');
    const createProject = read('src/commands/createProject.ts');
    expect(createWorkspace).toContain("args: ['install', '-g', 'workspai']");
    expect(createWorkspace).toContain('workspai create');
    expect(createWorkspace).not.toContain("args: ['install', '-g', 'rapidkit']");
    expect(createWorkspace).not.toContain('rapidkit create');
    expect(createProject).not.toContain('rapidkit create project failed');
  });
});

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
      'nextjs',
      'react-router',
    ]) {
      expect(createTypes, `framework option "${framework}"`).toContain(`'${framework}'`);
    }
  });

  it('the secondary sidebar is rendered by the React root for the secondary variant', () => {
    const app = read('webview-ui/src/sidebar/SidebarApp.tsx');
    expect(app).toContain("variant === 'secondary-sidebar'");
    expect(app).toContain('<SecondarySidebar />');
  });

  it('renders Workspai agent avatars beside AI create messages', () => {
    const createTab = read('webview-ui/src/sidebar/CreateTab.tsx');
    const avatar = read('webview-ui/src/sidebar/SidebarAgentAvatar.tsx');
    expect(createTab).toContain('SidebarMessage');
    expect(createTab).toContain('agentActive={agentActive}');
    expect(createTab).toContain('LoadingDots');
    expect(createTab).toContain('ws-sidebar__dots');
    expect(avatar).toContain('ws-sidebar__agent-avatar__ring');
    expect(avatar).toContain('window.ICON_URI');
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
  });
});

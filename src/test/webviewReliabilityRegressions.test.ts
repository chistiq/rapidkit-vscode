import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('webview workflow reliability regressions', () => {
  it('clears the selected project when the host clears it within the same workspace', () => {
    const app = read('webview-ui/src/App.tsx');
    expect(app).toContain('else if (message.data?.hasProjectSelected === false) {');
    expect(app).toContain('setSelectedProjectForAnalysis(null);');
  });

  it('does not reinitialize project form input when the asynchronous kit catalog changes', () => {
    const modal = read('webview-ui/src/components/CreateProjectModal.tsx');
    expect(modal).toContain('}, [isOpen, framework]);');
    expect(modal).toContain('}, [isOpen, isFrontendFramework, frameworkKits, framework]);');
    expect(modal).toContain('if (frameworkKits.some((kit) => kit.name === current))');
  });

  it('keeps the create modal open until the host accepts the framework and kit pair', () => {
    const modal = read('webview-ui/src/components/CreateProjectModal.tsx');
    const handler = modal.slice(
      modal.indexOf('const handleCreate = () => {'),
      modal.indexOf('const handleAISuggest = () => {')
    );
    expect(handler).toContain('onCreate(projectName, framework, resolvedKit)');
    expect(handler).not.toContain('onClose()');
    expect(modal).toContain('creationError ? (');
  });

  it('correlates and cancels module suggestions across modal close and retry', () => {
    const modal = read('webview-ui/src/components/CreateProjectModal.tsx');
    const host = read('src/ui/panels/welcomePanelAiModalMessages.ts');
    expect(modal).toContain("vscode.postMessage('aiCancelModuleSuggestions', { requestId })");
    expect(modal).toContain('if (payload.requestId !== requestId)');
    expect(host).toContain('activeModuleSuggestionRequests');
    expect(host).toContain('requestTokenSource.token.isCancellationRequested');
    expect(host).toContain("case 'aiCancelModuleSuggestions':");
  });

  it('surfaces kit and model catalog failures separately from empty catalogs', () => {
    const app = read('webview-ui/src/App.tsx');
    const modal = read('webview-ui/src/components/CreateProjectModal.tsx');
    const picker = read('webview-ui/src/sidebar/ModelPicker.tsx');
    const hostKits = read('src/ui/panels/welcomePanelModulesCatalog.ts');
    const hostModels = read('src/ui/webviews/actionsWebviewProvider.ts');
    expect(app).toContain("case 'availableKitsLoadError':");
    expect(app).toContain('hasRequestedCorrelatedKitsRef.current');
    expect(modal).toContain('Could not load project kits:');
    expect(hostKits).toContain("host.postWebviewMessage('availableKitsLoadError'");
    expect(picker).toContain('Could not load available models:');
    expect(picker).toContain('No compatible AI models are available');
    expect(hostModels).toContain('Failed to load language models for the sidebar');
  });

  it('provides modal focus management and complete tab-to-panel relationships', () => {
    const modal = read('webview-ui/src/components/EnterpriseModal.tsx');
    const app = read('webview-ui/src/App.tsx');
    const sidebar = read('webview-ui/src/sidebar/SecondarySidebar.tsx');
    const modelPicker = read('webview-ui/src/sidebar/ModelPicker.tsx');
    expect(modal).toContain('aria-labelledby={titleId}');
    expect(modal).toContain("event.key !== 'Tab'");
    expect(modal).toContain('active === dialog');
    expect(modal).toContain('previouslyFocused.focus()');
    expect(app).toContain('onKeyDown={handleWorkspaiViewTabKeyDown}');
    expect(app).toContain('aria-labelledby={`workspai-view-tab-${activeView}`}');
    expect(sidebar).toContain('onKeyDown={handleModeTabKeyDown}');
    expect(sidebar).toContain('aria-controls={');
    expect(modelPicker).toContain('role="listbox"');
    expect(modelPicker).toContain("event.key === 'ArrowDown' ? 1 : options.length - 1");
  });

  it('keeps project identity independent from conversation scope and preserves Explain context', () => {
    const sidebar = read('webview-ui/src/sidebar/SecondarySidebar.tsx');
    const selection = read('src/commands/workspaceSelection.ts');
    const detection = read('src/ui/panels/welcomePanelProjectTypeDetection.ts');
    expect(sidebar).toContain('studio.setSessionScope(sessionId, resolveScopeFromPayload(data))');
    expect(sidebar).toContain(
      "studio.openEditorSession({\n              title: editorIssueSessionTitle('Explain'"
    );
    expect(selection).toContain('kind: typeof projectCandidate.kind');
    expect(selection).toContain('runtime: typeof projectCandidate.runtime');
    expect(selection).toContain('framework:');
    expect(selection).toContain('runtimeCandidates:');
    expect(selection).toContain("normalizeProjectType(candidate) !== 'unknown'");
    expect(detection).toContain("normalized === 'google-adk'");
    expect(detection).toContain("return 'agent'");
  });

  it('rejects stale dashboard project evidence and keeps analysis surfaces mounted', () => {
    const app = read('webview-ui/src/App.tsx');
    const evidenceSession = read('webview-ui/src/lib/dashboardEvidenceSession.ts');
    expect(app).toContain('latestDashboardEvidenceCardRequestIdsRef.current');
    expect(app).toContain('incoming.requestId !== latestDashboardEvidenceFullRequestIdRef.current');
    expect(app).toContain('incoming.projectPath !== activeProjectPath');
    expect(evidenceSession).toContain('payload.projectPath !== options.activeProjectPath');
    expect(evidenceSession).toContain('activeProjectPath: options.activeProjectPath');
    expect(app).toContain("hidden={activeView !== 'analyze-repository'}");
    expect(app).toContain("hidden={activeView !== 'review-changes'}");
  });

  it('hides retained embedded panels and renders the shared tablist only in the active view', () => {
    const app = read('webview-ui/src/App.tsx');
    const chromeCss = read('webview-ui/src/styles/workspai-studio-chrome.css');
    const primitivesCss = read('webview-ui/src/styles/workspai-primitives.css');
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
    const style = dom.window.document.createElement('style');
    style.textContent = `${chromeCss}\n${primitivesCss}`;
    dom.window.document.head.append(style);

    const container = dom.window.document.createElement('div');
    container.className = 'container';
    const hiddenPanel = dom.window.document.createElement('div');
    hiddenPanel.className = 'ws-embedded-host';
    hiddenPanel.hidden = true;
    container.append(hiddenPanel);
    dom.window.document.body.append(container);

    expect(dom.window.getComputedStyle(hiddenPanel).display).toBe('none');
    expect(app).toContain("{activeView === 'analyze-repository' ? (");
    expect(app).toContain("{activeView === 'review-changes' ? (");
    expect(app).toContain("{activeView === 'settings' ? (");
    expect(app).toContain("{activeView === 'setup' ? (");

    dom.window.close();
  });

  it('stops the graph stream whenever the dashboard is no longer active', () => {
    const app = read('webview-ui/src/App.tsx');
    expect(app).toContain("activeView !== 'dashboard' || dashboardSection !== 'graph'");
    expect(app).toContain('[activeView, dashboardSection, workspaceStatus.workspacePath]');
  });
});

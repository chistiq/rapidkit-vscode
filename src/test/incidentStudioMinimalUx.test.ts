import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

describe('incident studio minimal UX guard', () => {
  it('keeps autonomous Studio inside the unified Assistant with scoped mode suggestions', () => {
    const sidebar = read('webview-ui/src/sidebar/SecondarySidebar.tsx');
    const chatTab = read('webview-ui/src/sidebar/ChatTab.tsx');
    const selector = read('webview-ui/src/sidebar/composer/AssistantModeSelector.tsx');

    expect(sidebar).toContain("id: 'studio'");
    expect(sidebar).toContain("label: 'Assistant'");
    expect(sidebar).toContain('ws-sidebar__tab-icon');
    expect(sidebar).toContain("type StudioMode = 'investigate' | 'verify' | 'prepare'");
    expect(sidebar).toContain('function studioSuggestions(mode: StudioMode, scope: SidebarScope)');
    expect(sidebar).toContain(
      'Verify the current workspace gates and tell me what blocks release.'
    );
    expect(sidebar).toContain('Investigate why this workspace is not release-ready.');
    expect(sidebar).toContain('composerPrefill={studioPrefill}');
    expect(chatTab).toContain('composerPrefill?: string');
    expect(chatTab).toContain('composerModeSelector?: ReactNode');
    expect(selector).toContain("export type AssistantMode = 'agent' | 'ask' | 'plan' | 'goal'");
    expect(selector).toContain("id: 'goal'");
    expect(selector).toContain(
      'Pursue any bounded outcome with governed evidence and verification'
    );
    expect(sidebar).toContain("assistantMode !== 'ask'");
    expect(chatTab).not.toContain('studio-empty-state__guided-actions');
  });

  it('keeps the sidebar composer placeholder scoped to chat work', () => {
    const sidebar = read('webview-ui/src/sidebar/SecondarySidebar.tsx');
    const chatTab = read('webview-ui/src/sidebar/ChatTab.tsx');
    const composer = read('webview-ui/src/sidebar/composer/ComposerShell.tsx');

    expect(sidebar).toContain("'Describe the issue or task'");
    expect(sidebar).toContain("'Add context to continue the repair'");
    expect(sidebar).not.toContain('Ask clarifying questions about the fix');
    expect(chatTab).toContain('composerScopeLabel');
    expect(chatTab).toContain('activeSession?.incident || activeSession?.editorIssue');
    expect(chatTab).toContain('onOpenAdd={repairMode ? undefined');
    expect(chatTab).toContain('addLabel={repairMode ? undefined');
    expect(composer).toContain('onOpenAdd?: () => void');
    expect(composer).toContain('{props.onOpenAdd ? (');
    expect(composer).toContain('placeholder={props.placeholder}');
    expect(composer).not.toContain('Ask about current evidence or run the guided next step');
  });

  it('keeps studio chrome CSS available for sidebar surfaces without the full dashboard UI', () => {
    const layoutSource = read('webview-ui/src/styles/workspai-studio.css');
    const chromeSource = read('webview-ui/src/styles/workspai-studio-chrome.css');
    const indexSource = read('webview-ui/src/index.tsx');
    const sidebarIndex = read('webview-ui/src/sidebar/index.tsx');

    expect(layoutSource).toContain('.studio-pane-chat');
    expect(chromeSource).toContain('.studio-sidebar {');
    expect(indexSource).toContain("import '@/styles/workspai-studio.css'");
    expect(indexSource).toContain("import '@/styles/workspai-studio-chrome.css'");
    expect(sidebarIndex).not.toContain('IncidentStudioVNext');
  });
});

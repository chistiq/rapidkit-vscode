import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

/**
 * Guards the React Studio-lite migration (roadmap 2.11f) and the final removal
 * of the raw-HTML sidebar.
 */
describe('React Studio tab ↔ host protocol parity (roadmap 2.11f)', () => {
  const secondary = read('webview-ui/src/sidebar/SecondarySidebar.tsx');
  const provider = read('src/ui/webviews/actionsWebviewProvider.ts');

  it('posts the studio outbound commands the host handles', () => {
    for (const command of ['sidebarStudioQuery', 'sidebarStudioAction']) {
      expect(secondary, `React should post "${command}"`).toContain(`'${command}'`);
      expect(provider, `host should handle "${command}"`).toContain(
        `message.command === '${command}'`
      );
    }
  });

  it('handles every studio inbound command the host emits', () => {
    for (const command of [
      'sidebarStudioScope',
      'sidebarStudioChunk',
      'sidebarStudioDone',
      'sidebarStudioError',
    ]) {
      expect(secondary, `React should handle inbound "${command}"`).toContain(`case '${command}'`);
      expect(provider, `host should emit "${command}"`).toContain(`'${command}'`);
    }
  });

  it('wires the studio modes + command-card actions', () => {
    expect(secondary).toContain("'investigate'");
    expect(secondary).toContain("'verify'");
    expect(secondary).toContain("'prepare'");
    expect(secondary).toContain("action: 'run-command'");
    expect(secondary).toContain("action: 'copy-command'");
    expect(secondary).toContain("action: 'auto-fix'");
    expect(secondary).toContain("'verify-handoff'");
    expect(secondary).toContain("useChatSessions('workspaiStudio'");
    expect(secondary).toContain('StudioBlockerChrome');
  });

  it('handles blocker handoff + fix-applied inbound commands', () => {
    for (const command of [
      'sidebarBlockerHandoff',
      'sidebarStudioFixApplied',
      'sidebarStudioCardRefreshed',
      'sidebarStudioPatchReview',
    ]) {
      expect(secondary, `React should handle inbound "${command}"`).toContain(`case '${command}'`);
      expect(provider, `host should emit "${command}"`).toContain(`'${command}'`);
    }
    expect(provider).toContain("action === 'auto-fix'");
    expect(provider).toContain("action === 'apply-patch'");
    expect(provider).toContain('executeSidebarApplyDebugPatch');
    expect(provider).toContain('dispatchSidebarShipLoopStep');
    expect(provider).toContain('sidebarStudioShipLoop');
    expect(provider).toContain('buildSidebarStudioPrompt');
    expect(provider).toContain('refreshDashboardAfterStudioVerify');
    expect(secondary).toContain('StudioPatchReview');
    expect(secondary).toContain('StudioShipLoopStepper');
    expect(secondary).toContain("action: 'apply-patch'");
    expect(secondary).toContain("action: 'ship-loop-step'");
    expect(secondary).toContain('rollbackCommand');
    const chatTab = read('webview-ui/src/sidebar/ChatTab.tsx');
    expect(chatTab.indexOf('{props.headerChrome}')).toBeLessThan(chatTab.indexOf('<ComposerShell'));
  });

  it('shares advisor session UX primitives with an isolated studio store', () => {
    const chatTab = read('webview-ui/src/sidebar/ChatTab.tsx');
    const sessions = read('webview-ui/src/sidebar/sidebarSessions.ts');

    expect(chatTab).toContain('ChatSessionBar');
    expect(secondary).toContain("useChatSessions('workspaiImpact'");
    expect(secondary).toContain("useChatSessions('workspaiStudio'");
    expect(secondary).toContain('handleSubmitStudio');
    expect(secondary).toContain('forceNew: true');
    expect(sessions).toContain('workspaiImpact');
    expect(sessions).toContain('workspaiStudio');
  });

  it('confirms the raw-HTML sidebar monolith is fully removed', () => {
    expect(provider).not.toContain('qa-shell');
    expect(provider).not.toContain('_getHtmlContentLegacyRaw');
    expect(provider).not.toContain('acquireVsCodeApi');
    // React shell is the only HTML path.
    expect(provider).toContain('buildReactWebviewHtml');
  });
});

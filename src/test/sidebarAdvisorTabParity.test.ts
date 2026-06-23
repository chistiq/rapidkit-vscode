import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

/**
 * Guards the React Workspace Advisor migration (roadmap 2.11e). The React
 * secondary sidebar and the host `ActionsWebviewProvider` must agree on the
 * advisor streaming protocol + action set.
 */
describe('React Advisor tab ↔ host protocol parity (roadmap 2.11e)', () => {
  const secondary = read('webview-ui/src/sidebar/SecondarySidebar.tsx');
  const provider = read('src/ui/webviews/actionsWebviewProvider.ts');

  it('posts the advisor outbound commands the host handles', () => {
    for (const command of ['sidebarImpactQuery', 'sidebarAdvisorAction']) {
      expect(secondary, `React should post "${command}"`).toContain(`'${command}'`);
      expect(provider, `host should handle "${command}"`).toContain(
        `message.command === '${command}'`
      );
    }
  });

  it('handles every advisor inbound command the host emits', () => {
    for (const command of [
      'sidebarImpactScope',
      'sidebarImpactChunk',
      'sidebarImpactDone',
      'sidebarImpactError',
    ]) {
      expect(secondary, `React should handle inbound "${command}"`).toContain(`case '${command}'`);
      expect(provider, `host should emit "${command}"`).toContain(`'${command}'`);
    }
  });

  it('exposes the advisor action set (studio / verify / copy) the host supports', () => {
    expect(secondary).toContain("advisorAction('studio')");
    expect(secondary).toContain("advisorAction('verify')");
    expect(secondary).toContain("advisorAction('copy')");
    expect(provider).toContain("action === 'studio'");
    expect(provider).toContain("action === 'verify'");
    expect(provider).toContain("action === 'copy'");
  });

  it('persists advisor sessions under the workspaiImpact state key', () => {
    expect(secondary).toContain("useChatSessions('workspaiImpact'");
    const sessions = read('webview-ui/src/sidebar/sidebarSessions.ts');
    expect(sessions).toContain('workspaiImpact');
  });

  it('exposes professional session switching above the advisor composer', () => {
    const chatTab = read('webview-ui/src/sidebar/ChatTab.tsx');
    const sessionBar = read('webview-ui/src/sidebar/composer/ChatSessionBar.tsx');
    const sessionsHook = read('webview-ui/src/sidebar/useChatSessions.ts');

    expect(chatTab).toContain('ChatSessionBar');
    expect(chatTab).toContain('New chat');
    expect(sessionBar).toContain('New chat');
    expect(sessionBar).toContain('Session history');
    expect(sessionsHook).toContain('forceNew');
    expect(secondary).toContain('forceNew: true');
    expect(secondary).toContain('impact.newSession()');
  });
});

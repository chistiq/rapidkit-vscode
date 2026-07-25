import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('Create tab durable session contract', () => {
  const createTab = read('webview-ui/src/sidebar/CreateTab.tsx');
  const createHook = read('webview-ui/src/sidebar/useCreateSessions.ts');
  const secondary = read('webview-ui/src/sidebar/SecondarySidebar.tsx');
  const provider = read('src/ui/webviews/actionsWebviewProvider.ts');
  const targetSelector = read('webview-ui/src/sidebar/composer/CreateTargetSelector.tsx');

  it('reuses the shared session chrome and persists operation-scoped creation history', () => {
    expect(createTab).toContain("import { ChatSessionBar } from './composer/ChatSessionBar'");
    expect(createTab).toContain('<CreateSessionsDrawer');
    expect(createTab).toContain('<ChatSessionBar');
    expect(createHook).toContain('workspaiCreate');
    expect(createHook).toContain('startSession');
    expect(createHook).toContain('MAX_SESSIONS');
  });

  it('opens separate AI and manual sessions for workspace and project operations', () => {
    expect(secondary).toContain("method: 'ai'");
    expect(secondary).toContain("method: 'manual'");
    expect(secondary).toContain("target: 'workspace'");
    expect(secondary).toContain("target: 'project'");
    expect(secondary).toContain('const sessionId = create.startSession');
    expect(targetSelector).toContain("id: 'workspace'");
    expect(targetSelector).toContain("id: 'project'");
    expect(provider).toContain("payloadRecord.target === 'project' ? 'project' : 'workspace'");
    expect(provider).toContain("if (plan.type === 'project')");
    expect(provider).toContain('await ensureManagedDefaultWorkspace()');
  });

  it('correlates every host response with the originating create session', () => {
    expect(secondary).toContain('createSessionIdForEvent(data)');
    expect(secondary).toMatch(/sidebarAiCreateConfirm[\s\S]{0,240}sessionId/);
    expect(provider).toContain("typeof payloadRecord.sessionId === 'string'");
    expect(provider).toContain("'sidebarAiCreatePlan', { plan, modelId, planSource, sessionId }");
    expect(provider).toContain("'sidebarAiCreateError', { error: message, sessionId }");
    expect(provider).toContain('sessionId,');
  });
});

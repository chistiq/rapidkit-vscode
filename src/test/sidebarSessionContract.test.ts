import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

describe('Workspai chat session contract', () => {
  const sessions = read('webview-ui/src/sidebar/sidebarSessions.ts');
  const sessionHook = read('webview-ui/src/sidebar/useChatSessions.ts');
  const drawer = read('webview-ui/src/sidebar/drawers/ChatToolsDrawer.tsx');
  const chatTab = read('webview-ui/src/sidebar/ChatTab.tsx');
  const secondary = read('webview-ui/src/sidebar/SecondarySidebar.tsx');
  const codeActions = read('src/providers/codeActionsProvider.ts');

  it('defines one shared category model for Advisor and Studio sessions', () => {
    expect(sessions).toContain(
      "export type ChatSessionKind = 'global' | 'scope' | 'artifact' | 'editor-issue'"
    );
    expect(sessions).toContain('export interface ChatSessionScopeSnapshot');
    expect(sessions).toContain('export function chatSessionKind');
    expect(sessions).toContain('export function chatSessionGroupLabel');
    expect(sessions).toContain('export function chatSessionContextLabel');
    expect(sessions).toContain('export function chatSessionWorkspaceKey');
    expect(sessions).toContain('export function chatSessionWorkspaceLabel');
    expect(sessions).toContain("return 'editor-issue'");
    expect(sessions).toContain("return 'artifact'");
    expect(sessions).toContain("return 'scope'");
    expect(sessions).toContain("return 'global'");
  });

  it('shares session chrome with Create while keeping its rich lifecycle messages', () => {
    const createTab = read('webview-ui/src/sidebar/CreateTab.tsx');
    const createSessions = read('webview-ui/src/sidebar/useCreateSessions.ts');
    expect(createTab).toContain("import { ChatSessionBar } from './composer/ChatSessionBar'");
    expect(createTab).toContain('<ChatSessionBar');
    expect(createSessions).toContain('import type { CreateMessage, CreateSession');
    expect(createSessions).toContain('messages: session.messages.slice(-MAX_MESSAGES)');
  });

  it('stores scoped chat snapshots so active workspace switches do not rewrite old sessions', () => {
    expect(sessions).toContain('scope?: ChatSessionScopeSnapshot');
    expect(sessionHook).toContain('type StartQueryOptions');
    expect(sessionHook).toContain('scope?: Omit<ChatSessionScopeSnapshot');
    expect(sessionHook).toContain('firstSeenAt: now');
    expect(sessionHook).toContain('lastSeenAt: now');
    expect(secondary).toContain('const sessionScopeSnapshot = useMemo');
    expect(secondary).toContain(
      'scope: activeImpactSession?.editorIssue ? null : sessionScopeSnapshot'
    );
    expect(secondary).toContain(
      'scope: activeStudioSession?.editorIssue ? null : sessionScopeSnapshot'
    );
    expect(chatTab).toContain('chatSessionContextLabel(session)');
  });

  it('keeps editor diagnostic sessions independent from workspace and project scope', () => {
    expect(codeActions).toContain('buildEditorIssuePayload');
    expect(codeActions).toContain('diagnosticSignature');
    expect(codeActions).not.toContain('workspacePath:');
    expect(codeActions).not.toContain('projectPath:');
    expect(secondary).toContain('parseEditorIssueSessionInput');
    expect(secondary).toContain('openEditorSession');
    expect(secondary).toContain('forceNew: !editorIssue');
    expect(secondary).toContain('!activeImpactSession?.editorIssue');
    expect(secondary).toContain('!activeStudioSession?.editorIssue');
    const interactionScope = read('webview-ui/src/lib/sidebarInteractionScope.ts');
    expect(interactionScope).toContain('export function resolveInteractionScope');
    expect(interactionScope).toContain("scopeMode: 'none'");
    expect(interactionScope).toContain('payload: { workspace: null, project: null }');
    expect(secondary).toContain('scopeMode: sessionScopeMode(sessionForPayload)');
    expect(secondary).toContain('editorIssue: sessionForPayload.editorIssue');
  });

  it('uses workspace explorer as the selected workspace source of truth', () => {
    const extension = read('src/extension.ts');
    expect(extension).toContain("vscode.commands.registerCommand('workspai.getSelectedWorkspace'");
    expect(extension).toContain('return workspaceExplorer?.getSelectedWorkspace() ?? null;');
    expect(extension).not.toContain('return projectExplorer?.getSelectedWorkspace() ?? null;');
  });

  it('routes card and editor sessions with their own context instead of the active sidebar scope', () => {
    const provider = read('src/ui/webviews/actionsWebviewProvider.ts');
    const interactionScope = read('webview-ui/src/lib/sidebarInteractionScope.ts');
    expect(interactionScope).toContain('input.handoff');
    expect(interactionScope).toContain('input.session?.incident');
    expect(interactionScope).toContain('payloadFromSessionIncident');
    expect(secondary).toContain('chatSessionKind(activeImpact)');
    expect(secondary).toContain('sessionKind: activeImpact ? chatSessionKind(activeImpact) :');
    expect(provider).toContain('async function resolveSidebarChatContext');
    expect(provider).toContain("payloadRecord.scopeMode === 'none'");
    expect(provider).toContain('resolveEditorIssueContext(payloadRecord.editorIssue)');
    expect(provider).toContain('scopeMode: payloadRecord.scopeMode');
    expect(provider).toContain(
      'const autonomousWorkspacePath = handoff?.workspacePath ?? aiContext.workspaceRootPath'
    );
    expect(secondary).toContain("if (data.scopeMode !== 'none')");
    expect(provider).toContain('const isEditorIssueHandoff');
    expect(provider).toContain("sessionKind === 'editor-issue'");
    expect(secondary).toContain(
      '...(activeBlockerHandoff ? { blockerHandoff: activeBlockerHandoff } : {})'
    );
    expect(secondary).not.toContain('...(blockerHandoff ? { blockerHandoff } : {})');
  });

  it('groups saved sessions minimally by contract category in both chat surfaces', () => {
    expect(drawer).toContain('groupedSessions');
    expect(drawer).toContain('basenameFromPath');
    expect(drawer).toContain('chatSessionGroupLabel(kind)');
    expect(drawer).toContain("['editor-issue', 'artifact', 'scope', 'global']");
    expect(drawer).toContain("type DrawerMainTab = 'sessions' | 'questions'");
    expect(drawer).toContain('const [mainTab, setMainTab]');
    expect(drawer).toContain("title={mainTab === 'sessions' ? 'Chats' : 'Questions'}");
    expect(drawer).toContain('ws-drawer-tabs');
    expect(drawer).toContain('ws-drawer-category-tabs');
    expect(drawer).toContain('ws-drawer-session-group');
    expect(drawer).toContain('groupSessionsByWorkspace');
    expect(drawer).toContain('ws-drawer-session-workspace__head');
    expect(drawer).toContain('props.toolbar');
  });

  it('keeps active workspace and project identity visible throughout Studio', () => {
    const blockerChrome = read('webview-ui/src/sidebar/StudioBlockerChrome.tsx');
    const sessionBar = read('webview-ui/src/sidebar/composer/ChatSessionBar.tsx');
    expect(blockerChrome).toContain('ws-sidebar__studio-context-path');
    expect(blockerChrome).toContain('workspaceName?.trim()');
    expect(blockerChrome).toContain('projectName?.trim()');
    expect(sessionBar).toContain('chatSessionContextLabel(activeSession)');
    expect(sessionBar).toContain('Switch session or workspace context');
    expect(chatTab).toContain("!repairMode && activeSession?.status === 'error'");
  });

  it('keeps long user prompts readable in chat instead of dumping raw prompt blocks', () => {
    expect(chatTab).toContain('function UserChatContent');
    expect(chatTab).toContain('Show full request');
    expect(chatTab).toContain('Show less');
    expect(chatTab).toContain('<MarkdownRenderer content={visible} />');
    const sidebarCss = read('webview-ui/src/sidebar/sidebar.css');
    expect(sidebarCss).toContain('.ws-sidebar__message-toggle');
    expect(sidebarCss).toContain('.ws-sidebar__user-content');
  });

  it('keeps long commands inside chat bubbles instead of widening the Studio surface', () => {
    const sidebarCss = read('webview-ui/src/sidebar/sidebar.css');
    const markdownCss = read('webview-ui/src/styles-tailwind.css');
    expect(sidebarCss).toContain('.ws-sidebar__bubble');
    expect(sidebarCss).toContain('overflow-wrap: anywhere');
    expect(markdownCss).toContain('.md-inline-code');
    expect(markdownCss).toContain('white-space: pre-wrap');
    expect(markdownCss).toContain('.md-code-pre');
    expect(markdownCss).toContain('overflow-x: auto');
    expect(markdownCss).toContain('max-width: 100%');
  });
});

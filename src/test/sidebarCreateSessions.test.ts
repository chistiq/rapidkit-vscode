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
  const createExecution = read('src/core/createExecutionCapability.ts');
  const targetSelector = read('webview-ui/src/sidebar/composer/CreateTargetSelector.tsx');
  const createDrawer = read('webview-ui/src/sidebar/CreateHistoryPicker.tsx');
  const lifecycle = read('webview-ui/src/lib/createSessionLifecycle.ts');

  it('reuses the shared session chrome and persists operation-scoped creation history', () => {
    expect(createTab).toContain("import { ChatSessionBar } from './composer/ChatSessionBar'");
    expect(createTab).toContain('<CreateHistoryPicker');
    expect(createTab).toContain('<ChatSessionBar');
    expect(createHook).toContain('workspaiCreate');
    expect(createHook).toContain('startSession');
    expect(createHook).toContain('MAX_SESSIONS');
  });

  it('settles orphaned operations after rehydration and only locks the live operation', () => {
    expect(createHook).toContain('settleInterruptedCreateSessions(slice.sessions)');
    expect(lifecycle).toContain("session.status !== 'planning'");
    expect(lifecycle).toContain("session.status !== 'running'");
    expect(lifecycle).toContain("status: 'error'");
    expect(createDrawer).toContain('activeOperationSessionId');
    expect(createDrawer).toContain('session.sessionId === props.activeOperationSessionId');
    expect(createDrawer).not.toContain(
      "disabled={session.status === 'planning' || session.status === 'running'}"
    );
    expect(secondary).toContain('setActiveCreateOperationId(sessionId)');
  });

  it('opens separate AI and manual sessions for workspace and project operations', () => {
    expect(secondary).toContain("method: 'ai'");
    expect(secondary).toContain("method: 'manual'");
    expect(secondary).toContain("target: 'workspace'");
    expect(secondary).toContain("target: 'project'");
    expect(secondary).toContain('const sessionId = create.startSession');
    expect(targetSelector).toContain("id: 'workspace'");
    expect(targetSelector).toContain("id: 'project'");
    expect(targetSelector).toContain('active selected workspace');
    expect(secondary).toContain('activeSession.target === target');
    expect(provider).toContain("payloadRecord.target === 'project' ? 'project' : 'workspace'");
    expect(provider).toContain(
      "let workspacePath = createTarget === 'project' ? scope.workspacePath : undefined"
    );
    expect(provider).toContain('await this._readSelectedWorkspaceScope()');
    expect(provider).toContain("executeCommand('workspai.getSelectedWorkspace')");
    expect(provider).toContain('selectedWorkspace?.name?.trim()');
    expect(provider).toMatch(
      /const approvalScope = resolveExplicitWorkspaceScope[\s\S]{0,500}await this\._readSelectedWorkspaceScope\(\)/
    );
    expect(provider).toContain(
      'bindCreatePlanDestination(parsedPlan, { workspacePath, workspaceName })'
    );
    expect(createExecution).toContain("if (plan.type === 'workspace')");
    expect(createExecution).toContain('Project creation requires an active selected workspace.');
    expect(provider).toContain('executeApprovedCreatePlan');
    expect(createTab).toContain('resolveCreateTargetAfterScopeChange');
    expect(createTab).toContain('createTargetExplicitRef.current');
    expect(createTab).toContain('label="Destination"');
    expect(createTab).toContain('active workspace`');
  });

  it('correlates every host response with the originating create session', () => {
    expect(secondary).toContain('createSessionIdForEvent(data)');
    expect(secondary).toMatch(/sidebarAiCreateConfirm[\s\S]{0,240}sessionId/);
    expect(secondary).toContain(
      'const handleApprovePlan = (plan: CreationPlan, planSessionId: string)'
    );
    expect(secondary).toContain('const sessionId = planSessionId.trim()');
    expect(secondary).toMatch(
      /sidebarAiCreateConfirm[\s\S]{0,500}projectName: scope\.projectName[\s\S]{0,120}projectPath: scope\.projectPath/
    );
    expect(provider).toContain("typeof payloadRecord.sessionId === 'string'");
    expect(provider).toContain("this._postInlineCreate('sidebarAiCreatePlan'");
    expect(provider).toContain('plan: authorizedPlan');
    expect(provider).toContain('this._createPlanApprovals.begin');
    expect(provider).toContain('failureCode: `plan-${approval.code}`');
    expect(provider).toContain("this._postInlineCreate('sidebarAiCreateError'");
    expect(provider).toMatch(
      /retryPlan:\s*retryable\s*\?\s*\{\s*\.\.\.approval\.plan,\s*authorization: approval\.authorization\s*\}/
    );
    expect(provider).toContain('createManagedWorkspace');
    expect(provider).toContain('sessionId,');
  });

  it('lets users stop AI planning without pretending a filesystem transaction is cancellable', () => {
    const dispatcher = read('src/ui/webviews/actionsWebviewMessageDispatcher.ts');
    const composer = read('webview-ui/src/sidebar/composer/ComposerShell.tsx');

    expect(createTab).toContain('planningActive');
    expect(createTab).toContain('onCancelPlanning');
    expect(secondary).toContain('sidebarCancelCreatePlanning');
    expect(secondary).toContain('Planning stopped. Nothing was created or changed.');
    expect(provider).toContain('_activeCreatePlanningTokens');
    expect(provider).toContain('planningTokenSource.token');
    expect(dispatcher).toContain("command: 'sidebarCancelCreatePlanning'");
    expect(composer).toContain('const canStop');
  });
});

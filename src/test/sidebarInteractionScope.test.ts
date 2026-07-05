import { describe, expect, it } from 'vitest';

import { resolveInteractionScope } from '../../webview-ui/src/lib/sidebarInteractionScope';
import type { ChatSession } from '../../webview-ui/src/sidebar/sidebarSessions';
import type { SidebarScope } from '../../webview-ui/src/sidebar/sidebarTypes';
import type { StudioBlockerHandoffView } from '../../webview-ui/src/lib/studioBlockerHandoff';

const activeScope: SidebarScope = {
  workspaceName: 'active-wsp',
  workspacePath: '/workspaces/active-wsp',
  projectName: 'active-api',
  projectPath: '/workspaces/active-wsp/active-api',
};

describe('sidebarInteractionScope', () => {
  it('uses incident handoff scope before active sidebar selection', () => {
    const handoff = {
      cardId: 'workspace-doctor',
      cardLabel: 'Workspace Doctor',
      cardStatus: 'warn',
      blockers: [],
      sourceCommand: 'npx rapidkit doctor workspace --json',
      scope: 'project',
      workspacePath: '/workspaces/card-wsp',
      projectPath: '/workspaces/card-wsp/card-api',
    } satisfies StudioBlockerHandoffView;

    expect(resolveInteractionScope({ handoff, activeScope })).toEqual({
      scopeMode: 'scoped',
      payload: {
        workspace: { name: 'active-wsp', path: '/workspaces/card-wsp' },
        project: { name: 'active-api', path: '/workspaces/card-wsp/card-api' },
      },
    });
  });

  it('keeps editor issue sessions independent from workspace/project scope', () => {
    const session = {
      sessionId: 'studio-editor-1',
      title: 'Fix editor issue',
      messages: [],
      status: 'idle',
      editorIssue: {
        key: 'src/app.ts:1:error',
        filePath: '/external/repo/src/app.ts',
        languageId: 'typescript',
        diagnosticSignature: 'missing-import',
        firstSeenAt: '2026-07-01T00:00:00.000Z',
        lastSeenAt: '2026-07-01T00:00:00.000Z',
      },
    } satisfies ChatSession;

    expect(resolveInteractionScope({ session, activeScope })).toEqual({
      scopeMode: 'none',
      payload: { workspace: null, project: null },
    });
  });

  it('uses persisted session scope instead of a later active workspace switch', () => {
    const session = {
      sessionId: 'advisor-scope-1',
      title: 'Question',
      messages: [],
      status: 'idle',
      scope: {
        workspaceName: 'saved-wsp',
        workspacePath: '/workspaces/saved-wsp',
        projectName: 'saved-web',
        projectPath: '/workspaces/saved-wsp/saved-web',
        firstSeenAt: '2026-07-01T00:00:00.000Z',
        lastSeenAt: '2026-07-01T00:00:00.000Z',
      },
    } satisfies ChatSession;

    expect(resolveInteractionScope({ session, activeScope })).toEqual({
      scopeMode: 'scoped',
      payload: {
        workspace: { name: 'saved-wsp', path: '/workspaces/saved-wsp' },
        project: { name: 'saved-web', path: '/workspaces/saved-wsp/saved-web' },
      },
    });
  });
});

import type { ChatSession } from '@/sidebar/sidebarSessions';
import type { SidebarScope } from '@/sidebar/sidebarTypes';
import type { StudioBlockerHandoffView } from '@/lib/studioBlockerHandoff';

export type SidebarScopePayload = {
  workspace: { name?: string; path: string } | null;
  project: { name?: string; path: string } | null;
};

export type SidebarInteractionScope = {
  scopeMode: 'none' | 'scoped';
  payload: SidebarScopePayload;
};

export function scopePayloadFromScope(scope: SidebarScope): SidebarScopePayload {
  return {
    workspace: scope.workspacePath
      ? { name: scope.workspaceName, path: scope.workspacePath }
      : null,
    project: scope.projectPath ? { name: scope.projectName, path: scope.projectPath } : null,
  };
}

export function scopeFromHandoff(
  handoff: StudioBlockerHandoffView,
  fallback: SidebarScope
): SidebarScope {
  return {
    workspaceName: fallback.workspaceName,
    workspacePath: handoff.workspacePath || fallback.workspacePath,
    projectName: fallback.projectName,
    projectPath: handoff.projectPath || fallback.projectPath,
  };
}

function payloadFromSessionIncident(session: ChatSession): SidebarScopePayload | null {
  if (!session.incident) {
    return null;
  }
  return {
    workspace: session.incident.workspacePath
      ? { name: session.incident.workspaceName, path: session.incident.workspacePath }
      : null,
    project: session.incident.projectPath
      ? { name: session.incident.projectName, path: session.incident.projectPath }
      : null,
  };
}

function payloadFromSessionScope(session: ChatSession): SidebarScopePayload | null {
  if (!session.scope) {
    return null;
  }
  return {
    workspace: session.scope.workspacePath
      ? { name: session.scope.workspaceName, path: session.scope.workspacePath }
      : null,
    project: session.scope.projectPath
      ? { name: session.scope.projectName, path: session.scope.projectPath }
      : null,
  };
}

export function resolveInteractionScope(input: {
  handoff?: StudioBlockerHandoffView | null;
  session?: ChatSession | null;
  explicitScope?: SidebarScope | null;
  activeScope: SidebarScope;
}): SidebarInteractionScope {
  if (input.handoff) {
    return {
      scopeMode: 'scoped',
      payload: scopePayloadFromScope(scopeFromHandoff(input.handoff, input.activeScope)),
    };
  }
  if (input.session?.editorIssue) {
    return {
      scopeMode: 'none',
      payload: { workspace: null, project: null },
    };
  }
  if (input.session?.incident) {
    return {
      scopeMode: 'scoped',
      payload: payloadFromSessionIncident(input.session) ?? { workspace: null, project: null },
    };
  }
  if (input.session?.scope) {
    return {
      scopeMode: 'scoped',
      payload: payloadFromSessionScope(input.session) ?? { workspace: null, project: null },
    };
  }
  if (input.explicitScope) {
    return {
      scopeMode: 'scoped',
      payload: scopePayloadFromScope(input.explicitScope),
    };
  }
  return {
    scopeMode: 'scoped',
    payload: scopePayloadFromScope(input.activeScope),
  };
}

export function scopePayloadForSession(
  session: ChatSession | null,
  fallback: SidebarScope
): SidebarScopePayload {
  return resolveInteractionScope({ session, activeScope: fallback }).payload;
}

export function sessionScopeMode(session: ChatSession | null): 'none' | 'scoped' {
  return session?.editorIssue ? 'none' : 'scoped';
}

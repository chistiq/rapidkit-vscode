import type {
  IncidentProjectSelection,
  IncidentWorkspaceGraphSnapshot,
} from './incidentStudioPayload';

export function getConversationIdToCloseOnBootstrap(
  currentConversationId: string | null,
  nextConversationId: string
): string | null {
  if (!currentConversationId || currentConversationId === nextConversationId) {
    return null;
  }

  return currentConversationId;
}

export type WorkspaiShellView = 'dashboard' | 'incident-studio' | 'settings' | 'setup';

export function getConversationIdToCloseOnViewExit(
  activeView: WorkspaiShellView,
  conversationId: string | null
): string | null {
  if (activeView === 'incident-studio' || !conversationId) {
    return null;
  }

  return conversationId;
}

type IncidentStudioSyncPayload = {
  workspacePath?: string | null;
  selectedProjectPath?: string | null;
  graph?: IncidentWorkspaceGraphSnapshot | null;
};

function cleanText(value?: string | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function reconcileIncidentStudioSyncSelection(
  activeWorkspacePath: string | null,
  currentProjectPath: string | null,
  payload: IncidentStudioSyncPayload
): {
  shouldApply: boolean;
  selectionChanged: boolean;
  projectSelection: IncidentProjectSelection | null;
} {
  if (
    !activeWorkspacePath ||
    !payload.workspacePath ||
    payload.workspacePath !== activeWorkspacePath
  ) {
    return {
      shouldApply: false,
      selectionChanged: false,
      projectSelection: null,
    };
  }

  const snapshotProject = payload.graph?.project?.selectedProject ?? null;
  const normalizedProjectPath =
    typeof payload.selectedProjectPath === 'string' && payload.selectedProjectPath.trim().length > 0
      ? payload.selectedProjectPath.trim()
      : cleanText(snapshotProject?.path);

  const projectSelection = normalizedProjectPath
    ? {
        path: normalizedProjectPath,
        name: cleanText(snapshotProject?.name) || undefined,
        type: cleanText(snapshotProject?.type) || undefined,
      }
    : null;

  return {
    shouldApply: true,
    selectionChanged: currentProjectPath !== (projectSelection?.path ?? null),
    projectSelection,
  };
}

/** Unified dashboard command dispatch with activity tracking. */
import {
  getDashboardCommandAffectedEvidenceCards,
  getDashboardCommandMeta,
  shouldTrackDashboardCommand,
} from './dashboardCommandRegistry';

const ONBOARDING_HANDOFF_COMMANDS = new Set(['importProject', 'adoptProject']);

/** Merge dashboard command payload without clobbering onboarding handoff intent. */
export function buildDashboardCommandPayload(
  command: string,
  data: Record<string, unknown> | undefined,
  scopePayload: Record<string, unknown> | undefined,
  workspacePath: string | undefined
): Record<string, unknown> {
  if (ONBOARDING_HANDOFF_COMMANDS.has(command)) {
    return { ...(data ?? {}) };
  }

  const useDefaultWorkspace = data?.useDefaultWorkspace === true;
  const payload: Record<string, unknown> = {
    ...scopePayload,
    ...(data ?? {}),
  };

  if (!command.startsWith('project') && !command.startsWith('module') && !useDefaultWorkspace) {
    payload.path = workspacePath;
    payload.workspacePath = workspacePath;
  }

  return payload;
}

export function buildDashboardDispatchMessages(
  command: string,
  data?: Record<string, unknown>
): Array<{ command: string; data?: Record<string, unknown> }> {
  const meta = getDashboardCommandMeta(command);
  if (meta?.handler === 'webview-local') {
    return [{ command }];
  }

  if (!shouldTrackDashboardCommand(command)) {
    return [{ command, data }];
  }

  return [
    {
      command: 'trackDashboardCommand',
      data: { command, affectedEvidenceCardIds: getDashboardCommandAffectedEvidenceCards(command) },
    },
    { command, data },
  ];
}

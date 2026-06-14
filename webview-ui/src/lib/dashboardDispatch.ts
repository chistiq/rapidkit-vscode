/** Unified dashboard command dispatch with activity tracking. */
import {
  getDashboardCommandAffectedEvidenceCards,
  getDashboardCommandMeta,
  shouldTrackDashboardCommand,
} from './dashboardCommandRegistry';

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

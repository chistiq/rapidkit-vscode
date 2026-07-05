import {
  tryDispatchDashboardContractWebviewMessage,
  type DashboardCommandHost,
} from './welcomePanelDashboardCommands';
import {
  tryDispatchDashboardLifecycleWebviewMessage,
  type DashboardLifecycleMessageHost,
} from './welcomePanelDashboardLifecycleMessages';
import {
  tryDispatchDashboardShortcutWebviewMessage,
  type DashboardShortcutMessageHost,
} from './welcomePanelDashboardShortcutMessages';

export type DashboardMessageDispatchHost = {
  getDashboardCommandHost: () => DashboardCommandHost;
  getDashboardLifecycleMessageHost: () => DashboardLifecycleMessageHost;
  getDashboardShortcutMessageHost: () => DashboardShortcutMessageHost;
};

type DashboardMessageLane = {
  readonly name: string;
  readonly dispatch: (
    host: DashboardMessageDispatchHost,
    command: string,
    data: unknown
  ) => Promise<boolean>;
};

const DASHBOARD_MESSAGE_LANES: readonly DashboardMessageLane[] = [
  {
    name: 'dashboard-contract',
    dispatch: (host, command, data) =>
      tryDispatchDashboardContractWebviewMessage(
        host.getDashboardCommandHost(),
        command,
        data && typeof data === 'object' && !Array.isArray(data)
          ? (data as Record<string, unknown>)
          : {}
      ),
  },
  {
    name: 'dashboard-lifecycle',
    dispatch: (host, command, data) =>
      tryDispatchDashboardLifecycleWebviewMessage(
        host.getDashboardLifecycleMessageHost(),
        command,
        data
      ),
  },
  {
    name: 'dashboard-shortcut',
    dispatch: (host, command, data) =>
      tryDispatchDashboardShortcutWebviewMessage(
        host.getDashboardShortcutMessageHost(),
        command,
        data
      ),
  },
];

export function listDashboardMessageLaneNames(): readonly string[] {
  return DASHBOARD_MESSAGE_LANES.map((lane) => lane.name);
}

export async function tryDispatchDashboardWebviewMessage(
  host: DashboardMessageDispatchHost,
  command: string,
  data: unknown
): Promise<boolean> {
  for (const lane of DASHBOARD_MESSAGE_LANES) {
    if (await lane.dispatch(host, command, data)) {
      return true;
    }
  }

  return false;
}

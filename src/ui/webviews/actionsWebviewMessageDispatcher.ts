import {
  resolveSidebarActionSurface,
  type SidebarActionSurfaceMeta,
} from '../../contracts/sidebarActionSurface';
import { normalizeWebviewMessage } from '../../contracts/webviewProtocol';

export type ActionsWebviewMessageDispatchHost = {
  runInlineAICreatePlan: (data: unknown) => Promise<void>;
  runInlineAICreateConfirm: (data: unknown) => Promise<void>;
  runSidebarManualCreate: (data: unknown) => Promise<void>;
  runSidebarCreatedWorkspaceBootstrap: (data: unknown) => Promise<void>;
  runInlineImpactQuery: (data: unknown) => Promise<void>;
  runSidebarAdvisorAction: (data: unknown) => Promise<void>;
  runInlineStudioQuery: (data: unknown) => Promise<void>;
  runSidebarStudioAction: (data: unknown) => Promise<void>;
  focusPrimarySidebarView: (data: unknown) => Promise<void>;
  openDashboardSection: (data: unknown) => Promise<void>;
  sendInlineScope: () => Promise<void>;
  sendInlineModels: () => Promise<void>;
  setPreferredModel: (modelId: string) => Promise<void>;
  runSidebarAction: (action: SidebarActionSurfaceMeta, data: unknown) => Promise<void>;
  warnUnknownSidebarAction: (command: string) => void;
};

type ActionsWebviewMessageLane = {
  readonly command: string;
  readonly dispatch: (host: ActionsWebviewMessageDispatchHost, data: unknown) => Promise<void>;
};

function readPreferredModelId(data: unknown): string {
  return data && typeof data === 'object' && 'modelId' in data && typeof data.modelId === 'string'
    ? data.modelId
    : 'auto';
}

const ACTIONS_WEBVIEW_MESSAGE_LANES: readonly ActionsWebviewMessageLane[] = [
  {
    command: 'sidebarAiCreatePlan',
    dispatch: (host, data) => host.runInlineAICreatePlan(data),
  },
  {
    command: 'sidebarAiCreateConfirm',
    dispatch: (host, data) => host.runInlineAICreateConfirm(data),
  },
  {
    command: 'sidebarManualCreate',
    dispatch: (host, data) => host.runSidebarManualCreate(data),
  },
  {
    command: 'sidebarCreatedWorkspaceBootstrap',
    dispatch: (host, data) => host.runSidebarCreatedWorkspaceBootstrap(data),
  },
  {
    command: 'sidebarImpactQuery',
    dispatch: (host, data) => host.runInlineImpactQuery(data),
  },
  {
    command: 'sidebarAdvisorAction',
    dispatch: (host, data) => host.runSidebarAdvisorAction(data),
  },
  {
    command: 'sidebarStudioQuery',
    dispatch: (host, data) => host.runInlineStudioQuery(data),
  },
  {
    command: 'sidebarStudioAction',
    dispatch: (host, data) => host.runSidebarStudioAction(data),
  },
  {
    command: 'sidebarFocusView',
    dispatch: (host, data) => host.focusPrimarySidebarView(data),
  },
  {
    command: 'sidebarOpenDashboard',
    dispatch: (host, data) => host.openDashboardSection(data),
  },
  {
    command: 'sidebarRefreshScope',
    dispatch: (host) => host.sendInlineScope(),
  },
  {
    command: 'sidebarRefreshModels',
    dispatch: (host) => host.sendInlineModels(),
  },
  {
    command: 'setPreferredModel',
    dispatch: (host, data) => host.setPreferredModel(readPreferredModelId(data)),
  },
];

export function listActionsWebviewMessageCommands(): readonly string[] {
  return ACTIONS_WEBVIEW_MESSAGE_LANES.map((lane) => lane.command);
}

export async function dispatchActionsWebviewMessage(
  host: ActionsWebviewMessageDispatchHost,
  rawMessage: unknown
): Promise<void> {
  const message = normalizeWebviewMessage(rawMessage);
  if (!message) {
    return;
  }

  const lane = ACTIONS_WEBVIEW_MESSAGE_LANES.find(
    (candidate) => candidate.command === message.command
  );
  if (lane) {
    await lane.dispatch(host, message.data);
    return;
  }

  const action = resolveSidebarActionSurface(message.command);
  if (!action) {
    host.warnUnknownSidebarAction(message.command);
    return;
  }

  await host.runSidebarAction(action, message.data);
}

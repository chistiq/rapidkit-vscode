import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('vscode', () => ({
  workspace: { workspaceFolders: [] },
  window: { showErrorMessage: vi.fn() },
  commands: { executeCommand: vi.fn() },
  Uri: { file: (value: string) => ({ fsPath: value }) },
}));

function readPanelsSource(currentDir: string, relativePath: string): string {
  return readFileSync(path.resolve(currentDir, relativePath), 'utf8');
}

function readWelcomePanelRoutingSource(currentDir: string): string {
  return `${readPanelsSource(currentDir, '../ui/panels/welcomePanel.ts')}\n${readPanelsSource(
    currentDir,
    '../ui/panels/welcomePanelWebviewMessageDispatch.ts'
  )}`;
}

describe('welcomePanelWorkspaiSettingsMessages', () => {
  it('exports registry-backed settings dispatch', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelWorkspaiSettingsMessages.ts'),
      'utf8'
    );

    expect(source).toContain('export async function tryDispatchWorkspaiSettingsWebviewMessage');
    expect(source).toContain('setWorkspaiPreferredModel');
    expect(source).toContain('buildWorkspaiSettingsPayload');
    expect(source).toContain("'requestWorkspaiSettings'");
  });
});

describe('welcomePanelAiCreationMessages', () => {
  it('exports parse + confirm creation handlers', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelAiCreationMessages.ts'),
      'utf8'
    );

    expect(source).toContain('export async function handleAiParseCreationMessage');
    expect(source).toContain('export async function handleAiCreationConfirmMessage');
    expect(source).toContain('aiCreationProgress');
    expect(source).toContain('beginGovernanceChainForWorkspace');
  });
});

describe('welcomePanelWorkspaceSelectionMessages', () => {
  it('exports workspace selection dispatch', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelWorkspaceSelectionMessages.ts'),
      'utf8'
    );

    expect(source).toContain('export async function tryDispatchWorkspaceSelectionWebviewMessage');
    expect(source).toContain("'selectWorkspace'");
    expect(source).toContain('postIncidentStudioUiPreferences');
  });
});

describe('welcomePanelAiModalMessages', () => {
  it('exports AI modal dispatch ahead of the welcomePanel switch', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelAiModalMessages.ts'),
      'utf8'
    );
    const welcomePanelSource = readPanelsSource(currentDir, '../ui/panels/welcomePanel.ts');
    const routingSource = readWelcomePanelRoutingSource(currentDir);

    expect(source).toContain('export async function tryDispatchAiModalWebviewMessage');
    expect(source).toContain('export async function handleAiSuggestModulesMessage');
    expect(source).toContain('export function handleAiCancelQueryMessage');
    expect(source).toContain("case 'aiQuery':");
    expect(routingSource).toContain('isAiModalWebviewCommand(');
    expect(welcomePanelSource).not.toContain("case 'aiQuery':");
    expect(welcomePanelSource).not.toContain("case 'aiCancelQuery':");
  });
});

describe('welcomePanelChatBrainLifecycle', () => {
  it('exports chat lifecycle handlers wired through incident studio host', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelChatBrainLifecycle.ts'),
      'utf8'
    );
    const welcomePanelSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanel.ts'),
      'utf8'
    );

    const chatBrainHostFactoriesSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelChatBrainHostFactories.ts'),
      'utf8'
    );

    expect(source).toContain('export async function handleAiChatStart');
    expect(source).toContain('export async function handleAiChatSyncWorkspace');
    expect(source).toContain('export function ensureSystemGraphWatcher');
    expect(chatBrainHostFactoriesSource).toContain('handleAiChatStart(getChatBrainLifecycleHost()');
    expect(welcomePanelSource).toContain('buildWelcomePanelChatBrainLifecycleHost');
    expect(welcomePanelSource).not.toContain('private async _handleAiChatStart');
  });
});

describe('welcomePanelDoctorMessages', () => {
  it('exports doctor/navigator handlers wired through incident studio host', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelDoctorMessages.ts'),
      'utf8'
    );
    const welcomePanelSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanel.ts'),
      'utf8'
    );

    const chatBrainHostFactoriesSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelChatBrainHostFactories.ts'),
      'utf8'
    );

    expect(source).toContain('export async function handleRunDoctorMessage');
    expect(source).toContain('export async function handleOpenIncidentNavigatorTargetMessage');
    expect(source).toContain('export async function handleViewProjectDoctorReportMessage');
    expect(source).toContain('workspai.checkWorkspaceHealth');
    expect(chatBrainHostFactoriesSource).toContain('handleRunDoctorMessage(getDoctorMessageHost()');
    expect(welcomePanelSource).toContain('buildWelcomePanelIncidentStudioMessageHost');
    expect(welcomePanelSource).not.toContain('private async _handleRunDoctorMessage');
  });
});

describe('welcomePanelExampleWorkspaces', () => {
  it('exports example clone/update helpers used by workspace selection host', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelExampleWorkspaces.ts'),
      'utf8'
    );
    const welcomePanelSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanel.ts'),
      'utf8'
    );

    const messageHostFactoriesSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelMessageHostFactories.ts'),
      'utf8'
    );

    expect(source).toContain('export async function cloneExampleWorkspace');
    expect(source).toContain('export async function updateExampleWorkspace');
    expect(messageHostFactoriesSource).toContain(
      'cloneExampleWorkspace(getExampleWorkspacesHost()'
    );
    expect(welcomePanelSource).toContain('buildWelcomePanelWorkspaceSelectionMessageHost');
    expect(welcomePanelSource).not.toContain('private async _cloneExample');
  });
});

describe('welcomePanelAiCreationMessages', () => {
  it('exports AI creation dispatch with no welcomePanel switch fallback', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelAiCreationMessages.ts'),
      'utf8'
    );
    const welcomePanelSource = readPanelsSource(currentDir, '../ui/panels/welcomePanel.ts');
    const routingSource = readWelcomePanelRoutingSource(currentDir);

    expect(source).toContain('export async function tryDispatchAiCreationWebviewMessage');
    expect(source).toContain("case 'aiParseCreation'");
    expect(routingSource).toContain('isAiCreationWebviewCommand(');
    expect(welcomePanelSource).not.toContain("case 'aiParseCreation':");
    expect(welcomePanelSource).not.toContain('switch (message.command)');
  });
});

describe('welcomePanelBootstrapPayload', () => {
  it('exports initial bootstrap payload senders used by ready flow', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelBootstrapPayload.ts'),
      'utf8'
    );
    const welcomePanelSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanel.ts'),
      'utf8'
    );

    expect(source).toContain('export function sendWelcomePanelInitialData');
    expect(source).toContain('export async function sendWorkspaceToolStatus');
    expect(source).toContain('export async function sendWorkspaceStatus');
    expect(welcomePanelSource).toContain('sendWelcomePanelInitialData(');
    expect(welcomePanelSource).not.toContain('probeBinaryWithFallbacks');
  });
});

describe('welcomePanelReadyMessages', () => {
  it('exports ready bootstrap dispatch ahead of the welcomePanel switch', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelReadyMessages.ts'),
      'utf8'
    );
    const welcomePanelSource = readPanelsSource(currentDir, '../ui/panels/welcomePanel.ts');
    const routingSource = readWelcomePanelRoutingSource(currentDir);

    expect(source).toContain('export function handleReadyWebviewMessage');
    expect(source).toContain('flushPendingQueuedModals');
    expect(source).toContain('SetupPanel.bootstrapEmbedded');
    expect(routingSource).toContain('isReadyWebviewCommand(');
    expect(welcomePanelSource).not.toContain("case 'ready':");
  });
});

describe('welcomePanelCreationNavigationMessages', () => {
  it('exports creation/navigation dispatch ahead of the welcomePanel switch', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelCreationNavigationMessages.ts'),
      'utf8'
    );
    const welcomePanelSource = readPanelsSource(currentDir, '../ui/panels/welcomePanel.ts');
    const routingSource = readWelcomePanelRoutingSource(currentDir);

    expect(source).toContain('export async function tryDispatchCreationNavigationWebviewMessage');
    expect(source).toContain("case 'createWorkspace':");
    expect(source).toContain("case 'openIncidentStudioTab':");
    expect(routingSource).toContain('tryDispatchCreationNavigationWebviewMessage(');
    expect(welcomePanelSource).not.toContain("case 'createWorkspace':");
    expect(welcomePanelSource).not.toContain("case 'openDashboardTab':");
  });
});

describe('welcomePanelAnalyzeReportMessages', () => {
  it('exports analyze/report dispatch ahead of the welcomePanel switch', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelAnalyzeReportMessages.ts'),
      'utf8'
    );
    const welcomePanelSource = readPanelsSource(currentDir, '../ui/panels/welcomePanel.ts');
    const routingSource = readWelcomePanelRoutingSource(currentDir);

    expect(source).toContain('export async function tryDispatchAnalyzeReportWebviewMessage');
    expect(source).toContain("case 'runAnalyze':");
    expect(source).toContain("case 'revealEvidence':");
    expect(source).toContain('runWorkspaceAnalyze');
    expect(routingSource).toContain('tryDispatchAnalyzeReportWebviewMessage(');
    expect(welcomePanelSource).not.toContain("case 'runAnalyze':");
    expect(welcomePanelSource).not.toContain("case 'copyText':");
  });
});

describe('welcomePanelDashboardShortcutMessages', () => {
  it('exports dashboard shortcut dispatch ahead of the welcomePanel switch', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelDashboardShortcutMessages.ts'),
      'utf8'
    );
    const welcomePanelSource = readPanelsSource(currentDir, '../ui/panels/welcomePanel.ts');
    const routingSource = readWelcomePanelRoutingSource(currentDir);

    expect(source).toContain('export async function tryDispatchDashboardShortcutWebviewMessage');
    expect(source).toContain("case 'aiFixPreviewLite':");
    expect(source).toContain("case 'upgradeCore':");
    expect(source).toContain("case 'openDocs':");
    expect(routingSource).toContain('tryDispatchDashboardWebviewMessage(host');
    expect(welcomePanelSource).not.toContain("case 'aiForWorkspace':");
    expect(welcomePanelSource).not.toContain("case 'openDocs':");
  });
});

describe('welcomePanelModulesCatalog', () => {
  it('exports catalog dispatch ahead of the welcomePanel switch', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelModulesCatalog.ts'),
      'utf8'
    );
    const welcomePanelSource = readPanelsSource(currentDir, '../ui/panels/welcomePanel.ts');
    const routingSource = readWelcomePanelRoutingSource(currentDir);

    expect(source).toContain('export async function tryDispatchCatalogWebviewMessage');
    expect(source).toContain('export async function refreshModulesCatalog');
    expect(source).toContain('export async function showModuleDetails');
    expect(source).toContain("case 'installModule':");
    expect(source).toContain('updateModulesCatalog');
    expect(routingSource).toContain('tryDispatchCatalogWebviewMessage(');
    expect(welcomePanelSource).not.toContain("case 'installModule':");
    expect(welcomePanelSource).not.toContain("case 'showModuleDetails':");
  });
});

describe('welcomePanelDashboardLifecycleMessages', () => {
  it('routes dashboard message lanes through one typed dispatcher', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelDashboardMessageDispatcher.ts'),
      'utf8'
    );
    const routingSource = readWelcomePanelRoutingSource(currentDir);

    expect(source).toContain('export type DashboardMessageDispatchHost');
    expect(source).toContain('type DashboardMessageLane');
    expect(source).toContain('listDashboardMessageLaneNames');
    expect(source).toContain("name: 'dashboard-contract'");
    expect(source).toContain("name: 'dashboard-lifecycle'");
    expect(source).toContain("name: 'dashboard-shortcut'");
    expect(source).toContain('tryDispatchDashboardContractWebviewMessage(');
    expect(source).toContain('tryDispatchDashboardLifecycleWebviewMessage(');
    expect(source).toContain('tryDispatchDashboardShortcutWebviewMessage(');
    expect(routingSource).toContain('tryDispatchDashboardWebviewMessage(host');
    expect(routingSource).not.toContain('tryDispatchDashboardContractWebviewMessage(');
    expect(routingSource).not.toContain('tryDispatchDashboardLifecycleWebviewMessage(');
    expect(routingSource).not.toContain('tryDispatchDashboardShortcutWebviewMessage(');
  });

  it('exports dashboard lifecycle dispatch ahead of the welcomePanel switch', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelDashboardLifecycleMessages.ts'),
      'utf8'
    );
    const welcomePanelSource = readPanelsSource(currentDir, '../ui/panels/welcomePanel.ts');
    const routingSource = readWelcomePanelRoutingSource(currentDir);

    expect(source).toContain('export async function tryDispatchDashboardLifecycleWebviewMessage');
    expect(source).toContain("case 'requestDashboardEvidence':");
    expect(source).toContain("case 'trackDashboardNavigation':");
    expect(routingSource).toContain('tryDispatchDashboardWebviewMessage(host');
    expect(welcomePanelSource).not.toContain("case 'requestDashboardEvidence':");
    expect(welcomePanelSource).not.toContain("case 'clearDashboardActivity':");
  });

  it('posts visible card failure when direct evidence refresh throws', async () => {
    const { tryDispatchDashboardLifecycleWebviewMessage } =
      await import('../ui/panels/welcomePanelDashboardLifecycleMessages');
    const postDashboardEvidenceRefreshFailed = vi.fn();

    const handled = await tryDispatchDashboardLifecycleWebviewMessage(
      {
        context: {} as never,
        sendDashboardEvidence: vi.fn(async () => {
          throw new Error('artifact reader failed');
        }),
        sendWorkspaceToolStatus: vi.fn(),
        resolveTelemetryWorkspacePath: () => '/ws',
        postDashboardEvidenceRefreshFailed,
      },
      'refreshDashboardEvidenceCard',
      {
        workspacePath: '/ws',
        cardIds: ['workspaceVerify'],
        requestId: 42,
      }
    );

    expect(handled).toBe(true);
    expect(postDashboardEvidenceRefreshFailed).toHaveBeenCalledWith({
      reason: 'Dashboard evidence refresh failed: artifact reader failed',
      cardIds: ['workspaceVerify'],
      requestId: 42,
      refreshMode: 'patch',
    });
  });

  it('routes graph stream lifecycle without falling through to command execution', async () => {
    const { tryDispatchDashboardLifecycleWebviewMessage } =
      await import('../ui/panels/welcomePanelDashboardLifecycleMessages');
    const startWorkspaceGraphStream = vi.fn();
    const stopWorkspaceGraphStream = vi.fn();
    const resyncWorkspaceGraphStream = vi.fn();
    const host = {
      context: {} as never,
      sendDashboardEvidence: vi.fn(),
      sendWorkspaceToolStatus: vi.fn(),
      resolveTelemetryWorkspacePath: () => '/ws',
      startWorkspaceGraphStream,
      stopWorkspaceGraphStream,
      resyncWorkspaceGraphStream,
    };

    expect(
      await tryDispatchDashboardLifecycleWebviewMessage(host, 'startWorkspaceGraphStream', {
        workspacePath: '/ws',
      })
    ).toBe(true);
    expect(
      await tryDispatchDashboardLifecycleWebviewMessage(host, 'resyncWorkspaceGraphStream', {})
    ).toBe(true);
    expect(
      await tryDispatchDashboardLifecycleWebviewMessage(host, 'stopWorkspaceGraphStream', {})
    ).toBe(true);
    expect(startWorkspaceGraphStream).toHaveBeenCalledWith('/ws');
    expect(resyncWorkspaceGraphStream).toHaveBeenCalledOnce();
    expect(stopWorkspaceGraphStream).toHaveBeenCalledOnce();
  });

  it('normalizes graph recording lifecycle payloads before reaching the host', async () => {
    const { tryDispatchDashboardLifecycleWebviewMessage } =
      await import('../ui/panels/welcomePanelDashboardLifecycleMessages');
    const startWorkspaceGraphRecording = vi.fn(async () => undefined);
    const appendWorkspaceGraphRecordingFrame = vi.fn(async () => undefined);
    const stopWorkspaceGraphRecording = vi.fn(async () => undefined);
    const openWorkspaceGraphRecording = vi.fn(async () => undefined);
    const host = {
      context: {} as never,
      sendDashboardEvidence: vi.fn(),
      sendWorkspaceToolStatus: vi.fn(),
      resolveTelemetryWorkspacePath: () => '/ws',
      startWorkspaceGraphRecording,
      appendWorkspaceGraphRecordingFrame,
      stopWorkspaceGraphRecording,
      openWorkspaceGraphRecording,
    };

    await tryDispatchDashboardLifecycleWebviewMessage(host, 'startWorkspaceGraphRecording', {
      workspacePath: '/ws',
      mode: 'change-driven',
      initialRevision: 'revision-1',
    });
    await tryDispatchDashboardLifecycleWebviewMessage(host, 'appendWorkspaceGraphRecordingFrame', {
      sessionId: 'session-1',
      revision: 'revision-1',
      capturedAt: '2026-07-23T00:00:00.000Z',
      width: 1280,
      height: 720,
      pngDataUrl: 'data:image/png;base64,payload',
      change: {
        kind: 'baseline',
        title: 'Baseline',
        revision: 'revision-1',
        entitiesAdded: 1,
        entitiesRemoved: 0,
        entitiesChanged: 0,
        relationsAdded: 0,
        relationsRemoved: 0,
        relationsChanged: 0,
        highlightedEntityIds: [],
      },
    });
    await tryDispatchDashboardLifecycleWebviewMessage(host, 'stopWorkspaceGraphRecording', {
      sessionId: 'session-1',
    });
    await tryDispatchDashboardLifecycleWebviewMessage(host, 'openWorkspaceGraphRecording', {});

    expect(startWorkspaceGraphRecording).toHaveBeenCalledWith({
      workspacePath: '/ws',
      mode: 'change-driven',
      initialRevision: 'revision-1',
    });
    expect(appendWorkspaceGraphRecordingFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        revision: 'revision-1',
        width: 1280,
        height: 720,
      })
    );
    expect(stopWorkspaceGraphRecording).toHaveBeenCalledWith({
      sessionId: 'session-1',
      webmDataUrl: undefined,
    });
    expect(openWorkspaceGraphRecording).toHaveBeenCalledOnce();
  });
});

describe('welcomePanelDashboardOpsChain', () => {
  it('exports governance chain runners', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelDashboardOpsChain.ts'),
      'utf8'
    );

    expect(source).toContain('export async function runDashboardOpsChainCommand');
    expect(source).toContain('export async function beginGovernanceChainForWorkspace');
    expect(source).toContain('startDashboardOpsChain');
    expect(source).toContain('blockDashboardOpsChain');
  });
});

describe('welcomePanelIncidentStudioMessages', () => {
  it('exports incident studio dispatch ahead of the welcomePanel switch', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelIncidentStudioMessages.ts'),
      'utf8'
    );
    const welcomePanelSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanel.ts'),
      'utf8'
    );

    expect(source).toContain('export async function tryDispatchIncidentStudioWebviewMessage');
    expect(source).toContain('export function isIncidentStudioWebviewCommand');
    expect(source).toContain('export function handleAiChatCloseConversation');
    expect(source).toContain("case 'studioMessage':");
    expect(source).toContain('host.isDashboardStudioSidebarOnly()');
    expect(source).toContain("case 'aiChatClose':");
    expect(source).toContain('postIncidentStudioTelemetry');
    expect(welcomePanelSource).toContain('tryDispatchIncidentStudioWebviewMessage(');
    expect(welcomePanelSource).not.toContain("case 'studioMessage':");
    expect(welcomePanelSource).not.toContain("case 'requestIncidentStudioTelemetry':");
  });
});

describe('welcomePanelGitRollback', () => {
  it('exports git dirty scan + auto-rollback helpers wired through chat-brain execute host', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelGitRollback.ts'),
      'utf8'
    );
    const welcomePanelSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanel.ts'),
      'utf8'
    );

    const chatBrainHostFactoriesSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelChatBrainHostFactories.ts'),
      'utf8'
    );

    expect(source).toContain('export async function readGitDirtyEntries');
    expect(source).toContain('export async function attemptIncidentAutoRollback');
    expect(source).toContain("run('git', ['status', '--porcelain']");
    expect(chatBrainHostFactoriesSource).toContain('readGitDirtyEntries');
    expect(chatBrainHostFactoriesSource).toContain('attemptIncidentAutoRollback');
    expect(welcomePanelSource).toContain('buildWelcomePanelChatBrainExecuteActionHost');
    expect(welcomePanelSource).not.toContain('private async _readGitDirtyEntries');
    expect(welcomePanelSource).not.toContain('private async _attemptIncidentAutoRollback');
  });
});

describe('welcomePanelDashboardStudioHost', () => {
  it('exports dashboard studio host factory used by welcomePanel', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelDashboardStudioHost.ts'),
      'utf8'
    );
    const welcomePanelSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanel.ts'),
      'utf8'
    );

    expect(source).toContain('export function buildDashboardStudioHost');
    expect(welcomePanelSource).toContain('buildDashboardStudioHost({');
    expect(welcomePanelSource).not.toMatch(
      /private _dashboardStudioHost\(\): DashboardStudioHost \{\s*return \{/
    );
  });
});

describe('welcomePanelProjectTypeDetection', () => {
  it('exports filesystem project-type detection used by welcomePanel hosts', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelProjectTypeDetection.ts'),
      'utf8'
    );
    const welcomePanelSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanel.ts'),
      'utf8'
    );

    expect(source).toContain('export async function detectProjectTypeFromPath');
    expect(welcomePanelSource).toContain('detectProjectTypeFromPath');
    expect(welcomePanelSource).not.toContain('static async _detectProjectTypeStatic');
  });
});

describe('welcomePanelHtmlContent', () => {
  it('exports React webview shell builder adopted by welcomePanel', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelHtmlContent.ts'),
      'utf8'
    );
    const welcomePanelSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanel.ts'),
      'utf8'
    );

    expect(source).toContain('export function buildWelcomePanelHtmlContent');
    expect(source).toContain('buildReactWebviewHtml');
    expect(welcomePanelSource).toContain(
      'buildWelcomePanelHtmlContent(context, this._panel.webview)'
    );
    expect(welcomePanelSource).not.toContain('private _getHtmlContent');
  });
});

describe('welcomePanelArchitectureTelemetry', () => {
  it('exports architecture reasoning telemetry wired through chat-brain execute host', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelArchitectureTelemetry.ts'),
      'utf8'
    );
    const welcomePanelSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanel.ts'),
      'utf8'
    );

    const chatBrainHostFactoriesSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelChatBrainHostFactories.ts'),
      'utf8'
    );

    expect(source).toContain('export function emitArchitectureReasoningRuntimeEvents');
    expect(source).toContain('workspai.studio.architecture_warning_shown');
    expect(chatBrainHostFactoriesSource).toContain('emitArchitectureReasoningRuntimeEvents(');
    expect(welcomePanelSource).toContain('buildWelcomePanelChatBrainExecuteActionHost');
    expect(welcomePanelSource).not.toContain('private _emitArchitectureReasoningRuntimeEvents');
  });
});

describe('welcomePanelInstalledModules', () => {
  it('exports registry.json installed-module reader used by welcomePanel', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelInstalledModules.ts'),
      'utf8'
    );
    const welcomePanelSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanel.ts'),
      'utf8'
    );

    expect(source).toContain('export async function readInstalledModulesFromProject');
    expect(source).toContain('registry.json');
    expect(welcomePanelSource).toContain('readInstalledModulesFromProject');
    expect(welcomePanelSource).not.toContain('_readInstalledModules');
  });
});

describe('welcomePanelProjectDiscoveryBindings', () => {
  it('exports welcomePanel project-discovery bindings wired through hosts', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelProjectDiscoveryBindings.ts'),
      'utf8'
    );
    const welcomePanelSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanel.ts'),
      'utf8'
    );

    expect(source).toContain('export function buildWelcomePanelProjectDiscoveryDeps');
    expect(source).toContain('export async function buildWorkspaceProjectCandidatesForPanel');
    expect(source).toContain('export async function resolveScopedProjectForPanel');
    expect(welcomePanelSource).toContain('buildWorkspaceProjectCandidatesForPanel');
    expect(welcomePanelSource).toContain('resolveScopedProjectForPanel');
    expect(welcomePanelSource).toContain('_projectDiscoveryBindings');
  });
});

describe('welcomePanelFrameworkInference', () => {
  it('exports framework inference used by welcomePanel hosts', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelFrameworkInference.ts'),
      'utf8'
    );
    const welcomePanelSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanel.ts'),
      'utf8'
    );

    expect(source).toContain('export async function inferFrameworkFromWorkspace');
    expect(source).toContain('fastapi');
    expect(welcomePanelSource).toContain('inferFrameworkFromWorkspace(');
    expect(welcomePanelSource).not.toContain(
      'private async _inferFrameworkFromWorkspace(workspacePath: string): Promise<string> {\n    const checks'
    );
  });
});

describe('welcomePanelStudioTelemetry', () => {
  it('exports studio telemetry helpers wired through welcomePanel', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelStudioTelemetry.ts'),
      'utf8'
    );
    const welcomePanelSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanel.ts'),
      'utf8'
    );

    expect(source).toContain('export function trackWelcomePanelStudioEvent');
    expect(source).toContain('export function resolveWelcomePanelTelemetryWorkspacePath');
    expect(welcomePanelSource).toContain('trackWelcomePanelStudioEvent');
    expect(welcomePanelSource).toContain('_studioTelemetryBindings');
    expect(welcomePanelSource).not.toContain(
      'WorkspaceUsageTracker.getInstance().trackCommandEvent'
    );
  });
});

describe('welcomePanelIncidentSessionPersistence', () => {
  it('exports incident studio session save helpers wired through welcomePanel', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelIncidentSessionPersistence.ts'),
      'utf8'
    );
    const welcomePanelSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanel.ts'),
      'utf8'
    );

    expect(source).toContain('export function normalizeIncidentStudioSessionPhase');
    expect(source).toContain('export async function saveDashboardIncidentStudioSession');
    expect(welcomePanelSource).toContain('saveDashboardIncidentStudioSession');
    expect(welcomePanelSource).not.toContain('_normalizeIncidentStudioSessionPhase');
  });
});

describe('welcomePanelWebviewMessaging', () => {
  it('exports webview post helpers adopted by welcomePanel', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelWebviewMessaging.ts'),
      'utf8'
    );
    const welcomePanelSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanel.ts'),
      'utf8'
    );

    expect(source).toContain('export function postWelcomePanelWebviewMessage');
    expect(source).toContain('export function postWelcomePanelAIStreamDoneOnce');
    expect(source).toContain('createExtensionWebviewMessage');
    expect(welcomePanelSource).toContain('postWelcomePanelWebviewMessage');
    expect(welcomePanelSource).toContain('postWelcomePanelAIStreamDoneOnce');
    expect(welcomePanelSource).not.toContain('createExtensionWebviewMessage(');
  });
});

describe('welcomePanelDashboardHostFactories', () => {
  it('exports dashboard host factories wired through welcomePanel', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelDashboardHostFactories.ts'),
      'utf8'
    );
    const welcomePanelSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanel.ts'),
      'utf8'
    );

    expect(source).toContain('export function buildWelcomePanelDashboardEvidenceHost');
    expect(source).toContain('export function buildWelcomePanelDashboardOpsChainHost');
    expect(welcomePanelSource).toContain('_dashboardHostBindings');
    expect(welcomePanelSource).toContain('buildWelcomePanelDashboardEvidenceHost');
    expect(welcomePanelSource).not.toContain('runDashboardOpsChainCommand(');
  });
});

describe('welcomePanelDashboardStudioDispatch', () => {
  it('exports dashboard studio dispatch helpers wired through welcomePanel', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelDashboardStudioDispatch.ts'),
      'utf8'
    );
    const welcomePanelSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanel.ts'),
      'utf8'
    );

    expect(source).toContain('export async function dispatchDashboardStudioAction');
    expect(source).toContain('export async function dispatchDashboardStudioMessage');
    expect(welcomePanelSource).toContain('dispatchDashboardStudioAction');
    expect(welcomePanelSource).toContain('_handleDashboardStudioAction');
    expect(welcomePanelSource).toContain("get<boolean>('studio.sidebarOnly', true)");
  });
});

describe('welcomePanelDoctorEvidenceWatcher', () => {
  it('exports doctor evidence watcher registration used by welcomePanel constructor', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelDoctorEvidenceWatcher.ts'),
      'utf8'
    );
    const welcomePanelSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanel.ts'),
      'utf8'
    );

    expect(source).toContain('export function registerWelcomePanelDoctorEvidenceWatcher');
    expect(source).toContain('{.workspai,.rapidkit}/reports/**/*.json');
    expect(welcomePanelSource).toContain('registerWelcomePanelDoctorEvidenceWatcher');
    expect(welcomePanelSource).not.toContain('_registerDoctorEvidenceWatcher');
  });
});

describe('welcomePanelMessageHostFactories', () => {
  it('exports bootstrap/ready/navigation host factories wired through welcomePanel', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelMessageHostFactories.ts'),
      'utf8'
    );
    const welcomePanelSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanel.ts'),
      'utf8'
    );

    expect(source).toContain('export function buildWelcomePanelBootstrapPayloadHost');
    expect(source).toContain('export function buildWelcomePanelReadyMessageHost');
    expect(source).toContain('export function buildWelcomePanelAiModalMessageHost');
    expect(welcomePanelSource).toContain('_messageHostBindings');
    expect(welcomePanelSource).toContain('buildWelcomePanelBootstrapPayloadHost');
    expect(welcomePanelSource).toContain('buildWelcomePanelReadyMessageHost');
  });
});

describe('welcomePanelChatBrainHostFactories', () => {
  it('exports chat-brain/incident host factories wired through welcomePanel', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelChatBrainHostFactories.ts'),
      'utf8'
    );
    const welcomePanelSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanel.ts'),
      'utf8'
    );

    expect(source).toContain('export function buildWelcomePanelChatBrainQueryHost');
    expect(source).toContain('export function buildWelcomePanelChatBrainExecuteActionHost');
    expect(source).toContain('export function buildWelcomePanelIncidentStudioMessageHost');
    expect(welcomePanelSource).toContain('_chatBrainHostBindings');
    expect(welcomePanelSource).toContain('buildWelcomePanelIncidentStudioMessageHost');
  });
});

describe('welcomePanelWebviewMessageDispatch', () => {
  it('exports centralized webview message dispatch adopted by welcomePanel', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelWebviewMessageDispatch.ts'),
      'utf8'
    );
    const welcomePanelSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanel.ts'),
      'utf8'
    );

    expect(source).toContain('export async function dispatchWelcomePanelWebviewMessage');
    expect(source).toContain('tryDispatchDashboardWebviewMessage');
    expect(source).toContain('tryDispatchIncidentStudioWebviewMessage');
    expect(welcomePanelSource).toContain('dispatchWelcomePanelWebviewMessage');
    expect(welcomePanelSource).toContain('_webviewMessageDispatchHost');
    expect(welcomePanelSource).not.toContain('tryDispatchDashboardContractWebviewMessage(');
  });
});

describe('welcomePanelBootstrapSenders', () => {
  it('exports bootstrap payload send helpers adopted by welcomePanel', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelBootstrapSenders.ts'),
      'utf8'
    );
    const welcomePanelSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanel.ts'),
      'utf8'
    );

    expect(source).toContain('export async function sendWelcomePanelRecentWorkspaces');
    expect(source).toContain('export async function sendWelcomePanelWorkspaceStatus');
    expect(welcomePanelSource).toContain('sendWelcomePanelRecentWorkspaces');
    expect(welcomePanelSource).toContain('sendWelcomePanelWorkspaceStatus');
    expect(welcomePanelSource).not.toContain(
      'sendRecentWorkspacesPayload(this._bootstrapPayloadHost'
    );
  });
});

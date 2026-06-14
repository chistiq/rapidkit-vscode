import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  isStudioActionCommand,
  parseStudioActionCommand,
  getStudioActionRegistryEntry,
  STUDIO_ACTION_COMMANDS,
  STUDIO_ACTION_COMMAND_SET,
  STUDIO_ACTION_REGISTRY,
} from '../../webview-ui/src/components/StudioRedesign/state/studioActions';
import { buildStudioPosture } from '../../webview-ui/src/components/StudioRedesign/state/studioPosture';
import { buildStudioActionAuditTimeline } from '../../webview-ui/src/components/StudioRedesign/state/studioActionAudit';
import { buildStudioActionApprovalGate } from '../../webview-ui/src/components/StudioRedesign/state/studioActionApproval';
import {
  getStudioActionRegistryEntryById as getHostStudioActionRegistryEntryById,
  isStudioActionId,
  parseStudioActionCommand as parseHostStudioActionCommand,
  STUDIO_ACTION_COMMANDS as HOST_STUDIO_ACTION_COMMANDS,
  STUDIO_ACTION_REGISTRY as HOST_STUDIO_ACTION_REGISTRY,
} from '../core/studioActionCommands';

describe('StudioRedesign contracts', () => {
  const repoRoot = path.resolve(__dirname, '../..');

  it('keeps vNext studio action commands centralized and type-guarded', () => {
    expect(Object.values(STUDIO_ACTION_COMMANDS)).toEqual([
      'studio-action:run-analyze',
      'studio-action:terminal-bridge',
      'studio-action:fix-lens',
      'studio-action:impact-lens',
      'studio-action:verify-gates',
    ]);
    expect(STUDIO_ACTION_COMMAND_SET.size).toBe(5);
    expect(isStudioActionCommand(STUDIO_ACTION_COMMANDS.verifyGates)).toBe(true);
    expect(isStudioActionCommand('studio-action:unknown')).toBe(false);
    expect(parseStudioActionCommand(STUDIO_ACTION_COMMANDS.impactLens)).toBe('impact-lens');
    expect(parseStudioActionCommand('studio-action:unknown')).toBeNull();
  });

  it('keeps host and webview studio action contracts in parity', () => {
    expect(HOST_STUDIO_ACTION_COMMANDS).toEqual(STUDIO_ACTION_COMMANDS);
    expect(HOST_STUDIO_ACTION_REGISTRY).toEqual(STUDIO_ACTION_REGISTRY);
    expect(parseHostStudioActionCommand(HOST_STUDIO_ACTION_COMMANDS.fixLens)).toBe('fix-lens');
    expect(parseHostStudioActionCommand('studio-action:unknown')).toBeNull();
    expect(isStudioActionId('verify-gates')).toBe(true);
    expect(isStudioActionId('unknown')).toBe(false);
    expect(getHostStudioActionRegistryEntryById('fix-lens').actionType).toBe('fix');
    expect(getHostStudioActionRegistryEntryById('impact-lens').actionType).toBe('impact');
  });

  it('keeps Studio action metadata centralized across vNext surfaces', () => {
    const commands = Object.values(STUDIO_ACTION_COMMANDS);
    expect(new Set(STUDIO_ACTION_REGISTRY.map((entry) => entry.command))).toEqual(
      new Set(commands)
    );
    expect(STUDIO_ACTION_REGISTRY).toHaveLength(commands.length);
    for (const command of commands) {
      const entry = getStudioActionRegistryEntry(command);
      expect(entry.command).toBe(command);
      expect(entry.title).toBeTruthy();
      expect(entry.shortLabel).toBeTruthy();
      expect(entry.summary).toBeTruthy();
      expect(entry.description).toBeTruthy();
    }

    const sidebarSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/WorkspaceSidebar.tsx'),
      'utf8'
    );
    const activitySource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/ActivityBar.tsx'),
      'utf8'
    );
    const ribbonSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/CommandRibbon.tsx'),
      'utf8'
    );
    const chatSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/ChatSurface.tsx'),
      'utf8'
    );

    expect(sidebarSource).toContain('STUDIO_ACTION_REGISTRY.map');
    expect(sidebarSource).not.toContain('const ACTION_MATRIX');
    expect(activitySource).toContain('getStudioActionRegistryEntry(tool.command).title');
    expect(ribbonSource).toContain('getStudioActionRegistryEntry(command)');
    expect(chatSource).toContain('getStudioActionRegistryEntry(STUDIO_ACTION_COMMANDS.runAnalyze)');
  });

  it('keeps Studio CTAs reason-backed instead of silently inert', () => {
    const commandRibbonSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/CommandRibbon.tsx'),
      'utf8'
    );
    const contextSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/ContextPanel.tsx'),
      'utf8'
    );
    const chatSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/ChatSurface.tsx'),
      'utf8'
    );
    const sidebarSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/WorkspaceSidebar.tsx'),
      'utf8'
    );
    const shipLoopSectionSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/ShipLoopSection.tsx'),
      'utf8'
    );

    expect(commandRibbonSource).toContain('disabledReason');
    expect(commandRibbonSource).toContain('Policy gates must pass before verify can run.');
    expect(contextSource).toContain('resolveAIActionButtonBlockReason');
    expect(contextSource).toContain('Explicit approval is required before mutating the workspace.');
    expect(chatSource).toContain('Action item bridge is not available.');
    expect(chatSource).toContain('Studio is still processing the previous request.');
    expect(chatSource).toContain('title={`Run ${deck.nextActionLabel}`}');
    expect(sidebarSource).toContain('No executable action is attached to this capability yet.');
    expect(sidebarSource).toContain('disabled={rowDisabled}');
    expect(shipLoopSectionSource).toContain('This step is blocked by upstream evidence.');
  });

  it('routes the main dashboard Incident Studio path to vNext instead of the legacy studio', () => {
    const appSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/App.tsx'), 'utf8');
    const welcomeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/welcomePanel.ts'),
      'utf8'
    );

    expect(appSource).toContain(
      "import { IncidentStudioVNext } from '@/components/StudioRedesign';"
    );
    expect(appSource).not.toContain(
      "import { AIIncidentStudio } from '@/components/AIIncidentStudio';"
    );
    expect(appSource).toContain('<IncidentStudioVNext');
    expect(appSource).not.toContain('<AIIncidentStudio');
    expect(appSource).toContain('handleStudioVNextMessage');
    expect(appSource).toContain('loadAIActionRegistry');
    expect(welcomeSource).toContain("case 'runStudioAction':");
    expect(welcomeSource).toContain("case 'studioMessage':");
    expect(welcomeSource).toContain("case 'runAIActionContractCommand':");
    expect(welcomeSource).toContain('_handleDashboardStudioAction');
    expect(welcomeSource).toContain('_handleDashboardStudioMessage');
    expect(welcomeSource).toContain('_handleDashboardAIActionContractCommand');
    expect(welcomeSource).toContain('_postDashboardStudioActionStatus');
    expect(welcomeSource).toContain('_buildDashboardStudioActionResult');
    expect(welcomeSource).toContain('buildStudioAIActionResult');
    expect(welcomeSource).toContain('_postDashboardAIActionRegistry');
    expect(welcomeSource).toContain('_runningDashboardAIActionOperation');
    expect(welcomeSource).toContain('Another AI action operation is already running');
    expect(welcomeSource).toContain('A Studio action is already running');
    expect(welcomeSource).toContain('executeGovernedAIActionOperation');
    expect(welcomeSource).toContain('publishStudioAIActionContractFromText');
    expect(welcomeSource).toContain("'completed'");
    expect(welcomeSource).toContain('setRunning: (nextOperation) =>');
    expect(welcomeSource).toContain('_syncDashboardLatestAIAction');
  });

  it('keeps vNext host action bridge validated and refresh-backed', () => {
    const panelSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioPanel.ts'),
      'utf8'
    );
    const aiActionBridgeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioAIActionBridge.ts'),
      'utf8'
    );
    const actionBridgeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioActionBridge.ts'),
      'utf8'
    );
    const welcomeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/welcomePanel.ts'),
      'utf8'
    );
    const studioStateSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/state/studioState.ts'),
      'utf8'
    );
    const commandRibbonSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/CommandRibbon.tsx'),
      'utf8'
    );
    const actionAuditSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/state/studioActionAudit.ts'),
      'utf8'
    );
    const appSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/App.tsx'), 'utf8');
    const standaloneSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/incidentStudioNext.tsx'),
      'utf8'
    );

    expect(panelSource).toContain('incident-studio-next.css');
    expect(panelSource).toContain('rel="stylesheet"');
    expect(panelSource).toContain('isStudioActionId(actionId)');
    expect(panelSource).toContain('getStudioActionRegistryEntryById(studioActionId)');
    expect(panelSource).toContain('actionDefinition.actionType');
    expect(panelSource).toContain('actionTitle: actionDefinition?.title');
    expect(panelSource).toContain('actionSummary: actionDefinition?.summary');
    expect(panelSource).not.toContain("actionId === 'fix-lens'");
    expect(panelSource).not.toContain("actionId === 'impact-lens'");
    expect(welcomeSource).toContain('getStudioActionRegistryEntryById(studioActionId)');
    expect(welcomeSource).toContain('actionDefinition.actionType');
    expect(welcomeSource).toContain('actionTitle: actionDefinition?.title');
    expect(welcomeSource).toContain('actionSummary: actionDefinition?.summary');
    expect(welcomeSource).not.toContain("actionId === 'fix-lens'");
    expect(welcomeSource).not.toContain("actionId === 'impact-lens'");
    expect(panelSource).toContain('Unknown Studio action blocked');
    expect(panelSource).toContain('_runningStudioActionId');
    expect(panelSource).toContain('Another Studio action is already running');
    expect(panelSource).toContain("_postStudioActionStatus(actionId, 'started')");
    expect(panelSource).toContain('_postStudioActionStatus(');
    expect(panelSource).toContain("'completed'");
    expect(panelSource).toContain('_postStudioActionStatus(');
    expect(panelSource).toContain('_buildStudioActionResult');
    expect(panelSource).toContain('result?: Record<string, unknown>');
    expect(panelSource).toContain('getAnalyzeReportPath(this._workspaceContext.workspacePath)');
    expect(panelSource).toContain('executeGovernedAIActionOperation');
    expect(panelSource).toContain('_runningAIActionOperation');
    expect(aiActionBridgeSource).toContain('`ai-action-${operation}`');
    expect(actionBridgeSource).toContain('import type { StudioActionId }');
    expect(actionBridgeSource).toContain('actionId: StudioActionId');
    expect(studioStateSource).toContain('actionTitle?: string;');
    expect(studioStateSource).toContain('export interface StudioProofEvent');
    expect(studioStateSource).toContain("schemaVersion: 'workspai.studio.proof-event.v1'");
    expect(commandRibbonSource).toContain('studioActionStatus.actionTitle');
    expect(commandRibbonSource).toContain('const proofEvent = actionResult?.proofEvent;');
    expect(actionAuditSource).toContain('const proofEvent = result?.proofEvent;');
    expect(appSource).toContain('actionTitle:');
    expect(appSource).toContain('message.data?.actionTitle');
    expect(appSource).toContain('actionSummary:');
    expect(standaloneSource).toContain('actionTitle:');
    expect(standaloneSource).toContain('message.data?.actionTitle');
    expect(standaloneSource).toContain('actionSummary:');
    expect(panelSource).toContain('studio-action-bridge');
    expect(panelSource).toContain("command: 'studioActionStatus'");
    expect(panelSource).toContain('executeStudioActionById');
    expect(panelSource).toContain("case 'requestIncidentStudioTelemetry':");
    expect(panelSource).toContain("case 'getUiPreferences':");
    expect(panelSource).toContain("case 'setUiPreference':");
    expect(panelSource).toContain("case 'exportIncidentReproPack':");
    expect(panelSource).toContain("case 'importIncidentReproPack':");
    expect(panelSource).toContain("case 'runIncidentInlineCommand':");
    expect(panelSource).not.toContain("case 'verify-gates':\n          await runWorkspaceAnalyze");
    for (const actionId of [
      'run-analyze',
      'verify-gates',
      'terminal-bridge',
      'fix-lens',
      'impact-lens',
    ]) {
      expect(panelSource).toContain(`await this._refreshStudioState(actionId);`);
    }
  });

  it('keeps shared Incident Studio host bridge contracts centralized', () => {
    const bridgeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioMessageBridge.ts'),
      'utf8'
    );
    const chatBrainBridgeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioChatBrainBridge.ts'),
      'utf8'
    );
    const telemetryBridgeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioTelemetryBridge.ts'),
      'utf8'
    );
    const actionBridgeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioActionBridge.ts'),
      'utf8'
    );
    const welcomeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/welcomePanel.ts'),
      'utf8'
    );
    const panelSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioPanel.ts'),
      'utf8'
    );
    const appSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/App.tsx'), 'utf8');
    const standaloneSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/incidentStudioNext.tsx'),
      'utf8'
    );
    const sessionPersistenceSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/lib/incidentStudioSessionPersistence.ts'),
      'utf8'
    );
    const sessionBridgeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioSessionPersistenceBridge.ts'),
      'utf8'
    );
    const vnextSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/IncidentStudioVNext.tsx'),
      'utf8'
    );
    const sidebarSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/WorkspaceSidebar.tsx'),
      'utf8'
    );
    const actionAuditSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/state/studioActionAudit.ts'),
      'utf8'
    );
    const sessionSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/lib/incidentStudioChatBrainSession.ts'),
      'utf8'
    );

    expect(bridgeSource).toContain("'requestIncidentStudioTelemetry'");
    expect(bridgeSource).toContain("'runIncidentInlineCommand'");
    expect(bridgeSource).toContain("'aiChatStart'");
    expect(bridgeSource).toContain("'aiChatQuery'");
    expect(chatBrainBridgeSource).toContain('dispatchIncidentStudioChatBrainMessage');
    expect(chatBrainBridgeSource).toContain('ensureIncidentStudioChatBrainHost');
    expect(telemetryBridgeSource).toContain('resolveIncidentStudioTelemetry');
    expect(telemetryBridgeSource).toContain('postIncidentStudioTelemetry');
    expect(actionBridgeSource).toContain('executeVerifyGatesAction');
    expect(actionBridgeSource).toContain('executeStudioActionById');
    expect(actionBridgeSource).toContain('releaseGateCommand');
    expect(welcomeSource).toContain('executeStudioActionById');
    expect(welcomeSource).toContain('postIncidentStudioTelemetry');
    expect(welcomeSource).toContain('dispatchExternalChatBrainMessage');
    expect(welcomeSource).toContain('_postChatBrainWebviewMessage');
    expect(welcomeSource).not.toContain(
      "case 'verify-gates':\n          await runWorkspaceAnalyze"
    );
    expect(panelSource).toContain('dispatchIncidentStudioChatBrainMessage');
    expect(panelSource).toContain('isIncidentStudioChatBrainCommand');
    expect(appSource).toContain('submitIncidentStudioChatBrainQuery');
    expect(appSource).not.toContain(
      "vscode.postMessage('studioMessage', { workspacePath, workspaceName, message })"
    );
    expect(standaloneSource).toContain('useIncidentStudioChatBrain');
    expect(standaloneSource).toContain('chatBrain.submitQuery');
    expect(standaloneSource).not.toContain(
      "vscode.postMessage('studioMessage', { workspacePath, message"
    );
    expect(vnextSource).toContain('chatBrainStreamingEnabled');
    expect(vnextSource).toContain('streamAssistantText');
    expect(sessionSource).toContain('buildIncidentChatQueryPayload');
    expect(sessionSource).toContain('aiChatChunk');
  });

  it('keeps governed AI action contract flows centralized and hardened', () => {
    const bridgeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioAIActionBridge.ts'),
      'utf8'
    );
    const executorSource = fs.readFileSync(
      path.join(repoRoot, 'src/core/aiActionExecutor.ts'),
      'utf8'
    );
    const panelSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioPanel.ts'),
      'utf8'
    );
    const welcomeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/welcomePanel.ts'),
      'utf8'
    );
    const appSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/App.tsx'), 'utf8');
    const standaloneSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/incidentStudioNext.tsx'),
      'utf8'
    );
    const gateSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/lib/incidentStudioAIActionGate.ts'),
      'utf8'
    );

    expect(bridgeSource).toContain('executeGovernedAIActionOperation');
    expect(bridgeSource).toContain('publishStudioAIActionContractFromText');
    expect(bridgeSource).toContain('Contract validation blocked apply');
    expect(bridgeSource).toContain('function buildStudioProofOnlyActionResult');
    expect(bridgeSource).toContain("schemaVersion: 'workspai.studio.proof-event.v1'");
    expect(bridgeSource).toContain("source: 'ai-action'");
    expect(bridgeSource).toContain("result.ok ? 'completed' : 'failed'");
    expect(bridgeSource).toContain('gatePassed: result.ok');
    expect(executorSource).toContain('toPinnedRapidkitExecutionCommand');
    expect(executorSource).toContain('validateAIActionCommandPolicy(executionCommand');
    expect(executorSource).toContain('parseSafeCommand(executionCommand');
    expect(executorSource).toContain('command: displayCommand');
    expect(panelSource).toContain('executeGovernedAIActionOperation');
    expect(panelSource).toContain('publishStudioAIActionContractFromText');
    expect(panelSource).toContain('_runningAIActionOperation');
    expect(welcomeSource).toContain('publishStudioAIActionContractFromText');
    expect(welcomeSource).toContain("provider: 'chat-brain'");
    expect(appSource).toContain('resolveStudioAIActionOperationBlockReason');
    expect(standaloneSource).toContain('resolveStudioAIActionOperationBlockReason');
    expect(gateSource).toContain('canDispatchStudioAIActionOperation');
  });

  it('keeps rapidkit-npm CLI surface centralized with host and webview parity', () => {
    const inlineBridgeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioInlineCommandBridge.ts'),
      'utf8'
    );
    const panelSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioPanel.ts'),
      'utf8'
    );
    const welcomeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/welcomePanel.ts'),
      'utf8'
    );
    const matrixSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/lib/incidentCliActionMatrix.ts'),
      'utf8'
    );
    const gateSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/lib/incidentStudioCliSurfaceGate.ts'),
      'utf8'
    );
    const sessionSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/lib/incidentStudioCliSurfaceSession.ts'),
      'utf8'
    );
    const appSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/App.tsx'), 'utf8');
    const standaloneSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/incidentStudioNext.tsx'),
      'utf8'
    );
    const sidebarSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/WorkspaceSidebar.tsx'),
      'utf8'
    );
    const cliSectionSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/CliSurfaceSection.tsx'),
      'utf8'
    );

    expect(inlineBridgeSource).toContain('dispatchIncidentStudioInlineCommand');
    expect(inlineBridgeSource).toContain('resolveStudioMutationBlockReason');
    expect(panelSource).toContain('dispatchIncidentStudioInlineCommand');
    expect(welcomeSource).toContain('dispatchIncidentStudioInlineCommand');
    expect(matrixSource).toContain('buildIncidentCliActionMatrix');
    expect(gateSource).toContain('resolveIncidentCliSurfaceBlockReason');
    expect(sessionSource).toContain('useIncidentStudioCliSurface');
    expect(appSource).toContain('useIncidentStudioCliSurface');
    expect(appSource).toContain('onRunCliSurfaceAction');
    expect(standaloneSource).toContain('useIncidentStudioCliSurface');
    expect(sidebarSource).toContain('CliSurfaceSection');
    expect(sidebarSource).toContain('disabled={runDisabled}');
    expect(sidebarSource).toContain('disabled={rowDisabled}');
    expect(sidebarSource).toContain('No executable action is attached to this capability yet.');
    expect(sidebarSource).toContain('Studio action bridge is not available.');
    expect(cliSectionSource).toContain('buildIncidentCliActionMatrix');
  });

  it('keeps enterprise stabilization loop centralized with post-action telemetry refresh', () => {
    const loopBridgeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioStabilizationLoopBridge.ts'),
      'utf8'
    );
    const panelSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioPanel.ts'),
      'utf8'
    );
    const welcomeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/welcomePanel.ts'),
      'utf8'
    );
    const aiActionBridgeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioAIActionBridge.ts'),
      'utf8'
    );
    const inlineBridgeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioInlineCommandBridge.ts'),
      'utf8'
    );
    const loopMapperSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/lib/incidentStudioStabilizationLoop.ts'),
      'utf8'
    );
    const vnextSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/IncidentStudioVNext.tsx'),
      'utf8'
    );
    const contextSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/ContextPanel.tsx'),
      'utf8'
    );

    expect(loopBridgeSource).toContain('refreshIncidentStudioStabilizationLoop');
    expect(loopBridgeSource).toContain('forceRefresh: true');
    expect(loopBridgeSource).toContain('shouldRefreshStabilizationLoopAfterStudioAction');
    expect(panelSource).toContain('refreshIncidentStudioShipLoopSurfaces');
    expect(welcomeSource).toContain('refreshIncidentStudioShipLoopSurfaces');
    expect(aiActionBridgeSource).toContain('refreshStabilizationLoop');
    expect(inlineBridgeSource).toContain('refreshStabilizationLoop');
    expect(loopMapperSource).toContain('deriveEnterpriseStabilizationLoopView');
    expect(vnextSource).toContain('deriveEnterpriseStabilizationLoopView');
    expect(contextSource).toContain('enterpriseStabilizationLoop');
    expect(contextSource).toContain('Expansion frozen');
  });

  it('keeps enterprise ship loop centralized with evidence refresh and post-patch reverify', () => {
    const shipLoopBridgeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioShipLoopBridge.ts'),
      'utf8'
    );
    const shipEvidenceBridgeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioShipEvidenceBridge.ts'),
      'utf8'
    );
    const patchReverifyBridgeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioPatchReverifyBridge.ts'),
      'utf8'
    );
    const mutationGateHostSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioMutationGate.ts'),
      'utf8'
    );
    const messageBridgeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioMessageBridge.ts'),
      'utf8'
    );
    const panelSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioPanel.ts'),
      'utf8'
    );
    const welcomeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/welcomePanel.ts'),
      'utf8'
    );
    const loopMapperSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/lib/incidentStudioShipLoop.ts'),
      'utf8'
    );
    const loopGateSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/lib/incidentStudioShipLoopGate.ts'),
      'utf8'
    );
    const loopSessionSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/lib/incidentStudioShipLoopSession.ts'),
      'utf8'
    );
    const mutationGateWebviewSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/lib/incidentStudioMutationGate.ts'),
      'utf8'
    );
    const appSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/App.tsx'), 'utf8');
    const standaloneSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/incidentStudioNext.tsx'),
      'utf8'
    );
    const vnextSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/IncidentStudioVNext.tsx'),
      'utf8'
    );
    const contextSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/ContextPanel.tsx'),
      'utf8'
    );
    const shipLoopSectionSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/ShipLoopSection.tsx'),
      'utf8'
    );
    const sessionPersistenceSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/lib/incidentStudioSessionPersistence.ts'),
      'utf8'
    );
    const sessionBridgeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioSessionPersistenceBridge.ts'),
      'utf8'
    );
    const sidebarSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/WorkspaceSidebar.tsx'),
      'utf8'
    );
    const actionAuditSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/state/studioActionAudit.ts'),
      'utf8'
    );

    expect(shipLoopBridgeSource).toContain('dispatchIncidentStudioShipLoopStep');
    expect(shipLoopBridgeSource).toContain('refreshIncidentStudioShipLoopSurfaces');
    expect(shipLoopBridgeSource).toContain('resolveStudioMutationBlockReason');
    expect(shipLoopBridgeSource).toContain('import type { StudioActionId }');
    expect(shipLoopBridgeSource).toContain('studioActionId?: StudioActionId;');
    expect(shipLoopBridgeSource).toContain('function buildShipLoopProofEvent');
    expect(shipLoopBridgeSource).toContain("source: 'ship-loop'");
    expect(loopSessionSource).toContain('proofEvent?:');
    expect(loopSessionSource).toContain("schemaVersion: 'workspai.studio.proof-event.v1'");
    expect(shipEvidenceBridgeSource).toContain('buildDashboardEvidenceBundle');
    expect(shipEvidenceBridgeSource).toContain('incidentStudioShipEvidence');
    expect(patchReverifyBridgeSource).toContain('runPostPatchShipLoopRefresh');
    expect(patchReverifyBridgeSource).toContain('shipLoopPatchReverifyHint');
    expect(mutationGateHostSource).toContain('resolveStudioMutationBlockReason');
    expect(messageBridgeSource).toContain('requestIncidentStudioShipEvidence');
    expect(messageBridgeSource).toContain('runShipLoopStep');
    expect(messageBridgeSource).toContain('exportSandboxSimulationEvidence');
    expect(messageBridgeSource).toContain('exportReleaseReadinessCommander');
    expect(messageBridgeSource).toContain('loadIncidentStudioSession');
    expect(messageBridgeSource).toContain('saveIncidentStudioSession');
    expect(panelSource).toContain("case 'requestIncidentStudioShipEvidence':");
    expect(panelSource).toContain("case 'runShipLoopStep':");
    expect(panelSource).toContain("case 'exportSandboxSimulationEvidence':");
    expect(panelSource).toContain("case 'loadIncidentStudioSession':");
    expect(panelSource).toContain("case 'saveIncidentStudioSession':");
    expect(panelSource).toContain('payload.messages');
    expect(panelSource).toContain('payload.approvalAuditEvents');
    expect(panelSource).toContain('payload.proofEvents');
    expect(panelSource).toContain('payload.executionTranscripts');
    expect(panelSource).toContain('replaceProofEvents');
    expect(panelSource).toContain('replaceExecutionTranscripts');
    expect(sessionPersistenceSource).toContain('chatMessages: messages');
    expect(sessionPersistenceSource).toContain('record.chatMessages');
    expect(sessionPersistenceSource).toContain('proofEvents');
    expect(sessionPersistenceSource).toContain('record.proofEvents');
    expect(sessionPersistenceSource).toContain('executionTranscripts');
    expect(sessionPersistenceSource).toContain('record.executionTranscripts');
    expect(sessionBridgeSource).toContain('MAX_INCIDENT_STUDIO_PROOF_EVENTS');
    expect(sessionBridgeSource).toContain('MAX_INCIDENT_STUDIO_EXECUTION_TRANSCRIPTS');
    expect(sessionBridgeSource).toContain('normalizeProofEvent');
    expect(sessionBridgeSource).toContain('normalizeExecutionTranscript');
    expect(sessionBridgeSource).toContain('replaceProofEvents');
    expect(sessionBridgeSource).toContain('replaceExecutionTranscripts');
    expect(sessionBridgeSource).toContain("schemaVersion: 'workspai.studio.proof-event.v1'");
    expect(sessionBridgeSource).toContain(
      "schemaVersion: 'workspai.studio.execution-transcript.v1'"
    );
    expect(vnextSource).toContain('const [proofEvents, setProofEvents]');
    expect(vnextSource).toContain('const [executionTranscripts, setExecutionTranscripts]');
    expect(vnextSource).toContain('sessionPersistence.loadedSession.proofEvents');
    expect(vnextSource).toContain('sessionPersistence.loadedSession.executionTranscripts');
    expect(vnextSource).toContain('result?.proofEvent');
    expect(vnextSource).toContain('result?.executionTranscript');
    expect(vnextSource).toContain('proofEvents={proofEvents}');
    expect(vnextSource).toContain('executionTranscripts={executionTranscripts}');
    expect(standaloneSource).toContain('onStepResult: (result)');
    expect(standaloneSource).toContain('executionTranscript: result.executionTranscript');
    expect(sidebarSource).toContain('proofEvents?: StudioProofEvent[]');
    expect(sidebarSource).toContain('executionTranscripts?: StudioExecutionTranscript[]');
    expect(sidebarSource).toContain('proofEvents,');
    expect(sidebarSource).toContain('selectedTranscript');
    expect(actionAuditSource).toContain('proofEvents?: StudioProofEvent[]');
    expect(actionAuditSource).toContain('for (const proof of proofEvents)');
    expect(actionAuditSource).toContain('transcriptId: proof.executionTranscriptId');
    expect(welcomeSource).toContain("case 'requestIncidentStudioShipEvidence':");
    expect(welcomeSource).toContain("case 'runShipLoopStep':");
    expect(welcomeSource).toContain("case 'loadIncidentStudioSession':");
    expect(welcomeSource).toContain("case 'saveIncidentStudioSession':");
    expect(welcomeSource).toContain('_handleSaveDashboardIncidentStudioSession');
    expect(welcomeSource).toContain('replaceProofEvents');
    expect(welcomeSource).toContain('replaceExecutionTranscripts');
    expect(loopMapperSource).toContain('deriveEnterpriseShipLoopView');
    expect(loopGateSource).toContain('resolveStudioMutationBlockReason');
    expect(loopSessionSource).toContain('useIncidentStudioShipLoop');
    expect(mutationGateWebviewSource).toContain('resolveStabilizationLoopBlockReason');
    expect(appSource).toContain('useIncidentStudioShipLoop');
    expect(appSource).toContain('requestShipEvidence');
    expect(standaloneSource).toContain('useIncidentStudioShipLoop');
    expect(standaloneSource).toContain('onApplyMultiFilePatch');
    expect(standaloneSource).toContain('isIncidentStudioSessionHostCommand');
    expect(standaloneSource).toContain('sessionPostMessage');
    expect(standaloneSource).toContain('INCIDENT_STUDIO_PROJECT_PATH');
    expect(vnextSource).toContain('deriveEnterpriseShipLoopView');
    expect(contextSource).toContain('ShipLoopSection');
    expect(contextSource).toContain('Release readiness validation');
    expect(contextSource).toContain('phaseShipGuidance');
    expect(contextSource).toContain('resolveStudioAIActionOperationBlockReason');
    expect(contextSource).toContain('resolveAIActionButtonBlockReason');
    expect(contextSource).toContain('disabledReason={applyBlockReason}');
    expect(contextSource).toContain('Explicit approval is required before mutating the workspace.');
    expect(shipLoopSectionSource).toContain('disabledReason');
    expect(shipLoopSectionSource).toContain('This step is blocked by upstream evidence.');
    expect(shipLoopSectionSource).toContain('Another ship loop step is running.');
  });

  it('enforces telemetry-backed policy gates in host and webview surfaces', () => {
    const mapperSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioPolicyGateMapper.ts'),
      'utf8'
    );
    const actionBridgeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioActionBridge.ts'),
      'utf8'
    );
    const aiActionBridgeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioAIActionBridge.ts'),
      'utf8'
    );
    const webviewMapperSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/lib/incidentStudioPolicyGateMapper.ts'),
      'utf8'
    );
    const vnextSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/IncidentStudioVNext.tsx'),
      'utf8'
    );
    const ribbonSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/CommandRibbon.tsx'),
      'utf8'
    );

    expect(mapperSource).toContain('evaluatePolicyGateEnforcementFromTelemetry');
    expect(mapperSource).toContain('canApplyStudioMutationFromTelemetry');
    expect(actionBridgeSource).toContain('evaluatePolicyGateEnforcementFromTelemetry');
    expect(aiActionBridgeSource).toContain('resolveStudioMutationBlockReason');
    expect(webviewMapperSource).toContain('mergePolicyGatesFromTelemetry');
    expect(webviewMapperSource).toContain('incidentStudioTelemetryPolicyCore');
    expect(vnextSource).toContain('incomingTelemetry');
    expect(vnextSource).toContain('mergePolicyGatesFromTelemetry');
    expect(ribbonSource).toContain('isVerifyActionBlockedByPolicyGates');
  });

  it('keeps vNext structured action status wired from host to ribbon', () => {
    const appSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/incidentStudioNext.tsx'),
      'utf8'
    );
    const wrapperSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/IncidentStudioVNext.tsx'),
      'utf8'
    );
    const ribbonSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/CommandRibbon.tsx'),
      'utf8'
    );
    const sidebarSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/WorkspaceSidebar.tsx'),
      'utf8'
    );

    expect(appSource).toContain("case 'studioActionStatus':");
    expect(appSource).toContain('setIncomingActionStatus');
    expect(wrapperSource).toContain('incomingActionStatus?: StudioActionStatus | null;');
    expect(wrapperSource).toContain('studioActionStatus: incomingActionStatus');
    expect(wrapperSource).toContain('studioActionStatus={state.studioActionStatus}');
    expect(wrapperSource).toContain('approvalAuditEvents={approvalAuditEvents}');
    expect(wrapperSource).toContain('onApprovalAuditEvent={handleApprovalAuditEvent}');
    expect(wrapperSource).toContain('onRevealEvidence={onRevealEvidence}');
    expect(ribbonSource).toContain('studioActionStatus?: StudioActionStatus | null;');
    expect(ribbonSource).toContain('studioActionStatus.actionId');
    expect(ribbonSource).toContain(
      "const actionRunning = studioActionStatus?.status === 'started';"
    );
    expect(ribbonSource).toContain('disabled={actionRunning}');
    expect(sidebarSource).toContain('studioActionStatus?: StudioActionStatus | null;');
    expect(sidebarSource).toContain(
      "const actionRunning = studioActionStatus?.status === 'started';"
    );
    expect(sidebarSource).toContain('disabled={runDisabled}');
    expect(sidebarSource).toContain('buildStudioActionAuditTimeline');
    expect(sidebarSource).toContain('Action Audit');
    expect(sidebarSource).toContain("onRevealEvidence(event.evidencePath || '')");
    expect(sidebarSource).toContain('selectedAuditEventId');
    expect(sidebarSource).toContain('ActionAuditInspector');
    expect(sidebarSource).toContain('studio-inspector--compact');
    expect(sidebarSource).toContain('studio-inspector__link-btn');
    expect(sidebarSource).toContain('Open');
    expect(sidebarSource).toContain('studio-inspector__failures');
    expect(sidebarSource).toContain('approvalAuditEvents?: StudioApprovalAuditEvent[];');
  });

  it('binds Studio action results into status, Mission Control proof, and audit evidence', () => {
    const stateSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/state/studioState.ts'),
      'utf8'
    );
    const auditSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/state/studioActionAudit.ts'),
      'utf8'
    );
    const ribbonSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/CommandRibbon.tsx'),
      'utf8'
    );
    const appSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/App.tsx'), 'utf8');
    const standaloneSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/incidentStudioNext.tsx'),
      'utf8'
    );

    expect(stateSource).toContain('export interface StudioActionResult');
    expect(stateSource).toContain('result?: StudioActionResult;');
    expect(appSource).toContain('message.data?.result');
    expect(standaloneSource).toContain('message.data?.result');
    expect(auditSource).toContain('const result = status.result;');
    expect(auditSource).toContain('const proofEvent = result?.proofEvent;');
    expect(auditSource).toContain('evidencePath: proofEvent?.evidencePath || result?.evidencePath');
    expect(auditSource).toContain(
      'evidenceSha256: proofEvent?.evidenceSha256 || result?.evidenceSha256'
    );
    expect(auditSource).toContain('commandCount: result?.commandCount');
    expect(auditSource).toContain(
      'canRevealEvidence: Boolean(proofEvent?.evidencePath || result?.evidencePath)'
    );
    expect(ribbonSource).toContain('const actionResult = studioActionStatus?.result;');
    expect(ribbonSource).toContain('actionResult?.evidenceSha256');
    expect(ribbonSource).toContain('score ${actionResult.score}');
  });

  it('keeps vNext visible controls backed by real host actions or clipboard/action-item handlers', () => {
    const wrapperSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/IncidentStudioVNext.tsx'),
      'utf8'
    );
    const activitySource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/ActivityBar.tsx'),
      'utf8'
    );
    const chatSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/ChatSurface.tsx'),
      'utf8'
    );
    const appSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/App.tsx'), 'utf8');
    const standaloneSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/incidentStudioNext.tsx'),
      'utf8'
    );

    expect(activitySource).toContain('command: StudioActionCommand;');
    expect(activitySource).toContain('onExecuteAction?: (command: StudioActionCommand) => void;');
    expect(activitySource).toContain('onExecute?.(tool.command);');
    expect(activitySource).not.toContain("id: 'settings'");
    expect(activitySource).not.toContain("id: 'help'");
    for (const commandName of [
      'terminalBridge',
      'runAnalyze',
      'impactLens',
      'fixLens',
      'verifyGates',
    ]) {
      expect(activitySource).toContain(`STUDIO_ACTION_COMMANDS.${commandName}`);
    }

    expect(wrapperSource).toContain('onCopyText?: (text: string) => void;');
    expect(wrapperSource).toContain('onExecuteAction={handleSendMessage}');
    expect(wrapperSource).toContain('onCopyText={handleCopyText}');
    expect(chatSource).toContain('onCopyText?: (text: string) => void;');
    expect(chatSource).toContain('onCopyText?.(message.content)');
    expect(chatSource).toContain('onAddActionItem?.(actionText)');
    expect(chatSource).toContain(
      "onAddActionItem?.('Draft postmortem from current Studio audit trail, evidence, and approval events.')"
    );
    expect(chatSource).toContain('onExecute(STUDIO_ACTION_COMMANDS.verifyGates)');
    expect(chatSource).not.toContain('export-postmortem');
    expect(chatSource).not.toContain('archive-evidence');
    expect(appSource).toContain("onCopyText={(text) => vscode.postMessage('copyText', { text })}");
    expect(standaloneSource).toContain('onCopyText={handleCopyCommand}');
  });

  it('keeps vNext side rails data-backed instead of decorative', () => {
    const wrapperSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/IncidentStudioVNext.tsx'),
      'utf8'
    );
    const sidebarSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/WorkspaceSidebar.tsx'),
      'utf8'
    );
    const contextSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/ContextPanel.tsx'),
      'utf8'
    );

    expect(wrapperSource).toContain("id: 'evidence-proof'");
    expect(wrapperSource).toContain(
      "import { STUDIO_ACTION_COMMANDS } from './state/studioActions';"
    );
    expect(wrapperSource).not.toContain('Evidence Export');
    expect(sidebarSource).toContain('command?: StudioActionCommand;');
    expect(sidebarSource).toContain('description?: string;');
    expect(sidebarSource).toContain('onExecuteAction?.(item.command);');
    expect(sidebarSource).toContain('disabled={!onToggle}');

    expect(wrapperSource).toContain('command: STUDIO_ACTION_COMMANDS.runAnalyze');
    expect(wrapperSource).toContain('command: STUDIO_ACTION_COMMANDS.impactLens');
    expect(wrapperSource).toContain('command: STUDIO_ACTION_COMMANDS.verifyGates');
    expect(wrapperSource).not.toContain("command: 'studio-action:");

    expect(contextSource).toContain('const latestActionEntry = aiActionRegistry?.entries[0];');
    expect(contextSource).toContain(
      'const latestActionExecution = latestActionEntry?.executions[0];'
    );
    expect(contextSource).toContain('evidenceCoverageLabel');
    expect(contextSource).toContain('confidenceLabel');
    expect(contextSource).toContain('drillDownLabel');
    expect(contextSource).toContain('proofReadinessLabel');
    expect(contextSource).not.toContain('High fidelity');
    expect(contextSource).not.toContain('Export readiness');
    expect(contextSource).not.toContain('Drill-down" value="Enabled');
  });

  it('builds an evidence-bound Studio action audit timeline from live status and registry executions', () => {
    const timeline = buildStudioActionAuditTimeline({
      nowMs: new Date('2026-06-11T20:15:00.000Z').getTime(),
      status: {
        actionId: 'verify-gates',
        status: 'started',
        updatedAt: '2026-06-11T20:14:30.000Z',
        result: {
          summary: 'Verify gates running',
          proofEvent: {
            schemaVersion: 'workspai.studio.proof-event.v1',
            actionId: 'verify-gates',
            status: 'started',
            summary: 'Verify gates running',
            generatedAt: '2026-06-11T20:14:30.000Z',
            source: 'studio-action',
            executionTranscriptId: 'transcript-verify-1',
            durationMs: 1200,
          },
          executionTranscript: {
            schemaVersion: 'workspai.studio.execution-transcript.v1',
            id: 'transcript-verify-1',
            actionId: 'verify-gates',
            source: 'studio-action',
            title: 'Verify gates',
            status: 'completed',
            startedAt: '2026-06-11T20:14:28.800Z',
            completedAt: '2026-06-11T20:14:30.000Z',
            durationMs: 1200,
            commandCount: 1,
            failedCommandCount: 0,
            steps: [
              {
                id: 'transcript-verify-1-step-1',
                command: 'npx rapidkit doctor workspace',
                status: 'passed',
                exitCode: 0,
              },
            ],
          },
        },
      },
      registry: {
        updatedAt: '2026-06-11T20:12:00.000Z',
        entries: [
          {
            id: 'action-verify-1',
            createdAt: '2026-06-11T20:10:00.000Z',
            provider: 'studio-action-bridge',
            summary: 'Verify release gates',
            actionType: 'verify',
            riskLevel: 'low',
            validationStatus: 'valid',
            lifecycleStatus: 'verified',
            executions: [
              {
                operation: 'verify',
                ok: true,
                summary: 'Gate report verified',
                evidencePath: '/workspace/.workspai/evidence/verify.json',
                evidenceSha256: 'abcdef1234567890',
                evidenceSizeBytes: 2048,
                commandCount: 2,
                failedCommandCount: 0,
                completedAt: '2026-06-11T20:12:00.000Z',
              },
            ],
          },
        ],
      },
    });

    expect(timeline[0]).toMatchObject({
      actionId: 'verify-gates',
      outcome: 'running',
      phase: 'plan',
      transcriptId: 'transcript-verify-1',
      durationMs: 1200,
      canRevealEvidence: false,
    });
    expect(timeline[1]).toMatchObject({
      actionId: 'action-verify-1',
      outcome: 'verified',
      phase: 'verify',
      evidencePath: '/workspace/.workspai/evidence/verify.json',
      evidenceSha256: 'abcdef1234567890',
      evidenceSizeBytes: 2048,
      commandCount: 2,
      canRevealEvidence: true,
    });
  });

  it('builds Studio action audit timeline entries for approval decisions and operation requests', () => {
    const timeline = buildStudioActionAuditTimeline({
      nowMs: new Date('2026-06-11T20:20:00.000Z').getTime(),
      approvalEvents: [
        {
          id: 'approval-1',
          actionId: 'fix-1',
          operation: 'approval-confirmed',
          title: 'Approval confirmed',
          summary: 'Fix auth gate',
          riskLevel: 'high',
          detail: 'User reviewed action contract.',
          happenedAt: '2026-06-11T20:19:00.000Z',
        },
        {
          id: 'approval-2',
          actionId: 'fix-1',
          operation: 'apply-requested',
          title: 'apply requested',
          summary: 'Fix auth gate',
          riskLevel: 'high',
          happenedAt: '2026-06-11T20:19:30.000Z',
        },
      ],
    });

    expect(timeline[0]).toMatchObject({
      actionId: 'fix-1',
      outcome: 'requested',
      phase: 'plan',
      scope: 'approval · high risk',
      commandCount: 1,
    });
    expect(timeline[1]).toMatchObject({
      actionId: 'fix-1',
      outcome: 'approved',
      phase: 'plan',
      detail: 'User reviewed action contract.',
    });
  });

  it('keeps vNext AI action approval gated by risk, rollback, verification, and explicit confirmation', () => {
    const contextSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/ContextPanel.tsx'),
      'utf8'
    );

    expect(contextSource).toContain('buildStudioActionApprovalGate');
    expect(contextSource).toContain('Risk & Approval Gate');
    expect(contextSource).toContain('actionApprovalConfirmed');
    expect(contextSource).toContain('setActionApprovalConfirmed(false)');
    expect(contextSource).toContain('onApprovalAuditEvent?:');
    expect(contextSource).toContain('postApprovalAuditEvent');
    expect(contextSource).toContain('approval-confirmed');
    expect(contextSource).toContain('approval-revoked');
    expect(contextSource).toContain('`${operation}-requested`');
    expect(contextSource).toContain('resolveAIActionButtonBlockReason');
    expect(contextSource).toContain(
      'resolveStudioAIActionOperationBlockReason(operation, aiActionContract)'
    );
    expect(contextSource).toContain(
      "(operation === 'apply' || operation === 'rollback') && !actionApprovalConfirmed"
    );
    expect(contextSource).toContain(
      'I reviewed risk, affected files, commands, verification, and rollback posture.'
    );

    const gate = buildStudioActionApprovalGate({
      actionId: 'fix-1',
      provider: 'test-provider',
      receivedAt: '2026-06-11T20:15:00.000Z',
      contract: {
        schemaVersion: 'workspai.ai-action.v1',
        actionType: 'fix',
        summary: 'Fix auth gate',
        riskLevel: 'high',
        affectedFiles: ['src/auth.ts'],
        proposedCommands: ['npm test'],
        proposedPatches: [{ relativePath: 'src/auth.ts', summary: 'Tighten auth gate' }],
        verificationCommands: ['npm run test:auth'],
        rollbackPlan: ['git checkout -- src/auth.ts'],
        confidence: 0.82,
        requiresApproval: true,
      },
      validation: {
        status: 'valid',
        issues: [],
        canApply: true,
        canVerify: true,
        canRollback: true,
      },
    });

    expect(gate).toMatchObject({
      label: 'Needs review',
      tone: 'warning',
      riskLabel: 'high risk · 82% confidence',
      hardBlocked: false,
      mutationSensitive: true,
      canApplyAfterApproval: true,
      canVerify: true,
      canRollbackAfterApproval: true,
    });
  });

  it('blocks AI action approval when rollback or verification proof is missing', () => {
    const gate = buildStudioActionApprovalGate({
      receivedAt: '2026-06-11T20:15:00.000Z',
      contract: {
        schemaVersion: 'workspai.ai-action.v1',
        actionType: 'fix',
        summary: 'Unsafe fix',
        riskLevel: 'medium',
        affectedFiles: ['src/app.ts'],
        proposedCommands: [],
        proposedPatches: [],
        verificationCommands: [],
        rollbackPlan: [],
        confidence: 0.7,
        requiresApproval: true,
      },
      validation: {
        status: 'valid',
        issues: [],
        canApply: true,
        canVerify: true,
        canRollback: true,
      },
    });

    expect(gate.label).toBe('Blocked');
    expect(gate.hardBlocked).toBe(true);
    expect(gate.canApplyAfterApproval).toBe(false);
    expect(gate.canVerify).toBe(false);
    expect(gate.canRollbackAfterApproval).toBe(false);
    expect(gate.holds.map((hold) => hold.code)).toEqual(
      expect.arrayContaining(['missing-rollback', 'missing-verification'])
    );
  });

  it('marks posture blocked when evidence or action lifecycle has a hard hold', () => {
    const posture = buildStudioPosture({
      releasePosture: 'pending',
      policyGates: {
        flowState: 'warning',
        telemetryState: 'complete',
        releasePosture: 'pending',
      },
      studioEvidence: {
        generatedAt: '2026-06-11T20:00:00.000Z',
        verdict: 'blocked',
        findings: { fail: 1, warn: 0, info: 2 },
        topFindings: [],
      },
      aiActionRegistry: {
        updatedAt: '2026-06-11T20:01:00.000Z',
        entries: [
          {
            id: 'action-1',
            createdAt: '2026-06-11T20:00:30.000Z',
            summary: 'Fix auth gate',
            actionType: 'fix',
            riskLevel: 'high',
            validationStatus: 'valid',
            lifecycleStatus: 'applied-failed-verify',
            executions: [
              {
                operation: 'verify',
                ok: false,
                summary: 'Verification failed',
                completedAt: '2026-06-11T20:01:00.000Z',
                failedCommandCount: 1,
              },
            ],
          },
        ],
      },
    });

    expect(posture.label).toBe('Blocked');
    expect(posture.tone).toBe('error');
    expect(posture.summary).toContain('Hold release');
    expect(posture.metrics.find((metric) => metric.label === 'Health')).toMatchObject({
      value: '1 err / 0 warn',
      tone: 'error',
    });
    expect(posture.metrics.find((metric) => metric.label === 'AI action')).toMatchObject({
      value: 'applied-failed-verify',
      tone: 'error',
    });
  });

  it('marks posture needs review for pending gates without blockers', () => {
    const posture = buildStudioPosture({
      releasePosture: 'pending',
      policyGates: {
        flowState: 'passing',
        telemetryState: 'partial',
        releasePosture: 'pending',
      },
      studioEvidence: {
        generatedAt: '2026-06-11T20:00:00.000Z',
        verdict: 'needs-attention',
        findings: { fail: 0, warn: 2, info: 3 },
        topFindings: [],
      },
    });

    expect(posture.label).toBe('Needs Review');
    expect(posture.tone).toBe('warning');
    expect(posture.nextProof).toContain('verify gates');
    expect(posture.proof).toBe('0 fail / 2 warn');
  });

  it('marks posture ready when gates, evidence, and action history are clean', () => {
    const posture = buildStudioPosture({
      releasePosture: 'go',
      policyGates: {
        flowState: 'passing',
        telemetryState: 'complete',
        releasePosture: 'go',
      },
      studioEvidence: {
        generatedAt: '2026-06-11T20:00:00.000Z',
        verdict: 'ready',
        findings: { fail: 0, warn: 0, info: 5 },
        topFindings: [],
      },
      aiActionRegistry: {
        updatedAt: '2026-06-11T20:02:00.000Z',
        entries: [
          {
            id: 'action-2',
            createdAt: '2026-06-11T20:01:00.000Z',
            summary: 'Verify gates',
            actionType: 'verify',
            riskLevel: 'low',
            validationStatus: 'valid',
            lifecycleStatus: 'verified',
            executions: [
              {
                operation: 'verify',
                ok: true,
                summary: 'Verification passed',
                evidenceSha256: '1234567890abcdef',
                completedAt: '2026-06-11T20:02:00.000Z',
              },
            ],
          },
        ],
      },
    });

    expect(posture.label).toBe('Ready');
    expect(posture.tone).toBe('ok');
    expect(posture.proof).toBe('sha256:1234567890ab');
    expect(posture.action).toBe('verify/verified');
  });
});

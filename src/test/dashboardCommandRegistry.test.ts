import fs from 'fs-extra';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  DASHBOARD_COMMAND_CONTRACTS,
  resolveDashboardCommandContract,
} from '../core/dashboardCommandContracts';
import {
  resolveDashboardCommandForEvidenceCard,
  resolveEvidenceCardIdsForDashboardCommand,
} from '../core/dashboardReportRegistry';
import { DASHBOARD_EVIDENCE_CARD_IDS } from '../contracts/dashboardEvidenceCards';
import { DASHBOARD_COMMAND_SURFACE } from '../contracts/dashboardCommandSurface';
import {
  DASHBOARD_COMMAND_REGISTRY,
  getDashboardCommandAffectedEvidenceCards,
  getDashboardCommandMeta,
  getDashboardCommandPendingEvidenceCards,
  shouldRefreshDashboardEvidenceAfterCommand,
  shouldTrackDashboardCommand,
} from '../../webview-ui/src/lib/dashboardCommandRegistry';
import { buildDashboardDispatchMessages } from '../../webview-ui/src/lib/dashboardDispatch';
import {
  EVIDENCE_CARD_COMMANDS,
  resolveEvidenceCardCommandAction,
} from '../../webview-ui/src/lib/dashboardEvidenceActions';
import { buildDashboardNextSteps } from '../../webview-ui/src/lib/dashboardNextSteps';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function uniqueMatches(source: string, regex: RegExp): string[] {
  const matches = new Set<string>();
  let match: RegExpExecArray | null = regex.exec(source);
  while (match) {
    if (match[1]) {
      matches.add(match[1]);
    }
    match = regex.exec(source);
  }
  return [...matches].sort();
}

describe('dashboardCommandRegistry', () => {
  it('registers every dashboard command dispatched from App and next-step builders', () => {
    const appSource = read('webview-ui/src/App.tsx');
    const nextStepsSource = read('webview-ui/src/lib/dashboardNextSteps.ts');
    const enterpriseFlowSource = read('webview-ui/src/components/EnterpriseDashboardFlow.tsx');
    const appCommands = uniqueMatches(appSource, /dispatchDashboardCommand\('([^']+)'/g);
    const appHandlerCommands = uniqueMatches(appSource, /handleDashboardCommand\('([^']+)'/g);
    const nextStepCommands = uniqueMatches(nextStepsSource, /command:\s*'([^']+)'/g);
    const enterpriseFlowCommands = uniqueMatches(
      enterpriseFlowSource,
      /runWorkspaceAction\('([^']+)'/g
    );
    const enterpriseFlowDirectCommands = uniqueMatches(
      enterpriseFlowSource,
      /onRunWorkspaceCommand\('([^']+)'/g
    );

    for (const command of [
      ...appCommands,
      ...appHandlerCommands,
      ...nextStepCommands,
      ...enterpriseFlowCommands,
      ...enterpriseFlowDirectCommands,
    ]) {
      expect(getDashboardCommandMeta(command), command).toBeDefined();
    }
  });

  it('keeps extension-host dashboard commands backed by WelcomePanel handlers', () => {
    const welcomePanelSource = read('src/ui/panels/welcomePanel.ts');

    for (const [command, meta] of Object.entries(DASHBOARD_COMMAND_REGISTRY)) {
      if (meta.handler !== 'extension-host') {
        continue;
      }
      expect(welcomePanelSource, command).toContain(`case '${command}':`);
    }
  });

  it('keeps evidence refresh payload-aware after command dispatch', () => {
    const appSource = read('webview-ui/src/App.tsx');

    expect(appSource).toContain('buildEvidenceRequestContext');
    expect(appSource).toContain('getDashboardCommandPendingEvidenceCards');
    expect(appSource).toContain('scheduleDashboardEvidenceCardRefresh(affectedCards, payload)');
    expect(appSource).toContain('scheduleDashboardEvidenceFullRefresh(payload)');
    expect(appSource).toContain("typeof context?.projectPath === 'string'");
    expect(appSource).toContain("typeof context?.path === 'string'");
  });

  it('keeps webview command metadata aligned with host command contracts', () => {
    for (const [command, meta] of Object.entries(DASHBOARD_COMMAND_REGISTRY)) {
      const surface = DASHBOARD_COMMAND_SURFACE[command as keyof typeof DASHBOARD_COMMAND_SURFACE];
      const contract = resolveDashboardCommandContract(command);
      expect(surface, command).toBeDefined();
      expect(surface?.label, command).toBe(meta.label);
      expect(surface?.scope, command).toBe(meta.scope);
      expect(surface?.trackActivity, command).toBe(meta.trackActivity);
      expect(contract, command).toBeDefined();
      expect(contract?.label, command).toBe(meta.label);
      expect(contract?.scope, command).toBe(meta.scope);
      expect(contract?.trackActivity, command).toBe(meta.trackActivity);
    }

    for (const command of Object.keys(DASHBOARD_COMMAND_CONTRACTS)) {
      expect(getDashboardCommandMeta(command), command).toBeDefined();
    }
  });

  it('declares host execution posture for operational CLI-backed commands', () => {
    const rapidkitCommands = Object.values(DASHBOARD_COMMAND_CONTRACTS).filter(
      (contract) => contract.executionMode === 'terminal-rapidkit'
    );

    expect(rapidkitCommands.length).toBeGreaterThan(10);
    for (const contract of rapidkitCommands) {
      expect(contract.cliArgs?.length, contract.id).toBeGreaterThan(0);
      expect(contract.trackActivity, contract.id).toBe(true);
      expect(contract.requiresWorkspace || contract.requiresProject, contract.id).toBe(true);
    }
  });

  it('declares VS Code command bindings for host-dispatched dashboard contracts', () => {
    for (const contract of Object.values(DASHBOARD_COMMAND_CONTRACTS)) {
      if (
        contract.executionMode === 'webview-local' ||
        contract.executionMode === 'extension-host-handler'
      ) {
        continue;
      }
      expect(contract.vscodeCommand, contract.id).toMatch(/^workspai\./);
    }
  });

  it('keeps every evidence card mapped to a valid command for terminal, Studio, and Copilot handoff', () => {
    for (const cardId of DASHBOARD_EVIDENCE_CARD_IDS) {
      const cardCommand = EVIDENCE_CARD_COMMANDS[cardId];
      const hostCommand = resolveDashboardCommandForEvidenceCard(cardId);

      expect(cardCommand, cardId).toBeDefined();
      expect(hostCommand, cardId).toBeDefined();
      expect(getDashboardCommandMeta(cardCommand!), `${cardId}:${cardCommand}`).toBeDefined();
      expect(
        resolveDashboardCommandContract(hostCommand!),
        `${cardId}:${hostCommand}`
      ).toBeDefined();

      if (cardId === 'workspaceRun') {
        expect(hostCommand).toBe('workspaceRunTest');
        expect(cardCommand).toBe('workspaceRunTest');
      } else {
        expect(hostCommand, cardId).toBe(cardCommand);
      }

      expect(resolveEvidenceCardIdsForDashboardCommand(hostCommand!), hostCommand).toContain(
        cardId
      );
    }
  });

  it('routes dashboard workspace and project commands through contract-aware guards', () => {
    const welcomePanelSource = read('src/ui/panels/welcomePanel.ts');

    expect(welcomePanelSource).toContain('resolveDashboardCommandContract(command)');
    expect(welcomePanelSource).toContain('_executeDashboardContractCommand(');
    expect(welcomePanelSource).toContain('_getDashboardWorkspacePayload(');
    expect(welcomePanelSource).toContain('_getDashboardProjectPayload(');
    const projectActionSwitchStart = welcomePanelSource.indexOf("case 'projectTerminal':");
    const projectActionSwitchEnd = welcomePanelSource.indexOf("case 'projectBrowser':");
    expect(projectActionSwitchStart).toBeGreaterThanOrEqual(0);
    expect(projectActionSwitchEnd).toBeGreaterThan(projectActionSwitchStart);
    const projectActionSwitchSource = welcomePanelSource.slice(
      projectActionSwitchStart,
      projectActionSwitchEnd
    );

    expect(welcomePanelSource).toContain(
      "await this._executeDashboardContractCommand('workspaceAnalyze', message.data);"
    );
    expect(welcomePanelSource).toContain(
      "await this._executeDashboardContractCommand('workspaceContractGraph', message.data);"
    );
    expect(welcomePanelSource).toContain(
      "await this._executeDashboardContractCommand('workspaceSync', message.data);"
    );
    expect(welcomePanelSource).toContain(
      "await this._executeDashboardContractCommand('workspaceFoundationEnsure', message.data);"
    );
    expect(welcomePanelSource).toContain(
      "await this._executeDashboardContractCommand('workspaceContractInspect', message.data);"
    );
    expect(welcomePanelSource).toContain(
      "await this._executeDashboardContractCommand('workspaceContractVerify', message.data);"
    );
    expect(welcomePanelSource).toContain(
      "await this._executeDashboardContractCommand('workspaceRunTest', message.data);"
    );
    expect(welcomePanelSource).toContain(
      "await this._executeDashboardContractCommand('workspaceRunBuild', message.data);"
    );
    expect(welcomePanelSource).toContain(
      "await this._executeDashboardContractCommand('workspaceRunInit', message.data);"
    );
    expect(welcomePanelSource).toContain(
      "await this._executeDashboardContractCommand('workspaceRunStart', message.data);"
    );
    expect(welcomePanelSource).toContain(
      "await this._executeDashboardContractCommand('workspaceSnapshot', message.data);"
    );
    expect(welcomePanelSource).toContain(
      "await this._executeDashboardContractCommand('workspaceSnapshotList', message.data);"
    );
    expect(welcomePanelSource).toContain(
      "await this._executeDashboardContractCommand('workspaceSnapshotInspect', message.data);"
    );
    expect(welcomePanelSource).toContain(
      "await this._executeDashboardContractCommand('workspaceSnapshotRestore', message.data);"
    );
    expect(welcomePanelSource).toContain(
      "await this._executeDashboardContractCommand('workspaceContractInit', message.data);"
    );
    expect(welcomePanelSource).toContain(
      "await this._executeDashboardContractCommand('workspaceArchiveInspect', message.data);"
    );
    expect(welcomePanelSource).toContain(
      "await this._executeDashboardContractCommand('workspaceTerminal', message.data);"
    );
    expect(welcomePanelSource).toContain(
      "await this._executeDashboardContractCommand('projectTest', message.data);"
    );
    expect(welcomePanelSource).toContain(
      "await this._executeDashboardContractCommand('projectDoctor', message.data);"
    );
    expect(welcomePanelSource).toContain(
      "await this._executeDashboardContractCommand('projectArchitecture', message.data);"
    );
    expect(welcomePanelSource).toContain(
      "await this._executeDashboardContractCommand('projectIncident', message.data);"
    );
    expect(welcomePanelSource).toContain(
      "await this._executeDashboardContractCommand('projectAI', message.data);"
    );
    expect(welcomePanelSource).toContain(
      "await this._executeDashboardContractCommand('projectRelease', message.data);"
    );
    expect(welcomePanelSource).toContain(
      "await this._executeDashboardContractCommand('projectImpact', message.data);"
    );
    expect(welcomePanelSource).toContain(
      'await this._executeDashboardContractCommand(message.command, message.data);'
    );
    for (const directCommand of [
      'workspai.workspaceAnalyze',
      'workspai.projectDoctor',
      'workspai.openArchitectureMap',
      'workspai.openIncidentStudio',
      'workspai.openWorkspaceAdvisor',
      'workspai.aiForProject',
      'workspai.aiReleaseReadinessCommander',
      'workspai.aiChangeImpactLite',
      'workspai.architectureImpactLens',
      'workspai.workspaceContractInspect',
      'workspai.workspaceContractVerify',
      'workspai.workspaceRunInit',
      'workspai.workspaceRunStart',
      'workspai.workspaceSnapshot',
      'workspai.workspaceSnapshotList',
      'workspai.workspaceSnapshotInspect',
      'workspai.workspaceSnapshotRestore',
      'workspai.workspaceContractInit',
      'workspai.workspaceArchiveInspect',
    ]) {
      expect(projectActionSwitchSource).not.toContain(
        `await vscode.commands.executeCommand('${directCommand}'`
      );
    }
  });

  it('keeps dashboard project scope stable across workspace refreshes', () => {
    const welcomePanelSource = read('src/ui/panels/welcomePanel.ts');

    expect(welcomePanelSource).toContain('workspacePath?: string;');
    expect(welcomePanelSource).toContain('workspaceName?: string;');
    expect(welcomePanelSource).toContain('selectedProject?.workspacePath');
    expect(welcomePanelSource).toContain('WelcomePanel._selectedProject.workspacePath ||');
    expect(welcomePanelSource).toContain('if (!selectedWorkspace && !fallbackWorkspacePath) {');
    expect(welcomePanelSource).toContain(
      'isWorkspacePathAncestor(workspacePath, selectedProject.path)'
    );
    expect(welcomePanelSource).toContain('normalizedContext?.projectPath');
    expect(welcomePanelSource).toContain("typeof message.data?.projectPath === 'string'");
    expect(welcomePanelSource).toContain("typeof message.data?.projectName === 'string'");
    expect(welcomePanelSource).toContain("reportPath: readStringField(data, 'reportPath')");
    expect(welcomePanelSource).not.toContain(
      'selectedProject.path.startsWith(`${workspacePath}${path.sep}`)'
    );
    expect(welcomePanelSource).not.toContain('workspacePath = WelcomePanel._selectedProject.path;');

    const appSource = read('webview-ui/src/App.tsx');
    expect(appSource).toContain('const projectCommandPayload = () => ({');
    expect(appSource).toContain("command.startsWith('project')");
    expect(appSource).toContain(
      'projectPath: selectedProjectForAnalysis?.path || workspaceStatus.projectPath'
    );
    expect(appSource).toContain(
      'projectName: selectedProjectForAnalysis?.name || workspaceStatus.projectName'
    );
    expect(appSource).toContain(
      'contextProjectPath || selectedProjectForAnalysisRef.current?.path'
    );
    expect(appSource).toContain(
      'contextProjectName || selectedProjectForAnalysisRef.current?.name'
    );
    expect(appSource).toContain("typeof context?.projectPath === 'string'");
    expect(appSource).toContain("typeof context?.projectName === 'string'");
  });

  it('keeps user-facing dashboard actions on the command dispatcher', () => {
    const appSource = read('webview-ui/src/App.tsx');
    const handoffSource = read('webview-ui/src/components/HomeImportAdoptHandoff.tsx');
    const welcomePanelSource = read('src/ui/panels/welcomePanel.ts');

    expect(handoffSource).toContain("runHandoff('importProject')");
    expect(handoffSource).toContain("runHandoff('adoptProject')");
    expect(handoffSource).toContain('onRunCommand(command');
    expect(handoffSource).not.toContain("vscode.postMessage('importProject')");
    expect(appSource).toContain('<HomeImportAdoptHandoff');
    expect(appSource).toContain('onRunCommand={handleDashboardCommand}');

    expect(welcomePanelSource).toContain("case 'importWorkspace'");
    expect(welcomePanelSource).toContain("_executeDashboardContractCommand('importWorkspace'");

    const recentWorkspacesStart = appSource.indexOf('<RecentWorkspaces');
    const recentWorkspacesEnd = appSource.indexOf('</div>', recentWorkspacesStart);
    expect(recentWorkspacesStart).toBeGreaterThanOrEqual(0);
    expect(recentWorkspacesEnd).toBeGreaterThan(recentWorkspacesStart);
    const recentWorkspacesSource = appSource.slice(recentWorkspacesStart, recentWorkspacesEnd);

    expect(recentWorkspacesSource).toContain("dispatchDashboardCommand('checkWorkspaceHealth'");
    expect(recentWorkspacesSource).toContain('name: workspace.name');
  });

  it('surfaces pending dashboard command state across operate and release cards', () => {
    const actionTileSource = read('webview-ui/src/components/ActionTile.tsx');
    const appSource = read('webview-ui/src/App.tsx');
    const operateSource = read('webview-ui/src/components/DashboardOperateSection.tsx');
    const governanceSource = read('webview-ui/src/components/WorkspaceGovernancePanel.tsx');
    const enterpriseFlowSource = read('webview-ui/src/components/EnterpriseDashboardFlow.tsx');
    const evidenceSource = read('webview-ui/src/components/DashboardEvidenceSection.tsx');
    const releaseHubSource = read('webview-ui/src/components/ReleaseHub.tsx');

    expect(actionTileSource).toContain('pending?: boolean;');
    expect(actionTileSource).toContain('aria-busy={pending || undefined}');
    expect(appSource).toContain('pendingCardIds={pendingEvidenceCardIds}');
    expect(appSource).toContain('const reconcilePendingEvidenceCards = useCallback');
    expect(appSource).toContain('reconcilePendingEvidenceCardIds(current, payload)');
    expect(read('webview-ui/src/lib/dashboardEvidencePending.ts')).toContain(
      "card.status !== 'missing' || card.generatedAt || card.artifactPath"
    );
    expect(appSource).toContain('reconcilePendingEvidenceCards(next)');
    expect(appSource).toContain('applyDashboardEvidenceMessage');
    expect(operateSource).toContain('pendingCardIds?: DashboardEvidenceCardId[];');
    expect(operateSource).toContain('pendingCardIds={pendingCardIds}');

    for (const cardId of [
      'bootstrap',
      'setup',
      'readiness',
      'workspaceSync',
      'foundation',
      'contract',
      'mirror',
      'cache',
      'policy',
      'infra',
    ]) {
      expect(governanceSource, cardId).toContain(`isPending('${cardId}')`);
    }

    for (const cardId of ['doctor', 'analyze', 'archive', 'share', 'snapshot', 'pipeline']) {
      expect(enterpriseFlowSource, cardId).toContain(`isPending('${cardId}')`);
    }

    expect(evidenceSource).toContain('pendingCardIds={pendingCardIds}');
    expect(releaseHubSource).toContain('pendingCardIds?: DashboardEvidenceCardId[];');
    expect(releaseHubSource).toContain("stage.pending ? 'Running' : stage.actionLabel");
    expect(releaseHubSource).toContain('disabled={stage.pending ||');
  });

  it('declares payload adapters for project commands with richer host context', () => {
    expect(DASHBOARD_COMMAND_CONTRACTS.workspaceImpactLens.vscodeCommand).toBe(
      'workspai.openWorkspaceAdvisor'
    );
    expect(DASHBOARD_COMMAND_CONTRACTS.workspaceImpactLens.payloadKind).toBe('workspace');
    expect(DASHBOARD_COMMAND_CONTRACTS.workspaceImpactLens.payloadDefaults).toMatchObject({
      source: 'dashboard',
      trigger: 'workspace_intelligence',
    });
    expect(DASHBOARD_COMMAND_CONTRACTS.projectDoctor.payloadKind).toBe('project-path');
    expect(DASHBOARD_COMMAND_CONTRACTS.projectDoctor.payloadDefaults).toEqual({
      preferredAction: 'check',
    });
    for (const command of ['projectArchitecture', 'projectIncident', 'projectAI'] as const) {
      expect(DASHBOARD_COMMAND_CONTRACTS[command].payloadKind, command).toBe('project-context');
    }
    for (const command of ['projectRelease', 'projectAI', 'projectImpact'] as const) {
      expect(DASHBOARD_COMMAND_CONTRACTS[command].payloadKind, command).toBe('project-context');
      expect(DASHBOARD_COMMAND_CONTRACTS[command].payloadDefaults, command).toMatchObject({
        source: 'dashboard',
        trigger: 'project_actions',
      });
    }
    expect(DASHBOARD_COMMAND_CONTRACTS.projectAI.vscodeCommand).toBe(
      'workspai.openWorkspaceAdvisor'
    );
    expect(DASHBOARD_COMMAND_CONTRACTS.projectAI.label).toBe('Workspace Advisor');
    expect(DASHBOARD_COMMAND_CONTRACTS.projectImpact.vscodeCommand).toBe(
      'workspai.openWorkspaceAdvisor'
    );
    expect(DASHBOARD_COMMAND_CONTRACTS.projectImpact.label).toBe('Workspace Advisor');
  });

  it('tracks only operational dashboard commands in the activity trail', () => {
    expect(buildDashboardDispatchMessages('openSetup')).toEqual([{ command: 'openSetup' }]);
    expect(buildDashboardDispatchMessages('refreshModules')).toEqual([
      { command: 'refreshModules', data: undefined },
    ]);
    expect(buildDashboardDispatchMessages('workspaceAnalyze', { path: '/repo' })).toEqual([
      {
        command: 'trackDashboardCommand',
        data: { command: 'workspaceAnalyze', affectedEvidenceCardIds: ['analyze'] },
      },
      { command: 'workspaceAnalyze', data: { path: '/repo' } },
    ]);
    expect(shouldTrackDashboardCommand('workspaceAnalyze')).toBe(true);
    expect(shouldTrackDashboardCommand('refreshModules')).toBe(false);
  });

  it('enriches dashboard next steps with registry command metadata', () => {
    const steps = buildDashboardNextSteps({
      workspaceStatus: {
        hasWorkspace: true,
        workspacePath: '/repo',
        hasProjectSelected: true,
        projectType: 'fastapi',
        installedModules: [],
        isRunning: false,
      } as never,
      activeWorkspace: { name: 'repo', path: '/repo' } as never,
      installStatusChecked: true,
      coreInstalled: true,
      evidence: {
        workspacePath: '/repo',
        cards: [
          {
            id: 'analyze',
            label: 'Analyze',
            status: 'missing',
            summary: 'Analyze evidence is missing.',
            scope: 'workspace',
          },
        ],
        activity: [],
        onboarding: {
          isFreshInstall: false,
          recentWorkspaceCount: 1,
          hasActiveWorkspace: true,
        },
      },
    });
    const analyzeStep = steps.find((step) => step.command === 'workspaceAnalyze');

    expect(analyzeStep).toMatchObject({
      commandLabel: DASHBOARD_COMMAND_REGISTRY.workspaceAnalyze.label,
      commandScope: DASHBOARD_COMMAND_REGISTRY.workspaceAnalyze.scope,
      commandTrackActivity: DASHBOARD_COMMAND_REGISTRY.workspaceAnalyze.trackActivity,
    });
  });

  it('adds Run zone deep links on next steps without commands', () => {
    const steps = buildDashboardNextSteps({
      workspaceStatus: {
        hasWorkspace: true,
        workspacePath: '/repo',
        hasProjectSelected: false,
        projectType: undefined,
        installedModules: [],
        isRunning: false,
      } as never,
      activeWorkspace: { name: 'repo', path: '/repo' } as never,
      installStatusChecked: true,
      coreInstalled: true,
      evidence: {
        workspacePath: '/repo',
        cards: [],
        activity: [],
        opsChain: {
          status: 'blocked',
          currentStep: 'doctor',
          completedSteps: ['bootstrap'],
          triggeredBy: 'create',
          lastDetail: 'Doctor failed',
        },
        onboarding: {
          isFreshInstall: false,
          recentWorkspaceCount: 1,
          hasActiveWorkspace: true,
        },
      },
    });

    expect(steps.find((step) => step.id === 'select-project')).toMatchObject({
      section: 'operate',
      operateZone: 'build',
    });
    expect(steps.find((step) => step.id === 'ops-chain-blocked')).toMatchObject({
      section: 'operate',
      operateZone: 'quick',
    });
  });

  it('prioritizes project scaffolding before analyze blockers on empty workspaces', () => {
    const steps = buildDashboardNextSteps({
      workspaceStatus: {
        hasWorkspace: true,
        workspacePath: '/repo',
        hasProjectSelected: false,
        projectType: undefined,
        installedModules: [],
        isRunning: false,
      } as never,
      activeWorkspace: { name: 'repo', path: '/repo' } as never,
      installStatusChecked: true,
      coreInstalled: true,
      evidence: {
        workspacePath: '/repo',
        cards: [
          {
            id: 'workspaceModel',
            label: 'Workspace Model',
            status: 'pass',
            summary: '0 projects',
            scope: 'workspace',
            metrics: { projectCount: 0 },
          },
          {
            id: 'analyze',
            label: 'Analyze',
            status: 'fail',
            summary: 'blocked',
            scope: 'workspace',
            blockers: ['No backend projects detected'],
          },
        ],
        activity: [],
        onboarding: {
          isFreshInstall: false,
          recentWorkspaceCount: 1,
          hasActiveWorkspace: true,
        },
      },
    });

    const scaffold = steps.find((step) => step.id === 'select-project');
    const analyze = steps.find((step) => step.id === 'analyze-blockers');

    expect(scaffold).toMatchObject({
      title: 'Add your first project',
      priority: 'critical',
    });
    expect(analyze).toBeUndefined();
  });

  it('resolves evidence card CTAs through registry-backed command actions', () => {
    expect(EVIDENCE_CARD_COMMANDS.archive).toBe('workspaceArchive');

    for (const [cardId, command] of Object.entries(EVIDENCE_CARD_COMMANDS)) {
      const meta = getDashboardCommandMeta(command);
      const affectedCards = getDashboardCommandAffectedEvidenceCards(command);
      const action = resolveEvidenceCardCommandAction({
        id: cardId as keyof typeof EVIDENCE_CARD_COMMANDS,
        label: cardId,
        status: 'fail',
        summary: 'Needs attention',
        scope: meta?.scope === 'project' ? 'project' : 'workspace',
      });

      expect(meta, cardId).toBeDefined();
      expect(affectedCards, cardId).toContain(cardId);
      expect(shouldRefreshDashboardEvidenceAfterCommand(command), cardId).toBe(true);
      expect(action, cardId).toMatchObject({
        command,
        label: meta?.label,
        scope: meta?.scope,
        trackActivity: meta?.trackActivity,
      });
    }
  });

  it('marks full-refresh commands pending against current evidence cards', () => {
    expect(
      getDashboardCommandPendingEvidenceCards('refreshModules', ['doctor', 'analyze'])
    ).toEqual([]);
    expect(
      getDashboardCommandPendingEvidenceCards('workspacePipeline', ['doctor', 'analyze'])
    ).toEqual(expect.arrayContaining(['pipeline', 'doctor']));
    expect(getDashboardCommandPendingEvidenceCards('projectTest', ['doctor', 'analyze'])).toEqual([
      'workspaceRun',
    ]);
  });

  it('keeps evidence-refreshing dashboard commands targeted unless explicitly full-refresh', () => {
    const fullRefreshCommands = new Set(['workspacePipeline']);

    for (const [command, meta] of Object.entries(DASHBOARD_COMMAND_REGISTRY)) {
      if (!shouldRefreshDashboardEvidenceAfterCommand(command)) {
        continue;
      }

      const affectedCards = getDashboardCommandAffectedEvidenceCards(command);
      expect(
        affectedCards.length > 0 || fullRefreshCommands.has(command),
        `${command} refreshes evidence without declaring affected cards`
      ).toBe(true);
      expect(meta.refreshEvidence, command).toBe(true);
    }
  });

  it('aligns project run commands with the workspace run evidence card', () => {
    for (const command of ['projectInit', 'projectTest', 'projectBuild']) {
      expect(getDashboardCommandAffectedEvidenceCards(command), command).toEqual(['workspaceRun']);
      expect(
        getDashboardCommandPendingEvidenceCards(command, ['doctor', 'analyze']),
        command
      ).toEqual(['workspaceRun']);
      expect(shouldRefreshDashboardEvidenceAfterCommand(command), command).toBe(true);
    }

    for (const command of ['projectDev', 'projectStop']) {
      expect(getDashboardCommandAffectedEvidenceCards(command), command).toEqual([]);
      expect(
        getDashboardCommandPendingEvidenceCards(command, ['doctor', 'analyze']),
        command
      ).toEqual([]);
      expect(shouldRefreshDashboardEvidenceAfterCommand(command), command).toBe(false);
    }
  });
});

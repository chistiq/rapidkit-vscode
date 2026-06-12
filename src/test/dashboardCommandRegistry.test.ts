import fs from 'fs-extra';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  DASHBOARD_COMMAND_CONTRACTS,
  resolveDashboardCommandContract,
} from '../core/dashboardCommandContracts';
import {
  DASHBOARD_COMMAND_REGISTRY,
  getDashboardCommandMeta,
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
    const appCommands = uniqueMatches(appSource, /dispatchDashboardCommand\('([^']+)'/g);
    const nextStepCommands = uniqueMatches(nextStepsSource, /command:\s*'([^']+)'/g);

    for (const command of [...appCommands, ...nextStepCommands]) {
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

  it('keeps webview command metadata aligned with host command contracts', () => {
    for (const [command, meta] of Object.entries(DASHBOARD_COMMAND_REGISTRY)) {
      const contract = resolveDashboardCommandContract(command);
      expect(contract, command).toBeDefined();
      expect(contract?.label, command).toBe(meta.label);
      expect(contract?.scope, command).toBe(meta.scope);
      expect(contract?.trackActivity, command).toBe(meta.trackActivity);
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
      'workspai.aiForProject',
      'workspai.aiReleaseReadinessCommander',
      'workspai.aiChangeImpactLite',
    ]) {
      expect(projectActionSwitchSource).not.toContain(
        `await vscode.commands.executeCommand('${directCommand}'`
      );
    }
  });

  it('declares payload adapters for project commands with richer host context', () => {
    expect(DASHBOARD_COMMAND_CONTRACTS.projectDoctor.payloadKind).toBe('project-path');
    expect(DASHBOARD_COMMAND_CONTRACTS.projectDoctor.payloadDefaults).toEqual({
      preferredAction: 'check',
    });
    for (const command of ['projectArchitecture', 'projectIncident', 'projectAI'] as const) {
      expect(DASHBOARD_COMMAND_CONTRACTS[command].payloadKind, command).toBe('project-context');
    }
    for (const command of ['projectRelease', 'projectImpact'] as const) {
      expect(DASHBOARD_COMMAND_CONTRACTS[command].payloadKind, command).toBe('project-context');
      expect(DASHBOARD_COMMAND_CONTRACTS[command].payloadDefaults, command).toMatchObject({
        source: 'dashboard',
        trigger: 'project_actions',
      });
    }
  });

  it('tracks only operational dashboard commands in the activity trail', () => {
    expect(buildDashboardDispatchMessages('openSetup')).toEqual([{ command: 'openSetup' }]);
    expect(buildDashboardDispatchMessages('refreshModules')).toEqual([
      { command: 'refreshModules', data: undefined },
    ]);
    expect(buildDashboardDispatchMessages('workspaceAnalyze', { path: '/repo' })).toEqual([
      { command: 'trackDashboardCommand', data: { command: 'workspaceAnalyze' } },
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

  it('resolves evidence card CTAs through registry-backed command actions', () => {
    for (const [cardId, command] of Object.entries(EVIDENCE_CARD_COMMANDS)) {
      const meta = getDashboardCommandMeta(command);
      const action = resolveEvidenceCardCommandAction({
        id: cardId as keyof typeof EVIDENCE_CARD_COMMANDS,
        label: cardId,
        status: 'fail',
        summary: 'Needs attention',
        scope: meta?.scope === 'project' ? 'project' : 'workspace',
      });

      expect(meta, cardId).toBeDefined();
      expect(action, cardId).toMatchObject({
        command,
        label: meta?.label,
        scope: meta?.scope,
        trackActivity: meta?.trackActivity,
      });
    }
  });
});

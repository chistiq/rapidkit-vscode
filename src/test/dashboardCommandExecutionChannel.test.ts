import { describe, expect, it } from 'vitest';
import { resolveDashboardCommandExecutionChannel } from '../contracts/dashboardCommandExecutionChannel';
import { DASHBOARD_COMMAND_SURFACE } from '../contracts/dashboardCommandSurface';
import {
  DASHBOARD_COMMAND_CONTRACTS,
  resolveDashboardCommandContract,
} from '../core/dashboardCommandContracts';
import {
  applyStudioGovernedCommandReuse,
  preserveAllAgentConsumersForStudioRefresh,
  resolveDashboardCommandExecutionPlan,
} from '../core/dashboardCommandExecutionPlan';
import {
  isDashboardCommandCapabilityAdvertised,
  resolveDashboardCommandCapabilityRequirement,
} from '../core/dashboardCommandCapabilityGate';
import {
  WORKSPACE_COMMAND_SAFETY_POLICIES,
  resolveWorkspaceCommandSafetyPolicy,
} from '../core/workspaceCommandSafety';
import type { RuntimeCommandSurfaceSnapshot } from '../core/runtimeCommandSurface';

describe('resolveDashboardCommandExecutionChannel', () => {
  it('marks governance and intelligence progress commands as background', () => {
    expect(resolveDashboardCommandExecutionChannel('workspacePipeline')).toBe('background');
    expect(resolveDashboardCommandExecutionChannel('workspaceModel')).toBe('background');
    expect(resolveDashboardCommandExecutionChannel('workspaceEvaluationReport')).toBe('background');
    expect(resolveDashboardCommandExecutionChannel('workspaceIntelligenceChain')).toBe(
      'background'
    );
    expect(resolveDashboardCommandExecutionChannel('workspaceRemediationPlan')).toBe('background');
  });

  it('marks artifact export and archive handlers as background', () => {
    expect(resolveDashboardCommandExecutionChannel('exportWorkspace')).toBe('background');
    expect(resolveDashboardCommandExecutionChannel('importProject')).toBe('background');
    expect(resolveDashboardCommandExecutionChannel('adoptProject')).toBe('background');
    expect(resolveDashboardCommandExecutionChannel('workspaceArchive')).toBe('background');
    expect(resolveDashboardCommandExecutionChannel('workspaceArchiveInspect')).toBe('background');
    expect(resolveDashboardCommandExecutionChannel('workspaceArchiveVerify')).toBe('background');
    expect(resolveDashboardCommandExecutionChannel('workspaceArchiveDoctor')).toBe('background');
  });

  it('marks default rapidkit CLI commands as terminal', () => {
    expect(resolveDashboardCommandExecutionChannel('workspaceAnalyze')).toBe('terminal');
    expect(resolveDashboardCommandExecutionChannel('workspaceBootstrap')).toBe('terminal');
    expect(resolveDashboardCommandExecutionChannel('workspaceSnapshot')).toBe('terminal');
    expect(resolveDashboardCommandExecutionChannel('workspaceSnapshotList')).toBe('terminal');
    expect(resolveDashboardCommandExecutionChannel('workspaceRunStage')).toBe('terminal');
    expect(resolveDashboardCommandExecutionChannel('workspacePolicySet')).toBe('terminal');
    expect(resolveDashboardCommandExecutionChannel('cacheClear')).toBe('terminal');
    expect(resolveDashboardCommandExecutionChannel('mirrorVerify')).toBe('terminal');
    expect(resolveDashboardCommandExecutionChannel('infraPlan')).toBe('terminal');
    expect(resolveDashboardCommandExecutionChannel('projectDoctor')).toBe('terminal');
    expect(resolveDashboardCommandExecutionChannel('moduleDiff')).toBe('terminal');
    expect(resolveDashboardCommandExecutionChannel('moduleCheckpoint')).toBe('terminal');
    expect(resolveDashboardCommandExecutionChannel('workspaceTerminal')).toBe('terminal');
    expect(resolveDashboardCommandExecutionChannel('projectStop')).toBe('terminal');
  });

  it('marks VS Code handlers that dispatch CLI in a terminal as terminal', () => {
    expect(resolveDashboardCommandExecutionChannel('workspaceShare')).toBe('terminal');
    expect(resolveDashboardCommandExecutionChannel('mirrorOps')).toBe('terminal');
  });

  it('switches terminal rapidkit to background for evidence direct-run', () => {
    expect(
      resolveDashboardCommandExecutionChannel('workspaceAnalyze', { evidenceDirectRun: true })
    ).toBe('background');
    expect(
      resolveDashboardCommandExecutionChannel('workspaceBootstrap', {
        source: 'evidence',
        evidenceDirectRun: true,
      })
    ).toBe('background');
  });

  it('keeps doctor on terminal even with evidence direct-run payload', () => {
    expect(
      resolveDashboardCommandExecutionChannel('checkWorkspaceHealth', {
        evidenceDirectRun: true,
        preferredAction: 'check',
      })
    ).toBe('terminal');
  });

  it('returns undefined for non-CLI dashboard actions', () => {
    expect(resolveDashboardCommandExecutionChannel('importWorkspace')).toBeUndefined();
    expect(resolveDashboardCommandExecutionChannel('openSetup')).toBeUndefined();
    expect(resolveDashboardCommandExecutionChannel('projectArchitecture')).toBeUndefined();
  });

  it('assigns an execution channel to every dashboard contract with cli args', () => {
    const cliBackedContracts = Object.values(DASHBOARD_COMMAND_CONTRACTS).filter(
      (contract) => contract.cliArgs && contract.cliArgs.length > 0
    );

    expect(cliBackedContracts).not.toHaveLength(0);

    const missingChannels = cliBackedContracts
      .filter((contract) => !resolveDashboardCommandExecutionChannel(contract.id))
      .map((contract) => contract.id);

    expect(missingChannels).toEqual([]);
  });

  it('keeps every dashboard contract classified by the host execution discipline', () => {
    const failures: string[] = [];

    for (const contract of Object.values(DASHBOARD_COMMAND_CONTRACTS)) {
      const plan = resolveDashboardCommandExecutionPlan(contract.id);
      const hasCliArgs = (contract.cliArgs ?? []).length > 0;

      if (plan.contract?.id !== contract.id) {
        failures.push(`${contract.id}: missing host execution plan contract`);
      }

      if (plan.isCliBacked !== hasCliArgs) {
        failures.push(`${contract.id}: cli-backed flag drifted from cli args`);
      }

      if (hasCliArgs && !plan.executionChannel) {
        failures.push(`${contract.id}: CLI-backed command has no execution channel`);
      }

      if (hasCliArgs && !plan.capabilityRequirement) {
        failures.push(`${contract.id}: CLI-backed command has no capability requirement`);
      }

      if (!hasCliArgs && plan.capabilityRequirement) {
        failures.push(`${contract.id}: non-CLI command unexpectedly has capability requirement`);
      }

      if (contract.executionMode === 'terminal-rapidkit' && !hasCliArgs) {
        failures.push(`${contract.id}: terminal rapidkit command has no cli args`);
      }

      if (contract.executionMode === 'terminal-shell' && plan.executionChannel !== 'terminal') {
        failures.push(`${contract.id}: terminal shell command is not terminal-classified`);
      }

      if (
        (contract.executionMode === 'webview-local' ||
          contract.executionMode === 'extension-host-handler') &&
        (hasCliArgs || plan.executionChannel || plan.capabilityRequirement)
      ) {
        failures.push(`${contract.id}: local handler leaked CLI execution metadata`);
      }
    }

    expect(failures).toEqual([]);
  });

  it('keeps mutating workspace operational contracts tied to safety policies', () => {
    const safetyRequired = [
      'workspaceFoundationEnsure',
      'workspacePolicySet',
      'cacheClear',
      'cachePrune',
      'cacheRepair',
      'workspaceSnapshotRestore',
      'mirrorSync',
      'mirrorVerify',
      'mirrorRotate',
      'infraUp',
      'infraDown',
    ];

    for (const commandId of safetyRequired) {
      expect(resolveDashboardCommandContract(commandId), commandId).toBeDefined();
      expect(resolveWorkspaceCommandSafetyPolicy(commandId), commandId).toBeDefined();
      expect(resolveDashboardCommandExecutionPlan(commandId).safetyPolicy, commandId).toBeDefined();
    }
  });

  it('does not allow workspace command safety policies to drift away from dashboard contracts', () => {
    for (const commandId of Object.keys(WORKSPACE_COMMAND_SAFETY_POLICIES)) {
      const contract = resolveDashboardCommandContract(commandId);
      const plan = resolveDashboardCommandExecutionPlan(commandId);

      expect(contract, commandId).toBeDefined();
      expect(contract?.requiresWorkspace, commandId).toBe(true);
      expect(plan.safetyPolicy?.commandId, commandId).toBe(commandId);
    }
  });

  it('resolves a host-side execution plan with contract, channel, and capability requirement', () => {
    expect(resolveDashboardCommandExecutionPlan('workspaceModel')).toMatchObject({
      commandId: 'workspaceModel',
      cliArgs: ['workspace', 'model', '--json', '--write'],
      executionChannel: 'background',
      isCliBacked: true,
      capabilityRequirement: {
        kind: 'workspace-subcommand',
        command: 'model',
        label: 'workspace model',
      },
    });

    expect(resolveDashboardCommandExecutionPlan('projectTest')).toMatchObject({
      commandId: 'projectTest',
      cliArgs: ['test'],
      executionChannel: 'terminal',
      isCliBacked: true,
      capabilityRequirement: {
        kind: 'project-runtime',
        command: 'test',
        label: 'test',
      },
    });

    expect(resolveDashboardCommandExecutionPlan('openSetup')).toMatchObject({
      commandId: 'openSetup',
      cliArgs: [],
      executionChannel: undefined,
      capabilityRequirement: undefined,
      isCliBacked: false,
    });
  });

  it('keeps the webview command surface metadata-only while host plans carry execution truth', () => {
    for (const [commandId, meta] of Object.entries(DASHBOARD_COMMAND_SURFACE)) {
      expect(meta, commandId).not.toHaveProperty('cliArgs');
      expect(meta, commandId).not.toHaveProperty('executionChannel');
      expect(meta, commandId).not.toHaveProperty('capabilityRequirement');
    }

    const plan = resolveDashboardCommandExecutionPlan('workspaceVerify');
    expect(plan.cliArgs).toEqual(['workspace', 'verify', '--json']);
    expect(plan.executionChannel).toBe('background');
    expect(plan.capabilityRequirement).toMatchObject({
      kind: 'workspace-subcommand',
      command: 'verify',
    });
  });

  it('derives command capability requirements from dashboard cli args', () => {
    expect(
      resolveDashboardCommandCapabilityRequirement(
        resolveDashboardCommandContract('workspaceModel')
      )
    ).toMatchObject({ kind: 'workspace-subcommand', command: 'model' });
    expect(
      resolveDashboardCommandCapabilityRequirement(resolveDashboardCommandContract('projectTest'))
    ).toMatchObject({ kind: 'project-runtime', command: 'test' });
    expect(
      resolveDashboardCommandCapabilityRequirement(resolveDashboardCommandContract('moduleDiff'))
    ).toMatchObject({ kind: 'project-runtime', command: 'diff' });
    expect(
      resolveDashboardCommandCapabilityRequirement(
        resolveDashboardCommandContract('moduleCheckpoint')
      )
    ).toMatchObject({ kind: 'project-runtime', command: 'checkpoint' });
    expect(
      resolveDashboardCommandCapabilityRequirement(resolveDashboardCommandContract('importProject'))
    ).toMatchObject({ kind: 'top-level', command: 'import' });
    expect(
      resolveDashboardCommandCapabilityRequirement(resolveDashboardCommandContract('adoptProject'))
    ).toMatchObject({ kind: 'top-level', command: 'adopt' });
    expect(
      resolveDashboardCommandCapabilityRequirement(
        resolveDashboardCommandContract('workspaceShare')
      )
    ).toMatchObject({ kind: 'workspace-subcommand', command: 'share' });
    expect(
      resolveDashboardCommandCapabilityRequirement(
        resolveDashboardCommandContract('workspaceArchiveVerify')
      )
    ).toMatchObject({ kind: 'workspace-subcommand', command: 'archive' });
    expect(
      resolveDashboardCommandCapabilityRequirement(
        resolveDashboardCommandContract('workspaceRemediationPlan')
      )
    ).toMatchObject({ kind: 'workspace-subcommand', command: 'remediation-plan' });
    expect(
      resolveDashboardCommandCapabilityRequirement(
        resolveDashboardCommandContract('workspaceSnapshotList')
      )
    ).toMatchObject({ kind: 'top-level', command: 'snapshot' });
    expect(
      resolveDashboardCommandCapabilityRequirement(
        resolveDashboardCommandContract('workspaceRunStage')
      )
    ).toMatchObject({ kind: 'workspace-subcommand', command: 'run' });
    expect(
      resolveDashboardCommandCapabilityRequirement(
        resolveDashboardCommandContract('workspacePolicySet')
      )
    ).toMatchObject({ kind: 'workspace-subcommand', command: 'policy' });
    expect(
      resolveDashboardCommandCapabilityRequirement(
        resolveDashboardCommandContract('checkWorkspaceHealth')
      )
    ).toMatchObject({ kind: 'top-level', command: 'doctor' });
    expect(
      resolveDashboardCommandCapabilityRequirement(resolveDashboardCommandContract('openSetup'))
    ).toBeUndefined();
  });

  it('checks derived capability requirements against the npm command surface', () => {
    const surface: RuntimeCommandSurfaceSnapshot = {
      schemaVersion: 'rapidkit-command-capabilities-v1',
      cli: 'rapidkit-npm',
      version: '0.41.5',
      contracts: {},
      topLevelCommands: [
        'doctor',
        'workspace',
        'snapshot',
        'import',
        'adopt',
        'cache',
        'mirror',
        'infra',
      ],
      coreBackedCommands: [],
      projectScopedCommands: ['test'],
      workspaceSubcommands: ['model', 'verify', 'archive', 'share', 'run', 'policy'],
      workspaceIntelligenceSubcommands: ['model', 'verify'],
    };

    const modelRequirement = resolveDashboardCommandCapabilityRequirement(
      resolveDashboardCommandContract('workspaceModel')
    );
    const testRequirement = resolveDashboardCommandCapabilityRequirement(
      resolveDashboardCommandContract('projectTest')
    );
    const traceRequirement = resolveDashboardCommandCapabilityRequirement(
      resolveDashboardCommandContract('workspaceTrace')
    );
    const archiveRequirement = resolveDashboardCommandCapabilityRequirement(
      resolveDashboardCommandContract('workspaceArchiveDoctor')
    );
    const snapshotRequirement = resolveDashboardCommandCapabilityRequirement(
      resolveDashboardCommandContract('workspaceSnapshotRestore')
    );
    const runStageRequirement = resolveDashboardCommandCapabilityRequirement(
      resolveDashboardCommandContract('workspaceRunStage')
    );
    const policySetRequirement = resolveDashboardCommandCapabilityRequirement(
      resolveDashboardCommandContract('workspacePolicySet')
    );
    const cacheClearRequirement = resolveDashboardCommandCapabilityRequirement(
      resolveDashboardCommandContract('cacheClear')
    );
    const mirrorVerifyRequirement = resolveDashboardCommandCapabilityRequirement(
      resolveDashboardCommandContract('mirrorVerify')
    );
    const infraPlanRequirement = resolveDashboardCommandCapabilityRequirement(
      resolveDashboardCommandContract('infraPlan')
    );

    expect(
      modelRequirement && isDashboardCommandCapabilityAdvertised(surface, modelRequirement)
    ).toBe(true);
    expect(
      testRequirement && isDashboardCommandCapabilityAdvertised(surface, testRequirement)
    ).toBe(true);
    expect(
      traceRequirement && isDashboardCommandCapabilityAdvertised(surface, traceRequirement)
    ).toBe(false);
    expect(
      archiveRequirement && isDashboardCommandCapabilityAdvertised(surface, archiveRequirement)
    ).toBe(true);
    expect(
      snapshotRequirement && isDashboardCommandCapabilityAdvertised(surface, snapshotRequirement)
    ).toBe(true);
    expect(
      runStageRequirement && isDashboardCommandCapabilityAdvertised(surface, runStageRequirement)
    ).toBe(true);
    expect(
      policySetRequirement && isDashboardCommandCapabilityAdvertised(surface, policySetRequirement)
    ).toBe(true);
    expect(
      cacheClearRequirement &&
        isDashboardCommandCapabilityAdvertised(surface, cacheClearRequirement)
    ).toBe(true);
    expect(
      mirrorVerifyRequirement &&
        isDashboardCommandCapabilityAdvertised(surface, mirrorVerifyRequirement)
    ).toBe(true);
    expect(
      infraPlanRequirement && isDashboardCommandCapabilityAdvertised(surface, infraPlanRequirement)
    ).toBe(true);
  });
});

describe('preserveAllAgentConsumersForStudioRefresh', () => {
  it('widens a pinned --target to every agent consumer', () => {
    expect(
      preserveAllAgentConsumersForStudioRefresh([
        'workspace',
        'agent',
        'sync',
        '--target',
        'vscode',
        '--json',
      ])
    ).toEqual(['workspace', 'agent', 'sync', '--target', 'all', '--json']);
  });
});

describe('applyStudioGovernedCommandReuse', () => {
  it('rejects a second identical generation and caps the same blocker at two attempts', () => {
    const attempts = new Map();
    const generations = new Map();
    const first = applyStudioGovernedCommandReuse({
      commandId: 'workspaceIntelligenceChain',
      evidenceGeneration: 'gen-1',
      blockerSignature: 'blocker-a',
      attempts,
      generations,
    });
    expect(first.allow).toBe(true);
    const duplicate = applyStudioGovernedCommandReuse({
      commandId: 'workspaceIntelligenceChain',
      evidenceGeneration: 'gen-1',
      blockerSignature: 'blocker-a',
      attempts,
      generations,
    });
    expect(duplicate).toMatchObject({
      allow: false,
      error: expect.stringContaining('already ran against this evidence generation'),
    });
    const capped = applyStudioGovernedCommandReuse({
      commandId: 'workspaceIntelligenceChain',
      evidenceGeneration: 'gen-1',
      blockerSignature: 'blocker-a',
      attempts,
      generations,
    });
    expect(capped).toMatchObject({
      allow: false,
      error: expect.stringContaining('already ran twice for the same semantic blocker'),
    });
  });

  it('allows the same producer after evidence generation changes', () => {
    const attempts = new Map();
    const generations = new Map();
    expect(
      applyStudioGovernedCommandReuse({
        commandId: 'workspaceAgentSync',
        evidenceGeneration: 'gen-1',
        blockerSignature: 'blocker-a',
        attempts,
        generations,
      }).allow
    ).toBe(true);
    applyStudioGovernedCommandReuse({
      commandId: 'workspaceAgentSync',
      evidenceGeneration: 'gen-1',
      blockerSignature: 'blocker-a',
      attempts,
      generations,
    });
    expect(
      applyStudioGovernedCommandReuse({
        commandId: 'workspaceAgentSync',
        evidenceGeneration: 'gen-2',
        blockerSignature: 'blocker-a',
        attempts,
        generations,
      }).allow
    ).toBe(true);
  });
});

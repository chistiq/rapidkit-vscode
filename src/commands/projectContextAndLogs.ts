import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { CommandTelemetryTimeWindow, WorkspaceUsageTracker } from '../utils/workspaceUsageTracker';
import { openProjectFolder, copyProjectPath, deleteProject } from './projectContextMenu';

type ProjectNode = {
  path?: string;
  name?: string;
  type?: string;
  workspacePath?: string;
};

type ProjectCommandItem = {
  project?: {
    path?: unknown;
    name?: unknown;
    type?: unknown;
    workspacePath?: unknown;
  };
  projectPath?: unknown;
};

function asProjectCommandItem(item: unknown): ProjectCommandItem | undefined {
  if (!item || typeof item !== 'object') {
    return undefined;
  }
  return item as ProjectCommandItem;
}

function toNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function resolveProjectPath(item: unknown): string | undefined {
  const parsed = asProjectCommandItem(item);
  return toNonEmptyString(parsed?.project?.path) ?? toNonEmptyString(parsed?.projectPath);
}

function resolveProjectNode(item: unknown): ProjectNode | undefined {
  const parsed = asProjectCommandItem(item);
  const project = parsed?.project;
  if (!project || typeof project !== 'object') {
    return undefined;
  }

  return {
    path: toNonEmptyString(project.path),
    name: toNonEmptyString(project.name),
    type: toNonEmptyString(project.type),
    workspacePath: toNonEmptyString(project.workspacePath),
  };
}

export function registerProjectContextAndLogCommands(): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('workspai.openProjectFolder', async (item: unknown) => {
      const projectPath = resolveProjectPath(item);
      if (projectPath) {
        await openProjectFolder(projectPath);
      }
    }),

    vscode.commands.registerCommand('workspai.copyProjectPath', async (item: unknown) => {
      const projectPath = resolveProjectPath(item);
      if (projectPath) {
        await copyProjectPath(projectPath);
      }
    }),

    vscode.commands.registerCommand('workspai.deleteProject', async (item: unknown) => {
      const projectPath = resolveProjectPath(item);
      if (projectPath) {
        await deleteProject(projectPath);
      }
    }),

    vscode.commands.registerCommand('workspai.convertProjectToManaged', async (item: unknown) => {
      const project = resolveProjectNode(item);
      const projectPath = project?.path ?? resolveProjectPath(item);
      if (!projectPath) {
        vscode.window.showWarningMessage('Select a project first.');
        return;
      }

      const { adoptWithRapidkitCommand } = await import('./explorerFolderCommands.js');
      await adoptWithRapidkitCommand(projectPath, {
        workspacePath: project?.workspacePath,
        projectName: project?.name,
        projectType: project?.type,
      });
    }),

    vscode.commands.registerCommand(
      'workspai.openProjectDashboard',
      async (projectItem: unknown) => {
        const projectFromItem = resolveProjectNode(projectItem);
        const selectedProject = (await vscode.commands.executeCommand(
          'workspai.getSelectedProject'
        )) as { path?: string; name?: string; type?: string; workspacePath?: string } | null;
        const selectedWorkspace = (await vscode.commands.executeCommand(
          'workspai.getSelectedWorkspace'
        )) as { path?: string; name?: string } | null;

        const projectPath =
          (typeof projectFromItem?.path === 'string' && projectFromItem.path) ||
          (typeof selectedProject?.path === 'string' && selectedProject.path);
        const projectName =
          (typeof projectFromItem?.name === 'string' && projectFromItem.name) ||
          (typeof selectedProject?.name === 'string' && selectedProject.name) ||
          (projectPath ? path.basename(projectPath) : undefined);
        const projectType =
          (typeof projectFromItem?.type === 'string' && projectFromItem.type) ||
          (typeof selectedProject?.type === 'string' && selectedProject.type);

        if (!projectPath || !projectName) {
          vscode.window.showWarningMessage('Select a project first.');
          return;
        }

        const workspacePath =
          (typeof projectFromItem?.workspacePath === 'string' && projectFromItem.workspacePath) ||
          (typeof selectedProject?.workspacePath === 'string' && selectedProject.workspacePath) ||
          (typeof selectedWorkspace?.path === 'string' && selectedWorkspace.path);

        if (!workspacePath) {
          vscode.window.showWarningMessage('Select a workspace first.');
          return;
        }

        const projectPayload = {
          workspace: {
            path: workspacePath,
            name:
              (typeof selectedWorkspace?.name === 'string' && selectedWorkspace.name) ||
              path.basename(workspacePath),
          },
          project: {
            path: projectPath,
            name: projectName,
            type: projectType,
            workspacePath,
          },
        };

        await vscode.commands.executeCommand('workspai.selectProject', projectPayload);
        await vscode.commands.executeCommand('workspai.openDashboardSection', {
          ...projectPayload,
          section: 'console',
          source: 'project-context-menu',
        });
      }
    ),

    vscode.commands.registerCommand('workspai.showLogs', () => {
      Logger.getInstance().show();
    }),

    vscode.commands.registerCommand('workspai.closeLogs', () => {
      Logger.getInstance().hide();
    }),

    vscode.commands.registerCommand('workspai.clearLogs', () => {
      Logger.getInstance().clear();
    }),

    vscode.commands.registerCommand('workspai.showTelemetrySummary', async () => {
      const timeWindowPick = await vscode.window.showQuickPick(
        [
          {
            label: 'Last 24 hours',
            detail: 'Show telemetry events captured in the last day',
            value: 'last24h' as CommandTelemetryTimeWindow,
          },
          {
            label: 'Last 7 days',
            detail: 'Show telemetry events captured in the last week',
            value: 'last7d' as CommandTelemetryTimeWindow,
          },
          {
            label: 'All time',
            detail: 'Use the all-time command counters from workspace marker',
            value: 'all' as CommandTelemetryTimeWindow,
          },
        ],
        {
          title: 'Telemetry Time Window',
          placeHolder: 'Select telemetry time range',
          ignoreFocusOut: true,
        }
      );

      if (!timeWindowPick) {
        return;
      }

      const selectedWorkspace = (await vscode.commands.executeCommand(
        'workspai.getSelectedWorkspace'
      )) as { path?: string } | null;

      const summary = await WorkspaceUsageTracker.getInstance().getCommandTelemetrySummary(
        selectedWorkspace?.path,
        timeWindowPick.value
      );
      const gateStatus = await WorkspaceUsageTracker.getInstance().getStudioHardGateStatus(
        selectedWorkspace?.path,
        timeWindowPick.value
      );
      const predictionKpiStatus =
        await WorkspaceUsageTracker.getInstance().getStudioPredictionKpiStatus(
          selectedWorkspace?.path,
          timeWindowPick.value
        );
      const predictionPortfolioKpiStatus =
        await WorkspaceUsageTracker.getInstance().getStudioPredictionPortfolioKpiStatus(
          undefined,
          timeWindowPick.value
        );
      const repeatRateActorStatus =
        await WorkspaceUsageTracker.getInstance().getRepeatRateActorModelStatus(
          undefined,
          timeWindowPick.value
        );
      const architectureKpiStatus =
        await WorkspaceUsageTracker.getInstance().getArchitectureReasoningKpiStatus(
          selectedWorkspace?.path,
          timeWindowPick.value
        );
      const sandboxKpiStatus = await WorkspaceUsageTracker.getInstance().getSandboxKpiStatus(
        selectedWorkspace?.path,
        timeWindowPick.value
      );
      const rollbackKpiStatus =
        await WorkspaceUsageTracker.getInstance().getStudioRollbackKpiStatus(
          selectedWorkspace?.path,
          timeWindowPick.value
        );
      const stabilizationKpiStatus =
        await WorkspaceUsageTracker.getInstance().getStudioStabilizationKpiStatus(
          selectedWorkspace?.path,
          timeWindowPick.value
        );

      if (!summary) {
        vscode.window.showWarningMessage(
          'No telemetry summary available. Open a Workspai workspace and run a few AI commands first.'
        );
        return;
      }

      const topCommands = summary.commandUsage.slice(0, 10);
      const surfaceRows = summary.surfaceBreakdown.bySurface
        .filter((entry) => entry.count > 0)
        .map((entry) => `${entry.surface}: ${entry.count} (${entry.share}%)`)
        .join('\n');

      const actionVsAskLine =
        summary.surfaceBreakdown.actionVsAskShare === null
          ? 'Action vs Ask share: n/a'
          : `Action vs Ask share: ${summary.surfaceBreakdown.actionVsAskShare}% action ` +
            `(${summary.surfaceBreakdown.actionEvents} action / ${summary.surfaceBreakdown.askEvents} ask)`;

      const quickSummary = [
        `Workspace: ${summary.workspacePath}`,
        `Time window: ${summary.timeWindow}`,
        `Window start: ${summary.windowStartAt ?? 'n/a'}`,
        `Window end: ${summary.windowEndAt}`,
        `Total events: ${summary.totalEvents}`,
        `Last command: ${summary.lastCommand ?? 'n/a'}`,
        `Last command at: ${summary.lastCommandAt ?? 'n/a'}`,
        actionVsAskLine,
        `Studio hard-gate overall: ${gateStatus?.gates.overallPass ? 'PASS' : 'FAIL'}`,
        `Studio verify-phase reach: ${gateStatus?.metrics.verifyPhaseReach ?? 'n/a'}% ` +
          `(threshold: ${gateStatus?.thresholds.verifyPhaseReachMin ?? 'n/a'}%)`,
        `Studio bridge route completion: ${gateStatus?.metrics.bridgeRouteCompletionRate ?? 'n/a'}% ` +
          `(threshold: ${gateStatus?.thresholds.bridgeRouteCompletionMin ?? 'n/a'}%)`,
        `Predictive KPI overall: ${predictionKpiStatus?.gates.overallPass ? 'PASS' : 'FAIL'}`,
        `Predictive precision: ${predictionKpiStatus?.metrics.predictivePrecision ?? 'n/a'}% ` +
          `(threshold: ${predictionKpiStatus?.thresholds.predictivePrecisionMin ?? 'n/a'}%)`,
        `Predictive false alarm rate: ${predictionKpiStatus?.metrics.falseAlarmRate ?? 'n/a'}% ` +
          `(threshold: <=${predictionKpiStatus?.thresholds.falseAlarmRateMax ?? 'n/a'}%)`,
        `Prevented incident rate: ${predictionKpiStatus?.metrics.preventedIncidentRate ?? 'n/a'}% ` +
          `(threshold: ${predictionKpiStatus?.thresholds.preventedIncidentRateMin ?? 'n/a'}%)`,
        `Predictive portfolio overall: ${
          predictionPortfolioKpiStatus?.gates.overallPass ? 'PASS' : 'FAIL'
        }`,
        `Predictive portfolio workspaces: ${
          predictionPortfolioKpiStatus?.telemetryWorkspaceCount ?? 'n/a'
        }/${predictionPortfolioKpiStatus?.evaluatedWorkspaceCount ?? 'n/a'} with telemetry`,
        `Predictive portfolio privacy: ${
          predictionPortfolioKpiStatus?.privacy.actorModel ?? 'n/a'
        }, actor id present: ${predictionPortfolioKpiStatus?.privacy.actorIdPresent ?? 'n/a'}`,
        `Repeat actor rate: ${repeatRateActorStatus?.repeatRate ?? 'n/a'}% ` +
          `(${repeatRateActorStatus?.repeatActorCount ?? 'n/a'} repeat / ${
            repeatRateActorStatus?.activeActorCount ?? 'n/a'
          } active)`,
        `Repeat actor privacy: ${
          repeatRateActorStatus?.privacy.actorModel ?? 'n/a'
        }, raw user id present: ${repeatRateActorStatus?.privacy.rawUserIdPresent ?? 'n/a'}`,
        `Architecture KPI overall: ${architectureKpiStatus?.gates.overallPass ? 'PASS' : 'FAIL'}`,
        `Architecture breakage prevented rate: ${
          architectureKpiStatus?.metrics.architectureBreakagePreventedRate ?? 'n/a'
        }% ` +
          `(threshold: ${
            architectureKpiStatus?.thresholds.architectureBreakagePreventedRateMin ?? 'n/a'
          }%)`,
        `Sandbox KPI overall: ${sandboxKpiStatus?.gates.overallPass ? 'PASS' : 'FAIL'}`,
        `Sandbox simulation pass rate: ${
          sandboxKpiStatus?.metrics.sandboxSimulationPassRate ?? 'n/a'
        }% ` +
          `(threshold: ${sandboxKpiStatus?.thresholds.sandboxSimulationPassRateMin ?? 'n/a'}%)`,
        `Unsafe apply escape rate: ${sandboxKpiStatus?.metrics.unsafeApplyEscapeRate ?? 'n/a'}% ` +
          `(threshold: <=${sandboxKpiStatus?.thresholds.unsafeApplyEscapeRateMax ?? 'n/a'}%)`,
        `Rollback KPI overall: ${rollbackKpiStatus?.gates.overallPass ? 'PASS' : 'FAIL'}`,
        `Rollback auto success rate: ${rollbackKpiStatus?.metrics.verifyAutoRollbackSuccessRate ?? 'n/a'}% ` +
          `(threshold: ${rollbackKpiStatus?.thresholds.verifyAutoRollbackSuccessRateMin ?? 'n/a'}%)`,
        `Rollback false-confidence rate: ${rollbackKpiStatus?.metrics.falseConfidenceRate ?? 'n/a'}% ` +
          `(threshold: <=${rollbackKpiStatus?.thresholds.falseConfidenceRateMax ?? 'n/a'}%)`,
        `Stabilization KPI overall (S01-S05): ${
          stabilizationKpiStatus?.gates.overallPass ? 'PASS' : 'FAIL'
        }`,
        `S01 route precision: ${stabilizationKpiStatus?.metrics.routePrecision ?? 'n/a'}% ` +
          `(threshold: ${stabilizationKpiStatus?.thresholds.routePrecisionMin ?? 'n/a'}%)`,
        `S02 verify path completion: ${
          stabilizationKpiStatus?.metrics.verifyPathCompletionRate ?? 'n/a'
        }% ` +
          `(threshold: ${
            stabilizationKpiStatus?.thresholds.verifyPathCompletionRateMin ?? 'n/a'
          }%)`,
        `S03 false-confidence rate: ${
          stabilizationKpiStatus?.metrics.falseConfidenceRate ?? 'n/a'
        }% ` +
          `(threshold: <=${stabilizationKpiStatus?.thresholds.falseConfidenceRateMax ?? 'n/a'}%)`,
        `S04 rollback recovery success: ${
          stabilizationKpiStatus?.metrics.rollbackRecoverySuccessRate ?? 'n/a'
        }% ` +
          `(threshold: ${
            stabilizationKpiStatus?.thresholds.rollbackRecoverySuccessRateMin ?? 'n/a'
          }%)`,
        `S05 repeat verified resolution: ${
          stabilizationKpiStatus?.metrics.repeatVerifiedResolutionRate ?? 'n/a'
        }% ` +
          `(threshold: ${
            stabilizationKpiStatus?.thresholds.repeatVerifiedResolutionRateMin ?? 'n/a'
          }%)`,
        `Surface mix:\n${surfaceRows || 'n/a'}`,
      ].join('\n');

      const payload = {
        ...summary,
        topCommands,
        studioHardGateStatus: gateStatus,
        studioPredictionKpiStatus: predictionKpiStatus,
        studioPredictionPortfolioKpiStatus: predictionPortfolioKpiStatus,
        repeatRateActorStatus,
        architectureReasoningKpiStatus: architectureKpiStatus,
        sandboxKpiStatus,
        studioRollbackKpiStatus: rollbackKpiStatus,
        studioStabilizationKpiStatus: stabilizationKpiStatus,
      };

      const doc = await vscode.workspace.openTextDocument({
        language: 'json',
        content: JSON.stringify(payload, null, 2),
      });
      await vscode.window.showTextDocument(doc, { preview: false });

      const action = await vscode.window.showInformationMessage(
        `Telemetry summary opened (${summary.timeWindow}). Total events: ${summary.totalEvents}. ` +
          `Studio gates: ${gateStatus?.gates.overallPass ? 'PASS' : 'FAIL'}`,
        'Copy quick summary',
        'Open workspace marker',
        'Reset telemetry'
      );

      if (action === 'Copy quick summary') {
        await vscode.env.clipboard.writeText(quickSummary);
        vscode.window.showInformationMessage('Telemetry quick summary copied.');
      }

      if (action === 'Open workspace marker') {
        const markerPath = vscode.Uri.file(`${summary.workspacePath}/.rapidkit-workspace`);
        try {
          const markerDoc = await vscode.workspace.openTextDocument(markerPath);
          await vscode.window.showTextDocument(markerDoc, { preview: false });
        } catch {
          vscode.window.showWarningMessage('Workspace marker not found for this workspace.');
        }
      }

      if (action === 'Reset telemetry') {
        await vscode.commands.executeCommand('workspai.resetTelemetry');
      }
    }),

    vscode.commands.registerCommand('workspai.showOnboardingExperimentStats', async () => {
      const timeWindowPick = await vscode.window.showQuickPick(
        [
          {
            label: 'Last 24 hours',
            detail: 'Analyze onboarding experiment events from the last day',
            value: 'last24h' as CommandTelemetryTimeWindow,
          },
          {
            label: 'Last 7 days',
            detail: 'Analyze onboarding experiment events from the last week',
            value: 'last7d' as CommandTelemetryTimeWindow,
          },
          {
            label: 'All time',
            detail: 'Analyze all tracked onboarding experiment events',
            value: 'all' as CommandTelemetryTimeWindow,
          },
        ],
        {
          title: 'Onboarding Experiment Time Window',
          placeHolder: 'Select analysis range',
          ignoreFocusOut: true,
        }
      );

      if (!timeWindowPick) {
        return;
      }

      const selectedWorkspace = (await vscode.commands.executeCommand(
        'workspai.getSelectedWorkspace'
      )) as { path?: string } | null;

      const stats = await WorkspaceUsageTracker.getInstance().getOnboardingExperimentStats(
        selectedWorkspace?.path,
        timeWindowPick.value
      );

      if (!stats) {
        vscode.window.showWarningMessage(
          'No onboarding experiment stats available. Open a Workspai workspace and trigger onboarding flows first.'
        );
        return;
      }

      const variantSummary =
        stats.variants.length > 0
          ? stats.variants
              .map(
                (item) =>
                  `${item.variant}: shown=${item.shown}, clicked=${item.clicked}, ctr=${item.clickThroughRate}%`
              )
              .join('\n')
          : 'n/a';

      const controlVariant = stats.variants.find((item) => item.variant === 'control');
      const compactVariant = stats.variants.find((item) => item.variant === 'compact');
      let ctrInsight = 'CTR comparison: not enough data yet.';
      let upliftLevelInsight = 'Uplift level: neutral (insufficient paired variant data).';

      if (controlVariant && compactVariant) {
        const delta = Number(
          (compactVariant.clickThroughRate - controlVariant.clickThroughRate).toFixed(2)
        );
        const absDelta = Math.abs(delta);
        const minShownAcrossVariants = Math.min(controlVariant.shown, compactVariant.shown);
        const deltaLabel = `${delta >= 0 ? '+' : ''}${delta}`;
        const winner = delta > 0 ? 'compact' : delta < 0 ? 'control' : 'tie';

        ctrInsight =
          winner === 'tie'
            ? `CTR comparison: control ${controlVariant.clickThroughRate}% vs compact ${compactVariant.clickThroughRate}% (tie).`
            : `CTR comparison: control ${controlVariant.clickThroughRate}% vs compact ${compactVariant.clickThroughRate}% (${deltaLabel}pp for ${winner}).`;

        if (winner === 'tie' || absDelta < 1) {
          upliftLevelInsight = `Uplift level: neutral (${absDelta.toFixed(2)}pp delta).`;
        } else if (absDelta >= 4 && minShownAcrossVariants >= 50) {
          upliftLevelInsight = `Uplift level: strong uplift for ${winner} (${deltaLabel}pp, robust sample).`;
        } else {
          const sampleNote =
            minShownAcrossVariants >= 20 ? 'directional confidence' : 'early sample confidence';
          upliftLevelInsight = `Uplift level: weak uplift for ${winner} (${deltaLabel}pp, ${sampleNote}).`;
        }
      }

      const quickSummary = [
        `Workspace: ${stats.workspacePath}`,
        `Time window: ${stats.timeWindow}`,
        `Window start: ${stats.windowStartAt ?? 'n/a'}`,
        `Window end: ${stats.windowEndAt}`,
        `Primary shown: ${stats.primaryShown}`,
        `Followup shown: ${stats.followupShown}`,
        `Followup clicked: ${stats.followupClicked}`,
        `Followup dismissed: ${stats.followupDismissed}`,
        `Overall followup CTR: ${stats.overallFollowupClickThroughRate}%`,
        ctrInsight,
        upliftLevelInsight,
        `Variants:\n${variantSummary}`,
      ].join('\n');

      const doc = await vscode.workspace.openTextDocument({
        language: 'json',
        content: JSON.stringify(stats, null, 2),
      });
      await vscode.window.showTextDocument(doc, { preview: false });

      const action = await vscode.window.showInformationMessage(
        `Onboarding experiment stats opened (${stats.timeWindow}). ${upliftLevelInsight}`,
        'Copy quick summary',
        'Open telemetry summary'
      );

      if (action === 'Copy quick summary') {
        await vscode.env.clipboard.writeText(quickSummary);
        vscode.window.showInformationMessage('Onboarding experiment quick summary copied.');
      }

      if (action === 'Open telemetry summary') {
        await vscode.commands.executeCommand('workspai.showTelemetrySummary');
      }
    }),

    vscode.commands.registerCommand('workspai.resetTelemetry', async () => {
      const selectedWorkspace = (await vscode.commands.executeCommand(
        'workspai.getSelectedWorkspace'
      )) as { path?: string; name?: string } | null;

      const workspacePath = selectedWorkspace?.path;
      const workspaceLabel = selectedWorkspace?.name ?? workspacePath ?? 'current workspace';

      const confirm = await vscode.window.showWarningMessage(
        `Reset Workspai telemetry for ${workspaceLabel}?`,
        { modal: true },
        'Reset'
      );

      if (confirm !== 'Reset') {
        return;
      }

      const ok = await WorkspaceUsageTracker.getInstance().clearCommandTelemetry(workspacePath);
      if (!ok) {
        vscode.window.showWarningMessage('Could not reset telemetry (no workspace marker found).');
        return;
      }

      vscode.window.showInformationMessage('Workspai telemetry reset for this workspace.');
    }),
  ];
}

import type { IncidentStudioTelemetryGateSlice } from './incidentStudioPolicyGateMapper';

export type ReleaseReadinessValidationKpiView = {
  timeWindow: string;
  overallPass: boolean;
  artifactsExported: number;
  decisionAccuracy: number | null;
  noGoPreventedRate: number | null;
  summaryLabel: string;
};

export type ReproPackKpiView = {
  timeWindow: string;
  overallPass: boolean;
  reproPackExported: number;
  shareRate: number | null;
  replayToResolutionRate: number | null;
  summaryLabel: string;
};

export type CommandTelemetryView = {
  totalEvents: number;
  lastCommand: string | null;
  lastCommandAt: string | null;
  actionEvents: number;
  askEvents: number;
  actionVsAskShare: number | null;
  topCommands: Array<{ command: string; count: number }>;
  summaryLabel: string;
};

export type EnterpriseObservabilityView = {
  releaseReadiness: ReleaseReadinessValidationKpiView | null;
  reproPack: ReproPackKpiView | null;
  commandTelemetry: CommandTelemetryView | null;
};

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A';
  }
  return `${Math.round(value)}%`;
}

export function deriveEnterpriseObservabilityView(
  telemetry?: IncidentStudioTelemetryGateSlice | null
): EnterpriseObservabilityView {
  const releaseKpi = telemetry?.releaseReadinessValidationKpiStatus ?? null;
  const reproKpi = telemetry?.studioReproPackKpiStatus ?? null;
  const commandSummary = telemetry?.commandSummary ?? null;

  const releaseReadiness: ReleaseReadinessValidationKpiView | null = releaseKpi
    ? {
        timeWindow: releaseKpi.timeWindow ?? 'unknown',
        overallPass: releaseKpi.gates?.overallPass === true,
        artifactsExported: releaseKpi.metrics?.releaseReadinessArtifactsExported ?? 0,
        decisionAccuracy: releaseKpi.metrics?.releaseReadinessDecisionAccuracy ?? null,
        noGoPreventedRate: releaseKpi.metrics?.noGoPreventedIncidentRate ?? null,
        summaryLabel: releaseKpi.gates?.overallPass ? 'PASS' : 'HOLD',
      }
    : null;

  const reproPack: ReproPackKpiView | null = reproKpi
    ? {
        timeWindow: reproKpi.timeWindow ?? 'unknown',
        overallPass: reproKpi.gates?.overallPass === true,
        reproPackExported: reproKpi.metrics?.reproPackExported ?? 0,
        shareRate: reproKpi.metrics?.reproPackShareRate ?? null,
        replayToResolutionRate: reproKpi.metrics?.replayToResolutionRate ?? null,
        summaryLabel: reproKpi.gates?.overallPass ? 'PASS' : 'HOLD',
      }
    : null;

  const commandTelemetry: CommandTelemetryView | null = commandSummary
    ? {
        totalEvents: commandSummary.totalEvents ?? 0,
        lastCommand: commandSummary.lastCommand ?? null,
        lastCommandAt: commandSummary.lastCommandAt ?? null,
        actionEvents: commandSummary.surfaceBreakdown?.actionEvents ?? 0,
        askEvents: commandSummary.surfaceBreakdown?.askEvents ?? 0,
        actionVsAskShare: commandSummary.surfaceBreakdown?.actionVsAskShare ?? null,
        topCommands: (commandSummary.commandUsage ?? []).slice(0, 4),
        summaryLabel:
          commandSummary.totalEvents && commandSummary.totalEvents > 0
            ? `${commandSummary.totalEvents} events`
            : 'No commands yet',
      }
    : null;

  return { releaseReadiness, reproPack, commandTelemetry };
}

export { formatPercent as formatObservabilityPercent };

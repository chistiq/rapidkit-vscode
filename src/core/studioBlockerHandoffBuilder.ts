import type * as vscode from 'vscode';

import type { DashboardEvidenceCard } from './dashboardEvidenceBridge.js';
import { readWorkspaceVerifyReport } from './workspaceVerifyReader.js';
import { requireStudioCardRepairCapability } from '../contracts/studioCardRepairCapabilities.js';
import {
  buildStudioIncidentSummary,
  STUDIO_BLOCKER_HANDOFF_SCHEMA_VERSION,
  type StudioBlockerHandoff,
  type StudioBlockerHandoffSource,
} from '../contracts/studio-blocker-handoff-contract.js';
import { computeBlockerSignature } from '../contracts/blocker-resolution-contract.js';
import { buildResolutionHintsForBlockingReasons } from './studioBlockerResolutionHints.js';
import { resolveBlockerResolutionClass } from './studioBlockerResolution.js';
import { readStudioBlockerCommandRunCount } from './studioBlockerCommandLedger.js';
import { resolveStudioFixActionForHandoff } from './studioBlockerFixRouting.js';
import { resolveDashboardCommandExecutionPlan } from './dashboardCommandExecutionPlan.js';
import { resolveDashboardCommandForEvidenceCard } from './dashboardReportRegistry.js';
import { buildStudioSourceCommandForCard, CARD_SOURCE_SHELL } from './studioCardSourceShell.js';

export { CARD_SOURCE_SHELL, buildStudioSourceCommandForCard };

export type BuildStudioBlockerHandoffInput = {
  card: Pick<
    DashboardEvidenceCard,
    | 'id'
    | 'label'
    | 'status'
    | 'blocking'
    | 'scope'
    | 'artifactPath'
    | 'blockers'
    | 'affectedProjectNames'
  >;
  workspacePath: string;
  projectPath?: string;
  handoffSource?: StudioBlockerHandoffSource;
  extensionContext?: vscode.ExtensionContext;
};

export async function buildStudioBlockerHandoff(
  input: BuildStudioBlockerHandoffInput
): Promise<StudioBlockerHandoff> {
  const blockers = (input.card.blockers ?? []).map((entry) => entry.trim()).filter(Boolean);
  const affectedProjectNames = [
    ...new Set(
      (input.card.affectedProjectNames ?? []).map((entry) => entry.trim()).filter(Boolean)
    ),
  ];
  const dashboardCommandId = resolveDashboardCommandForEvidenceCard(input.card.id);
  const executionPlan = dashboardCommandId
    ? resolveDashboardCommandExecutionPlan(dashboardCommandId)
    : undefined;
  const sourceCommand = buildStudioSourceCommandForCard(input.card.id);
  const repairCapability = requireStudioCardRepairCapability(input.card.id);
  const verifyCommand = repairCapability.verifyCommand;
  const verifyArtifact = repairCapability.verifyArtifact;

  let resolutionHints = buildResolutionHintsForBlockingReasons({
    blockingReasons: blockers.length > 0 ? blockers : [`${input.card.id}: blocked`],
    sourceCommand,
    sourceArtifact: input.card.artifactPath,
    verifyCommand,
    verifyArtifact,
  });

  if (input.card.id === 'workspaceVerify') {
    const verifyReport = await readWorkspaceVerifyReport(input.workspacePath);
    if (verifyReport?.resolutionHints?.length) {
      resolutionHints = verifyReport.resolutionHints;
    } else if (verifyReport?.blockingReasons?.length) {
      resolutionHints = buildResolutionHintsForBlockingReasons({
        blockingReasons: verifyReport.blockingReasons,
        sourceCommand,
        sourceArtifact: input.card.artifactPath,
        verifyCommand,
        verifyArtifact,
      });
    }
  }

  const blockerSignature = computeBlockerSignature({
    blockers,
    ...(affectedProjectNames.length ? { affectedProjectNames } : {}),
    exitCode: null,
  });
  const commandRunCount =
    input.extensionContext != null
      ? readStudioBlockerCommandRunCount(input.extensionContext, {
          cardId: input.card.id,
          sourceCommand,
          blockerSignature,
        })
      : 0;

  const handoff: StudioBlockerHandoff = {
    schemaVersion: STUDIO_BLOCKER_HANDOFF_SCHEMA_VERSION,
    cardId: input.card.id,
    cardLabel: input.card.label,
    cardStatus: input.card.status,
    ...(input.card.blocking !== undefined && input.card.blocking !== null
      ? { blocking: input.card.blocking }
      : {}),
    blockers,
    artifactPath: input.card.artifactPath ?? '',
    sourceCommand,
    ...(dashboardCommandId ? { dashboardCommandId } : {}),
    ...(executionPlan?.executionChannel
      ? { executionChannel: executionPlan.executionChannel }
      : {}),
    ...(executionPlan?.capabilityRequirement
      ? { capabilityGate: executionPlan.capabilityRequirement.label }
      : {}),
    ...(executionPlan?.safetyPolicy
      ? {
          safetyRisk: executionPlan.safetyPolicy.risk,
          ...(executionPlan.safetyPolicy.confirmation
            ? { safetyConfirmation: executionPlan.safetyPolicy.confirmation.confirmLabel }
            : {}),
          ...(executionPlan.safetyPolicy.refreshCommands?.length
            ? {
                safetyRefreshCommands: executionPlan.safetyPolicy.refreshCommands.map(
                  (command) => `npx workspai ${command.join(' ')}`
                ),
              }
            : {}),
        }
      : {}),
    scope: input.card.scope,
    ...(affectedProjectNames.length ? { affectedProjectNames } : {}),
    blockerSignature,
    commandRunCount,
    resolutionHints,
    resolutionClass: resolutionHints[0]?.resolutionClass,
    verifyCommand,
    verifyArtifact,
    handoffSource: input.handoffSource ?? 'dashboard',
    workspacePath: input.workspacePath,
    ...(input.card.scope === 'project' && input.projectPath
      ? { projectPath: input.projectPath }
      : {}),
  };

  handoff.studioMode = resolveBlockerResolutionClass({
    handoff,
    onDiskHints: resolutionHints,
  });
  handoff.incidentSummary = buildStudioIncidentSummary({
    cardId: handoff.cardId,
    cardLabel: handoff.cardLabel,
    cardStatus: handoff.cardStatus,
    studioMode: handoff.studioMode,
    verifyCommand: handoff.verifyCommand,
    auditStatus: 'not-started',
  });

  return handoff;
}

export function pickStudioFixActionId(
  handoff: StudioBlockerHandoff
): ReturnType<typeof resolveStudioFixActionForHandoff> {
  return resolveStudioFixActionForHandoff(handoff);
}

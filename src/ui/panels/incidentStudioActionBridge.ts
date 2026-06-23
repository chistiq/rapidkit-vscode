import * as vscode from 'vscode';

import {
  loadAnalyzeReport,
  runWorkspaceAnalyze,
  type AnalyzeReport,
  type WorkspaceContext,
} from './incidentStudioAnalyze';
import { readAIActionRegistry } from '../../core/aiActionRegistry';
import type { StudioActionId } from '../../core/studioActionCommands';
import { readWorkspaceImpactReport } from '../../core/workspaceImpactReader';
import { readAutopilotReleaseSnapshot } from '../../core/incidentStudioReleaseArtifacts';
import { readWorkspaceVerifyReport } from '../../core/workspaceVerifyReader';
import { resolveIncidentStudioTelemetry } from './incidentStudioTelemetryBridge';
import { runIncidentInlineCommand } from './incidentStudioInlineCommandBridge';
import {
  evaluatePolicyGateEnforcementFromTelemetry,
  resolvePolicyGateBlockedReasonsFromTelemetry,
} from './incidentStudioPolicyGateMapper';
import type { IncidentStudioExecutionTranscript } from './incidentStudioSessionPersistenceBridge';

export type StudioActionExecutionResult = {
  summary: string;
  verdict?: AnalyzeReport['summary']['verdict'];
  score?: number;
  generatedAt?: string;
  evidencePath?: string;
  gateCommand?: string;
  gatePassed?: boolean;
  telemetryGatePassed?: boolean;
  verifyArtifactPassed?: boolean;
  findings?: AnalyzeReport['summary']['findings'];
  executionTranscript?: IncidentStudioExecutionTranscript;
};

export async function executeVerifyGatesAction(
  context: vscode.ExtensionContext,
  workspace: WorkspaceContext
): Promise<StudioActionExecutionResult> {
  const { report, error } = loadAnalyzeReport(workspace);
  if (!report) {
    throw new Error(
      error || 'Analyze report is missing. Run workspace analyze before verifying gates.'
    );
  }

  const gateCommand =
    report.enterpriseControls?.releaseGateCommand?.trim() ||
    report.enterpriseControls?.ciGateCommand?.trim();

  let gateResult:
    | {
        success: boolean;
        error?: string;
        executionTranscript?: IncidentStudioExecutionTranscript;
      }
    | undefined;

  if (gateCommand) {
    gateResult = await runIncidentInlineCommand({
      command: gateCommand,
      workspacePath: workspace.workspacePath,
      actionId: 'verify-gates',
    });
  }

  const verifyReport = await readWorkspaceVerifyReport(workspace.workspacePath);
  const verifyBlockingReasons = verifyReport?.blockingReasons ?? [];
  const verifyVerdict =
    typeof verifyReport?.summary?.verdict === 'string'
      ? verifyReport.summary.verdict.trim().toLowerCase()
      : undefined;
  const verifyArtifactPassed =
    !verifyReport ||
    verifyVerdict === 'pass' ||
    verifyVerdict === 'go' ||
    (verifyVerdict === 'warn' && verifyBlockingReasons.length === 0) ||
    ((verifyReport.summary?.stepsPassed ?? 0) > 0 && verifyBlockingReasons.length === 0);

  const telemetry = await resolveIncidentStudioTelemetry({
    context,
    workspacePath: workspace.workspacePath,
    forceRefresh: true,
  });
  const autopilotSnapshot = await readAutopilotReleaseSnapshot(workspace.workspacePath);
  const gateCommandArtifactPass =
    !gateCommand || gateResult?.success === true || autopilotSnapshot?.approved === true;
  const policyEnforcement = evaluatePolicyGateEnforcementFromTelemetry(telemetry);
  const telemetryGatePassed = policyEnforcement.canCompleteVerify;
  const blockedReasons = resolvePolicyGateBlockedReasonsFromTelemetry(telemetry);
  const studioLearningReasons = blockedReasons.filter((reason) =>
    /bridge route completion|verify-path completion|verify phase reach|route precision|false-confidence|rollback|unrecovered verification|command_failed|verify evidence completion|enterprise stabilization|expansion frozen/i.test(
      reason
    )
  );
  const releaseBlockingReasons = blockedReasons.filter(
    (reason) => !studioLearningReasons.includes(reason)
  );

  const artifactReleaseReady = verifyArtifactPassed && autopilotSnapshot?.approved === true;
  const gatePassed =
    verifyArtifactPassed &&
    gateCommandArtifactPass &&
    (artifactReleaseReady || (telemetryGatePassed && releaseBlockingReasons.length === 0));

  const summaryParts = [
    gateCommand
      ? gateCommandArtifactPass
        ? `Gate command passed (artifact-backed): ${gateCommand}`
        : `Gate command failed: ${gateCommand}`
      : 'No gate command in analyze report; evaluated workspace verify artifacts.',
    verifyReport
      ? verifyArtifactPassed
        ? `Workspace verify artifact: PASS (${verifyReport.summary?.stepsPassed ?? 0} step(s) passed)`
        : `Workspace verify artifact: BLOCKED (${verifyBlockingReasons.slice(0, 2).join('; ') || verifyVerdict || 'needs attention'})`
      : 'Workspace verify artifact missing; run workspace verify --from-impact before claiming release gates.',
    autopilotSnapshot?.approved
      ? 'Autopilot release artifact: APPROVED'
      : autopilotSnapshot
        ? `Autopilot release artifact: ${autopilotSnapshot.verdict ?? 'pending'}`
        : 'Autopilot release artifact: not found',
    `Telemetry policy gates: ${telemetryGatePassed ? 'PASS' : 'BLOCKED'}`,
    artifactReleaseReady
      ? 'Workspace release: APPROVED (artifact authority)'
      : telemetryGatePassed
        ? 'Studio operator path: PASS'
        : studioLearningReasons.length > 0
          ? `Studio operator path (learning, non-blocking): ${studioLearningReasons.slice(0, 2).join('; ')}`
          : releaseBlockingReasons.length > 0
            ? `Release blockers: ${releaseBlockingReasons.slice(0, 2).join('; ')}`
            : 'Studio operator path: needs attention',
    `Analyze verdict ${report.summary.verdict} · score ${report.summary.score}`,
  ];

  return {
    summary: summaryParts.join('\n'),
    verdict: report.summary.verdict,
    score: report.summary.score,
    generatedAt: report.generatedAt,
    evidencePath: report.enterpriseControls?.evidencePath,
    gateCommand,
    gatePassed,
    telemetryGatePassed,
    verifyArtifactPassed,
    findings: report.summary.findings,
    executionTranscript: gateResult?.executionTranscript
      ? {
          ...gateResult.executionTranscript,
          actionId: 'verify-gates',
          title: 'Verify gates',
          source: 'studio-action',
          evidencePath: report.enterpriseControls?.evidencePath,
        }
      : undefined,
  };
}

export async function executeStudioActionById(
  context: vscode.ExtensionContext,
  workspace: WorkspaceContext,
  actionId: StudioActionId,
  seed: Record<string, unknown>
): Promise<{ refreshedReport: AnalyzeReport | null; actionResult?: StudioActionExecutionResult }> {
  switch (actionId) {
    case 'run-analyze':
      await runWorkspaceAnalyze(workspace);
      return { refreshedReport: loadAnalyzeReport(workspace).report };
    case 'verify-gates': {
      const actionResult = await executeVerifyGatesAction(context, workspace);
      return {
        refreshedReport: loadAnalyzeReport(workspace).report,
        actionResult,
      };
    }
    case 'terminal-bridge':
      await vscode.commands.executeCommand('workspai.aiTerminalBridge', seed);
      return { refreshedReport: loadAnalyzeReport(workspace).report };
    case 'fix-lens':
      await vscode.commands.executeCommand('workspai.aiFixPreviewLite', seed);
      return { refreshedReport: loadAnalyzeReport(workspace).report };
    case 'install-module':
      // Embed/standalone webviews route this through ChatBrain apply-module-gen.
      return { refreshedReport: loadAnalyzeReport(workspace).report };
    case 'impact-lens': {
      await vscode.commands.executeCommand('workspai.workspaceImpactLens', {
        workspace: {
          path: workspace.workspacePath,
          name: workspace.workspaceName,
        },
      });
      const impactReport = await readWorkspaceImpactReport(workspace.workspacePath);
      return {
        refreshedReport: loadAnalyzeReport(workspace).report,
        actionResult: {
          summary: impactReport
            ? `Workspace Advisor complete in evidence: risk ${impactReport.summary?.risk ?? 'unknown'}, ${impactReport.summary?.affectedProjects ?? 0} affected project(s).`
            : 'Workspace Advisor dispatched. Refresh Studio after the terminal run completes.',
        },
      };
    }
    default:
      actionId satisfies never;
      return { refreshedReport: loadAnalyzeReport(workspace).report };
  }
}

export async function readStudioActionRegistry(workspacePath: string) {
  return readAIActionRegistry(workspacePath);
}

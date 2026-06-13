import * as vscode from 'vscode';

import {
  loadAnalyzeReport,
  runWorkspaceAnalyze,
  type AnalyzeReport,
  type WorkspaceContext,
} from './incidentStudioAnalyze';
import { readAIActionRegistry } from '../../core/aiActionRegistry';
import { resolveIncidentStudioTelemetry } from './incidentStudioTelemetryBridge';
import { runIncidentInlineCommand } from './incidentStudioInlineCommandBridge';
import {
  evaluatePolicyGateEnforcementFromTelemetry,
  resolvePolicyGateBlockedReasonsFromTelemetry,
} from './incidentStudioPolicyGateMapper';

export type StudioActionExecutionResult = {
  summary: string;
  verdict?: AnalyzeReport['summary']['verdict'];
  score?: number;
  generatedAt?: string;
  evidencePath?: string;
  gateCommand?: string;
  gatePassed?: boolean;
  telemetryGatePassed?: boolean;
  findings?: AnalyzeReport['summary']['findings'];
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
      }
    | undefined;

  if (gateCommand) {
    gateResult = await runIncidentInlineCommand({
      command: gateCommand,
      workspacePath: workspace.workspacePath,
      actionId: 'verify-gates',
    });
  }

  const telemetry = await resolveIncidentStudioTelemetry({
    context,
    workspacePath: workspace.workspacePath,
    forceRefresh: true,
  });
  const policyEnforcement = evaluatePolicyGateEnforcementFromTelemetry(telemetry);
  const telemetryGatePassed = policyEnforcement.canCompleteVerify;
  const gatePassed = (gateCommand ? gateResult?.success === true : true) && telemetryGatePassed;
  const blockedReasons = resolvePolicyGateBlockedReasonsFromTelemetry(telemetry);

  const summaryParts = [
    gateCommand
      ? `Gate command ${gateResult?.success ? 'passed' : 'failed'}: ${gateCommand}`
      : 'No gate command in analyze report; evaluated telemetry hard gates only.',
    telemetryGatePassed
      ? 'Telemetry policy gates: PASS'
      : blockedReasons.length > 0
        ? `Telemetry policy gates: BLOCKED (${blockedReasons.slice(0, 2).join('; ')})`
        : 'Telemetry policy gates: needs attention',
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
    findings: report.summary.findings,
  };
}

export async function executeStudioActionById(
  context: vscode.ExtensionContext,
  workspace: WorkspaceContext,
  actionId: 'run-analyze' | 'verify-gates' | 'terminal-bridge' | 'fix-lens' | 'impact-lens',
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
    case 'impact-lens':
      await vscode.commands.executeCommand('workspai.aiChangeImpactLite', seed);
      return { refreshedReport: loadAnalyzeReport(workspace).report };
    default:
      actionId satisfies never;
      return { refreshedReport: loadAnalyzeReport(workspace).report };
  }
}

export async function readStudioActionRegistry(workspacePath: string) {
  return readAIActionRegistry(workspacePath);
}

import * as path from 'path';
import * as vscode from 'vscode';

import { createExtensionWebviewMessage } from '../../contracts/webviewProtocol';
import { buildVerifyPackOutputContract } from '../../core/verifyPackContract';
import { WorkspaceUsageTracker } from '../../utils/workspaceUsageTracker';
import { WORKSPAI_REPORTS_DIR } from '../../core/workspaceIntelligencePaths';

export type MessagePayload = Record<string, unknown>;

function postExportProgress(
  replyWebview: vscode.Webview | undefined,
  requestId: string | undefined,
  stage: string,
  note: string
): void {
  if (!replyWebview) {
    return;
  }

  replyWebview.postMessage(
    createExtensionWebviewMessage(
      'aiChatActionProgress',
      {
        stage,
        progress: 100,
        note,
      },
      { requestId, version: 'v1' }
    )
  );
}

function redactText(value: string | undefined): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    return value;
  }

  return value
    .replace(/(authorization\s*[:=]\s*)(bearer\s+)?[^\s\n\r"']+/gi, '$1[REDACTED]')
    .replace(/(token\s*[:=]\s*)[^\s\n\r"']+/gi, '$1[REDACTED]')
    .replace(/(password\s*[:=]\s*)[^\s\n\r"']+/gi, '$1[REDACTED]')
    .replace(/(api[_-]?key\s*[:=]\s*)[^\s\n\r"']+/gi, '$1[REDACTED]')
    .replace(/(secret\s*[:=]\s*)[^\s\n\r"']+/gi, '$1[REDACTED]');
}

export async function exportSandboxSimulationEvidenceFromPayload(
  _context: vscode.ExtensionContext,
  data: MessagePayload,
  requestId?: string,
  replyWebview?: vscode.Webview
): Promise<void> {
  const sandboxSimulation =
    data &&
    typeof data === 'object' &&
    data.sandboxSimulation &&
    typeof data.sandboxSimulation === 'object'
      ? (data.sandboxSimulation as {
          actionId?: string;
          workspacePath?: string;
          riskClass?:
            | 'informational'
            | 'non-mutating-executable'
            | 'guarded-mutating'
            | 'high-risk-mutating';
          mode?: 'verify-pack-simulation' | 'disposable-sandbox';
          status?: 'passed' | 'failed' | 'skipped';
          startedAt?: string;
          completedAt?: string;
          durationMs?: number;
          commandResults?: Array<{
            label?: string;
            command?: string;
            args?: string[];
            exitCode?: number;
            stdout?: string;
            stderr?: string;
            durationMs?: number;
          }>;
          recommendedRollbackPath?: string;
          safeToApply?: boolean;
          reason?: string;
        })
      : undefined;

  if (!sandboxSimulation?.actionId || !sandboxSimulation.workspacePath) {
    vscode.window.showWarningMessage('No sandbox simulation evidence is available to export.');
    return;
  }

  const workspacePathInput =
    typeof data?.workspacePath === 'string' && data.workspacePath.trim()
      ? data.workspacePath.trim()
      : sandboxSimulation.workspacePath;

  const defaultFileName = `${sandboxSimulation.actionId}-sandbox-simulation-evidence.json`;
  const defaultUri = vscode.Uri.file(
    path.join(workspacePathInput, WORKSPAI_REPORTS_DIR, defaultFileName)
  );

  const outputUri = await vscode.window.showSaveDialog({
    title: 'Export Sandbox Simulation Evidence',
    saveLabel: 'Export Evidence',
    defaultUri,
    filters: {
      JSON: ['json'],
    },
  });

  if (!outputUri) {
    return;
  }

  const redactedCommandResults = Array.isArray(sandboxSimulation.commandResults)
    ? sandboxSimulation.commandResults.map((result) => ({
        label: typeof result?.label === 'string' ? result.label : 'verify command',
        command: typeof result?.command === 'string' ? result.command : '',
        args: Array.isArray(result?.args)
          ? result.args.filter((arg): arg is string => typeof arg === 'string').slice(0, 12)
          : [],
        exitCode: typeof result?.exitCode === 'number' ? result.exitCode : -1,
        stdout: redactText(typeof result?.stdout === 'string' ? result.stdout.slice(0, 4000) : ''),
        stderr: redactText(typeof result?.stderr === 'string' ? result.stderr.slice(0, 4000) : ''),
        durationMs:
          typeof result?.durationMs === 'number' && Number.isFinite(result.durationMs)
            ? Math.max(0, Math.round(result.durationMs))
            : 0,
      }))
    : [];

  const exportPayload = {
    sandbox_simulation_evidence: {
      schemaVersion: 'v1',
      exportedAt: new Date().toISOString(),
      actionId: sandboxSimulation.actionId,
      workspacePath: workspacePathInput,
      riskClass: sandboxSimulation.riskClass || 'guarded-mutating',
      mode: sandboxSimulation.mode || 'verify-pack-simulation',
      status: sandboxSimulation.status || 'skipped',
      startedAt: sandboxSimulation.startedAt,
      completedAt: sandboxSimulation.completedAt,
      durationMs:
        typeof sandboxSimulation.durationMs === 'number' &&
        Number.isFinite(sandboxSimulation.durationMs)
          ? Math.max(0, Math.round(sandboxSimulation.durationMs))
          : 0,
      safeToApply: sandboxSimulation.safeToApply === true,
      reason: redactText(sandboxSimulation.reason),
      recommendedRollbackPath: redactText(sandboxSimulation.recommendedRollbackPath),
      commandResults: redactedCommandResults,
      summary: {
        commandCount: redactedCommandResults.length,
        failedCommandCount: redactedCommandResults.filter((entry) => entry.exitCode !== 0).length,
        redactionApplied: true,
      },
    },
  };

  const verifyPackContract = buildVerifyPackOutputContract({
    producer: 'sandbox-simulation',
    generatedAt:
      typeof sandboxSimulation.completedAt === 'string' && sandboxSimulation.completedAt.trim()
        ? sandboxSimulation.completedAt
        : new Date().toISOString(),
    commands: redactedCommandResults.map((result) => ({
      label: result.label,
      command: result.command,
      args: result.args,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
    })),
  });

  const verifyPackContractFileName = `${sandboxSimulation.actionId}-verify-pack-contract.json`;
  const verifyPackContractUri = vscode.Uri.file(
    path.join(path.dirname(outputUri.fsPath), verifyPackContractFileName)
  );

  await vscode.workspace.fs.writeFile(
    outputUri,
    Buffer.from(JSON.stringify(exportPayload, null, 2), 'utf8')
  );

  await vscode.workspace.fs.writeFile(
    verifyPackContractUri,
    Buffer.from(JSON.stringify(verifyPackContract, null, 2), 'utf8')
  );

  await WorkspaceUsageTracker.getInstance().trackCommandEvent(
    'workspai.studio.sandbox_simulation_evidence_exported',
    workspacePathInput,
    {
      actionId: sandboxSimulation.actionId,
      status: exportPayload.sandbox_simulation_evidence.status,
      verifyPackContractStatus: verifyPackContract.overallStatus,
      mode: exportPayload.sandbox_simulation_evidence.mode,
      safeToApply: exportPayload.sandbox_simulation_evidence.safeToApply,
      commandCount: exportPayload.sandbox_simulation_evidence.summary.commandCount,
      failedCommandCount: exportPayload.sandbox_simulation_evidence.summary.failedCommandCount,
    }
  );

  const gateCommand = `node scripts/release-stop-gate.mjs --verify-pack-contract "${verifyPackContractUri.fsPath}"`;
  const gateEnvForm = `WORKSPAI_VERIFY_PACK_CONTRACT_PATH="${verifyPackContractUri.fsPath}"`;
  const exportMessage = `Sandbox simulation evidence exported: ${outputUri.fsPath} (contract: ${verifyPackContractUri.fsPath})`;
  const selectedAction = await vscode.window.showInformationMessage(
    exportMessage,
    'Copy Contract Path',
    'Copy Gate Command',
    'Copy Env Form'
  );

  if (selectedAction === 'Copy Contract Path') {
    await vscode.env.clipboard.writeText(verifyPackContractUri.fsPath);
  } else if (selectedAction === 'Copy Gate Command') {
    await vscode.env.clipboard.writeText(gateCommand);
  } else if (selectedAction === 'Copy Env Form') {
    await vscode.env.clipboard.writeText(gateEnvForm);
  }

  postExportProgress(
    replyWebview,
    requestId,
    'simulation-exported',
    `Simulation evidence exported: ${path.basename(outputUri.fsPath)} | Contract: ${path.basename(verifyPackContractUri.fsPath)}`
  );
}

export async function exportReleaseReadinessCommanderFromPayload(
  _context: vscode.ExtensionContext,
  data: MessagePayload,
  requestId?: string,
  replyWebview?: vscode.Webview
): Promise<void> {
  const artifact =
    data &&
    typeof data === 'object' &&
    data.releaseReadinessCommander &&
    typeof data.releaseReadinessCommander === 'object'
      ? (data.releaseReadinessCommander as {
          artifactId?: string;
          schemaVersion?: 'v1';
          generatedAt?: string;
          workspacePath?: string;
          actionId?: string;
          decision?: 'go' | 'no-go';
          confidence?: number;
          blockingReasons?: string[];
          evidence?: {
            verifyPackContractStatus?: 'passed' | 'failed' | 'skipped' | 'unavailable';
            sandboxStatus?: 'passed' | 'failed' | 'skipped' | 'unavailable';
            doctorErrors?: number;
            doctorWarnings?: number;
            scopeKnown?: boolean;
            verifyPathPresent?: boolean;
            rollbackPathPresent?: boolean;
          };
          summary?: {
            goNoGoRationale?: string;
            recommendedNextStep?: string;
          };
        })
      : undefined;

  if (!artifact?.artifactId) {
    vscode.window.showWarningMessage(
      'No release readiness commander artifact is available to export.'
    );
    return;
  }

  const workspacePathInput =
    typeof data?.workspacePath === 'string' && data.workspacePath.trim()
      ? data.workspacePath.trim()
      : typeof artifact.workspacePath === 'string' && artifact.workspacePath.trim()
        ? artifact.workspacePath.trim()
        : undefined;

  const defaultFileName = `${artifact.artifactId}.json`;
  const defaultUri = workspacePathInput
    ? vscode.Uri.file(path.join(workspacePathInput, WORKSPAI_REPORTS_DIR, defaultFileName))
    : undefined;

  const outputUri = await vscode.window.showSaveDialog({
    title: 'Export Release Readiness Commander Artifact',
    saveLabel: 'Export Artifact',
    defaultUri,
    filters: {
      JSON: ['json'],
    },
  });

  if (!outputUri) {
    return;
  }

  const payload = {
    release_readiness_commander: {
      schemaVersion: 'v1',
      artifactId: artifact.artifactId,
      generatedAt:
        typeof artifact.generatedAt === 'string' && artifact.generatedAt.trim()
          ? artifact.generatedAt
          : new Date().toISOString(),
      workspacePath: workspacePathInput || '',
      actionId: artifact.actionId || 'unknown-action',
      decision: artifact.decision === 'go' ? 'go' : 'no-go',
      confidence:
        typeof artifact.confidence === 'number' && Number.isFinite(artifact.confidence)
          ? Math.max(0, Math.min(100, Math.round(artifact.confidence)))
          : 0,
      blockingReasons: Array.isArray(artifact.blockingReasons)
        ? artifact.blockingReasons
            .filter((item): item is string => typeof item === 'string')
            .slice(0, 20)
        : [],
      evidence: {
        verifyPackContractStatus:
          artifact.evidence?.verifyPackContractStatus === 'passed' ||
          artifact.evidence?.verifyPackContractStatus === 'failed' ||
          artifact.evidence?.verifyPackContractStatus === 'skipped' ||
          artifact.evidence?.verifyPackContractStatus === 'unavailable'
            ? artifact.evidence.verifyPackContractStatus
            : 'unavailable',
        sandboxStatus:
          artifact.evidence?.sandboxStatus === 'passed' ||
          artifact.evidence?.sandboxStatus === 'failed' ||
          artifact.evidence?.sandboxStatus === 'skipped' ||
          artifact.evidence?.sandboxStatus === 'unavailable'
            ? artifact.evidence.sandboxStatus
            : 'unavailable',
        doctorErrors:
          typeof artifact.evidence?.doctorErrors === 'number'
            ? Math.max(0, Math.floor(artifact.evidence.doctorErrors))
            : 0,
        doctorWarnings:
          typeof artifact.evidence?.doctorWarnings === 'number'
            ? Math.max(0, Math.floor(artifact.evidence.doctorWarnings))
            : 0,
        scopeKnown: artifact.evidence?.scopeKnown === true,
        verifyPathPresent: artifact.evidence?.verifyPathPresent === true,
        rollbackPathPresent: artifact.evidence?.rollbackPathPresent === true,
      },
      summary: {
        goNoGoRationale:
          typeof artifact.summary?.goNoGoRationale === 'string'
            ? artifact.summary.goNoGoRationale
            : 'Release readiness rationale unavailable.',
        recommendedNextStep:
          typeof artifact.summary?.recommendedNextStep === 'string'
            ? artifact.summary.recommendedNextStep
            : 'Resolve blockers and regenerate artifact.',
      },
    },
  };

  await vscode.workspace.fs.writeFile(
    outputUri,
    Buffer.from(JSON.stringify(payload, null, 2), 'utf8')
  );

  await WorkspaceUsageTracker.getInstance().trackCommandEvent(
    'workspai.studio.release_readiness_artifact_exported',
    workspacePathInput,
    {
      artifactId: payload.release_readiness_commander.artifactId,
      decision: payload.release_readiness_commander.decision,
      blockingReasonCount: payload.release_readiness_commander.blockingReasons.length,
    }
  );

  await WorkspaceUsageTracker.getInstance().trackCommandEvent(
    payload.release_readiness_commander.decision === 'go'
      ? 'workspai.studio.release_readiness_go_decision_exported'
      : 'workspai.studio.release_readiness_no_go_decision_exported',
    workspacePathInput,
    {
      artifactId: payload.release_readiness_commander.artifactId,
      decision: payload.release_readiness_commander.decision,
    }
  );

  const gateCommand = `node scripts/release-stop-gate.mjs --release-readiness-commander "${outputUri.fsPath}"`;

  const selectedAction = await vscode.window.showInformationMessage(
    `Release readiness artifact exported: ${outputUri.fsPath}`,
    'Copy Gate Command',
    'Copy Artifact Path'
  );

  if (selectedAction === 'Copy Gate Command') {
    await vscode.env.clipboard.writeText(gateCommand);
  } else if (selectedAction === 'Copy Artifact Path') {
    await vscode.env.clipboard.writeText(outputUri.fsPath);
  }

  postExportProgress(
    replyWebview,
    requestId,
    'release-readiness-exported',
    `Release readiness artifact exported: ${path.basename(outputUri.fsPath)}`
  );
}

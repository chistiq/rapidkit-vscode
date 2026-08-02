/**
 * Actions Webview Provider
 * Sidebar action surface aligned with Workspai dashboard tile vocabulary.
 */

import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'node:crypto';
import { type SidebarActionSurfaceMeta } from '../../contracts/sidebarActionSurface';
import { createExtensionWebviewMessage } from '../../contracts/webviewProtocol';
import { buildReactWebviewHtml } from './buildReactWebviewHtml';
import {
  dispatchActionsWebviewMessage,
  type ActionsWebviewMessageDispatchHost,
} from './actionsWebviewMessageDispatcher';
import {
  buildActionsWebviewStudioActionHost,
  resolveSidebarStudioActionPayload,
  type ActionsWebviewStudioActionHost,
} from './actionsWebviewStudioActionHost';
import { WorkspaceUsageTracker } from '../../utils/workspaceUsageTracker';
import {
  askConfiguredAIProvider,
  askConfiguredAIProviderForToolAction,
} from '../../core/aiProviderService';
import {
  listAvailableModels,
  parseCreationIntent,
  prepareAIConversation,
  resolveCreationProfile,
  streamAIResponse,
  type AIConversationHistoryEntry,
  type AIModalContext,
  type AICreationPlan,
  validateCreationPlanForExecution,
  UnsupportedCreationStackError,
} from '../../core/aiService';
import { resolveNewWorkspacePath } from '../../core/workspacePaths';
import { ensureManagedDefaultWorkspace } from '../../core/ensureManagedDefaultWorkspace';
import { createProjectCommand } from '../../commands/createProject';
import { WorkspaiCLI } from '../../core/rapidkitCLI';
import { WorkspaceManager } from '../../core/workspaceManager';
import { readWorkspaiSettings, setWorkspaiPreferredModel } from '../../core/workspaiSettingsBridge';
import { resolvePreferredAIModalContext } from '../../core/aiContextResolver';
import { resolveRapidkitExecutionPlan } from '../../core/incidentInlineCommandRunner';
import {
  buildStudioDependencyUpgradeCommand,
  buildStudioDependencySecurityCommand,
  dependencyRepairAttemptsForGeneration,
  parseStudioDependencyUpgradeCandidates,
  resolveStudioDependencySecurityTarget,
  resolveStudioDependencySecurityTargets,
  type StudioDependencyRepairAttempt,
  type StudioDependencyUpgradeCandidate,
} from '../../core/studioDependencySecurity.js';
import { completeStudioDependencyTransactions } from '../../core/studioDependencyTransaction.js';
import {
  inferVerifiedGoalIntent,
  assertVerifiedGoalCommandSafety,
  assertVerifiedGoalPackageManifestSafety,
  parseVerifiedGoalPlanResult,
  parseVerifiedGoalVerifyResult,
  verifiedGoalPlanArgs,
  verifiedGoalVerifyArgs,
  type VerifiedGoalContractPayload,
} from '../../core/verifiedGoalIntent.js';
import { runStudioActiveBlockerRecovery } from '../../core/studioActiveBlockerRecovery.js';
import { buildCoreRapidkitShellCommand, runCommandsInTerminal } from '../../utils/terminalExecutor';
import { buildRapidkitCommand } from '../../utils/platformCapabilities';
import { createWorkspaceCommand } from '../../commands/createWorkspace';
import type { ScaffoldFramework } from '../../core/scaffoldKits';
import {
  isStudioBlockerHandoff,
  type StudioBlockerHandoff,
} from '../../contracts/studio-blocker-handoff-contract.js';
import { executeStudioActionById } from '../panels/incidentStudioActionBridge.js';
import {
  buildStudioBlockerHandoff,
  pickStudioFixActionId,
} from '../../core/studioBlockerHandoffBuilder.js';
import { shouldUseEvidencePatchRepair } from '../../core/studioBlockerFixRouting.js';
import { recordStudioBlockerCommandRun } from '../../core/studioBlockerCommandLedger.js';
import { runRapidkitStreaming } from '../../core/streamingRapidkitRunner.js';
import { gateIncidentStudioRapidkitCommand } from '../../core/rapidkitEnterpriseCliGate.js';
import { extractDoctorFixResult } from '../../core/doctorFixResultReader.js';
import { resolveStudioDoctorFixInvocation } from '../../core/studioDoctorFixCommand.js';
import {
  applyBootstrapComplianceRemediation,
  normalizeBootstrapComplianceCommand,
} from '../../core/bootstrapComplianceRemediation.js';
import {
  isMutatingRapidkitCliCommand,
  runIncidentInlineCommand,
} from '../panels/incidentStudioInlineCommandBridge.js';
import { resolveIncidentStudioTelemetry } from '../panels/incidentStudioTelemetryBridge.js';
import {
  resolveGovernedStudioRepairMutationBlockReason,
  resolveStudioMutationBlockReason,
} from '../panels/incidentStudioMutationGate.js';
import type { StudioActionId } from '../../core/studioActionCommands.js';
import {
  dashboardEvidenceCardIsBlocking,
  formatStudioCardRefreshToast,
  refreshDashboardAfterStudioVerify,
  type StudioSidebarDashboardRefreshResult,
} from '../../core/studioSidebarDashboardRefresh.js';
import { buildDashboardEvidenceBundle } from '../../core/dashboardEvidenceBridge.js';
import { buildStudioIncidentGraph } from '../../core/studioIncidentGraph.js';
import {
  STUDIO_CANONICAL_INTELLIGENCE_ARGS,
  STUDIO_CANONICAL_INTELLIGENCE_COMMAND,
} from '../../core/studioCanonicalIntelligenceRepair.js';
import {
  resolveWorkspaceIntelligenceRunPreflight,
  resolveWorkspaceIntelligenceRunStage,
  resolveWorkspaceIntelligenceStreamProgress,
} from '../../core/workspaceIntelligenceChainContract.js';
import {
  clearDoctorRemediationPlanCache,
  readDoctorRemediationPlanForStudio,
  type DoctorRemediationPlanStepView,
} from '../../core/doctorRemediationPlanReader.js';
import { resolveDashboardCommandContractByVscodeCommand } from '../../core/dashboardCommandContracts.js';
import { gateDashboardCommandCapability } from '../../core/dashboardCommandCapabilityGate.js';
import { resolveDashboardCommandExecutionPlan } from '../../core/dashboardCommandExecutionPlan.js';
import { applyDoctorRemediationStep } from '../../core/doctorRemediationApply.js';
import {
  applySidebarPendingPatches,
  collectSidebarStudioRepairEvidence,
} from '../../core/sidebarStudioPatchBridge.js';
import type { StudioEvidenceRefreshCommandId } from '../../core/sidebarStudioAgentRuntime.js';
import type { StudioPatchTransactionResult } from '../../core/studioPatchTransaction.js';
import { studioAgentRepairIsComplete } from '../../core/sidebarStudioAgentRuntime.js';
import {
  applyPatches,
  normalizePatchesForWorkspaceScope,
  preparePatchesForReview,
  rollbackAppliedPatches,
  type FilePatch,
  type MultiFilePatchResult,
} from '../../core/patchApplyEngine.js';
import { computeLineDiff } from '../panels/incidentStudioVerifyDiff.js';
import {
  clearSidebarPendingPatches,
  readSidebarPendingPatches,
  saveSidebarPendingPatches,
} from '../../core/sidebarStudioRepairState.js';
import {
  dispatchSidebarShipLoopStep,
  isSidebarShipLoopStepId,
  resolveSidebarShipLoopPayload,
} from '../../core/sidebarStudioShipLoopBridge.js';
import {
  buildSidebarPatchRollbackHint,
  collectAppliedPatchPaths,
} from '../../core/sidebarStudioRollbackHint.js';
import {
  attachAdvisorHandoffSource,
  buildAdvisorStudioPrefill,
} from '../../core/sidebarAdvisorStudioHandoff.js';
import {
  recordSidebarStudioFixAudit,
  type RecordSidebarStudioFixAuditInput,
  type SidebarStudioPatchAuditMetadata,
} from '../../core/sidebarStudioAuditBridge.js';
import { recordRetentionMilestone } from '../../core/retentionMilestones.js';
import { WelcomePanel } from '../panels/welcomePanel.js';
import { resolveWorkspaceArtifactPath } from '../../core/workspaceIntelligencePaths.js';
import {
  isWorkspaiAssistantMode,
  resolveWorkspaiAssistantModeContract,
  type WorkspaiAssistantMode,
} from '../../core/assistantModeContract.js';
import { StudioAgentSession } from '../../core/studioAgentSession.js';
import { VSCodeStudioAgentSessionStore } from '../../core/studioAgentSessionStore.js';
import { ContractStudioAgentModelAdapter } from '../../core/studioAgentModelProtocol.js';
import {
  createStudioAgentWorkspaiToolRegistry,
  type StudioAgentWorkspaiToolHost,
} from '../../core/studioAgentWorkspaiTools.js';
import { inspectStudioAgentFiles } from '../../core/sidebarStudioAgentRuntime.js';
import {
  resolveStudioWorkspaceCommandPlan,
  runStudioWorkspaceCommand,
  type StudioWorkspaceCommandRequest,
} from '../../core/studioWorkspaceCommand.js';
import {
  captureStudioWorkspaceSourceSnapshot,
  diffStudioWorkspaceSourceSnapshots,
} from '../../core/studioWorkspaceSourceSnapshot.js';
import {
  authorizeStudioWorkspacePatchTargets,
  deleteInspectedStudioWorkspaceFiles,
} from '../../core/studioWorkspaceFileTransactions.js';

const PYTHON_ENGINE_REQUIRED_CREATION_PROFILES = new Set(['python-only', 'polyglot', 'enterprise']);

function shouldSkipPythonEngineForCreationProfile(profile: string | undefined): boolean {
  return !PYTHON_ENGINE_REQUIRED_CREATION_PROFILES.has(profile ?? 'minimal');
}

function preserveAllAgentConsumersForStudioRefresh(cliArgs: readonly string[]): string[] {
  const args = [...cliArgs];
  const targetIndex = args.indexOf('--target');
  if (targetIndex >= 0 && targetIndex + 1 < args.length) {
    args[targetIndex + 1] = 'all';
  }
  return args;
}

const STUDIO_WORKSPACE_FILE_EXCLUDE =
  '{**/.git/**,**/node_modules/**,**/vendor/**,**/dist/**,**/build/**,**/target/**,**/.venv/**,**/.workspai/cache/**,**/.workspai/snapshots/**,**/*.tmp}';

async function discoverStudioWorkspaceFiles(input: {
  workspacePath: string;
  glob?: string;
  limit?: number;
}): Promise<Array<{ path: string; size: number }>> {
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 200), 1), 500);
  const requestedGlob = input.glob?.trim() || '**/*';
  if (
    path.isAbsolute(requestedGlob) ||
    /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(requestedGlob) ||
    /[\0\r\n]/.test(requestedGlob)
  ) {
    throw new Error('Studio workspace discovery glob must stay inside the selected workspace.');
  }
  const uris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(input.workspacePath, requestedGlob),
    STUDIO_WORKSPACE_FILE_EXCLUDE,
    limit
  );
  const files: Array<{ path: string; size: number }> = [];
  for (const uri of uris) {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if ((stat.type & vscode.FileType.File) !== 0) {
        files.push({
          path: path.relative(input.workspacePath, uri.fsPath).replace(/\\/g, '/'),
          size: stat.size,
        });
      }
    } catch {
      // Transient files are omitted from the discovery snapshot.
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function studioDiagnosticSeverityName(
  severity: vscode.DiagnosticSeverity
): 'error' | 'warning' | 'information' | 'hint' {
  if (severity === vscode.DiagnosticSeverity.Error) {
    return 'error';
  }
  if (severity === vscode.DiagnosticSeverity.Warning) {
    return 'warning';
  }
  if (severity === vscode.DiagnosticSeverity.Information) {
    return 'information';
  }
  return 'hint';
}

function inspectStudioWorkspaceDiagnostics(input: {
  workspacePath: string;
  paths?: string[];
  severities?: Array<'error' | 'warning' | 'information' | 'hint'>;
}): Array<Record<string, unknown>> {
  const allowedPaths = input.paths?.length
    ? new Set(input.paths.map((entry) => entry.replace(/\\/g, '/')))
    : undefined;
  const allowedSeverities = new Set(input.severities ?? ['error', 'warning']);
  const diagnostics: Array<Record<string, unknown>> = [];
  for (const [uri, entries] of vscode.languages.getDiagnostics()) {
    const relativePath = path.relative(input.workspacePath, uri.fsPath).replace(/\\/g, '/');
    if (
      relativePath.startsWith('../') ||
      path.isAbsolute(relativePath) ||
      (allowedPaths && !allowedPaths.has(relativePath))
    ) {
      continue;
    }
    for (const diagnostic of entries) {
      const severity = studioDiagnosticSeverityName(diagnostic.severity);
      if (!allowedSeverities.has(severity)) {
        continue;
      }
      diagnostics.push({
        path: relativePath,
        severity,
        message: diagnostic.message,
        source: diagnostic.source,
        code:
          typeof diagnostic.code === 'object' && diagnostic.code
            ? diagnostic.code.value
            : diagnostic.code,
        range: {
          start: {
            line: diagnostic.range.start.line + 1,
            column: diagnostic.range.start.character + 1,
          },
          end: {
            line: diagnostic.range.end.line + 1,
            column: diagnostic.range.end.character + 1,
          },
        },
      });
      if (diagnostics.length >= 250) {
        return diagnostics;
      }
    }
  }
  return diagnostics;
}

async function inspectStudioWorkspaceChanges(input: {
  workspacePath: string;
  paths?: string[];
}): Promise<Record<string, unknown>> {
  const pathArgs = input.paths?.length ? ['--', ...input.paths] : [];
  const statusPlan = resolveStudioWorkspaceCommandPlan({
    workspacePath: input.workspacePath,
    request: { executable: 'git', args: ['status', '--short'], purpose: 'inspect' },
  });
  const diffPlan = resolveStudioWorkspaceCommandPlan({
    workspacePath: input.workspacePath,
    request: {
      executable: 'git',
      args: ['diff', '--no-ext-diff', '--unified=3', ...pathArgs],
      purpose: 'inspect',
    },
  });
  const [status, diff] = await Promise.all([
    runStudioWorkspaceCommand(statusPlan),
    runStudioWorkspaceCommand(diffPlan),
  ]);
  return {
    status: status.stdout,
    diff: diff.stdout,
    statusExitCode: status.exitCode,
    diffExitCode: diff.exitCode,
  };
}

type SidebarStudioActionFailurePayload = {
  sessionId?: string;
  cardId?: string;
  action: string;
  status: 'failed';
  title: string;
  summary: string;
  commandText?: string;
  dashboardCommandId?: string;
  executionChannel?: 'terminal' | 'background';
  capabilityGate?: string;
  safetyRisk?: 'read' | 'write' | 'destructive';
  safetyConfirmation?: string;
  safetyRefreshCommands?: string[];
  exitCode?: number | null;
  stderrTail?: string;
  topBlocker?: string;
  error?: string;
  nextAction: string;
  actionId?: unknown;
  stepId?: unknown;
};

type StudioAgentPatchTransaction = {
  workspacePath: string;
  cardId: string;
  sessionId?: string;
  patchResult: MultiFilePatchResult;
};

function optionalTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function studioCommandLedgerMetadata(handoff: StudioBlockerHandoff): {
  dashboardCommandId?: string;
  executionChannel?: 'terminal' | 'background';
  capabilityGate?: string;
  safetyRisk?: 'read' | 'write' | 'destructive';
  safetyConfirmation?: string;
  safetyRefreshCommands?: string[];
  blockerSignature: string;
} {
  return {
    blockerSignature: handoff.blockerSignature,
    ...(handoff.dashboardCommandId ? { dashboardCommandId: handoff.dashboardCommandId } : {}),
    ...(handoff.executionChannel ? { executionChannel: handoff.executionChannel } : {}),
    ...(handoff.capabilityGate ? { capabilityGate: handoff.capabilityGate } : {}),
    ...(handoff.safetyRisk ? { safetyRisk: handoff.safetyRisk } : {}),
    ...(handoff.safetyConfirmation ? { safetyConfirmation: handoff.safetyConfirmation } : {}),
    ...(handoff.safetyRefreshCommands?.length
      ? { safetyRefreshCommands: handoff.safetyRefreshCommands }
      : {}),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function studioActionFailureTitle(action: string): string {
  switch (action) {
    case 'auto-fix':
      return 'Auto-fix failed';
    case 'apply-patch':
      return 'Patch apply failed';
    case 'ship-loop-step':
      return 'Ship-loop step failed';
    case 'refresh-ship-loop':
      return 'Ship-loop refresh failed';
    case 'retry-audit':
      return 'Audit retry failed';
    case 'verify-handoff':
    case 'verify':
      return 'Verify failed';
    case 'run-command':
      return 'Command run failed';
    case 'copy-command':
      return 'Command copy failed';
    case 'copy':
      return 'Copy failed';
    default:
      return 'Studio action failed';
  }
}

function studioActionFailureNextAction(action: string): string {
  switch (action) {
    case 'auto-fix':
      return 'Inspect blocker evidence, then retry auto-fix or open the proposed command output.';
    case 'apply-patch':
      return 'Review the patch set, reject unsafe files, then retry apply-patch.';
    case 'ship-loop-step':
      return 'Inspect the ship-loop artifact, refresh the card, then rerun this ship step.';
    case 'refresh-ship-loop':
      return 'Open the latest evidence artifact, then refresh Studio or rerun the ship-loop step.';
    case 'retry-audit':
      return 'Open the audit state, confirm registry and feedback writes, then retry audit.';
    case 'verify-handoff':
    case 'verify':
      return 'Inspect verify output, keep the blocker open, then run verify again after fixing.';
    case 'run-command':
      return 'Open the terminal command, fix the failing precondition, then rerun the command.';
    case 'copy-command':
    case 'copy':
      return 'Copy the Studio brief manually from the visible answer, then retry copy.';
    default:
      return 'Inspect Studio evidence, keep the blocker open, then retry the action.';
  }
}

function ensureDoctorRemediationPlanRefreshCommand(command: string): string {
  const trimmed = command.trim();
  const bootstrapCommand = normalizeBootstrapComplianceCommand(trimmed);
  if (bootstrapCommand !== trimmed) {
    return bootstrapCommand;
  }
  if (!/(?:^|\s)doctor\s+(?:workspace|project)(?:\s|$)/.test(trimmed)) {
    return trimmed;
  }
  if (/(?:^|\s)--(?:plan|fix|apply)(?:\s|$)/.test(trimmed)) {
    return trimmed;
  }
  if (/(?:^|\s)--json(?:\s|$)/.test(trimmed)) {
    return trimmed.replace(/(?:^|\s)--json(?:\s|$)/, (match) => {
      const prefix = match.startsWith(' ') ? ' ' : '';
      const suffix = match.endsWith(' ') ? ' ' : '';
      return `${prefix}--plan --json${suffix}`;
    });
  }
  return `${trimmed} --plan`;
}

function resolveArtifactRemediationPlanExecution(): {
  commandText: string;
  dashboardCommandId: string;
  executionChannel?: 'terminal' | 'background';
  capabilityGate?: string;
} {
  const plan = resolveDashboardCommandExecutionPlan('workspaceRemediationPlan');
  if (plan.cliArgs.length === 0) {
    throw new Error('Workspace repair plan command is missing CLI args.');
  }
  return {
    commandText: buildRapidkitCommand(plan.cliArgs),
    dashboardCommandId: plan.commandId,
    executionChannel: plan.executionChannel,
    capabilityGate: plan.capabilityRequirement?.label,
  };
}

function remediationLoopProgressForApply(input: {
  verifySucceeded: boolean;
  cardStatus?: string;
  cardBlocking?: boolean;
  refreshedPlanSteps: number;
  failureSummary?: string;
}): {
  status: 'done' | 'review' | 'failed';
  title?: string;
  summary: string;
  nextAction?: 'continue-remediation' | 'auto-fix';
  nextActionLabel?: string;
} {
  if (input.cardBlocking === false) {
    return {
      status: 'done',
      title: 'Verified with attention',
      summary:
        'Evidence refreshed. Remaining findings are advisory and do not block the workspace.',
    };
  }
  if (!input.verifySucceeded) {
    if (input.refreshedPlanSteps > 0) {
      return {
        status: 'review',
        title: 'Next safe step ready',
        summary:
          input.failureSummary ||
          'Verify still reports a blocker, and Studio loaded the next deterministic repair step.',
        nextAction: 'continue-remediation',
        nextActionLabel: 'Continue repair',
      };
    }
    if (input.cardStatus !== 'pass') {
      return {
        status: 'review',
        title: 'Source fix needed',
        summary:
          input.failureSummary ||
          'Verify still reports a blocker, and no deterministic repair step is available. I can continue with an AI-assisted fix using the refreshed evidence.',
        nextAction: 'auto-fix',
        nextActionLabel: 'Continue with AI fix',
      };
    }
    return {
      status: 'failed',
      title: 'Verify failed',
      summary: input.failureSummary || 'The fix was applied, but verification failed.',
    };
  }
  if (input.cardStatus === 'pass') {
    return {
      status: 'done',
      summary: 'Fix applied and the card is now verified.',
    };
  }
  if (input.refreshedPlanSteps > 0) {
    return {
      status: 'review',
      title: 'Next safe step ready',
      summary:
        'This step is complete. The card still needs attention, and Studio loaded the next deterministic repair step.',
      nextAction: 'continue-remediation',
      nextActionLabel: 'Continue repair',
    };
  }
  return {
    status: 'review',
    title: 'Source fix needed',
    summary:
      'This deterministic step is complete, but no more safe file operation is available. I can continue with an AI-assisted repair using the refreshed evidence.',
    nextAction: 'auto-fix',
    nextActionLabel: 'Continue with AI fix',
  };
}

function isInternalDoctorRepairCommand(command: string): boolean {
  return /^(?:workspai|rapidkit):doctor:repair\s/.test(command.trim());
}

function remediationStepPathCandidates(step: DoctorRemediationPlanStepView): string[] {
  const candidates = new Set<string>();
  for (const filePath of step.files) {
    if (filePath.trim()) {
      candidates.add(filePath.trim());
    }
  }
  const operation = step.operation;
  if (!operation) {
    return [...candidates];
  }
  if ('path' in operation && operation.path.trim()) {
    candidates.add(operation.path.trim());
  }
  if ('sourcePath' in operation && operation.sourcePath.trim()) {
    candidates.add(operation.sourcePath.trim());
  }
  return [...candidates];
}

async function resolveProjectPathFromRemediationStep(input: {
  step: DoctorRemediationPlanStepView;
  workspacePath: string;
  handoffProjectPath?: string;
  scopeProjectPath?: string;
}): Promise<string | undefined> {
  const explicit =
    input.step.projectPath || input.handoffProjectPath?.trim() || input.scopeProjectPath?.trim();
  if (explicit) {
    return explicit;
  }
  const workspacePath = path.resolve(input.workspacePath);
  for (const candidate of remediationStepPathCandidates(input.step)) {
    const resolved = path.isAbsolute(candidate)
      ? path.resolve(candidate)
      : path.resolve(workspacePath, candidate);
    if (resolved === workspacePath || !resolved.startsWith(`${workspacePath}${path.sep}`)) {
      continue;
    }
    let cursor =
      (await fs.pathExists(resolved)) && (await fs.stat(resolved)).isDirectory()
        ? resolved
        : path.dirname(resolved);
    while (cursor.startsWith(`${workspacePath}${path.sep}`)) {
      if (
        (await fs.pathExists(path.join(cursor, '.workspai', 'project.json'))) ||
        (await fs.pathExists(path.join(cursor, '.rapidkit', 'project.json')))
      ) {
        return cursor;
      }
      cursor = path.dirname(cursor);
    }
    const relative = path.relative(workspacePath, resolved);
    const firstSegment = relative.split(path.sep).filter(Boolean)[0];
    if (!firstSegment) {
      continue;
    }
    const projectCandidate = path.join(workspacePath, firstSegment);
    if (
      (await fs.pathExists(projectCandidate)) &&
      ((await fs.pathExists(path.join(projectCandidate, '.workspai', 'project.json'))) ||
        (await fs.pathExists(path.join(projectCandidate, '.rapidkit', 'project.json'))) ||
        (await fs.pathExists(path.join(projectCandidate, 'package.json'))) ||
        (await fs.pathExists(path.join(projectCandidate, 'pyproject.toml'))) ||
        (await fs.pathExists(path.join(projectCandidate, 'go.mod'))) ||
        (await fs.pathExists(path.join(projectCandidate, 'pom.xml'))) ||
        (await fs.pathExists(path.join(projectCandidate, 'build.gradle'))) ||
        (await fs.pathExists(path.join(projectCandidate, 'build.gradle.kts'))))
    ) {
      return projectCandidate;
    }
  }
  return undefined;
}

function buildSidebarStudioActionFailurePayload(input: {
  sessionId?: string;
  action: string;
  error?: unknown;
  summary?: string;
  commandText?: string;
  exitCode?: number | null;
  stderrTail?: string;
  topBlocker?: string;
  handoff?: StudioBlockerHandoff | null;
  payloadRecord?: Record<string, unknown>;
  actionId?: unknown;
  stepId?: unknown;
}): SidebarStudioActionFailurePayload {
  const title = studioActionFailureTitle(input.action);
  const error = input.error === undefined ? undefined : errorMessage(input.error);
  const commandText =
    optionalTrimmedString(input.commandText) ??
    optionalTrimmedString(input.payloadRecord?.commandText) ??
    (input.action === 'verify-handoff'
      ? optionalTrimmedString(input.handoff?.verifyCommand)
      : undefined) ??
    (input.action === 'auto-fix' || input.action === 'run-command'
      ? optionalTrimmedString(input.handoff?.sourceCommand)
      : undefined);
  const topBlocker =
    optionalTrimmedString(input.topBlocker) ?? optionalTrimmedString(input.handoff?.blockers[0]);
  const summary =
    optionalTrimmedString(input.summary) ??
    topBlocker ??
    error ??
    'The Studio action failed before completion.';

  return {
    sessionId: input.sessionId,
    ...(optionalTrimmedString(input.handoff?.cardId)
      ? { cardId: input.handoff?.cardId.trim() }
      : {}),
    action: input.action,
    status: 'failed',
    title,
    summary,
    ...(commandText ? { commandText } : {}),
    ...(optionalTrimmedString(input.handoff?.dashboardCommandId)
      ? { dashboardCommandId: input.handoff?.dashboardCommandId?.trim() }
      : {}),
    ...(input.handoff?.executionChannel
      ? { executionChannel: input.handoff.executionChannel }
      : {}),
    ...(optionalTrimmedString(input.handoff?.capabilityGate)
      ? { capabilityGate: input.handoff?.capabilityGate?.trim() }
      : {}),
    ...(input.handoff ? studioCommandLedgerMetadata(input.handoff) : {}),
    ...(typeof input.exitCode === 'number' || input.exitCode === null
      ? { exitCode: input.exitCode }
      : {}),
    ...(optionalTrimmedString(input.stderrTail) ? { stderrTail: input.stderrTail?.trim() } : {}),
    ...(topBlocker ? { topBlocker } : {}),
    ...(error ? { error } : {}),
    nextAction: studioActionFailureNextAction(input.action),
    ...(input.actionId !== undefined ? { actionId: input.actionId } : {}),
    ...(input.stepId !== undefined ? { stepId: input.stepId } : {}),
  };
}

function serializeSidebarPatchReviewItems(patches: FilePatch[]): Array<{
  relativePath: string;
  status: string;
  isNewFile?: boolean;
  failReason?: string;
  diffLines: Array<{ type: 'added' | 'removed' | 'unchanged'; content: string }>;
}> {
  return patches.map((patch) => ({
    relativePath: patch.relativePath,
    status: patch.status,
    isNewFile: patch.isNewFile,
    failReason: patch.failReason,
    diffLines: computeLineDiff(
      (patch.originalContent ?? '').split(/\r?\n/),
      patch.patchedContent.split(/\r?\n/)
    )
      .filter((line) => line.type !== 'unchanged' || line.content.trim().length > 0)
      .slice(0, 400)
      .map(({ type, content }) => ({ type, content })),
  }));
}

function sidebarPatchReviewKey(cardId: string, sessionId?: string): string {
  return sessionId?.trim() ? `${sessionId.trim()}::${cardId}` : cardId;
}

function buildSidebarPatchAuditMetadata(input: {
  sourceAction: 'auto-fix' | 'apply-patch';
  reviewRequired: boolean;
  patchResult?: StudioPatchTransactionResult['patchResult'];
  appliedFixes?: Array<{ path: string; action: string; outcome: string }>;
  rollbackCommand?: string | null;
}): SidebarStudioPatchAuditMetadata | undefined {
  const affectedFiles = collectAppliedPatchPaths(input.appliedFixes);
  const patchResult = input.patchResult;
  if (!patchResult && affectedFiles.length === 0) {
    return undefined;
  }
  return {
    ...(patchResult?.patchId ? { patchId: patchResult.patchId } : {}),
    sourceAction: input.sourceAction,
    reviewRequired: input.reviewRequired,
    ...(patchResult?.branchCreated ? { branchCreated: patchResult.branchCreated } : {}),
    appliedCount: patchResult?.appliedCount ?? affectedFiles.length,
    rejectedCount: patchResult?.rejectedCount ?? 0,
    failedCount: patchResult?.failedCount ?? 0,
    affectedFiles,
    ...(input.rollbackCommand ? { rollbackCommand: input.rollbackCommand } : {}),
  };
}

async function readWorkspaceProfileFromManifest(
  workspacePath: string | undefined
): Promise<string | undefined> {
  if (!workspacePath) {
    return undefined;
  }
  const manifestPath = await resolveWorkspaceArtifactPath(
    workspacePath,
    '.workspai/workspace.json'
  );
  try {
    if (!(await fs.pathExists(manifestPath))) {
      return undefined;
    }
    const manifest = (await fs.readJSON(manifestPath)) as Record<string, unknown>;
    const profile =
      (typeof manifest.profile === 'string' && manifest.profile.trim()) ||
      (typeof manifest.workspace_profile === 'string' && manifest.workspace_profile.trim()) ||
      (typeof manifest.profile_requested === 'string' && manifest.profile_requested.trim());
    return profile || undefined;
  } catch {
    return undefined;
  }
}

async function syncWorkspaceAfterInlineCreate(workspacePath: string): Promise<void> {
  const manager = WorkspaceManager.getInstance();
  const workspace = await manager.addWorkspace(workspacePath);
  if (workspace) {
    await manager.updateWorkspace(workspace.path);
  }
  await vscode.commands.executeCommand('workspai.refreshWorkspaces');
  await vscode.commands.executeCommand('workspai.selectWorkspace', workspacePath);
  await vscode.commands.executeCommand('workspai.refreshProjects');
}

function cleanKnownString(value: unknown): string | undefined {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed && trimmed !== 'unknown' ? trimmed : undefined;
}

async function readProjectFrameworkFromMarker(
  projectPath: string | undefined
): Promise<string | undefined> {
  if (!projectPath) {
    return undefined;
  }
  try {
    const markerPath = await resolveWorkspaceArtifactPath(projectPath, '.workspai/project.json');
    if (!(await fs.pathExists(markerPath))) {
      return undefined;
    }
    const marker = (await fs.readJSON(markerPath)) as Record<string, unknown>;
    return (
      cleanKnownString(marker.framework) ??
      cleanKnownString(marker.kit_name) ??
      cleanKnownString(marker.kit) ??
      cleanKnownString(marker.runtime)
    );
  } catch {
    return undefined;
  }
}

async function enrichAIModalContextWithProjectMarker(
  context: AIModalContext
): Promise<AIModalContext> {
  const projectPath =
    context.projectRootPath ?? (context.type === 'project' ? context.path : undefined);
  if (!projectPath) {
    return context;
  }
  const markerFramework = await readProjectFrameworkFromMarker(projectPath);
  if (!markerFramework) {
    return context;
  }
  return {
    ...context,
    framework: cleanKnownString(context.framework) ?? markerFramework,
  };
}

function resolveImpactScopeContext(payloadScope: unknown): AIModalContext | null {
  if (!payloadScope || typeof payloadScope !== 'object' || Array.isArray(payloadScope)) {
    return null;
  }
  const scope = payloadScope as Record<string, unknown>;
  const workspace =
    scope.workspace && typeof scope.workspace === 'object' && !Array.isArray(scope.workspace)
      ? (scope.workspace as Record<string, unknown>)
      : null;
  const project =
    scope.project && typeof scope.project === 'object' && !Array.isArray(scope.project)
      ? (scope.project as Record<string, unknown>)
      : null;
  const workspacePath =
    typeof workspace?.path === 'string' && workspace.path.trim().length > 0
      ? workspace.path.trim()
      : undefined;
  const projectPath =
    typeof project?.path === 'string' && project.path.trim().length > 0
      ? project.path.trim()
      : undefined;
  if (projectPath) {
    return {
      type: 'project',
      name:
        typeof project?.name === 'string' && project.name.trim().length > 0
          ? project.name.trim()
          : path.basename(projectPath),
      path: projectPath,
      framework:
        typeof project?.type === 'string' && project.type.trim().length > 0
          ? project.type.trim()
          : undefined,
      projectRootPath: projectPath,
      workspaceRootPath: workspacePath,
    };
  }
  if (workspacePath) {
    return {
      type: 'workspace',
      name:
        typeof workspace?.name === 'string' && workspace.name.trim().length > 0
          ? workspace.name.trim()
          : path.basename(workspacePath),
      path: workspacePath,
      workspaceRootPath: workspacePath,
    };
  }
  return null;
}

function resolveEditorIssueContext(value: unknown): AIModalContext | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const issue = value as Record<string, unknown>;
  const filePath =
    typeof issue.filePath === 'string' && issue.filePath.trim().length > 0
      ? issue.filePath.trim()
      : undefined;
  const fileName =
    typeof issue.fileName === 'string' && issue.fileName.trim().length > 0
      ? issue.fileName.trim()
      : filePath
        ? path.basename(filePath)
        : 'Editor issue';
  const languageId =
    typeof issue.languageId === 'string' && issue.languageId.trim().length > 0
      ? issue.languageId.trim()
      : undefined;
  return {
    type: 'module',
    name: fileName,
    path: filePath,
    framework: languageId,
    moduleSlug: 'editor-issue',
    moduleDescription:
      'Standalone editor diagnostic session. Do not assume RapidKit workspace evidence unless the user supplies it.',
  };
}

async function resolveSidebarChatContext(
  payloadRecord: Record<string, unknown>
): Promise<AIModalContext> {
  const explicitScope = resolveImpactScopeContext(payloadRecord.scope);
  if (explicitScope) {
    return explicitScope;
  }
  if (payloadRecord.scopeMode === 'none' || payloadRecord.editorIssue) {
    return (
      resolveEditorIssueContext(payloadRecord.editorIssue) ?? {
        type: 'module',
        name: 'Editor issue',
        moduleSlug: 'editor-issue',
        moduleDescription: 'Standalone editor diagnostic session without workspace/project scope.',
      }
    );
  }
  return resolvePreferredAIModalContext();
}

function isChildPathOfWorkspace(workspacePath: string | undefined, childPath?: string): boolean {
  if (!workspacePath || !childPath) {
    return false;
  }
  const relative = path.relative(path.resolve(workspacePath), path.resolve(childPath));
  return (
    relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function resolveStudioActionScope(payloadScope: unknown): {
  workspacePath?: string;
  projectPath?: string;
  projectBelongsToWorkspace: boolean;
} {
  const scope =
    payloadScope && typeof payloadScope === 'object' && !Array.isArray(payloadScope)
      ? (payloadScope as Record<string, unknown>)
      : {};
  const workspace =
    scope.workspace && typeof scope.workspace === 'object' && !Array.isArray(scope.workspace)
      ? (scope.workspace as Record<string, unknown>)
      : null;
  const project =
    scope.project && typeof scope.project === 'object' && !Array.isArray(scope.project)
      ? (scope.project as Record<string, unknown>)
      : null;
  const workspacePath =
    typeof workspace?.path === 'string' && workspace.path.trim().length > 0
      ? workspace.path.trim()
      : undefined;
  const projectPath =
    typeof project?.path === 'string' && project.path.trim().length > 0
      ? project.path.trim()
      : undefined;
  return {
    workspacePath,
    projectPath,
    projectBelongsToWorkspace: isChildPathOfWorkspace(workspacePath, projectPath),
  };
}

function resolveExplicitWorkspaceScope(payloadScope: unknown): { workspacePath?: string } {
  const scope =
    payloadScope && typeof payloadScope === 'object' && !Array.isArray(payloadScope)
      ? (payloadScope as Record<string, unknown>)
      : {};
  const directWorkspacePath =
    typeof scope.workspacePath === 'string' && scope.workspacePath.trim().length > 0
      ? scope.workspacePath.trim()
      : undefined;
  const workspace =
    scope.workspace && typeof scope.workspace === 'object' && !Array.isArray(scope.workspace)
      ? (scope.workspace as Record<string, unknown>)
      : null;
  const workspacePath =
    typeof workspace?.path === 'string' && workspace.path.trim().length > 0
      ? workspace.path.trim()
      : undefined;
  return { workspacePath: directWorkspacePath ?? workspacePath };
}

function parseStudioBlockerHandoffPayload(value: unknown): StudioBlockerHandoff | undefined {
  if (!isStudioBlockerHandoff(value)) {
    return undefined;
  }
  return value;
}

export type WorkspaiSecondaryTab = 'create' | 'impact' | 'studio';
export type WorkspaiSecondaryTabPayload = {
  workspace?: { name?: string; path?: string; workspaceRootPath?: string } | null;
  project?: { name?: string; path?: string; type?: string; workspacePath?: string } | null;
  initialQuestion?: string;
  initialTask?: string;
  editorIssue?: Record<string, unknown>;
  composerHandoff?: 'prefill' | 'submit';
  studioMode?: 'investigate' | 'verify' | 'prepare';
  shipLoopIntent?: 'release';
  createMode?: 'workspace' | 'project';
  useDefaultWorkspace?: boolean;
  source?: string;
  trigger?: string;
  blockerHandoff?: Record<string, unknown>;
};

export class ActionsWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'rapidkitActionsWebview';
  public static readonly secondaryViewType = 'workspaiSecondarySidebar';
  private _view?: vscode.WebviewView;
  private _pendingSecondaryTab?: WorkspaiSecondaryTab;
  private _pendingSecondaryTabPayload?: WorkspaiSecondaryTabPayload;
  private _activeBlockerHandoff?: StudioBlockerHandoff;
  private _pendingSidebarPatches = new Map<string, FilePatch[]>();
  private _lastSidebarStudioAuditInput?: RecordSidebarStudioFixAuditInput;
  private _studioEvidenceWatcher?: vscode.FileSystemWatcher;
  private _studioEvidenceWatchWorkspace?: string;
  private _studioEvidenceWatchSessionId?: string;
  private _studioEvidencePulseTimer?: NodeJS.Timeout;
  private _studioEvidenceGeneration = 0;
  private _studioEvidenceChangedPaths = new Set<string>();
  private readonly _activeStudioAgentSessions = new Map<string, StudioAgentSession>();
  private readonly _activeStudioAgentRepairRuns = new Map<string, Promise<void>>();
  private readonly _studioAgentPatchTransactions = new Map<string, StudioAgentPatchTransaction>();

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _variant: 'activitybar' | 'secondary-sidebar' = 'activitybar',
    private readonly _context?: vscode.ExtensionContext
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlContent(webviewView.webview);
    this._sendInlineThemeSettings();
    void this._sendInlineModels();
    void this._sendInlineScope();
    if (this._pendingSecondaryTab) {
      this._postSecondaryTabActivation(this._pendingSecondaryTab, this._pendingSecondaryTabPayload);
    }

    webviewView.webview.onDidReceiveMessage((rawMessage) => {
      void dispatchActionsWebviewMessage(this._actionsWebviewMessageDispatchHost(), rawMessage);
    });
  }

  private _actionsWebviewMessageDispatchHost(): ActionsWebviewMessageDispatchHost {
    return {
      runInlineAICreatePlan: (data) => this._runInlineAICreatePlan(data),
      runInlineAICreateConfirm: (data) => this._runInlineAICreateConfirm(data),
      runSidebarManualCreate: (data) => this._runSidebarManualCreate(data),
      runSidebarCreatedWorkspaceBootstrap: (data) =>
        this._runSidebarCreatedWorkspaceBootstrap(data),
      runInlineImpactQuery: (data) => this._runInlineImpactQuery(data),
      runSidebarAdvisorAction: (data) => this._runSidebarAdvisorAction(data),
      runInlineStudioQuery: (data) => this._runInlineStudioQuery(data),
      runSidebarStudioAction: (data) => this._runSidebarStudioAction(data),
      focusPrimarySidebarView: (data) => this._focusPrimarySidebarView(data),
      openDashboardSection: (data) => this._openDashboardSection(data),
      openWorkspaceFile: (data) => this._openSidebarWorkspaceFile(data),
      undoAgentPatch: (data) => this._undoStudioAgentPatch(data),
      sendInlineScope: () => this._sendInlineScope(),
      sendInlineModels: () => this._sendInlineModels(),
      setPreferredModel: async (modelId) => {
        await setWorkspaiPreferredModel(modelId);
        await this._sendInlineModels();
      },
      runSidebarAction: (action, data) => this._runSidebarAction(action, data),
      warnUnknownSidebarAction: (command) =>
        console.warn(`[Workspai] Unknown sidebar action ignored: ${command}`),
    };
  }

  private _actionsWebviewStudioActionHost(): ActionsWebviewStudioActionHost {
    return buildActionsWebviewStudioActionHost({
      context: this._context,
      getActiveBlockerHandoff: () => this._activeBlockerHandoff,
      setActiveBlockerHandoff: (handoff) => {
        this._activeBlockerHandoff = handoff;
      },
      getPendingPatches: (cardId, sessionId) =>
        this._pendingSidebarPatches.get(sidebarPatchReviewKey(cardId, sessionId)) ??
        this._pendingSidebarPatches.get(cardId) ??
        (this._context
          ? (readSidebarPendingPatches(this._context, sidebarPatchReviewKey(cardId, sessionId)) ??
            readSidebarPendingPatches(this._context, cardId))
          : undefined),
      deletePendingPatches: (cardId, sessionId) => {
        const key = sidebarPatchReviewKey(cardId, sessionId);
        this._pendingSidebarPatches.delete(key);
        this._pendingSidebarPatches.delete(cardId);
        if (this._context) {
          void clearSidebarPendingPatches(this._context, key);
          void clearSidebarPendingPatches(this._context, cardId);
        }
      },
      postInlineCreate: (command, data) => this._postInlineCreate(command, data),
      retryLastSidebarStudioAudit: (sessionId) => this._retryLastSidebarStudioAudit(sessionId),
      runSidebarAutoFix: (handoff, sessionId, payloadScope, requestedModelId) =>
        this._runSidebarAutoFix(handoff, sessionId, payloadScope, requestedModelId),
      finalizeStudioPatchTransaction: (handoff, sessionId, result, sourceAction, scope) =>
        this._finalizeStudioPatchTransaction(handoff, sessionId, result, sourceAction, scope),
      auditSidebarStudioFix: (input) => this._auditSidebarStudioFix(input),
      refreshSidebarShipLoop: (input) => this._refreshSidebarShipLoop(input),
      finalizeStudioVerifyHandoff: (input) => this._finalizeStudioVerifyHandoff(input),
    });
  }

  public refresh() {
    if (this._view) {
      this._view.webview.html = this._getHtmlContent(this._view.webview);
      this._sendInlineThemeSettings();
      void this._sendInlineModels();
      void this._sendInlineScope();
    }
  }

  public refreshScope(): void {
    void this._sendInlineScope();
  }

  private async _openSidebarWorkspaceFile(data: unknown): Promise<void> {
    const record =
      data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    const relativePath = typeof record.relativePath === 'string' ? record.relativePath.trim() : '';
    const requestedRoot =
      typeof record.workspacePath === 'string' ? record.workspacePath.trim() : '';
    const workspacePath =
      requestedRoot || (await resolvePreferredAIModalContext()).workspaceRootPath || '';
    if (!workspacePath || !relativePath || path.isAbsolute(relativePath)) {
      throw new Error('A workspace-relative file path is required.');
    }
    const absolutePath = path.resolve(workspacePath, relativePath);
    const boundary = path.relative(path.resolve(workspacePath), absolutePath);
    if (!boundary || boundary.startsWith('..') || path.isAbsolute(boundary)) {
      if (!boundary) {
        throw new Error('The workspace root is not an editable file.');
      }
      throw new Error('The requested file is outside the active workspace.');
    }
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(absolutePath));
    await vscode.window.showTextDocument(document, { preview: true, preserveFocus: false });
  }

  private _rememberStudioAgentPatchTransaction(
    transactionId: string,
    transaction: StudioAgentPatchTransaction
  ): void {
    this._studioAgentPatchTransactions.set(transactionId, transaction);
    while (this._studioAgentPatchTransactions.size > 40) {
      const oldest = this._studioAgentPatchTransactions.keys().next().value as string | undefined;
      if (!oldest) {
        break;
      }
      this._studioAgentPatchTransactions.delete(oldest);
    }
  }

  private async _undoStudioAgentPatch(data: unknown): Promise<void> {
    const record =
      data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    const transactionId =
      typeof record.transactionId === 'string' ? record.transactionId.trim() : '';
    const transaction = transactionId
      ? this._studioAgentPatchTransactions.get(transactionId)
      : undefined;
    if (!transaction) {
      this._postInlineCreate('sidebarStudioAgentPatchRollback', {
        transactionId,
        ok: false,
        error: 'This live edit transaction is no longer available for automatic Undo.',
      });
      return;
    }
    await this._assertSidebarStudioMutationAllowed({
      workspacePath: transaction.workspacePath,
      actionLabel: 'Studio Agent patch rollback',
    });
    const result = await rollbackAppliedPatches({
      workspacePath: transaction.workspacePath,
      patches: transaction.patchResult.patches,
    });
    if (result.ok) {
      this._studioAgentPatchTransactions.delete(transactionId);
    }
    this._postInlineCreate('sidebarStudioAgentPatchRollback', {
      transactionId,
      sessionId: transaction.sessionId,
      cardId: transaction.cardId,
      ...result,
      ...(result.ok
        ? { summary: `Undid ${result.restoredPaths.length} Agent edit(s).` }
        : {
            error: result.failedPaths.map((entry) => `${entry.path}: ${entry.reason}`).join('; '),
          }),
    });
  }

  public async revealSecondaryTab(
    tab: WorkspaiSecondaryTab,
    payload?: WorkspaiSecondaryTabPayload
  ): Promise<void> {
    this._pendingSecondaryTab = tab;
    this._pendingSecondaryTabPayload = payload;
    try {
      await vscode.commands.executeCommand(`${ActionsWebviewProvider.secondaryViewType}.focus`);
    } catch (error) {
      console.warn('[Workspai] Failed to focus Workspai secondary sidebar', error);
    }
    this._postSecondaryTabActivation(tab, payload);
  }

  private _postSecondaryTabActivation(
    tab: WorkspaiSecondaryTab,
    payload?: WorkspaiSecondaryTabPayload
  ): void {
    if (!this._view) {
      return;
    }
    this._pendingSecondaryTab = undefined;
    this._pendingSecondaryTabPayload = undefined;
    const handoff = parseStudioBlockerHandoffPayload(payload?.blockerHandoff);
    if (handoff) {
      this._activeBlockerHandoff = handoff;
    }
    this._postInlineCreate('sidebarActivateTab', { tab, ...(payload ?? {}) });
    if (handoff) {
      this._postInlineCreate('sidebarBlockerHandoff', { handoff });
    }
    if (tab === 'studio' && payload?.shipLoopIntent === 'release') {
      const workspacePath =
        payload?.workspace?.path ?? payload?.workspace?.workspaceRootPath ?? undefined;
      void this._refreshSidebarShipLoop({
        workspacePath,
        projectPath: payload?.project?.path,
        projectName: payload?.project?.name,
        intent: 'release',
      });
    }
  }

  private _postInlineCreate(command: string, data?: Record<string, unknown>): void {
    void this._view?.webview.postMessage(
      createExtensionWebviewMessage(command, data, {
        source: 'workspai-secondary-sidebar',
        version: '1',
      })
    );
  }

  private _ensureStudioEvidenceWatcher(handoff: StudioBlockerHandoff, sessionId?: string): void {
    const workspacePath = handoff.workspacePath?.trim();
    if (!workspacePath) {
      return;
    }
    this._studioEvidenceWatchSessionId = sessionId;
    if (this._studioEvidenceWatcher && this._studioEvidenceWatchWorkspace === workspacePath) {
      return;
    }
    this._studioEvidenceWatcher?.dispose();
    this._studioEvidenceWatcher = undefined;
    this._studioEvidenceWatchWorkspace = workspacePath;
    this._studioEvidenceGeneration = 0;
    this._studioEvidenceChangedPaths.clear();

    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspacePath, '.workspai/**/*')
    );
    const schedulePulse = (uri: vscode.Uri) => {
      const relativePath = path.relative(workspacePath, uri.fsPath).replace(/\\/g, '/');
      if (
        /(?:^|\/)\.[^/]+\.tmp$/i.test(relativePath) ||
        /\.json\.\d+\.[0-9a-f-]+\.tmp$/i.test(relativePath) ||
        /(?:^|\/)(?:cache|snapshots)(?:\/|$)/i.test(relativePath)
      ) {
        return;
      }
      this._studioEvidenceChangedPaths.add(relativePath);
      if (this._studioEvidencePulseTimer) {
        clearTimeout(this._studioEvidencePulseTimer);
      }
      this._studioEvidencePulseTimer = setTimeout(() => {
        const changedPaths = [...this._studioEvidenceChangedPaths].sort();
        this._studioEvidenceChangedPaths.clear();
        this._studioEvidenceGeneration += 1;
        this._postInlineCreate('sidebarStudioEvidencePulse', {
          sessionId: this._studioEvidenceWatchSessionId,
          cardId: this._activeBlockerHandoff?.cardId ?? handoff.cardId,
          blockerSignature:
            this._activeBlockerHandoff?.blockerSignature ?? handoff.blockerSignature,
          generation: this._studioEvidenceGeneration,
          observedAt: new Date().toISOString(),
          changedPaths,
          summary: `Evidence generation ${this._studioEvidenceGeneration} arrived: ${changedPaths.slice(0, 3).join(', ')}${changedPaths.length > 3 ? ` +${changedPaths.length - 3} more` : ''}`,
        });
      }, 180);
    };
    watcher.onDidCreate(schedulePulse);
    watcher.onDidChange(schedulePulse);
    watcher.onDidDelete(schedulePulse);
    this._studioEvidenceWatcher = watcher;
  }

  private async _postSidebarDoctorRemediationPlan(input: {
    handoff?: StudioBlockerHandoff;
    workspacePath?: string;
    sessionId?: string;
  }): Promise<Awaited<ReturnType<typeof readDoctorRemediationPlanForStudio>>> {
    const workspacePath =
      input.workspacePath?.trim() ||
      input.handoff?.workspacePath?.trim() ||
      (await resolvePreferredAIModalContext()).workspaceRootPath;
    const plan = await readDoctorRemediationPlanForStudio({
      workspacePath,
      handoff: input.handoff,
      maxSteps: 4,
    });
    this._postInlineCreate('sidebarStudioRemediationPlan', {
      cardId: input.handoff?.cardId,
      sessionId: input.sessionId,
      blockerSignature: input.handoff?.blockerSignature,
      plan,
    });
    return plan;
  }

  private _postCreateTimelineStep(title: string, detail?: string, sessionId?: string): void {
    this._postInlineCreate('sidebarAiCreateProgress', {
      title,
      detail: detail ?? '',
      sessionId,
    });
  }

  private _sendInlineThemeSettings(): void {
    const settings = readWorkspaiSettings();
    this._postInlineCreate('sidebarThemeSettings', {
      themeMode: settings.themeMode,
    });
  }

  private async _sendInlineModels(): Promise<void> {
    try {
      const settings = readWorkspaiSettings();
      const models =
        settings.aiProvider !== 'vscode-lm'
          ? [
              {
                id: settings.customAIModel || settings.aiProvider,
                name: settings.customAIModel || settings.aiProvider,
                vendor: settings.aiProvider,
              },
            ]
          : await listAvailableModels();
      this._postInlineCreate('sidebarAiModelsList', {
        models,
        preferredModel: settings.preferredModel,
      });
    } catch {
      this._postInlineCreate('sidebarAiModelsList', {
        models: [],
        preferredModel: 'auto',
      });
    }
  }

  private async _sendInlineScope(): Promise<void> {
    const readCommand = async <T>(command: string): Promise<T | null> => {
      try {
        return ((await vscode.commands.executeCommand(command)) as T | undefined) ?? null;
      } catch {
        return null;
      }
    };
    const workspace = await readCommand<{
      name?: string;
      path?: string;
      profile?: string;
      workspace_profile?: string;
      mode?: string;
    }>('workspai.getSelectedWorkspace');
    const project = await readCommand<{ name?: string; path?: string; type?: string }>(
      'workspai.getSelectedProject'
    );
    const workspaceProfile =
      (typeof workspace?.profile === 'string' && workspace.profile.trim()) ||
      (typeof workspace?.workspace_profile === 'string' && workspace.workspace_profile.trim()) ||
      (await readWorkspaceProfileFromManifest(workspace?.path));
    this._postInlineCreate('sidebarAiScope', {
      workspace: workspace
        ? {
            name: workspace.name,
            path: workspace.path,
            profile: workspaceProfile,
          }
        : null,
      project: project
        ? {
            name: project.name,
            path: project.path,
            type: project.type,
          }
        : null,
    });
  }

  private async _auditSidebarStudioFix(input: {
    sessionId?: string;
    workspacePath: string;
    handoff?: StudioBlockerHandoff;
    kind: 'auto-fix' | 'apply-patch' | 'verify-handoff' | 'ship-loop-step';
    actionId: string;
    summary: string;
    ok: boolean;
    appliedFixes?: Array<{ path: string; action: string; outcome: string }>;
    rollbackCommand?: string;
    patchMetadata?: SidebarStudioPatchAuditMetadata;
  }): Promise<void> {
    if (input.ok && input.kind === 'verify-handoff') {
      void recordRetentionMilestone(this._context, 'first_blocker_fixed', {
        surface: 'studio',
      });
    }
    if (!input.workspacePath?.trim()) {
      return;
    }
    const auditInput: RecordSidebarStudioFixAuditInput = {
      workspacePath: input.workspacePath,
      handoff: input.handoff,
      kind: input.kind,
      actionId: input.actionId,
      summary: input.summary,
      ok: input.ok,
      appliedFixes: input.appliedFixes,
      rollbackCommand: input.rollbackCommand,
      patchMetadata: input.patchMetadata,
    };
    this._lastSidebarStudioAuditInput = auditInput;
    try {
      const result = await recordSidebarStudioFixAudit(auditInput);
      this._postInlineCreate('sidebarStudioAuditState', {
        actionId: input.actionId,
        kind: input.kind,
        status: result.ok ? 'saved' : 'stale',
        registryRecorded: result.registryRecorded,
        feedbackRecorded: result.feedbackRecorded,
        stale: result.stale,
        error: result.error,
        retryable: result.retryable === true,
      });
      if (!result.ok) {
        this._postInlineCreate(
          'sidebarStudioActionResult',
          buildSidebarStudioActionFailurePayload({
            sessionId: input.sessionId,
            action: 'retry-audit',
            summary: result.error || `Workspace feedback history is stale for ${input.actionId}.`,
            error: result.error,
            handoff: input.handoff,
            actionId: input.actionId,
          })
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._postInlineCreate('sidebarStudioAuditState', {
        actionId: input.actionId,
        kind: input.kind,
        status: 'failed',
        registryRecorded: false,
        feedbackRecorded: false,
        stale: true,
        error: message || 'Sidebar Studio audit write failed.',
        retryable: true,
      });
      this._postInlineCreate(
        'sidebarStudioActionResult',
        buildSidebarStudioActionFailurePayload({
          sessionId: input.sessionId,
          action: 'retry-audit',
          summary: message || 'Sidebar Studio audit write failed.',
          error,
          handoff: input.handoff,
          actionId: input.actionId,
        })
      );
    }
  }

  private async _retryLastSidebarStudioAudit(sessionId?: string): Promise<void> {
    if (!this._lastSidebarStudioAuditInput) {
      this._postInlineCreate('sidebarStudioAuditState', {
        actionId: 'retry-audit',
        status: 'failed',
        registryRecorded: false,
        feedbackRecorded: false,
        stale: true,
        error: 'No Studio audit payload is available to retry.',
        retryable: false,
      });
      return;
    }

    this._postInlineCreate('sidebarStudioActionResult', {
      sessionId,
      action: 'retry-audit',
      status: 'running',
      phase: 'audit-retry',
    });
    await this._auditSidebarStudioFix({
      ...this._lastSidebarStudioAuditInput,
      sessionId,
    });
    this._postInlineCreate('sidebarStudioActionResult', {
      sessionId,
      action: 'retry-audit',
      status: 'done',
      summary: 'Studio audit retry completed.',
    });
  }

  private async _refreshSidebarShipLoop(input: {
    workspacePath?: string;
    projectPath?: string;
    projectName?: string;
    intent?: 'release';
  }): Promise<void> {
    if (!input.workspacePath || input.intent !== 'release') {
      return;
    }
    try {
      const payload = await resolveSidebarShipLoopPayload({
        workspacePath: input.workspacePath,
        projectPath: input.projectPath,
        projectName: input.projectName,
      });
      this._postInlineCreate('sidebarStudioShipLoop', {
        workspacePath: payload.workspacePath,
        projectPath: input.projectPath,
        projectName: input.projectName,
        shipLoopIntent: 'release',
        cards: payload.cards,
      });
    } catch (error) {
      console.warn('[Workspai] Failed to refresh sidebar ship loop', error);
      this._postInlineCreate(
        'sidebarStudioActionResult',
        buildSidebarStudioActionFailurePayload({
          action: 'refresh-ship-loop',
          error,
          summary: 'Studio could not refresh the ship-loop cards from workspace evidence.',
        })
      );
    }
  }

  private async _runInlineAICreatePlan(payload: unknown): Promise<void> {
    const payloadRecord =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const prompt =
      payload && typeof payload === 'object' && 'prompt' in payload
        ? String((payload as { prompt?: unknown }).prompt ?? '').trim()
        : '';
    const requestedModelId =
      typeof payloadRecord.modelId === 'string' && payloadRecord.modelId.trim().length > 0
        ? payloadRecord.modelId.trim()
        : undefined;
    const stackFocus =
      typeof payloadRecord.stackFocus === 'string' && payloadRecord.stackFocus.trim().length > 0
        ? payloadRecord.stackFocus.trim()
        : undefined;
    const sessionId =
      typeof payloadRecord.sessionId === 'string' ? payloadRecord.sessionId.trim() : undefined;
    const createTarget = payloadRecord.target === 'project' ? 'project' : 'workspace';
    if (!prompt) {
      return;
    }
    if (!this._context) {
      this._postInlineCreate('sidebarAiCreateError', {
        error: 'AI creation is not available until the extension context is ready.',
        sessionId,
      });
      return;
    }

    this._postInlineCreate('sidebarAiCreateThinking', {
      label: 'Connecting to AI planner…',
      sessionId,
    });
    try {
      const scope = resolveExplicitWorkspaceScope(payloadRecord.scope);
      const workspacePath = scope.workspacePath;
      const creationPrompt =
        stackFocus && stackFocus !== 'Any stack'
          ? `${prompt}\n\nStack focus: ${stackFocus}`
          : prompt;
      const { plan, modelId, planSource } = await parseCreationIntent(
        creationPrompt,
        createTarget,
        undefined,
        workspacePath,
        undefined,
        async (messages, token) => {
          if (requestedModelId && readWorkspaiSettings().aiProvider === 'vscode-lm') {
            let text = '';
            const response = await streamAIResponse(
              messages,
              (chunk) => {
                text += chunk.text;
              },
              token,
              requestedModelId
            );
            return {
              text,
              modelId: response.modelId,
            };
          }
          const response = await askConfiguredAIProvider(this._context!, messages, token);
          return {
            text: response.text,
            modelId: response.provider,
          };
        }
      );
      if (planSource === 'heuristic') {
        this._postCreateTimelineStep(
          'Using local stack planner',
          'AI is unavailable — inferring framework, kit, and modules from your description.',
          sessionId
        );
      } else {
        this._postCreateTimelineStep(
          'Drafted creation plan',
          modelId ? `Model: ${modelId}` : 'Stack, framework, and modules mapped.',
          sessionId
        );
      }
      this._postInlineCreate('sidebarAiCreatePlan', { plan, modelId, planSource, sessionId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._postInlineCreate('sidebarAiCreateError', {
        error: message,
        unsupportedStack:
          error instanceof UnsupportedCreationStackError ? error.stackLabel : undefined,
        createCapability:
          error instanceof UnsupportedCreationStackError ? error.capability : undefined,
        sessionId,
      });
    }
  }

  private async _runInlineAICreateConfirm(payload: unknown): Promise<void> {
    const payloadRecord =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const sessionId =
      typeof payloadRecord.sessionId === 'string' ? payloadRecord.sessionId.trim() : undefined;
    const rawPlan =
      payload && typeof payload === 'object' && 'plan' in payload
        ? ((payload as { plan?: unknown }).plan as AICreationPlan | undefined)
        : undefined;
    if (!rawPlan) {
      this._postInlineCreate('sidebarAiCreateError', {
        error: 'No AI creation plan to execute.',
        sessionId,
      });
      return;
    }

    try {
      const plan = validateCreationPlanForExecution(rawPlan);
      if (plan.type === 'project') {
        const scope = resolveExplicitWorkspaceScope(payloadRecord.scope);
        const workspacePath = scope.workspacePath ?? (await ensureManagedDefaultWorkspace()).path;
        this._postInlineCreate('sidebarAiCreateProgress', {
          title: 'Creating project structure',
          detail: `${plan.projectName} · ${plan.framework} · ${plan.kit}`,
          sessionId,
        });
        await createProjectCommand(workspacePath, plan.framework, plan.projectName, plan.kit, {
          suppressPostCreatePrompt: true,
          silent: true,
        });
        this._postInlineCreate('sidebarAiCreateProgress', {
          title: 'Syncing workspace intelligence',
          detail: 'Refreshing workspace model and project evidence…',
          sessionId,
        });
        await syncWorkspaceAfterInlineCreate(workspacePath);
        await vscode.commands.executeCommand('workspai.refreshProjects');
        this._postInlineCreate('sidebarAiCreateDone', {
          plan,
          workspacePath,
          projects: [
            {
              name: plan.projectName,
              framework: plan.framework,
              kit: plan.kit,
              path: path.join(workspacePath, plan.projectName),
            },
          ],
          sessionId,
        });
        return;
      }
      this._postInlineCreate('sidebarAiCreateProgress', {
        title: 'Creating workspace shell',
        detail: `Workspace: ${plan.workspaceName}`,
        sessionId,
      });

      const profile = resolveCreationProfile(plan.profile, plan.framework);
      await vscode.commands.executeCommand('workspai.createWorkspace', {
        name: plan.workspaceName,
        profile,
        installMethod: plan.installMethod ?? 'auto',
        skipPythonEngine: shouldSkipPythonEngineForCreationProfile(profile),
        initGit: true,
        policyMode: 'warn',
        dependencySharing: 'isolated',
        suppressPostCreatePrompt: true,
        silent: true,
      });

      const workspacePath = resolveNewWorkspacePath(plan.workspaceName);
      const workspaceCreated = await fs.pathExists(workspacePath);
      if (!workspaceCreated) {
        throw new Error(`Workspace was not found after creation: ${workspacePath}`);
      }

      this._postInlineCreate('sidebarAiCreateProgress', {
        title: 'Creating project structure',
        detail: `${plan.projectName} · ${plan.framework} · ${plan.kit}`,
        sessionId,
      });
      await createProjectCommand(workspacePath, plan.framework, plan.projectName, plan.kit, {
        suppressPostCreatePrompt: true,
        silent: true,
      });
      const createdProjects = [
        {
          name: plan.projectName,
          framework: plan.framework,
          kit: plan.kit,
          path: path.join(workspacePath, plan.projectName),
        },
      ];

      if (plan.secondaryProject) {
        this._postInlineCreate('sidebarAiCreateProgress', {
          title: 'Creating companion project',
          detail: `${plan.secondaryProject.projectName} · ${plan.secondaryProject.framework}`,
          sessionId,
        });
        await createProjectCommand(
          workspacePath,
          plan.secondaryProject.framework,
          plan.secondaryProject.projectName,
          plan.secondaryProject.kit,
          { suppressPostCreatePrompt: true, silent: true }
        );
        createdProjects.push({
          name: plan.secondaryProject.projectName,
          framework: plan.secondaryProject.framework,
          kit: plan.secondaryProject.kit,
          path: path.join(workspacePath, plan.secondaryProject.projectName),
        });
      }

      this._postInlineCreate('sidebarAiCreateProgress', {
        title: 'Preparing workspace intelligence',
        detail:
          plan.suggestedModules.length > 0
            ? `Module suggestions captured: ${plan.suggestedModules.join(', ')}`
            : 'Workspace model and project evidence are ready.',
        sessionId,
      });
      await syncWorkspaceAfterInlineCreate(workspacePath);
      this._postInlineCreate('sidebarAiCreateDone', {
        plan,
        workspacePath,
        projects: createdProjects,
        sessionId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._postInlineCreate('sidebarAiCreateError', { error: message, sessionId });
    }
  }

  private async _runSidebarManualCreate(payload: unknown): Promise<void> {
    const payloadRecord =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const mode = payloadRecord.mode === 'project' ? 'project' : 'workspace';
    const sessionId =
      typeof payloadRecord.sessionId === 'string' ? payloadRecord.sessionId.trim() : undefined;
    const name = typeof payloadRecord.name === 'string' ? payloadRecord.name.trim() : '';
    if (!name) {
      this._postInlineCreate('sidebarManualCreateResult', {
        status: 'failed',
        error: mode === 'project' ? 'Project name is required.' : 'Workspace name is required.',
        sessionId,
      });
      return;
    }

    const profile =
      payloadRecord.profile === 'enterprise' ||
      payloadRecord.profile === 'polyglot' ||
      payloadRecord.profile === 'python-only' ||
      payloadRecord.profile === 'node-only' ||
      payloadRecord.profile === 'go-only' ||
      payloadRecord.profile === 'java-only' ||
      payloadRecord.profile === 'dotnet-only'
        ? payloadRecord.profile
        : 'minimal';
    const frameworkMap: Record<string, ScaffoldFramework> = {
      fastapi: 'fastapi',
      'fastapi-standard': 'fastapi',
      'fastapi-ddd': 'fastapi',
      nestjs: 'nestjs',
      'nestjs-standard': 'nestjs',
      go: 'go',
      gofiber: 'go',
      'gofiber-standard': 'go',
      gogin: 'go',
      'gogin-standard': 'go',
      nextjs: 'nextjs',
      remix: 'remix',
      'react-router': 'remix',
      'vite-react': 'vite-react',
      react: 'vite-react',
      'vite-vue': 'vite-vue',
      'vite-svelte': 'vite-svelte',
      'vite-solid': 'vite-solid',
      'vite-vanilla': 'vite-vanilla',
      nuxt: 'nuxt',
      angular: 'angular',
      astro: 'astro',
      sveltekit: 'sveltekit',
      springboot: 'springboot',
      'springboot-standard': 'springboot',
      dotnet: 'dotnet',
      'dotnet-webapi-clean': 'dotnet',
      rust: 'rust',
      axum: 'rust',
      'rust-axum': 'rust',
      laravel: 'laravel',
      'php-laravel': 'laravel',
      tauri: 'tauri',
      'desktop-tauri': 'tauri',
      electron: 'electron',
      'desktop-electron': 'electron',
      vscode: 'vscode-extension',
      'vscode-extension': 'vscode-extension',
      'extension-vscode': 'vscode-extension',
    };
    const defaultKitMap: Record<string, string> = {
      fastapi: 'fastapi.standard',
      'fastapi-standard': 'fastapi.standard',
      'fastapi-ddd': 'fastapi.ddd',
      nestjs: 'nestjs.standard',
      'nestjs-standard': 'nestjs.standard',
      go: 'gofiber.standard',
      gofiber: 'gofiber.standard',
      'gofiber-standard': 'gofiber.standard',
      gogin: 'gogin.standard',
      'gogin-standard': 'gogin.standard',
      springboot: 'springboot.standard',
      'springboot-standard': 'springboot.standard',
      dotnet: 'dotnet.webapi.clean',
      'dotnet-webapi-clean': 'dotnet.webapi.clean',
      rust: 'rust.axum',
      axum: 'rust.axum',
      'rust-axum': 'rust.axum',
      laravel: 'php.laravel',
      'php-laravel': 'php.laravel',
      tauri: 'desktop.tauri',
      'desktop-tauri': 'desktop.tauri',
      electron: 'desktop.electron',
      'desktop-electron': 'desktop.electron',
      vscode: 'extension.vscode',
      'vscode-extension': 'extension.vscode',
      'extension-vscode': 'extension.vscode',
      nextjs: 'frontend.nextjs',
      remix: 'frontend.remix',
      'react-router': 'frontend.remix',
      'vite-react': 'frontend.vite-react',
      'vite-vue': 'frontend.vite-vue',
      'vite-svelte': 'frontend.vite-svelte',
      'vite-solid': 'frontend.vite-solid',
      'vite-vanilla': 'frontend.vite-vanilla',
      nuxt: 'frontend.nuxt',
      angular: 'frontend.angular',
      astro: 'frontend.astro',
      sveltekit: 'frontend.sveltekit',
    };
    const frameworkKey =
      typeof payloadRecord.framework === 'string' ? payloadRecord.framework.trim() : 'fastapi';
    const framework = frameworkMap[frameworkKey] ?? 'fastapi';
    const requestedKit = typeof payloadRecord.kit === 'string' ? payloadRecord.kit.trim() : '';
    const kitName = requestedKit || defaultKitMap[framework] || defaultKitMap.fastapi;

    try {
      if (mode === 'project') {
        this._postInlineCreate('sidebarAiCreateThinking', {
          label: 'Preparing project scaffold…',
          sessionId,
        });
        this._postCreateTimelineStep(
          'Validated project plan',
          `${name} · ${frameworkKey} · ${kitName}`,
          sessionId
        );

        const scope = resolveExplicitWorkspaceScope(payloadRecord.scope);
        const cli = new WorkspaiCLI();
        let workspacePath = scope.workspacePath;

        if (!workspacePath) {
          const ensured = await ensureManagedDefaultWorkspace();
          workspacePath = ensured.path;
          this._postCreateTimelineStep('Using default workspace', undefined, sessionId);
        } else {
          this._postCreateTimelineStep(
            'Creating project in workspace',
            path.basename(workspacePath),
            sessionId
          );
        }

        this._postCreateTimelineStep(
          'Running RapidKit scaffold',
          `Generating files and installing dependencies for ${kitName}…`,
          sessionId
        );

        const result = await cli.createProjectInWorkspace({
          name,
          kit: kitName,
          workspacePath,
          skipInstall: false,
        });
        const exitCode = (result as { exitCode?: number }).exitCode ?? 1;
        if (exitCode !== 0) {
          const stderr = (result as { stderr?: string }).stderr ?? '';
          const stdout = (result as { stdout?: string }).stdout ?? '';
          throw new Error(stderr || stdout || 'RapidKit project creation failed.');
        }
        const summary = `${name} · ${kitName}`;

        this._postCreateTimelineStep(
          'Syncing workspace intelligence',
          'Refreshing workspace model and evidence…',
          sessionId
        );
        await syncWorkspaceAfterInlineCreate(workspacePath);

        this._postCreateTimelineStep(
          'Refreshing project explorer',
          'Updating project list…',
          sessionId
        );
        await vscode.commands.executeCommand('workspai.refreshProjects');
        await WelcomePanel.refreshDashboardForWorkspacePath(workspacePath);

        this._postInlineCreate('sidebarManualCreateResult', {
          status: 'done',
          mode,
          name,
          kit: kitName,
          summary,
          workspacePath,
          projectPath: path.join(workspacePath, name),
          sessionId,
        });
        return;
      }

      this._postInlineCreate('sidebarAiCreateThinking', {
        label: 'Preparing workspace shell…',
        sessionId,
      });
      this._postCreateTimelineStep(
        'Validated workspace plan',
        `${name} · ${profile} profile`,
        sessionId
      );
      this._postCreateTimelineStep(
        'Creating workspace shell',
        'Generating workspace files and governance defaults…',
        sessionId
      );

      await createWorkspaceCommand({
        name,
        profile,
        installMethod:
          payloadRecord.installMethod === 'poetry' ||
          payloadRecord.installMethod === 'venv' ||
          payloadRecord.installMethod === 'pipx'
            ? payloadRecord.installMethod
            : 'auto',
        skipPythonEngine:
          typeof payloadRecord.skipPythonEngine === 'boolean'
            ? payloadRecord.skipPythonEngine
            : shouldSkipPythonEngineForCreationProfile(profile),
        initGit: payloadRecord.initGit !== false,
        policyMode: payloadRecord.policyMode === 'strict' ? 'strict' : 'warn',
        dependencySharing: payloadRecord.dependencySharing === 'shared' ? 'shared' : 'isolated',
        suppressPostCreatePrompt: true,
        silent: true,
      });

      this._postCreateTimelineStep(
        'Finalizing workspace',
        'Workspace shell is ready for projects and evidence.',
        sessionId
      );
      const workspacePath = resolveNewWorkspacePath(name);
      await syncWorkspaceAfterInlineCreate(workspacePath);
      await WelcomePanel.refreshDashboardForWorkspacePath(workspacePath);
      this._postInlineCreate('sidebarManualCreateResult', {
        status: 'done',
        mode,
        name,
        profile,
        workspacePath,
        summary: name,
        sessionId,
      });
    } catch (error) {
      this._postInlineCreate('sidebarManualCreateResult', {
        status: 'failed',
        mode,
        name,
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });
    }
  }

  private async _focusPrimarySidebarView(payload: unknown): Promise<void> {
    const payloadRecord =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const target = payloadRecord.target === 'projects' ? 'projects' : 'workspaces';
    try {
      if (target === 'projects') {
        await vscode.commands.executeCommand('workspai.refreshProjects');
        await vscode.commands.executeCommand('rapidkitProjects.focus');
        return;
      }
      await vscode.commands.executeCommand('workspai.refreshWorkspaces');
      await vscode.commands.executeCommand('rapidkitWorkspaces.focus');
    } catch (error) {
      console.warn('[Workspai] Failed to focus primary sidebar view', error);
    }
  }

  private async _openDashboardSection(payload: unknown): Promise<void> {
    if (!this._context) {
      return;
    }
    const payloadRecord =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const requestedSection =
      typeof payloadRecord.section === 'string' ? payloadRecord.section.trim() : '';
    const allowedSections = [
      'overview',
      'repair',
      'evidence',
      'operate',
      'console',
      'catalog',
    ] as const;
    const section = allowedSections.includes(requestedSection as (typeof allowedSections)[number])
      ? (requestedSection as (typeof allowedSections)[number])
      : 'overview';
    WelcomePanel.openDashboardSectionTab(this._context, section);
  }

  private async _runInlineImpactQuery(payload: unknown): Promise<void> {
    const payloadRecord =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const question =
      typeof payloadRecord.question === 'string' ? payloadRecord.question.trim() : '';
    const requestedModelId =
      typeof payloadRecord.modelId === 'string' && payloadRecord.modelId.trim().length > 0
        ? payloadRecord.modelId.trim()
        : undefined;
    const sessionId =
      typeof payloadRecord.sessionId === 'string' && payloadRecord.sessionId.trim().length > 0
        ? payloadRecord.sessionId.trim()
        : undefined;
    const rawHistory = Array.isArray(payloadRecord.history) ? payloadRecord.history : [];
    const history: AIConversationHistoryEntry[] = rawHistory
      .filter((entry): entry is AIConversationHistoryEntry => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return false;
        }
        const record = entry as Record<string, unknown>;
        return (
          (record.role === 'user' || record.role === 'assistant') &&
          typeof record.content === 'string' &&
          record.content.trim().length > 0
        );
      })
      .slice(-8);

    if (!question) {
      return;
    }
    if (!this._context) {
      this._postInlineCreate('sidebarImpactError', {
        sessionId,
        error: 'Workspace Advisor is not available until the extension context is ready.',
      });
      return;
    }

    try {
      const aiContext = await enrichAIModalContextWithProjectMarker(
        await resolveSidebarChatContext(payloadRecord)
      );
      this._postInlineCreate('sidebarImpactScope', {
        sessionId,
        scopeMode: payloadRecord.scopeMode,
        workspace: aiContext.workspaceRootPath
          ? { name: aiContext.name, path: aiContext.workspaceRootPath }
          : null,
        project: aiContext.projectRootPath
          ? {
              name: aiContext.type === 'project' ? aiContext.name : undefined,
              path: aiContext.projectRootPath,
              type: aiContext.framework,
            }
          : null,
      });
      this._postInlineCreate('sidebarImpactThinking', {
        sessionId,
        label: 'Reading workspace intelligence and impact context...',
      });

      const advisorPrompt = [
        'Respond as Workspai Workspace Advisor inside VS Code.',
        'Keep the answer concise, operational, and evidence-aware.',
        'Use these markdown sections when relevant: Answer, Evidence, Next safe step, Commands, Assumptions.',
        'Cite only workspace/project evidence available in context; if evidence is missing, say what is missing.',
        'Do not claim that files were changed or commands were run.',
        'Put runnable shell commands in bash code fences and say where to run them.',
        'Prefer one safest next step over a long generic checklist.',
        '',
        question,
      ].join('\n');
      const prepared = await prepareAIConversation('ask', advisorPrompt, aiContext, history);
      let answer = '';
      let modelId = '';

      if (readWorkspaiSettings().aiProvider !== 'vscode-lm') {
        const response = await askConfiguredAIProvider(this._context, prepared.messages);
        modelId = response.provider;
        answer = response.text;
        this._postInlineCreate('sidebarImpactChunk', { sessionId, text: response.text });
      } else {
        const streamResult = await streamAIResponse(
          prepared.messages,
          (chunk) => {
            if (chunk.text) {
              answer += chunk.text;
              this._postInlineCreate('sidebarImpactChunk', { sessionId, text: chunk.text });
            }
          },
          undefined,
          requestedModelId
        );
        modelId = streamResult.modelId;
      }

      this._postInlineCreate('sidebarImpactDone', { sessionId, modelId, answer });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._postInlineCreate('sidebarImpactError', { sessionId, error: message });
    }
  }

  private async _runSidebarAdvisorAction(payload: unknown): Promise<void> {
    const payloadRecord =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const action = typeof payloadRecord.action === 'string' ? payloadRecord.action : '';
    const sessionId =
      typeof payloadRecord.sessionId === 'string' ? payloadRecord.sessionId : undefined;
    try {
      if (action === 'studio') {
        const question =
          typeof payloadRecord.question === 'string' ? payloadRecord.question.trim() : '';
        const answer = typeof payloadRecord.answer === 'string' ? payloadRecord.answer.trim() : '';
        const sessionKind =
          typeof payloadRecord.sessionKind === 'string' ? payloadRecord.sessionKind : undefined;
        const isEditorIssueHandoff =
          sessionKind === 'editor-issue' || Boolean(payloadRecord.editorIssue);
        const advisorHandoff = isEditorIssueHandoff
          ? undefined
          : attachAdvisorHandoffSource(this._activeBlockerHandoff);
        const prefill = buildAdvisorStudioPrefill({
          question,
          answer,
          blockerHandoff: advisorHandoff,
          freshnessStatus: advisorHandoff?.verifyArtifact
            ? 'verify artifact cited - re-run verify before claiming pass'
            : 'unknown - verify before use',
        });
        if (advisorHandoff) {
          this._activeBlockerHandoff = advisorHandoff;
        }
        this._postInlineCreate('sidebarActivateTab', { tab: 'studio' });
        this._postInlineCreate('sidebarAdvisorStudioHandoff', {
          sessionId,
          prefill,
          handoffSource: 'advisor',
          scope: payloadRecord.scope,
          scopeMode: payloadRecord.scopeMode,
          sessionKind,
          ...(payloadRecord.editorIssue ? { editorIssue: payloadRecord.editorIssue } : {}),
          ...(advisorHandoff ? { blockerHandoff: advisorHandoff } : {}),
        });
        if (advisorHandoff) {
          this._postInlineCreate('sidebarBlockerHandoff', { handoff: advisorHandoff });
        }
        this._postInlineCreate('sidebarAdvisorActionResult', { sessionId, action, status: 'done' });
        return;
      }
      if (action === 'verify') {
        await vscode.commands.executeCommand('workspai.workspaceVerify', {
          source: 'workspai-secondary-sidebar',
          trigger: 'workspace-advisor-verify',
          scope: payloadRecord.scope,
        });
        this._postInlineCreate('sidebarAdvisorActionResult', { sessionId, action, status: 'done' });
        return;
      }
      if (action === 'copy') {
        const question =
          typeof payloadRecord.question === 'string' ? payloadRecord.question.trim() : '';
        const answer = typeof payloadRecord.answer === 'string' ? payloadRecord.answer.trim() : '';
        const scope =
          payloadRecord.scope &&
          typeof payloadRecord.scope === 'object' &&
          !Array.isArray(payloadRecord.scope)
            ? payloadRecord.scope
            : undefined;
        const text = [
          '# Workspace Advisor Plan',
          '',
          `Scope: ${JSON.stringify(scope ?? {})}`,
          question ? `Question: ${question}` : '',
          '',
          answer,
        ]
          .filter(Boolean)
          .join('\n');
        await vscode.env.clipboard.writeText(text);
        this._postInlineCreate('sidebarAdvisorActionResult', { sessionId, action, status: 'done' });
      }
    } catch (error) {
      console.warn('[Workspai] Workspace Advisor action failed', error);
      this._postInlineCreate('sidebarAdvisorActionResult', {
        sessionId,
        action,
        status: 'failed',
        title: 'Workspace Advisor action failed',
        summary: error instanceof Error ? error.message : String(error),
        error: error instanceof Error ? error.message : String(error),
        nextAction:
          'Review the latest Advisor answer, then retry the action or send the blocker to Studio.',
      });
    }
  }

  private async _runInlineStudioQuery(payload: unknown): Promise<void> {
    const payloadRecord =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const task = typeof payloadRecord.task === 'string' ? payloadRecord.task.trim() : '';
    const requestedModelId =
      typeof payloadRecord.modelId === 'string' && payloadRecord.modelId.trim().length > 0
        ? payloadRecord.modelId.trim()
        : undefined;
    const assistantMode = isWorkspaiAssistantMode(payloadRecord.assistantMode)
      ? payloadRecord.assistantMode
      : 'agent';
    const assistantModeContract = resolveWorkspaiAssistantModeContract(assistantMode);
    const sessionId =
      typeof payloadRecord.sessionId === 'string' && payloadRecord.sessionId.trim().length > 0
        ? payloadRecord.sessionId.trim()
        : undefined;
    const handoff =
      parseStudioBlockerHandoffPayload(payloadRecord.blockerHandoff) ?? this._activeBlockerHandoff;
    if (handoff) {
      this._activeBlockerHandoff = handoff;
    }
    if (!task) {
      return;
    }
    if (!this._context) {
      this._postInlineCreate('sidebarStudioError', {
        sessionId,
        error: 'Studio is not available until the extension context is ready.',
      });
      return;
    }

    try {
      const aiContext = await enrichAIModalContextWithProjectMarker(
        await resolveSidebarChatContext(payloadRecord)
      );
      this._postInlineCreate('sidebarStudioScope', {
        sessionId,
        scopeMode: payloadRecord.scopeMode,
        workspace: aiContext.workspaceRootPath
          ? { name: aiContext.name, path: aiContext.workspaceRootPath }
          : null,
        project: aiContext.projectRootPath
          ? {
              name: aiContext.type === 'project' ? aiContext.name : undefined,
              path: aiContext.projectRootPath,
              type: aiContext.framework,
            }
          : null,
      });
      this._postInlineCreate('sidebarStudioThinking', {
        sessionId,
        label:
          assistantModeContract.intent === 'repair-plan'
            ? 'Preparing an evidence-backed repair plan...'
            : 'Preparing the autonomous evidence repair...',
      });
      const autonomousWorkspacePath = handoff?.workspacePath ?? aiContext.workspaceRootPath;
      if (autonomousWorkspacePath) {
        await this._runUnifiedAssistantSession({
          task,
          sessionId,
          requestedModelId,
          assistantMode,
          workspacePath: autonomousWorkspacePath,
          projectPath: handoff?.projectPath ?? aiContext.projectRootPath,
          handoff,
        });
        return;
      }
      throw new Error('Select a Workspai workspace before starting an Assistant session.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._postInlineCreate('sidebarStudioError', { sessionId, error: message });
    }
  }

  private async _runUnifiedAssistantSession(input: {
    task: string;
    sessionId?: string;
    requestedModelId?: string;
    assistantMode: WorkspaiAssistantMode;
    workspacePath: string;
    projectPath?: string;
    handoff?: StudioBlockerHandoff;
  }): Promise<void> {
    if (input.assistantMode === 'agent' && input.handoff) {
      await this._runAutonomousStudioAgent({
        task: input.task,
        sessionId: input.sessionId,
        requestedModelId: input.requestedModelId,
        workspacePath: input.workspacePath,
        projectPath: input.projectPath,
        handoff: input.handoff,
      });
      return;
    }
    if (!this._context) {
      throw new Error('Workspai Assistant requires extension context.');
    }

    const mode = resolveWorkspaiAssistantModeContract(input.assistantMode);
    const store = new VSCodeStudioAgentSessionStore(this._context);
    const persistedCandidate = input.sessionId ? await store.load(input.sessionId) : undefined;
    const persisted =
      persistedCandidate &&
      persistedCandidate.workspacePath === input.workspacePath &&
      persistedCandidate.assistantMode === input.assistantMode &&
      persistedCandidate.status !== 'completed' &&
      persistedCandidate.status !== 'cancelled'
        ? persistedCandidate
        : undefined;
    let verifiedGoal: VerifiedGoalContractPayload | undefined = persisted?.goal;
    if (input.assistantMode === 'agent' && !verifiedGoal) {
      const intent = inferVerifiedGoalIntent({
        task: input.task,
        hasProjectScope: Boolean(input.projectPath),
      });
      if (intent) {
        const planExecution = await runRapidkitStreaming<unknown>({
          command: verifiedGoalPlanArgs({
            intent,
            projectName: input.projectPath
              ? path.basename(path.resolve(input.projectPath))
              : undefined,
          }),
          cwd: input.workspacePath,
          featureLabel: 'Verified engineering goal',
          timeoutMs: 2 * 60_000,
        });
        if (planExecution.failed || !planExecution.result) {
          throw new Error(
            planExecution.stderr ||
              planExecution.stdout ||
              'Workspai CLI could not create the verified goal contract.'
          );
        }
        verifiedGoal = parseVerifiedGoalPlanResult(planExecution.result).goal;
      }
    }
    const inspectedSource = new Map<string, string | null>();
    const evidenceUris = await vscode.workspace.findFiles(
      new vscode.RelativePattern(input.workspacePath, '.workspai/**/*'),
      '{**/.workspai/cache/**,**/.workspai/snapshots/**,**/*.tmp}',
      160
    );
    const authorizedEvidencePaths = evidenceUris.map((uri) =>
      path.relative(input.workspacePath, uri.fsPath).replace(/\\/g, '/')
    );
    const host: StudioAgentWorkspaiToolHost = {
      discover: async (request: { workspacePath: string; glob?: string; limit?: number }) => ({
        ok: true,
        output: {
          files: await discoverStudioWorkspaceFiles(request),
        },
      }),
      inspect: async (request: {
        paths: string[];
        kind: 'source' | 'evidence';
        workspacePath: string;
      }) => {
        const observations = await inspectStudioAgentFiles({
          workspacePath: request.workspacePath,
          paths: request.paths,
          kind: request.kind,
          authorizedEvidencePaths,
        });
        if (request.kind === 'source') {
          observations.forEach((entry) => inspectedSource.set(entry.path, entry.sha256));
        }
        return { ok: true, output: observations };
      },
      search: async (request: { query: string; paths?: string[]; workspacePath: string }) => {
        const include = request.paths?.length ? `{${request.paths.join(',')}}` : '**/*';
        const uris = await vscode.workspace.findFiles(
          new vscode.RelativePattern(request.workspacePath, include),
          '{**/.git/**,**/node_modules/**,**/dist/**,**/build/**,**/.workspai/cache/**}',
          120
        );
        const matches: Array<{ path: string; line: number; preview: string }> = [];
        for (const uri of uris) {
          if (matches.length >= 80) {
            break;
          }
          try {
            const lines = Buffer.from(await vscode.workspace.fs.readFile(uri))
              .toString('utf8')
              .split(/\r?\n/);
            lines.forEach((line, index) => {
              if (matches.length < 80 && line.includes(request.query)) {
                matches.push({
                  path: path.relative(request.workspacePath, uri.fsPath).replace(/\\/g, '/'),
                  line: index + 1,
                  preview: line.trim().slice(0, 240),
                });
              }
            });
          } catch {
            // Binary and transient files are skipped.
          }
        }
        return { ok: true, output: matches };
      },
      diagnostics: async (request: {
        paths?: string[];
        severities?: Array<'error' | 'warning' | 'information' | 'hint'>;
        workspacePath: string;
      }) => ({
        ok: true,
        output: {
          diagnostics: inspectStudioWorkspaceDiagnostics(request),
        },
      }),
      inspectChanges: async (request: { paths?: string[]; workspacePath: string }) => {
        try {
          return { ok: true, output: await inspectStudioWorkspaceChanges(request) };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      applyPatches: async (request: {
        patches: FilePatch[];
        transactionId: string;
        workspacePath: string;
        projectPath?: string;
      }) => {
        const normalized = normalizePatchesForWorkspaceScope({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          patches: request.patches,
        });
        if (verifiedGoal) {
          for (const patch of normalized) {
            if (!/(?:^|\/)package\.json$/i.test(patch.relativePath)) {
              continue;
            }
            const absolutePath = path.resolve(request.workspacePath, patch.relativePath);
            const originalContent = await fs.readFile(absolutePath, 'utf8').catch(() => null);
            if (originalContent !== null) {
              assertVerifiedGoalPackageManifestSafety({
                goal: verifiedGoal,
                relativePath: patch.relativePath,
                originalContent,
                patchedContent: patch.patchedContent,
              });
            }
          }
        }
        const unauthorized = await authorizeStudioWorkspacePatchTargets({
          workspacePath: request.workspacePath,
          patches: normalized,
          inspectedSource,
        });
        if (unauthorized.length > 0) {
          return {
            ok: false,
            error: `Inspect every target before editing: ${unauthorized.map((entry) => entry.relativePath).join(', ')}`,
          };
        }
        await this._assertSidebarStudioMutationAllowed({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          actionLabel: 'Workspai Assistant inspected workspace patch',
        });
        const result = await applyPatches({
          actionId: `assistant-${input.sessionId ?? input.assistantMode}`,
          workspacePath: request.workspacePath,
          patches: normalized,
          branchSafeApply: false,
          acceptedPaths: normalized.map((entry) => entry.relativePath),
          expectedBaseSha256: Object.fromEntries(inspectedSource),
        });
        if (result.appliedCount > 0) {
          this._rememberStudioAgentPatchTransaction(request.transactionId, {
            workspacePath: request.workspacePath,
            cardId: input.handoff?.cardId ?? `assistant:${input.assistantMode}`,
            sessionId: input.sessionId,
            patchResult: result,
          });
        }
        return {
          ok: result.failedCount === 0 && result.appliedCount > 0,
          changed: result.appliedCount > 0,
          output: result,
          ...(result.failedCount > 0
            ? { error: 'One or more inspected patches could not be applied.' }
            : {}),
        };
      },
      deleteFiles: async (request: {
        paths: string[];
        transactionId: string;
        workspacePath: string;
        projectPath?: string;
      }) => {
        if (
          verifiedGoal?.kind === 'dependency-security' &&
          !verifiedGoal.constraints.allowBreakingChanges &&
          request.paths.some((entry) =>
            /(?:^|\/)(?:package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.ya?ml|yarn\.lock|bun\.lockb?)$/i.test(
              entry
            )
          )
        ) {
          return {
            ok: false,
            error:
              'The verified dependency goal forbids deleting manifests or lockfiles without breaking-change authorization.',
          };
        }
        await this._assertSidebarStudioMutationAllowed({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          actionLabel: 'Workspai Assistant inspected file delete',
          governedRepair: { contractAuthorized: true, reversible: true },
        });
        try {
          const result = await deleteInspectedStudioWorkspaceFiles({
            workspacePath: request.workspacePath,
            paths: request.paths,
            inspectedSource,
            actionId: request.transactionId,
          });
          this._rememberStudioAgentPatchTransaction(request.transactionId, {
            workspacePath: request.workspacePath,
            cardId: input.handoff?.cardId ?? `assistant:${input.assistantMode}`,
            sessionId: input.sessionId,
            patchResult: result,
          });
          return { ok: true, changed: true, output: result };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      runGovernedCommand: async (request: {
        commandId: StudioEvidenceRefreshCommandId;
        workspacePath: string;
        projectPath?: string;
        reportProgress?: (data: Record<string, unknown>) => Promise<void>;
      }) => {
        const plan = resolveDashboardCommandExecutionPlan(request.commandId);
        if (request.commandId !== 'workspaceIntelligenceChain' && plan.cliArgs.length === 0) {
          return { ok: false, error: `No governed command exists for ${request.commandId}.` };
        }
        const cliArgs =
          request.commandId === 'workspaceAgentSync'
            ? preserveAllAgentConsumersForStudioRefresh(plan.cliArgs)
            : plan.cliArgs;
        const command =
          request.commandId === 'workspaceIntelligenceChain'
            ? [...STUDIO_CANONICAL_INTELLIGENCE_ARGS]
            : cliArgs;
        await this._assertSidebarStudioMutationAllowed({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          actionLabel: `Workspai Assistant ${request.commandId}`,
          commandText: buildRapidkitCommand(command),
        });
        let progressWrites = Promise.resolve();
        const execution = await runRapidkitStreaming<Record<string, unknown>>({
          command,
          cwd: request.workspacePath,
          featureLabel:
            request.commandId === 'workspaceIntelligenceChain'
              ? 'Workspace Intelligence'
              : request.commandId,
          timeoutMs: 10 * 60_000,
          onEvent: (event) => {
            if (!request.reportProgress) {
              return;
            }
            const progress =
              request.commandId === 'workspaceIntelligenceChain'
                ? resolveWorkspaceIntelligenceStreamProgress(event)
                : undefined;
            if (!progress) {
              return;
            }
            progressWrites = progressWrites
              .then(() => request.reportProgress?.(progress) ?? Promise.resolve())
              .then(() => undefined);
          },
        });
        await progressWrites;
        const evidenceRefreshCompleted =
          execution.failed === false && (execution.exitCode === 0 || execution.exitCode === 2);
        return {
          ok: evidenceRefreshCompleted,
          cardBlocking: execution.exitCode === 2,
          output: {
            commandId: request.commandId,
            exitCode: execution.exitCode,
            evidenceRefreshCompleted,
            result: execution.result,
            stdout: execution.stdout,
            stderr: execution.stderr,
          },
          ...(evidenceRefreshCompleted
            ? {}
            : {
                error:
                  execution.stderr ||
                  execution.stdout ||
                  `${request.commandId} exited with ${execution.exitCode}.`,
              }),
        };
      },
      runWorkspaceCommand: async (request: {
        request: StudioWorkspaceCommandRequest;
        workspacePath: string;
      }) => {
        try {
          if (verifiedGoal) {
            assertVerifiedGoalCommandSafety({
              goal: verifiedGoal,
              executable: request.request.executable,
              args: request.request.args,
            });
          }
          const plan = resolveStudioWorkspaceCommandPlan({
            workspacePath: request.workspacePath,
            request: request.request,
          });
          const before = plan.mutatesSource
            ? await captureStudioWorkspaceSourceSnapshot({
                workspacePath: request.workspacePath,
                scopePath: plan.cwd,
              })
            : undefined;
          const execution = await runStudioWorkspaceCommand(plan);
          const after = plan.mutatesSource
            ? await captureStudioWorkspaceSourceSnapshot({
                workspacePath: request.workspacePath,
                scopePath: plan.cwd,
              })
            : undefined;
          const changedPaths = diffStudioWorkspaceSourceSnapshots(before, after);
          const observedSourceChange = changedPaths.length > 0;
          const changed = plan.mutatesSource && observedSourceChange;
          return {
            ok: execution.exitCode === 0,
            changed,
            output: {
              ...execution,
              changedPaths,
              observedSourceChange,
            },
            ...(execution.exitCode === 0
              ? {}
              : {
                  error:
                    execution.stderr ||
                    execution.stdout ||
                    `Workspace command exited with ${execution.exitCode ?? 'no exit code'}.`,
                }),
          };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      completeDependencyTransaction: async (request: {
        projectNames?: string[];
        changedPaths?: string[];
        workspacePath: string;
        projectPath?: string;
      }) => {
        try {
          const before = await captureStudioWorkspaceSourceSnapshot({
            workspacePath: request.workspacePath,
            scopePath: request.projectPath ?? request.workspacePath,
          });
          const transaction = await completeStudioDependencyTransactions(request);
          const after = await captureStudioWorkspaceSourceSnapshot({
            workspacePath: request.workspacePath,
            scopePath: request.projectPath ?? request.workspacePath,
          });
          const changedPaths = diffStudioWorkspaceSourceSnapshots(before, after);
          return {
            ok: transaction.closureReady,
            changed: changedPaths.length > 0,
            output: {
              transaction,
              changedPaths,
              closureReady: transaction.closureReady,
              nextAction: transaction.closureReady
                ? 'workspace-intelligence-chain'
                : 'general-source-repair',
            },
            ...(transaction.closureReady
              ? {}
              : {
                  error:
                    'Dependency transaction is not closed. Use the unresolved audit candidates or repair the failed project-native validation before verification.',
                }),
          };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      inspectRemediationPlan: async () => ({
        ok: false,
        error: 'A blocker card is required to resolve a governed remediation plan.',
      }),
      executeRemediationStep: async () => ({
        ok: false,
        error: 'A blocker card is required to execute a governed remediation step.',
      }),
      inspectDependencySecurity: async () => ({
        ok: false,
        error: 'A blocker card is required to inspect dependency security evidence.',
      }),
      repairDependencySecurity: async () => ({
        ok: false,
        error: 'A blocker card is required to repair dependency security evidence.',
      }),
      upgradeDependencySecurity: async () => ({
        ok: false,
        error: 'A blocker card is required to upgrade a vulnerable dependency.',
      }),
      verify: async (request: { workspacePath: string; projectPath?: string; goalId?: string }) => {
        if (request.goalId || verifiedGoal) {
          const goalId = request.goalId ?? verifiedGoal?.id;
          if (!goalId) {
            return { ok: false, cardBlocking: true, error: 'Verified goal id is unavailable.' };
          }
          const execution = await runRapidkitStreaming<unknown>({
            command: verifiedGoalVerifyArgs(goalId),
            cwd: request.workspacePath,
            featureLabel: 'Verified engineering goal',
            timeoutMs: 20 * 60_000,
          });
          let status: ReturnType<typeof parseVerifiedGoalVerifyResult>['status'] | undefined;
          let returnedGoal: VerifiedGoalContractPayload | undefined;
          try {
            if (execution.result) {
              const parsed = parseVerifiedGoalVerifyResult(execution.result);
              status = parsed.status;
              returnedGoal = parsed.goal;
            }
          } catch {
            // The command failure below preserves bounded stdout/stderr for the
            // model while refusing to interpret an incompatible result as success.
          }
          const verified =
            execution.exitCode === 0 && status?.goalId === goalId && status.state === 'verified';
          return {
            ok: verified,
            cardBlocking: !verified,
            output: {
              goal: returnedGoal ?? verifiedGoal,
              status,
              exitCode: execution.exitCode,
              stdout: execution.stdout,
              stderr: execution.stderr,
            },
            ...(verified
              ? {}
              : {
                  error:
                    status?.blockingReasons?.[0] ||
                    execution.stderr ||
                    execution.stdout ||
                    'Verified goal criteria are not yet satisfied.',
                }),
          };
        }
        const command = buildRapidkitCommand(['workspace', 'verify', '--json']);
        const execution = await runIncidentInlineCommand({
          command,
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          actionId: 'assistant-workspace-verify',
        });
        return {
          ok: execution.success,
          cardBlocking: !execution.success,
          output: execution,
          ...(execution.success
            ? {}
            : { error: execution.error ?? execution.stderrTail ?? 'Workspace verify failed.' }),
        };
      },
    };
    const scopeId = verifiedGoal?.id ?? input.handoff?.cardId ?? `assistant:${input.assistantMode}`;
    const registry = createStudioAgentWorkspaiToolRegistry({
      host,
      cardId: scopeId,
      assistantMode: input.assistantMode,
      ...(verifiedGoal ? { goalId: verifiedGoal.id } : {}),
    });
    const options = {
      id: input.sessionId,
      workspacePath: input.workspacePath,
      ...(input.projectPath ? { projectPath: input.projectPath } : {}),
      cardId: scopeId,
      assistantMode: input.assistantMode,
      ...(input.requestedModelId ? { selectedModelId: input.requestedModelId } : {}),
      permissionLevel: mode.permissionLevel,
      requiresVerifiedCompletion: mode.requiresVerifiedCompletion,
      workspaceTrusted: vscode.workspace.isTrusted,
      ...(verifiedGoal ? { goal: verifiedGoal } : {}),
      ...(persisted ? { restoredSession: persisted } : {}),
    };
    const model = new ContractStudioAgentModelAdapter(input.task, async (prompt, request) => {
      const response = await askConfiguredAIProviderForToolAction(
        this._context!,
        [{ role: 'user', content: prompt }],
        request.tools,
        undefined,
        input.requestedModelId
      );
      return response.type === 'tool'
        ? { toolName: response.toolName, input: response.input }
        : response.text;
    });
    const session = new StudioAgentSession(options, model, registry, store);
    session.onEvent((event) => this._postInlineCreate('sidebarStudioAgentEvent', { event }));
    this._activeStudioAgentSessions.set(session.id, session);
    const completed = await session.run(input.task).finally(() => {
      if (this._activeStudioAgentSessions.get(session.id) === session) {
        this._activeStudioAgentSessions.delete(session.id);
      }
    });
    const completion = [...completed.events]
      .reverse()
      .find((event) => event.type === 'session.completed');
    const summary =
      completion && typeof (completion.data as { summary?: unknown }).summary === 'string'
        ? String((completion.data as { summary: string }).summary)
        : undefined;
    if (completed.status === 'completed' && summary) {
      this._postInlineCreate('sidebarStudioDone', {
        sessionId: completed.id,
        modelId: completed.selectedModelId ?? 'auto',
        assistantMode: completed.assistantMode,
        answer: summary,
      });
      return;
    }
    const failure = [...completed.events]
      .reverse()
      .find((event) => event.type === 'session.failed');
    const failureData =
      failure && failure.data && typeof failure.data === 'object' && !Array.isArray(failure.data)
        ? (failure.data as Record<string, unknown>)
        : undefined;
    const failureMessage =
      typeof failureData?.error === 'string' ? String(failureData.error) : undefined;
    this._postInlineCreate('sidebarStudioError', {
      sessionId: completed.id,
      ...(failureData?.requiresUserDecision === true
        ? {
            requiresUserDecision: true,
            terminalReason:
              typeof failureData.terminalReason === 'string'
                ? failureData.terminalReason
                : 'review-required',
          }
        : {}),
      error:
        completed.status === 'cancelled'
          ? 'Assistant session was cancelled.'
          : (failureMessage ??
            'Assistant session did not complete. The durable session can resume.'),
    });
  }

  private async _runAutonomousStudioAgent(input: {
    task: string;
    sessionId?: string;
    requestedModelId?: string;
    workspacePath: string;
    projectPath?: string;
    handoff: StudioBlockerHandoff;
  }): Promise<void> {
    const executionInput =
      input.handoff.scope === 'project'
        ? {
            ...input,
            projectPath: input.projectPath ?? input.handoff.projectPath,
          }
        : {
            ...input,
            projectPath: undefined,
          };
    const repairScopeKey = [
      path.resolve(executionInput.workspacePath),
      executionInput.handoff.scope,
      executionInput.handoff.scope === 'project'
        ? path.resolve(
            executionInput.projectPath ??
              executionInput.handoff.projectPath ??
              executionInput.workspacePath
          )
        : 'workspace',
      executionInput.handoff.cardId,
    ].join('::');
    const activeRun = this._activeStudioAgentRepairRuns.get(repairScopeKey);
    if (activeRun) {
      const activeSession = [...this._activeStudioAgentSessions.values()].find((session) => {
        const snapshot = session.snapshot();
        return (
          snapshot.status === 'running' &&
          path.resolve(snapshot.workspacePath) === path.resolve(executionInput.workspacePath) &&
          snapshot.cardId === executionInput.handoff.cardId
        );
      });
      activeSession?.steer(
        [
          'The same card produced refreshed evidence while this repair is still active.',
          `Current blockers: ${executionInput.handoff.blockers.join('; ')}`,
          `Current blocker signature: ${executionInput.handoff.blockerSignature}`,
          'Continue the existing source transaction; do not start another repair loop.',
        ].join('\n')
      );
      this._postInlineCreate('sidebarStudioActionResult', {
        sessionId: executionInput.sessionId ?? activeSession?.id,
        cardId: executionInput.handoff.cardId,
        action: 'auto-fix',
        status: 'running',
        phase: 'continuing-agent',
        title: 'Continuing the active repair',
        summary:
          'A repair already owns this workspace card. Studio merged the refreshed blocker into that durable session instead of starting a competing loop.',
      });
      await activeRun;
      return;
    }
    const ownedRun = this._runAutonomousStudioAgentOwned(executionInput);
    this._activeStudioAgentRepairRuns.set(repairScopeKey, ownedRun);
    try {
      await ownedRun;
    } finally {
      if (this._activeStudioAgentRepairRuns.get(repairScopeKey) === ownedRun) {
        this._activeStudioAgentRepairRuns.delete(repairScopeKey);
      }
    }
  }

  private async _runAutonomousStudioAgentOwned(input: {
    task: string;
    sessionId?: string;
    requestedModelId?: string;
    workspacePath: string;
    projectPath?: string;
    handoff: StudioBlockerHandoff;
  }): Promise<void> {
    if (!this._context) {
      throw new Error('Studio Agent requires extension context.');
    }
    let activeHandoff = input.handoff;
    let repairEvidence = await collectSidebarStudioRepairEvidence({
      workspacePath: input.workspacePath,
      projectPath: input.projectPath,
      handoff: activeHandoff,
    });
    const objective = [
      input.task,
      `Card: ${input.handoff.cardLabel ?? input.handoff.cardId}`,
      `Blockers: ${input.handoff.blockers.join('; ')}`,
      `Verify command: ${input.handoff.verifyCommand ?? 'resolve from governed evidence'}`,
      'Use Studio inspect tools to load file bodies only when needed. Generated reports must be refreshed through their governed producers, never patched.',
      `Evidence generation: ${repairEvidence.evidenceFingerprint}`,
      `Authorized evidence paths: ${JSON.stringify(repairEvidence.authorizedEvidencePaths.slice(0, 20))}`,
      `Initial source candidates (not exclusive; inspect-source dynamically authorizes any workspace source): ${JSON.stringify(repairEvidence.autonomousTargetPaths.slice(0, 20))}`,
      `Missing required evidence: ${JSON.stringify(repairEvidence.missingRequired.slice(0, 20))}`,
    ].join('\n\n');
    const commandGenerations = new Map<StudioEvidenceRefreshCommandId, string>();
    const commandAttempts = new Map<
      StudioEvidenceRefreshCommandId,
      { blockerSignature?: string; evidenceGeneration: string; count: number }
    >();
    const remediationStepAttempts = new Map<string, { blockerSignature?: string; count: number }>();
    const dependencyRepairAttempts = new Map<string, StudioDependencyRepairAttempt>();
    const dependencyUpgradeCandidates = new Map<string, StudioDependencyUpgradeCandidate[]>();
    const inspectedSource = new Map<string, string | null>();
    let activeBlockerSignature = activeHandoff.blockerSignature;

    const refreshDependencyDoctorEvidence = async (workspacePath: string) => {
      const plan = resolveDashboardCommandExecutionPlan('checkWorkspaceHealth');
      if (plan.cliArgs.length === 0) {
        throw new Error('Doctor evidence producer is unavailable.');
      }
      const command = buildRapidkitCommand(plan.cliArgs);
      const execution = await runIncidentInlineCommand({
        command,
        workspacePath,
        actionId: 'studio-session-dependency-doctor-refresh',
      });
      if (![0, 1, 2].includes(execution.exitCode ?? -1)) {
        throw new Error(
          execution.error ?? execution.stderrTail ?? 'Doctor evidence refresh failed.'
        );
      }
      repairEvidence = await collectSidebarStudioRepairEvidence({
        workspacePath,
        projectPath: input.projectPath,
        handoff: activeHandoff,
      });
      return execution;
    };

    const host: StudioAgentWorkspaiToolHost = {
      discover: async (request: { workspacePath: string; glob?: string; limit?: number }) => ({
        ok: true,
        output: {
          files: await discoverStudioWorkspaceFiles(request),
        },
        evidenceGeneration: repairEvidence.evidenceFingerprint,
      }),
      inspect: async (request: {
        paths: string[];
        kind: 'source' | 'evidence';
        workspacePath: string;
      }) => {
        const observations = await inspectStudioAgentFiles({
          workspacePath: request.workspacePath,
          paths: request.paths,
          kind: request.kind,
          authorizedEvidencePaths: repairEvidence.authorizedEvidencePaths,
        });
        if (request.kind === 'source') {
          for (const observation of observations) {
            inspectedSource.set(observation.path, observation.sha256);
            repairEvidence.expectedBaseSha256[observation.path] = observation.sha256;
          }
        }
        return {
          ok: true,
          output: observations,
          evidenceGeneration: repairEvidence.evidenceFingerprint,
        };
      },
      search: async (request: { query: string; paths?: string[]; workspacePath: string }) => {
        const include = request.paths?.length ? `{${request.paths.join(',')}}` : '**/*';
        const uris = await vscode.workspace.findFiles(
          new vscode.RelativePattern(request.workspacePath, include),
          '{**/.git/**,**/node_modules/**,**/dist/**,**/build/**,**/.workspai/cache/**}',
          120
        );
        const matches: Array<{ path: string; line: number; preview: string }> = [];
        for (const uri of uris) {
          if (matches.length >= 80) {
            break;
          }
          try {
            const content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
            const lines = content.split(/\r?\n/);
            lines.forEach((line, index) => {
              if (matches.length < 80 && line.includes(request.query)) {
                matches.push({
                  path: path.relative(request.workspacePath, uri.fsPath).replace(/\\/g, '/'),
                  line: index + 1,
                  preview: line.trim().slice(0, 240),
                });
              }
            });
          } catch {
            // Binary, inaccessible, and transient files are intentionally skipped.
          }
        }
        return { ok: true, output: matches };
      },
      diagnostics: async (request: {
        paths?: string[];
        severities?: Array<'error' | 'warning' | 'information' | 'hint'>;
        workspacePath: string;
      }) => ({
        ok: true,
        output: {
          diagnostics: inspectStudioWorkspaceDiagnostics(request),
        },
        evidenceGeneration: repairEvidence.evidenceFingerprint,
      }),
      inspectChanges: async (request: { paths?: string[]; workspacePath: string }) => {
        try {
          return {
            ok: true,
            output: await inspectStudioWorkspaceChanges(request),
            evidenceGeneration: repairEvidence.evidenceFingerprint,
          };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      applyPatches: async (request: {
        patches: FilePatch[];
        transactionId: string;
        workspacePath: string;
        projectPath?: string;
      }) => {
        const normalized = normalizePatchesForWorkspaceScope({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          patches: request.patches,
        });
        const generatedEvidencePatches = normalized.filter((patch) =>
          /^(?:\.workspai|\.rapidkit)\/reports\//.test(patch.relativePath)
        );
        if (generatedEvidencePatches.length > 0) {
          return {
            ok: false,
            error: `Generated evidence must be refreshed through its governed producer, not patched directly: ${generatedEvidencePatches
              .map((patch) => patch.relativePath)
              .join(', ')}`,
          };
        }
        const staticTargets = new Set(repairEvidence.autonomousTargetPaths);
        const uninspectedOrNew = await authorizeStudioWorkspacePatchTargets({
          workspacePath: request.workspacePath,
          patches: normalized,
          inspectedSource,
        });
        const unauthorized = uninspectedOrNew.filter(
          (patch) => !staticTargets.has(patch.relativePath)
        );
        inspectedSource.forEach((hash, entry) => {
          repairEvidence.expectedBaseSha256[entry] = hash;
        });
        if (unauthorized.length > 0) {
          return {
            ok: false,
            error: `Patch targets are not contract-authorized: ${unauthorized
              .map((patch) => patch.relativePath)
              .join(', ')}`,
          };
        }
        await this._assertSidebarStudioMutationAllowed({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          actionLabel: 'Studio Agent workspace patch',
          governedRepair: {
            contractAuthorized: true,
            reversible: true,
          },
        });
        const prepared = await preparePatchesForReview({
          workspacePath: request.workspacePath,
          patches: normalized,
          expectedBaseSha256: repairEvidence.expectedBaseSha256,
        });
        const result = await applySidebarPendingPatches({
          workspacePath: request.workspacePath,
          handoff: activeHandoff,
          patches: prepared,
          acceptedPaths: prepared.map((patch) => patch.relativePath),
        });
        if (result.status === 'applied' && result.patchResult?.appliedCount) {
          this._rememberStudioAgentPatchTransaction(request.transactionId, {
            workspacePath: request.workspacePath,
            cardId: activeHandoff.cardId,
            sessionId: input.sessionId,
            patchResult: result.patchResult,
          });
          repairEvidence = await collectSidebarStudioRepairEvidence({
            workspacePath: request.workspacePath,
            projectPath: request.projectPath,
            handoff: activeHandoff,
          });
        }
        return {
          ok: result.status === 'applied',
          changed: result.status === 'applied',
          evidenceGeneration: repairEvidence.evidenceFingerprint,
          output: result,
          ...(result.status === 'applied' ? {} : { error: result.summary }),
        };
      },
      deleteFiles: async (request: {
        paths: string[];
        transactionId: string;
        workspacePath: string;
        projectPath?: string;
      }) => {
        await this._assertSidebarStudioMutationAllowed({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          actionLabel: 'Studio Agent inspected file delete',
          governedRepair: { contractAuthorized: true, reversible: true },
        });
        try {
          const result = await deleteInspectedStudioWorkspaceFiles({
            workspacePath: request.workspacePath,
            paths: request.paths,
            inspectedSource,
            actionId: request.transactionId,
          });
          this._rememberStudioAgentPatchTransaction(request.transactionId, {
            workspacePath: request.workspacePath,
            cardId: activeHandoff.cardId,
            sessionId: input.sessionId,
            patchResult: result,
          });
          repairEvidence = await collectSidebarStudioRepairEvidence({
            workspacePath: request.workspacePath,
            projectPath: request.projectPath,
            handoff: activeHandoff,
          });
          return {
            ok: true,
            changed: true,
            evidenceGeneration: repairEvidence.evidenceFingerprint,
            output: result,
          };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      runGovernedCommand: async (request: {
        commandId: StudioEvidenceRefreshCommandId;
        workspacePath: string;
        projectPath?: string;
        reportProgress?: (data: Record<string, unknown>) => Promise<void>;
      }) => {
        const priorAttempt = commandAttempts.get(request.commandId);
        const attemptsForBlocker =
          priorAttempt?.blockerSignature === activeBlockerSignature &&
          priorAttempt.evidenceGeneration === repairEvidence.evidenceFingerprint
            ? priorAttempt.count
            : 0;
        if (attemptsForBlocker >= 2) {
          return {
            ok: false,
            evidenceGeneration: repairEvidence.evidenceFingerprint,
            blockerSignature: activeBlockerSignature,
            error: `${request.commandId} already ran twice for the same semantic blocker. Do not refresh again; inspect its output and repair the source cause or choose the next dependency.`,
          };
        }
        commandAttempts.set(request.commandId, {
          blockerSignature: activeBlockerSignature,
          evidenceGeneration: repairEvidence.evidenceFingerprint,
          count: attemptsForBlocker + 1,
        });
        const observedGeneration = commandGenerations.get(request.commandId);
        if (observedGeneration === repairEvidence.evidenceFingerprint) {
          return {
            ok: false,
            evidenceGeneration: repairEvidence.evidenceFingerprint,
            error: `${request.commandId} already ran against this evidence generation. Inspect the observation or choose the next producer in the chain.`,
          };
        }
        commandGenerations.set(request.commandId, repairEvidence.evidenceFingerprint);
        const plan = resolveDashboardCommandExecutionPlan(request.commandId);
        if (request.commandId !== 'workspaceIntelligenceChain' && plan.cliArgs.length === 0) {
          return { ok: false, error: `No governed command exists for ${request.commandId}.` };
        }
        const cliArgs =
          request.commandId === 'workspaceAgentSync'
            ? preserveAllAgentConsumersForStudioRefresh(plan.cliArgs)
            : plan.cliArgs;
        const command =
          request.commandId === 'workspaceIntelligenceChain'
            ? STUDIO_CANONICAL_INTELLIGENCE_COMMAND
            : buildRapidkitCommand(cliArgs);
        await this._assertSidebarStudioMutationAllowed({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          actionLabel: `Studio Agent ${request.commandId}`,
          commandText: command,
        });
        const execution =
          request.commandId === 'workspaceIntelligenceChain'
            ? await (async () => {
                let progressWrites = Promise.resolve();
                const streamed = await runRapidkitStreaming({
                  command: [...STUDIO_CANONICAL_INTELLIGENCE_ARGS],
                  cwd: request.workspacePath,
                  featureLabel: 'Workspace Intelligence',
                  timeoutMs: 10 * 60_000,
                  onEvent: (event) => {
                    const progress = resolveWorkspaceIntelligenceStreamProgress(event);
                    if (
                      !progress ||
                      progress.kind !== 'stage' ||
                      progress.status !== 'started' ||
                      !request.reportProgress
                    ) {
                      return;
                    }
                    progressWrites = progressWrites.then(() =>
                      request.reportProgress!({
                        intelligencePhase: progress.id,
                        intelligenceMilestoneKind: progress.kind,
                        intelligenceMilestoneStatus: progress.status,
                        message: progress.message,
                      })
                    );
                  },
                });
                await progressWrites;
                const producerCompleted = streamed.exitCode === 0 || streamed.exitCode === 2;
                const lifecycleMessage = streamed.lastLifecycleEvent?.message?.trim();
                const stderrTail = streamed.stderr.trim().split('\n').filter(Boolean).pop();
                return {
                  command,
                  success: producerCompleted,
                  exitCode: streamed.exitCode,
                  output: streamed.result
                    ? JSON.stringify(streamed.result).slice(0, 12_000)
                    : undefined,
                  stderrTail: producerCompleted ? undefined : stderrTail,
                  ...(producerCompleted
                    ? {}
                    : {
                        error:
                          lifecycleMessage ||
                          stderrTail ||
                          `Workspace Intelligence exited with code ${streamed.exitCode}.`,
                      }),
                };
              })()
            : await runIncidentInlineCommand({
                command,
                workspacePath: request.workspacePath,
                projectPath: request.projectPath,
                actionId: `studio-session-${request.commandId}`,
              });
        repairEvidence = await collectSidebarStudioRepairEvidence({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          handoff: activeHandoff,
        });
        const producerCompleted = execution.exitCode === 0 || execution.exitCode === 2;
        const intelligenceRun =
          request.commandId === 'workspaceIntelligenceChain'
            ? await fs
                .readJson(
                  path.join(
                    request.workspacePath,
                    '.workspai',
                    'reports',
                    'workspace-intelligence-run-last-run.json'
                  )
                )
                .catch(() => undefined)
            : undefined;
        const intelligencePhase = resolveWorkspaceIntelligenceRunStage(intelligenceRun);
        const intelligencePreflight = resolveWorkspaceIntelligenceRunPreflight(intelligenceRun);
        return {
          ok: producerCompleted,
          changed: false,
          ...(intelligencePhase ? { intelligencePhase } : {}),
          evidenceGeneration: repairEvidence.evidenceFingerprint,
          output: {
            ...execution,
            ...(intelligencePhase ? { intelligencePhase } : {}),
            ...(intelligencePreflight ? { intelligencePreflight } : {}),
          },
          ...(producerCompleted
            ? {}
            : { error: execution.error ?? execution.stderrTail ?? 'Governed command failed.' }),
        };
      },
      runWorkspaceCommand: async (request: {
        request: StudioWorkspaceCommandRequest;
        workspacePath: string;
        projectPath?: string;
      }) => {
        try {
          const plan = resolveStudioWorkspaceCommandPlan({
            workspacePath: request.workspacePath,
            request: request.request,
          });
          if (plan.mutatesSource) {
            await this._assertSidebarStudioMutationAllowed({
              workspacePath: request.workspacePath,
              projectPath: request.projectPath,
              actionLabel: `Studio Agent workspace command: ${plan.displayCommand}`,
              commandText: plan.displayCommand,
            });
          }
          const before = plan.mutatesSource
            ? await captureStudioWorkspaceSourceSnapshot({
                workspacePath: request.workspacePath,
                scopePath: plan.cwd,
              })
            : undefined;
          const execution = await runStudioWorkspaceCommand(plan);
          const after = plan.mutatesSource
            ? await captureStudioWorkspaceSourceSnapshot({
                workspacePath: request.workspacePath,
                scopePath: plan.cwd,
              })
            : undefined;
          const changedPaths = diffStudioWorkspaceSourceSnapshots(before, after);
          const observedSourceChange = changedPaths.length > 0;
          const changed = plan.mutatesSource && observedSourceChange;
          if (changed) {
            repairEvidence = await collectSidebarStudioRepairEvidence({
              workspacePath: request.workspacePath,
              projectPath: request.projectPath,
              handoff: activeHandoff,
            });
            await this._auditSidebarStudioFix({
              sessionId: input.sessionId,
              workspacePath: request.workspacePath,
              handoff: activeHandoff,
              kind: 'auto-fix',
              actionId: `studio-agent-command:${plan.executable}`,
              summary: `Workspace command completed: ${plan.displayCommand}`,
              ok: true,
              appliedFixes: [],
            });
          }
          return {
            ok: execution.exitCode === 0,
            changed,
            evidenceGeneration: repairEvidence.evidenceFingerprint,
            output: {
              ...execution,
              changedPaths,
              observedSourceChange,
            },
            ...(execution.exitCode === 0
              ? {}
              : {
                  error:
                    execution.stderr ||
                    execution.stdout ||
                    `Workspace command exited with ${execution.exitCode ?? 'no exit code'}.`,
                }),
          };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      completeDependencyTransaction: async (request: {
        projectNames?: string[];
        changedPaths?: string[];
        workspacePath: string;
        projectPath?: string;
      }) => {
        try {
          await this._assertSidebarStudioMutationAllowed({
            workspacePath: request.workspacePath,
            projectPath: request.projectPath,
            actionLabel: 'Studio Agent dependency repair transaction',
            governedRepair: { contractAuthorized: true, reversible: true },
          });
          const before = await captureStudioWorkspaceSourceSnapshot({
            workspacePath: request.workspacePath,
            scopePath: request.projectPath ?? request.workspacePath,
          });
          const transaction = await completeStudioDependencyTransactions(request);
          const after = await captureStudioWorkspaceSourceSnapshot({
            workspacePath: request.workspacePath,
            scopePath: request.projectPath ?? request.workspacePath,
          });
          const changedPaths = diffStudioWorkspaceSourceSnapshots(before, after);
          if (changedPaths.length > 0) {
            repairEvidence = await collectSidebarStudioRepairEvidence({
              workspacePath: request.workspacePath,
              projectPath: request.projectPath,
              handoff: activeHandoff,
            });
          }
          return {
            ok: transaction.closureReady,
            changed: changedPaths.length > 0,
            evidenceGeneration: repairEvidence.evidenceFingerprint,
            output: {
              transaction,
              changedPaths,
              closureReady: transaction.closureReady,
              nextAction: transaction.closureReady
                ? 'workspace-intelligence-chain'
                : 'general-source-repair',
              ...(transaction.closureReady
                ? {}
                : {
                    fallbackCapability: 'general-source-repair',
                    recommendedTools: [
                      'inspect-source',
                      'run-workspace-command',
                      'apply-workspace-patch',
                      'inspect-workspace-changes',
                    ],
                  }),
            },
            ...(transaction.closureReady
              ? {}
              : {
                  error:
                    'Dependency transaction is not closed. Resolve the remaining audit or project-native validation failure before the governed intelligence chain.',
                }),
          };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      inspectRemediationPlan: async (request: { workspacePath: string; projectPath?: string }) => {
        clearDoctorRemediationPlanCache();
        const plan = await readDoctorRemediationPlanForStudio({
          workspacePath: request.workspacePath,
          handoff: {
            ...activeHandoff,
            ...(request.projectPath ? { projectPath: request.projectPath } : {}),
          },
          maxSteps: 64,
        });
        if (!plan) {
          return {
            ok: false,
            evidenceGeneration: repairEvidence.evidenceFingerprint,
            error:
              'No contract-authored remediation plan is available. Run the workspaceRemediationPlan governed producer first.',
          };
        }
        return {
          ok: plan.freshness.verdict !== 'stale',
          evidenceGeneration: repairEvidence.evidenceFingerprint,
          output: {
            schemaVersion: plan.schemaVersion,
            sourcePath: plan.sourcePath,
            generatedAt: plan.generatedAt,
            policyProfile: plan.policyProfile,
            scope: plan.scope,
            freshness: plan.freshness,
            hiddenStepCount: plan.hiddenStepCount,
            steps: plan.visibleSteps.map((step) => ({
              id: step.id,
              order: step.order,
              phase: step.phase,
              projectName: step.projectName,
              projectPath: step.projectPath,
              risk: step.risk,
              executable: step.executable,
              studioState: step.studioState,
              studioReason: step.studioReason,
              primaryAction: step.primaryAction,
              previewTitle: step.previewTitle,
              previewSummary: step.previewSummary,
              diffSummary: step.diffSummary,
              files: step.files,
              canApply: step.canApply,
              hasDeterministicOperation: Boolean(step.operation),
              verifyCommand: step.verifyCommand,
            })),
          },
          ...(plan.freshness.verdict === 'stale'
            ? {
                error:
                  plan.freshness.reason ??
                  'The remediation plan is stale. Refresh its governed source evidence first.',
              }
            : {}),
        };
      },
      executeRemediationStep: async (request: {
        stepId: string;
        workspacePath: string;
        projectPath?: string;
      }) => {
        const priorAttempt = remediationStepAttempts.get(request.stepId);
        const attemptsForBlocker =
          priorAttempt?.blockerSignature === activeBlockerSignature ? priorAttempt.count : 0;
        if (attemptsForBlocker >= 2) {
          return {
            ok: false,
            evidenceGeneration: repairEvidence.evidenceFingerprint,
            blockerSignature: activeBlockerSignature,
            error: `${request.stepId} already ran twice for the same semantic blocker. Inspect the result and repair the next causal blocker instead of repeating it.`,
          };
        }
        remediationStepAttempts.set(request.stepId, {
          blockerSignature: activeBlockerSignature,
          count: attemptsForBlocker + 1,
        });

        clearDoctorRemediationPlanCache();
        const plan = await readDoctorRemediationPlanForStudio({
          workspacePath: request.workspacePath,
          handoff: {
            ...activeHandoff,
            ...(request.projectPath ? { projectPath: request.projectPath } : {}),
          },
          maxSteps: 64,
        });
        if (!plan) {
          return {
            ok: false,
            evidenceGeneration: repairEvidence.evidenceFingerprint,
            error:
              'No contract-authored remediation plan is available. Run the workspaceRemediationPlan governed producer first.',
          };
        }
        if (plan.freshness.verdict === 'stale') {
          return {
            ok: false,
            evidenceGeneration: repairEvidence.evidenceFingerprint,
            error:
              plan.freshness.reason ??
              'The remediation plan is stale. Refresh its governed source evidence first.',
          };
        }
        const step = plan.visibleSteps.find((entry) => entry.id === request.stepId);
        if (!step) {
          return {
            ok: false,
            evidenceGeneration: repairEvidence.evidenceFingerprint,
            error: `Remediation step ${request.stepId} is not present in the latest plan. Inspect the plan again.`,
          };
        }
        if (step.risk === 'invasive') {
          return {
            ok: false,
            evidenceGeneration: repairEvidence.evidenceFingerprint,
            error: `Remediation step ${step.id} is invasive and cannot run in unattended Agent mode.`,
          };
        }
        if (step.studioState !== 'ready' && step.studioState !== 'review-required') {
          return {
            ok: false,
            evidenceGeneration: repairEvidence.evidenceFingerprint,
            error: step.studioReason || `Remediation step ${step.id} is not executable.`,
          };
        }
        const stepProjectPath = await resolveProjectPathFromRemediationStep({
          step,
          workspacePath: request.workspacePath,
          handoffProjectPath: activeHandoff.projectPath,
          scopeProjectPath: request.projectPath,
        });

        let ok = false;
        let changed = false;
        let output: unknown;
        let error: string | undefined;
        let changedPaths: string[] = [];
        let appliedFixes: Array<{ path: string; action: string; outcome: string }> = [];
        if (step.canApply && step.operation) {
          await this._assertSidebarStudioMutationAllowed({
            workspacePath: request.workspacePath,
            projectPath: stepProjectPath,
            actionLabel: `Studio Agent remediation step ${step.id}`,
          });
          const applyResult = await applyDoctorRemediationStep({
            workspacePath: request.workspacePath,
            step,
          });
          ok = applyResult.status === 'applied';
          appliedFixes = applyResult.appliedFixes;
          changed = appliedFixes.some((entry) => entry.outcome === 'applied');
          output = { stepId: step.id, kind: 'deterministic-operation', applyResult };
          error = ok ? undefined : applyResult.summary;
        } else if (step.executable && step.originalCommand.trim()) {
          const command = step.originalCommand.trim();
          if (isInternalDoctorRepairCommand(command)) {
            return {
              ok: false,
              evidenceGeneration: repairEvidence.evidenceFingerprint,
              error: `Internal remediation token ${step.id} has no deterministic operation in the latest plan. Refresh the plan instead of executing the token.`,
            };
          }
          await this._assertSidebarStudioMutationAllowed({
            workspacePath: request.workspacePath,
            projectPath: stepProjectPath,
            actionLabel: `Studio Agent remediation command ${step.id}`,
            commandText: command,
          });
          const before = await captureStudioWorkspaceSourceSnapshot({
            workspacePath: request.workspacePath,
            scopePath: stepProjectPath ?? request.workspacePath,
          });
          const execution = await runIncidentInlineCommand({
            command,
            workspacePath: request.workspacePath,
            projectPath: stepProjectPath,
            actionId: `studio-session-remediation-${step.id}`,
          });
          const after = await captureStudioWorkspaceSourceSnapshot({
            workspacePath: request.workspacePath,
            scopePath: stepProjectPath ?? request.workspacePath,
          });
          changedPaths = diffStudioWorkspaceSourceSnapshots(before, after);
          ok = execution.success;
          changed = changedPaths.length > 0;
          output = {
            stepId: step.id,
            kind: 'contract-command',
            execution,
            changedPaths,
            observedSourceChange: changed,
          };
          error = execution.success
            ? undefined
            : (execution.error ?? execution.stderrTail ?? `Remediation step ${step.id} failed.`);
        } else {
          return {
            ok: false,
            evidenceGeneration: repairEvidence.evidenceFingerprint,
            error: `Remediation step ${step.id} has neither a deterministic operation nor an executable contract command.`,
          };
        }

        clearDoctorRemediationPlanCache();
        repairEvidence = await collectSidebarStudioRepairEvidence({
          workspacePath: request.workspacePath,
          projectPath: stepProjectPath ?? request.projectPath,
          handoff: activeHandoff,
        });
        await this._auditSidebarStudioFix({
          sessionId: input.sessionId,
          workspacePath: request.workspacePath,
          handoff: {
            ...activeHandoff,
            ...(stepProjectPath ? { projectPath: stepProjectPath } : {}),
          },
          kind: step.operation ? 'apply-patch' : 'auto-fix',
          actionId: `studio-agent-remediation:${step.id}`,
          summary: ok ? `Remediation step ${step.id} completed.` : (error ?? 'Remediation failed.'),
          ok,
          appliedFixes,
        });
        return {
          ok,
          changed,
          evidenceGeneration: repairEvidence.evidenceFingerprint,
          output,
          ...(error ? { error } : {}),
        };
      },
      inspectDependencySecurity: async (request: {
        projectName?: string;
        workspacePath: string;
        projectPath?: string;
      }) => {
        try {
          const resolveTarget = () =>
            resolveStudioDependencySecurityTarget({
              workspacePath: request.workspacePath,
              ...(request.projectName ? { projectName: request.projectName } : {}),
            });
          let target: Awaited<ReturnType<typeof resolveStudioDependencySecurityTarget>>;
          try {
            target = await resolveTarget();
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!message.includes('No fresh dependency-security blocker exists')) {
              throw error;
            }
            const doctorRefresh = await refreshDependencyDoctorEvidence(request.workspacePath);
            try {
              target = await resolveTarget();
            } catch (refreshError) {
              const refreshedMessage =
                refreshError instanceof Error ? refreshError.message : String(refreshError);
              if (refreshedMessage.includes('No fresh dependency-security blocker exists')) {
                repairEvidence = await collectSidebarStudioRepairEvidence({
                  workspacePath: request.workspacePath,
                  projectPath: request.projectPath,
                  handoff: activeHandoff,
                });
                return {
                  ok: true,
                  changed: false,
                  evidenceGeneration: repairEvidence.evidenceFingerprint,
                  output: {
                    dependencyBlockerPresent: false,
                    doctorRefresh,
                    nextAction: 'verify-blocker',
                  },
                };
              }
              throw refreshError;
            }
          }
          const command = buildStudioDependencySecurityCommand(target, 'inspect');
          const execution = await runIncidentInlineCommand({
            command,
            workspacePath: request.workspacePath,
            projectPath: target.projectPath,
            actionId: `studio-session-security-inspect-${target.projectName}`,
            captureStdout: true,
          });
          const auditCompleted = execution.exitCode === 0 || execution.exitCode === 1;
          const resolutionCandidates = execution.capturedStdout
            ? await parseStudioDependencyUpgradeCandidates({
                target,
                auditJson: execution.capturedStdout,
              }).catch(() => [])
            : [];
          const upgradeCandidates = resolutionCandidates.filter(
            (candidate) => candidate.autoExecutable
          );
          const blockedCandidates = resolutionCandidates.filter(
            (candidate) => !candidate.autoExecutable
          );
          dependencyUpgradeCandidates.set(target.projectName, upgradeCandidates);
          return {
            ok: auditCompleted,
            evidenceGeneration: repairEvidence.evidenceFingerprint,
            output: {
              target,
              command,
              auditExitCode: execution.exitCode,
              auditSummary: execution.output ?? execution.error ?? execution.stderrTail,
              upgradeCandidates,
              resolutionCandidates,
              blockedCandidates,
              ...(blockedCandidates.length > 0
                ? {
                    fallbackCapability: 'general-source-repair',
                    recommendedTools: [
                      'inspect-source',
                      'run-workspace-command',
                      'apply-workspace-patch',
                      'inspect-workspace-changes',
                    ],
                    exhaustedTools: [
                      'inspect-dependency-security',
                      'repair-dependency-security',
                      'upgrade-dependency-security',
                    ],
                  }
                : {}),
              nextAction:
                upgradeCandidates.length > 0
                  ? 'upgrade-dependency-security'
                  : blockedCandidates.length > 0
                    ? 'general-source-repair'
                    : 'inspect-remediation-plan',
            },
            ...(!auditCompleted
              ? { error: execution.error ?? execution.stderrTail ?? 'Dependency audit failed.' }
              : {}),
          };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      repairDependencySecurity: async (request: {
        projectName?: string;
        workspacePath: string;
      }) => {
        try {
          const target = await resolveStudioDependencySecurityTarget({
            workspacePath: request.workspacePath,
            ...(request.projectName ? { projectName: request.projectName } : {}),
          });
          const attemptKey = `${target.projectName}:${target.packageManager}`;
          const prior = dependencyRepairAttempts.get(attemptKey);
          const count = dependencyRepairAttemptsForGeneration({
            prior,
            blockerSignature: activeBlockerSignature,
            evidenceGeneration: repairEvidence.evidenceFingerprint,
          });
          if (count >= 1) {
            return {
              ok: false,
              error:
                `The bounded dependency repair already ran once for ${target.projectName}. ` +
                'Do not repeat it. Inspect dependency security and use an audit-authorized upgradeCandidate.',
            };
          }
          dependencyRepairAttempts.set(attemptKey, {
            blockerSignature: activeBlockerSignature,
            evidenceGeneration: repairEvidence.evidenceFingerprint,
            count: count + 1,
          });
          const command = buildStudioDependencySecurityCommand(target, 'repair');
          const sourceHash = async (relativePath: string): Promise<string | null> => {
            try {
              return crypto
                .createHash('sha256')
                .update(await fs.readFile(path.join(target.projectPath, relativePath)))
                .digest('hex');
            } catch {
              return null;
            }
          };
          const beforeHashes = Object.fromEntries(
            await Promise.all(
              target.sourceFiles.map(async (file) => [file, await sourceHash(file)] as const)
            )
          );
          await this._assertSidebarStudioMutationAllowed({
            workspacePath: request.workspacePath,
            projectPath: target.projectPath,
            actionLabel: `Studio Agent non-force dependency repair for ${target.projectName}`,
            commandText: command,
          });
          const execution = await runIncidentInlineCommand({
            command,
            workspacePath: request.workspacePath,
            projectPath: target.projectPath,
            actionId: `studio-session-security-repair-${target.projectName}`,
          });
          const afterHashes = Object.fromEntries(
            await Promise.all(
              target.sourceFiles.map(async (file) => [file, await sourceHash(file)] as const)
            )
          );
          const changedFiles = target.sourceFiles.filter(
            (file) => beforeHashes[file] !== afterHashes[file]
          );
          repairEvidence = await collectSidebarStudioRepairEvidence({
            workspacePath: request.workspacePath,
            projectPath: target.projectPath,
            handoff: activeHandoff,
          });
          await this._auditSidebarStudioFix({
            sessionId: input.sessionId,
            workspacePath: request.workspacePath,
            handoff: { ...activeHandoff, projectPath: target.projectPath },
            kind: 'auto-fix',
            actionId: `studio-agent-dependency-security:${target.projectName}`,
            summary: execution.success
              ? `Non-force dependency repair completed for ${target.projectName}.`
              : (execution.error ?? 'Dependency repair failed.'),
            ok: execution.success,
            appliedFixes: changedFiles.map((file) => ({
              path: `${target.projectName}/${file}`,
              action: 'dependency-security-repair',
              outcome: 'applied',
            })),
          });
          return {
            ok: execution.success,
            changed: changedFiles.length > 0,
            evidenceGeneration: repairEvidence.evidenceFingerprint,
            output: {
              target,
              command,
              changedFiles: changedFiles.map((file) => `${target.projectName}/${file}`),
              execution,
              upgradeCandidates: dependencyUpgradeCandidates.get(target.projectName) ?? [],
              nextAction:
                (dependencyUpgradeCandidates.get(target.projectName)?.length ?? 0) > 0
                  ? 'upgrade-dependency-security'
                  : 'inspect-dependency-security',
            },
            ...(!execution.success
              ? {
                  error:
                    `${execution.error ?? execution.stderrTail ?? 'Dependency repair failed.'}\n` +
                    'The bounded non-force repair did not clear the advisory. Do not run it again. Follow nextAction and use the exact audit-authorized upgradeCandidate.',
                }
              : {}),
          };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      upgradeDependencySecurity: async (request: {
        projectName?: string;
        packageName: string;
        transactionId: string;
        workspacePath: string;
      }) => {
        try {
          const target = await resolveStudioDependencySecurityTarget({
            workspacePath: request.workspacePath,
            ...(request.projectName ? { projectName: request.projectName } : {}),
          });
          const auditCommand = buildStudioDependencySecurityCommand(target, 'inspect');
          const audit = await runIncidentInlineCommand({
            command: auditCommand,
            workspacePath: request.workspacePath,
            projectPath: target.projectPath,
            actionId: `studio-session-security-upgrade-audit-${target.projectName}`,
            captureStdout: true,
          });
          const candidates = audit.capturedStdout
            ? await parseStudioDependencyUpgradeCandidates({
                target,
                auditJson: audit.capturedStdout,
              })
            : [];
          const candidate = candidates.find((entry) => entry.packageName === request.packageName);
          if (!candidate) {
            return {
              ok: false,
              evidenceGeneration: repairEvidence.evidenceFingerprint,
              error:
                `${request.packageName} is not a direct upgrade candidate in the fresh dependency audit. ` +
                'Inspect dependency security and use one of its upgradeCandidates.',
            };
          }
          if (!candidate.autoExecutable || !candidate.targetVersion) {
            return {
              ok: false,
              changed: false,
              evidenceGeneration: repairEvidence.evidenceFingerprint,
              output: {
                target,
                candidate,
                resolutionCandidates: candidates,
                blockedCandidates: candidates.filter((entry) => !entry.autoExecutable),
                nextAction: 'general-source-repair',
                fallbackCapability: 'general-source-repair',
                recommendedTools: [
                  'inspect-source',
                  'run-workspace-command',
                  'apply-workspace-patch',
                  'inspect-workspace-changes',
                ],
                exhaustedTools: [
                  'inspect-dependency-security',
                  'repair-dependency-security',
                  'upgrade-dependency-security',
                ],
              },
              error:
                `The audit fix for ${candidate.packageName} is ${candidate.disposition} and cannot be applied as an automatic direct upgrade. ` +
                'Use the general workspace capability plane to diagnose compatible source, version, or dependency alternatives.',
            };
          }

          const before = Object.fromEntries(
            await Promise.all(
              target.sourceFiles.map(async (file) => [
                file,
                await fs.readFile(path.join(target.projectPath, file), 'utf8').catch(() => null),
              ])
            )
          ) as Record<string, string | null>;
          const command = buildStudioDependencyUpgradeCommand({
            target,
            candidate,
          });
          await this._assertSidebarStudioMutationAllowed({
            workspacePath: request.workspacePath,
            projectPath: target.projectPath,
            actionLabel: `Studio Agent dependency upgrade for ${target.projectName}`,
            commandText: command,
            governedRepair: { contractAuthorized: true, reversible: true },
          });
          const execution = await runIncidentInlineCommand({
            command,
            workspacePath: request.workspacePath,
            projectPath: target.projectPath,
            actionId: `studio-session-security-upgrade-${target.projectName}-${candidate.packageName}`,
          });
          const after = Object.fromEntries(
            await Promise.all(
              target.sourceFiles.map(async (file) => [
                file,
                await fs.readFile(path.join(target.projectPath, file), 'utf8').catch(() => null),
              ])
            )
          ) as Record<string, string | null>;
          const changedFiles = target.sourceFiles.filter((file) => before[file] !== after[file]);
          if (execution.success && changedFiles.length > 0) {
            const patches: FilePatch[] = changedFiles.map((file) => ({
              relativePath: path
                .relative(request.workspacePath, path.join(target.projectPath, file))
                .replace(/\\/g, '/'),
              isNewFile: before[file] === null,
              originalContent: before[file] ?? undefined,
              patchedContent: after[file] ?? '',
              hunks: [],
              status: 'applied',
            }));
            this._rememberStudioAgentPatchTransaction(request.transactionId, {
              workspacePath: request.workspacePath,
              cardId: activeHandoff.cardId,
              sessionId: input.sessionId,
              patchResult: {
                patchId: request.transactionId,
                generatedAt: new Date().toISOString(),
                actionId: `dependency-upgrade:${target.projectName}:${candidate.packageName}`,
                patches,
                appliedCount: patches.length,
                rejectedCount: 0,
                failedCount: 0,
              },
            });
          }
          repairEvidence = await collectSidebarStudioRepairEvidence({
            workspacePath: request.workspacePath,
            projectPath: target.projectPath,
            handoff: activeHandoff,
          });
          const changed = execution.success && changedFiles.length > 0;
          await this._auditSidebarStudioFix({
            sessionId: input.sessionId,
            workspacePath: request.workspacePath,
            handoff: { ...activeHandoff, projectPath: target.projectPath },
            kind: 'auto-fix',
            actionId: `studio-agent-dependency-upgrade:${target.projectName}:${candidate.packageName}`,
            summary: execution.success
              ? `Upgraded ${candidate.packageName} and refreshed the package-manager lockfile.`
              : (execution.error ?? 'Dependency upgrade failed.'),
            ok: changed,
            appliedFixes: changedFiles.map((file) => ({
              path: `${target.projectName}/${file}`,
              action: 'dependency-security-upgrade',
              outcome: 'applied',
            })),
          });
          return {
            ok: changed,
            changed,
            evidenceGeneration: repairEvidence.evidenceFingerprint,
            output: {
              target,
              candidate,
              command,
              changedFiles: changedFiles.map((file) => `${target.projectName}/${file}`),
              execution,
            },
            ...(!changed
              ? {
                  output: {
                    target,
                    candidate,
                    command,
                    changedFiles: changedFiles.map((file) => `${target.projectName}/${file}`),
                    execution,
                    nextAction: 'general-source-repair',
                    fallbackCapability: 'general-source-repair',
                    recommendedTools: [
                      'inspect-source',
                      'run-workspace-command',
                      'apply-workspace-patch',
                      'inspect-workspace-changes',
                    ],
                    exhaustedTools: [
                      'inspect-dependency-security',
                      'repair-dependency-security',
                      'upgrade-dependency-security',
                    ],
                  },
                  error:
                    execution.error ??
                    execution.stderrTail ??
                    'Dependency upgrade did not change the manifest or lockfile.',
                }
              : {}),
          };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      recoverActiveBlocker: async (request: { workspacePath: string; projectPath?: string }) => {
        const dependencyIncident = (activeHandoff.blockers ?? []).some((blocker) =>
          /\b(?:dependency|dependencies|vulnerabilit|security audit|npm audit|pnpm audit|yarn audit)\b/i.test(
            blocker
          )
        );
        let dependencyTargets = await resolveStudioDependencySecurityTargets({
          workspacePath: request.workspacePath,
        }).catch(() => []);
        let doctorRefresh: Awaited<ReturnType<typeof refreshDependencyDoctorEvidence>> | undefined;
        if (dependencyIncident && dependencyTargets.length === 0) {
          doctorRefresh = await refreshDependencyDoctorEvidence(request.workspacePath);
          dependencyTargets = await resolveStudioDependencySecurityTargets({
            workspacePath: request.workspacePath,
          });
          if (dependencyTargets.length === 0) {
            return {
              ok: true,
              changed: false,
              evidenceGeneration: repairEvidence.evidenceFingerprint,
              blockerSignature: activeBlockerSignature,
              output: {
                recoveryPath: 'dependency-security',
                dependencyBlockerPresent: false,
                doctorRefresh,
                nextAction: 'verify-blocker',
              },
            };
          }
        }
        const scopedDependencyTargets = request.projectPath
          ? dependencyTargets.filter(
              (target) => path.resolve(target.projectPath) === path.resolve(request.projectPath!)
            )
          : dependencyTargets;
        return runStudioActiveBlockerRecovery({
          blockers: activeHandoff.blockers ?? [],
          dependencyProjectNames: scopedDependencyTargets.map((target) => target.projectName),
          evidenceGeneration: repairEvidence.evidenceFingerprint,
          blockerSignature: activeBlockerSignature,
          workspacePath: request.workspacePath,
          ...(request.projectPath ? { projectPath: request.projectPath } : {}),
          host,
        });
      },
      verify: async (request: { workspacePath: string; projectPath?: string }) => {
        const verifyCommand = activeHandoff.verifyCommand?.trim();
        if (!verifyCommand) {
          return { ok: false, cardBlocking: true, error: 'Verify command is missing.' };
        }
        const execution = await runIncidentInlineCommand({
          command: verifyCommand,
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          actionId: `studio-session-verify-${activeHandoff.cardId}`,
        });
        const refresh = await this._finalizeStudioVerifyHandoff({
          handoff: activeHandoff,
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          sessionId: input.sessionId,
          verifySucceeded: execution.success,
          verifyExitCode: execution.exitCode ?? (execution.success ? 0 : 1),
          verifyError: execution.error,
          agentOwned: true,
        });
        const cardBlocking = dashboardEvidenceCardIsBlocking(refresh.primaryCard);
        const evidenceBundle = await buildDashboardEvidenceBundle({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
        });
        const incidentGraph = buildStudioIncidentGraph({
          primaryCardId: input.handoff.cardId,
          cards: evidenceBundle.cards,
        });
        const incidentBlocking = cardBlocking || !incidentGraph.resolved;
        const nextBlockingCard = incidentGraph.blockingCards[0]
          ? evidenceBundle.cards.find((card) => card.id === incidentGraph.blockingCards[0]?.id)
          : undefined;
        if (nextBlockingCard) {
          activeHandoff = await buildStudioBlockerHandoff({
            card: nextBlockingCard,
            workspacePath: request.workspacePath,
            projectPath: nextBlockingCard.scope === 'project' ? request.projectPath : undefined,
            handoffSource: 'dashboard',
            extensionContext: this._context,
          });
        } else if (refresh.primaryCard) {
          activeHandoff = await buildStudioBlockerHandoff({
            card: refresh.primaryCard,
            workspacePath: request.workspacePath,
            projectPath: request.projectPath,
            handoffSource: 'dashboard',
            extensionContext: this._context,
          });
        }
        activeBlockerSignature = activeHandoff.blockerSignature;
        repairEvidence = await collectSidebarStudioRepairEvidence({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          handoff: activeHandoff,
        });
        const semanticVerifySucceeded =
          (execution.exitCode === 0 || execution.exitCode === 2) &&
          refresh.evidenceOutcome === 'resolved' &&
          !incidentBlocking;
        return {
          ok: semanticVerifySucceeded,
          cardBlocking: incidentBlocking,
          blockerSignature: activeBlockerSignature,
          evidenceGeneration: repairEvidence.evidenceFingerprint,
          output: {
            refresh,
            incidentGraph,
            cardVerification: {
              cardId: input.handoff.cardId,
              resolved: !cardBlocking,
              blocking: cardBlocking,
            },
            workspaceVerification: {
              resolved: incidentGraph.resolved,
              blocking: !incidentGraph.resolved,
              blockingCards: incidentGraph.blockingCards.map((card) => ({
                id: card.id,
                label: card.label,
                scope: card.scope,
              })),
            },
            activeHandoff: {
              cardId: activeHandoff.cardId,
              blockers: activeHandoff.blockers,
              blockerSignature: activeHandoff.blockerSignature,
              sourceCommand: activeHandoff.sourceCommand,
              verifyCommand: activeHandoff.verifyCommand,
            },
          },
          ...(!semanticVerifySucceeded
            ? {
                error:
                  execution.error ??
                  `${incidentGraph.blockingCards.length} related Workspace Intelligence card(s) remain blocking.`,
              }
            : {}),
        };
      },
    };
    const registry = createStudioAgentWorkspaiToolRegistry({
      host,
      cardId: input.handoff.cardId,
      blockerSignature: input.handoff.blockerSignature,
      assistantMode: 'agent',
    });
    const store = new VSCodeStudioAgentSessionStore(this._context);
    const persistedCandidate = input.sessionId ? await store.load(input.sessionId) : undefined;
    const persisted =
      persistedCandidate &&
      persistedCandidate.workspacePath === input.workspacePath &&
      persistedCandidate.cardId === input.handoff.cardId &&
      persistedCandidate.assistantMode === 'agent' &&
      persistedCandidate.status !== 'completed' &&
      persistedCandidate.status !== 'cancelled'
        ? persistedCandidate
        : undefined;
    const options = {
      id: input.sessionId,
      workspacePath: input.workspacePath,
      ...(input.projectPath ? { projectPath: input.projectPath } : {}),
      cardId: input.handoff.cardId,
      assistantMode: 'agent' as const,
      ...(input.requestedModelId ? { selectedModelId: input.requestedModelId } : {}),
      blockerSignature: input.handoff.blockerSignature,
      permissionLevel: 'autopilot' as const,
      workspaceTrusted: vscode.workspace.isTrusted,
      requiresVerifiedCompletion: true,
      ...(persisted ? { restoredSession: persisted } : {}),
    };
    const model = new ContractStudioAgentModelAdapter(objective, async (prompt, request) => {
      const response = await askConfiguredAIProviderForToolAction(
        this._context!,
        [{ role: 'user', content: prompt }],
        request.tools,
        undefined,
        input.requestedModelId
      );
      return response.type === 'tool'
        ? { toolName: response.toolName, input: response.input }
        : response.text;
    });
    const session = new StudioAgentSession(options, model, registry, store);
    if (persisted) {
      persisted.events
        .filter(
          (event) =>
            event.type === 'tool.completed' ||
            event.type === 'tool.failed' ||
            event.type === 'verify.completed'
        )
        .slice(-60)
        .forEach((event) => {
          this._postInlineCreate('sidebarStudioAgentEvent', { event, replay: true });
        });
    }
    session.onEvent((event) => {
      this._postInlineCreate('sidebarStudioAgentEvent', { event });
    });
    this._activeStudioAgentSessions.set(session.id, session);
    const completed = await session.run(objective).finally(() => {
      if (this._activeStudioAgentSessions.get(session.id) === session) {
        this._activeStudioAgentSessions.delete(session.id);
      }
    });
    if (completed.status === 'completed') {
      this._postInlineCreate('sidebarStudioDone', {
        sessionId: completed.id,
        modelId: completed.selectedModelId ?? 'auto',
        assistantMode: completed.assistantMode,
        verified: true,
        answer: 'The blocker was repaired and cleared by refreshed verify evidence.',
      });
      return;
    }
    const failure = [...completed.events]
      .reverse()
      .find((event) => event.type === 'session.failed');
    const failureMessage =
      failure && typeof (failure.data as { error?: unknown }).error === 'string'
        ? String((failure.data as { error: string }).error)
        : undefined;
    this._postInlineCreate('sidebarStudioError', {
      sessionId: completed.id,
      error:
        completed.status === 'cancelled'
          ? 'Studio Agent was cancelled.'
          : (failureMessage ??
            'Studio Agent did not reach verified completion. The durable session can resume.'),
    });
  }

  private async _runSidebarStudioAction(payload: unknown): Promise<void> {
    const studioHost = this._actionsWebviewStudioActionHost();
    const { payloadRecord, action, sessionId, handoff } = resolveSidebarStudioActionPayload(
      payload,
      studioHost.getActiveBlockerHandoff(),
      parseStudioBlockerHandoffPayload
    );
    try {
      if (action === 'agent-status') {
        const session = sessionId ? this._activeStudioAgentSessions.get(sessionId) : undefined;
        studioHost.postInlineCreate('sidebarStudioSessionState', {
          sessionId,
          cardId: handoff?.cardId,
          active: session?.snapshot().status === 'running',
          status: session?.snapshot().status ?? 'paused',
        });
        return;
      }
      if (action === 'agent-steer') {
        const message =
          typeof payloadRecord.message === 'string' ? payloadRecord.message.trim() : '';
        if (!sessionId || !message) {
          throw new Error('An active session and steering message are required.');
        }
        const session = this._activeStudioAgentSessions.get(sessionId);
        if (!session) {
          throw new Error('The Studio Agent session is not currently running.');
        }
        session.steer(message);
        studioHost.postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          cardId: handoff?.cardId,
          action,
          status: 'running',
          phase: 'request-steered',
          title: 'Direction added',
          summary: 'Studio Agent will apply this direction at the next model boundary.',
        });
        return;
      }
      if (action === 'agent-cancel') {
        if (!sessionId) {
          throw new Error('An active session is required for cancellation.');
        }
        const session = this._activeStudioAgentSessions.get(sessionId);
        if (!session) {
          throw new Error('The Studio Agent session is not currently running.');
        }
        session.cancel();
        return;
      }
      if (action === 'retry-audit') {
        await studioHost.retryLastSidebarStudioAudit(sessionId);
        return;
      }
      if (action === 'auto-fix') {
        if (!handoff) {
          throw new Error('No blocker handoff is active for auto-fix.');
        }
        if (handoff.studioMode === 'EXPLAIN' || handoff.studioMode === 'VERIFY_ONLY') {
          throw new Error('Studio auto-fix is only available for fixable blocker handoffs.');
        }
        if (!studioHost.context) {
          throw new Error('Studio auto-fix is not available until the extension context is ready.');
        }
        await studioHost.runSidebarAutoFix(
          handoff,
          sessionId,
          payloadRecord.scope,
          typeof payloadRecord.modelId === 'string' ? payloadRecord.modelId : undefined
        );
        return;
      }
      if (action === 'refresh-remediation-plan') {
        if (!handoff) {
          throw new Error('No blocker handoff is active for remediation refresh.');
        }
        const scope = resolveStudioActionScope(payloadRecord.scope);
        const workspacePath =
          handoff.workspacePath ??
          scope.workspacePath ??
          (await resolvePreferredAIModalContext()).workspaceRootPath;
        const sourceCommand = handoff.sourceCommand?.trim();
        const evidenceRefreshCommand = sourceCommand
          ? ensureDoctorRemediationPlanRefreshCommand(sourceCommand)
          : undefined;
        if (!workspacePath || !evidenceRefreshCommand) {
          throw new Error('No source command is available to refresh remediation evidence.');
        }
        const remediationPlanExecution = resolveArtifactRemediationPlanExecution();
        const remediationPlanCommand = remediationPlanExecution.commandText;
        const refreshCommandText = `${evidenceRefreshCommand} && ${remediationPlanCommand}`;
        studioHost.postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          cardId: handoff.cardId,
          action,
          status: 'running',
          phase: 'refreshing-remediation-plan',
          summary: 'Refreshing source evidence and npm remediation plan.',
          commandText: refreshCommandText,
          dashboardCommandId: remediationPlanExecution.dashboardCommandId,
          executionChannel: remediationPlanExecution.executionChannel,
          capabilityGate: remediationPlanExecution.capabilityGate,
        });
        await this._assertSidebarStudioMutationAllowed({
          workspacePath,
          projectPath: handoff.projectPath ?? scope.projectPath,
          actionLabel: 'Studio remediation evidence refresh',
          commandText: evidenceRefreshCommand,
        });
        await this._assertSidebarStudioMutationAllowed({
          workspacePath,
          projectPath: handoff.projectPath ?? scope.projectPath,
          actionLabel: 'Studio remediation plan refresh',
          commandText: remediationPlanCommand,
        });
        const evidenceExecution = await runIncidentInlineCommand({
          command: evidenceRefreshCommand,
          workspacePath,
          projectPath: handoff.projectPath ?? scope.projectPath,
          actionId: 'refresh-remediation-plan',
        });
        const planExecution = await runIncidentInlineCommand({
          command: remediationPlanCommand,
          workspacePath,
          projectPath: handoff.projectPath ?? scope.projectPath,
          actionId: 'refresh-artifact-remediation-plan',
        });
        if (this._context) {
          await recordStudioBlockerCommandRun(this._context, {
            cardId: handoff.cardId,
            sourceCommand: refreshCommandText,
            blockers: handoff.blockers,
            dashboardCommandId: remediationPlanExecution.dashboardCommandId,
            executionChannel: remediationPlanExecution.executionChannel,
            capabilityGate: remediationPlanExecution.capabilityGate,
            exitCode: planExecution.exitCode ?? (planExecution.success ? 0 : 1),
          });
        }
        await studioHost.refreshSidebarShipLoop({
          workspacePath,
          projectPath: handoff.projectPath ?? scope.projectPath,
        });
        clearDoctorRemediationPlanCache();
        const refreshedPlan = await this._postSidebarDoctorRemediationPlan({
          handoff,
          workspacePath,
          sessionId,
        });
        const hasRepairPlan = Boolean(refreshedPlan?.visibleSteps.length);
        const refreshSucceeded = evidenceExecution.success && planExecution.success;
        const failureExecution = evidenceExecution.success ? planExecution : evidenceExecution;
        studioHost.postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          cardId: handoff.cardId,
          action,
          status: hasRepairPlan || refreshSucceeded ? 'review' : 'failed',
          title: !failureExecution.success
            ? 'Evidence refresh failed'
            : hasRepairPlan
              ? undefined
              : 'Evidence refreshed; source fix needed',
          summary: refreshSucceeded
            ? hasRepairPlan
              ? 'Evidence refreshed. Studio loaded the latest repair plan.'
              : 'The artifact is fresh, but no deterministic repair plan is available for this card. I can continue with an AI-assisted fix using the refreshed evidence.'
            : (failureExecution.error ?? failureExecution.stderrTail ?? 'Evidence refresh failed.'),
          commandText: remediationPlanCommand,
          dashboardCommandId: remediationPlanExecution.dashboardCommandId,
          executionChannel: remediationPlanExecution.executionChannel,
          capabilityGate: remediationPlanExecution.capabilityGate,
          exitCode: failureExecution.exitCode,
          stderrTail: failureExecution.stderrTail,
          topBlocker: planExecution.success
            ? undefined
            : (failureExecution.error ?? handoff.blockers[0]),
          error: failureExecution.error,
          nextAction: refreshSucceeded
            ? hasRepairPlan
              ? 'continue-remediation'
              : 'auto-fix'
            : studioActionFailureNextAction('run-command'),
          nextActionLabel: refreshSucceeded
            ? hasRepairPlan
              ? 'Apply next safe step'
              : 'Continue with AI repair'
            : undefined,
        });
        return;
      }
      if (action === 'apply-remediation-step') {
        if (!handoff) {
          throw new Error('No blocker handoff is active for remediation apply.');
        }
        const stepId = typeof payloadRecord.stepId === 'string' ? payloadRecord.stepId.trim() : '';
        if (!stepId) {
          throw new Error('No remediation step was selected.');
        }
        const scope = resolveStudioActionScope(payloadRecord.scope);
        const workspacePath =
          handoff.workspacePath ??
          scope.workspacePath ??
          (await resolvePreferredAIModalContext()).workspaceRootPath;
        if (!workspacePath) {
          throw new Error('No workspace is selected for remediation apply.');
        }
        studioHost.postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          cardId: handoff.cardId,
          action,
          status: 'running',
          phase: 'applying-remediation-step',
        });
        const plan = await readDoctorRemediationPlanForStudio({
          workspacePath,
          handoff,
          maxSteps: 8,
        });
        if (plan?.freshness.verdict === 'stale') {
          const reason =
            plan.freshness.reason || 'Remediation plan is stale. Refresh source evidence first.';
          studioHost.postInlineCreate('sidebarStudioActionResult', {
            sessionId,
            cardId: handoff.cardId,
            action,
            status: 'failed',
            title: 'Evidence changed',
            summary: reason,
            nextAction: 'Refresh evidence, then apply the updated safe step.',
          });
          return;
        }
        const step = plan?.visibleSteps.find((entry) => entry.id === stepId);
        if (!step) {
          throw new Error('Selected remediation step is no longer present in the latest plan.');
        }
        const autonomous = payloadRecord.autonomous === true;
        if (!autonomous && (step.requiresApproval || step.studioState === 'review-required')) {
          const approvalLabel = 'Apply and verify';
          const approval = await vscode.window.showWarningMessage(
            `Workspai Studio wants to apply: ${step.previewTitle || step.primaryAction}`,
            {
              modal: true,
              detail:
                step.diffSummary ||
                step.previewSummary ||
                'This contract-authored remediation step requires explicit operator approval.',
            },
            approvalLabel
          );
          if (approval !== approvalLabel) {
            studioHost.postInlineCreate('sidebarStudioActionResult', {
              sessionId,
              cardId: handoff.cardId,
              action,
              status: 'review',
              title: 'Approval required',
              summary: 'The guarded remediation step was not applied.',
              requiresApproval: true,
              nextAction: 'continue-remediation',
              nextActionLabel: 'Review again',
            });
            return;
          }
        }
        const stepProjectPath = await resolveProjectPathFromRemediationStep({
          step,
          workspacePath,
          handoffProjectPath: handoff.projectPath,
          scopeProjectPath: scope.projectPath,
        });
        await this._assertSidebarStudioMutationAllowed({
          workspacePath,
          projectPath: stepProjectPath,
          actionLabel: 'Studio remediation apply',
        });
        const applyResult = await applyDoctorRemediationStep({ workspacePath, step });
        const ok = applyResult.status === 'applied';
        const verifyCommand = step.verifyCommand ?? handoff.verifyCommand;
        const verifyHandoff: StudioBlockerHandoff = {
          ...handoff,
          verifyCommand,
          ...(stepProjectPath ? { projectPath: stepProjectPath } : {}),
        };
        const rollbackCommand = buildSidebarPatchRollbackHint(
          collectAppliedPatchPaths(applyResult.appliedFixes)
        );
        const changedPaths = collectAppliedPatchPaths(applyResult.appliedFixes);
        const unchangedCount = applyResult.appliedFixes.filter(
          (entry) => entry.outcome === 'unchanged'
        ).length;
        const patchMetadata =
          ok && applyResult.appliedFixes.length > 0
            ? {
                patchId: `doctor-remediation-step:${step.id}`,
                sourceAction: 'apply-patch' as const,
                reviewRequired: true,
                appliedCount: changedPaths.length,
                rejectedCount: 0,
                failedCount: 0,
                affectedFiles: changedPaths,
                rollbackCommand: rollbackCommand ?? undefined,
              }
            : undefined;
        if (ok) {
          studioHost.postInlineCreate('sidebarStudioFixApplied', {
            cardId: handoff.cardId,
            appliedFixes: applyResult.appliedFixes,
            verifyCommand,
            verifyArtifact: handoff.verifyArtifact,
            requiresVerify: Boolean(verifyCommand),
            phase: verifyCommand ? 'awaiting-verify' : 'fixing',
            blockerSignatureBefore: handoff.blockerSignature,
            summary: applyResult.summary,
            ...(rollbackCommand ? { rollbackCommand } : {}),
          });
        }
        await studioHost.auditSidebarStudioFix({
          sessionId,
          workspacePath,
          handoff: verifyHandoff,
          kind: 'apply-patch',
          actionId: `doctor-remediation-step:${step.id}`,
          summary: applyResult.summary,
          ok,
          appliedFixes: applyResult.appliedFixes,
          rollbackCommand: rollbackCommand ?? undefined,
          patchMetadata,
        });
        if (ok && verifyCommand) {
          await this._runStudioVerifyContinuation({
            sessionId,
            handoff: verifyHandoff,
            workspacePath,
            projectPath: stepProjectPath,
            action,
            verifyCommand,
            verifyActionId: 'verify-remediation-step',
            runningPhase: 'verifying-remediation-step',
            runningSummary:
              changedPaths.length > 0
                ? 'Fix applied. Running verify now.'
                : unchangedCount > 0
                  ? 'The fix was already in place. Running verify now.'
                  : 'Running verify after the approved repair step.',
            failureFallbackSummary: applyResult.summary,
            rollbackCommand: rollbackCommand ?? undefined,
            refreshShipLoopOnSuccess: true,
            recordVerifyPassMilestone: true,
          });
        } else {
          studioHost.postInlineCreate('sidebarStudioActionResult', {
            sessionId,
            cardId: handoff.cardId,
            action,
            status: ok ? 'done' : 'failed',
            summary: applyResult.summary,
          });
        }
        return;
      }
      if (action === 'run-remediation-command') {
        if (!handoff) {
          throw new Error('No blocker handoff is active for remediation command.');
        }
        const stepId = typeof payloadRecord.stepId === 'string' ? payloadRecord.stepId.trim() : '';
        const commandText =
          typeof payloadRecord.commandText === 'string' &&
          payloadRecord.commandText.trim().length > 0
            ? payloadRecord.commandText.trim()
            : '';
        if (!stepId || !commandText) {
          throw new Error('No remediation command was selected.');
        }
        const scope = resolveStudioActionScope(payloadRecord.scope);
        const workspacePath =
          handoff.workspacePath ??
          scope.workspacePath ??
          (await resolvePreferredAIModalContext()).workspaceRootPath;
        if (!workspacePath) {
          throw new Error('No workspace is selected for remediation command.');
        }
        const plan = await readDoctorRemediationPlanForStudio({
          workspacePath,
          handoff,
          maxSteps: 8,
        });
        if (plan?.freshness.verdict === 'stale') {
          throw new Error(
            plan.freshness.reason || 'Remediation plan is stale. Refresh source evidence first.'
          );
        }
        const step = plan?.visibleSteps.find((entry) => entry.id === stepId);
        if (!step || !step.originalCommand || step.originalCommand !== commandText) {
          throw new Error('Selected remediation command is no longer present in the latest plan.');
        }
        const stepProjectPath = await resolveProjectPathFromRemediationStep({
          step,
          workspacePath,
          handoffProjectPath: handoff.projectPath,
          scopeProjectPath: scope.projectPath,
        });
        if (isInternalDoctorRepairCommand(commandText)) {
          if (!step.canApply || !step.operation) {
            throw new Error(
              'This internal remediation step is not ready for automatic apply. Refresh source evidence first.'
            );
          }
          await this._assertSidebarStudioMutationAllowed({
            workspacePath,
            projectPath: stepProjectPath,
            actionLabel: 'Studio internal remediation apply',
          });
          studioHost.postInlineCreate('sidebarStudioActionResult', {
            sessionId,
            cardId: handoff.cardId,
            action,
            status: 'running',
            phase: 'applying-remediation-step',
            summary:
              'Applying the trusted remediation operation instead of running an internal token command.',
          });
          const applyResult = await applyDoctorRemediationStep({ workspacePath, step });
          const ok = applyResult.status === 'applied';
          const verifyCommand = step.verifyCommand ?? handoff.verifyCommand;
          const verifyHandoff: StudioBlockerHandoff = {
            ...handoff,
            verifyCommand,
            ...(stepProjectPath ? { projectPath: stepProjectPath } : {}),
          };
          const rollbackCommand = buildSidebarPatchRollbackHint(
            collectAppliedPatchPaths(applyResult.appliedFixes)
          );
          if (ok) {
            studioHost.postInlineCreate('sidebarStudioFixApplied', {
              cardId: handoff.cardId,
              appliedFixes: applyResult.appliedFixes,
              verifyCommand,
              verifyArtifact: handoff.verifyArtifact,
              requiresVerify: Boolean(verifyCommand),
              phase: verifyCommand ? 'awaiting-verify' : 'fixing',
              blockerSignatureBefore: handoff.blockerSignature,
              summary: applyResult.summary,
              ...(rollbackCommand ? { rollbackCommand } : {}),
            });
          }
          await studioHost.auditSidebarStudioFix({
            sessionId,
            workspacePath,
            handoff: verifyHandoff,
            kind: 'apply-patch',
            actionId: `doctor-remediation-token:${step.id}`,
            summary: applyResult.summary,
            ok,
            appliedFixes: applyResult.appliedFixes,
            rollbackCommand: rollbackCommand ?? undefined,
          });
          if (ok && verifyCommand) {
            await this._runStudioVerifyContinuation({
              sessionId,
              handoff: verifyHandoff,
              workspacePath,
              projectPath: stepProjectPath,
              action,
              verifyCommand,
              verifyActionId: 'verify-remediation-token-step',
              runningPhase: 'verifying-remediation-command',
              runningSummary: 'Trusted remediation operation applied. Running verify now.',
              failureFallbackSummary: applyResult.summary,
              rollbackCommand: rollbackCommand ?? undefined,
              refreshShipLoopOnSuccess: true,
              recordVerifyPassMilestone: true,
            });
          } else {
            studioHost.postInlineCreate('sidebarStudioActionResult', {
              sessionId,
              cardId: handoff.cardId,
              action,
              status: ok ? 'done' : 'failed',
              summary: applyResult.summary,
            });
          }
          return;
        }
        studioHost.postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          cardId: handoff.cardId,
          action,
          status: 'running',
          phase: 'running-remediation-command',
          summary: 'Running the selected repair command.',
          commandText,
        });
        await this._assertSidebarStudioMutationAllowed({
          workspacePath,
          projectPath: stepProjectPath,
          actionLabel: 'Studio remediation command',
          commandText,
        });
        const execution = await runIncidentInlineCommand({
          command: commandText,
          workspacePath,
          projectPath: stepProjectPath,
          actionId: 'run-remediation-command',
        });
        await studioHost.auditSidebarStudioFix({
          sessionId,
          workspacePath,
          handoff,
          kind: 'auto-fix',
          actionId: `doctor-remediation-command:${step.id}`,
          summary: execution.success
            ? 'Remediation command completed.'
            : (execution.error ?? 'Remediation command failed.'),
          ok: execution.success,
          appliedFixes: execution.success
            ? [
                {
                  path: handoff.artifactPath,
                  action: 'run-remediation-command',
                  outcome: 'applied',
                },
              ]
            : [],
        });
        if (execution.success) {
          const stepProjectPath = await resolveProjectPathFromRemediationStep({
            step,
            workspacePath,
            handoffProjectPath: handoff.projectPath,
            scopeProjectPath: scope.projectPath,
          });
          await studioHost.refreshSidebarShipLoop({
            workspacePath,
            projectPath: stepProjectPath,
          });
          const verifyCommand = step.verifyCommand ?? handoff.verifyCommand;
          if (verifyCommand) {
            const verifyHandoff: StudioBlockerHandoff = {
              ...handoff,
              verifyCommand,
              ...(stepProjectPath ? { projectPath: stepProjectPath } : {}),
            };
            await this._runStudioVerifyContinuation({
              sessionId,
              handoff: verifyHandoff,
              workspacePath,
              projectPath: stepProjectPath,
              action,
              verifyCommand,
              verifyActionId: 'verify-remediation-command',
              runningPhase: 'verifying-remediation-command',
              runningSummary: 'Repair command completed. Running verify now.',
              failureFallbackSummary: 'Verify failed.',
            });
            return;
          }
          void this._postSidebarDoctorRemediationPlan({ handoff, workspacePath, sessionId });
        } else {
          void this._postSidebarDoctorRemediationPlan({ handoff, workspacePath, sessionId });
        }
        studioHost.postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          cardId: handoff.cardId,
          action,
          status: execution.success ? 'done' : 'failed',
          title: execution.success ? undefined : 'Remediation command failed',
          summary: execution.success
            ? 'Repair command completed and evidence refresh started.'
            : (execution.error ?? execution.stderrTail ?? 'Repair command failed.'),
          commandText,
          exitCode: execution.exitCode,
          stderrTail: execution.stderrTail,
          topBlocker: execution.success ? undefined : (execution.error ?? handoff.blockers[0]),
          error: execution.error,
          nextAction: execution.success ? undefined : studioActionFailureNextAction('run-command'),
        });
        return;
      }
      if (action === 'apply-patch') {
        if (!handoff) {
          throw new Error('No blocker handoff is active for patch apply.');
        }
        const scope = resolveStudioActionScope(payloadRecord.scope);
        const workspacePath =
          handoff.workspacePath ??
          scope.workspacePath ??
          (await resolvePreferredAIModalContext()).workspaceRootPath;
        if (!workspacePath) {
          throw new Error('No workspace is selected for patch apply.');
        }
        const pendingPatches = studioHost.getPendingPatches(handoff.cardId, sessionId);
        if (!pendingPatches || pendingPatches.length === 0) {
          throw new Error('No pending patches are available for review.');
        }
        const acceptedPaths = Array.isArray(payloadRecord.acceptedPaths)
          ? payloadRecord.acceptedPaths.filter(
              (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
            )
          : undefined;
        await this._assertSidebarStudioMutationAllowed({
          workspacePath,
          projectPath: handoff.projectPath ?? scope.projectPath,
          actionLabel: 'Studio patch apply',
        });
        studioHost.postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          cardId: handoff.cardId,
          action,
          status: 'running',
          phase: 'applying-patch',
        });
        const patchResult = await applySidebarPendingPatches({
          workspacePath,
          handoff,
          patches: pendingPatches,
          acceptedPaths,
        });
        await studioHost.finalizeStudioPatchTransaction(
          handoff,
          sessionId,
          patchResult,
          'apply-patch',
          {
            workspacePath,
            projectPath: handoff.projectPath ?? scope.projectPath,
          }
        );
        studioHost.deletePendingPatches(handoff.cardId, sessionId);
        return;
      }
      if (action === 'reject-patch') {
        if (handoff) {
          studioHost.deletePendingPatches(handoff.cardId, sessionId);
        }
        studioHost.postInlineCreate('sidebarStudioPatchReview', {
          sessionId,
          ...(handoff ? { cardId: handoff.cardId } : {}),
          cleared: true,
          patches: [],
        });
        studioHost.postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          ...(handoff ? { cardId: handoff.cardId } : {}),
          action,
          status: 'done',
          summary: 'Patch review dismissed.',
        });
        return;
      }
      if (action === 'ship-loop-step') {
        const stepId = payloadRecord.stepId;
        if (!isSidebarShipLoopStepId(stepId)) {
          throw new Error('Unknown ship-loop step.');
        }
        if (!studioHost.context) {
          throw new Error('Ship-loop steps require extension context.');
        }
        const scope = resolveStudioActionScope(payloadRecord.scope);
        const workspacePath =
          scope.workspacePath ?? (await resolvePreferredAIModalContext()).workspaceRootPath;
        if (!workspacePath) {
          throw new Error('No workspace is selected for ship-loop.');
        }
        studioHost.postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          action,
          status: 'running',
          phase: `ship-loop-${stepId}`,
        });
        const result = await dispatchSidebarShipLoopStep({
          context: studioHost.context,
          stepId,
          workspacePath,
          projectPath: scope.projectPath,
        });
        await studioHost.auditSidebarStudioFix({
          sessionId,
          workspacePath,
          handoff: handoff ?? studioHost.getActiveBlockerHandoff(),
          kind: 'ship-loop-step',
          actionId: stepId,
          summary: result.summary,
          ok: result.success,
        });
        await studioHost.refreshSidebarShipLoop({
          workspacePath,
          projectPath: scope.projectPath,
          intent: 'release',
        });
        studioHost.postInlineCreate(
          'sidebarStudioActionResult',
          result.success
            ? {
                sessionId,
                action,
                status: 'done',
                summary: result.summary,
                stepId,
              }
            : buildSidebarStudioActionFailurePayload({
                sessionId,
                action,
                summary: result.summary,
                handoff,
                payloadRecord,
                stepId,
              })
        );
        return;
      }
      if (action === 'verify-handoff') {
        if (!handoff?.verifyCommand) {
          throw new Error('No verify command is attached to this blocker handoff.');
        }
        const scope = resolveStudioActionScope(payloadRecord.scope);
        const workspacePath = scope.workspacePath ?? handoff.workspacePath;
        const projectPath = scope.projectPath ?? handoff.projectPath;
        if (!workspacePath) {
          throw new Error('No workspace is selected for verify.');
        }
        const execution = await runIncidentInlineCommand({
          command: handoff.verifyCommand,
          workspacePath,
          projectPath,
          actionId: 'verify-gates',
        });
        const refreshResult = await studioHost.finalizeStudioVerifyHandoff({
          handoff,
          workspacePath,
          projectPath,
          sessionId,
          verifySucceeded: execution.success,
          verifyExitCode: execution.exitCode ?? (execution.success ? 0 : 1),
          verifyError: execution.error,
        });
        const remainsBlocking = dashboardEvidenceCardIsBlocking(refreshResult.primaryCard);
        const resolved = !remainsBlocking;
        if (resolved) {
          void recordRetentionMilestone(this._context, 'verify_pass_after_studio_fix', {
            surface: 'studio',
          });
        }
        studioHost.postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          ...(handoff ? { cardId: handoff.cardId } : {}),
          action,
          status: resolved ? 'done' : 'failed',
          title: resolved
            ? refreshResult.primaryCard?.status === 'warn'
              ? 'Verified with attention'
              : undefined
            : 'Verify still blocking',
          summary: resolved
            ? refreshResult.primaryCard?.status === 'warn'
              ? 'The refreshed card is advisory and no longer blocks completion.'
              : undefined
            : (execution.error ?? execution.stderrTail ?? handoff.blockers[0]),
          commandText: handoff.verifyCommand,
          exitCode: execution.exitCode,
          stderrTail: execution.stderrTail,
          topBlocker: resolved ? undefined : (execution.error ?? handoff.blockers[0]),
          error: execution.error,
          nextAction: resolved ? undefined : studioActionFailureNextAction('verify-handoff'),
        });
        return;
      }
      if (action === 'verify') {
        const scope = resolveStudioActionScope(payloadRecord.scope);
        await vscode.commands.executeCommand('workspai.workspaceVerify', {
          source: 'workspai-secondary-sidebar',
          trigger: 'studio-inline-verify',
          scope: payloadRecord.scope,
          workspacePath: scope.workspacePath,
          projectPath: scope.projectPath,
        });
        studioHost.postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          action,
          status: 'done',
        });
        return;
      }
      if (action === 'run-command') {
        const commandText =
          typeof payloadRecord.commandText === 'string' &&
          payloadRecord.commandText.trim().length > 0
            ? payloadRecord.commandText.trim()
            : '';
        if (!commandText) {
          throw new Error('No command was provided to run.');
        }
        const scope = resolveStudioActionScope(payloadRecord.scope);
        if (!scope.workspacePath) {
          throw new Error('No workspace is selected for this Studio command.');
        }
        const cliGate = await gateIncidentStudioRapidkitCommand({
          command: commandText,
          cwd: scope.workspacePath,
          featureLabel: 'Studio command',
        });
        if (!cliGate.allowed) {
          throw new Error(cliGate.error);
        }
        const executionPlan = await resolveRapidkitExecutionPlan({
          command: commandText,
          workspacePath: scope.workspacePath,
          projectPath: scope.projectPath,
          projectBelongsToWorkspace: scope.projectBelongsToWorkspace,
        });
        if ('error' in executionPlan) {
          throw new Error(executionPlan.error);
        }
        await this._assertSidebarStudioMutationAllowed({
          workspacePath: scope.workspacePath,
          projectPath: scope.projectPath,
          actionLabel: 'Studio command',
          commandText,
        });
        runCommandsInTerminal({
          name: 'Workspai Studio',
          cwd: executionPlan.cwd,
          commands: [buildCoreRapidkitShellCommand(executionPlan.executable, executionPlan.args)],
        });
        if (this._context && handoff && commandText === handoff.sourceCommand) {
          void recordStudioBlockerCommandRun(this._context, {
            cardId: handoff.cardId,
            sourceCommand: handoff.sourceCommand,
            blockers: handoff.blockers,
            ...studioCommandLedgerMetadata(handoff),
          });
        }
        studioHost.postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          ...(handoff ? { cardId: handoff.cardId } : {}),
          action,
          actionId: payloadRecord.actionId,
          status: 'done',
          commandText: executionPlan.displayCommand,
        });
        return;
      }
      if (action === 'copy-command') {
        const commandText =
          typeof payloadRecord.commandText === 'string' &&
          payloadRecord.commandText.trim().length > 0
            ? payloadRecord.commandText.trim()
            : '';
        if (!commandText) {
          throw new Error('No command was provided to copy.');
        }
        await vscode.env.clipboard.writeText(commandText);
        studioHost.postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          action,
          actionId: payloadRecord.actionId,
          status: 'done',
        });
        return;
      }
      if (action === 'copy') {
        const task = typeof payloadRecord.task === 'string' ? payloadRecord.task.trim() : '';
        const answer = typeof payloadRecord.answer === 'string' ? payloadRecord.answer.trim() : '';
        if (!task && !answer) {
          throw new Error('No Studio brief is available to copy yet.');
        }
        const scope =
          payloadRecord.scope &&
          typeof payloadRecord.scope === 'object' &&
          !Array.isArray(payloadRecord.scope)
            ? payloadRecord.scope
            : undefined;
        const text = [
          '# Workspai Studio Brief',
          '',
          `Scope: ${JSON.stringify(scope ?? {})}`,
          task ? `Task: ${task}` : '',
          '',
          answer,
        ]
          .filter(Boolean)
          .join('\n');
        await vscode.env.clipboard.writeText(text);
        studioHost.postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          action,
          status: 'done',
        });
      }
    } catch (error) {
      console.warn('[Workspai] Studio action failed', error);
      void recordRetentionMilestone(this._context, 'command_failure', {
        surface: 'studio',
      });
      studioHost.postInlineCreate(
        'sidebarStudioActionResult',
        buildSidebarStudioActionFailurePayload({
          sessionId,
          action,
          error,
          handoff,
          payloadRecord,
          actionId: payloadRecord.actionId,
          stepId: payloadRecord.stepId,
        })
      );
    }
  }

  private async _assertSidebarStudioMutationAllowed(input: {
    workspacePath: string;
    projectPath?: string;
    actionLabel: string;
    commandText?: string;
    governedRepair?: {
      contractAuthorized: boolean;
      reversible: boolean;
      invasive?: boolean;
    };
  }): Promise<void> {
    const commandText = input.commandText?.trim();
    if (commandText && !isMutatingRapidkitCliCommand(commandText)) {
      return;
    }

    if (!this._context) {
      throw new Error(
        `${input.actionLabel} is blocked because Studio mutation policy is unavailable until the extension context is ready.`
      );
    }

    if (input.governedRepair) {
      const repairBlockReason = resolveGovernedStudioRepairMutationBlockReason({
        workspaceTrusted: vscode.workspace.isTrusted,
        ...input.governedRepair,
      });
      if (repairBlockReason) {
        throw new Error(repairBlockReason);
      }
      return;
    }

    const telemetry = await resolveIncidentStudioTelemetry({
      context: this._context,
      workspacePath: input.workspacePath,
      projectPath: input.projectPath,
    });
    const mutationBlockReason = resolveStudioMutationBlockReason(telemetry);
    if (mutationBlockReason) {
      throw new Error(mutationBlockReason);
    }
  }

  private async _finalizeStudioVerifyHandoff(input: {
    handoff: StudioBlockerHandoff;
    workspacePath: string;
    projectPath?: string;
    sessionId?: string;
    verifySucceeded: boolean;
    verifyExitCode?: number | null;
    verifyError?: string;
    agentOwned?: boolean;
  }): Promise<StudioSidebarDashboardRefreshResult> {
    if (this._context) {
      await recordStudioBlockerCommandRun(this._context, {
        cardId: input.handoff.cardId,
        sourceCommand: input.handoff.verifyCommand ?? input.handoff.sourceCommand,
        blockers: input.handoff.blockers,
        dashboardCommandId: input.handoff.dashboardCommandId,
        executionChannel: input.handoff.executionChannel,
        capabilityGate: input.handoff.capabilityGate,
        exitCode: input.verifyExitCode,
      });
    }

    const refresh = await refreshDashboardAfterStudioVerify({
      context: this._context,
      workspacePath: input.workspacePath,
      handoff: input.handoff,
      projectPath: input.projectPath,
      verifyExitCode: input.verifyExitCode,
      refreshDashboardCards: (payload) => WelcomePanel.refreshDashboardEvidenceCards(payload),
    });
    const verifyResolved = refresh.evidenceOutcome === 'resolved';
    if (verifyResolved) {
      void recordRetentionMilestone(this._context, 'return_to_dashboard_after_verify', {
        surface: 'studio',
      });
    }

    const nextHandoff: StudioBlockerHandoff = {
      ...input.handoff,
      cardStatus: refresh.primaryCard?.status ?? input.handoff.cardStatus,
      blockers: refresh.primaryCard?.blockers ?? input.handoff.blockers,
      blockerSignature: refresh.ledger?.nextSignature ?? input.handoff.blockerSignature,
      commandRunCount:
        refresh.ledger?.signatureChanged === true ? 0 : input.handoff.commandRunCount,
      studioMode: verifyResolved ? 'VERIFY_ONLY' : input.handoff.studioMode,
    };
    this._activeBlockerHandoff = nextHandoff;

    this._postInlineCreate('sidebarStudioCardRefreshed', {
      handoff: nextHandoff,
      cardId: input.handoff.cardId,
      cardStatus: refresh.primaryCard?.status,
      blockers: refresh.primaryCard?.blockers ?? [],
      refreshedCardIds: refresh.cardIds,
      verifySucceeded: verifyResolved,
      evidenceOutcome: refresh.evidenceOutcome,
    });
    if (!input.agentOwned && dashboardEvidenceCardIsBlocking(refresh.primaryCard)) {
      void this._postSidebarDoctorRemediationPlan({
        handoff: nextHandoff,
        workspacePath: input.workspacePath,
        sessionId: input.sessionId,
      });
    }

    if (refresh.primaryCard && (!input.agentOwned || verifyResolved)) {
      this._postInlineCreate('sidebarStudioFixApplied', {
        cardId: input.handoff.cardId,
        verifyCommand: input.handoff.verifyCommand,
        verifyArtifact: input.handoff.verifyArtifact,
        requiresVerify: !verifyResolved,
        phase: !verifyResolved ? 'awaiting-verify' : 'verified',
        blockerSignatureBefore: input.handoff.blockerSignature,
        appliedFixes: [],
        cardStatus: refresh.primaryCard?.status,
      });
    }

    void this._auditSidebarStudioFix({
      sessionId: input.sessionId,
      workspacePath: input.workspacePath,
      handoff: input.handoff,
      kind: 'verify-handoff',
      actionId: input.handoff.verifyCommand ?? 'verify-handoff',
      summary: verifyResolved
        ? 'Verify handoff completed.'
        : (input.verifyError ??
          (refresh.evidenceOutcome === 'missing'
            ? 'Verify ran, but refreshed evidence was missing.'
            : 'Verify failed or remains blocking.')),
      ok: verifyResolved,
    });

    if (!input.agentOwned || verifyResolved) {
      const toast = formatStudioCardRefreshToast({
        primaryCard: refresh.primaryCard,
        verifySucceeded: verifyResolved,
      });
      if (toast.kind === 'info') {
        void vscode.window.showInformationMessage(toast.message);
      } else if (toast.kind === 'warning') {
        void vscode.window.showWarningMessage(toast.message);
      } else {
        void vscode.window.showErrorMessage(
          input.verifyError ? `${toast.message} ${input.verifyError}` : toast.message
        );
      }
    }
    return refresh;
  }

  private async _runStudioVerifyContinuation(input: {
    sessionId?: string;
    handoff: StudioBlockerHandoff;
    workspacePath: string;
    projectPath?: string;
    action: string;
    verifyCommand: string;
    verifyActionId: string;
    runningPhase: string;
    runningSummary: string;
    failureFallbackSummary: string;
    rollbackCommand?: string;
    refreshShipLoopOnSuccess?: boolean;
    recordVerifyPassMilestone?: boolean;
  }): Promise<{ verifySucceeded: boolean; summary: string }> {
    const verifyExecutionCommand = ensureDoctorRemediationPlanRefreshCommand(input.verifyCommand);
    const effectiveProjectPath = input.projectPath ?? input.handoff.projectPath;
    this._postInlineCreate('sidebarStudioActionResult', {
      sessionId: input.sessionId,
      cardId: input.handoff.cardId,
      action: input.action,
      status: 'running',
      phase: input.runningPhase,
      summary: input.runningSummary,
      commandText: verifyExecutionCommand,
    });

    const verifyHandoff: StudioBlockerHandoff = {
      ...input.handoff,
      verifyCommand: verifyExecutionCommand,
    };
    const verifyExecution = await runIncidentInlineCommand({
      command: verifyExecutionCommand,
      workspacePath: input.workspacePath,
      projectPath: effectiveProjectPath,
      actionId: input.verifyActionId,
    });
    const refreshResult = await this._finalizeStudioVerifyHandoff({
      handoff: verifyHandoff,
      workspacePath: input.workspacePath,
      projectPath: effectiveProjectPath,
      sessionId: input.sessionId,
      verifySucceeded: verifyExecution.success,
      verifyExitCode: verifyExecution.exitCode ?? (verifyExecution.success ? 0 : 1),
      verifyError: verifyExecution.error,
    });

    let refreshedPlanStepCount = 0;
    if (dashboardEvidenceCardIsBlocking(refreshResult.primaryCard)) {
      const refreshedPlan = await this._postSidebarDoctorRemediationPlan({
        handoff: {
          ...verifyHandoff,
          cardStatus: refreshResult.primaryCard?.status ?? verifyHandoff.cardStatus,
          blockers: refreshResult.primaryCard?.blockers ?? verifyHandoff.blockers,
        },
        workspacePath: input.workspacePath,
        sessionId: input.sessionId,
      });
      refreshedPlanStepCount = refreshedPlan?.visibleSteps.length ?? 0;
    }
    const verifyFailureSummary =
      verifyExecution.error ?? verifyExecution.stderrTail ?? input.failureFallbackSummary;

    const loopProgress = remediationLoopProgressForApply({
      verifySucceeded: verifyExecution.success,
      cardStatus: refreshResult.primaryCard?.status,
      cardBlocking: dashboardEvidenceCardIsBlocking(refreshResult.primaryCard),
      refreshedPlanSteps: refreshedPlanStepCount,
      failureSummary: verifyFailureSummary,
    });
    const cardResolved =
      refreshResult.evidenceOutcome === 'resolved' &&
      studioAgentRepairIsComplete({
        verifyRan: true,
        verifySucceeded: verifyExecution.success,
        cardBlocking: dashboardEvidenceCardIsBlocking(refreshResult.primaryCard),
      });
    const finalSummary = verifyExecution.success ? loopProgress.summary : loopProgress.summary;
    this._postInlineCreate('sidebarStudioActionResult', {
      sessionId: input.sessionId,
      cardId: input.handoff.cardId,
      action: input.action,
      status: loopProgress.status,
      title: loopProgress.title,
      summary: finalSummary,
      commandText: verifyExecutionCommand,
      exitCode: verifyExecution.exitCode,
      stderrTail: verifyExecution.stderrTail,
      topBlocker: cardResolved ? undefined : (verifyExecution.error ?? input.handoff.blockers[0]),
      error: verifyExecution.error,
      nextAction: verifyExecution.success ? loopProgress.nextAction : loopProgress.nextAction,
      nextActionLabel: loopProgress.nextActionLabel,
      ...(!verifyExecution.success && input.rollbackCommand
        ? { rollbackCommand: input.rollbackCommand }
        : {}),
    });

    if (cardResolved && input.refreshShipLoopOnSuccess) {
      await this._refreshSidebarShipLoop({
        workspacePath: input.workspacePath,
        projectPath: effectiveProjectPath,
      });
    }
    if (cardResolved && input.recordVerifyPassMilestone) {
      void recordRetentionMilestone(this._context, 'verify_pass_after_studio_fix', {
        surface: 'studio',
      });
    }
    return {
      verifySucceeded: cardResolved,
      summary: finalSummary,
    };
  }

  private async _finalizeStudioPatchTransaction(
    handoff: StudioBlockerHandoff,
    sessionId: string | undefined,
    result: StudioPatchTransactionResult,
    sourceAction: 'auto-fix' | 'apply-patch' = 'auto-fix',
    scope: { workspacePath?: string; projectPath?: string } = {}
  ): Promise<void> {
    if (sessionId && result.responseText?.trim()) {
      if (!result.responseStreamed) {
        this._postInlineCreate('sidebarStudioChunk', {
          sessionId,
          text: result.responseText.trim(),
        });
      }
      this._postInlineCreate('sidebarStudioDone', {
        sessionId,
        answer: result.responseText.trim(),
      });
    }

    if (result.status === 'review' && result.pendingPatches && result.pendingPatches.length > 0) {
      const reviewKey = sidebarPatchReviewKey(handoff.cardId, sessionId);
      if (!this._context) {
        throw new Error('Studio cannot persist the pending patch transaction.');
      }
      await saveSidebarPendingPatches(this._context, reviewKey, result.pendingPatches);
      this._pendingSidebarPatches.set(reviewKey, result.pendingPatches);
      this._postInlineCreate('sidebarStudioPatchReview', {
        sessionId,
        cardId: handoff.cardId,
        summary: result.summary,
        riskSummary: `Elevated-risk mutation: review ${result.pendingPatches.length} file patch(es) before apply.`,
        patches: serializeSidebarPatchReviewItems(result.pendingPatches),
      });
      this._postInlineCreate('sidebarStudioActionResult', {
        sessionId,
        cardId: handoff.cardId,
        action: sourceAction,
        status: 'review',
        summary: result.summary,
      });
      return;
    }

    if (result.responseText && result.status !== 'applied') {
      this._pendingSidebarPatches.delete(sidebarPatchReviewKey(handoff.cardId, sessionId));
      this._pendingSidebarPatches.delete(handoff.cardId);
      this._postInlineCreate('sidebarStudioActionResult', {
        sessionId,
        cardId: handoff.cardId,
        action: sourceAction,
        status: 'review',
        title: 'AI diagnosis needs an actionable patch',
        summary:
          'The AI diagnosis did not contain complete path-scoped patches. Studio will retry with the preserved evidence and bounded repair budget.',
        requiresApproval: false,
        nextAction: 'auto-fix',
        nextActionLabel: 'Retrying AI repair',
      });
      return;
    }

    if (result.status === 'applied') {
      if (this._context) {
        await recordStudioBlockerCommandRun(this._context, {
          cardId: handoff.cardId,
          sourceCommand: handoff.sourceCommand,
          blockers: handoff.blockers,
          ...studioCommandLedgerMetadata(handoff),
          exitCode: 0,
        });
      }
      this._pendingSidebarPatches.delete(sidebarPatchReviewKey(handoff.cardId, sessionId));
      this._pendingSidebarPatches.delete(handoff.cardId);
      this._postInlineCreate('sidebarStudioPatchReview', {
        sessionId,
        cardId: handoff.cardId,
        cleared: true,
        patches: [],
      });
      const appliedFixes = result.appliedFixes ?? [
        { path: handoff.artifactPath, action: 'apply-debug-patch', outcome: 'applied' },
      ];
      const rollbackCommand = buildSidebarPatchRollbackHint(collectAppliedPatchPaths(appliedFixes));
      const workspacePath =
        scope.workspacePath ??
        handoff.workspacePath ??
        (await resolvePreferredAIModalContext()).workspaceRootPath ??
        undefined;
      const projectPath = handoff.projectPath ?? scope.projectPath;
      const patchMetadata = buildSidebarPatchAuditMetadata({
        sourceAction,
        reviewRequired: sourceAction === 'apply-patch',
        patchResult: result.patchResult,
        appliedFixes,
        rollbackCommand,
      });
      this._postInlineCreate('sidebarStudioFixApplied', {
        cardId: handoff.cardId,
        appliedFixes,
        verifyCommand: handoff.verifyCommand,
        verifyArtifact: handoff.verifyArtifact,
        requiresVerify: true,
        phase: 'awaiting-verify',
        blockerSignatureBefore: handoff.blockerSignature,
        summary: result.summary,
        ...(rollbackCommand ? { rollbackCommand } : {}),
      });
      if (workspacePath && handoff.verifyCommand) {
        const verifyExecutionCommand = ensureDoctorRemediationPlanRefreshCommand(
          handoff.verifyCommand
        );
        this._postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          cardId: handoff.cardId,
          action: sourceAction,
          status: 'running',
          phase: 'verifying-patch',
          summary: 'Patch applied. Running verify now.',
          commandText: verifyExecutionCommand,
        });
        const verifyHandoff: StudioBlockerHandoff = {
          ...handoff,
          verifyCommand: verifyExecutionCommand,
        };
        const verifyExecution = await runIncidentInlineCommand({
          command: verifyExecutionCommand,
          workspacePath,
          projectPath,
          actionId: 'verify-sidebar-patch',
        });
        const refreshResult = await this._finalizeStudioVerifyHandoff({
          handoff: verifyHandoff,
          workspacePath,
          projectPath,
          sessionId,
          verifySucceeded: verifyExecution.success,
          verifyExitCode: verifyExecution.exitCode ?? (verifyExecution.success ? 0 : 1),
          verifyError: verifyExecution.error,
        });
        let refreshedPlanStepCount = 0;
        if (dashboardEvidenceCardIsBlocking(refreshResult.primaryCard)) {
          const refreshedPlan = await this._postSidebarDoctorRemediationPlan({
            handoff: {
              ...verifyHandoff,
              cardStatus: refreshResult.primaryCard?.status ?? verifyHandoff.cardStatus,
              blockers: refreshResult.primaryCard?.blockers ?? verifyHandoff.blockers,
            },
            workspacePath,
            sessionId,
          });
          refreshedPlanStepCount = refreshedPlan?.visibleSteps.length ?? 0;
        }
        const verifyFailureSummary =
          verifyExecution.error ?? verifyExecution.stderrTail ?? result.summary;
        const loopProgress = remediationLoopProgressForApply({
          verifySucceeded: verifyExecution.success,
          cardStatus: refreshResult.primaryCard?.status,
          cardBlocking: dashboardEvidenceCardIsBlocking(refreshResult.primaryCard),
          refreshedPlanSteps: refreshedPlanStepCount,
          failureSummary: verifyFailureSummary,
        });
        const cardResolved =
          refreshResult.evidenceOutcome === 'resolved' &&
          studioAgentRepairIsComplete({
            verifyRan: true,
            verifySucceeded: verifyExecution.success,
            cardBlocking: dashboardEvidenceCardIsBlocking(refreshResult.primaryCard),
          });
        const automaticRollback =
          !cardResolved && result.patchResult
            ? await rollbackAppliedPatches({
                workspacePath,
                patches: result.patchResult.patches,
              })
            : null;
        const rollbackSummary = automaticRollback
          ? automaticRollback.ok
            ? ` Studio rolled back ${automaticRollback.restoredPaths.length} auto-applied file(s) before trying another strategy.`
            : ` Automatic rollback paused because source changed: ${automaticRollback.failedPaths
                .map((entry) => `${entry.path}: ${entry.reason}`)
                .join('; ')}`
          : '';
        void this._auditSidebarStudioFix({
          sessionId,
          workspacePath,
          handoff: verifyHandoff,
          kind: sourceAction === 'apply-patch' ? 'apply-patch' : 'auto-fix',
          actionId: 'apply-debug-patch',
          summary: cardResolved
            ? 'Patch applied and verify completed.'
            : `${verifyExecution.error ?? verifyExecution.stderrTail ?? result.summary}${rollbackSummary}`,
          ok: cardResolved,
          appliedFixes,
          rollbackCommand: rollbackCommand ?? undefined,
          patchMetadata,
        });
        this._postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          cardId: handoff.cardId,
          action: sourceAction,
          status: automaticRollback && !automaticRollback.ok ? 'review' : loopProgress.status,
          title:
            automaticRollback && !automaticRollback.ok
              ? 'Rollback requires review'
              : loopProgress.title,
          summary: `${loopProgress.summary}${rollbackSummary}`,
          commandText: verifyExecutionCommand,
          exitCode: verifyExecution.exitCode,
          stderrTail: verifyExecution.stderrTail,
          topBlocker: cardResolved ? undefined : (verifyExecution.error ?? handoff.blockers[0]),
          error: verifyExecution.error,
          nextAction:
            automaticRollback && !automaticRollback.ok ? undefined : loopProgress.nextAction,
          nextActionLabel:
            automaticRollback && !automaticRollback.ok ? undefined : loopProgress.nextActionLabel,
          ...(automaticRollback && !automaticRollback.ok ? { requiresApproval: true } : {}),
          ...(!cardResolved && rollbackCommand ? { rollbackCommand } : {}),
        });
      } else {
        void this._auditSidebarStudioFix({
          sessionId,
          workspacePath: workspacePath ?? '',
          handoff,
          kind: sourceAction === 'apply-patch' ? 'apply-patch' : 'auto-fix',
          actionId: 'apply-debug-patch',
          summary: result.summary,
          ok: false,
          appliedFixes,
          rollbackCommand: rollbackCommand ?? undefined,
          patchMetadata,
        });
        this._postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          cardId: handoff.cardId,
          action: sourceAction,
          status: 'review',
          title: 'Verification contract missing',
          summary:
            'Patch applied, but Studio cannot claim completion without a workspace and verify command. Review and verify manually.',
          requiresApproval: true,
        });
      }
      return;
    }

    this._pendingSidebarPatches.delete(sidebarPatchReviewKey(handoff.cardId, sessionId));
    this._pendingSidebarPatches.delete(handoff.cardId);
    this._postInlineCreate('sidebarStudioActionResult', {
      sessionId,
      cardId: handoff.cardId,
      action: sourceAction,
      status: 'failed',
      summary: result.summary,
    });
  }

  private async _runSidebarAutoFix(
    handoff: StudioBlockerHandoff,
    sessionId?: string,
    payloadScope?: unknown,
    requestedModelId?: string
  ): Promise<void> {
    const workspacePath =
      handoff.workspacePath ??
      (await resolvePreferredAIModalContext()).workspaceRootPath ??
      undefined;
    if (!workspacePath) {
      throw new Error('No workspace is selected for Studio auto-fix.');
    }
    const workspaceName = path.basename(workspacePath);
    const mode = handoff.studioMode ?? 'FIX';
    const scope = resolveStudioActionScope(payloadScope);
    const projectPath = handoff.projectPath ?? scope.projectPath;
    this._ensureStudioEvidenceWatcher(handoff, sessionId);

    this._postInlineCreate('sidebarStudioActionResult', {
      sessionId,
      cardId: handoff.cardId,
      action: 'auto-fix',
      status: 'running',
      phase: mode === 'RUN_ONCE' ? 'running-source-command' : 'fixing',
    });

    if (mode === 'RUN_ONCE') {
      await this._assertSidebarStudioMutationAllowed({
        workspacePath,
        projectPath,
        actionLabel: 'Studio run-once source command',
        commandText: handoff.sourceCommand,
      });
      const execution = await runIncidentInlineCommand({
        command: handoff.sourceCommand,
        workspacePath,
        projectPath,
        actionId: `run-once-${handoff.cardId}`,
      });
      if (this._context) {
        await recordStudioBlockerCommandRun(this._context, {
          cardId: handoff.cardId,
          sourceCommand: handoff.sourceCommand,
          blockers: handoff.blockers,
          ...studioCommandLedgerMetadata(handoff),
          exitCode: execution.success ? 0 : 1,
        });
      }
      this._postInlineCreate('sidebarStudioFixApplied', {
        cardId: handoff.cardId,
        appliedFixes: [
          {
            path: handoff.artifactPath,
            action: 'run-once',
            outcome: execution.success ? 'pass' : 'fail',
          },
        ],
        verifyCommand: handoff.verifyCommand,
        verifyArtifact: handoff.verifyArtifact,
        requiresVerify: true,
        phase: 'awaiting-verify',
        blockerSignatureBefore: handoff.blockerSignature,
      });
      if (execution.success && handoff.verifyCommand) {
        await this._runStudioVerifyContinuation({
          sessionId,
          handoff,
          workspacePath,
          projectPath,
          action: 'auto-fix',
          verifyCommand: handoff.verifyCommand,
          verifyActionId: 'verify-run-once',
          runningPhase: 'verifying-remediation-step',
          runningSummary: 'Source command completed. Running verify now.',
          failureFallbackSummary: 'Verify after source command failed.',
          refreshShipLoopOnSuccess: true,
        });
      } else {
        this._postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          cardId: handoff.cardId,
          action: 'auto-fix',
          status: execution.success ? 'done' : 'failed',
          summary: execution.success
            ? 'Source command completed. Run verify to refresh the card.'
            : (execution.error ?? 'Source command failed.'),
        });
      }
      void this._auditSidebarStudioFix({
        sessionId,
        workspacePath,
        handoff,
        kind: 'auto-fix',
        actionId: 'run-once',
        summary: execution.success
          ? 'Source command completed.'
          : (execution.error ?? 'Source command failed.'),
        ok: execution.success,
        appliedFixes: [
          {
            path: handoff.artifactPath,
            action: 'run-once',
            outcome: execution.success ? 'pass' : 'fail',
          },
        ],
      });
      return;
    }

    if (mode === 'FIX') {
      await this._runAutonomousStudioAgent({
        task: `Resolve every blocker for ${handoff.cardLabel ?? handoff.cardId}, refresh the required producers, and stop only after fresh non-blocking verify evidence.`,
        sessionId,
        requestedModelId,
        workspacePath,
        projectPath,
        handoff,
      });
      return;
    }

    await this._assertSidebarStudioMutationAllowed({
      workspacePath,
      projectPath,
      actionLabel: 'Studio auto-fix',
    });
    const bootstrapComplianceFix = await applyBootstrapComplianceRemediation({
      workspacePath,
      handoff,
    });
    if (bootstrapComplianceFix.handled) {
      if (!bootstrapComplianceFix.ok) {
        this._postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          cardId: handoff.cardId,
          action: 'auto-fix',
          status: 'failed',
          title: 'Bootstrap compliance fix failed',
          summary: bootstrapComplianceFix.summary,
          nextAction: studioActionFailureNextAction('auto-fix'),
        });
        return;
      }
      this._postInlineCreate('sidebarStudioFixApplied', {
        cardId: handoff.cardId,
        appliedFixes: bootstrapComplianceFix.appliedFixes,
        verifyCommand: bootstrapComplianceFix.verifyCommand,
        verifyArtifact: handoff.verifyArtifact,
        requiresVerify: true,
        phase: 'awaiting-verify',
        blockerSignatureBefore: handoff.blockerSignature,
        summary: bootstrapComplianceFix.summary,
        ...(bootstrapComplianceFix.rollbackCommand
          ? { rollbackCommand: bootstrapComplianceFix.rollbackCommand }
          : {}),
      });
      const verifyHandoff: StudioBlockerHandoff = {
        ...handoff,
        verifyCommand: bootstrapComplianceFix.verifyCommand,
      };
      const verifyContinuation = await this._runStudioVerifyContinuation({
        sessionId,
        handoff: verifyHandoff,
        workspacePath,
        projectPath,
        action: 'auto-fix',
        verifyCommand: bootstrapComplianceFix.verifyCommand,
        verifyActionId: 'verify-bootstrap-compliance-fix',
        runningPhase: 'verifying-bootstrap-compliance',
        runningSummary: 'Bootstrap compliance baseline is ready. Running deterministic verify now.',
        failureFallbackSummary: bootstrapComplianceFix.summary,
        rollbackCommand: bootstrapComplianceFix.rollbackCommand,
        refreshShipLoopOnSuccess: true,
        recordVerifyPassMilestone: true,
      });
      await this._auditSidebarStudioFix({
        sessionId,
        workspacePath,
        handoff: verifyHandoff,
        kind: 'auto-fix',
        actionId: 'bootstrap-compliance-fix',
        summary: verifyContinuation.verifySucceeded
          ? 'Bootstrap compliance fixed and verified in CI mode.'
          : verifyContinuation.summary,
        ok: verifyContinuation.verifySucceeded,
        appliedFixes: bootstrapComplianceFix.appliedFixes,
        rollbackCommand: bootstrapComplianceFix.rollbackCommand,
      });
      return;
    }

    const fixAction = pickStudioFixActionId(handoff);
    const shouldUseEvidencePatch = shouldUseEvidencePatchRepair(handoff, fixAction);
    if (shouldUseEvidencePatch) {
      await this._runAutonomousStudioAgent({
        task: `Resolve the active ${handoff.cardLabel ?? handoff.cardId} blocker completely.`,
        sessionId,
        requestedModelId,
        workspacePath,
        projectPath,
        handoff,
      });
      return;
    }
    if (fixAction === 'doctor-fix') {
      const doctorInvocation = resolveStudioDoctorFixInvocation({ workspacePath, handoff });
      this._postInlineCreate('sidebarStudioActionResult', {
        sessionId,
        cardId: handoff.cardId,
        action: 'auto-fix',
        status: 'running',
        phase: 'preparing-doctor-fix',
        summary: 'Preparing Doctor fix with the current card evidence.',
        commandText: doctorInvocation.command,
      });
      let doctorFixElapsedSeconds = 0;
      const doctorFixHeartbeat = setInterval(() => {
        doctorFixElapsedSeconds += 10;
        this._postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          cardId: handoff.cardId,
          action: 'auto-fix',
          status: 'running',
          phase: 'running-doctor-fix',
          summary: `Doctor fix is still running (${doctorFixElapsedSeconds}s). Keeping this repair session live.`,
          commandText: doctorInvocation.command,
        });
      }, 10_000);
      let doctorRun: Awaited<ReturnType<typeof runRapidkitStreaming<{ fixResult?: unknown }>>>;
      try {
        this._postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          cardId: handoff.cardId,
          action: 'auto-fix',
          status: 'running',
          phase: 'running-doctor-fix',
          summary: 'Running Doctor fix. I will verify the card when it finishes.',
          commandText: doctorInvocation.command,
        });
        doctorRun = await runRapidkitStreaming<{ fixResult?: unknown }>({
          command: doctorInvocation.command,
          cwd: doctorInvocation.cwd,
          featureLabel: 'Studio doctor-fix',
          timeoutMs: 180_000,
        });
      } finally {
        clearInterval(doctorFixHeartbeat);
      }
      this._postInlineCreate('sidebarStudioActionResult', {
        sessionId,
        cardId: handoff.cardId,
        action: 'auto-fix',
        status: 'running',
        phase: 'reading-doctor-fix-result',
        summary: 'Doctor fix returned. Reading applied fixes and remaining blockers.',
        commandText: doctorInvocation.command,
      });
      const fixResult = extractDoctorFixResult(doctorRun.result);
      const doctorOk =
        !doctorRun.failed && fixResult != null && fixResult.remainingBlockers.length === 0;
      if (this._context) {
        await recordStudioBlockerCommandRun(this._context, {
          cardId: handoff.cardId,
          sourceCommand: handoff.sourceCommand,
          blockers: handoff.blockers,
          ...studioCommandLedgerMetadata(handoff),
          exitCode: doctorRun.exitCode,
        });
      }
      this._postInlineCreate('sidebarStudioFixApplied', {
        cardId: handoff.cardId,
        appliedFixes: (fixResult?.appliedFixes ?? []).map((entry) => ({
          path: entry.path,
          action: entry.action,
          outcome: entry.outcome,
        })),
        verifyCommand: fixResult?.verifyRecommended ?? handoff.verifyCommand,
        verifyArtifact: handoff.verifyArtifact,
        requiresVerify: true,
        phase: 'awaiting-verify',
        blockerSignatureBefore: handoff.blockerSignature,
      });
      const verifyCommand = fixResult?.verifyRecommended ?? handoff.verifyCommand;
      if (!doctorRun.failed && verifyCommand) {
        const verifyHandoff: StudioBlockerHandoff = { ...handoff, verifyCommand };
        const verifyContinuation = await this._runStudioVerifyContinuation({
          sessionId,
          handoff: verifyHandoff,
          workspacePath,
          projectPath,
          action: 'auto-fix',
          verifyCommand,
          verifyActionId: 'verify-doctor-fix',
          runningPhase: 'verifying-remediation-step',
          runningSummary: 'Doctor fix completed. Running verify now.',
          failureFallbackSummary: fixResult?.remainingBlockers[0] ?? 'Doctor fix verify failed.',
          refreshShipLoopOnSuccess: true,
        });
        await this._auditSidebarStudioFix({
          sessionId,
          workspacePath,
          handoff: verifyHandoff,
          kind: 'auto-fix',
          actionId: 'doctor-fix',
          summary: verifyContinuation.verifySucceeded
            ? 'Doctor fix completed and verify refreshed the card.'
            : verifyContinuation.summary,
          ok: verifyContinuation.verifySucceeded,
          appliedFixes: (fixResult?.appliedFixes ?? []).map((entry) => ({
            path: entry.path,
            action: entry.action,
            outcome: entry.outcome,
          })),
        });
        return;
      }
      this._postInlineCreate('sidebarStudioActionResult', {
        sessionId,
        cardId: handoff.cardId,
        action: 'auto-fix',
        status: doctorOk ? 'done' : 'failed',
        summary: doctorOk
          ? 'Doctor fix completed. Run verify to refresh the card.'
          : (fixResult?.remainingBlockers[0] ?? 'Doctor fix reported remaining blockers.'),
        nextAction: doctorOk ? undefined : studioActionFailureNextAction('verify-handoff'),
      });
      void this._auditSidebarStudioFix({
        sessionId,
        workspacePath,
        handoff,
        kind: 'auto-fix',
        actionId: 'doctor-fix',
        summary: doctorOk
          ? 'Doctor fix completed from sidebar Studio.'
          : (fixResult?.remainingBlockers.join('; ') ?? 'Doctor fix failed.'),
        ok: doctorOk,
        appliedFixes: (fixResult?.appliedFixes ?? []).map((entry) => ({
          path: entry.path,
          action: entry.action,
          outcome: entry.outcome,
        })),
      });
      return;
    }

    if (!this._context) {
      throw new Error('Studio fix engine requires extension context.');
    }

    if (fixAction === 'fix-lens') {
      await this._runAutonomousStudioAgent({
        task: `Resolve the active ${handoff.cardLabel ?? handoff.cardId} blocker completely.`,
        sessionId,
        requestedModelId,
        workspacePath,
        projectPath,
        handoff,
      });
      return;
    }

    const { actionResult } = await executeStudioActionById(
      this._context,
      { workspacePath, workspaceName },
      fixAction as StudioActionId,
      {
        source: 'workspai-secondary-sidebar',
        trigger: 'studio-auto-fix',
        cardId: handoff.cardId,
      }
    );
    const actionSucceeded = actionResult?.gatePassed !== false;
    if (this._context) {
      await recordStudioBlockerCommandRun(this._context, {
        cardId: handoff.cardId,
        sourceCommand: handoff.sourceCommand,
        blockers: handoff.blockers,
        ...studioCommandLedgerMetadata(handoff),
        exitCode: actionSucceeded ? 0 : 1,
      });
    }
    if (actionSucceeded) {
      this._postInlineCreate('sidebarStudioFixApplied', {
        cardId: handoff.cardId,
        appliedFixes: [{ path: handoff.artifactPath, action: fixAction, outcome: 'applied' }],
        verifyCommand: handoff.verifyCommand,
        verifyArtifact: handoff.verifyArtifact,
        requiresVerify: true,
        phase: 'awaiting-verify',
        blockerSignatureBefore: handoff.blockerSignature,
        summary: actionResult?.summary,
      });
    }
    if (actionSucceeded && handoff.verifyCommand) {
      const verifyHandoff: StudioBlockerHandoff = {
        ...handoff,
        verifyCommand: handoff.verifyCommand,
      };
      const verifyContinuation = await this._runStudioVerifyContinuation({
        sessionId,
        handoff: verifyHandoff,
        workspacePath,
        projectPath,
        action: 'auto-fix',
        verifyCommand: handoff.verifyCommand,
        verifyActionId: `verify-${fixAction}`,
        runningPhase: 'verifying-remediation-step',
        runningSummary: `${actionResult?.summary ?? `Studio action ${fixAction} completed.`} Running verify now.`,
        failureFallbackSummary:
          actionResult?.summary ?? `Studio action ${fixAction} verify failed.`,
        refreshShipLoopOnSuccess: true,
      });
      await this._auditSidebarStudioFix({
        sessionId,
        workspacePath,
        handoff: verifyHandoff,
        kind: 'auto-fix',
        actionId: fixAction,
        summary: verifyContinuation.verifySucceeded
          ? `Studio action ${fixAction} completed and verify refreshed the card.`
          : verifyContinuation.summary,
        ok: verifyContinuation.verifySucceeded,
        appliedFixes: [{ path: handoff.artifactPath, action: fixAction, outcome: 'applied' }],
      });
      return;
    }
    this._postInlineCreate('sidebarStudioActionResult', {
      sessionId,
      cardId: handoff.cardId,
      action: 'auto-fix',
      status: actionSucceeded ? 'done' : 'failed',
      title: actionSucceeded ? undefined : 'Gate still blocked',
      summary: actionResult?.summary ?? `Studio action ${fixAction} completed.`,
      nextAction: actionSucceeded ? undefined : studioActionFailureNextAction('verify-handoff'),
    });
    void this._auditSidebarStudioFix({
      sessionId,
      workspacePath,
      handoff,
      kind: 'auto-fix',
      actionId: fixAction,
      summary: actionResult?.summary ?? `Studio action ${fixAction} completed.`,
      ok: actionSucceeded,
      appliedFixes: actionSucceeded
        ? [{ path: handoff.artifactPath, action: fixAction, outcome: 'applied' }]
        : [],
    });
  }

  private async _runSidebarAction(
    action: SidebarActionSurfaceMeta,
    invocationPayload?: unknown
  ): Promise<void> {
    try {
      this._trackSidebarAction(action);

      if (action.handler === 'external-url') {
        if (!action.externalUrl) {
          return;
        }
        const opened = await vscode.env.openExternal(vscode.Uri.parse(action.externalUrl));
        if (!opened) {
          void vscode.window.showWarningMessage(
            `Workspai could not open ${action.label}. Please try again from the Command Palette.`
          );
        }
        return;
      }

      if (action.vscodeCommand) {
        const payload = {
          ...(action.payloadDefaults ?? {}),
          ...(invocationPayload &&
          typeof invocationPayload === 'object' &&
          !Array.isArray(invocationPayload)
            ? (invocationPayload as Record<string, unknown>)
            : {}),
        };
        const contract = resolveDashboardCommandContractByVscodeCommand(action.vscodeCommand);
        const capability = await gateDashboardCommandCapability({
          contract,
          commandId: action.id,
          cwd: this._resolveSidebarActionCapabilityCwd(payload),
        });
        if (!capability.ok) {
          void vscode.window.showWarningMessage(capability.reason, 'Open Setup').then((choice) => {
            if (choice === 'Open Setup') {
              void vscode.commands.executeCommand('workspai.openSetup');
            }
          });
          this._postInlineCreate('sidebarActionError', {
            actionId: action.id,
            title: action.label,
            error: capability.reason,
          });
          return;
        }
        if (payload && Object.keys(payload).length > 0) {
          await vscode.commands.executeCommand(action.vscodeCommand, payload);
          return;
        }
        await vscode.commands.executeCommand(action.vscodeCommand);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Workspai] Sidebar action failed: ${action.id}`, error);
      void vscode.window.showErrorMessage(`Workspai action failed: ${action.label}. ${message}`);
      this._postInlineCreate('sidebarActionError', {
        actionId: action.id,
        title: action.label,
        error: message,
      });
    }
  }

  private _resolveSidebarActionCapabilityCwd(payload: Record<string, unknown>): string | undefined {
    const nestedWorkspace =
      payload.workspace && typeof payload.workspace === 'object'
        ? (payload.workspace as { path?: unknown })
        : undefined;
    const explicitPath =
      typeof payload.workspacePath === 'string' && payload.workspacePath.trim()
        ? payload.workspacePath.trim()
        : typeof payload.path === 'string' && payload.path.trim()
          ? payload.path.trim()
          : typeof nestedWorkspace?.path === 'string' && nestedWorkspace.path.trim()
            ? nestedWorkspace.path.trim()
            : undefined;
    return explicitPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private async _runSidebarCreatedWorkspaceBootstrap(payload: unknown): Promise<void> {
    const payloadRecord =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const workspacePath =
      typeof payloadRecord.workspacePath === 'string' ? payloadRecord.workspacePath.trim() : '';
    if (!workspacePath) {
      this._postInlineCreate('sidebarManualCreateResult', {
        status: 'failed',
        mode: 'workspace',
        error: 'Created workspace path is missing; cannot bootstrap safely.',
      });
      return;
    }
    const workspaceName =
      typeof payloadRecord.workspaceName === 'string' && payloadRecord.workspaceName.trim()
        ? payloadRecord.workspaceName.trim()
        : typeof payloadRecord.name === 'string' && payloadRecord.name.trim()
          ? payloadRecord.name.trim()
          : path.basename(workspacePath);
    const profile =
      typeof payloadRecord.profile === 'string' && payloadRecord.profile.trim()
        ? payloadRecord.profile.trim()
        : undefined;

    await vscode.commands.executeCommand('workspai.workspaceBootstrap', {
      path: workspacePath,
      workspacePath,
      name: workspaceName,
      workspaceName,
      ...(profile ? { profile } : {}),
    });
  }

  private _trackSidebarAction(action: SidebarActionSurfaceMeta): void {
    if (!action.trackActivity) {
      return;
    }

    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    void WorkspaceUsageTracker.getInstance().trackCommandEvent(
      `workspai.sidebar.${action.id}`,
      workspacePath,
      {
        surface: 'sidebar-actions-webview',
        variant: this._variant,
        actionId: action.id,
        scope: action.scope,
        handler: action.handler,
        vscodeCommand: action.vscodeCommand,
      }
    );
  }

  private _getHtmlContent(webview: vscode.Webview): string {
    // Both sidebar surfaces render the React `sidebar` bundle with `ws-*` tokens
    // (roadmap 2.11). The variant is injected so the React root mounts either the
    // activity-bar Quick Actions or the secondary-sidebar Create/Advisor/Studio
    // tabs. Host message handlers (`sidebar*`) are unchanged.
    const iconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'icons', 'workspai.svg')
    );
    return buildReactWebviewHtml({
      webview,
      extensionUri: this._extensionUri,
      bundleName: 'sidebar',
      title: this._variant === 'secondary-sidebar' ? 'Workspai' : 'Workspai Quick Actions',
      bootstrapGlobals: {
        WORKSPAI_SIDEBAR_VARIANT: this._variant,
        ICON_URI: iconUri.toString(),
      },
    });
  }

  dispose() {
    if (this._studioEvidencePulseTimer) {
      clearTimeout(this._studioEvidencePulseTimer);
      this._studioEvidencePulseTimer = undefined;
    }
    this._studioEvidenceWatcher?.dispose();
    this._studioEvidenceWatcher = undefined;
    this._studioEvidenceChangedPaths.clear();
  }
}

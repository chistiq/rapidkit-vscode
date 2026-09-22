/**
 * Actions Webview Provider
 * Sidebar action surface aligned with Workspai dashboard tile vocabulary.
 */

import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
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
import { ensureManagedDefaultWorkspace } from '../../core/ensureManagedDefaultWorkspace';
import { createProjectCommand } from '../../commands/createProject';
import {
  createManagedWorkspace,
  describePortableCreationFailure,
} from '../../core/workspaceCreationService';
import { WorkspaiCLI } from '../../core/rapidkitCLI';
import { WorkspaceManager } from '../../core/workspaceManager';
import { readWorkspaiSettings, setWorkspaiPreferredModel } from '../../core/workspaiSettingsBridge';
import { resolvePreferredAIModalContext } from '../../core/aiContextResolver';
import { resolveRapidkitExecutionPlan } from '../../core/incidentInlineCommandRunner';
import {
  buildStudioDependencySecurityCommand,
  parseStudioDependencyUpgradeCandidates,
  resolveStudioDependencySecurityTarget,
} from '../../core/studioDependencySecurity.js';
import {
  assertVerifiedGoalCommandSafety,
  assertVerifiedGoalPackageManifestSafety,
  assertVerifiedGoalSourceMutationSafety,
  parseVerifiedGoalVerifyResult,
  verifiedGoalVerifyArgs,
  type VerifiedGoalContractPayload,
} from '../../core/verifiedGoalIntent.js';
import {
  routeAssistantIntent,
  type AssistantIntentRoute,
} from '../../core/assistantIntentRouter.js';
import { routeCreateIntent } from '../../core/createIntentRouter.js';
import {
  runCreateCapabilityPlanning,
  type CreateCapabilityToolDefinition,
} from '../../core/createCapabilityHost.js';
import {
  CreatePlanApprovalStore,
  createScopeBinding,
  parseCreatePlanAuthorization,
} from '../../core/createPlanApproval.js';
import { bindCreatePlanDestination } from '../../core/createPlanDestination.js';
import {
  CreateExecutionCapabilityError,
  executeApprovedCreatePlan,
} from '../../core/createExecutionCapability.js';
import {
  buildAssistantPlanAgentHandoff,
  assistantExecutionPolicyInstruction,
  parseAssistantExecutionPolicy,
  resolveAssistantExecutionPolicy,
  type AssistantExecutionPolicy,
} from '../../core/assistantExecutionPolicy.js';
import { buildAssistantEditorFocus } from '../../core/assistantEditorFocus.js';
import { buildCoreRapidkitShellCommand, runCommandsInTerminal } from '../../utils/terminalExecutor';
import { buildRapidkitCommand } from '../../utils/platformCapabilities';
import { Logger } from '../../utils/logger';
import {
  defaultScaffoldKitForFramework,
  isAgentScaffoldKit,
  isScaffoldFramework,
  listExecutableScaffoldFrameworks,
  listExecutableScaffoldKits,
  scaffoldKitsForFramework,
  type ScaffoldFramework,
} from '../../core/scaffoldKits';
import {
  isStudioBlockerHandoff,
  type StudioCausalRepairTarget,
  type StudioBlockerHandoff,
} from '../../contracts/studio-blocker-handoff-contract.js';
import { buildStudioBlockerHandoff } from '../../core/studioBlockerHandoffBuilder.js';
import { isRegisteredWorkspaceProjectPath } from '../../core/workspaceModelReader.js';
import { recordStudioBlockerCommandRun } from '../../core/studioBlockerCommandLedger.js';
import { runRapidkitStreaming } from '../../core/streamingRapidkitRunner.js';
import { buildWorkspaceGraphSearchCommand } from '../../core/workspaceGraphSearchCommand.js';
import {
  studioProofEffectClassesForCommand,
  StudioProofCarryingChangeSession,
} from '../../core/studioProofCarryingChange.js';
import { gateIncidentStudioRapidkitCommand } from '../../core/rapidkitEnterpriseCliGate.js';
import { normalizeBootstrapComplianceCommand } from '../../core/bootstrapComplianceRemediation.js';
import {
  isExpectedDiagnosticFindingExit,
  isMutatingRapidkitCliCommand,
  runIncidentInlineCommand,
} from '../panels/incidentStudioInlineCommandBridge.js';
import { resolveIncidentStudioTelemetry } from '../panels/incidentStudioTelemetryBridge.js';
import {
  resolveGovernedStudioRepairMutationBlockReason,
  resolveStudioMutationBlockReason,
} from '../panels/incidentStudioMutationGate.js';
import {
  dashboardEvidenceCardIsBlocking,
  formatStudioCardRefreshToast,
  refreshDashboardAfterStudioVerify,
  type StudioSidebarDashboardRefreshResult,
} from '../../core/studioSidebarDashboardRefresh.js';
import { buildDashboardEvidenceBundle } from '../../core/dashboardEvidenceBridge.js';
import { buildEvidenceAgentContextBundle } from '../../core/evidenceAgentContextBundle.js';
import { buildAssistantEvidenceObjective } from '../../core/assistantEvidenceObjective.js';
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
import {
  ensureStudioRemediationRecovery,
  selectStudioRemediationEnvironmentPrerequisite,
  selectStudioRemediationRecoveryStep,
} from '../../core/studioRemediationRecovery.js';
import { resolveDashboardCommandContractByVscodeCommand } from '../../core/dashboardCommandContracts.js';
import { gateDashboardCommandCapability } from '../../core/dashboardCommandCapabilityGate.js';
import {
  applyStudioGovernedCommandReuse,
  bindStudioGovernedCommandScope,
  preserveAllAgentConsumersForStudioRefresh,
  resolveDashboardCommandExecutionPlan,
} from '../../core/dashboardCommandExecutionPlan.js';
import { collectSidebarStudioRepairEvidence } from '../../core/sidebarStudioPatchBridge.js';
import type { StudioEvidenceRefreshCommandId } from '../../core/sidebarStudioAgentRuntime.js';
import { resolveStudioCausalProducerRoute } from '../../core/studioCausalProducerRouter.js';
import { buildStudioCausalRecoveryBriefing } from '../../core/studioCausalRecoveryBriefing.js';
import { resolveRuntimeSetupGuidance } from '../../contracts/runtimeSetupGuidance.js';
import { normalizePatchesForWorkspaceScope, type FilePatch } from '../../core/patchApplyEngine.js';
import {
  clearSidebarPendingPatches,
  readSidebarPendingPatches,
} from '../../core/sidebarStudioRepairState.js';
import {
  dispatchSidebarShipLoopStep,
  isSidebarShipLoopStepId,
  resolveSidebarShipLoopPayload,
} from '../../core/sidebarStudioShipLoopBridge.js';
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
import { resolveWorkspaceEvidenceFreshness } from '../../core/workspaceEvidenceFreshness.js';
import {
  isWorkspaiAssistantMode,
  resolveWorkspaiAssistantModeContract,
  type WorkspaiAssistantMode,
} from '../../core/assistantModeContract.js';
import {
  buildActiveGoalPromptSection,
  isGoalLifecycleResult,
  readActiveGoalHandoff,
  runGoalCommand,
} from '../../core/workspaceGoals.js';
import {
  isGovernedGoalSetupCancelledError,
  prepareGovernedGoalSession,
  restoreOrRenewGovernedGoalSession,
} from '../../core/governedGoalSession.js';
import {
  bootstrapProjectAgent,
  buildProjectAgentBootstrapPromptSection,
  requireReadyProjectAgentBootstrap,
  requireUsableProjectAgentBootstrap,
} from '../../core/projectAgentBootstrap.js';
import {
  StudioAgentSession,
  studioAgentSessionScopeMatches,
} from '../../core/studioAgentSession.js';
import {
  buildStudioVerifiedRepairReceipt,
  presentStudioCliOwnedRepairObservation,
  selectStudioPostCliSourceCandidates,
} from '../../core/studioRepairReceipt.js';
import { VSCodeStudioAgentSessionStore } from '../../core/studioAgentSessionStore.js';
import { ContractStudioAgentModelAdapter } from '../../core/studioAgentModelProtocol.js';
import type {
  StudioAgentApprovalExecution,
  StudioAgentToolApprovalGrant,
  StudioAgentToolApprovalDecision,
  StudioAgentToolApprovalRequest,
} from '../../core/studioAgentToolRegistry.js';
import {
  createStudioAgentWorkspaiToolRegistry,
  type StudioAgentWorkspaiToolHost,
} from '../../core/studioAgentWorkspaiTools.js';
import { studioHostLanguageModelToolAdapters } from '../../core/studioHostLanguageModelTools.js';
import { inspectStudioAgentFiles } from '../../core/sidebarStudioAgentRuntime.js';
import {
  resolveStudioWorkspaceCommandPlan,
  type StudioWorkspaceCommandRequest,
} from '../../core/studioWorkspaceCommand.js';
import { executeStudioWorkspaceCommandTransaction } from '../../core/studioWorkspaceCommandTransaction.js';
import {
  requestVSCodeProofCarryingChangeResume,
  requestStudioToolApproval,
} from '../../core/studioToolApproval.js';
import { runStudioCodeIntelligenceTool } from '../../core/studioCodeIntelligence.js';
import {
  discoverStudioWorkspaceFiles,
  inspectStudioWorkspaceChanges,
  inspectStudioWorkspaceDiagnostics,
  searchStudioWorkspaceSource,
} from '../../core/studioWorkspaceInspection.js';
import {
  decideCliOwnedRepair,
  executeCliOwnedCanonicalRepair,
  executeCliOwnedPatchRepair,
  projectWorkspaceRepairTransactionForConsumer,
  hydrateStudioRepairEventFileChanges,
  readCliOwnedRepairById,
  readLatestCliOwnedRepair,
  type WorkspaceRepairCliFileChange,
  type WorkspaceRepairDecision,
  type WorkspaceRepairProgress,
} from '../../core/workspaceRepairCliClient.js';
import { resolveStudioRepairComparisonUris } from '../../core/studioRepairDiffDocuments.js';
import {
  authorizeStudioWorkspacePatchTargets,
  compileInspectedStudioDeletePatches,
  compileInspectedStudioTextEdits,
} from '../../core/studioWorkspaceFileTransactions.js';
import {
  resolveStudioRepairGoalScope,
  resolveStudioRepairProjectTarget,
} from '../../core/studioRepairProjectTarget.js';
import {
  deduplicateStudioMessage,
  describeStudioRepairOutcome,
} from '../../core/studioRepairPresentation.js';
import {
  requireStudioCardRepairCapability,
  studioCardSupportsGovernedSourceMutation,
} from '../../contracts/studioCardRepairCapabilities.js';

const PYTHON_ENGINE_REQUIRED_CREATION_PROFILES = new Set(['python-only', 'polyglot', 'enterprise']);

function shouldSkipPythonEngineForCreationProfile(profile: string | undefined): boolean {
  return !PYTHON_ENGINE_REQUIRED_CREATION_PROFILES.has(profile ?? 'minimal');
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

function sidebarPatchReviewKey(cardId: string, sessionId?: string): string {
  return sessionId?.trim() ? `${sessionId.trim()}::${cardId}` : cardId;
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
      'Standalone editor diagnostic session. Do not assume Workspai workspace evidence unless the user supplies it.',
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

function resolveExplicitWorkspaceScope(payloadScope: unknown): {
  workspacePath?: string;
  workspaceName?: string;
  projectPath?: string;
  projectName?: string;
} {
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
  const project =
    scope.project && typeof scope.project === 'object' && !Array.isArray(scope.project)
      ? (scope.project as Record<string, unknown>)
      : null;
  const directProjectPath =
    typeof scope.projectPath === 'string' && scope.projectPath.trim().length > 0
      ? scope.projectPath.trim()
      : undefined;
  const projectPath =
    typeof project?.path === 'string' && project.path.trim().length > 0
      ? project.path.trim()
      : undefined;
  const workspaceName =
    typeof scope.workspaceName === 'string' && scope.workspaceName.trim().length > 0
      ? scope.workspaceName.trim()
      : typeof workspace?.name === 'string' && workspace.name.trim().length > 0
        ? workspace.name.trim()
        : undefined;
  const projectName =
    typeof scope.projectName === 'string' && scope.projectName.trim().length > 0
      ? scope.projectName.trim()
      : typeof project?.name === 'string' && project.name.trim().length > 0
        ? project.name.trim()
        : undefined;
  return {
    workspacePath: directWorkspacePath ?? workspacePath,
    workspaceName,
    projectPath: directProjectPath ?? projectPath,
    projectName,
  };
}

function parseStudioBlockerHandoffPayload(value: unknown): StudioBlockerHandoff | undefined {
  if (!isStudioBlockerHandoff(value)) {
    return undefined;
  }
  return value;
}

async function selectGovernedGoalScope(input: {
  projects: string[];
}): Promise<import('../../core/governedGoalSession.js').GovernedGoalScopeSelection | null> {
  const mode = await vscode.window.showQuickPick(
    [
      {
        label: 'One project',
        description: 'Apply this Goal to one canonical project',
        value: 'one' as const,
      },
      {
        label: 'Multiple projects',
        description: 'Apply this Goal to a selected project set',
        value: 'many' as const,
      },
      {
        label: 'Entire workspace',
        description: 'Apply this Goal to every registered project',
        value: 'workspace' as const,
      },
    ],
    { title: 'Where should this Goal apply?', placeHolder: 'Choose a bounded canonical scope' }
  );
  if (!mode) {
    return null;
  }
  if (mode.value === 'workspace') {
    return { kind: 'workspace' };
  }
  const selected = await vscode.window.showQuickPick(
    input.projects.map((project) => ({ label: project, project })),
    {
      title: mode.value === 'one' ? 'Choose one project' : 'Choose projects',
      placeHolder: 'Projects come from the canonical Workspace Model',
      canPickMany: mode.value === 'many',
    }
  );
  if (!selected || (Array.isArray(selected) && selected.length === 0)) {
    return null;
  }
  const projects = (Array.isArray(selected) ? selected : [selected]).map((item) => item.project);
  if (mode.value === 'many' && projects.length < 2) {
    void vscode.window.showWarningMessage('Select at least two projects for a project-set Goal.');
    return null;
  }
  return { kind: 'projects', projects };
}

async function selectGovernedGoalRuntime(input: { runtimes: string[] }): Promise<string | null> {
  const selected = await vscode.window.showQuickPick(
    input.runtimes.map((runtime) => ({ label: runtime, runtime })),
    {
      title: 'Which canonical runtime should this Goal measure?',
      placeHolder: 'Runtime choices come from the selected Workspace Model scope',
    }
  );
  return selected?.runtime ?? null;
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
  private _viewReady = false;
  private _pendingSecondaryTab?: WorkspaiSecondaryTab;
  private _pendingSecondaryTabPayload?: WorkspaiSecondaryTabPayload;
  private _activeBlockerHandoff?: StudioBlockerHandoff;
  private _pendingSidebarPatches = new Map<string, FilePatch[]>();
  private _lastSidebarStudioAuditInput?: RecordSidebarStudioFixAuditInput;
  private _studioEvidenceWatcher?: vscode.Disposable;
  private _studioEvidenceWatchScope?: string;
  private _studioEvidenceWatchSessionId?: string;
  private _studioEvidencePulseTimer?: NodeJS.Timeout;
  private _studioEvidenceGeneration = 0;
  private _studioEvidenceChangedPaths = new Set<string>();
  private readonly _activeStudioAgentSessions = new Map<string, StudioAgentSession>();
  private readonly _activeStudioAgentRepairRuns = new Map<string, Promise<void>>();
  private readonly _pendingStudioToolApprovals = new Map<
    string,
    {
      id: symbol;
      request: StudioAgentToolApprovalRequest;
      resolve: (execution: StudioAgentApprovalExecution | undefined) => void;
    }
  >();
  private readonly _createPlanApprovals = new CreatePlanApprovalStore<AICreationPlan>();
  private readonly _activeCreatePlanningTokens = new Map<string, vscode.CancellationTokenSource>();

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
    this._viewReady = false;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // The local bundle can mount immediately. Register before assigning HTML so
    // its ready handshake can never race past the host receiver.
    webviewView.webview.onDidReceiveMessage((rawMessage) => {
      void dispatchActionsWebviewMessage(this._actionsWebviewMessageDispatchHost(), rawMessage);
    });
    webviewView.onDidDispose(() => {
      if (this._view === webviewView) {
        this._view = undefined;
        this._viewReady = false;
      }
      this._cancelPendingStudioToolApprovals();
    });
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible && this._viewReady) {
        void this._sendSidebarInitialState();
      }
    });

    webviewView.webview.html = this._getHtmlContent(webviewView.webview);
  }

  private _actionsWebviewMessageDispatchHost(): ActionsWebviewMessageDispatchHost {
    return {
      runInlineAICreatePlan: (data) => this._runInlineAICreatePlan(data),
      runInlineAICreateConfirm: (data) => this._runInlineAICreateConfirm(data),
      cancelInlineAICreatePlan: (data) => this._cancelInlineAICreatePlan(data),
      runSidebarManualCreate: (data) => this._runSidebarManualCreate(data),
      runSidebarCreatedWorkspaceBootstrap: (data) =>
        this._runSidebarCreatedWorkspaceBootstrap(data),
      runInlineImpactQuery: (data) => this._runInlineImpactQuery(data),
      runSidebarAdvisorAction: (data) => this._runSidebarAdvisorAction(data),
      runInlineStudioQuery: (data) => this._runInlineStudioQuery(data),
      runSidebarStudioAction: (data) => this._runSidebarStudioAction(data),
      resolveStudioToolApproval: (data) => this._resolveStudioToolApproval(data),
      focusPrimarySidebarView: (data) => this._focusPrimarySidebarView(data),
      openDashboardSection: (data) => this._openDashboardSection(data),
      openWorkspaceFile: (data) => this._openSidebarWorkspaceFile(data),
      openWorkspaceDiff: (data) => this._openSidebarWorkspaceDiff(data),
      reviewWorkspaceChanges: async (data) => {
        try {
          await this._reviewSidebarWorkspaceChanges(data);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this._postInlineCreate('sidebarActionError', {
            title: 'Review unavailable',
            error: message,
          });
          void vscode.window.showWarningMessage(`Workspai review: ${message}`);
        }
      },
      undoAgentPatch: (data) => this._undoStudioAgentPatch(data),
      openSetup: async () => {
        await vscode.commands.executeCommand('workspai.openSetup');
      },
      sendInitialState: () => this._sendSidebarInitialState(),
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
      auditSidebarStudioFix: (input) => this._auditSidebarStudioFix(input),
      refreshSidebarShipLoop: (input) => this._refreshSidebarShipLoop(input),
      finalizeStudioVerifyHandoff: (input) => this._finalizeStudioVerifyHandoff(input),
    });
  }

  public refresh() {
    if (this._view) {
      this._viewReady = false;
      this._view.webview.html = this._getHtmlContent(this._view.webview);
    }
  }

  public refreshScope(): void {
    void this._sendInlineScope();
  }

  private async _sendSidebarInitialState(): Promise<void> {
    this._viewReady = true;
    this._sendInlineThemeSettings();
    if (this._pendingSecondaryTab) {
      this._postSecondaryTabActivation(this._pendingSecondaryTab, this._pendingSecondaryTabPayload);
    }
    await Promise.allSettled([this._sendInlineModels(), this._sendInlineScope()]);
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

  private async _openSidebarWorkspaceDiff(data: unknown): Promise<void> {
    const record =
      data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    const relativePath = typeof record.relativePath === 'string' ? record.relativePath.trim() : '';
    const transactionId =
      typeof record.transactionId === 'string' ? record.transactionId.trim() : '';
    const requestedRoot =
      typeof record.workspacePath === 'string' ? record.workspacePath.trim() : '';
    const workspacePath =
      requestedRoot || (await resolvePreferredAIModalContext()).workspaceRootPath || '';
    if (!workspacePath || !relativePath || !transactionId || path.isAbsolute(relativePath)) {
      throw new Error('A workspace-relative path and repair transaction id are required.');
    }
    const comparison = await resolveStudioRepairComparisonUris({
      workspacePath,
      transactionId,
      relativePath,
    });
    await vscode.commands.executeCommand(
      'vscode.diff',
      comparison.before,
      comparison.after,
      `${relativePath} · Workspai repair ${transactionId.slice(0, 12)}`,
      { preview: true, preserveFocus: false }
    );
  }

  /**
   * Open every comparable file of a repair change set in one native review.
   *
   * Files that cannot be compared exactly (stale, binary, or oversized) are
   * skipped with an explicit report instead of silently shrinking the review,
   * so the user always knows which changes the comparison covers.
   */
  private async _reviewSidebarWorkspaceChanges(data: unknown): Promise<void> {
    const record =
      data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    const requestedRoot =
      typeof record.workspacePath === 'string' ? record.workspacePath.trim() : '';
    const workspacePath =
      requestedRoot || (await resolvePreferredAIModalContext()).workspaceRootPath || '';
    const files = Array.isArray(record.files)
      ? record.files
          .filter(
            (entry): entry is Record<string, unknown> =>
              Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
          )
          .map((entry) => ({
            relativePath: typeof entry.relativePath === 'string' ? entry.relativePath.trim() : '',
            transactionId:
              typeof entry.transactionId === 'string' ? entry.transactionId.trim() : '',
          }))
          .filter((entry) => entry.relativePath && entry.transactionId)
      : [];
    if (!workspacePath || files.length === 0) {
      throw new Error('A workspace path and at least one changed file are required for review.');
    }
    const comparable: {
      relativePath: string;
      resource: [vscode.Uri, vscode.Uri, vscode.Uri];
    }[] = [];
    const skipped: string[] = [];
    for (const file of files) {
      const comparison = await resolveStudioRepairComparisonUris({
        workspacePath,
        transactionId: file.transactionId,
        relativePath: file.relativePath,
      }).catch(() => undefined);
      if (!comparison) {
        skipped.push(file.relativePath);
        continue;
      }
      comparable.push({
        relativePath: file.relativePath,
        resource: [comparison.label, comparison.before, comparison.after],
      });
    }
    if (comparable.length === 0) {
      throw new Error(
        'No changed file in this set has an exact comparison. The files changed again after the repair, or they are binary.'
      );
    }
    if (comparable.length === 1) {
      await vscode.commands.executeCommand(
        'vscode.diff',
        comparable[0].resource[1],
        comparable[0].resource[2],
        `${comparable[0].relativePath} · Workspai repair`,
        { preview: true, preserveFocus: false }
      );
    } else {
      await vscode.commands.executeCommand(
        'vscode.changes',
        `Workspai repair · ${comparable.length} changed files`,
        comparable.map((entry) => entry.resource)
      );
    }
    if (skipped.length > 0) {
      void vscode.window.showWarningMessage(
        `Review skipped ${skipped.length} file(s) without an exact comparison: ${skipped.join(', ')}`
      );
    }
  }

  private async _undoStudioAgentPatch(data: unknown): Promise<void> {
    const record =
      data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    const transactionId =
      typeof record.transactionId === 'string' ? record.transactionId.trim() : '';
    const sessionId = typeof record.sessionId === 'string' ? record.sessionId.trim() : '';
    const requestedWorkspacePath =
      typeof record.workspacePath === 'string' ? record.workspacePath.trim() : '';
    const preferredWorkspacePath = requestedWorkspacePath
      ? ''
      : ((await resolvePreferredAIModalContext()).workspaceRootPath ?? '');
    // Never let a stale card handoff silently redirect a free-form Undo. The
    // explicit webview scope is authoritative; the current editor/workspace
    // context is the only safe fallback.
    const workspacePath = requestedWorkspacePath || preferredWorkspacePath;
    if (!transactionId || !workspacePath) {
      this._postInlineCreate('sidebarStudioAgentPatchRollback', {
        transactionId,
        ...(sessionId ? { sessionId } : {}),
        ok: false,
        error: 'The durable CLI transaction id and workspace path are required for Undo.',
      });
      return;
    }
    try {
      await this._assertSidebarStudioMutationAllowed({
        workspacePath,
        actionLabel: 'Studio Agent CLI-owned repair rollback',
        governedRepair: { contractAuthorized: true, reversible: true },
      });
      const result = await decideCliOwnedRepair({
        workspacePath,
        transactionId,
        decision: 'rollback',
        approvedBy: 'vscode:explicit-user-undo',
      });
      const ok = result.transaction.state === 'rolled-back';
      this._postInlineCreate('sidebarStudioAgentPatchRollback', {
        transactionId,
        ...(sessionId ? { sessionId } : {}),
        cardId:
          typeof record.cardId === 'string' ? record.cardId : this._activeBlockerHandoff?.cardId,
        ok,
        restoredPaths: result.changedPaths,
        fileChanges: result.fileChanges,
        transaction: projectWorkspaceRepairTransactionForConsumer(result.transaction),
        ...(ok
          ? { summary: `Rolled back ${result.changedPaths.length} CLI-owned repair change(s).` }
          : {
              error:
                deduplicateStudioMessage(result.transaction.decision?.reason) ??
                `CLI rollback ended in ${result.transaction.state}.`,
            }),
      });
    } catch (error) {
      this._postInlineCreate('sidebarStudioAgentPatchRollback', {
        transactionId,
        ...(sessionId ? { sessionId } : {}),
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
    if (!this._view || !this._viewReady) {
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
    const outbound = data ? { ...data } : undefined;
    const transaction =
      outbound?.transaction &&
      typeof outbound.transaction === 'object' &&
      !Array.isArray(outbound.transaction)
        ? (outbound.transaction as Record<string, unknown>)
        : undefined;
    if (outbound && transaction) {
      outbound.transactionId ??= transaction.transactionId;
      outbound.transactionState ??= transaction.state;
      outbound.validationStages ??= transaction.stages;
      const decision =
        transaction.decision &&
        typeof transaction.decision === 'object' &&
        !Array.isArray(transaction.decision)
          ? (transaction.decision as Record<string, unknown>)
          : undefined;
      outbound.decisionOptions ??= decision?.options;
      // A CLI transaction contains checkpoint and adapter filesystem identity.
      // The Webview needs only its presentation projection; the durable source
      // of truth remains in the extension host and CLI-owned artifact.
      delete outbound.transaction;
    }
    void this._view?.webview.postMessage(
      createExtensionWebviewMessage(command, outbound, {
        source: 'workspai-secondary-sidebar',
        version: '1',
      })
    );
  }

  private _studioToolApprovalKey(
    request: Pick<StudioAgentToolApprovalRequest, 'sessionId' | 'toolCallId' | 'fingerprint'>
  ): string {
    return `${request.sessionId}:${request.toolCallId}:${request.fingerprint}`;
  }

  private _cancelPendingStudioToolApprovals(sessionId?: string): void {
    for (const [key, pending] of this._pendingStudioToolApprovals) {
      if (sessionId && pending.request.sessionId !== sessionId) {
        continue;
      }
      this._pendingStudioToolApprovals.delete(key);
      pending.resolve(undefined);
    }
  }

  private async _requestInlineStudioToolApproval(
    request: StudioAgentToolApprovalRequest
  ): Promise<StudioAgentToolApprovalDecision> {
    return requestStudioToolApproval(
      request,
      async (approvalRequest) => {
        if (!this._view) {
          return undefined;
        }
        const key = this._studioToolApprovalKey(approvalRequest);
        const id = Symbol(key);
        return new Promise<StudioAgentApprovalExecution | undefined>((resolve) => {
          const existing = this._pendingStudioToolApprovals.get(key);
          existing?.resolve(undefined);
          this._pendingStudioToolApprovals.set(key, { id, request: approvalRequest, resolve });
        }).finally(() => {
          if (this._pendingStudioToolApprovals.get(key)?.id === id) {
            this._pendingStudioToolApprovals.delete(key);
          }
        });
      },
      this._context?.workspaceState
    );
  }

  private async _resolveStudioToolApproval(data: unknown): Promise<void> {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return;
    }
    const value = data as Record<string, unknown>;
    const sessionId = typeof value.sessionId === 'string' ? value.sessionId.trim() : '';
    const toolCallId = typeof value.toolCallId === 'string' ? value.toolCallId.trim() : '';
    const fingerprint = typeof value.fingerprint === 'string' ? value.fingerprint.trim() : '';
    if (!sessionId || !toolCallId || !fingerprint) {
      return;
    }
    const key = this._studioToolApprovalKey({ sessionId, toolCallId, fingerprint });
    const pending = this._pendingStudioToolApprovals.get(key);
    if (!pending) {
      this._postInlineCreate('sidebarStudioToolApprovalUnavailable', {
        sessionId,
        toolCallId,
        fingerprint,
        summary:
          'This approval request is no longer active. Resume the session to obtain a fresh, exact request.',
      });
      return;
    }
    const requestedExecution =
      value.approved === true && ['once', 'session', 'project'].includes(String(value.execution))
        ? (String(value.execution) as StudioAgentApprovalExecution)
        : undefined;
    const allowed = pending.request.allowedExecutions ?? [pending.request.execution];
    pending.resolve(
      requestedExecution && allowed.includes(requestedExecution) ? requestedExecution : undefined
    );
  }

  private _ensureStudioEvidenceWatcher(
    scope: {
      workspacePath?: string;
      projectPath?: string;
      cardId?: string;
      blockerSignature?: string;
    },
    sessionId?: string
  ): void {
    const workspacePath = scope.workspacePath?.trim();
    if (!workspacePath) {
      return;
    }
    const projectPath = scope.projectPath?.trim();
    const watchRoots = [workspacePath, projectPath]
      .filter((item): item is string => Boolean(item))
      .map((item) => path.resolve(item))
      .filter((item, index, values) => values.indexOf(item) === index)
      .filter((item) => {
        if (item === path.resolve(workspacePath)) {
          return true;
        }
        const relative = path.relative(workspacePath, item);
        return relative.startsWith('..') || path.isAbsolute(relative);
      });
    const watchScope = watchRoots.slice().sort().join('::');
    this._studioEvidenceWatchSessionId = sessionId;
    if (this._studioEvidenceWatcher && this._studioEvidenceWatchScope === watchScope) {
      return;
    }
    this._studioEvidenceWatcher?.dispose();
    this._studioEvidenceWatcher = undefined;
    this._studioEvidenceWatchScope = watchScope;
    this._studioEvidenceGeneration = 0;
    this._studioEvidenceChangedPaths.clear();

    const schedulePulse = (rootPath: string, uri: vscode.Uri) => {
      const scopeToken = rootPath === path.resolve(workspacePath) ? '$WORKSPACE' : '$PROJECT';
      const relativePath = `${scopeToken}/${path.relative(rootPath, uri.fsPath).replace(/\\/g, '/')}`;
      if (
        /(?:^|\/)\.[^/]+\.tmp$/i.test(relativePath) ||
        /\.json\.\d+\.[0-9a-f-]+\.tmp$/i.test(relativePath) ||
        /(?:^|\/)\.workspai\/repair\/inbox(?:\/|$)/i.test(relativePath) ||
        /(?:^|\/)\.workspai\/repair\/engine\.lock$/i.test(relativePath)
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
        // The CLI may update a causal family of reports in one transaction.
        // Refresh the complete dashboard snapshot so every card observes the
        // same post-transaction generation as Studio.
        void WelcomePanel.refreshDashboardEvidenceSnapshotForWorkspacePath(workspacePath);
        this._postInlineCreate('sidebarStudioEvidencePulse', {
          sessionId: this._studioEvidenceWatchSessionId,
          cardId: this._activeBlockerHandoff?.cardId ?? scope.cardId,
          blockerSignature: this._activeBlockerHandoff?.blockerSignature ?? scope.blockerSignature,
          generation: this._studioEvidenceGeneration,
          observedAt: new Date().toISOString(),
          changedPaths,
          summary: `Evidence generation ${this._studioEvidenceGeneration} arrived: ${changedPaths.slice(0, 3).join(', ')}${changedPaths.length > 3 ? ` +${changedPaths.length - 3} more` : ''}`,
        });
      }, 180);
    };
    const watchers = watchRoots.map((rootPath) => {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(
          rootPath,
          '{.workspai/reports/**,.rapidkit/reports/**,.workspai/*.json,.rapidkit/*.json}'
        )
      );
      watcher.onDidCreate((uri) => schedulePulse(rootPath, uri));
      watcher.onDidChange((uri) => schedulePulse(rootPath, uri));
      watcher.onDidDelete((uri) => schedulePulse(rootPath, uri));
      return watcher;
    });
    this._studioEvidenceWatcher = {
      dispose: () => {
        for (const watcher of watchers) {
          watcher.dispose();
        }
      },
    };
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
    const workspace = await this._readSelectedWorkspaceScope();
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

  private async _readSelectedWorkspaceScope(): Promise<{
    name?: string;
    path?: string;
    profile?: string;
    workspace_profile?: string;
    mode?: string;
  } | null> {
    try {
      return (
        ((await vscode.commands.executeCommand('workspai.getSelectedWorkspace')) as
          | {
              name?: string;
              path?: string;
              profile?: string;
              workspace_profile?: string;
              mode?: string;
            }
          | null
          | undefined) ?? null
      );
    } catch {
      return null;
    }
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
    const history = Array.isArray(payloadRecord.history)
      ? payloadRecord.history
          .filter(
            (entry): entry is { role: 'user' | 'assistant'; content: string } =>
              Boolean(entry) &&
              typeof entry === 'object' &&
              !Array.isArray(entry) &&
              ((entry as { role?: unknown }).role === 'user' ||
                (entry as { role?: unknown }).role === 'assistant') &&
              typeof (entry as { content?: unknown }).content === 'string'
          )
          .slice(-8)
      : [];
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

    const planningKey = sessionId || 'create-session';
    this._activeCreatePlanningTokens.get(planningKey)?.cancel();
    this._activeCreatePlanningTokens.get(planningKey)?.dispose();
    const planningTokenSource = new vscode.CancellationTokenSource();
    this._activeCreatePlanningTokens.set(planningKey, planningTokenSource);

    this._postInlineCreate('sidebarAiCreateThinking', {
      label: 'Understanding your request…',
      sessionId,
    });
    try {
      const scope = resolveExplicitWorkspaceScope(payloadRecord.scope);
      let workspacePath = createTarget === 'project' ? scope.workspacePath : undefined;
      let workspaceName = createTarget === 'project' ? scope.workspaceName : undefined;
      if (createTarget === 'project' && !workspacePath) {
        // The webview scope is a display snapshot, not the source of truth. A
        // scope message can be missed while the webview mounts or lag one
        // selection event behind. Resolve the canonical Explorer selection at
        // the mutation boundary before claiming no workspace is selected.
        const selectedWorkspace = await this._readSelectedWorkspaceScope();
        const selectedWorkspacePath = selectedWorkspace?.path?.trim();
        if (selectedWorkspacePath) {
          workspacePath = selectedWorkspacePath;
          workspaceName = selectedWorkspace?.name?.trim() || path.basename(selectedWorkspacePath);
          // Heal the UI snapshot too, so the approved plan and any subsequent
          // Create request display the same destination the host authorized.
          void this._sendInlineScope();
        }
      }
      if (createTarget === 'project' && !workspacePath) {
        this._postInlineCreate('sidebarAiCreateError', {
          error:
            'Select the workspace that should own this project, then draft the project plan again.',
          failureCode: 'workspace-selection-required',
          retryable: false,
          sessionId,
        });
        return;
      }
      const route = await routeCreateIntent({
        request: prompt,
        selectedTarget: createTarget,
        stackFocus,
        workspaceName,
        projectName: undefined,
        history,
        complete: async ({ prompt: routePrompt, toolName, toolSchema }) => {
          const response = await askConfiguredAIProviderForToolAction(
            this._context!,
            [{ role: 'user', content: routePrompt }],
            [
              {
                name: toolName,
                description:
                  'Route a Create-tab message before Workspai drafts a plan or mutates the filesystem.',
                inputSchema: toolSchema as unknown as Record<string, unknown>,
              },
            ],
            planningTokenSource.token,
            requestedModelId,
            [{ path: workspacePath, token: '$WORKSPACE' }]
          );
          return response.type === 'tool'
            ? { type: 'tool', toolName: response.toolName, input: response.input }
            : { type: 'text', text: response.text };
        },
      });
      if (planningTokenSource.token.isCancellationRequested) {
        throw new vscode.CancellationError();
      }
      if (route.intent !== 'create' || route.confidence !== 'high') {
        const fallbackResponse =
          route.userResponse ||
          (route.intent === 'assistant-task'
            ? 'This request changes existing source. Continue in Agent for governed edits and verification.'
            : 'Tell me what workspace or project you want Workspai to create.');
        this._postInlineCreate('sidebarAiCreateGuidance', {
          response: fallbackResponse,
          intent: route.intent,
          confidence: route.confidence,
          action: route.recommendedAction,
          request: route.normalizedRequest,
          sessionId,
        });
        return;
      }
      const creationPrompt =
        stackFocus && stackFocus !== 'Any stack'
          ? `${route.normalizedRequest}\n\nStack focus: ${stackFocus}`
          : route.normalizedRequest;
      const configuredTextProvider = async (
        messages: import('../../core/aiService.js').AIMessage[],
        token?: vscode.CancellationToken
      ) => {
        if (requestedModelId && readWorkspaiSettings().aiProvider === 'vscode-lm') {
          let text = '';
          const response = await streamAIResponse(
            messages,
            (chunk) => {
              text += chunk.text;
            },
            token ?? planningTokenSource.token,
            requestedModelId
          );
          return {
            text,
            modelId: response.modelId,
          };
        }
        const response = await askConfiguredAIProvider(
          this._context!,
          messages,
          token ?? planningTokenSource.token
        );
        return {
          text: response.text,
          modelId: response.provider,
        };
      };
      const capabilityPlanning = await runCreateCapabilityPlanning({
        context: {
          request: creationPrompt,
          selectedTarget: createTarget,
          stackFocus,
          workspaceName,
          projectName: undefined,
          workspaceAvailable: Boolean(workspacePath),
        },
        callModel: async (messages, tools: readonly CreateCapabilityToolDefinition[]) => {
          const response = await askConfiguredAIProviderForToolAction(
            this._context!,
            messages,
            tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
            })),
            planningTokenSource.token,
            requestedModelId,
            [{ path: workspacePath, token: '$WORKSPACE' }]
          );
          return response;
        },
      });
      if (planningTokenSource.token.isCancellationRequested) {
        throw new vscode.CancellationError();
      }
      const normalized =
        capabilityPlanning.status === 'submitted'
          ? await parseCreationIntent(
              creationPrompt,
              createTarget,
              undefined,
              workspacePath,
              undefined,
              async () => ({
                text: JSON.stringify(capabilityPlanning.draft),
                modelId: capabilityPlanning.provider,
              })
            )
          : await parseCreationIntent(
              creationPrompt,
              createTarget,
              undefined,
              workspacePath,
              undefined,
              configuredTextProvider
            );
      if (planningTokenSource.token.isCancellationRequested) {
        throw new vscode.CancellationError();
      }
      const { plan: parsedPlan, modelId, planSource } = normalized;
      const plan = bindCreatePlanDestination(parsedPlan, { workspacePath, workspaceName });
      if (capabilityPlanning.status === 'fallback') {
        Logger.getInstance().warn(
          `[Create] Capability planning used the compatibility fallback: ${capabilityPlanning.reason}`
        );
      }
      const planSessionId = sessionId || 'create-session';
      const authorization = this._createPlanApprovals.issue({
        plan,
        sessionId: planSessionId,
        scopeBinding: createScopeBinding({
          target: plan.type,
          workspacePath: plan.type === 'project' ? workspacePath : undefined,
        }),
      });
      const authorizedPlan = { ...plan, authorization };
      if (capabilityPlanning.status === 'submitted') {
        this._postCreateTimelineStep(
          'Planned with Create capabilities',
          'Workspace context, executable stacks, and the proposed architecture were checked.',
          sessionId
        );
      }
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
      this._postInlineCreate('sidebarAiCreatePlan', {
        plan: authorizedPlan,
        modelId,
        planSource,
        planningMode:
          capabilityPlanning.status === 'submitted' ? 'capability-host' : 'compatibility-fallback',
        sessionId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (planningTokenSource.token.isCancellationRequested) {
        this._postInlineCreate('sidebarAiCreateCancelled', { sessionId });
      } else {
        this._postInlineCreate('sidebarAiCreateError', {
          error: message,
          unsupportedStack:
            error instanceof UnsupportedCreationStackError ? error.stackLabel : undefined,
          createCapability:
            error instanceof UnsupportedCreationStackError ? error.capability : undefined,
          sessionId,
        });
      }
    } finally {
      if (this._activeCreatePlanningTokens.get(planningKey) === planningTokenSource) {
        this._activeCreatePlanningTokens.delete(planningKey);
      }
      planningTokenSource.dispose();
    }
  }

  private async _cancelInlineAICreatePlan(payload: unknown): Promise<void> {
    const record =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const sessionId = typeof record.sessionId === 'string' ? record.sessionId.trim() : '';
    this._activeCreatePlanningTokens.get(sessionId || 'create-session')?.cancel();
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

    const rawPlanRecord = rawPlan as AICreationPlan & { authorization?: unknown };
    const authorization = parseCreatePlanAuthorization(rawPlanRecord.authorization);
    const approvalScope = resolveExplicitWorkspaceScope(payloadRecord.scope);
    const approvalTarget: 'workspace' | 'project' =
      rawPlanRecord.type === 'project' ? 'project' : 'workspace';
    if (approvalTarget === 'project' && !approvalScope.workspacePath) {
      const selectedWorkspace = await this._readSelectedWorkspaceScope();
      const selectedWorkspacePath = selectedWorkspace?.path?.trim();
      if (selectedWorkspacePath) {
        approvalScope.workspacePath = selectedWorkspacePath;
        approvalScope.workspaceName =
          selectedWorkspace?.name?.trim() || path.basename(selectedWorkspacePath);
      }
    }
    if (approvalTarget === 'project' && !approvalScope.workspacePath) {
      this._postInlineCreate('sidebarAiCreateError', {
        error:
          'The destination workspace is no longer selected. Select it and draft the project plan again.',
        failureCode: 'workspace-selection-required',
        retryable: false,
        sessionId,
      });
      return;
    }
    const approval = this._createPlanApprovals.begin({
      authorization,
      sessionId: sessionId || 'create-session',
      target: approvalTarget,
      scopeBinding: createScopeBinding({
        target: approvalTarget,
        workspacePath: approvalTarget === 'project' ? approvalScope.workspacePath : undefined,
      }),
    });
    if (!approval.ok) {
      this._postInlineCreate('sidebarAiCreateError', {
        error: approval.reason,
        failureCode: `plan-${approval.code}`,
        retryable: false,
        sessionId,
      });
      return;
    }

    try {
      const plan = validateCreationPlanForExecution(approval.plan);
      const execution = await executeApprovedCreatePlan({
        plan,
        selectedWorkspacePath: approvalScope.workspacePath,
        host: {
          createWorkspace: createManagedWorkspace,
          createProject: async (project) => {
            await createProjectCommand(
              project.workspacePath,
              project.framework,
              project.projectName,
              project.kit,
              { suppressPostCreatePrompt: true, silent: true }
            );
          },
          projectPath: (workspacePath, projectName) => path.join(workspacePath, projectName),
          syncIntelligence: syncWorkspaceAfterInlineCreate,
          refreshProjects: async () => {
            await vscode.commands.executeCommand('workspai.refreshProjects');
          },
          onProgress: (progress) => {
            this._postInlineCreate('sidebarAiCreateProgress', {
              title: progress.title,
              detail: progress.detail,
              phase: progress.phase,
              sessionId,
            });
          },
          resolveWorkspaceProfile: resolveCreationProfile,
        },
      });
      if (!execution.ok) {
        const workspaceFailure = execution.failure;
        Logger.getInstance().error(
          `AI workspace creation stopped (${workspaceFailure.code})`,
          workspaceFailure.technicalMessage
        );
        if (workspaceFailure.retryable) {
          this._createPlanApprovals.markRetryable(approval.authorization.planId);
        } else {
          this._createPlanApprovals.complete(approval.authorization.planId);
        }
        this._postInlineCreate('sidebarAiCreateError', {
          error: workspaceFailure.message,
          failureCode: workspaceFailure.code,
          setupRequired: workspaceFailure.code === 'runtime-unavailable',
          retryable: workspaceFailure.retryable,
          retryPlan: workspaceFailure.retryable
            ? { ...plan, authorization: approval.authorization }
            : undefined,
          sessionId,
        });
        return;
      }
      this._postInlineCreate('sidebarAiCreateDone', {
        plan,
        workspacePath: execution.workspacePath,
        projects: execution.projects,
        sessionId,
      });
      this._createPlanApprovals.complete(approval.authorization.planId);
    } catch (error) {
      const planName =
        approval.plan.workspaceName || approval.plan.projectName || 'the requested resource';
      const failure = describePortableCreationFailure(error, planName);
      Logger.getInstance().error(`AI creation stopped (${failure.code})`, failure.technicalMessage);
      const retryable =
        error instanceof CreateExecutionCapabilityError ? error.safeToRetry : failure.retryable;
      if (retryable) {
        this._createPlanApprovals.markRetryable(approval.authorization.planId);
      } else {
        this._createPlanApprovals.complete(approval.authorization.planId);
      }
      this._postInlineCreate('sidebarAiCreateError', {
        error:
          error instanceof CreateExecutionCapabilityError
            ? 'Creation stopped after a controlled mutation phase began. Review the partial result, then draft a fresh plan.'
            : failure.message,
        failureCode: failure.code,
        setupRequired: failure.code === 'runtime-unavailable',
        retryable,
        retryPlan: retryable
          ? { ...approval.plan, authorization: approval.authorization }
          : undefined,
        sessionId,
      });
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
      'microsoft-agent-framework': 'microsoft-agent-framework',
      'agent-microsoft-python': 'microsoft-agent-framework',
      'agent-microsoft-dotnet': 'microsoft-agent-framework',
      'openai-agents': 'openai-agents',
      'agent-openai-python': 'openai-agents',
      'agent-openai-typescript': 'openai-agents',
      openrouter: 'openrouter',
      'gateway-openrouter-typescript': 'openrouter',
      'gateway-openrouter-python': 'openrouter',
    };
    // Compatibility aliases are accepted for older webview bundles. Canonical
    // UI payloads send the contract kit id directly.
    const legacyKitMap: Record<string, string> = {
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
      'agent-microsoft-python': 'agent.microsoft.python',
      'agent-microsoft-dotnet': 'agent.microsoft.dotnet',
      'agent-openai-python': 'agent.openai.python',
      'agent-openai-typescript': 'agent.openai.typescript',
      'gateway-openrouter-typescript': 'gateway.openrouter.typescript',
      'gateway-openrouter-python': 'gateway.openrouter.python',
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
    const requestedKit = typeof payloadRecord.kit === 'string' ? payloadRecord.kit.trim() : '';
    const executableKits = new Set(listExecutableScaffoldKits());
    const canonicalRequestedKit = executableKits.has(requestedKit) ? requestedKit : undefined;
    const legacyKit = legacyKitMap[frameworkKey];
    const compatibleKit = canonicalRequestedKit ?? legacyKit;
    const frameworkFromKit = compatibleKit
      ? listExecutableScaffoldFrameworks().find((candidate) =>
          scaffoldKitsForFramework(candidate).includes(compatibleKit)
        )
      : undefined;
    const frameworkCandidate = isScaffoldFramework(frameworkKey)
      ? frameworkKey
      : frameworkMap[frameworkKey];
    const framework: ScaffoldFramework = frameworkFromKit ?? frameworkCandidate ?? 'fastapi';
    const kitName = compatibleKit ?? defaultScaffoldKitForFramework(framework);

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
          isAgentScaffoldKit(kitName) ? 'Creating governed agent' : 'Running Workspai scaffold',
          isAgentScaffoldKit(kitName)
            ? 'Generating runtime files, bounded-context bindings, ownership, and verification evidence…'
            : `Generating project files for ${kitName}…`,
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
          throw new Error(stderr || stdout || 'Workspai project creation failed.');
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

      const workspaceResult = await createManagedWorkspace({
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
      });
      if (!workspaceResult.ok) {
        Logger.getInstance().error(
          `Manual workspace creation stopped (${workspaceResult.code})`,
          workspaceResult.technicalMessage
        );
        this._postInlineCreate('sidebarManualCreateResult', {
          status: 'failed',
          mode,
          name,
          error: workspaceResult.message,
          retryable: workspaceResult.retryable,
          failureCode: workspaceResult.code,
          sessionId,
        });
        return;
      }

      this._postCreateTimelineStep(
        'Finalizing workspace',
        'Workspace shell is ready for projects and evidence.',
        sessionId
      );
      const workspacePath = workspaceResult.workspacePath;
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
      const failure = describePortableCreationFailure(error, name || 'the requested resource');
      Logger.getInstance().error(
        `Manual creation stopped (${failure.code})`,
        failure.technicalMessage
      );
      this._postInlineCreate('sidebarManualCreateResult', {
        status: 'failed',
        mode,
        name,
        error: failure.message,
        retryable: failure.retryable,
        failureCode: failure.code,
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
      : 'ask';
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
        label: handoff
          ? 'Preparing the evidence-backed blocker repair...'
          : 'Understanding your request...',
      });
      const autonomousWorkspacePath = handoff?.workspacePath ?? aiContext.workspaceRootPath;
      if (autonomousWorkspacePath) {
        await this._runUnifiedAssistantSession({
          task,
          sessionId,
          requestedModelId,
          assistantMode,
          history,
          workspacePath: autonomousWorkspacePath,
          projectName: aiContext.type === 'project' ? aiContext.name : undefined,
          projectPath: handoff?.projectPath ?? aiContext.projectRootPath,
          handoff,
        });
        return;
      }
      throw new Error('Select a Workspai workspace before starting an Assistant session.');
    } catch (error) {
      if (isGovernedGoalSetupCancelledError(error)) {
        this._postInlineCreate('sidebarStudioDone', {
          sessionId,
          modelId: requestedModelId ?? 'auto',
          assistantMode,
          answer: 'Goal setup cancelled.',
        });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this._postInlineCreate('sidebarStudioError', { sessionId, error: message });
    }
  }

  private async _replayPersistedStudioAgentEvents(input: {
    workspacePath: string;
    events: Array<{ type: string; data?: unknown }>;
  }): Promise<void> {
    const fileChangeCache = new Map<string, WorkspaceRepairCliFileChange[]>();
    const replay = input.events
      .filter((event) => event.type !== 'session.created' && event.type !== 'session.status')
      .slice(-120);
    for (const event of replay) {
      const hydrated = await hydrateStudioRepairEventFileChanges({
        workspacePath: input.workspacePath,
        event,
        fileChangeCache,
      });
      this._postInlineCreate('sidebarStudioAgentEvent', { event: hydrated, replay: true });
    }
  }

  private async _runUnifiedAssistantSession(input: {
    task: string;
    sessionId?: string;
    requestedModelId?: string;
    assistantMode: WorkspaiAssistantMode;
    workspacePath: string;
    projectName?: string;
    projectPath?: string;
    handoff?: StudioBlockerHandoff;
    history?: AIConversationHistoryEntry[];
  }): Promise<void> {
    if (!this._context) {
      throw new Error('Workspai Assistant requires extension context.');
    }

    const store = new VSCodeStudioAgentSessionStore(this._context);
    const persistedCandidate = input.sessionId ? await store.load(input.sessionId) : undefined;
    const persistedGoalProjectPath =
      input.assistantMode === 'goal' && persistedCandidate?.goal?.scope.kind === 'project'
        ? persistedCandidate.goal.scope.projectPath
        : undefined;
    const persisted =
      persistedCandidate &&
      studioAgentSessionScopeMatches(persistedCandidate, {
        ...input,
        projectPath: input.projectPath ?? persistedGoalProjectPath,
      }) &&
      persistedCandidate.assistantMode === input.assistantMode &&
      persistedCandidate.status !== 'completed' &&
      persistedCandidate.status !== 'cancelled'
        ? persistedCandidate
        : undefined;
    let intentRoute: AssistantIntentRoute | undefined;
    let executionPolicy: AssistantExecutionPolicy | undefined = persisted?.executionPolicy
      ? (parseAssistantExecutionPolicy(persisted.executionPolicy, input.assistantMode) ?? undefined)
      : undefined;
    if (!executionPolicy && persisted) {
      executionPolicy = resolveAssistantExecutionPolicy({
        selectedMode: input.assistantMode,
        requestIntent:
          persisted.cardId === 'assistant:agent:question' ||
          persisted.cardId === 'assistant:agent:evidence-answer'
            ? 'question'
            : input.assistantMode === 'goal'
              ? 'goal'
              : 'engineering-task',
        routeConfidence: 'high',
      });
    }
    if (!input.handoff && !persisted) {
      intentRoute = await routeAssistantIntent({
        task: input.task,
        selectedMode: input.assistantMode,
        hasProjectScope: Boolean(input.projectPath),
        complete: async ({ prompt, toolName, toolSchema }) => {
          const response = await askConfiguredAIProviderForToolAction(
            this._context!,
            [{ role: 'user', content: prompt }],
            [
              {
                name: toolName,
                description:
                  'Classify the request before Workspai chooses conversation, Agent, or Goal orchestration.',
                inputSchema: toolSchema as unknown as Record<string, unknown>,
              },
            ],
            undefined,
            input.requestedModelId,
            [
              { path: input.projectPath, token: '$PROJECT' },
              { path: input.workspacePath, token: '$WORKSPACE' },
            ]
          );
          return response.type === 'tool'
            ? { type: 'tool', toolName: response.toolName, input: response.input }
            : { type: 'text', text: response.text };
        },
      });
      executionPolicy = resolveAssistantExecutionPolicy({
        selectedMode: input.assistantMode,
        requestIntent: intentRoute.intent,
        routeConfidence: intentRoute.confidence,
      });
      if (executionPolicy.suggestion) {
        this._postInlineCreate('sidebarStudioModeSuggestion', {
          sessionId: input.sessionId,
          fromMode: input.assistantMode,
          toMode: executionPolicy.suggestion.mode,
          label: executionPolicy.suggestion.label,
          description: executionPolicy.suggestion.description,
          request: intentRoute.normalizedRequest,
        });
      }
      if (executionPolicy.profile === 'direct-response') {
        const answer =
          executionPolicy.directResponse ||
          intentRoute.userResponse ||
          (input.assistantMode === 'goal'
            ? 'Describe the durable engineering outcome you want this Goal to achieve.'
            : 'What would you like me to change, investigate, or explain?');
        this._postInlineCreate('sidebarStudioDone', {
          sessionId: input.sessionId,
          modelId: input.requestedModelId ?? 'auto',
          assistantMode: input.assistantMode,
          answer,
        });
        return;
      }
      this._postInlineCreate('sidebarStudioThinking', {
        sessionId: input.sessionId,
        label:
          executionPolicy.profile === 'governed-goal'
            ? 'Defining the governed Goal...'
            : executionPolicy.profile === 'evidence-answer'
              ? 'Reading the relevant workspace evidence...'
              : executionPolicy.profile === 'implementation-plan'
                ? 'Preparing an evidence-backed plan...'
                : intentRoute.intent === 'goal'
                  ? 'Continuing as a one-shot Agent task...'
                  : 'Preparing the evidence-backed Agent loop...',
      });
    }

    executionPolicy ??= resolveAssistantExecutionPolicy({
      selectedMode: input.assistantMode,
      requestIntent: input.handoff ? 'engineering-task' : 'clarification',
      routeConfidence: 'high',
    });
    const mode = resolveWorkspaiAssistantModeContract(executionPolicy.toolMode);
    if (mode.canMutateWorkspace) {
      this._ensureStudioEvidenceWatcher(
        {
          workspacePath: input.workspacePath,
          projectPath: input.projectPath,
          cardId: input.handoff?.cardId,
          blockerSignature: input.handoff?.blockerSignature,
        },
        input.sessionId
      );
    }

    let projectBootstrapPrompt = '';
    if (input.projectPath) {
      this._postInlineCreate('sidebarStudioThinking', {
        sessionId: input.sessionId,
        label: 'Resolving the canonical project entry contract...',
      });
      const projectBootstrap = await bootstrapProjectAgent({
        projectPath: input.projectPath,
        workspacePath: input.workspacePath,
        consumer: 'generic',
      });
      requireUsableProjectAgentBootstrap(projectBootstrap);
      if (mode.canMutateWorkspace) {
        requireReadyProjectAgentBootstrap(projectBootstrap);
      }
      projectBootstrapPrompt = buildProjectAgentBootstrapPromptSection(projectBootstrap);
    }
    if (input.assistantMode === 'agent' && input.handoff) {
      await this._runAutonomousStudioAgent({
        task: input.task,
        sessionId: input.sessionId,
        requestedModelId: input.requestedModelId,
        workspacePath: input.workspacePath,
        projectPath: input.projectPath,
        handoff: input.handoff,
        history: input.history,
      });
      return;
    }
    let verifiedGoal: VerifiedGoalContractPayload | undefined = persisted?.goal;
    let governedGoal = persisted?.governedGoal;
    let governedGoalId: string | undefined;
    let goalMaxAttempts: number | undefined;
    let goalAttemptsUsed: number | undefined;
    if (input.assistantMode === 'goal' && (governedGoal || verifiedGoal)) {
      const restored = await restoreOrRenewGovernedGoalSession({
        workspacePath: input.workspacePath,
        ...(governedGoal ? { governedGoal } : {}),
        ...(verifiedGoal ? { verifiedGoal } : {}),
        onPhase: (label) =>
          this._postInlineCreate('sidebarStudioThinking', {
            sessionId: input.sessionId,
            label,
          }),
      });
      governedGoalId = restored.goalPackId;
      governedGoal = restored.governedGoal;
      verifiedGoal = restored.verifiedGoal;
      goalMaxAttempts = restored.maxAttempts;
      goalAttemptsUsed = restored.attemptsUsed;
    }
    if ((input.assistantMode === 'goal' || input.assistantMode === 'agent') && !governedGoal) {
      const projectName = resolveStudioRepairProjectTarget({
        explicitProjectName: input.projectName,
        affectedProjectNames: input.handoff?.affectedProjectNames,
        projectPath: input.projectPath,
      });
      const prepared = await prepareGovernedGoalSession({
        workspacePath: input.workspacePath,
        objective: intentRoute?.normalizedRequest ?? input.task,
        scope: resolveStudioRepairGoalScope({
          handoffScope: input.handoff?.scope ?? (input.projectPath ? 'project' : 'workspace'),
          affectedProjectNames: input.handoff?.affectedProjectNames,
          explicitProjectName: projectName,
          projectPath: input.projectPath,
        }),
        selectScope: selectGovernedGoalScope,
        selectCoverageRuntime: selectGovernedGoalRuntime,
        onPhase: (label) =>
          this._postInlineCreate('sidebarStudioThinking', {
            sessionId: input.sessionId,
            label,
          }),
      });
      governedGoalId = prepared.goalPackId;
      governedGoal = prepared.governedGoal;
      verifiedGoal = prepared.verifiedGoal;
      goalMaxAttempts = prepared.maxAttempts;
      goalAttemptsUsed = prepared.attemptsUsed;
    }
    const verifiedGoalProject =
      verifiedGoal?.scope.kind === 'project'
        ? {
            name: verifiedGoal.scope.projectName,
            path: verifiedGoal.scope.projectPath,
          }
        : undefined;
    const effectiveProjectPath = input.projectPath ?? verifiedGoalProject?.path;
    const effectiveProjectName = input.projectName ?? verifiedGoalProject?.name;
    if (mode.canMutateWorkspace && !governedGoalId) {
      throw new Error(
        'Mutation-capable Studio sessions require an active CLI Goal Pack before tools are exposed.'
      );
    }
    const proofCarryingChange = governedGoalId
      ? new StudioProofCarryingChangeSession({
          workspacePath: input.workspacePath,
          goalId: governedGoalId,
          actorId: `vscode:${input.assistantMode}`,
          requestResume: requestVSCodeProofCarryingChangeResume,
        })
      : undefined;
    if (effectiveProjectPath && !input.projectPath) {
      const projectBootstrap = await bootstrapProjectAgent({
        projectPath: effectiveProjectPath,
        workspacePath: input.workspacePath,
        consumer: 'generic',
      });
      requireUsableProjectAgentBootstrap(projectBootstrap);
      if (mode.canMutateWorkspace) {
        requireReadyProjectAgentBootstrap(projectBootstrap);
      }
      projectBootstrapPrompt = buildProjectAgentBootstrapPromptSection(projectBootstrap);
    }
    const inspectedSource = new Map<string, string | null>();
    const expectedBaseSha256: Record<string, string | null> = {};
    const commandGenerations = new Map<StudioEvidenceRefreshCommandId, string>();
    const commandAttempts = new Map<
      StudioEvidenceRefreshCommandId,
      { blockerSignature?: string; evidenceGeneration: string; count: number }
    >();
    const evidenceUris = await vscode.workspace.findFiles(
      new vscode.RelativePattern(input.workspacePath, '.workspai/**/*'),
      '{**/.workspai/cache/**,**/.workspai/snapshots/**,**/*.tmp}',
      160
    );
    const authorizedEvidencePaths = evidenceUris.map((uri) =>
      path.relative(input.workspacePath, uri.fsPath).replace(/\\/g, '/')
    );
    const [assistantEvidence, evidenceFreshness] = await Promise.all([
      buildEvidenceAgentContextBundle({
        workspacePath: input.workspacePath,
        workspaceName: path.basename(input.workspacePath),
        projectPath: effectiveProjectPath,
        projectName: effectiveProjectName,
        ...(input.handoff
          ? {
              card: {
                id: input.handoff.cardId,
                label: input.handoff.cardLabel ?? input.handoff.cardId,
                status: input.handoff.cardStatus,
                summary: input.handoff.blockers[0] ?? 'Assistant handoff requested.',
                scope: input.handoff.scope,
                artifactPath: input.handoff.artifactPath,
                blockers: input.handoff.blockers,
              },
              blockerHandoff: input.handoff,
            }
          : {}),
      }),
      resolveWorkspaceEvidenceFreshness(input.workspacePath),
    ]);
    for (const attachment of assistantEvidence.attachments) {
      const locator =
        attachment.scope === 'project'
          ? `project:${attachment.relativePath}`
          : attachment.relativePath;
      if (attachment.exists && !authorizedEvidencePaths.includes(locator)) {
        authorizedEvidencePaths.push(locator);
      }
    }
    const baseAssistantObjective = buildAssistantEvidenceObjective({
      task: [input.task, assistantExecutionPolicyInstruction(executionPolicy)]
        .filter((line): line is string => Boolean(line))
        .join('\n\n'),
      assistantMode: input.assistantMode,
      evidence: assistantEvidence,
      freshness: evidenceFreshness,
    });
    const activeEditor = vscode.window.activeTextEditor;
    let activeEditorFocus = '';
    if (activeEditor?.document.uri.scheme === 'file') {
      try {
        const focusRoot = effectiveProjectPath ?? input.workspacePath;
        const [canonicalFocusRoot, canonicalEditorPath] = await Promise.all([
          fs.realpath(focusRoot),
          fs.realpath(activeEditor.document.uri.fsPath),
        ]);
        activeEditorFocus = buildAssistantEditorFocus({
          workspacePath: canonicalFocusRoot,
          filePath: canonicalEditorPath,
          languageId: activeEditor.document.languageId,
          ...(!activeEditor.selection.isEmpty
            ? {
                selection: {
                  text: activeEditor.document.getText(activeEditor.selection),
                  startLine: activeEditor.selection.start.line + 1,
                  endLine: activeEditor.selection.end.line + 1,
                },
              }
            : {}),
          diagnostics: vscode.languages
            .getDiagnostics(activeEditor.document.uri)
            .slice(0, 20)
            .map((diagnostic) => ({
              severity: vscode.DiagnosticSeverity[diagnostic.severity]?.toLowerCase() ?? 'unknown',
              message: diagnostic.message,
              line: diagnostic.range.start.line + 1,
              column: diagnostic.range.start.character + 1,
              ...(diagnostic.source ? { source: diagnostic.source } : {}),
              ...(diagnostic.code !== undefined
                ? {
                    code:
                      typeof diagnostic.code === 'object' ? diagnostic.code.value : diagnostic.code,
                  }
                : {}),
            })),
        });
      } catch {
        // A deleted, virtualized, or out-of-scope editor remains ordinary UI
        // state and must not weaken Assistant scope isolation.
      }
    }
    const activeGoalPrompt =
      input.assistantMode === 'goal'
        ? buildActiveGoalPromptSection(await readActiveGoalHandoff(input.workspacePath))
        : '';
    const assistantObjective = [
      projectBootstrapPrompt,
      baseAssistantObjective,
      activeEditorFocus,
      activeGoalPrompt,
    ]
      .filter(Boolean)
      .join('\n\n');
    const goalRemediationHandoff: StudioBlockerHandoff | undefined = governedGoal
      ? {
          schemaVersion: 'rapidkit-studio-blocker-handoff-v1',
          cardId: 'doctor',
          cardLabel: 'Goal prerequisite',
          cardStatus: 'fail',
          blocking: true,
          blockers: [
            verifiedGoal?.baseline.message ||
              `A runtime prerequisite is preventing Goal verification: ${governedGoal.objective}`,
          ],
          affectedProjectNames:
            verifiedGoal?.scope.kind === 'project'
              ? [verifiedGoal.scope.projectName!]
              : verifiedGoal?.scope.kind === 'project-set'
                ? (verifiedGoal.scope.projects ?? []).map((project) => project.projectName)
                : governedGoal.scope.projects,
          artifactPath:
            verifiedGoal?.artifactPaths.latestReport ??
            '.workspai/reports/verified-goal-last-run.json',
          sourceCommand:
            effectiveProjectPath !== undefined
              ? 'npx workspai doctor project --json'
              : 'npx workspai doctor workspace --json',
          scope: effectiveProjectPath !== undefined ? 'project' : 'workspace',
          blockerSignature: verifiedGoal?.fingerprint ?? governedGoal.fingerprint,
          ...(effectiveProjectPath ? { projectPath: effectiveProjectPath } : {}),
          workspacePath: input.workspacePath,
        }
      : undefined;
    // A real card handoff is always more specific than the synthetic Goal
    // prerequisite scope. Keep one identity for plan selection, execution,
    // evidence refresh, and receipts so an exact action cannot be selected
    // from one blocker and executed against another.
    const activeRemediationHandoff = input.handoff ?? goalRemediationHandoff;
    const presentAssistantCliRepairResult = async (
      result: Awaited<ReturnType<typeof executeCliOwnedCanonicalRepair>>,
      request: { workspacePath: string; projectPath?: string }
    ) => {
      const handoff = activeRemediationHandoff;
      const repairEvidence = handoff
        ? await collectSidebarStudioRepairEvidence({
            workspacePath: request.workspacePath,
            projectPath: request.projectPath,
            handoff,
          })
        : undefined;
      return presentStudioCliOwnedRepairObservation({
        result,
        sourceCandidates: selectStudioPostCliSourceCandidates({
          autonomousTargetPaths: repairEvidence?.autonomousTargetPaths ?? [],
          checkpointFiles: result.transaction.checkpoint.files,
        }),
        authorizedEvidencePaths: repairEvidence?.authorizedEvidencePaths,
        evidenceGeneration: repairEvidence?.evidenceFingerprint,
        proposalRejectedInstruction:
          input.assistantMode === 'goal'
            ? 'Do not retry the rejected content. Re-read the exact Goal prerequisite evidence and choose a materially different causal source target.'
            : 'Do not retry the rejected content. Trace the exact producer finding to a causal source target, inspect it, and submit a materially different bounded proposal.',
      });
    };
    const host: StudioAgentWorkspaiToolHost = {
      ...studioHostLanguageModelToolAdapters(),
      // Only a real card handoff may select a deterministic remediation target.
      // An arbitrary Goal's synthetic Doctor scope is useful for later plan
      // inspection, but it is not exact enough to authorize a first-action
      // shortcut from a workspace-wide queue.
      recoverActiveBlocker: input.handoff
        ? async (request) => {
            const handoff = input.handoff!;
            const [recovery, repairEvidence] = await Promise.all([
              ensureStudioRemediationRecovery({
                workspacePath: request.workspacePath,
                handoff: {
                  ...handoff,
                  ...(request.projectPath ? { projectPath: request.projectPath } : {}),
                },
                projectPath: request.projectPath,
                maxSteps: 64,
                actionId: 'assistant-repair-plan-preflight',
              }),
              collectSidebarStudioRepairEvidence({
                workspacePath: request.workspacePath,
                projectPath: request.projectPath,
                handoff,
              }),
            ]);
            const step = selectStudioRemediationRecoveryStep(recovery.plan, handoff);
            const environmentPrerequisite = selectStudioRemediationEnvironmentPrerequisite(
              recovery.plan
            );
            const producerRoute = resolveStudioCausalProducerRoute(handoff);
            return buildStudioCausalRecoveryBriefing({
              blockers: handoff.blockers,
              sourceCandidates: repairEvidence.autonomousTargetPaths,
              evidenceGeneration: repairEvidence.evidenceFingerprint,
              ...(producerRoute ? { producerRoute } : {}),
              ...(environmentPrerequisite
                ? {
                    environmentPrerequisite: {
                      id: environmentPrerequisite.id,
                      summary:
                        environmentPrerequisite.blockedReason ??
                        environmentPrerequisite.previewSummary ??
                        'A required runtime or executable is unavailable.',
                      requirements: environmentPrerequisite.requirements,
                      retryPolicy: environmentPrerequisite.retryPolicy,
                    },
                  }
                : {}),
              ...(step
                ? {
                    remediationStep: {
                      id: step.id,
                      ...(step.actionId ? { actionId: step.actionId } : {}),
                      ...(step.projectName ? { projectName: step.projectName } : {}),
                      ...(step.projectPath ? { projectPath: step.projectPath } : {}),
                      risk: step.risk,
                      canApply: step.canApply,
                      executable: step.executable,
                      executionKind: step.executionKind,
                      executionReady: step.executionReady,
                      requiresApproval: step.requiresApproval,
                      files: step.files,
                      ...(step.verifyCommand ? { verifyCommand: step.verifyCommand } : {}),
                    },
                  }
                : {}),
              remediationPlanRefreshed: recovery.refreshed,
              ...(recovery.refreshError ? { remediationPlanError: recovery.refreshError } : {}),
            });
          }
        : undefined,
      discover: async (request: { workspacePath: string; glob?: string; limit?: number }) => ({
        ok: true,
        output: {
          files: await discoverStudioWorkspaceFiles(request),
        },
      }),
      inspect: async (request: {
        paths: string[];
        kind: 'source' | 'evidence';
        lineStart?: number;
        lineEnd?: number;
        workspacePath: string;
        projectPath?: string;
      }) => {
        const observations = await inspectStudioAgentFiles({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          paths: request.paths,
          kind: request.kind,
          ...(request.lineStart !== undefined ? { lineStart: request.lineStart } : {}),
          ...(request.lineEnd !== undefined ? { lineEnd: request.lineEnd } : {}),
          authorizedEvidencePaths,
        });
        if (request.kind === 'source') {
          observations.forEach((entry) => {
            inspectedSource.set(entry.path, entry.sha256);
            expectedBaseSha256[entry.path] = entry.sha256;
            if (request.projectPath) {
              const workspaceRelative = path
                .relative(request.workspacePath, path.resolve(request.projectPath, entry.path))
                .replace(/\\/g, '/');
              if (workspaceRelative) {
                inspectedSource.set(workspaceRelative, entry.sha256);
                expectedBaseSha256[workspaceRelative] = entry.sha256;
              }
            }
          });
        }
        return { ok: true, output: observations };
      },
      search: async (request: {
        query: string;
        paths?: string[];
        workspacePath: string;
        projectPath?: string;
      }) => {
        return { ok: true, output: await searchStudioWorkspaceSource(request) };
      },
      graphSearch: async (request: {
        query: string;
        limit?: number;
        workspacePath: string;
        projectPath?: string;
      }) => {
        const limit = Math.min(Math.max(Math.trunc(request.limit ?? 12), 1), 50);
        const execution = await runRapidkitStreaming<unknown>({
          command: buildWorkspaceGraphSearchCommand({
            query: request.query,
            limit,
            ...(request.projectPath
              ? { scope: `project:${path.basename(request.projectPath)}` }
              : {}),
          }),
          cwd: request.workspacePath,
          featureLabel: 'Workspace graph retrieval',
          timeoutMs: 2 * 60_000,
        });
        const ok = execution.failed === false && execution.exitCode === 0;
        return {
          ok,
          output: {
            query: request.query,
            limit,
            result: execution.result,
            exitCode: execution.exitCode,
          },
          ...(ok
            ? {}
            : {
                error:
                  execution.stderr ||
                  execution.stdout ||
                  `Workspace graph search exited with ${execution.exitCode}.`,
              }),
        };
      },
      diagnostics: async (request: {
        paths?: string[];
        severities?: Array<'error' | 'warning' | 'information' | 'hint'>;
        workspacePath: string;
        projectPath?: string;
      }) => ({
        ok: true,
        output: {
          diagnostics: inspectStudioWorkspaceDiagnostics(request),
        },
      }),
      codeIntelligence: runStudioCodeIntelligenceTool,
      inspectChanges: async (request: {
        paths?: string[];
        workspacePath: string;
        projectPath?: string;
      }) => {
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
        reportProgress?: (data: Record<string, unknown>) => Promise<void>;
      }) => {
        if (!proofCarryingChange) {
          return {
            ok: false,
            error: 'No Goal-bound Proof-Carrying Change session is available for mutation.',
          };
        }
        if (input.handoff?.selectedTarget?.sourceMutation === 'forbidden') {
          return {
            ok: false,
            error:
              'The selected causal target is CLI-command-owned and forbids source mutation. Execute its canonical remediation action.',
          };
        }
        const normalized = normalizePatchesForWorkspaceScope({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          patches: request.patches,
        });
        if (verifiedGoal) {
          assertVerifiedGoalSourceMutationSafety({
            goal: verifiedGoal,
            mutations: normalized.map((patch) => ({
              relativePath: patch.relativePath,
              operation: patch.operation,
            })),
          });
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
          projectPath: request.projectPath,
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
        await proofCarryingChange.authorize(['filesystem'], `vscode:${input.assistantMode}`);
        const result = await executeCliOwnedPatchRepair({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath ?? input.handoff?.selectedTarget?.projectPath,
          projectName: resolveStudioRepairProjectTarget({
            explicitProjectName: input.handoff?.selectedTarget?.projectName ?? input.projectName,
            affectedProjectNames: input.handoff?.affectedProjectNames,
            projectPath: request.projectPath ?? input.handoff?.selectedTarget?.projectPath,
          }),
          cardId: input.handoff?.cardId ?? verifiedGoal?.id ?? `assistant:${input.assistantMode}`,
          goalId: governedGoalId,
          blockerSignature: input.handoff?.blockerSignature,
          targetActionIds: input.handoff?.selectedTarget?.actionIds,
          approvedBy: `vscode:${input.assistantMode}`,
          patches: normalized.map((patch) => ({
            relativePath: patch.relativePath,
            operation: patch.operation,
            baseSha256:
              patch.baseSha256 ??
              inspectedSource.get(patch.relativePath) ??
              expectedBaseSha256[patch.relativePath],
            patchedContent: patch.patchedContent,
          })),
          reportProgress: request.reportProgress
            ? (progress: WorkspaceRepairProgress) => request.reportProgress!({ repair: progress })
            : undefined,
        });
        const proof = await proofCarryingChange.recordRepairEffect({
          result,
          projectPath: request.projectPath,
        });
        const observation = await presentAssistantCliRepairResult(result, request);
        return {
          ...observation,
          output: { ...observation.output, proofCarryingChange: proof },
        };
      },
      applyTextEdits: async (request: {
        edits: Array<{ relativePath: string; oldText: string; newText: string }>;
        transactionId: string;
        workspacePath: string;
        projectPath?: string;
        reportProgress?: (data: Record<string, unknown>) => Promise<void>;
      }) => {
        let patches: FilePatch[];
        try {
          patches = await compileInspectedStudioTextEdits({
            workspacePath: request.workspacePath,
            projectPath: request.projectPath,
            edits: request.edits,
            inspectedSource,
          });
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
        return host.applyPatches({
          patches,
          transactionId: request.transactionId,
          workspacePath: request.workspacePath,
          ...(request.projectPath ? { projectPath: request.projectPath } : {}),
          ...(request.reportProgress ? { reportProgress: request.reportProgress } : {}),
        });
      },
      deleteFiles: async (request: {
        paths: string[];
        transactionId: string;
        workspacePath: string;
        projectPath?: string;
        reportProgress?: (data: Record<string, unknown>) => Promise<void>;
      }) => {
        if (input.handoff?.selectedTarget?.sourceMutation === 'forbidden') {
          return {
            ok: false,
            error:
              'The selected causal target is CLI-command-owned and forbids source deletion. Execute its canonical remediation action.',
          };
        }
        if (verifiedGoal) {
          assertVerifiedGoalSourceMutationSafety({
            goal: verifiedGoal,
            mutations: request.paths.map((relativePath) => ({
              relativePath,
              operation: 'delete' as const,
            })),
          });
        }
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
        let normalized: FilePatch[];
        try {
          normalized = await compileInspectedStudioDeletePatches({
            workspacePath: request.workspacePath,
            projectPath: request.projectPath,
            paths: request.paths,
            inspectedSource,
          });
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
        await this._assertSidebarStudioMutationAllowed({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          actionLabel: 'Workspai Assistant inspected file delete',
          governedRepair: { contractAuthorized: true, reversible: true },
        });
        try {
          if (!proofCarryingChange) {
            return {
              ok: false,
              error: 'No Goal-bound Proof-Carrying Change session is available for deletion.',
            };
          }
          await proofCarryingChange.authorize(['filesystem'], `vscode:${input.assistantMode}`);
          const result = await executeCliOwnedPatchRepair({
            workspacePath: request.workspacePath,
            projectPath: request.projectPath ?? input.handoff?.selectedTarget?.projectPath,
            projectName: resolveStudioRepairProjectTarget({
              explicitProjectName: input.handoff?.selectedTarget?.projectName ?? input.projectName,
              affectedProjectNames: input.handoff?.affectedProjectNames,
              projectPath: request.projectPath ?? input.handoff?.selectedTarget?.projectPath,
            }),
            cardId: input.handoff?.cardId ?? verifiedGoal?.id ?? `assistant:${input.assistantMode}`,
            goalId: governedGoalId,
            blockerSignature: input.handoff?.blockerSignature,
            targetActionIds: input.handoff?.selectedTarget?.actionIds,
            approvedBy: `vscode:${input.assistantMode}`,
            patches: normalized.map((patch) => ({
              relativePath: patch.relativePath,
              operation: 'delete',
              baseSha256:
                patch.baseSha256 ??
                inspectedSource.get(patch.relativePath) ??
                expectedBaseSha256[patch.relativePath],
            })),
            reportProgress: request.reportProgress
              ? (progress: WorkspaceRepairProgress) => request.reportProgress!({ repair: progress })
              : undefined,
          });
          const proof = await proofCarryingChange.recordRepairEffect({
            result,
            projectPath: request.projectPath,
          });
          const observation = await presentAssistantCliRepairResult(result, request);
          return {
            ...observation,
            output: { ...observation.output, proofCarryingChange: proof },
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
        const governedHandoff = activeRemediationHandoff;
        const governedEvidence = governedHandoff
          ? await collectSidebarStudioRepairEvidence({
              workspacePath: request.workspacePath,
              projectPath: request.projectPath,
              handoff: governedHandoff,
            })
          : undefined;
        const evidenceGeneration =
          governedEvidence?.evidenceFingerprint ?? evidenceFreshness.verdict ?? 'assistant-session';
        const blockerSignature = governedHandoff?.blockerSignature;
        const reuse = applyStudioGovernedCommandReuse({
          commandId: request.commandId,
          evidenceGeneration,
          ...(blockerSignature ? { blockerSignature } : {}),
          attempts: commandAttempts,
          generations: commandGenerations,
        });
        if (!reuse.allow) {
          return {
            ok: false,
            evidenceGeneration: reuse.evidenceGeneration,
            ...(reuse.blockerSignature ? { blockerSignature: reuse.blockerSignature } : {}),
            error: reuse.error,
          };
        }
        const plan = resolveDashboardCommandExecutionPlan(request.commandId);
        if (request.commandId !== 'workspaceIntelligenceChain' && plan.cliArgs.length === 0) {
          return { ok: false, error: `No governed command exists for ${request.commandId}.` };
        }
        const baseCliArgs =
          request.commandId === 'workspaceAgentSync'
            ? preserveAllAgentConsumersForStudioRefresh(plan.cliArgs)
            : plan.cliArgs;
        const cliArgs = bindStudioGovernedCommandScope({
          commandId: request.commandId,
          cliArgs: baseCliArgs,
          projectName: governedHandoff
            ? resolveStudioRepairProjectTarget({
                explicitProjectName:
                  governedHandoff.selectedTarget?.projectName ?? input.projectName,
                affectedProjectNames: governedHandoff.affectedProjectNames,
                projectPath: request.projectPath ?? governedHandoff.selectedTarget?.projectPath,
              })
            : input.projectName,
          requireProjectScope: Boolean(governedHandoff),
        });
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
        const refreshedEvidence = governedHandoff
          ? await collectSidebarStudioRepairEvidence({
              workspacePath: request.workspacePath,
              projectPath: request.projectPath,
              handoff: governedHandoff,
            })
          : undefined;
        const evidenceRefreshCompleted =
          execution.failed === false && (execution.exitCode === 0 || execution.exitCode === 2);
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
          ok: evidenceRefreshCompleted,
          cardBlocking: execution.exitCode === 2,
          changed: false,
          ...(intelligencePhase ? { intelligencePhase } : {}),
          evidenceGeneration: refreshedEvidence?.evidenceFingerprint ?? evidenceGeneration,
          output: {
            commandId: request.commandId,
            exitCode: execution.exitCode,
            evidenceRefreshCompleted,
            result: execution.result,
            stdout: execution.stdout,
            stderr: execution.stderr,
            ...(intelligencePhase ? { intelligencePhase } : {}),
            ...(intelligencePreflight ? { intelligencePreflight } : {}),
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
        projectPath?: string;
        approval?: StudioAgentToolApprovalGrant;
        signal?: AbortSignal;
        reportProgress?: (data: Record<string, unknown>) => Promise<void>;
      }) => {
        try {
          if (!proofCarryingChange) {
            return {
              ok: false,
              error: 'No Goal-bound Proof-Carrying Change session is available for execution.',
            };
          }
          if (verifiedGoal) {
            assertVerifiedGoalCommandSafety({
              goal: verifiedGoal,
              executable: request.request.executable,
              args: request.request.args,
            });
          }
          const commandPlan = resolveStudioWorkspaceCommandPlan({
            workspacePath: request.workspacePath,
            projectPath: request.projectPath,
            request: request.request,
          });
          const proofEffects = studioProofEffectClassesForCommand(commandPlan);
          if (proofEffects.length > 0) {
            await proofCarryingChange.authorize(
              proofEffects,
              request.approval?.approvedBy ?? `policy:vscode:${input.assistantMode}`
            );
          }
          const execution = await executeStudioWorkspaceCommandTransaction({
            workspacePath: request.workspacePath,
            projectPath: request.projectPath,
            request: request.request,
            approval: request.approval,
            signal: request.signal,
            reportProcessEvent: request.reportProgress
              ? (event) => request.reportProgress!({ process: event })
              : undefined,
            isExpectedDiagnosticFindingExit,
          });
          const commandOutput = execution.output;
          const observedEffect = Boolean(
            commandOutput &&
            !commandOutput.rollback &&
            (commandOutput.effects.source ||
              commandOutput.effects.repositoryMetadata ||
              commandOutput.effects.externalSystem)
          );
          const proof =
            commandOutput && observedEffect
              ? await proofCarryingChange.recordCommandEffect({
                  transactionId: commandOutput.transactionId,
                  projectPath: request.projectPath,
                  command: [request.request.executable, ...request.request.args],
                  changedPaths: commandOutput.changedPaths,
                  succeeded: execution.ok,
                  effectClass: proofEffects[0],
                  summary: execution.ok
                    ? `Studio command completed: ${request.request.executable}.`
                    : `Studio command failed: ${request.request.executable}.`,
                })
              : proofCarryingChange.activeChangeId
                ? await proofCarryingChange.status()
                : undefined;
          return {
            ...execution,
            output: commandOutput
              ? { ...commandOutput, ...(proof ? { proofCarryingChange: proof } : {}) }
              : proof
                ? { proofCarryingChange: proof }
                : undefined,
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
        reportProgress?: (data: Record<string, unknown>) => Promise<void>;
      }) => {
        try {
          if (!proofCarryingChange) {
            return {
              ok: false,
              error:
                'No Goal-bound Proof-Carrying Change session is available for dependency repair.',
            };
          }
          await this._assertSidebarStudioMutationAllowed({
            workspacePath: request.workspacePath,
            projectPath: request.projectPath,
            actionLabel: 'Workspai Assistant CLI-owned dependency repair',
            governedRepair: { contractAuthorized: true, reversible: true },
          });
          await proofCarryingChange.authorize(['dependency'], `vscode:${input.assistantMode}`);
          const result = await executeCliOwnedCanonicalRepair({
            workspacePath: request.workspacePath,
            cardId: input.handoff?.cardId ?? 'doctor',
            projectName: resolveStudioRepairProjectTarget({
              explicitProjectName:
                request.projectNames?.length === 1 ? request.projectNames[0] : undefined,
              affectedProjectNames: input.handoff?.affectedProjectNames,
              projectPath: request.projectPath,
            }),
            approvedBy: `vscode:${input.assistantMode}`,
            reportProgress: request.reportProgress
              ? (progress: WorkspaceRepairProgress) => request.reportProgress!({ repair: progress })
              : undefined,
          });
          const proof = await proofCarryingChange.recordRepairEffect({
            result,
            projectPath: request.projectPath,
            effectClass: 'dependency',
          });
          const observation = await presentAssistantCliRepairResult(result, request);
          return {
            ...observation,
            output: { ...observation.output, proofCarryingChange: proof },
          };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      inspectRemediationPlan: async (request: { workspacePath: string; projectPath?: string }) => {
        if (!activeRemediationHandoff) {
          return {
            ok: false,
            error: 'A blocker card or governed Goal is required to resolve a remediation plan.',
          };
        }
        clearDoctorRemediationPlanCache();
        const plan = await readDoctorRemediationPlanForStudio({
          workspacePath: request.workspacePath,
          handoff: {
            ...activeRemediationHandoff,
            ...(request.projectPath ? { projectPath: request.projectPath, scope: 'project' } : {}),
          },
          maxSteps: 64,
        });
        if (!plan) {
          return {
            ok: false,
            error:
              'No project-scoped CLI remediation action currently matches the active Goal. Refresh the workspace remediation plan, then continue with source diagnosis if it remains empty.',
          };
        }
        return {
          ok: plan.freshness.verdict !== 'stale',
          output: {
            schemaVersion: plan.schemaVersion,
            sourcePath: plan.sourcePath,
            generatedAt: plan.generatedAt,
            scope: plan.scope,
            freshness: plan.freshness,
            execution: plan.execution,
            hiddenStepCount: plan.hiddenStepCount,
            steps: plan.visibleSteps.map((step) => ({
              id: step.id,
              dependsOn: step.dependsOn,
              order: step.order,
              phase: step.phase,
              projectName: step.projectName,
              projectPath: step.projectPath,
              risk: step.risk,
              executable: step.executable,
              studioState: step.studioState,
              canApply: step.canApply,
              executionReady: step.executionReady,
              invocation: step.invocation,
              requirements: step.requirements,
              retryPolicy: step.retryPolicy,
              blockedReason: step.blockedReason,
              requiresApproval: step.requiresApproval,
              title: step.previewTitle,
              summary: step.previewSummary,
            })),
          },
          ...(plan.freshness.verdict === 'stale'
            ? {
                error:
                  plan.freshness.reason ??
                  'The Goal remediation plan is stale and must be refreshed before execution.',
              }
            : {}),
        };
      },
      executeRemediationStep: async (request: {
        stepId: string;
        workspacePath: string;
        projectPath?: string;
        approval?: StudioAgentToolApprovalGrant;
        reportProgress?: (data: Record<string, unknown>) => Promise<void>;
      }) => {
        if (!activeRemediationHandoff) {
          return {
            ok: false,
            error: 'A blocker card or governed Goal is required to execute a remediation step.',
          };
        }
        clearDoctorRemediationPlanCache();
        const plan = await readDoctorRemediationPlanForStudio({
          workspacePath: request.workspacePath,
          handoff: {
            ...activeRemediationHandoff,
            ...(request.projectPath ? { projectPath: request.projectPath, scope: 'project' } : {}),
          },
          maxSteps: 64,
        });
        const step = plan?.visibleSteps.find((candidate) => candidate.id === request.stepId);
        if (
          !step ||
          plan?.freshness.verdict === 'stale' ||
          (plan?.execution.nextActionId !== null &&
            plan?.execution.nextActionId !== request.stepId) ||
          step.risk === 'invasive' ||
          (!step.executable && !step.canApply) ||
          (step.studioState !== 'ready' && step.studioState !== 'review-required')
        ) {
          return {
            ok: false,
            error:
              'The selected Goal remediation action is stale, invasive, outside scope, or no longer executable. Refresh the plan before choosing another action.',
          };
        }
        await this._assertSidebarStudioMutationAllowed({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          actionLabel: `CLI-owned Goal prerequisite ${request.stepId}`,
          governedRepair: { contractAuthorized: true, reversible: true },
        });
        if (!proofCarryingChange) {
          return {
            ok: false,
            error: 'No Goal-bound Proof-Carrying Change session is available for remediation.',
          };
        }
        const approvedBy = request.approval?.approvedBy ?? 'policy:vscode:goal-agent';
        await proofCarryingChange.authorize(['command'], approvedBy);
        const result = await executeCliOwnedCanonicalRepair({
          workspacePath: request.workspacePath,
          cardId: activeRemediationHandoff.cardId,
          projectName: step.projectName || effectiveProjectName,
          actionId: request.stepId,
          approvedBy,
          reportProgress: request.reportProgress
            ? (progress: WorkspaceRepairProgress) => request.reportProgress!({ repair: progress })
            : undefined,
        });
        const proof = await proofCarryingChange.recordRepairEffect({
          result,
          projectPath: request.projectPath,
          effectClass: 'command',
        });
        const observation = await presentAssistantCliRepairResult(result, request);
        return {
          ...observation,
          output: { ...observation.output, proofCarryingChange: proof },
        };
      },
      verify: async (request: { workspacePath: string; projectPath?: string; goalId?: string }) => {
        if (input.assistantMode === 'goal') {
          if (!governedGoalId || !governedGoal) {
            return {
              ok: false,
              cardBlocking: true,
              error: 'The Goal session has no active CLI Goal Pack binding.',
            };
          }
          if (governedGoal.completionMode === 'evidence-review') {
            const command = buildRapidkitCommand(['workspace', 'verify', '--json']);
            const execution = await runIncidentInlineCommand({
              command,
              workspacePath: request.workspacePath,
              projectPath: request.projectPath,
              actionId: 'goal-workspace-verify',
            });
            const canonicalEvidenceProduced = execution.success || execution.exitCode === 2;
            return {
              ok: canonicalEvidenceProduced,
              cardBlocking: !canonicalEvidenceProduced,
              output: {
                goalPack: governedGoal,
                status: {
                  goalId: governedGoal.id,
                  state: canonicalEvidenceProduced ? 'evidence-review-ready' : 'blocked',
                  semanticVerification: 'not-machine-verifiable',
                  workspaceVerification: execution.success ? 'passed' : 'blocked',
                  unrelatedWorkspaceFindingsRemain: canonicalEvidenceProduced && !execution.success,
                },
                verification: execution,
              },
              ...(canonicalEvidenceProduced
                ? {}
                : {
                    error:
                      execution.error ??
                      execution.stderrTail ??
                      'Canonical workspace verification failed for the Goal outcome.',
                  }),
            };
          }
          if (!verifiedGoal) {
            return {
              ok: false,
              cardBlocking: true,
              error: 'The deterministic Goal verification contract is unavailable.',
            };
          }
          const lifecycle = await runGoalCommand({
            workspacePath: request.workspacePath,
            args: ['--verify', governedGoalId],
            label: 'Verify governed Goal',
          });
          if (!lifecycle.ok || !isGoalLifecycleResult(lifecycle.value)) {
            return {
              ok: false,
              cardBlocking: true,
              error: lifecycle.ok
                ? 'Workspai CLI returned an incompatible Goal verification result.'
                : lifecycle.error,
            };
          }
          const verification = lifecycle.value.verification
            ? parseVerifiedGoalVerifyResult(lifecycle.value.verification)
            : undefined;
          const verified =
            lifecycle.value.goal?.id === governedGoalId &&
            lifecycle.value.goal.lifecycle === 'verified' &&
            verification?.status.goalId === verifiedGoal.id &&
            verification.status.state === 'verified';
          return {
            ok: verified,
            cardBlocking: !verified,
            output: {
              goalPack: lifecycle.value.goal,
              goal: verifiedGoal,
              status: verification?.status,
              verification: lifecycle.value.verification,
            },
            ...(verified
              ? {}
              : {
                  error:
                    verification?.status.blockingReasons?.[0] ??
                    'The governed Goal criteria are not yet satisfied.',
                }),
          };
        }
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
    const canonicalVerify = host.verify.bind(host);
    host.verify = async (request) => {
      const verification = await canonicalVerify(request);
      if (!verification.ok || !proofCarryingChange?.activeChangeId) {
        return verification;
      }
      try {
        const proof = await proofCarryingChange.verifyIfStarted(true);
        const sealed = proof?.capsule.status === 'sealed';
        return {
          ...verification,
          ok: verification.ok && sealed,
          cardBlocking: verification.cardBlocking === true || !sealed,
          output: {
            ...(verification.output &&
            typeof verification.output === 'object' &&
            !Array.isArray(verification.output)
              ? (verification.output as Record<string, unknown>)
              : { canonicalVerification: verification.output }),
            proofCarryingChange: proof,
          },
          ...(sealed
            ? {}
            : {
                error:
                  proof?.capsule.remainingUncertainty[0] ??
                  'The change passed its local verifier but its Proof-Carrying Change capsule is not sealed.',
              }),
        };
      } catch (error) {
        return {
          ...verification,
          ok: false,
          cardBlocking: true,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    };
    const scopeId =
      governedGoalId ??
      verifiedGoal?.id ??
      input.handoff?.cardId ??
      `assistant:${input.assistantMode}:${executionPolicy.profile}`;
    const registry = createStudioAgentWorkspaiToolRegistry({
      host,
      cardId: scopeId,
      assistantMode: mode.id,
      ...(governedGoalId || verifiedGoal ? { goalId: governedGoalId ?? verifiedGoal!.id } : {}),
      ...(governedGoal ? { goalCompletionMode: governedGoal.completionMode } : {}),
    });
    const options = {
      id: input.sessionId,
      workspacePath: input.workspacePath,
      ...(effectiveProjectPath ? { projectPath: effectiveProjectPath } : {}),
      cardId: scopeId,
      assistantMode: input.assistantMode,
      executionPolicy,
      ...(input.requestedModelId ? { selectedModelId: input.requestedModelId } : {}),
      permissionLevel: mode.permissionLevel,
      requiresVerifiedCompletion: mode.requiresVerifiedCompletion,
      workspaceTrusted: vscode.workspace.isTrusted,
      requestToolApproval: (request: StudioAgentToolApprovalRequest) =>
        this._requestInlineStudioToolApproval(request),
      ...(governedGoal ? { governedGoal } : {}),
      ...(verifiedGoal ? { goal: verifiedGoal } : {}),
      ...(goalMaxAttempts ? { goalMaxAttempts } : {}),
      ...(goalAttemptsUsed !== undefined ? { goalAttemptsUsed } : {}),
      ...(persisted ? { restoredSession: persisted } : {}),
    };
    const model = new ContractStudioAgentModelAdapter(
      assistantObjective,
      async (_prompt, request) => {
        const response = await askConfiguredAIProviderForToolAction(
          this._context!,
          request.messages,
          request.tools,
          undefined,
          input.requestedModelId,
          [
            { path: effectiveProjectPath, token: '$PROJECT' },
            { path: input.workspacePath, token: '$WORKSPACE' },
          ]
        );
        const resolution = {
          provider: response.provider,
          modelId: response.modelId,
          ...(response.requestedModelId ? { requestedModelId: response.requestedModelId } : {}),
          fallback: response.fallback,
          attempts: response.attempts,
          ...(response.inputTokens !== undefined ? { inputTokens: response.inputTokens } : {}),
          ...(response.outputTokens !== undefined ? { outputTokens: response.outputTokens } : {}),
          ...(response.tokenUsageSource ? { tokenUsageSource: response.tokenUsageSource } : {}),
        };
        return response.type === 'tool'
          ? {
              callId: response.callId,
              toolName: response.toolName,
              input: response.input,
              resolution,
            }
          : { type: 'text' as const, text: response.text, resolution };
      },
      persisted,
      input.history
    );
    const session = new StudioAgentSession(options, model, registry, store);
    if (persisted) {
      await this._replayPersistedStudioAgentEvents({
        workspacePath: input.workspacePath,
        events: persisted.events,
      });
    }
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
      if (executionPolicy.profile === 'implementation-plan') {
        this._postInlineCreate('sidebarStudioModeSuggestion', {
          sessionId: completed.id,
          fromMode: input.assistantMode,
          toMode: 'agent',
          label: 'Run with Agent',
          description:
            'Implement this approved plan with governed mutation, diff review, and verification.',
          request: buildAssistantPlanAgentHandoff({ request: input.task, plan: summary }),
        });
      }
      this._postInlineCreate('sidebarStudioDone', {
        sessionId: completed.id,
        modelId: completed.lastResolvedModel?.modelId ?? completed.selectedModelId ?? 'auto',
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
      ...(typeof failureData?.terminalReason === 'string'
        ? { terminalReason: failureData.terminalReason }
        : {}),
      ...(typeof failureData?.repairTransactionState === 'string'
        ? { repairTransactionState: failureData.repairTransactionState }
        : {}),
      ...(failureData?.requiresUserDecision === true
        ? {
            requiresUserDecision: true,
            ...(typeof failureData.terminalReason !== 'string'
              ? { terminalReason: 'review-required' }
              : {}),
            ...(typeof failureData.transactionId === 'string'
              ? { transactionId: failureData.transactionId }
              : {}),
            ...(Array.isArray(failureData.decisionOptions)
              ? { decisionOptions: failureData.decisionOptions }
              : {}),
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
    history?: AIConversationHistoryEntry[];
  }): Promise<void> {
    // Workspace-level producers can identify one causal project (for example
    // Workspace Run failing only for grpc). Preserve that evidence-derived
    // project boundary instead of silently widening the model loop back to the
    // workspace root.
    const executionInput = {
      ...input,
      projectPath: input.handoff.projectPath ?? input.projectPath,
    };
    const repairScopeKey = [
      path.resolve(executionInput.workspacePath),
      executionInput.handoff.scope,
      executionInput.projectPath
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
          studioAgentSessionScopeMatches(snapshot, executionInput) &&
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
    history?: AIConversationHistoryEntry[];
  }): Promise<void> {
    if (!this._context) {
      throw new Error('Studio Agent requires extension context.');
    }
    let activeHandoff = input.handoff;
    // Session history is not evidence. Rebind the card to the current
    // canonical snapshot before creating a model/tool loop so Resume cannot
    // execute an obsolete blocker or verify command.
    const initialEvidenceBundle = await buildDashboardEvidenceBundle({
      workspacePath: input.workspacePath,
      projectPath: input.projectPath,
    });
    const currentCard = initialEvidenceBundle.cards.find(
      (card) => card.id === input.handoff.cardId
    );
    if (currentCard) {
      activeHandoff = await buildStudioBlockerHandoff({
        card: currentCard,
        workspacePath: input.workspacePath,
        projectPath: input.projectPath,
        handoffSource: 'dashboard',
        extensionContext: this._context,
      });
      this._activeBlockerHandoff = activeHandoff;
      if (activeHandoff.blockerSignature !== input.handoff.blockerSignature) {
        this._postInlineCreate('sidebarStudioCardRefreshed', {
          sessionId: input.sessionId,
          handoff: activeHandoff,
          cardId: activeHandoff.cardId,
          cardStatus: activeHandoff.cardStatus,
          blockers: activeHandoff.blockers,
          refreshedCardIds: [activeHandoff.cardId],
          verifySucceeded: activeHandoff.blocking !== true,
          evidenceOutcome: activeHandoff.blocking === true ? 'blocking' : 'resolved',
          agentOwned: true,
        });
      }
    }
    const cardRepairCapability = requireStudioCardRepairCapability(activeHandoff.cardId);
    let repairEvidence = await collectSidebarStudioRepairEvidence({
      workspacePath: input.workspacePath,
      projectPath: input.projectPath,
      handoff: activeHandoff,
    });
    const governedProjectName = resolveStudioRepairProjectTarget({
      explicitProjectName: activeHandoff.selectedTarget?.projectName,
      affectedProjectNames: activeHandoff.affectedProjectNames,
      projectPath: input.projectPath ?? activeHandoff.selectedTarget?.projectPath,
    });
    const store = new VSCodeStudioAgentSessionStore(this._context);
    const persistedCandidate = input.sessionId ? await store.load(input.sessionId) : undefined;
    const persisted =
      persistedCandidate &&
      studioAgentSessionScopeMatches(persistedCandidate, input) &&
      persistedCandidate.cardId === activeHandoff.cardId &&
      persistedCandidate.blockerSignature === activeHandoff.blockerSignature &&
      persistedCandidate.assistantMode === 'agent' &&
      persistedCandidate.status !== 'completed' &&
      persistedCandidate.status !== 'cancelled'
        ? persistedCandidate
        : undefined;
    const governedChangeGoal =
      persisted?.governedGoal || persisted?.goal
        ? await restoreOrRenewGovernedGoalSession({
            workspacePath: input.workspacePath,
            ...(persisted.governedGoal ? { governedGoal: persisted.governedGoal } : {}),
            ...(persisted.goal ? { verifiedGoal: persisted.goal } : {}),
            onPhase: (label) =>
              this._postInlineCreate('sidebarStudioThinking', {
                sessionId: input.sessionId,
                label,
              }),
          })
        : await prepareGovernedGoalSession({
            workspacePath: input.workspacePath,
            objective: [
              input.task,
              `Resolve ${activeHandoff.cardLabel ?? activeHandoff.cardId}.`,
              ...activeHandoff.blockers.slice(0, 3),
            ].join(' '),
            scope: resolveStudioRepairGoalScope({
              handoffScope: activeHandoff.scope,
              affectedProjectNames: activeHandoff.affectedProjectNames,
              explicitProjectName: governedProjectName,
              projectPath: input.projectPath,
            }),
            selectScope: selectGovernedGoalScope,
            selectCoverageRuntime: selectGovernedGoalRuntime,
            onPhase: (label) =>
              this._postInlineCreate('sidebarStudioThinking', {
                sessionId: input.sessionId,
                label,
              }),
          });
    const proofCarryingChange = new StudioProofCarryingChangeSession({
      workspacePath: input.workspacePath,
      goalId: governedChangeGoal.goalPackId,
      actorId: 'vscode:studio-agent',
      requestResume: requestVSCodeProofCarryingChangeResume,
    });
    const receiptedRepairTransactions = new Set<string>();
    const objective = [
      input.task,
      `Card: ${activeHandoff.cardLabel ?? activeHandoff.cardId}`,
      `Blockers: ${activeHandoff.blockers.join('; ')}`,
      `Selected causal target: ${JSON.stringify(activeHandoff.selectedTarget ?? null)}`,
      `Resolution hints: ${JSON.stringify(activeHandoff.resolutionHints ?? [])}`,
      `Verify command: ${activeHandoff.verifyCommand ?? 'resolve from governed evidence'}`,
      'Use Studio inspect tools to load file bodies only when needed. Generated reports must be refreshed through their governed producers, never patched.',
      'Canonical .workspai/.rapidkit state, repair transactions, goals, registries, and evidence are control-plane inputs, never model-owned source targets.',
      `Evidence generation: ${repairEvidence.evidenceFingerprint}`,
      // The list is contract-bounded by the CLI runtime artifact catalog. Do
      // not truncate it: hidden evidence is effectively unavailable to a
      // tool-calling model because generated reports are excluded from source
      // discovery by design.
      `Authorized evidence paths: ${JSON.stringify(repairEvidence.authorizedEvidencePaths)}`,
      `Initial source candidates (not exclusive; inspect-source dynamically authorizes any workspace source): ${JSON.stringify(repairEvidence.autonomousTargetPaths.slice(0, 20))}`,
      `Missing required evidence: ${JSON.stringify(repairEvidence.missingRequired.slice(0, 20))}`,
      'A missing required evidence path is a fact, not an instruction to retry reading it. Use its governed producer when one exists; otherwise continue from available causal evidence.',
    ].join('\n\n');
    const commandGenerations = new Map<StudioEvidenceRefreshCommandId, string>();
    const commandAttempts = new Map<
      StudioEvidenceRefreshCommandId,
      { blockerSignature?: string; evidenceGeneration: string; count: number }
    >();
    const remediationStepAttempts = new Map<string, { blockerSignature?: string; count: number }>();
    const inspectedSource = new Map<string, string | null>();
    let activeBlockerSignature = activeHandoff.blockerSignature;
    const bindSelectedTarget = (target: StudioCausalRepairTarget): void => {
      activeHandoff = {
        ...activeHandoff,
        selectedTarget: {
          ...target,
          actionIds: [...new Set(target.actionIds)].sort(),
        },
        ...(target.projectPath ? { projectPath: target.projectPath } : {}),
      };
    };
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
      ...studioHostLanguageModelToolAdapters(),
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
        lineStart?: number;
        lineEnd?: number;
        workspacePath: string;
        projectPath?: string;
      }) => {
        const observations = await inspectStudioAgentFiles({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          paths: request.paths,
          kind: request.kind,
          ...(request.lineStart !== undefined ? { lineStart: request.lineStart } : {}),
          ...(request.lineEnd !== undefined ? { lineEnd: request.lineEnd } : {}),
          authorizedEvidencePaths: repairEvidence.authorizedEvidencePaths,
        });
        if (request.kind === 'source') {
          for (const observation of observations) {
            inspectedSource.set(observation.path, observation.sha256);
            repairEvidence.expectedBaseSha256[observation.path] = observation.sha256;
            if (request.projectPath) {
              const workspaceRelative = path
                .relative(
                  request.workspacePath,
                  path.resolve(request.projectPath, observation.path)
                )
                .replace(/\\/g, '/');
              if (workspaceRelative) {
                inspectedSource.set(workspaceRelative, observation.sha256);
                repairEvidence.expectedBaseSha256[workspaceRelative] = observation.sha256;
              }
            }
          }
        }
        return {
          ok: true,
          output: observations,
          evidenceGeneration: repairEvidence.evidenceFingerprint,
        };
      },
      search: async (request: {
        query: string;
        paths?: string[];
        workspacePath: string;
        projectPath?: string;
      }) => {
        return { ok: true, output: await searchStudioWorkspaceSource(request) };
      },
      graphSearch: async (request: {
        query: string;
        limit?: number;
        workspacePath: string;
        projectPath?: string;
      }) => {
        const limit = Math.min(Math.max(Math.trunc(request.limit ?? 12), 1), 50);
        const execution = await runRapidkitStreaming<unknown>({
          command: buildWorkspaceGraphSearchCommand({
            query: request.query,
            limit,
            ...(request.projectPath
              ? { scope: `project:${path.basename(request.projectPath)}` }
              : {}),
          }),
          cwd: request.workspacePath,
          featureLabel: 'Workspace graph retrieval',
          timeoutMs: 2 * 60_000,
        });
        const ok = execution.failed === false && execution.exitCode === 0;
        return {
          ok,
          output: {
            query: request.query,
            limit,
            result: execution.result,
            exitCode: execution.exitCode,
          },
          ...(ok
            ? {}
            : {
                error:
                  execution.stderr ||
                  execution.stdout ||
                  `Workspace graph search exited with ${execution.exitCode}.`,
              }),
        };
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
      codeIntelligence: async (request) => ({
        ...(await runStudioCodeIntelligenceTool(request)),
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
        reportProgress?: (data: Record<string, unknown>) => Promise<void>;
      }) => {
        if (activeHandoff.selectedTarget?.sourceMutation === 'forbidden') {
          return {
            ok: false,
            error:
              'The selected causal target is CLI-command-owned and forbids source mutation. Execute its canonical remediation action.',
          };
        }
        if (!studioCardSupportsGovernedSourceMutation(cardRepairCapability.cardId)) {
          return {
            ok: false,
            error:
              'This card is producer-owned. Refresh its canonical producer; source patches are not authorized.',
          };
        }
        const normalized = normalizePatchesForWorkspaceScope({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          patches: request.patches,
        });
        const unauthorized = await authorizeStudioWorkspacePatchTargets({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          patches: normalized,
          inspectedSource,
        });
        if (unauthorized.length > 0) {
          return {
            ok: false,
            error: `Inspect every target before proposing a repair: ${unauthorized
              .map((entry) => entry.relativePath)
              .join(', ')}`,
          };
        }
        await this._assertSidebarStudioMutationAllowed({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          actionLabel: 'Studio Agent CLI-owned source repair',
          governedRepair: { contractAuthorized: true, reversible: true },
        });
        await proofCarryingChange.authorize(['filesystem'], 'vscode:studio-agent');
        const result = await executeCliOwnedPatchRepair({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath ?? activeHandoff.selectedTarget?.projectPath,
          projectName: resolveStudioRepairProjectTarget({
            explicitProjectName: activeHandoff.selectedTarget?.projectName,
            affectedProjectNames: activeHandoff.affectedProjectNames,
            projectPath: request.projectPath ?? activeHandoff.selectedTarget?.projectPath,
          }),
          cardId: activeHandoff.cardId,
          goalId: governedChangeGoal.goalPackId,
          blockerSignature: activeBlockerSignature,
          targetActionIds: activeHandoff.selectedTarget?.actionIds,
          approvedBy: 'vscode:studio-agent',
          patches: normalized.map((patch) => ({
            relativePath: patch.relativePath,
            operation: patch.operation,
            baseSha256:
              patch.baseSha256 ??
              inspectedSource.get(patch.relativePath) ??
              repairEvidence.expectedBaseSha256[patch.relativePath],
            patchedContent: patch.patchedContent,
          })),
          reportProgress: request.reportProgress
            ? (progress: WorkspaceRepairProgress) => request.reportProgress!({ repair: progress })
            : undefined,
        });
        return presentCliRepairResult(result);
      },
      applyTextEdits: async (request: {
        edits: Array<{ relativePath: string; oldText: string; newText: string }>;
        transactionId: string;
        workspacePath: string;
        projectPath?: string;
        reportProgress?: (data: Record<string, unknown>) => Promise<void>;
      }) => {
        let patches: FilePatch[];
        try {
          patches = await compileInspectedStudioTextEdits({
            workspacePath: request.workspacePath,
            projectPath: request.projectPath,
            edits: request.edits,
            inspectedSource,
          });
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
        return host.applyPatches({
          patches,
          transactionId: request.transactionId,
          workspacePath: request.workspacePath,
          ...(request.projectPath ? { projectPath: request.projectPath } : {}),
          ...(request.reportProgress ? { reportProgress: request.reportProgress } : {}),
        });
      },
      deleteFiles: async (request: {
        paths: string[];
        transactionId: string;
        workspacePath: string;
        projectPath?: string;
        reportProgress?: (data: Record<string, unknown>) => Promise<void>;
      }) => {
        if (activeHandoff.selectedTarget?.sourceMutation === 'forbidden') {
          return {
            ok: false,
            error:
              'The selected causal target is CLI-command-owned and forbids source deletion. Execute its canonical remediation action.',
          };
        }
        if (!studioCardSupportsGovernedSourceMutation(cardRepairCapability.cardId)) {
          return {
            ok: false,
            error:
              'This card is producer-owned. Refresh its canonical producer; source deletion is not authorized.',
          };
        }
        let patches: FilePatch[];
        try {
          patches = await compileInspectedStudioDeletePatches({
            workspacePath: request.workspacePath,
            projectPath: request.projectPath,
            paths: request.paths,
            inspectedSource,
          });
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
        await this._assertSidebarStudioMutationAllowed({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          actionLabel: 'Studio Agent CLI-owned source deletion',
          governedRepair: { contractAuthorized: true, reversible: true },
        });
        await proofCarryingChange.authorize(['filesystem'], 'vscode:studio-agent');
        const result = await executeCliOwnedPatchRepair({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath ?? activeHandoff.selectedTarget?.projectPath,
          projectName: resolveStudioRepairProjectTarget({
            explicitProjectName: activeHandoff.selectedTarget?.projectName,
            affectedProjectNames: activeHandoff.affectedProjectNames,
            projectPath: request.projectPath ?? activeHandoff.selectedTarget?.projectPath,
          }),
          cardId: activeHandoff.cardId,
          goalId: governedChangeGoal.goalPackId,
          blockerSignature: activeBlockerSignature,
          targetActionIds: activeHandoff.selectedTarget?.actionIds,
          approvedBy: 'vscode:studio-agent',
          patches: patches.map((patch) => ({
            relativePath: patch.relativePath,
            operation: 'delete',
            baseSha256: patch.baseSha256,
          })),
          reportProgress: request.reportProgress
            ? (progress: WorkspaceRepairProgress) => request.reportProgress!({ repair: progress })
            : undefined,
        });
        return presentCliRepairResult(result);
      },
      runGovernedCommand: async (request: {
        commandId: StudioEvidenceRefreshCommandId;
        workspacePath: string;
        projectPath?: string;
        reportProgress?: (data: Record<string, unknown>) => Promise<void>;
      }) => {
        const reuse = applyStudioGovernedCommandReuse({
          commandId: request.commandId,
          evidenceGeneration: repairEvidence.evidenceFingerprint,
          blockerSignature: activeBlockerSignature,
          attempts: commandAttempts,
          generations: commandGenerations,
        });
        if (!reuse.allow) {
          return {
            ok: false,
            evidenceGeneration: reuse.evidenceGeneration,
            ...(reuse.blockerSignature ? { blockerSignature: reuse.blockerSignature } : {}),
            error: reuse.error,
          };
        }
        const plan = resolveDashboardCommandExecutionPlan(request.commandId);
        if (request.commandId !== 'workspaceIntelligenceChain' && plan.cliArgs.length === 0) {
          return { ok: false, error: `No governed command exists for ${request.commandId}.` };
        }
        const baseCliArgs =
          request.commandId === 'workspaceAgentSync'
            ? preserveAllAgentConsumersForStudioRefresh(plan.cliArgs)
            : plan.cliArgs;
        const cliArgs = bindStudioGovernedCommandScope({
          commandId: request.commandId,
          cliArgs: baseCliArgs,
          projectName: resolveStudioRepairProjectTarget({
            explicitProjectName: activeHandoff.selectedTarget?.projectName,
            affectedProjectNames: activeHandoff.affectedProjectNames,
            projectPath: request.projectPath ?? activeHandoff.selectedTarget?.projectPath,
          }),
          requireProjectScope: true,
        });
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
        const refreshedBundle = await buildDashboardEvidenceBundle({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
        });
        const refreshedCard = refreshedBundle.cards.find(
          (card) => card.id === activeHandoff.cardId
        );
        if (refreshedCard) {
          const previousSignature = activeBlockerSignature;
          activeHandoff = await buildStudioBlockerHandoff({
            card: refreshedCard,
            workspacePath: request.workspacePath,
            projectPath: request.projectPath,
            handoffSource: 'dashboard',
            extensionContext: this._context,
          });
          activeBlockerSignature = activeHandoff.blockerSignature;
          this._activeBlockerHandoff = activeHandoff;
          if (previousSignature !== activeBlockerSignature) {
            this._postInlineCreate('sidebarStudioCardRefreshed', {
              sessionId: input.sessionId,
              handoff: activeHandoff,
              cardId: activeHandoff.cardId,
              cardStatus: activeHandoff.cardStatus,
              blockers: activeHandoff.blockers,
              refreshedCardIds: [activeHandoff.cardId],
              verifySucceeded: activeHandoff.blocking !== true,
              evidenceOutcome: activeHandoff.blocking === true ? 'blocking' : 'resolved',
              agentOwned: true,
            });
          }
        }
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
        approval?: StudioAgentToolApprovalGrant;
        signal?: AbortSignal;
        reportProgress?: (data: Record<string, unknown>) => Promise<void>;
      }) => {
        try {
          const commandPlan = resolveStudioWorkspaceCommandPlan({
            workspacePath: request.workspacePath,
            projectPath: request.projectPath,
            request: request.request,
          });
          const proofEffects = studioProofEffectClassesForCommand(commandPlan);
          if (proofEffects.length > 0) {
            await proofCarryingChange.authorize(
              proofEffects,
              request.approval?.approvedBy ?? 'policy:vscode:studio-agent'
            );
          }
          const execution = await executeStudioWorkspaceCommandTransaction({
            workspacePath: request.workspacePath,
            projectPath: request.projectPath,
            request: request.request,
            approval: request.approval,
            evidenceGeneration: repairEvidence.evidenceFingerprint,
            signal: request.signal,
            reportProcessEvent: request.reportProgress
              ? (event) => request.reportProgress!({ process: event })
              : undefined,
            isExpectedDiagnosticFindingExit,
          });
          const commandOutput = execution.output;
          const observedEffect = Boolean(
            commandOutput &&
            !commandOutput.rollback &&
            (commandOutput.effects.source ||
              commandOutput.effects.repositoryMetadata ||
              commandOutput.effects.externalSystem)
          );
          const proof =
            commandOutput && observedEffect
              ? await proofCarryingChange.recordCommandEffect({
                  transactionId: commandOutput.transactionId,
                  projectPath: request.projectPath,
                  command: [request.request.executable, ...request.request.args],
                  changedPaths: commandOutput.changedPaths,
                  succeeded: execution.ok,
                  effectClass: proofEffects[0],
                  summary: execution.ok
                    ? `Studio command completed: ${request.request.executable}.`
                    : `Studio command failed: ${request.request.executable}.`,
                })
              : proofCarryingChange.activeChangeId
                ? await proofCarryingChange.status()
                : undefined;
          return {
            ...execution,
            output: commandOutput
              ? { ...commandOutput, ...(proof ? { proofCarryingChange: proof } : {}) }
              : proof
                ? { proofCarryingChange: proof }
                : undefined,
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
        reportProgress?: (data: Record<string, unknown>) => Promise<void>;
      }) => {
        try {
          await proofCarryingChange.authorize(['dependency'], 'vscode:studio-agent');
          await this._assertSidebarStudioMutationAllowed({
            workspacePath: request.workspacePath,
            projectPath: request.projectPath,
            actionLabel: 'Studio Agent dependency repair transaction',
            governedRepair: { contractAuthorized: true, reversible: true },
          });
          const result = await executeCliOwnedCanonicalRepair({
            workspacePath: request.workspacePath,
            cardId: activeHandoff.cardId,
            projectName: resolveStudioRepairProjectTarget({
              explicitProjectName:
                request.projectNames?.length === 1 ? request.projectNames[0] : undefined,
              affectedProjectNames: activeHandoff.affectedProjectNames,
              projectPath: request.projectPath,
            }),
            approvedBy: 'vscode:studio-agent',
            reportProgress: request.reportProgress
              ? (progress: WorkspaceRepairProgress) => request.reportProgress!({ repair: progress })
              : undefined,
          });
          return presentCliRepairResult(result);
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
            execution: plan.execution,
            hiddenStepCount: plan.hiddenStepCount,
            steps: plan.visibleSteps.map((step) => ({
              id: step.id,
              dependsOn: step.dependsOn,
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
              executionReady: step.executionReady,
              invocation: step.invocation,
              requirements: step.requirements,
              retryPolicy: step.retryPolicy,
              blockedReason: step.blockedReason,
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
        approval?: StudioAgentToolApprovalGrant;
        reportProgress?: (data: Record<string, unknown>) => Promise<void>;
      }) => {
        const priorAttempt = remediationStepAttempts.get(request.stepId);
        const attemptsForBlocker =
          priorAttempt?.blockerSignature === activeBlockerSignature ? priorAttempt.count : 0;
        if (attemptsForBlocker >= 2) {
          return {
            ok: false,
            evidenceGeneration: repairEvidence.evidenceFingerprint,
            blockerSignature: activeBlockerSignature,
            error: `${request.stepId} already ran twice for the same semantic blocker. Review the durable CLI transaction instead of starting another attempt.`,
          };
        }
        remediationStepAttempts.set(request.stepId, {
          blockerSignature: activeBlockerSignature,
          count: attemptsForBlocker + 1,
        });
        await this._assertSidebarStudioMutationAllowed({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          actionLabel: `CLI-owned Studio remediation step ${request.stepId}`,
          governedRepair: { contractAuthorized: true, reversible: true },
        });
        const approvedBy = request.approval?.approvedBy ?? 'policy:vscode:studio-agent';
        await proofCarryingChange.authorize(['command'], approvedBy);
        const result = await executeCliOwnedCanonicalRepair({
          workspacePath: request.workspacePath,
          cardId: activeHandoff.cardId,
          projectName: resolveStudioRepairProjectTarget({
            affectedProjectNames: activeHandoff.affectedProjectNames,
            projectPath: request.projectPath,
          }),
          actionId: request.stepId,
          approvedBy,
          reportProgress: request.reportProgress
            ? (progress: WorkspaceRepairProgress) => request.reportProgress!({ repair: progress })
            : undefined,
        });
        return {
          ...(await presentCliRepairResult(result)),
          blockerSignature: activeBlockerSignature,
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
          const parsedResolutionCandidates = execution.capturedStdout
            ? await parseStudioDependencyUpgradeCandidates({
                target,
                auditJson: execution.capturedStdout,
              }).catch(() => [])
            : [];
          const resolutionCandidates =
            parsedResolutionCandidates.length > 0 || target.repairCommand
              ? parsedResolutionCandidates
              : [
                  {
                    packageName: `${target.packageManager}-dependency-graph`,
                    relationship: 'unknown' as const,
                    ownerPackages: [],
                    resolutionStrategies: [
                      'constraint-update' as const,
                      'replacement' as const,
                      'policy-exception' as const,
                      'upstream-wait' as const,
                    ],
                    disposition: 'no-exact-fix' as const,
                    autoExecutable: false,
                  },
                ];
          const upgradeCandidates = resolutionCandidates.filter(
            (candidate) => candidate.autoExecutable
          );
          const blockedCandidates = resolutionCandidates.filter(
            (candidate) => !candidate.autoExecutable
          );
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
      repairDependencySecurity: (request) =>
        executeCanonicalRepair({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          projectName: request.projectName,
          reportProgress: request.reportProgress,
        }),
      upgradeDependencySecurity: (request) =>
        executeCanonicalRepair({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          projectName: request.projectName,
          reportProgress: request.reportProgress,
        }),
      recoverActiveBlocker: async (request: {
        workspacePath: string;
        projectPath?: string;
        reportProgress?: (data: Record<string, unknown>) => Promise<void>;
      }) => {
        const producerRoute = resolveStudioCausalProducerRoute(activeHandoff);
        // The prelude must bind the CLI transaction to one exact causal action.
        // A card id is presentation scope, not a repair target: sending only
        // `doctor` can mix unrelated findings into one all-or-nothing plan.
        const recovery = await ensureStudioRemediationRecovery({
          workspacePath: request.workspacePath,
          handoff: {
            ...activeHandoff,
            ...(request.projectPath ? { projectPath: request.projectPath } : {}),
          },
          projectPath: request.projectPath,
          maxSteps: 64,
          actionId: 'sidebar-repair-plan-preflight',
        });
        const step = selectStudioRemediationRecoveryStep(recovery.plan, activeHandoff);
        const environmentPrerequisite = selectStudioRemediationEnvironmentPrerequisite(
          recovery.plan
        );
        return buildStudioCausalRecoveryBriefing({
          blockers: activeHandoff.blockers,
          sourceCandidates: repairEvidence.autonomousTargetPaths,
          evidenceGeneration: repairEvidence.evidenceFingerprint,
          ...(producerRoute ? { producerRoute } : {}),
          ...(environmentPrerequisite
            ? {
                environmentPrerequisite: {
                  id: environmentPrerequisite.id,
                  summary:
                    environmentPrerequisite.blockedReason ??
                    environmentPrerequisite.previewSummary ??
                    'A required runtime or executable is unavailable.',
                  requirements: environmentPrerequisite.requirements,
                  retryPolicy: environmentPrerequisite.retryPolicy,
                },
              }
            : {}),
          ...(step
            ? {
                remediationStep: {
                  id: step.id,
                  ...(step.actionId ? { actionId: step.actionId } : {}),
                  ...(step.projectName ? { projectName: step.projectName } : {}),
                  ...(step.projectPath ? { projectPath: step.projectPath } : {}),
                  risk: step.risk,
                  canApply: step.canApply,
                  executable: step.executable,
                  executionKind: step.executionKind,
                  executionReady: step.executionReady,
                  requiresApproval: step.requiresApproval,
                  files: step.files,
                  ...(step.verifyCommand ? { verifyCommand: step.verifyCommand } : {}),
                },
              }
            : {}),
          remediationPlanRefreshed: recovery.refreshed,
          ...(recovery.refreshError ? { remediationPlanError: recovery.refreshError } : {}),
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
        if (refresh.primaryCard) {
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
          !cardBlocking;
        return {
          ok: semanticVerifySucceeded,
          cardBlocking,
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
                error: execution.error ?? 'The selected blocker remains active in fresh evidence.',
              }
            : {}),
        };
      },
    };

    const canonicalAutonomousVerify = host.verify.bind(host);
    host.verify = async (request) => {
      const verification = await canonicalAutonomousVerify(request);
      if (!verification.ok || !proofCarryingChange.activeChangeId) {
        return verification;
      }
      try {
        const proof = await proofCarryingChange.verifyIfStarted(true);
        const sealed = proof?.capsule.status === 'sealed';
        return {
          ...verification,
          ok: verification.ok && sealed,
          cardBlocking: verification.cardBlocking === true || !sealed,
          output: {
            ...(verification.output &&
            typeof verification.output === 'object' &&
            !Array.isArray(verification.output)
              ? (verification.output as Record<string, unknown>)
              : { canonicalVerification: verification.output }),
            proofCarryingChange: proof,
          },
          ...(sealed
            ? {}
            : {
                error:
                  proof?.capsule.remainingUncertainty[0] ??
                  'Canonical repair passed, but its Proof-Carrying Change capsule is not sealed.',
              }),
        };
      } catch (error) {
        return {
          ...verification,
          ok: false,
          cardBlocking: true,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    };

    // Studio is a model/UI client of the CLI Repair Engine. Mutation-capable
    // host methods are defined once on the host above and delegate directly to
    // this canonical transaction boundary. The extension may inspect and
    // propose; only the installed CLI can checkpoint, mutate, reconcile,
    // validate, verify, close, or roll back a repair transaction.
    const reportCliRepairProgress = (
      reportProgress: ((data: Record<string, unknown>) => Promise<void>) | undefined
    ) =>
      reportProgress
        ? (progress: WorkspaceRepairProgress) => reportProgress({ repair: progress })
        : undefined;
    const presentCliRepairResult = async (
      result: Awaited<ReturnType<typeof executeCliOwnedCanonicalRepair>>
    ) => {
      repairEvidence = await collectSidebarStudioRepairEvidence({
        workspacePath: input.workspacePath,
        projectPath: input.projectPath,
        handoff: activeHandoff,
      });
      const observation = presentStudioCliOwnedRepairObservation({
        result,
        sourceCandidates: selectStudioPostCliSourceCandidates({
          autonomousTargetPaths: repairEvidence.autonomousTargetPaths,
          checkpointFiles: result.transaction.checkpoint.files,
        }),
        authorizedEvidencePaths: repairEvidence.authorizedEvidencePaths,
        evidenceGeneration: repairEvidence.evidenceFingerprint,
        proposalRejectedInstruction:
          'Do not retry the rejected content. Inspect the exact producer evidence, map its finding to causal source, and submit a materially different bounded proposal.',
        includeFallbackCapability: true,
        exhaustedTools: [
          'recover-active-blocker',
          'execute-remediation-step',
          'repair-dependency-security',
          'upgrade-dependency-security',
          'complete-dependency-transaction',
        ],
      });
      const terminalRepairState = ['closed', 'failed', 'rolled-back', 'cancelled'].includes(
        result.transaction.state
      );
      if (
        terminalRepairState &&
        !receiptedRepairTransactions.has(result.transaction.transactionId)
      ) {
        const proof = await proofCarryingChange.recordRepairEffect({
          result,
          projectPath: input.projectPath ?? activeHandoff.selectedTarget?.projectPath,
        });
        receiptedRepairTransactions.add(result.transaction.transactionId);
        observation.output.proofCarryingChange = proof;
      } else if (proofCarryingChange.activeChangeId) {
        observation.output.proofCarryingChange = await proofCarryingChange.status();
      }
      if (activeHandoff.selectedTarget) {
        observation.output.selectedTarget = activeHandoff.selectedTarget;
      }
      const targetClosed =
        result.transaction.state === 'closed' &&
        result.transaction.verification?.status === 'passed' &&
        result.transaction.verification?.targetStatus === 'passed';
      if (!targetClosed) {
        return observation;
      }
      const evidenceBundle = await buildDashboardEvidenceBundle({
        workspacePath: input.workspacePath,
        projectPath: input.projectPath,
      });
      const refreshedCard = evidenceBundle.cards.find((card) => card.id === activeHandoff.cardId);
      if (!refreshedCard || !dashboardEvidenceCardIsBlocking(refreshedCard)) {
        return { ...observation, cardBlocking: false };
      }
      const previousSignature = activeBlockerSignature;
      activeHandoff = await buildStudioBlockerHandoff({
        card: refreshedCard,
        workspacePath: input.workspacePath,
        projectPath: input.projectPath,
        handoffSource: 'dashboard',
        extensionContext: this._context,
      });
      activeBlockerSignature = activeHandoff.blockerSignature;
      repairEvidence = await collectSidebarStudioRepairEvidence({
        workspacePath: input.workspacePath,
        projectPath: input.projectPath,
        handoff: activeHandoff,
      });
      return {
        ...observation,
        cardBlocking: true,
        blockerSignature: activeBlockerSignature,
        evidenceGeneration: repairEvidence.evidenceFingerprint,
        output: {
          ...observation.output,
          nextAction: 'next-causal-target',
          previousBlockerSignature: previousSignature,
          activeHandoff: {
            cardId: activeHandoff.cardId,
            blockers: activeHandoff.blockers,
            blockerSignature: activeHandoff.blockerSignature,
            sourceCommand: activeHandoff.sourceCommand,
            verifyCommand: activeHandoff.verifyCommand,
          },
        },
      };
    };
    const executeCanonicalRepair = async (request: {
      workspacePath: string;
      projectPath?: string;
      projectName?: string;
      actionId?: string;
      reportProgress?: (data: Record<string, unknown>) => Promise<void>;
    }) => {
      await proofCarryingChange.authorize(['command'], 'vscode:studio-agent');
      await this._assertSidebarStudioMutationAllowed({
        workspacePath: request.workspacePath,
        projectPath: request.projectPath,
        actionLabel: 'Studio Agent CLI-owned repair transaction',
        governedRepair: { contractAuthorized: true, reversible: true },
      });
      const result = await executeCliOwnedCanonicalRepair({
        workspacePath: request.workspacePath,
        cardId: activeHandoff.cardId,
        projectName: resolveStudioRepairProjectTarget({
          explicitProjectName: request.projectName,
          affectedProjectNames: activeHandoff.affectedProjectNames,
          projectPath: request.projectPath,
        }),
        actionId: request.actionId,
        approvedBy: 'vscode:studio-agent',
        reportProgress: reportCliRepairProgress(request.reportProgress),
      });
      const target = result.transaction.target;
      if (target.actionIds.length > 0 && !activeHandoff.selectedTarget) {
        bindSelectedTarget({
          findingId: request.actionId ?? target.actionIds[0],
          actionIds: target.actionIds,
          ...(target.projectName ? { projectName: target.projectName } : {}),
          ...(target.projectPath
            ? { projectPath: path.resolve(request.workspacePath, target.projectPath) }
            : {}),
          repairMode: 'verify-before-fix',
          sourceMutation: 'allowed',
          ...(activeHandoff.verifyCommand ? { verifyCommand: activeHandoff.verifyCommand } : {}),
        });
      }
      return presentCliRepairResult(result);
    };

    const registry = createStudioAgentWorkspaiToolRegistry({
      host,
      cardId: activeHandoff.cardId,
      blockerSignature: activeHandoff.blockerSignature,
      assistantMode: 'agent',
      goalId: governedChangeGoal.goalPackId,
      goalCompletionMode: governedChangeGoal.governedGoal.completionMode,
    });
    const options = {
      id: input.sessionId,
      workspacePath: input.workspacePath,
      ...(input.projectPath ? { projectPath: input.projectPath } : {}),
      cardId: activeHandoff.cardId,
      assistantMode: 'agent' as const,
      ...(input.requestedModelId ? { selectedModelId: input.requestedModelId } : {}),
      blockerSignature: activeHandoff.blockerSignature,
      repairPolicy: cardRepairCapability.repairPolicy,
      permissionLevel: 'autopilot' as const,
      workspaceTrusted: vscode.workspace.isTrusted,
      requestToolApproval: (request: StudioAgentToolApprovalRequest) =>
        this._requestInlineStudioToolApproval(request),
      requiresVerifiedCompletion: true,
      governedGoal: governedChangeGoal.governedGoal,
      ...(governedChangeGoal.verifiedGoal ? { goal: governedChangeGoal.verifiedGoal } : {}),
      goalMaxAttempts: governedChangeGoal.maxAttempts,
      goalAttemptsUsed: governedChangeGoal.attemptsUsed,
      ...(persisted ? { restoredSession: persisted } : {}),
    };
    const model = new ContractStudioAgentModelAdapter(
      objective,
      async (_prompt, request) => {
        const response = await askConfiguredAIProviderForToolAction(
          this._context!,
          request.messages,
          request.tools,
          undefined,
          input.requestedModelId,
          [
            { path: input.projectPath, token: '$PROJECT' },
            { path: input.workspacePath, token: '$WORKSPACE' },
          ]
        );
        const resolution = {
          provider: response.provider,
          modelId: response.modelId,
          ...(response.requestedModelId ? { requestedModelId: response.requestedModelId } : {}),
          fallback: response.fallback,
          attempts: response.attempts,
          ...(response.inputTokens !== undefined ? { inputTokens: response.inputTokens } : {}),
          ...(response.outputTokens !== undefined ? { outputTokens: response.outputTokens } : {}),
          ...(response.tokenUsageSource ? { tokenUsageSource: response.tokenUsageSource } : {}),
        };
        return response.type === 'tool'
          ? {
              callId: response.callId,
              toolName: response.toolName,
              input: response.input,
              resolution,
            }
          : { type: 'text' as const, text: response.text, resolution };
      },
      persisted,
      input.history
    );
    const session = new StudioAgentSession(options, model, registry, store);
    if (persisted) {
      await this._replayPersistedStudioAgentEvents({
        workspacePath: input.workspacePath,
        events: persisted.events,
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
      const receipt = buildStudioVerifiedRepairReceipt(completed);
      this._postInlineCreate('sidebarStudioDone', {
        sessionId: completed.id,
        modelId: completed.lastResolvedModel?.modelId ?? completed.selectedModelId ?? 'auto',
        assistantMode: completed.assistantMode,
        verified: true,
        answer: receipt.answer,
        receipt,
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
      ...(typeof failureData?.terminalReason === 'string'
        ? { terminalReason: failureData.terminalReason }
        : {}),
      ...(failureData?.requiresUserDecision === true
        ? {
            requiresUserDecision: true,
            ...(typeof failureData.terminalReason !== 'string'
              ? { terminalReason: 'review-required' }
              : {}),
            ...(typeof failureData.transactionId === 'string'
              ? { transactionId: failureData.transactionId }
              : {}),
            ...(Array.isArray(failureData.decisionOptions)
              ? { decisionOptions: failureData.decisionOptions }
              : {}),
          }
        : {}),
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
    const publishCliOwnedRepairOutcome = async (input: {
      workspacePath: string;
      projectPath?: string;
      action: string;
      handoff: StudioBlockerHandoff;
      result: Awaited<ReturnType<typeof executeCliOwnedCanonicalRepair>>;
    }): Promise<void> => {
      const { transaction, changedPaths, fileChanges } = input.result;
      const outcome = describeStudioRepairOutcome(transaction);
      await studioHost.refreshSidebarShipLoop({
        workspacePath: input.workspacePath,
        projectPath: input.projectPath,
      });
      await WelcomePanel.refreshDashboardForWorkspacePath(input.workspacePath);
      studioHost.postInlineCreate('sidebarStudioActionResult', {
        sessionId,
        cardId: input.handoff.cardId,
        action: input.action,
        status: outcome.status,
        phase: outcome.phase,
        title: outcome.title,
        summary: outcome.summary,
        changedPaths,
        fileChanges,
        transactionId: transaction.transactionId,
        transaction: projectWorkspaceRepairTransactionForConsumer(transaction),
      });
      studioHost.postInlineCreate('sidebarStudioSessionState', {
        sessionId,
        cardId: input.handoff.cardId,
        active: false,
        status: transaction.state === 'closed' ? 'completed' : transaction.state,
        requiresUserDecision: outcome.requiresUserDecision,
        transactionId: transaction.transactionId,
        decisionOptions: outcome.requiresUserDecision ? (transaction.decision?.options ?? []) : [],
        terminalReason: outcome.terminalReason,
        error: transaction.state === 'closed' ? undefined : outcome.summary,
      });
    };
    try {
      if (action === 'agent-status') {
        const session = sessionId ? this._activeStudioAgentSessions.get(sessionId) : undefined;
        const snapshot = session?.snapshot();
        const persistedSession =
          !snapshot && sessionId && this._context
            ? await new VSCodeStudioAgentSessionStore(this._context).load(sessionId)
            : undefined;
        const durableSession = snapshot ?? persistedSession;
        const terminalFailure = [...(durableSession?.events ?? [])]
          .reverse()
          .find((event) => event.type === 'session.failed');
        const terminalFailureData =
          terminalFailure?.data &&
          typeof terminalFailure.data === 'object' &&
          !Array.isArray(terminalFailure.data)
            ? (terminalFailure.data as Record<string, unknown>)
            : undefined;
        const persistedTransactionId =
          typeof terminalFailureData?.transactionId === 'string'
            ? terminalFailureData.transactionId.trim()
            : '';
        const persistedWorkspacePath =
          handoff?.workspacePath ?? durableSession?.workspacePath ?? undefined;
        const persistedTransaction =
          terminalFailureData?.requiresUserDecision === true &&
          persistedTransactionId &&
          persistedWorkspacePath
            ? await readCliOwnedRepairById({
                workspacePath: persistedWorkspacePath,
                transactionId: persistedTransactionId,
              }).catch(() => undefined)
            : undefined;
        const persistedDecisionStillRequired =
          terminalFailureData?.requiresUserDecision === true &&
          (!persistedTransaction ||
            (persistedTransaction.state === 'decision-required' &&
              Boolean(persistedTransaction.decision)));
        studioHost.postInlineCreate('sidebarStudioSessionState', {
          sessionId,
          cardId: handoff?.cardId,
          active: snapshot?.status === 'running',
          status: durableSession?.status ?? 'paused',
          ...(typeof terminalFailureData?.terminalReason === 'string'
            ? { terminalReason: terminalFailureData.terminalReason }
            : {}),
          ...(typeof terminalFailureData?.repairTransactionState === 'string'
            ? { repairTransactionState: terminalFailureData.repairTransactionState }
            : {}),
          ...(typeof terminalFailureData?.error === 'string'
            ? { error: terminalFailureData.error }
            : {}),
          ...(typeof terminalFailureData?.missingExecutable === 'string'
            ? { missingExecutable: terminalFailureData.missingExecutable }
            : {}),
          ...(persistedDecisionStillRequired
            ? {
                requiresUserDecision: true,
                ...(typeof terminalFailureData.terminalReason !== 'string'
                  ? { terminalReason: 'review-required' }
                  : {}),
                ...(typeof terminalFailureData.transactionId === 'string'
                  ? { transactionId: terminalFailureData.transactionId }
                  : {}),
                ...(Array.isArray(terminalFailureData.decisionOptions)
                  ? { decisionOptions: terminalFailureData.decisionOptions }
                  : {}),
                ...(typeof terminalFailureData.error !== 'string'
                  ? { error: 'Studio requires an engineering decision to continue.' }
                  : {}),
              }
            : persistedTransaction
              ? {
                  requiresUserDecision: false,
                  transactionId: persistedTransaction.transactionId,
                  terminalReason: `repair-${persistedTransaction.state}`,
                  error: `The persisted CLI repair transaction is ${persistedTransaction.state}; no user decision is pending. Studio can continue from fresh evidence.`,
                }
              : {}),
        });
        return;
      }
      if (action === 'open-setup') {
        const executable =
          typeof payloadRecord.executable === 'string' ? payloadRecord.executable.trim() : '';
        const guidance = resolveRuntimeSetupGuidance(executable);
        if (guidance) {
          await vscode.env.openExternal(vscode.Uri.parse(guidance.officialUrl));
        } else {
          await vscode.commands.executeCommand('workspai.openSetup');
        }
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
        this._cancelPendingStudioToolApprovals(sessionId);
        session.cancel();
        return;
      }
      if (action === 'retry-audit') {
        await studioHost.retryLastSidebarStudioAudit(sessionId);
        return;
      }
      if (action === 'repair-decision') {
        if (!handoff) {
          throw new Error('No blocker handoff is active for this repair decision.');
        }
        const scope = resolveStudioActionScope(payloadRecord.scope);
        const workspacePath =
          handoff.workspacePath ??
          scope.workspacePath ??
          (await resolvePreferredAIModalContext()).workspaceRootPath;
        if (!workspacePath) {
          throw new Error('No workspace is active for this repair decision.');
        }
        const requestedTransactionId =
          typeof payloadRecord.transactionId === 'string' ? payloadRecord.transactionId.trim() : '';
        const transaction = requestedTransactionId
          ? await readCliOwnedRepairById({
              workspacePath,
              transactionId: requestedTransactionId,
            })
          : await readLatestCliOwnedRepair({ workspacePath });
        if (transaction?.state !== 'decision-required' || !transaction.decision) {
          throw new Error(
            requestedTransactionId
              ? `Repair transaction ${requestedTransactionId} is no longer waiting for a user decision.`
              : 'The CLI Repair Engine is not waiting for a user decision.'
          );
        }
        const labels: Record<WorkspaceRepairDecision, { label: string; detail: string }> = {
          'approve-guarded': {
            label: 'Approve guarded repair',
            detail: 'Create a fresh plan that permits guarded, reversible changes.',
          },
          'approve-invasive': {
            label: 'Approve invasive repair',
            detail: 'Create a fresh plan with the broader invasive risk boundary.',
          },
          'allow-breaking': {
            label: 'Allow breaking change',
            detail: 'Create a fresh plan that may include a verified breaking dependency change.',
          },
          'allow-force': {
            label: 'Allow force-based repair',
            detail: 'Create a fresh plan that may use the package manager force path.',
          },
          replan: {
            label: 'Let the model retry',
            detail:
              'Cancel this plan and let the model generate a fresh proposal for the same target.',
          },
          'manual-repair': {
            label: 'Take over manually',
            detail: 'Cancel this transaction without mutation and release source ownership.',
          },
          rollback: {
            label: 'Roll back checkpoint',
            detail: 'Restore the bounded checkpoint captured by the CLI.',
          },
          cancel: {
            label: 'Cancel repair',
            detail: 'Cancel the transaction before any further mutation.',
          },
        };
        const requestedDecision =
          typeof payloadRecord.decision === 'string'
            ? (payloadRecord.decision.trim() as WorkspaceRepairDecision)
            : undefined;
        const selection = requestedDecision
          ? transaction.decision.options.includes(requestedDecision)
            ? {
                decision: requestedDecision,
                label: labels[requestedDecision].label,
                description: requestedDecision,
                detail: labels[requestedDecision].detail,
              }
            : undefined
          : await vscode.window.showQuickPick(
              transaction.decision.options.map((decision) => ({
                decision,
                label: labels[decision].label,
                description: decision,
                detail: labels[decision].detail,
              })),
              {
                title: 'Workspai Repair Engine decision',
                placeHolder:
                  deduplicateStudioMessage(transaction.decision.reason) ??
                  'Review the bounded CLI repair decision.',
                ignoreFocusOut: true,
              }
            );
        if (requestedDecision && !selection) {
          throw new Error(
            `Decision ${requestedDecision} is not valid for repair transaction ${transaction.transactionId}.`
          );
        }
        if (!selection) {
          return;
        }
        studioHost.postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          cardId: handoff.cardId,
          action,
          status: 'running',
          phase: 'submitting-repair-decision',
          title: 'Applying your decision',
          summary: selection.detail,
        });
        const result = await decideCliOwnedRepair({
          workspacePath,
          transactionId: transaction.transactionId,
          decision: selection.decision,
          approvedBy: 'vscode:explicit-user-decision',
        });
        await studioHost.refreshSidebarShipLoop({
          workspacePath,
          projectPath: handoff.projectPath ?? scope.projectPath,
        });
        await WelcomePanel.refreshDashboardForWorkspacePath(workspacePath);
        const outcome = describeStudioRepairOutcome(result.transaction);
        studioHost.postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          cardId: handoff.cardId,
          action,
          status: outcome.status,
          phase: outcome.phase,
          title: outcome.title,
          summary: outcome.summary,
          changedPaths: result.changedPaths,
          fileChanges: result.fileChanges,
          transactionId: result.transaction.transactionId,
          transaction: projectWorkspaceRepairTransactionForConsumer(result.transaction),
        });
        studioHost.postInlineCreate('sidebarStudioSessionState', {
          sessionId,
          cardId: handoff.cardId,
          active: false,
          status: result.transaction.state === 'closed' ? 'completed' : result.transaction.state,
          requiresUserDecision: outcome.requiresUserDecision,
          transactionId: result.transaction.transactionId,
          decisionOptions: outcome.requiresUserDecision
            ? (result.transaction.decision?.options ?? [])
            : [],
          terminalReason: outcome.terminalReason,
          error: result.transaction.state === 'closed' ? undefined : outcome.summary,
        });
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
        if (plan?.execution.nextActionId && plan.execution.nextActionId !== step.id) {
          throw new Error(
            `The CLI remediation contract requires ${plan.execution.nextActionId} first. Refresh after that causal prerequisite is complete.`
          );
        }
        if (
          step.retryPolicy?.sameGeneration === 'forbidden' ||
          step.requirements.some((requirement) => requirement.status !== 'satisfied')
        ) {
          throw new Error(
            step.blockedReason ||
              'This remediation action cannot run in the current evidence generation. Change the required environment, then refresh the plan.'
          );
        }
        const autonomous = payloadRecord.autonomous === true;
        if (!autonomous && (step.requiresApproval || step.studioState === 'review-required')) {
          const approvalLabel = 'Apply through CLI Repair Engine';
          const approval = await vscode.window.showWarningMessage(
            `Workspai Studio wants to apply: ${step.previewTitle || step.primaryAction}`,
            {
              modal: true,
              detail:
                step.diffSummary ||
                step.previewSummary ||
                'Approval will be bound to the immutable CLI plan before any source mutation.',
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
              summary: 'The remediation transaction was not started.',
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
          actionLabel: 'CLI-owned Studio remediation step',
          governedRepair: { contractAuthorized: true, reversible: true },
        });
        studioHost.postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          cardId: handoff.cardId,
          action,
          status: 'running',
          phase: 'planning-cli-repair',
          summary: 'The CLI is compiling the selected remediation step into one transaction.',
        });
        const result = await executeCliOwnedCanonicalRepair({
          workspacePath,
          cardId: handoff.cardId,
          projectName: resolveStudioRepairProjectTarget({
            explicitProjectName: step.projectName,
            affectedProjectNames: handoff.affectedProjectNames,
            projectPath: stepProjectPath,
          }),
          actionId: step.actionId ?? step.id,
          approvedBy: autonomous ? 'vscode:studio-agent' : 'vscode:explicit-remediation-review',
        });
        await publishCliOwnedRepairOutcome({
          workspacePath,
          projectPath: stepProjectPath,
          action,
          handoff,
          result,
        });
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
        if (plan?.execution.nextActionId && plan.execution.nextActionId !== step.id) {
          throw new Error(
            `The CLI remediation contract requires ${plan.execution.nextActionId} first. Refresh after that causal prerequisite is complete.`
          );
        }
        if (
          step.retryPolicy?.sameGeneration === 'forbidden' ||
          step.requirements.some((requirement) => requirement.status !== 'satisfied')
        ) {
          throw new Error(
            step.blockedReason ||
              'This remediation command cannot run in the current evidence generation. Change the required environment, then refresh the plan.'
          );
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
          actionLabel: 'CLI-owned Studio remediation command',
          governedRepair: { contractAuthorized: true, reversible: true },
        });
        studioHost.postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          cardId: handoff.cardId,
          action,
          status: 'running',
          phase: 'planning-cli-repair',
          summary:
            'The CLI is compiling the selected contract action; the extension will not execute its command text directly.',
          commandText,
        });
        const result = await executeCliOwnedCanonicalRepair({
          workspacePath,
          cardId: handoff.cardId,
          projectName: resolveStudioRepairProjectTarget({
            explicitProjectName: step.projectName,
            affectedProjectNames: handoff.affectedProjectNames,
            projectPath: stepProjectPath,
          }),
          actionId: step.actionId ?? step.id,
          approvedBy: 'vscode:explicit-remediation-command-review',
        });
        await publishCliOwnedRepairOutcome({
          workspacePath,
          projectPath: stepProjectPath,
          action,
          handoff,
          result,
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
        const selectedPatches = acceptedPaths?.length
          ? pendingPatches.filter((patch) => acceptedPaths.includes(patch.relativePath))
          : pendingPatches;
        if (selectedPatches.length === 0) {
          throw new Error('No reviewed patch targets were selected.');
        }
        const result = await executeCliOwnedPatchRepair({
          workspacePath,
          projectPath:
            handoff.selectedTarget?.projectPath ?? handoff.projectPath ?? scope.projectPath,
          projectName: resolveStudioRepairProjectTarget({
            explicitProjectName: handoff.selectedTarget?.projectName,
            affectedProjectNames: handoff.affectedProjectNames,
            projectPath:
              handoff.selectedTarget?.projectPath ?? handoff.projectPath ?? scope.projectPath,
          }),
          cardId: handoff.cardId,
          blockerSignature: handoff.blockerSignature,
          targetActionIds: handoff.selectedTarget?.actionIds,
          approvedBy: 'vscode:explicit-patch-review',
          patches: selectedPatches.map((patch) => ({
            relativePath: patch.relativePath,
            operation: patch.operation,
            baseSha256: patch.baseSha256,
            patchedContent: patch.patchedContent,
          })),
        });
        await publishCliOwnedRepairOutcome({
          workspacePath,
          projectPath: handoff.projectPath ?? scope.projectPath,
          action,
          handoff,
          result,
        });
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
          projectBelongsToWorkspace: await isRegisteredWorkspaceProjectPath(
            scope.workspacePath,
            scope.projectPath
          ),
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
      refreshDashboardCards: () =>
        WelcomePanel.refreshDashboardEvidenceSnapshotForWorkspacePath(input.workspacePath),
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
      sessionId: input.sessionId,
      handoff: nextHandoff,
      cardId: input.handoff.cardId,
      cardStatus: refresh.primaryCard?.status,
      blockers: refresh.primaryCard?.blockers ?? [],
      refreshedCardIds: refresh.cardIds,
      verifySucceeded: verifyResolved,
      evidenceOutcome: refresh.evidenceOutcome,
      agentOwned: input.agentOwned === true,
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
    const scope = resolveStudioActionScope(payloadScope);
    const projectPath = handoff.projectPath ?? scope.projectPath;
    const mode = handoff.studioMode ?? 'FIX';
    this._ensureStudioEvidenceWatcher(handoff, sessionId);
    await this._assertSidebarStudioMutationAllowed({
      workspacePath,
      projectPath,
      actionLabel: 'Studio CLI-owned repair session',
      governedRepair: { contractAuthorized: true, reversible: true },
    });
    this._postInlineCreate('sidebarStudioActionResult', {
      sessionId,
      cardId: handoff.cardId,
      action: 'auto-fix',
      status: 'running',
      phase: 'starting-cli-owned-repair',
      title: 'Starting governed repair',
      summary:
        'Studio is starting the model loop. Every source change will be planned, checkpointed, executed, verified, and rolled back by the Workspai CLI.',
    });
    await this._runAutonomousStudioAgent({
      task:
        mode === 'RUN_ONCE'
          ? `Run the requested card action for ${handoff.cardLabel ?? handoff.cardId}, then close it only through canonical verification.`
          : `Resolve the active ${handoff.cardLabel ?? handoff.cardId} blocker completely through the CLI Repair Engine.`,
      sessionId,
      requestedModelId,
      workspacePath,
      projectPath,
      handoff,
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
    this._studioEvidenceWatchScope = undefined;
    this._studioEvidenceChangedPaths.clear();
  }
}

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
import { askConfiguredAIProvider } from '../../core/aiProviderService';
import {
  listAvailableModels,
  parseCreationIntent,
  prepareAIConversation,
  resolveCreationProfile,
  streamAIResponse,
  type AIConversationHistoryEntry,
  type AIModalContext,
  type AICreationPlan,
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
import { buildCoreRapidkitShellCommand, runCommandsInTerminal } from '../../utils/terminalExecutor';
import { createWorkspaceCommand } from '../../commands/createWorkspace';
import type { ScaffoldFramework } from '../../core/scaffoldKits';
import {
  isStudioBlockerHandoff,
  type StudioBlockerHandoff,
} from '../../contracts/studio-blocker-handoff-contract.js';
import { buildSidebarStudioPrompt } from '../../core/sidebarStudioFixPrompt.js';
import { executeStudioActionById } from '../panels/incidentStudioActionBridge.js';
import { pickStudioFixActionId } from '../../core/studioBlockerHandoffBuilder.js';
import { recordStudioBlockerCommandRun } from '../../core/studioBlockerCommandLedger.js';
import { runRapidkitStreaming } from '../../core/streamingRapidkitRunner.js';
import { extractDoctorFixResult } from '../../core/doctorFixResultReader.js';
import { resolveStudioDoctorFixInvocation } from '../../core/studioDoctorFixCommand.js';
import {
  applyBootstrapComplianceRemediation,
  normalizeBootstrapComplianceCommand,
} from '../../core/bootstrapComplianceRemediation.js';
import { runIncidentInlineCommand } from '../panels/incidentStudioInlineCommandBridge.js';
import type { StudioActionId } from '../../core/studioActionCommands.js';
import {
  formatStudioCardRefreshToast,
  refreshDashboardAfterStudioVerify,
  type StudioSidebarDashboardRefreshResult,
} from '../../core/studioSidebarDashboardRefresh.js';
import {
  readDoctorRemediationPlanForStudio,
  type DoctorRemediationPlanStepView,
} from '../../core/doctorRemediationPlanReader.js';
import { applyDoctorRemediationStep } from '../../core/doctorRemediationApply.js';
import {
  applySidebarPendingPatches,
  executeSidebarApplyDebugPatch,
  type SidebarPatchBridgeResult,
} from '../../core/sidebarStudioPatchBridge.js';
import {
  extractPatchesFromAiResponse,
  normalizePatchesForWorkspaceScope,
  type FilePatch,
} from '../../core/patchApplyEngine.js';
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

type SidebarStudioActionFailurePayload = {
  sessionId?: string;
  cardId?: string;
  action: string;
  status: 'failed';
  title: string;
  summary: string;
  commandText?: string;
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

function buildArtifactRemediationPlanCommand(): string {
  return 'npx rapidkit workspace remediation-plan --ci --json --write --include-paths';
}

function remediationLoopProgressForApply(input: {
  verifySucceeded: boolean;
  cardStatus?: string;
  refreshedPlanSteps: number;
  failureSummary?: string;
}): {
  status: 'done' | 'review' | 'failed';
  title?: string;
  summary: string;
  nextAction?: 'continue-remediation' | 'auto-fix';
  nextActionLabel?: string;
} {
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
  return command.trim().startsWith('rapidkit:doctor:repair ');
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
      if (await fs.pathExists(path.join(cursor, '.rapidkit', 'project.json'))) {
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
      ((await fs.pathExists(path.join(projectCandidate, '.rapidkit', 'project.json'))) ||
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
}> {
  return patches.map((patch) => ({
    relativePath: patch.relativePath,
    status: patch.status,
    isNewFile: patch.isNewFile,
    failReason: patch.failReason,
  }));
}

function sidebarPatchReviewKey(cardId: string, sessionId?: string): string {
  return sessionId?.trim() ? `${sessionId.trim()}::${cardId}` : cardId;
}

function buildSidebarPatchAuditMetadata(input: {
  sourceAction: 'auto-fix' | 'apply-patch';
  reviewRequired: boolean;
  patchResult?: SidebarPatchBridgeResult['patchResult'];
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
  const manifestPath = path.join(workspacePath, '.rapidkit', 'workspace.json');
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
    const markerPath = path.join(projectPath, '.rapidkit', 'project.json');
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
        this._pendingSidebarPatches.get(cardId),
      deletePendingPatches: (cardId, sessionId) => {
        this._pendingSidebarPatches.delete(sidebarPatchReviewKey(cardId, sessionId));
        this._pendingSidebarPatches.delete(cardId);
      },
      postInlineCreate: (command, data) => this._postInlineCreate(command, data),
      retryLastSidebarStudioAudit: (sessionId) => this._retryLastSidebarStudioAudit(sessionId),
      runSidebarAutoFix: (handoff, sessionId, payloadScope) =>
        this._runSidebarAutoFix(handoff, sessionId, payloadScope),
      finalizeSidebarPatchBridgeResult: (handoff, sessionId, result, sourceAction, scope) =>
        this._finalizeSidebarPatchBridgeResult(handoff, sessionId, result, sourceAction, scope),
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
      void this._postSidebarDoctorRemediationPlan({
        handoff,
        workspacePath:
          payload?.workspace?.path ??
          payload?.workspace?.workspaceRootPath ??
          handoff.workspacePath,
      });
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

  private async _postSidebarDoctorRemediationPlan(input: {
    handoff?: StudioBlockerHandoff;
    workspacePath?: string;
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
      plan,
    });
    return plan;
  }

  private _postCreateTimelineStep(title: string, detail?: string): void {
    this._postInlineCreate('sidebarAiCreateProgress', {
      title,
      detail: detail ?? '',
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
        settings.aiProvider === 'openai-compatible'
          ? [
              {
                id: settings.customAIModel || 'openai-compatible',
                name: settings.customAIModel || 'OpenAI-compatible',
                vendor: 'openai-compatible',
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
    if (input.ok && input.kind !== 'ship-loop-step') {
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
    if (!prompt) {
      return;
    }
    if (!this._context) {
      this._postInlineCreate('sidebarAiCreateError', {
        error: 'AI creation is not available until the extension context is ready.',
      });
      return;
    }

    this._postInlineCreate('sidebarAiCreateThinking', {
      label: 'Connecting to AI planner…',
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
        'workspace',
        undefined,
        workspacePath,
        undefined,
        async (messages, token) => {
          if (requestedModelId && readWorkspaiSettings().aiProvider !== 'openai-compatible') {
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
          'AI is unavailable — inferring framework, kit, and modules from your description.'
        );
      } else {
        this._postCreateTimelineStep(
          'Drafted creation plan',
          modelId ? `Model: ${modelId}` : 'Stack, framework, and modules mapped.'
        );
      }
      this._postInlineCreate('sidebarAiCreatePlan', { plan, modelId, planSource });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._postInlineCreate('sidebarAiCreateError', {
        error: message,
        unsupportedStack:
          error instanceof UnsupportedCreationStackError ? error.stackLabel : undefined,
        createCapability:
          error instanceof UnsupportedCreationStackError ? error.capability : undefined,
      });
    }
  }

  private async _runInlineAICreateConfirm(payload: unknown): Promise<void> {
    const plan =
      payload && typeof payload === 'object' && 'plan' in payload
        ? ((payload as { plan?: unknown }).plan as AICreationPlan | undefined)
        : undefined;
    if (!plan) {
      this._postInlineCreate('sidebarAiCreateError', { error: 'No AI creation plan to execute.' });
      return;
    }

    try {
      this._postInlineCreate('sidebarAiCreateProgress', {
        title: 'Creating workspace shell',
        detail: `Workspace: ${plan.workspaceName}`,
      });

      const profile = resolveCreationProfile(plan.profile, plan.framework);
      await vscode.commands.executeCommand('workspai.createWorkspace', {
        name: plan.workspaceName,
        profile,
        installMethod: plan.installMethod ?? 'auto',
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
      });
      await syncWorkspaceAfterInlineCreate(workspacePath);
      this._postInlineCreate('sidebarAiCreateDone', {
        plan,
        workspacePath,
        projects: createdProjects,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._postInlineCreate('sidebarAiCreateError', { error: message });
    }
  }

  private async _runSidebarManualCreate(payload: unknown): Promise<void> {
    const payloadRecord =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const mode = payloadRecord.mode === 'project' ? 'project' : 'workspace';
    const name = typeof payloadRecord.name === 'string' ? payloadRecord.name.trim() : '';
    if (!name) {
      this._postInlineCreate('sidebarManualCreateResult', {
        status: 'failed',
        error: mode === 'project' ? 'Project name is required.' : 'Workspace name is required.',
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
        });
        this._postCreateTimelineStep(
          'Validated project plan',
          `${name} · ${frameworkKey} · ${kitName}`
        );

        const scope = resolveExplicitWorkspaceScope(payloadRecord.scope);
        const cli = new WorkspaiCLI();
        let workspacePath = scope.workspacePath;

        if (!workspacePath) {
          const ensured = await ensureManagedDefaultWorkspace();
          workspacePath = ensured.path;
          this._postCreateTimelineStep('Using default workspace');
        } else {
          this._postCreateTimelineStep(
            'Creating project in workspace',
            path.basename(workspacePath)
          );
        }

        this._postCreateTimelineStep(
          'Running RapidKit scaffold',
          `Generating files and installing dependencies for ${kitName}…`
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
          'Refreshing workspace model and evidence…'
        );
        await syncWorkspaceAfterInlineCreate(workspacePath);

        this._postCreateTimelineStep('Refreshing project explorer', 'Updating project list…');
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
        });
        return;
      }

      this._postInlineCreate('sidebarAiCreateThinking', {
        label: 'Preparing workspace shell…',
      });
      this._postCreateTimelineStep('Validated workspace plan', `${name} · ${profile} profile`);
      this._postCreateTimelineStep(
        'Creating workspace shell',
        'Generating workspace files and governance defaults…'
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
        initGit: payloadRecord.initGit !== false,
        policyMode: payloadRecord.policyMode === 'strict' ? 'strict' : 'warn',
        dependencySharing: payloadRecord.dependencySharing === 'shared' ? 'shared' : 'isolated',
        suppressPostCreatePrompt: true,
        silent: true,
      });

      this._postCreateTimelineStep(
        'Finalizing workspace',
        'Workspace shell is ready for projects and evidence.'
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
      });
    } catch (error) {
      this._postInlineCreate('sidebarManualCreateResult', {
        status: 'failed',
        mode,
        name,
        error: error instanceof Error ? error.message : String(error),
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

      if (readWorkspaiSettings().aiProvider === 'openai-compatible') {
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
    const sessionId =
      typeof payloadRecord.sessionId === 'string' && payloadRecord.sessionId.trim().length > 0
        ? payloadRecord.sessionId.trim()
        : undefined;
    const studioMode =
      payloadRecord.mode === 'verify' || payloadRecord.mode === 'prepare'
        ? payloadRecord.mode
        : 'investigate';
    const handoff =
      parseStudioBlockerHandoffPayload(payloadRecord.blockerHandoff) ?? this._activeBlockerHandoff;
    if (handoff) {
      this._activeBlockerHandoff = handoff;
    }
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
        label: 'Preparing evidence-aware Studio plan...',
      });
      const remediationPlan = handoff
        ? await readDoctorRemediationPlanForStudio({
            workspacePath: handoff.workspacePath ?? aiContext.workspaceRootPath,
            handoff,
            maxSteps: 4,
          })
        : null;

      const studioPrompt = buildSidebarStudioPrompt({
        task,
        handoff,
        remediationPlan,
        studioMode,
      });
      const prepared = await prepareAIConversation('ask', studioPrompt, aiContext, history);
      let answer = '';
      let modelId = '';

      if (readWorkspaiSettings().aiProvider === 'openai-compatible') {
        const response = await askConfiguredAIProvider(this._context, prepared.messages);
        modelId = response.provider;
        answer = response.text;
        this._postInlineCreate('sidebarStudioChunk', { sessionId, text: response.text });
      } else {
        const streamResult = await streamAIResponse(
          prepared.messages,
          (chunk) => {
            if (chunk.text) {
              answer += chunk.text;
              this._postInlineCreate('sidebarStudioChunk', { sessionId, text: chunk.text });
            }
          },
          undefined,
          requestedModelId
        );
        modelId = streamResult.modelId;
      }

      this._postInlineCreate('sidebarStudioDone', { sessionId, modelId, answer });
      const answerWorkspacePath = handoff?.workspacePath ?? aiContext.workspaceRootPath;
      if (handoff && answerWorkspacePath && answer.trim()) {
        const chatPatches = normalizePatchesForWorkspaceScope({
          workspacePath: answerWorkspacePath,
          projectPath: handoff.projectPath ?? aiContext.projectRootPath,
          patches: extractPatchesFromAiResponse(answer, {
            actionId: `sidebar-chat-fix-${handoff.cardId}`,
            workspacePath: answerWorkspacePath,
          }),
        });
        if (chatPatches.length > 0) {
          this._pendingSidebarPatches.set(
            sidebarPatchReviewKey(handoff.cardId, sessionId),
            chatPatches.map((patch) => ({ ...patch, status: 'pending' as const }))
          );
          this._postInlineCreate('sidebarStudioPatchReview', {
            sessionId,
            cardId: handoff.cardId,
            summary: `Studio found ${chatPatches.length} file patch(es) in the repair answer.`,
            riskSummary: 'Review the AI-proposed file changes before applying them.',
            patches: serializeSidebarPatchReviewItems(chatPatches),
          });
          this._postInlineCreate('sidebarStudioActionResult', {
            sessionId,
            cardId: handoff.cardId,
            action: 'apply-patch',
            status: 'review',
            title: 'Patch review ready',
            summary:
              'I found file changes in the Studio answer. Review and apply the patch set to continue the repair loop.',
            nextAction: undefined,
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._postInlineCreate('sidebarStudioError', { sessionId, error: message });
    }
  }

  private async _runSidebarStudioAction(payload: unknown): Promise<void> {
    const studioHost = this._actionsWebviewStudioActionHost();
    const { payloadRecord, action, sessionId, handoff } = resolveSidebarStudioActionPayload(
      payload,
      studioHost.getActiveBlockerHandoff(),
      parseStudioBlockerHandoffPayload
    );
    try {
      if (action === 'retry-audit') {
        await studioHost.retryLastSidebarStudioAudit(sessionId);
        return;
      }
      if (action === 'auto-fix') {
        if (!handoff) {
          throw new Error('No blocker handoff is active for auto-fix.');
        }
        if (!studioHost.context) {
          throw new Error('Studio auto-fix is not available until the extension context is ready.');
        }
        await studioHost.runSidebarAutoFix(handoff, sessionId, payloadRecord.scope);
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
        const remediationPlanCommand = buildArtifactRemediationPlanCommand();
        studioHost.postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          cardId: handoff.cardId,
          action,
          status: 'running',
          phase: 'refreshing-remediation-plan',
          summary: 'Refreshing source evidence and npm remediation plan.',
          commandText: evidenceRefreshCommand,
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
            sourceCommand: `${evidenceRefreshCommand} && ${remediationPlanCommand}`,
            blockers: handoff.blockers,
            exitCode: planExecution.exitCode ?? (planExecution.success ? 0 : 1),
          });
        }
        await studioHost.refreshSidebarShipLoop({
          workspacePath,
          projectPath: handoff.projectPath ?? scope.projectPath,
        });
        const refreshedPlan = await this._postSidebarDoctorRemediationPlan({
          handoff,
          workspacePath,
        });
        const hasRepairPlan = Boolean(refreshedPlan?.visibleSteps.length);
        const ok = planExecution.success && hasRepairPlan;
        const failureExecution = planExecution.success ? evidenceExecution : planExecution;
        studioHost.postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          cardId: handoff.cardId,
          action,
          status: ok ? 'done' : hasRepairPlan ? 'review' : 'failed',
          title: planExecution.success
            ? hasRepairPlan
              ? undefined
              : 'Evidence refreshed; source fix needed'
            : 'Evidence refresh failed',
          summary: planExecution.success
            ? hasRepairPlan
              ? 'Evidence refreshed. Studio loaded the latest repair plan.'
              : 'The artifact is fresh, but no deterministic repair plan is available for this card. I can continue with an AI-assisted fix using the refreshed evidence.'
            : (failureExecution.error ?? failureExecution.stderrTail ?? 'Evidence refresh failed.'),
          commandText: remediationPlanCommand,
          exitCode: failureExecution.exitCode,
          stderrTail: failureExecution.stderrTail,
          topBlocker: planExecution.success
            ? undefined
            : (failureExecution.error ?? handoff.blockers[0]),
          error: failureExecution.error,
          nextAction: planExecution.success
            ? hasRepairPlan
              ? undefined
              : 'auto-fix'
            : studioActionFailureNextAction('run-command'),
          nextActionLabel:
            planExecution.success && !hasRepairPlan ? 'Continue with fix' : undefined,
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
        const applyResult = await applyDoctorRemediationStep({ workspacePath, step });
        const ok = applyResult.status === 'applied';
        const verifyCommand = step.verifyCommand ?? handoff.verifyCommand;
        const stepProjectPath = await resolveProjectPathFromRemediationStep({
          step,
          workspacePath,
          handoffProjectPath: handoff.projectPath,
          scopeProjectPath: scope.projectPath,
        });
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
          void this._postSidebarDoctorRemediationPlan({ handoff, workspacePath });
        } else {
          void this._postSidebarDoctorRemediationPlan({ handoff, workspacePath });
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
        studioHost.deletePendingPatches(handoff.cardId, sessionId);
        await studioHost.finalizeSidebarPatchBridgeResult(
          handoff,
          sessionId,
          patchResult,
          'apply-patch',
          {
            workspacePath,
            projectPath: handoff.projectPath ?? scope.projectPath,
          }
        );
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
        if (!scope.workspacePath) {
          throw new Error('No workspace is selected for verify.');
        }
        const execution = await runIncidentInlineCommand({
          command: handoff.verifyCommand,
          workspacePath: scope.workspacePath,
          actionId: 'verify-gates',
        });
        await studioHost.finalizeStudioVerifyHandoff({
          handoff,
          workspacePath: scope.workspacePath,
          projectPath: scope.projectPath,
          sessionId,
          verifySucceeded: execution.success,
          verifyExitCode: execution.exitCode ?? (execution.success ? 0 : 1),
          verifyError: execution.error,
        });
        if (execution.success) {
          void recordRetentionMilestone(this._context, 'verify_pass_after_studio_fix', {
            surface: 'studio',
          });
        }
        studioHost.postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          ...(handoff ? { cardId: handoff.cardId } : {}),
          action,
          status: execution.success ? 'done' : 'failed',
          title: execution.success ? undefined : 'Verify failed',
          summary: execution.success
            ? undefined
            : (execution.error ?? execution.stderrTail ?? handoff.blockers[0]),
          commandText: handoff.verifyCommand,
          exitCode: execution.exitCode,
          stderrTail: execution.stderrTail,
          topBlocker: execution.success ? undefined : (execution.error ?? handoff.blockers[0]),
          error: execution.error,
          nextAction: execution.success
            ? undefined
            : studioActionFailureNextAction('verify-handoff'),
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
        const executionPlan = await resolveRapidkitExecutionPlan({
          command: commandText,
          workspacePath: scope.workspacePath,
          projectPath: scope.projectPath,
          projectBelongsToWorkspace: scope.projectBelongsToWorkspace,
        });
        if ('error' in executionPlan) {
          throw new Error(executionPlan.error);
        }
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

  private async _finalizeStudioVerifyHandoff(input: {
    handoff: StudioBlockerHandoff;
    workspacePath: string;
    projectPath?: string;
    sessionId?: string;
    verifySucceeded: boolean;
    verifyExitCode?: number | null;
    verifyError?: string;
  }): Promise<StudioSidebarDashboardRefreshResult> {
    if (this._context) {
      await recordStudioBlockerCommandRun(this._context, {
        cardId: input.handoff.cardId,
        sourceCommand: input.handoff.verifyCommand ?? input.handoff.sourceCommand,
        blockers: input.handoff.blockers,
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
    if (input.verifySucceeded) {
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
      studioMode: refresh.primaryCard?.status === 'pass' ? 'VERIFY_ONLY' : input.handoff.studioMode,
    };
    this._activeBlockerHandoff = nextHandoff;

    this._postInlineCreate('sidebarStudioCardRefreshed', {
      handoff: nextHandoff,
      cardId: input.handoff.cardId,
      cardStatus: refresh.primaryCard?.status,
      blockers: refresh.primaryCard?.blockers ?? [],
      refreshedCardIds: refresh.cardIds,
      verifySucceeded: input.verifySucceeded,
    });
    if (nextHandoff.cardStatus !== 'pass') {
      void this._postSidebarDoctorRemediationPlan({
        handoff: nextHandoff,
        workspacePath: input.workspacePath,
      });
    }

    if (input.verifySucceeded || refresh.primaryCard) {
      this._postInlineCreate('sidebarStudioFixApplied', {
        cardId: input.handoff.cardId,
        verifyCommand: input.handoff.verifyCommand,
        verifyArtifact: input.handoff.verifyArtifact,
        requiresVerify: refresh.primaryCard?.status !== 'pass',
        phase: refresh.primaryCard?.status === 'pass' ? 'verified' : 'awaiting-verify',
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
      summary: input.verifySucceeded
        ? 'Verify handoff completed.'
        : (input.verifyError ?? 'Verify failed.'),
      ok: input.verifySucceeded,
    });

    const toast = formatStudioCardRefreshToast({
      primaryCard: refresh.primaryCard,
      verifySucceeded: input.verifySucceeded,
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
    if (refreshResult.primaryCard?.status !== 'pass') {
      const refreshedPlan = await this._postSidebarDoctorRemediationPlan({
        handoff: {
          ...verifyHandoff,
          cardStatus: refreshResult.primaryCard?.status ?? verifyHandoff.cardStatus,
          blockers: refreshResult.primaryCard?.blockers ?? verifyHandoff.blockers,
        },
        workspacePath: input.workspacePath,
      });
      refreshedPlanStepCount = refreshedPlan?.visibleSteps.length ?? 0;
    }
    const verifyFailureSummary =
      verifyExecution.error ?? verifyExecution.stderrTail ?? input.failureFallbackSummary;

    const loopProgress = remediationLoopProgressForApply({
      verifySucceeded: verifyExecution.success,
      cardStatus: refreshResult.primaryCard?.status,
      refreshedPlanSteps: refreshedPlanStepCount,
      failureSummary: verifyFailureSummary,
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
      topBlocker: verifyExecution.success
        ? undefined
        : (verifyExecution.error ?? input.handoff.blockers[0]),
      error: verifyExecution.error,
      nextAction: verifyExecution.success ? loopProgress.nextAction : loopProgress.nextAction,
      nextActionLabel: loopProgress.nextActionLabel,
      ...(!verifyExecution.success && input.rollbackCommand
        ? { rollbackCommand: input.rollbackCommand }
        : {}),
    });

    if (verifyExecution.success && input.refreshShipLoopOnSuccess) {
      await this._refreshSidebarShipLoop({
        workspacePath: input.workspacePath,
        projectPath: effectiveProjectPath,
      });
    }
    if (verifyExecution.success && input.recordVerifyPassMilestone) {
      void recordRetentionMilestone(this._context, 'verify_pass_after_studio_fix', {
        surface: 'studio',
      });
    }
    return {
      verifySucceeded: verifyExecution.success,
      summary: finalSummary,
    };
  }

  private async _finalizeSidebarPatchBridgeResult(
    handoff: StudioBlockerHandoff,
    sessionId: string | undefined,
    result: SidebarPatchBridgeResult,
    sourceAction: 'auto-fix' | 'apply-patch' = 'auto-fix',
    scope: { workspacePath?: string; projectPath?: string } = {}
  ): Promise<void> {
    if (sessionId && result.responseText?.trim()) {
      this._postInlineCreate('sidebarStudioChunk', {
        sessionId,
        text: result.responseText.trim(),
      });
      this._postInlineCreate('sidebarStudioDone', {
        sessionId,
        answer: result.responseText.trim(),
      });
    }

    if (result.status === 'review' && result.pendingPatches && result.pendingPatches.length > 0) {
      this._pendingSidebarPatches.set(
        sidebarPatchReviewKey(handoff.cardId, sessionId),
        result.pendingPatches
      );
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
        title: 'AI repair needs a patch',
        summary:
          'I received an AI repair answer, but Studio could not extract safe file patch blocks to apply automatically.',
        nextAction: 'auto-fix',
        nextActionLabel: 'Retry AI fix',
      });
      return;
    }

    if (result.status === 'applied') {
      if (this._context) {
        await recordStudioBlockerCommandRun(this._context, {
          cardId: handoff.cardId,
          sourceCommand: handoff.sourceCommand,
          blockers: handoff.blockers,
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
        if (refreshResult.primaryCard?.status !== 'pass') {
          const refreshedPlan = await this._postSidebarDoctorRemediationPlan({
            handoff: {
              ...verifyHandoff,
              cardStatus: refreshResult.primaryCard?.status ?? verifyHandoff.cardStatus,
              blockers: refreshResult.primaryCard?.blockers ?? verifyHandoff.blockers,
            },
            workspacePath,
          });
          refreshedPlanStepCount = refreshedPlan?.visibleSteps.length ?? 0;
        }
        const verifyFailureSummary =
          verifyExecution.error ?? verifyExecution.stderrTail ?? result.summary;
        const loopProgress = remediationLoopProgressForApply({
          verifySucceeded: verifyExecution.success,
          cardStatus: refreshResult.primaryCard?.status,
          refreshedPlanSteps: refreshedPlanStepCount,
          failureSummary: verifyFailureSummary,
        });
        void this._auditSidebarStudioFix({
          sessionId,
          workspacePath,
          handoff: verifyHandoff,
          kind: sourceAction === 'apply-patch' ? 'apply-patch' : 'auto-fix',
          actionId: 'apply-debug-patch',
          summary: verifyExecution.success
            ? 'Patch applied and verify completed.'
            : (verifyExecution.error ?? verifyExecution.stderrTail ?? result.summary),
          ok: verifyExecution.success,
          appliedFixes,
          rollbackCommand: rollbackCommand ?? undefined,
          patchMetadata,
        });
        this._postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          cardId: handoff.cardId,
          action: sourceAction,
          status: loopProgress.status,
          title: loopProgress.title,
          summary: loopProgress.summary,
          commandText: verifyExecutionCommand,
          exitCode: verifyExecution.exitCode,
          stderrTail: verifyExecution.stderrTail,
          topBlocker: verifyExecution.success
            ? undefined
            : (verifyExecution.error ?? handoff.blockers[0]),
          error: verifyExecution.error,
          nextAction: loopProgress.nextAction,
          nextActionLabel: loopProgress.nextActionLabel,
          ...(!verifyExecution.success && rollbackCommand ? { rollbackCommand } : {}),
        });
      } else {
        void this._auditSidebarStudioFix({
          sessionId,
          workspacePath: workspacePath ?? '',
          handoff,
          kind: sourceAction === 'apply-patch' ? 'apply-patch' : 'auto-fix',
          actionId: 'apply-debug-patch',
          summary: result.summary,
          ok: true,
          appliedFixes,
          rollbackCommand: rollbackCommand ?? undefined,
          patchMetadata,
        });
        this._postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          cardId: handoff.cardId,
          action: sourceAction,
          status: 'done',
          summary: result.summary,
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
    payloadScope?: unknown
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

    this._postInlineCreate('sidebarStudioActionResult', {
      sessionId,
      cardId: handoff.cardId,
      action: 'auto-fix',
      status: 'running',
      phase: mode === 'RUN_ONCE' ? 'running-source-command' : 'fixing',
    });

    if (mode === 'RUN_ONCE') {
      const execution = await runIncidentInlineCommand({
        command: handoff.sourceCommand,
        workspacePath,
        actionId: 'run-analyze',
      });
      if (this._context) {
        await recordStudioBlockerCommandRun(this._context, {
          cardId: handoff.cardId,
          sourceCommand: handoff.sourceCommand,
          blockers: handoff.blockers,
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
      const patchResult = await executeSidebarApplyDebugPatch({
        context: this._context,
        workspacePath,
        handoff,
        projectPath,
      });
      await this._finalizeSidebarPatchBridgeResult(handoff, sessionId, patchResult, 'auto-fix', {
        workspacePath,
        projectPath,
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
    }
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

  dispose() {}
}

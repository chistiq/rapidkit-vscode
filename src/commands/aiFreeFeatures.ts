import * as path from 'path';
import * as vscode from 'vscode';
import type { AIModalContext } from '../core/aiService';
import { resolvePreferredAIModalContext } from '../core/aiContextResolver';
import { WorkspaceMemoryService, type WorkspaceMemory } from '../core/workspaceMemoryService';
import { findWorkspaceRoot } from '../utils/findWorkspace';
import { WorkspaceUsageTracker } from '../utils/workspaceUsageTracker';
import { WelcomePanel } from '../ui/panels/welcomePanel';

interface WorkspaceSelection {
  name?: string;
  path?: string;
}

interface ProjectSelection {
  name?: string;
  path?: string;
  type?: string;
}

interface AIRecipe {
  id: string;
  label: string;
  detail: string;
  mode: 'ask' | 'debug';
  prompt: string;
  expectedOutputTemplate: string;
  category: 'Debug' | 'Build' | 'Quality';
}

interface AIQuickAction {
  id:
    | 'fix-preview'
    | 'change-impact'
    | 'terminal-bridge'
    | 'release-outcome-validation'
    | 'memory-wizard'
    | 'recipe-packs'
    | 'release-readiness'
    | 'workspace-command-center';
  label: string;
  detail: string;
  command: string;
  category: 'Debug & Fix' | 'Planning & Safety' | 'Memory & Workflows' | 'Workspace Operations';
}

interface WorkspaceCommandPick {
  label: string;
  detail: string;
  command: string;
  category: 'Workspace Navigation' | 'Workspace Health' | 'Workspace Governance';
}

const MAX_PREFILL_CHARS = 4000;
const MAX_TERMINAL_CHARS = 6000;

const AI_RECIPES: AIRecipe[] = [
  {
    id: 'fast-root-cause',
    label: 'Fast Root-Cause',
    detail: 'Diagnose an error and get a smallest-safe fix plan with checks.',
    mode: 'debug',
    category: 'Debug',
    prompt:
      'Run a fast root-cause analysis for this issue. Return: (1) likely cause, (2) smallest safe fix, (3) exact files likely involved, (4) verification checklist.',
    expectedOutputTemplate: [
      '1) Root cause summary',
      '2) Minimal safe fix steps',
      '3) File touch list (highest to lowest confidence)',
      '4) Verification checklist (commands/tests)',
    ].join('\n'),
  },
  {
    id: 'add-endpoint',
    label: 'Add Endpoint Safely',
    detail: 'Plan route/service/schema/test changes for a new endpoint.',
    mode: 'ask',
    category: 'Build',
    prompt:
      'I need to add a new endpoint. Propose the minimal implementation plan aligned with this workspace: files to update, validation rules, auth checks, and tests.',
    expectedOutputTemplate: [
      '1) Endpoint contract (method/path/request/response)',
      '2) Files to create/update',
      '3) Validation/auth requirements',
      '4) Test plan (unit/integration)',
    ].join('\n'),
  },
  {
    id: 'refactor-legacy',
    label: 'Refactor Legacy Function',
    detail: 'Refactor without breaking behavior, plus rollback plan.',
    mode: 'ask',
    category: 'Build',
    prompt:
      'Refactor the selected code for readability and maintainability while preserving behavior. Return a step-by-step plan, risk notes, and a rollback strategy.',
    expectedOutputTemplate: [
      '1) Refactor objective and constraints',
      '2) Step-by-step edit plan',
      '3) Risk and compatibility checks',
      '4) Rollback plan',
    ].join('\n'),
  },
  {
    id: 'test-gaps',
    label: 'Find Test Gaps',
    detail: 'Identify missing tests and prioritize high-risk cases.',
    mode: 'ask',
    category: 'Quality',
    prompt:
      'Review this area and identify the highest-risk missing tests. Return prioritized test cases with reasons and suggested test structure.',
    expectedOutputTemplate: [
      '1) Missing test surfaces',
      '2) Risk-ranked test cases',
      '3) Suggested test structure',
      '4) Fast smoke checks',
    ].join('\n'),
  },
  {
    id: 'ship-readiness',
    label: 'Ship Readiness Check',
    detail: 'Pre-release checks for regressions, config, and observability.',
    mode: 'ask',
    category: 'Quality',
    prompt:
      'Run a ship-readiness review for this workspace. Include regression risks, missing checks, config concerns, and a final go/no-go checklist.',
    expectedOutputTemplate: [
      '1) Release blockers',
      '2) Risk matrix (high/medium/low)',
      '3) Observability and config checks',
      '4) Go / no-go recommendation',
    ].join('\n'),
  },
  {
    id: 'release-readiness-commander',
    label: 'Release Readiness Commander',
    detail:
      'Open Incident Studio with a Go/No-Go flow that aggregates verify/sandbox/doctor evidence.',
    mode: 'ask',
    category: 'Quality',
    prompt:
      'Run release-readiness-commander for this workspace. Produce a strict Go/No-Go decision with blocking reasons, confidence, and verification evidence pointers.',
    expectedOutputTemplate: [
      '1) Decision (GO / NO-GO)',
      '2) Blocking reasons (explicit and deduplicated)',
      '3) Evidence summary (verify/sandbox/doctor/scope)',
      '4) Recommended next safe step',
    ].join('\n'),
  },
  {
    id: 'db-migration-safety',
    label: 'DB Migration Safety',
    detail: 'Plan migration with rollback and data safety checks.',
    mode: 'ask',
    category: 'Build',
    prompt:
      'Plan a safe database schema migration for this change. Include migration order, compatibility strategy, rollback path, and validation checks.',
    expectedOutputTemplate: [
      '1) Migration order and sequence',
      '2) Backward compatibility strategy',
      '3) Rollback and recovery path',
      '4) Validation checks before/after deploy',
    ].join('\n'),
  },
  {
    id: 'api-contract-review',
    label: 'API Contract Review',
    detail: 'Spot breaking API changes and safe versioning path.',
    mode: 'ask',
    category: 'Quality',
    prompt:
      'Review this API change for contract risks. Identify potential breaking changes, required versioning strategy, and required consumer communication.',
    expectedOutputTemplate: [
      '1) Contract delta summary',
      '2) Breaking change risks',
      '3) Versioning / deprecation path',
      '4) Consumer validation checklist',
    ].join('\n'),
  },
  {
    id: 'performance-hotspot',
    label: 'Performance Hotspot Triage',
    detail: 'Find likely bottlenecks and fastest safe optimizations.',
    mode: 'debug',
    category: 'Debug',
    prompt:
      'Analyze this performance issue and identify likely hotspots. Return fastest safe optimizations, expected trade-offs, and validation metrics.',
    expectedOutputTemplate: [
      '1) Likely bottlenecks',
      '2) Top optimization candidates',
      '3) Trade-off notes',
      '4) Benchmark and validation plan',
    ].join('\n'),
  },
  {
    id: 'auth-hardening',
    label: 'Auth Hardening Review',
    detail: 'Security-focused review for auth and permission boundaries.',
    mode: 'ask',
    category: 'Quality',
    prompt:
      'Review authentication and authorization boundaries in this area. Identify likely vulnerabilities and recommend prioritized hardening actions.',
    expectedOutputTemplate: [
      '1) Potential auth vulnerabilities',
      '2) Permission boundary checks',
      '3) Priority hardening actions',
      '4) Verification and regression tests',
    ].join('\n'),
  },
  {
    id: 'incident-postmortem-lite',
    label: 'Incident Postmortem Lite',
    detail: 'Produce concise postmortem with prevention actions.',
    mode: 'debug',
    category: 'Debug',
    prompt:
      'Draft a concise incident postmortem from this failure context. Include timeline, root cause, contributing factors, and prevention actions.',
    expectedOutputTemplate: [
      '1) Incident timeline',
      '2) Root and contributing causes',
      '3) Immediate remediation',
      '4) Preventive actions and owners',
    ].join('\n'),
  },
];

const AI_QUICK_ACTIONS: AIQuickAction[] = [
  {
    id: 'fix-preview',
    label: 'Fix Preview Lite',
    detail: 'Root cause + patch preview without auto-apply',
    command: 'workspai.aiFixPreviewLite',
    category: 'Debug & Fix',
  },
  {
    id: 'terminal-bridge',
    label: 'Terminal to AI Bridge',
    detail: 'Analyze stack traces or test output',
    command: 'workspai.aiTerminalBridge',
    category: 'Debug & Fix',
  },
  {
    id: 'change-impact',
    label: 'Change Advisor Lite',
    detail: 'Assess blast radius before editing',
    command: 'workspai.aiChangeImpactLite',
    category: 'Planning & Safety',
  },
  {
    id: 'release-readiness',
    label: 'Release Readiness Commander',
    detail: 'Run a one-click Go/No-Go decision flow in Incident Studio',
    command: 'workspai.aiReleaseReadinessCommander',
    category: 'Planning & Safety',
  },
  {
    id: 'release-outcome-validation',
    label: 'Record Release Outcome Validation',
    detail: 'Attach validated GO/NO-GO outcomes to a release-readiness artifact',
    command: 'workspai.aiRecordReleaseOutcomeValidation',
    category: 'Planning & Safety',
  },
  {
    id: 'memory-wizard',
    label: 'Workspace Memory Wizard',
    detail: 'Capture conventions and decisions quickly',
    command: 'workspai.aiWorkspaceMemoryWizard',
    category: 'Memory & Workflows',
  },
  {
    id: 'recipe-packs',
    label: 'AI Recipe Packs',
    detail: 'Run reusable prompt workflows',
    command: 'workspai.aiRecipePacks',
    category: 'Memory & Workflows',
  },
  {
    id: 'workspace-command-center',
    label: 'Workspace Command Center',
    detail: 'Run enterprise workspace operations from an AI-guided control hub',
    command: 'workspai.aiWorkspaceCommandCenter',
    category: 'Workspace Operations',
  },
];

const AI_WORKSPACE_COMMANDS: WorkspaceCommandPick[] = [
  {
    label: 'Open Workspace in VS Code',
    detail: 'Open the selected workspace as the active VS Code folder',
    command: 'workspai.openWorkspace',
    category: 'Workspace Navigation',
  },
  {
    label: 'Open Workspace Folder in OS',
    detail: 'Reveal the selected workspace in your system file explorer',
    command: 'workspai.openWorkspaceFolder',
    category: 'Workspace Navigation',
  },
  {
    label: 'Copy Workspace Path',
    detail: 'Copy absolute workspace path to clipboard',
    command: 'workspai.copyWorkspacePath',
    category: 'Workspace Navigation',
  },
  {
    label: 'Export Workspace Archive',
    detail: 'Create a portable workspace export archive',
    command: 'workspai.exportWorkspace',
    category: 'Workspace Navigation',
  },
  {
    label: 'Workspace Health Dashboard',
    detail: 'Open health quick actions: check, autofix, compliance, version',
    command: 'workspai.checkWorkspaceHealth',
    category: 'Workspace Health',
  },
  {
    label: 'Bootstrap Workspace',
    detail: 'Initialize workspace with enterprise bootstrap profiles',
    command: 'workspai.workspaceBootstrap',
    category: 'Workspace Governance',
  },
  {
    label: 'Setup Workspace Runtime',
    detail: 'Verify runtime prerequisites (Python/Node/Go/Java/.NET)',
    command: 'workspai.workspaceSetup',
    category: 'Workspace Governance',
  },
  {
    label: 'Run Workspace Full Init',
    detail: 'Mirrored alias of init/workspace init/workspace run init (workspace + projects)',
    command: 'workspai.workspaceInit',
    category: 'Workspace Governance',
  },
  {
    label: 'Workspace Run Stage (Guided)',
    detail: 'Select and execute workspace run stage (init/test/build/start)',
    command: 'workspai.workspaceRunStage',
    category: 'Workspace Governance',
  },
  {
    label: 'Workspace Run Test',
    detail: 'Run workspace test stage with optional enterprise flags',
    command: 'workspai.workspaceRunTest',
    category: 'Workspace Governance',
  },
  {
    label: 'Workspace Run Build',
    detail: 'Run workspace build stage with optional enterprise flags',
    command: 'workspai.workspaceRunBuild',
    category: 'Workspace Governance',
  },
  {
    label: 'Workspace Run Start',
    detail: 'Run workspace start stage with optional enterprise flags',
    command: 'workspai.workspaceRunStart',
    category: 'Workspace Governance',
  },
  {
    label: 'Project Health Check',
    detail: 'Run project-scoped doctor checks and optional auto-fix',
    command: 'workspai.projectDoctor',
    category: 'Workspace Health',
  },
  {
    label: 'Show Workspace Policy',
    detail: 'Inspect effective policy and governance posture',
    command: 'workspai.workspacePolicyShow',
    category: 'Workspace Governance',
  },
  {
    label: 'Update Workspace Policy',
    detail: 'Set policy values and enforce governance rules',
    command: 'workspai.workspacePolicySet',
    category: 'Workspace Governance',
  },
  {
    label: 'Export Workspace Share Bundle',
    detail: 'Generate sanitized share bundle for collaboration and support',
    command: 'workspai.exportWorkspaceShareBundle',
    category: 'Workspace Governance',
  },
  {
    label: 'Cache Status',
    detail: 'Inspect workspace cache health and size',
    command: 'workspai.cacheStatus',
    category: 'Workspace Governance',
  },
  {
    label: 'Cache Clear',
    detail: 'Clear workspace caches (destructive)',
    command: 'workspai.cacheClear',
    category: 'Workspace Governance',
  },
  {
    label: 'Cache Prune',
    detail: 'Prune stale cache entries safely',
    command: 'workspai.cachePrune',
    category: 'Workspace Governance',
  },
  {
    label: 'Cache Repair',
    detail: 'Repair corrupted cache artifacts',
    command: 'workspai.cacheRepair',
    category: 'Workspace Governance',
  },
  {
    label: 'Mirror Status',
    detail: 'Inspect mirror replication and trust status',
    command: 'workspai.mirrorStatus',
    category: 'Workspace Governance',
  },
  {
    label: 'Mirror Sync',
    detail: 'Sync workspace mirror artifacts',
    command: 'workspai.mirrorSync',
    category: 'Workspace Governance',
  },
  {
    label: 'Mirror Verify',
    detail: 'Verify mirror integrity and signatures',
    command: 'workspai.mirrorVerify',
    category: 'Workspace Governance',
  },
  {
    label: 'Mirror Rotate Keys',
    detail: 'Rotate mirror signing keys with safety confirmation',
    command: 'workspai.mirrorRotate',
    category: 'Workspace Governance',
  },
];

function clampText(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxChars)}\n... [truncated]`;
}

async function executeOptionalCommand<T>(command: string): Promise<T | null> {
  try {
    const result = (await vscode.commands.executeCommand(command)) as T | undefined;
    return result ?? null;
  } catch {
    return null;
  }
}

function getEditorSelectionOrCurrentLine(
  editor = vscode.window.activeTextEditor
): string | undefined {
  if (!editor) {
    return undefined;
  }

  const selection = editor.selection;
  if (!selection.isEmpty) {
    const text = editor.document.getText(selection).trim();
    return text || undefined;
  }

  const currentLine = editor.document.lineAt(selection.active.line).text.trim();
  return currentLine || undefined;
}

function normalizeInputText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return clampText(trimmed, MAX_PREFILL_CHARS);
}

function parseFeatureInvocation(value: unknown): {
  seedText?: string;
  telemetryProps?: Record<string, string>;
  launchTargetOverride?: {
    workspacePath?: string;
    workspaceName?: string;
    projectPath?: string;
    projectName?: string;
    projectType?: string;
  };
} {
  if (typeof value === 'string') {
    return { seedText: value };
  }

  if (!value || typeof value !== 'object') {
    return {};
  }

  const payload = value as Record<string, unknown>;
  const telemetryProps: Record<string, string> = {};

  if (typeof payload.source === 'string' && payload.source.trim()) {
    telemetryProps.source = payload.source.trim();
  }
  if (typeof payload.trigger === 'string' && payload.trigger.trim()) {
    telemetryProps.trigger = payload.trigger.trim();
  }

  const seedText = typeof payload.seed === 'string' ? payload.seed : undefined;

  const workspaceFromPayload =
    payload.workspace && typeof payload.workspace === 'object'
      ? (payload.workspace as Record<string, unknown>)
      : null;
  const projectFromPayload =
    payload.project && typeof payload.project === 'object'
      ? (payload.project as Record<string, unknown>)
      : null;

  const launchTargetOverride = {
    workspacePath:
      (workspaceFromPayload && typeof workspaceFromPayload.path === 'string'
        ? workspaceFromPayload.path
        : undefined) ||
      (projectFromPayload && typeof projectFromPayload.workspacePath === 'string'
        ? projectFromPayload.workspacePath
        : undefined),
    workspaceName:
      workspaceFromPayload && typeof workspaceFromPayload.name === 'string'
        ? workspaceFromPayload.name
        : undefined,
    projectPath:
      projectFromPayload && typeof projectFromPayload.path === 'string'
        ? projectFromPayload.path
        : undefined,
    projectName:
      projectFromPayload && typeof projectFromPayload.name === 'string'
        ? projectFromPayload.name
        : undefined,
    projectType:
      projectFromPayload && typeof projectFromPayload.type === 'string'
        ? projectFromPayload.type
        : undefined,
  };

  const hasLaunchTargetOverride =
    typeof launchTargetOverride.workspacePath === 'string' ||
    typeof launchTargetOverride.projectPath === 'string';

  return {
    seedText,
    telemetryProps: Object.keys(telemetryProps).length > 0 ? telemetryProps : undefined,
    launchTargetOverride: hasLaunchTargetOverride ? launchTargetOverride : undefined,
  };
}

function looksLikeTerminalOutput(value: string): boolean {
  const text = value.toLowerCase();
  const signals = [
    'error',
    'exception',
    'traceback',
    'failed',
    'panic:',
    'stack trace',
    'npm err',
    'pytest',
    'fatal',
  ];
  return signals.some((signal) => text.includes(signal));
}

function hasActiveEditorErrors(editor = vscode.window.activeTextEditor): boolean {
  if (!editor) {
    return false;
  }

  const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
  return diagnostics.some((diagnostic) => diagnostic.severity === vscode.DiagnosticSeverity.Error);
}

async function resolvePreferredAIContext(): Promise<AIModalContext> {
  return resolvePreferredAIModalContext();
}

async function resolveWorkspaceForMemory(): Promise<{ name: string; path: string } | null> {
  const selectedWorkspace = await executeOptionalCommand<WorkspaceSelection>(
    'workspai.getSelectedWorkspace'
  );
  if (selectedWorkspace?.path) {
    return {
      name: selectedWorkspace.name ?? path.basename(selectedWorkspace.path),
      path: selectedWorkspace.path,
    };
  }

  const selectedProject = await executeOptionalCommand<ProjectSelection>(
    'workspai.getSelectedProject'
  );
  if (selectedProject?.path) {
    const workspaceRoot = await findWorkspaceRoot(selectedProject.path);
    if (workspaceRoot) {
      return {
        name: path.basename(workspaceRoot),
        path: workspaceRoot,
      };
    }
  }

  const fallback = vscode.workspace.workspaceFolders?.[0];
  if (fallback) {
    return {
      name: fallback.name,
      path: fallback.uri.fsPath,
    };
  }

  return null;
}

async function resolveWorkspaceForOperations(): Promise<{ name: string; path: string } | null> {
  const selectedWorkspace = await executeOptionalCommand<WorkspaceSelection>(
    'workspai.getSelectedWorkspace'
  );
  if (selectedWorkspace?.path) {
    return {
      name: selectedWorkspace.name ?? path.basename(selectedWorkspace.path),
      path: selectedWorkspace.path,
    };
  }

  const fallback = vscode.workspace.workspaceFolders?.[0];
  if (fallback) {
    return {
      name: fallback.name,
      path: fallback.uri.fsPath,
    };
  }

  return null;
}

async function resolveIncidentStudioLaunchTarget(override?: {
  workspacePath?: string;
  workspaceName?: string;
  projectPath?: string;
  projectName?: string;
  projectType?: string;
}): Promise<{
  workspacePath: string;
  workspaceName: string;
  projectPath?: string;
  projectName?: string;
  projectType?: string;
} | null> {
  if (override?.workspacePath) {
    return {
      workspacePath: override.workspacePath,
      workspaceName: override.workspaceName || path.basename(override.workspacePath),
      projectPath: override.projectPath,
      projectName: override.projectName,
      projectType: override.projectType,
    };
  }

  const selectedWorkspace = await executeOptionalCommand<WorkspaceSelection>(
    'workspai.getSelectedWorkspace'
  );
  const selectedProject = await executeOptionalCommand<ProjectSelection>(
    'workspai.getSelectedProject'
  );

  if (selectedProject?.path) {
    const workspacePath =
      selectedWorkspace?.path ||
      vscode.workspace.workspaceFolders?.find((folder) =>
        selectedProject.path?.startsWith(folder.uri.fsPath)
      )?.uri.fsPath;

    if (workspacePath) {
      return {
        workspacePath,
        workspaceName: selectedWorkspace?.name || path.basename(workspacePath),
        projectPath: selectedProject.path,
        projectName: selectedProject.name,
        projectType: selectedProject.type,
      };
    }
  }

  if (selectedWorkspace?.path) {
    return {
      workspacePath: selectedWorkspace.path,
      workspaceName: selectedWorkspace.name || path.basename(selectedWorkspace.path),
    };
  }

  const fallback = vscode.workspace.workspaceFolders?.[0];
  if (!fallback) {
    return null;
  }

  return {
    workspacePath: fallback.uri.fsPath,
    workspaceName: fallback.name,
  };
}

async function shouldSuggestMemoryWizard(): Promise<boolean> {
  const workspaceTarget = await resolveWorkspaceForMemory();
  if (!workspaceTarget) {
    return false;
  }

  const memoryService = WorkspaceMemoryService.getInstance();
  const memory = await memoryService.read(workspaceTarget.path);

  const hasContext = memory.context.trim().length > 0;
  const hasConventions = memory.conventions.length > 0;
  const hasDecisions = memory.decisions.length > 0;

  return !(hasContext && hasConventions && hasDecisions);
}

async function collectListEntries(
  label: string,
  existing: string[],
  guidance: string
): Promise<string[] | undefined> {
  const values = [...existing.filter((item) => item.trim())];

  while (values.length < 12) {
    const input = await vscode.window.showInputBox({
      prompt: `${guidance} (${values.length + 1}/12, leave empty to finish)`,
      placeHolder: `Add ${label}`,
    });

    if (input === undefined) {
      return undefined;
    }

    const trimmed = input.trim();
    if (!trimmed) {
      break;
    }

    values.push(trimmed);
  }

  return values;
}

async function promptReleaseOutcomeValidation(): Promise<{
  artifactId: string;
  originalDecision: 'GO' | 'NO-GO';
  validationOutcome:
    | 'go-confirmed'
    | 'go-missed-incident'
    | 'no-go-prevented-incident'
    | 'no-go-unnecessary';
  isCorrect: boolean;
  preventedIncident: boolean;
} | null> {
  const artifactIdInput = await vscode.window.showInputBox({
    title: 'Record Release Outcome Validation',
    prompt: 'Enter the release-readiness artifact ID',
    placeHolder: 'E.g. rrc_2026_05_04_billing_api',
    ignoreFocusOut: true,
  });

  if (artifactIdInput === undefined) {
    return null;
  }

  const artifactId = artifactIdInput.trim();
  if (!artifactId) {
    vscode.window.showWarningMessage(
      'Artifact ID is required to record release outcome validation.'
    );
    return null;
  }

  const validationPick = await vscode.window.showQuickPick(
    [
      {
        label: 'GO was correct',
        description: 'Release shipped cleanly and the GO decision held up',
        originalDecision: 'GO' as const,
        validationOutcome: 'go-confirmed' as const,
        isCorrect: true,
        preventedIncident: false,
      },
      {
        label: 'GO missed an incident',
        description: 'Release shipped, but the commander should have blocked it',
        originalDecision: 'GO' as const,
        validationOutcome: 'go-missed-incident' as const,
        isCorrect: false,
        preventedIncident: false,
      },
      {
        label: 'NO-GO prevented an incident',
        description: 'The block was justified and avoided a risky release',
        originalDecision: 'NO-GO' as const,
        validationOutcome: 'no-go-prevented-incident' as const,
        isCorrect: true,
        preventedIncident: true,
      },
      {
        label: 'NO-GO was unnecessary',
        description: 'The block was later cleared without finding a real release risk',
        originalDecision: 'NO-GO' as const,
        validationOutcome: 'no-go-unnecessary' as const,
        isCorrect: false,
        preventedIncident: false,
      },
    ],
    {
      title: 'Validated Outcome',
      placeHolder: 'Choose the validated outcome for this artifact',
      ignoreFocusOut: true,
    }
  );

  if (!validationPick) {
    return null;
  }

  return {
    artifactId,
    originalDecision: validationPick.originalDecision,
    validationOutcome: validationPick.validationOutcome,
    isCorrect: validationPick.isCorrect,
    preventedIncident: validationPick.preventedIncident,
  };
}

async function trackAIFreeCommandEvent(
  command: string,
  aiContext?: AIModalContext,
  properties?: Record<string, unknown>
): Promise<void> {
  await WorkspaceUsageTracker.getInstance().trackCommandEvent(command, aiContext?.path, {
    featureSet: 'ai-free-features',
    ...properties,
  });
}

type AIQuickPickEntry = vscode.QuickPickItem & {
  payload?: AIQuickAction;
};

function buildCategorizedQuickPick<T extends { category: string }>(
  items: T[],
  mapItem: (item: T) => vscode.QuickPickItem & { payload: T }
): Array<vscode.QuickPickItem & { payload?: T }> {
  const categories = [...new Set(items.map((item) => item.category))];
  const result: Array<vscode.QuickPickItem & { payload?: T }> = [];

  for (const category of categories) {
    result.push({ label: category, kind: vscode.QuickPickItemKind.Separator });
    for (const item of items.filter((candidate) => candidate.category === category)) {
      result.push(mapItem(item));
    }
  }

  return result;
}

export function registerAIFreeFeatureCommands(
  context: vscode.ExtensionContext
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('workspai.aiOrchestrate', async () => {
      const aiContext = await resolvePreferredAIContext();
      const selectionSnippet = normalizeInputText(getEditorSelectionOrCurrentLine());
      const hasErrors = hasActiveEditorErrors();

      const clipboardText = (await vscode.env.clipboard.readText()).trim();
      const clipboardHasTerminalSignal =
        clipboardText.length > 0 && looksLikeTerminalOutput(clipboardText);

      const shouldGuideMemory = await shouldSuggestMemoryWizard();

      let targetCommand = 'workspai.aiQuickActions';
      let routeReason = 'fallback-studio-lite';
      let commandArgs: unknown[] = [];

      if (hasErrors) {
        targetCommand = 'workspai.aiFixPreviewLite';
        routeReason = 'active-editor-errors';
        commandArgs = selectionSnippet ? [selectionSnippet] : [];
      } else if (selectionSnippet) {
        targetCommand = 'workspai.aiChangeImpactLite';
        routeReason = 'selection-without-errors';
        commandArgs = [selectionSnippet];
      } else if (clipboardHasTerminalSignal) {
        targetCommand = 'workspai.aiTerminalBridge';
        routeReason = 'terminal-signal-in-clipboard';
      } else if (shouldGuideMemory) {
        targetCommand = 'workspai.aiWorkspaceMemoryWizard';
        routeReason = 'memory-incomplete';
      }

      await trackAIFreeCommandEvent('workspai.aiOrchestrate', aiContext, {
        result: 'routed',
        targetCommand,
        routeReason,
        hasErrors,
        hasSelection: Boolean(selectionSnippet),
      });

      // Show a brief status bar message so user knows why a specific feature activated
      const routeLabels: Record<string, string> = {
        'active-editor-errors': '$(error) Routing to Fix Preview — errors detected',
        'selection-without-errors': '$(diff) Routing to Change Impact — selection detected',
        'terminal-signal-in-clipboard':
          '$(terminal) Routing to Terminal Bridge — terminal output in clipboard',
        'memory-incomplete': '$(brain) Routing to Memory Wizard — workspace memory incomplete',
        'fallback-studio-lite': '$(zap) Opening Workspai',
      };
      const label = routeLabels[routeReason] ?? '$(zap) Workspai AI';
      vscode.window.setStatusBarMessage(label, 4000);

      await vscode.commands.executeCommand(targetCommand, ...commandArgs);
    }),

    vscode.commands.registerCommand('workspai.aiQuickActions', async () => {
      const aiContext = await resolvePreferredAIContext();

      const picks = buildCategorizedQuickPick(AI_QUICK_ACTIONS, (action) => ({
        label: action.label,
        detail: action.detail,
        payload: action,
      }));

      const selected = (await vscode.window.showQuickPick(picks, {
        title: 'Workspai',
        placeHolder: 'Pick an AI workflow',
        ignoreFocusOut: true,
      })) as AIQuickPickEntry | undefined;

      if (!selected?.payload) {
        await trackAIFreeCommandEvent('workspai.aiQuickActions', aiContext, {
          result: 'cancelled',
        });
        return;
      }

      await trackAIFreeCommandEvent('workspai.aiQuickActions', aiContext, {
        result: 'selected',
        targetAction: selected.payload.id,
      });

      await vscode.commands.executeCommand(selected.payload.command);
    }),

    vscode.commands.registerCommand(
      'workspai.aiReleaseReadinessCommander',
      async (seed?: unknown) => {
        const aiContext = await resolvePreferredAIContext();
        const invocation = parseFeatureInvocation(seed);
        const launchTarget = await resolveIncidentStudioLaunchTarget(
          invocation.launchTargetOverride
        );
        const selection =
          normalizeInputText(invocation.seedText ?? seed) ??
          normalizeInputText(getEditorSelectionOrCurrentLine());

        if (!launchTarget) {
          vscode.window.showWarningMessage('Select or open a workspace first.');
          await trackAIFreeCommandEvent('workspai.aiReleaseReadinessCommander', aiContext, {
            result: 'no-workspace',
            ...invocation.telemetryProps,
          });
          return;
        }

        const initialQuery = selection
          ? [
              'Run release-readiness-commander for this workspace and selected context.',
              'Aggregate verify/sandbox/doctor/scope evidence and produce one deterministic GO/NO-GO decision.',
              `Selected context:\n${selection}`,
            ].join('\n\n')
          : 'Run release-readiness-commander for this workspace. Aggregate verify/sandbox/doctor/scope evidence and produce one deterministic GO/NO-GO decision.';

        await trackAIFreeCommandEvent('workspai.aiReleaseReadinessCommander', aiContext, {
          result: 'opened',
          inputSource: selection ? 'selection' : 'workspace-only',
          ...invocation.telemetryProps,
        });

        await vscode.commands.executeCommand('workspai.openIncidentStudio', {
          workspacePath: launchTarget.workspacePath,
          workspaceName: launchTarget.workspaceName,
          projectPath: launchTarget.projectPath,
          projectName: launchTarget.projectName,
          projectType: launchTarget.projectType,
          initialQuery,
        });
      }
    ),

    vscode.commands.registerCommand('workspai.aiRecordReleaseOutcomeValidation', async () => {
      const aiContext = await resolvePreferredAIContext();
      const launchTarget = await resolveIncidentStudioLaunchTarget();

      if (!launchTarget) {
        vscode.window.showWarningMessage('Select or open a workspace first.');
        await trackAIFreeCommandEvent('workspai.aiRecordReleaseOutcomeValidation', aiContext, {
          result: 'no-workspace',
        });
        return;
      }

      const validation = await promptReleaseOutcomeValidation();
      if (!validation) {
        await trackAIFreeCommandEvent('workspai.aiRecordReleaseOutcomeValidation', aiContext, {
          result: 'cancelled',
        });
        return;
      }

      const sharedProps = {
        artifactId: validation.artifactId,
        originalDecision: validation.originalDecision,
        validationOutcome: validation.validationOutcome,
      };

      const tracker = WorkspaceUsageTracker.getInstance();
      await tracker.trackCommandEvent(
        'workspai.studio.release_readiness_decision_validated',
        launchTarget.workspacePath,
        sharedProps
      );

      if (validation.isCorrect) {
        await tracker.trackCommandEvent(
          'workspai.studio.release_readiness_decision_correct',
          launchTarget.workspacePath,
          sharedProps
        );
      }

      if (validation.originalDecision === 'NO-GO') {
        await tracker.trackCommandEvent(
          'workspai.studio.release_readiness_no_go_decision_validated',
          launchTarget.workspacePath,
          sharedProps
        );
      }

      if (validation.preventedIncident) {
        await tracker.trackCommandEvent(
          'workspai.studio.release_readiness_no_go_prevented_incident',
          launchTarget.workspacePath,
          sharedProps
        );
      }

      await trackAIFreeCommandEvent('workspai.aiRecordReleaseOutcomeValidation', aiContext, {
        result: 'recorded',
        originalDecision: validation.originalDecision,
        validationOutcome: validation.validationOutcome,
      });

      vscode.window.showInformationMessage(
        `Recorded ${validation.originalDecision} validation for artifact ${validation.artifactId}.`
      );
    }),

    vscode.commands.registerCommand('workspai.aiFixPreviewLite', async (seed?: unknown) => {
      const aiContext = await resolvePreferredAIContext();
      const invocation = parseFeatureInvocation(seed);
      let issueContext =
        normalizeInputText(invocation.seedText ?? seed) ??
        normalizeInputText(getEditorSelectionOrCurrentLine());
      let fixInputSource: 'argument' | 'editor' | 'manual-prompt' = 'editor';

      if (typeof invocation.seedText === 'string' && invocation.seedText.trim()) {
        fixInputSource = 'argument';
      } else if (typeof seed === 'string' && seed.trim()) {
        fixInputSource = 'argument';
      } else if (!issueContext) {
        fixInputSource = 'manual-prompt';
        const input = await vscode.window.showInputBox({
          title: 'Fix Preview Lite',
          prompt: 'Describe the issue or paste an error message',
          placeHolder: 'E.g. 500 on POST /billing/invoice, or paste a stack trace',
          ignoreFocusOut: true,
        });
        if (input === undefined) {
          await trackAIFreeCommandEvent('workspai.aiFixPreviewLite', aiContext, {
            result: 'cancelled',
            inputSource: 'manual-prompt',
            ...invocation.telemetryProps,
          });
          return;
        }
        issueContext = input.trim() || undefined;
      }

      if (!issueContext) {
        vscode.window.showWarningMessage(
          'No issue context provided. Open a file with errors or add a selection first.'
        );
        await trackAIFreeCommandEvent('workspai.aiFixPreviewLite', aiContext, {
          result: 'empty-input',
          inputSource: fixInputSource,
          ...invocation.telemetryProps,
        });
        return;
      }

      await trackAIFreeCommandEvent('workspai.aiFixPreviewLite', aiContext, {
        result: 'opened',
        inputSource: fixInputSource,
        ...invocation.telemetryProps,
      });

      const prefillQuestion = [
        'Fix Preview Lite: propose the smallest safe patch only as a preview.',
        `Issue/context:\n${issueContext}`,
        'Output format: Root cause, candidate file edits, patch-style snippet, and post-fix checks. Do not assume edits are applied.',
      ].join('\n\n');

      WelcomePanel.showAIModal(context, {
        ...aiContext,
        prefillMode: 'debug',
        prefillQuestion,
      });
    }),

    vscode.commands.registerCommand('workspai.aiChangeImpactLite', async (seed?: unknown) => {
      const aiContext = await resolvePreferredAIContext();
      const invocation = parseFeatureInvocation(seed);
      let changeContext =
        normalizeInputText(invocation.seedText ?? seed) ??
        normalizeInputText(getEditorSelectionOrCurrentLine());
      let impactInputSource: 'argument' | 'editor' | 'manual-prompt' = 'editor';

      if (typeof invocation.seedText === 'string' && invocation.seedText.trim()) {
        impactInputSource = 'argument';
      } else if (typeof seed === 'string' && seed.trim()) {
        impactInputSource = 'argument';
      } else if (!changeContext) {
        impactInputSource = 'manual-prompt';
        const input = await vscode.window.showInputBox({
          title: 'Change Advisor Lite',
          prompt: 'Describe the change you are planning',
          placeHolder:
            'E.g. Replace the auth middleware, add a new DB column, extract service layer',
          ignoreFocusOut: true,
        });
        if (input === undefined) {
          await trackAIFreeCommandEvent('workspai.aiChangeImpactLite', aiContext, {
            result: 'cancelled',
            inputSource: 'manual-prompt',
            ...invocation.telemetryProps,
          });
          return;
        }
        changeContext = input.trim() || undefined;
      }

      if (!changeContext) {
        vscode.window.showWarningMessage(
          'No change description provided. Select code or describe the change first.'
        );
        await trackAIFreeCommandEvent('workspai.aiChangeImpactLite', aiContext, {
          result: 'empty-input',
          inputSource: impactInputSource,
          ...invocation.telemetryProps,
        });
        return;
      }

      await trackAIFreeCommandEvent('workspai.aiChangeImpactLite', aiContext, {
        result: 'opened',
        inputSource: impactInputSource,
        ...invocation.telemetryProps,
      });

      const prefillQuestion = [
        'Change Advisor Lite: assess what can break before I implement this change.',
        `Planned change:\n${changeContext}`,
        'Output format: likely impacted files/modules, risk level, required test updates, and a safe rollout checklist.',
      ].join('\n\n');

      WelcomePanel.showAIModal(context, {
        ...aiContext,
        prefillMode: 'ask',
        prefillQuestion,
      });
    }),

    vscode.commands.registerCommand('workspai.aiTerminalBridge', async (seed?: unknown) => {
      const aiContext = await resolvePreferredAIContext();
      const invocation = parseFeatureInvocation(seed);
      const selection =
        normalizeInputText(invocation.seedText ?? seed) ??
        normalizeInputText(getEditorSelectionOrCurrentLine());

      let terminalPayload = selection;
      let inputSource: 'selection' | 'clipboard' | 'manual' = 'selection';
      if (!terminalPayload) {
        const clipboardText = (await vscode.env.clipboard.readText()).trim();
        if (clipboardText && looksLikeTerminalOutput(clipboardText)) {
          terminalPayload = clampText(clipboardText, MAX_TERMINAL_CHARS);
          inputSource = 'clipboard';
        }
      }

      if (!terminalPayload) {
        inputSource = 'manual';
        const pasted = await vscode.window.showInputBox({
          prompt: 'Paste terminal output, stack trace, or test failure',
          placeHolder: 'Traceback, npm error, go panic, pytest failure, etc.',
          ignoreFocusOut: true,
        });

        if (pasted === undefined) {
          await trackAIFreeCommandEvent('workspai.aiTerminalBridge', aiContext, {
            result: 'cancelled',
            inputSource,
            ...invocation.telemetryProps,
          });
          return;
        }

        terminalPayload = normalizeInputText(pasted);
      }

      if (!terminalPayload) {
        vscode.window.showWarningMessage('No terminal output provided.');
        await trackAIFreeCommandEvent('workspai.aiTerminalBridge', aiContext, {
          result: 'empty-input',
          inputSource,
          ...invocation.telemetryProps,
        });
        return;
      }

      await trackAIFreeCommandEvent('workspai.aiTerminalBridge', aiContext, {
        result: 'opened',
        inputSource,
        ...invocation.telemetryProps,
      });

      const prefillQuestion = [
        'Terminal to AI Bridge: analyze this output and guide me to the fastest safe fix.',
        `Terminal output:\n${terminalPayload}`,
        'Output format: probable root cause, immediate fix commands, code-level follow-up, and prevention checks.',
      ].join('\n\n');

      WelcomePanel.showAIModal(context, {
        ...aiContext,
        prefillMode: 'debug',
        prefillQuestion,
      });

      // Follow-up action — drives terminal_bridge_to_followup_action_rate KPI
      const followup = await vscode.window.showInformationMessage(
        'Terminal output analyzed. Want a targeted patch preview for this error?',
        'Preview Fix',
        'Dismiss'
      );
      if (followup === 'Preview Fix') {
        await vscode.commands.executeCommand('workspai.aiFixPreviewLite', terminalPayload);
      }
    }),

    vscode.commands.registerCommand('workspai.aiWorkspaceMemoryWizard', async (seed?: unknown) => {
      const invocation = parseFeatureInvocation(seed);
      const seededContextLine = normalizeInputText(invocation.seedText ?? seed);
      const workspaceTarget = await resolveWorkspaceForMemory();
      if (!workspaceTarget) {
        vscode.window.showWarningMessage('Select or open a workspace first.');
        return;
      }

      await trackAIFreeCommandEvent(
        'workspai.aiWorkspaceMemoryWizard',
        {
          type: 'workspace',
          name: workspaceTarget.name,
          path: workspaceTarget.path,
        },
        {
          result: 'started',
          seedProvided: Boolean(seededContextLine),
          ...invocation.telemetryProps,
        }
      );

      const memoryService = WorkspaceMemoryService.getInstance();
      const currentMemory = await memoryService.read(workspaceTarget.path);

      const contextLine = await vscode.window.showInputBox({
        prompt: 'Workspace memory wizard: one-line project overview',
        value: seededContextLine ?? currentMemory.context,
        placeHolder: 'Example: Multi-tenant billing API for B2B subscriptions',
        ignoreFocusOut: true,
      });

      if (contextLine === undefined) {
        await trackAIFreeCommandEvent(
          'workspai.aiWorkspaceMemoryWizard',
          {
            type: 'workspace',
            name: workspaceTarget.name,
            path: workspaceTarget.path,
          },
          {
            result: 'cancelled-context',
            ...invocation.telemetryProps,
          }
        );
        return;
      }

      if (!contextLine.trim()) {
        vscode.window.showWarningMessage(
          'Project overview cannot be empty. Memory wizard cancelled.'
        );
        await trackAIFreeCommandEvent(
          'workspai.aiWorkspaceMemoryWizard',
          {
            type: 'workspace',
            name: workspaceTarget.name,
            path: workspaceTarget.path,
          },
          {
            result: 'empty-context',
            ...invocation.telemetryProps,
          }
        );
        return;
      }

      const conventions = await collectListEntries(
        'convention',
        currentMemory.conventions,
        'Add coding conventions or engineering rules'
      );
      if (!conventions) {
        await trackAIFreeCommandEvent(
          'workspai.aiWorkspaceMemoryWizard',
          {
            type: 'workspace',
            name: workspaceTarget.name,
            path: workspaceTarget.path,
          },
          {
            result: 'cancelled-conventions',
            ...invocation.telemetryProps,
          }
        );
        return;
      }

      const decisions = await collectListEntries(
        'decision',
        currentMemory.decisions,
        'Add architecture decisions (optional)'
      );
      if (!decisions) {
        await trackAIFreeCommandEvent(
          'workspai.aiWorkspaceMemoryWizard',
          {
            type: 'workspace',
            name: workspaceTarget.name,
            path: workspaceTarget.path,
          },
          {
            result: 'cancelled-decisions',
            ...invocation.telemetryProps,
          }
        );
        return;
      }

      const nextMemory: WorkspaceMemory = {
        context: contextLine.trim(),
        conventions,
        decisions,
        policyProfile: currentMemory.policyProfile,
        sensitivity: currentMemory.sensitivity,
        localProcessingMode: currentMemory.localProcessingMode,
        lastUpdated: currentMemory.lastUpdated,
      };

      await memoryService.write(workspaceTarget.path, nextMemory, {
        actor: 'workspai.aiWorkspaceMemoryWizard',
        operation: 'workspace-memory-wizard',
        mode: 'user-initiated',
        reason: 'User updated workspace memory via wizard.',
        approvedByUser: true,
      });
      await trackAIFreeCommandEvent(
        'workspai.aiWorkspaceMemoryWizard',
        {
          type: 'workspace',
          name: workspaceTarget.name,
          path: workspaceTarget.path,
        },
        {
          result: 'saved',
          conventionsCount: conventions.length,
          decisionsCount: decisions.length,
          ...invocation.telemetryProps,
        }
      );

      const memoryFile = await memoryService.resolveMemoryPath(workspaceTarget.path);
      const action = await vscode.window.showInformationMessage(
        `Workspace memory saved for ${workspaceTarget.name}.`,
        'Open memory file',
        'Ask AI with memory'
      );

      if (action === 'Open memory file') {
        const doc = await vscode.workspace.openTextDocument(memoryFile);
        await vscode.window.showTextDocument(doc, { preview: false });
      }

      if (action === 'Ask AI with memory') {
        const aiContext = await resolvePreferredAIContext();
        WelcomePanel.showAIModal(context, {
          ...aiContext,
          prefillMode: 'ask',
          prefillQuestion:
            'Use the latest workspace-memory.json context in your answer. Recommend the next three highest-impact engineering actions for this workspace.',
        });
      }
    }),

    vscode.commands.registerCommand('workspai.aiWorkspaceCommandCenter', async () => {
      const workspaceTarget = await resolveWorkspaceForOperations();
      if (!workspaceTarget) {
        vscode.window.showWarningMessage('Select or open a workspace first.');
        return;
      }

      const aiContext = await resolvePreferredAIContext();
      const picks = buildCategorizedQuickPick(AI_WORKSPACE_COMMANDS, (entry) => ({
        label: entry.label,
        detail: entry.detail,
        payload: entry,
      }));

      const selected = (await vscode.window.showQuickPick(picks, {
        title: `Workspace Command Center — ${workspaceTarget.name}`,
        placeHolder: 'Select a workspace operation to execute',
        ignoreFocusOut: true,
      })) as (vscode.QuickPickItem & { payload?: WorkspaceCommandPick }) | undefined;

      if (!selected?.payload) {
        await trackAIFreeCommandEvent('workspai.aiWorkspaceCommandCenter', aiContext, {
          result: 'cancelled',
        });
        return;
      }

      const payload = {
        workspace: {
          path: workspaceTarget.path,
          name: workspaceTarget.name,
        },
        path: workspaceTarget.path,
        name: workspaceTarget.name,
      };

      if (selected.payload.command === 'workspai.projectDoctor') {
        const selectedProject = await executeOptionalCommand<ProjectSelection>(
          'workspai.getSelectedProject'
        );

        if (!selectedProject?.path) {
          vscode.window.showWarningMessage(
            'Project Health Check requires a selected project. Please choose a project from the Projects panel first.'
          );
          await trackAIFreeCommandEvent('workspai.aiWorkspaceCommandCenter', aiContext, {
            result: 'no-project-selected',
            targetCommand: selected.payload.command,
          });
          return;
        }

        await trackAIFreeCommandEvent('workspai.aiWorkspaceCommandCenter', aiContext, {
          result: 'executed',
          targetCommand: selected.payload.command,
        });

        await vscode.commands.executeCommand(selected.payload.command, {
          project: {
            path: selectedProject.path,
            name: selectedProject.name,
            type: selectedProject.type,
          },
          projectPath: selectedProject.path,
          preferredAction: 'check',
          workspace: payload.workspace,
        });
        return;
      }

      await trackAIFreeCommandEvent('workspai.aiWorkspaceCommandCenter', aiContext, {
        result: 'executed',
        targetCommand: selected.payload.command,
      });

      await vscode.commands.executeCommand(selected.payload.command, payload);
    }),

    vscode.commands.registerCommand('workspai.aiRecipePacks', async (recipeId?: string) => {
      let selectedRecipe =
        typeof recipeId === 'string'
          ? AI_RECIPES.find((recipe) => recipe.id === recipeId)
          : undefined;

      if (!selectedRecipe) {
        const recipePicks = buildCategorizedQuickPick(AI_RECIPES, (recipe) => ({
          label: recipe.label,
          detail: recipe.detail,
          payload: recipe,
        }));

        const pick = (await vscode.window.showQuickPick(recipePicks, {
          title: 'AI Recipe Packs',
          placeHolder: 'Choose a reusable AI workflow recipe',
          ignoreFocusOut: true,
        })) as (vscode.QuickPickItem & { payload?: AIRecipe }) | undefined;

        if (!pick?.payload) {
          const aiContext = await resolvePreferredAIContext();
          await trackAIFreeCommandEvent('workspai.aiRecipePacks', aiContext, {
            result: 'cancelled',
          });
          return;
        }

        selectedRecipe = pick.payload;
      }

      const aiContext = await resolvePreferredAIContext();
      const selection = normalizeInputText(getEditorSelectionOrCurrentLine());
      await trackAIFreeCommandEvent('workspai.aiRecipePacks', aiContext, {
        result: 'opened',
        recipeId: selectedRecipe.id,
        recipeCategory: selectedRecipe.category,
        inputSource: selection ? 'selection' : 'recipe-only',
      });

      if (selectedRecipe.id === 'release-readiness-commander') {
        await vscode.commands.executeCommand(
          'workspai.aiReleaseReadinessCommander',
          selection || {
            source: 'recipe-pack',
            trigger: 'release-readiness-commander',
          }
        );
        return;
      }

      const expectedOutputBlock = [
        'Expected output template:',
        selectedRecipe.expectedOutputTemplate,
      ].join('\n');
      const prefillQuestion = selection
        ? `${selectedRecipe.prompt}\n\nSelected context:\n${selection}\n\n${expectedOutputBlock}`
        : `${selectedRecipe.prompt}\n\n${expectedOutputBlock}`;

      WelcomePanel.showAIModal(context, {
        ...aiContext,
        prefillMode: selectedRecipe.mode,
        prefillQuestion,
      });
    }),
  ];
}

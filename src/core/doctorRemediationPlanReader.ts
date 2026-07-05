import * as path from 'path';
import * as fs from 'fs-extra';

import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';

export const DOCTOR_REMEDIATION_PLAN_SCHEMA_VERSION = 'doctor-remediation-plan-v2' as const;
export const ARTIFACT_REMEDIATION_PLAN_SCHEMA_VERSION = 'artifact-remediation-plan-v1' as const;
export const DOCTOR_REMEDIATION_PLAN_CACHE_TTL_MS = 2_000;

export type DoctorRemediationPlanStepView = {
  id: string;
  phase: string;
  order: number;
  projectName: string;
  projectPath: string;
  originalCommand: string;
  kind: string;
  risk: 'safe' | 'guarded' | 'invasive';
  executable: boolean;
  studioState: 'ready' | 'blocked' | 'review-required' | 'guidance-only';
  studioReason: string;
  primaryAction: string;
  requiresApproval: boolean;
  confidence?: 'high' | 'medium' | 'low';
  previewTitle: string;
  previewSummary: string;
  diffSummary: string;
  files: string[];
  verifyCommand?: string;
  refreshCommands: string[];
  blockedReason?: string;
  operation?: DoctorRemediationOperation;
  canApply: boolean;
};

export type DoctorRemediationOperation =
  | {
      type: 'file-create';
      path: string;
      content: string;
      overwrite: false;
    }
  | {
      type: 'file-append';
      path: string;
      lines: string[];
      ensureNewline: boolean;
    }
  | {
      type: 'file-copy';
      sourcePath: string;
      path: string;
      overwrite: false;
    }
  | {
      type: 'package-json-script';
      path: string;
      scriptName: string;
      scriptValue: string;
    }
  | {
      type: 'json-edit';
      path: string;
      edits: Array<{ pointer: string; value: string | number | boolean | null }>;
    }
  | {
      type: 'env-key-add';
      path: string;
      keys: Array<{ name: string; value: string; comment?: string }>;
    }
  | {
      type: 'makefile-target';
      path: string;
      target: string;
      command: string;
      phony: boolean;
    };

export type DoctorRemediationPlanView = {
  schemaVersion: typeof DOCTOR_REMEDIATION_PLAN_SCHEMA_VERSION;
  sourcePath: string;
  generatedAt: string;
  policyProfile: string;
  totalSteps: number;
  executableSteps: number;
  risk: {
    safe: number;
    guarded: number;
    invasive: number;
  };
  visibleSteps: DoctorRemediationPlanStepView[];
  hiddenStepCount: number;
  scope: 'workspace' | 'project';
  freshness: {
    verdict: 'fresh' | 'stale' | 'unknown';
    reason?: string;
    comparedArtifactPath?: string;
  };
};

type DoctorRemediationPlanCacheEntry = {
  expiresAt: number;
  plan: DoctorRemediationPlanView;
};

type ArtifactRemediationAction = {
  id: string;
  artifactKind: string;
  cardId: string;
  title: string;
  order: number;
  phase: string;
  scope: 'workspace' | 'project';
  status: 'ready' | 'review-required' | 'blocked' | 'guidance-only';
  mode: 'edit-file' | 'run-command' | 'refresh-evidence' | 'verify-before-fix' | 'manual-guidance';
  risk: 'safe' | 'guarded' | 'invasive';
  requiresApproval: boolean;
  blocker: string;
  summary: string;
  command?: string;
  verifyCommand: string;
  cwd: 'workspace' | 'project';
  files: string[];
  operation?: DoctorRemediationOperation;
  notes: string[];
};

const doctorRemediationPlanCache = new Map<string, DoctorRemediationPlanCacheEntry>();

function doctorRemediationPlanCacheKey(input: {
  workspacePath: string;
  handoff: StudioBlockerHandoff;
  maxSteps: number;
}): string {
  return [
    path.resolve(input.workspacePath),
    input.handoff.scope,
    input.handoff.cardId,
    input.handoff.blockerSignature ?? '',
    input.handoff.projectPath ? path.resolve(input.handoff.projectPath) : '',
    input.maxSteps,
  ].join('|');
}

export function clearDoctorRemediationPlanCache(): void {
  doctorRemediationPlanCache.clear();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function normalizeRisk(value: unknown): 'safe' | 'guarded' | 'invasive' {
  return value === 'safe' || value === 'guarded' || value === 'invasive' ? value : 'guarded';
}

function normalizeStudioState(
  value: unknown
): 'ready' | 'blocked' | 'review-required' | 'guidance-only' {
  return value === 'ready' ||
    value === 'blocked' ||
    value === 'review-required' ||
    value === 'guidance-only'
    ? value
    : 'blocked';
}

function normalizeConfidence(value: unknown): 'high' | 'medium' | 'low' | undefined {
  return value === 'high' || value === 'medium' || value === 'low' ? value : undefined;
}

function normalizeRepairOperation(value: unknown): DoctorRemediationOperation | undefined {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return undefined;
  }
  if (
    value.type === 'file-create' &&
    typeof value.path === 'string' &&
    typeof value.content === 'string' &&
    value.overwrite === false
  ) {
    return {
      type: 'file-create',
      path: value.path,
      content: value.content,
      overwrite: false,
    };
  }
  if (
    value.type === 'file-append' &&
    typeof value.path === 'string' &&
    Array.isArray(value.lines) &&
    value.lines.every((entry) => typeof entry === 'string') &&
    typeof value.ensureNewline === 'boolean'
  ) {
    return {
      type: 'file-append',
      path: value.path,
      lines: value.lines as string[],
      ensureNewline: value.ensureNewline,
    };
  }
  if (
    value.type === 'file-copy' &&
    typeof value.sourcePath === 'string' &&
    typeof value.path === 'string' &&
    value.overwrite === false
  ) {
    return {
      type: 'file-copy',
      sourcePath: value.sourcePath,
      path: value.path,
      overwrite: false,
    };
  }
  if (
    value.type === 'package-json-script' &&
    typeof value.path === 'string' &&
    typeof value.scriptName === 'string' &&
    typeof value.scriptValue === 'string'
  ) {
    return {
      type: 'package-json-script',
      path: value.path,
      scriptName: value.scriptName,
      scriptValue: value.scriptValue,
    };
  }
  if (value.type === 'json-edit' && typeof value.path === 'string' && Array.isArray(value.edits)) {
    const edits = value.edits.filter(
      (entry): entry is { pointer: string; value: string | number | boolean | null } =>
        isRecord(entry) &&
        typeof entry.pointer === 'string' &&
        (typeof entry.value === 'string' ||
          typeof entry.value === 'number' ||
          typeof entry.value === 'boolean' ||
          entry.value === null)
    );
    if (edits.length === value.edits.length) {
      return {
        type: 'json-edit',
        path: value.path,
        edits,
      };
    }
  }
  if (value.type === 'env-key-add' && typeof value.path === 'string' && Array.isArray(value.keys)) {
    const keys = value.keys.filter(
      (entry): entry is { name: string; value: string; comment?: string } =>
        isRecord(entry) &&
        typeof entry.name === 'string' &&
        typeof entry.value === 'string' &&
        (entry.comment == null || typeof entry.comment === 'string')
    );
    if (keys.length === value.keys.length) {
      return {
        type: 'env-key-add',
        path: value.path,
        keys,
      };
    }
  }
  if (
    value.type === 'makefile-target' &&
    typeof value.path === 'string' &&
    typeof value.target === 'string' &&
    typeof value.command === 'string' &&
    typeof value.phony === 'boolean'
  ) {
    return {
      type: 'makefile-target',
      path: value.path,
      target: value.target,
      command: value.command,
      phony: value.phony,
    };
  }
  return undefined;
}

function isChildPathOf(parentPath: string, childPath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return (
    relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function resolvePlanArtifactCandidates(input: {
  workspacePath: string;
  handoff: StudioBlockerHandoff;
}): string[] {
  const candidates: string[] = [];
  if (input.handoff.scope === 'project' && input.handoff.projectPath?.trim()) {
    candidates.push(
      path.join(
        input.handoff.projectPath.trim(),
        '.rapidkit',
        'reports',
        'doctor-remediation-plan-last-run.json'
      )
    );
  }
  candidates.push(
    path.join(input.workspacePath, '.rapidkit', 'reports', 'doctor-remediation-plan-last-run.json')
  );
  return [...new Set(candidates)];
}

function isDoctorRemediationHandoff(handoff: StudioBlockerHandoff): boolean {
  const haystack = [
    handoff.cardId,
    handoff.cardLabel,
    handoff.artifactPath,
    handoff.sourceCommand,
    handoff.verifyCommand,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  return /\bdoctor\b/.test(haystack) || haystack.includes('doctor-last-run');
}

function resolveArtifactRemediationPlanPath(workspacePath: string): string {
  return path.join(
    workspacePath,
    '.rapidkit',
    'reports',
    'artifact-remediation-plan-last-run.json'
  );
}

function resolveHandoffArtifactPath(input: {
  workspacePath: string;
  handoff: StudioBlockerHandoff;
}): string | undefined {
  const artifactPath = input.handoff.artifactPath?.trim();
  if (!artifactPath) {
    return undefined;
  }
  if (path.isAbsolute(artifactPath)) {
    return artifactPath;
  }
  return path.join(input.workspacePath, artifactPath);
}

function isAllowedPlanArtifactPath(input: {
  workspacePath: string;
  handoff: StudioBlockerHandoff;
  candidate: string;
}): boolean {
  if (isChildPathOf(input.workspacePath, input.candidate)) {
    return true;
  }
  const projectPath = input.handoff.projectPath?.trim();
  return Boolean(projectPath && isChildPathOf(projectPath, input.candidate));
}

async function assessPlanFreshness(input: {
  workspacePath: string;
  handoff: StudioBlockerHandoff;
  generatedAt: string;
}): Promise<DoctorRemediationPlanView['freshness']> {
  const generatedMs = Date.parse(input.generatedAt);
  if (!Number.isFinite(generatedMs)) {
    return {
      verdict: 'unknown',
      reason: 'Remediation plan has no parseable generatedAt timestamp.',
    };
  }
  const artifactPath = resolveHandoffArtifactPath(input);
  if (!artifactPath) {
    return {
      verdict: 'unknown',
      reason: 'Blocker handoff has no artifact path to compare freshness.',
    };
  }
  const projectPath = input.handoff.projectPath?.trim();
  const allowed =
    isChildPathOf(input.workspacePath, artifactPath) ||
    Boolean(projectPath && isChildPathOf(projectPath, artifactPath));
  if (!allowed || !(await fs.pathExists(artifactPath))) {
    return {
      verdict: 'unknown',
      reason: 'Blocker artifact is unavailable for freshness comparison.',
      comparedArtifactPath: artifactPath,
    };
  }
  const stat = await fs.stat(artifactPath);
  const artifactMs = stat.mtimeMs;
  if (artifactMs > generatedMs + 1000) {
    return {
      verdict: 'stale',
      reason: 'Blocker artifact is newer than the remediation plan. Refresh source evidence first.',
      comparedArtifactPath: artifactPath,
    };
  }
  return {
    verdict: 'fresh',
    comparedArtifactPath: artifactPath,
  };
}

function mapStep(step: Record<string, unknown>): DoctorRemediationPlanStepView {
  const studioStatus = isRecord(step.studioStatus) ? step.studioStatus : {};
  const repairIntent = isRecord(step.repairIntent) ? step.repairIntent : {};
  const preview = isRecord(step.preview) ? step.preview : {};
  const diffPreview = isRecord(step.diffPreview) ? step.diffPreview : {};

  const operation = normalizeRepairOperation(step.operation);
  const risk = normalizeRisk(step.risk);
  const studioState = normalizeStudioState(studioStatus.state);
  return {
    id: readString(step.id, 'unknown'),
    phase: readString(step.phase, 'manual-review'),
    order: readNumber(step.order, 0),
    projectName: readString(step.projectName, 'workspace'),
    projectPath: readString(step.projectPath),
    originalCommand: readString(step.originalCommand),
    kind: readString(step.kind, 'manual-url'),
    risk,
    executable: readBoolean(step.executable),
    studioState,
    studioReason: readString(studioStatus.reason),
    primaryAction: readString(
      repairIntent.primaryAction,
      readString(repairIntent.primaryActionLabel, readString(step.originalCommand, 'Review'))
    ),
    requiresApproval: readBoolean(repairIntent.requiresApproval, true),
    confidence: normalizeConfidence(repairIntent.confidence),
    previewTitle: readString(preview.title, readString(step.kind, 'Repair step')),
    previewSummary: readString(preview.summary),
    diffSummary: readString(diffPreview.summary),
    files: readStringArray(step.files),
    verifyCommand: readString(step.verifyCommand) || undefined,
    refreshCommands: readStringArray(step.refreshCommands),
    blockedReason: readString(step.blockedReason) || undefined,
    operation,
    canApply: Boolean(
      operation &&
      risk !== 'invasive' &&
      (studioState === 'ready' || studioState === 'review-required')
    ),
  };
}

function normalizeArtifactActionOperation(value: unknown): DoctorRemediationOperation | undefined {
  return normalizeRepairOperation(value);
}

function artifactOperationDiffSummary(
  operation: DoctorRemediationOperation | undefined,
  fallback: string
): string {
  if (!operation) {
    return fallback;
  }
  switch (operation.type) {
    case 'file-create':
      return `Create ${operation.path} without overwriting existing files.`;
    case 'file-append':
      return `Append ${operation.lines.length} missing line(s) to ${operation.path}.`;
    case 'file-copy':
      return `Copy ${operation.sourcePath} to ${operation.path} without overwriting existing files.`;
    case 'package-json-script':
      return `Set package script "${operation.scriptName}" in ${operation.path}.`;
    case 'json-edit':
      return `Apply ${operation.edits.length} JSON edit(s) to ${operation.path}.`;
    case 'env-key-add':
      return `Add ${operation.keys.length} environment key(s) to ${operation.path} when missing.`;
    case 'makefile-target':
      return `Add Makefile target "${operation.target}" to ${operation.path}.`;
    default:
      return fallback;
  }
}

function normalizeArtifactAction(value: unknown): ArtifactRemediationAction | null {
  if (!isRecord(value)) {
    return null;
  }
  const scope =
    value.scope === 'project' ? 'project' : value.scope === 'workspace' ? 'workspace' : null;
  const status =
    value.status === 'ready' ||
    value.status === 'review-required' ||
    value.status === 'blocked' ||
    value.status === 'guidance-only'
      ? value.status
      : null;
  const mode =
    value.mode === 'edit-file' ||
    value.mode === 'run-command' ||
    value.mode === 'refresh-evidence' ||
    value.mode === 'verify-before-fix' ||
    value.mode === 'manual-guidance'
      ? value.mode
      : null;
  const risk = normalizeRisk(value.risk);
  if (!scope || !status || !mode) {
    return null;
  }
  return {
    id: readString(value.id, 'unknown'),
    artifactKind: readString(value.artifactKind),
    cardId: readString(value.cardId),
    title: readString(value.title, 'Repair action'),
    order: readNumber(value.order, 0),
    phase: readString(value.phase, 'repair'),
    scope,
    status,
    mode,
    risk,
    requiresApproval: readBoolean(value.requiresApproval, true),
    blocker: readString(value.blocker),
    summary: readString(value.summary),
    command: readString(value.command) || undefined,
    verifyCommand: readString(value.verifyCommand),
    cwd: value.cwd === 'project' ? 'project' : 'workspace',
    files: readStringArray(value.files),
    operation: normalizeArtifactActionOperation(value.operation),
    notes: readStringArray(value.notes),
  };
}

function artifactActionMatchesHandoff(
  action: ArtifactRemediationAction,
  handoff: StudioBlockerHandoff
): boolean {
  if (action.cardId === handoff.cardId) {
    return true;
  }
  const normalizedActionKind = action.artifactKind.toLowerCase();
  const normalizedCardLabel = (handoff.cardLabel ?? '').toLowerCase();
  const normalizedArtifact = (handoff.artifactPath ?? '').toLowerCase();
  return Boolean(
    normalizedActionKind &&
    (normalizedCardLabel.includes(normalizedActionKind) ||
      normalizedArtifact.includes(normalizedActionKind))
  );
}

function mapArtifactActionToStep(input: {
  action: ArtifactRemediationAction;
  workspacePath: string;
  handoff: StudioBlockerHandoff;
}): DoctorRemediationPlanStepView {
  const action = input.action;
  const projectPath = action.cwd === 'project' ? (input.handoff.projectPath?.trim() ?? '') : '';
  const projectName = projectPath
    ? path.basename(projectPath)
    : input.handoff.cardLabel?.trim() || action.scope;
  const canApply = Boolean(
    action.operation &&
    action.risk !== 'invasive' &&
    (action.status === 'ready' || action.status === 'review-required')
  );
  return {
    id: action.id,
    phase: action.phase,
    order: action.order,
    projectName,
    projectPath,
    originalCommand: action.command ?? action.verifyCommand,
    kind: action.mode,
    risk: action.risk,
    executable: Boolean(action.command),
    studioState: action.status,
    studioReason:
      action.notes[0] ??
      (action.mode === 'run-command'
        ? 'Run this npm-authored remediation command before editing.'
        : 'Artifact remediation action is ready.'),
    primaryAction: action.title,
    requiresApproval: action.requiresApproval,
    previewTitle: action.title,
    previewSummary: action.summary,
    diffSummary: artifactOperationDiffSummary(action.operation, action.summary),
    files: action.files,
    verifyCommand: action.verifyCommand || undefined,
    refreshCommands: [
      'npx rapidkit workspace remediation-plan --ci --json --write --include-paths',
    ],
    blockedReason: action.status === 'blocked' ? action.summary : undefined,
    operation: action.operation,
    canApply,
  };
}

function filterStepsForHandoff(
  steps: DoctorRemediationPlanStepView[],
  handoff: StudioBlockerHandoff
): DoctorRemediationPlanStepView[] {
  if (handoff.scope !== 'project') {
    return steps;
  }
  const projectPath = handoff.projectPath?.trim();
  const projectName = projectPath ? path.basename(projectPath) : '';
  return steps.filter((step) => {
    if (
      projectPath &&
      step.projectPath &&
      path.resolve(step.projectPath) === path.resolve(projectPath)
    ) {
      return true;
    }
    return Boolean(projectName && step.projectName === projectName);
  });
}

async function readArtifactRemediationPlanForStudio(input: {
  workspacePath: string;
  handoff: StudioBlockerHandoff;
  maxSteps: number;
}): Promise<DoctorRemediationPlanView | null> {
  const candidate = resolveArtifactRemediationPlanPath(input.workspacePath);
  if (!(await fs.pathExists(candidate)) || !isAllowedPlanArtifactPath({ ...input, candidate })) {
    return null;
  }
  const payload = (await fs.readJSON(candidate)) as unknown;
  if (!isRecord(payload) || payload.schemaVersion !== ARTIFACT_REMEDIATION_PLAN_SCHEMA_VERSION) {
    return null;
  }
  const generatedAt = readString(payload.generatedAt);
  const rawActions = Array.isArray(payload.actions) ? payload.actions : [];
  const actions = rawActions
    .map(normalizeArtifactAction)
    .filter((entry): entry is ArtifactRemediationAction => Boolean(entry))
    .filter((action) => artifactActionMatchesHandoff(action, input.handoff))
    .sort((a, b) => a.order - b.order);
  if (actions.length === 0) {
    return null;
  }
  const steps = actions.map((action) =>
    mapArtifactActionToStep({ action, workspacePath: input.workspacePath, handoff: input.handoff })
  );
  const visibleSteps = steps.slice(0, input.maxSteps);
  const risk = steps.reduce(
    (acc, step) => {
      acc[step.risk] += 1;
      return acc;
    },
    { safe: 0, guarded: 0, invasive: 0 }
  );
  return {
    schemaVersion: DOCTOR_REMEDIATION_PLAN_SCHEMA_VERSION,
    sourcePath: candidate,
    generatedAt,
    policyProfile: 'artifact-remediation-plan-v1',
    totalSteps: steps.length,
    executableSteps: steps.filter((step) => step.executable || step.canApply).length,
    risk,
    visibleSteps,
    hiddenStepCount: Math.max(0, steps.length - visibleSteps.length),
    scope: input.handoff.scope,
    freshness: await assessPlanFreshness({
      workspacePath: input.workspacePath,
      handoff: input.handoff,
      generatedAt,
    }),
  };
}

export async function readDoctorRemediationPlanForStudio(input: {
  workspacePath?: string;
  handoff?: StudioBlockerHandoff;
  maxSteps?: number;
}): Promise<DoctorRemediationPlanView | null> {
  const workspacePath = input.workspacePath?.trim();
  const handoff = input.handoff;
  if (!workspacePath || !handoff) {
    return null;
  }
  const maxSteps = Math.max(1, Math.min(8, input.maxSteps ?? 4));
  const cacheKey = doctorRemediationPlanCacheKey({ workspacePath, handoff, maxSteps });
  const cached = doctorRemediationPlanCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.plan;
  }
  if (cached) {
    doctorRemediationPlanCache.delete(cacheKey);
  }

  if (isDoctorRemediationHandoff(handoff)) {
    for (const candidate of resolvePlanArtifactCandidates({ workspacePath, handoff })) {
      try {
        if (!(await fs.pathExists(candidate))) {
          continue;
        }
        if (!isAllowedPlanArtifactPath({ workspacePath, handoff, candidate })) {
          continue;
        }
        const payload = (await fs.readJSON(candidate)) as unknown;
        if (
          !isRecord(payload) ||
          payload.schemaVersion !== DOCTOR_REMEDIATION_PLAN_SCHEMA_VERSION
        ) {
          continue;
        }
        const rawSteps = Array.isArray(payload.steps) ? payload.steps.filter(isRecord) : [];
        const allSteps = rawSteps.map(mapStep).sort((a, b) => a.order - b.order);
        const scopedSteps = filterStepsForHandoff(allSteps, handoff);
        const visibleSteps = scopedSteps.slice(0, maxSteps);
        const risk = isRecord(payload.risk) ? payload.risk : {};
        const generatedAt = readString(payload.generatedAt);

        const plan: DoctorRemediationPlanView = {
          schemaVersion: DOCTOR_REMEDIATION_PLAN_SCHEMA_VERSION,
          sourcePath: candidate,
          generatedAt,
          policyProfile: readString(payload.policyProfile, 'enterprise-strict'),
          totalSteps: readNumber(payload.totalSteps, allSteps.length),
          executableSteps: readNumber(payload.executableSteps),
          risk: {
            safe: readNumber(risk.safe),
            guarded: readNumber(risk.guarded),
            invasive: readNumber(risk.invasive),
          },
          visibleSteps,
          hiddenStepCount: Math.max(0, scopedSteps.length - visibleSteps.length),
          scope: handoff.scope,
          freshness: await assessPlanFreshness({ workspacePath, handoff, generatedAt }),
        };
        doctorRemediationPlanCache.set(cacheKey, {
          expiresAt: Date.now() + DOCTOR_REMEDIATION_PLAN_CACHE_TTL_MS,
          plan,
        });
        return plan;
      } catch {
        continue;
      }
    }
  }

  const artifactPlan = await readArtifactRemediationPlanForStudio({
    workspacePath,
    handoff,
    maxSteps,
  });
  if (artifactPlan) {
    doctorRemediationPlanCache.set(cacheKey, {
      expiresAt: Date.now() + DOCTOR_REMEDIATION_PLAN_CACHE_TTL_MS,
      plan: artifactPlan,
    });
  }
  return artifactPlan;
}

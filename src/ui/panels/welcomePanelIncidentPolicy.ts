import { classifyIncidentActionPolicy } from './incidentStudioPromptPolicy';
import * as vscode from 'vscode';

type IncidentActionPolicy = ReturnType<typeof classifyIncidentActionPolicy>;

export function derivePredictionConfidenceBand(confidence: number): 'low' | 'medium' | 'high' {
  if (confidence >= 75) {
    return 'high';
  }
  if (confidence >= 50) {
    return 'medium';
  }
  return 'low';
}

export function normalizeIncidentRollbackApprovalMode(
  value: unknown
): 'never' | 'high-risk-only' | 'mutating-only' | 'always' {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (
    normalized === 'never' ||
    normalized === 'high-risk-only' ||
    normalized === 'mutating-only' ||
    normalized === 'always'
  ) {
    return normalized;
  }

  return 'high-risk-only';
}

export function normalizeIncidentRollbackProtectedPaths(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }

    const normalized = entry.trim().replace(/\\/g, '/').replace(/^\.\//, '');
    if (!normalized || unique.includes(normalized)) {
      continue;
    }
    unique.push(normalized);
    if (unique.length >= 32) {
      break;
    }
  }

  return unique;
}

export function isIncidentRollbackProtectedPath(
  candidatePath: string,
  protectedPathPrefixes: string[]
): boolean {
  const normalizedCandidate = candidatePath.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();

  for (const rawPrefix of protectedPathPrefixes) {
    const normalizedPrefix = rawPrefix.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();

    if (!normalizedPrefix) {
      continue;
    }

    const basePrefix = normalizedPrefix.endsWith('/')
      ? normalizedPrefix.slice(0, -1)
      : normalizedPrefix;

    if (normalizedCandidate === basePrefix || normalizedCandidate.startsWith(`${basePrefix}/`)) {
      return true;
    }
  }

  return false;
}

export function deriveIncidentVerifyCommandPack(input: {
  actionType: string;
  actionPolicy: IncidentActionPolicy;
  workspacePath?: string;
  projectPath?: string;
  projectType?: string;
  impactAssessment: {
    verifyChecklist: string[];
    affectedTests: string[];
  };
  releaseGateEvidence: {
    scopeKnown: boolean;
    verifyPathPresent: boolean;
    rollbackPathPresent: boolean;
    blockedReasons: string[];
  };
  doctorEvidence?: {
    errors?: number;
    warnings?: number;
  };
}): {
  qualityScore: number;
  readiness: 'ready' | 'needs-attention';
  rationale: string;
  commands: Array<{
    label: string;
    command: string;
    scope: 'workspace' | 'project';
    required: boolean;
  }>;
  blockedReasons: string[];
} {
  const commands: Array<{
    label: string;
    command: string;
    scope: 'workspace' | 'project';
    required: boolean;
  }> = [];

  const addCommand = (candidate: {
    label: string;
    command: string;
    scope: 'workspace' | 'project';
    required: boolean;
  }) => {
    const normalized = candidate.command.trim();
    if (!normalized) {
      return;
    }
    if (commands.some((entry) => entry.command === normalized)) {
      return;
    }
    commands.push({ ...candidate, command: normalized });
  };

  addCommand({
    label: 'Workspace doctor proof',
    command: 'rapidkit doctor workspace',
    scope: 'workspace',
    required: true,
  });

  if (input.projectPath) {
    addCommand({
      label: 'Project scope + diff proof',
      command: `git -C "${input.projectPath}" status --short`,
      scope: 'project',
      required: true,
    });
  }

  if (input.impactAssessment.affectedTests.length > 0) {
    const topTest = input.impactAssessment.affectedTests[0];
    if (/\.spec\.|\.test\./i.test(topTest)) {
      addCommand({
        label: 'Targeted impacted test',
        command: `vitest run "${topTest}"`,
        scope: 'project',
        required: false,
      });
    }
  }

  let qualityScore = 35;
  if (input.releaseGateEvidence.scopeKnown) {
    qualityScore += 20;
  }
  if (input.releaseGateEvidence.verifyPathPresent) {
    qualityScore += 20;
  }
  if (input.releaseGateEvidence.rollbackPathPresent) {
    qualityScore += 10;
  }
  if ((input.doctorEvidence?.errors ?? 0) === 0) {
    qualityScore += 10;
  }
  qualityScore += Math.min(10, commands.length * 3);
  qualityScore -= Math.min(24, input.releaseGateEvidence.blockedReasons.length * 8);

  if (input.actionPolicy.requiresVerifyPath && commands.length === 0) {
    qualityScore -= 15;
  }

  qualityScore = Math.max(0, Math.min(100, Math.round(qualityScore)));

  const blockedReasons = Array.from(new Set(input.releaseGateEvidence.blockedReasons)).slice(0, 6);
  const readiness: 'ready' | 'needs-attention' =
    qualityScore >= 70 && blockedReasons.length === 0 ? 'ready' : 'needs-attention';

  const rationale =
    readiness === 'ready'
      ? 'Deterministic verify path is complete and release gates are currently satisfied.'
      : blockedReasons.length > 0
        ? `Verify path needs attention: ${blockedReasons[0]}`
        : 'Verify path needs attention: collect stronger deterministic evidence before completion claim.';

  return {
    qualityScore,
    readiness,
    rationale,
    commands,
    blockedReasons,
  };
}

export function resolveIncidentRollbackRuntimePolicy(input: {
  workspacePath?: string;
  actionPolicy: IncidentActionPolicy;
  rollbackApprovalToken?: unknown;
  uiPrefs: {
    incidentRollbackApprovalMode?: unknown;
    incidentRollbackProtectedPaths?: unknown;
  };
}): {
  approvalMode: 'never' | 'high-risk-only' | 'mutating-only' | 'always';
  requiresManualApproval: boolean;
  approvedByUser: boolean;
  protectedPathPrefixes: string[];
} {
  const workspaceUri = input.workspacePath ? vscode.Uri.file(input.workspacePath) : undefined;
  const config = vscode.workspace.getConfiguration('workspai', workspaceUri);

  const approvalMode = normalizeIncidentRollbackApprovalMode(
    config.get('incidentStudio.rollbackApprovalMode') ?? input.uiPrefs.incidentRollbackApprovalMode
  );

  const configProtectedPaths = normalizeIncidentRollbackProtectedPaths(
    config.get('incidentStudio.rollbackProtectedPaths')
  );
  const protectedPathPrefixes =
    configProtectedPaths.length > 0
      ? configProtectedPaths
      : normalizeIncidentRollbackProtectedPaths(input.uiPrefs.incidentRollbackProtectedPaths);

  const requiresManualApproval =
    approvalMode === 'always' ||
    (approvalMode === 'high-risk-only' && input.actionPolicy.riskClass === 'high-risk-mutating') ||
    (approvalMode === 'mutating-only' &&
      (input.actionPolicy.riskClass === 'guarded-mutating' ||
        input.actionPolicy.riskClass === 'high-risk-mutating'));

  const approvedByUser =
    input.rollbackApprovalToken === true ||
    (typeof input.rollbackApprovalToken === 'string' &&
      input.rollbackApprovalToken.trim().toLowerCase() === 'approved');

  return {
    approvalMode,
    requiresManualApproval,
    approvedByUser,
    protectedPathPrefixes,
  };
}

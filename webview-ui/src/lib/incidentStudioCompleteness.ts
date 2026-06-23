export type IncidentEvidenceArtifactKey =
  | 'doctor'
  | 'analyze'
  | 'workspaceModel'
  | 'workspaceDiff'
  | 'workspaceImpact'
  | 'workspaceVerify'
  | 'workspaceContextAgent'
  | 'git';

export type IncidentStudioCompletenessLevel =
  | 'enterprise-ready'
  | 'operational'
  | 'partial'
  | 'degraded';

export type IncidentStudioCompletenessAssessment = {
  level: IncidentStudioCompletenessLevel;
  score: number;
  present: IncidentEvidenceArtifactKey[];
  missing: IncidentEvidenceArtifactKey[];
  stale: IncidentEvidenceArtifactKey[];
  recommendedNextCommand?: string;
  summary: string;
};

const ARTIFACT_WEIGHTS: Record<IncidentEvidenceArtifactKey, number> = {
  doctor: 18,
  analyze: 16,
  workspaceModel: 12,
  workspaceDiff: 10,
  workspaceImpact: 12,
  workspaceVerify: 14,
  workspaceContextAgent: 8,
  git: 10,
};

const DEFAULT_STALE_MS = 1000 * 60 * 60 * 24;

function isStale(generatedAt: string | undefined, maxStaleAgeMs: number): boolean {
  if (!generatedAt) {
    return true;
  }
  const parsed = Date.parse(generatedAt);
  if (!Number.isFinite(parsed)) {
    return true;
  }
  return Date.now() - parsed > maxStaleAgeMs;
}

function levelFromScore(score: number): IncidentStudioCompletenessLevel {
  if (score >= 88) {
    return 'enterprise-ready';
  }
  if (score >= 68) {
    return 'operational';
  }
  if (score >= 40) {
    return 'partial';
  }
  return 'degraded';
}

function recommendedCommandForMissing(missing: IncidentEvidenceArtifactKey[]): string | undefined {
  if (missing.includes('doctor')) {
    return 'npx rapidkit doctor workspace --json';
  }
  if (missing.includes('analyze')) {
    return 'npx rapidkit analyze --json';
  }
  if (missing.includes('workspaceModel')) {
    return 'npx rapidkit workspace model --write --json';
  }
  if (missing.includes('workspaceDiff') || missing.includes('workspaceImpact')) {
    return 'npx rapidkit workspace intelligence-chain --json';
  }
  if (missing.includes('workspaceVerify')) {
    return 'npx rapidkit workspace verify --from-impact .rapidkit/reports/workspace-impact-last-run.json --json';
  }
  if (missing.includes('workspaceContextAgent')) {
    return 'npx rapidkit workspace agent-sync --json';
  }
  if (missing.includes('git')) {
    return 'git status --short';
  }
  return undefined;
}

export function assessIncidentStudioCompleteness(input: {
  hasDoctorEvidence?: boolean;
  hasGitDiff?: boolean;
  hasAnalyze?: boolean;
  hasWorkspaceModel?: boolean;
  hasWorkspaceDiff?: boolean;
  hasWorkspaceImpact?: boolean;
  hasWorkspaceVerify?: boolean;
  hasAgentContext?: boolean;
  doctorGeneratedAt?: string;
  analyzeGeneratedAt?: string;
  modelGeneratedAt?: string;
  impactGeneratedAt?: string;
  verifyGeneratedAt?: string;
  maxStaleAgeMs?: number;
}): IncidentStudioCompletenessAssessment {
  const maxStaleAgeMs = input.maxStaleAgeMs ?? DEFAULT_STALE_MS;
  const flags: Record<IncidentEvidenceArtifactKey, boolean> = {
    doctor: input.hasDoctorEvidence === true,
    analyze: input.hasAnalyze === true,
    workspaceModel: input.hasWorkspaceModel === true,
    workspaceDiff: input.hasWorkspaceDiff === true,
    workspaceImpact: input.hasWorkspaceImpact === true,
    workspaceVerify: input.hasWorkspaceVerify === true,
    workspaceContextAgent: input.hasAgentContext === true,
    git: input.hasGitDiff === true,
  };

  const stale: IncidentEvidenceArtifactKey[] = [];
  if (flags.doctor && isStale(input.doctorGeneratedAt, maxStaleAgeMs)) {
    stale.push('doctor');
  }
  if (flags.analyze && isStale(input.analyzeGeneratedAt, maxStaleAgeMs)) {
    stale.push('analyze');
  }
  if (flags.workspaceModel && isStale(input.modelGeneratedAt, maxStaleAgeMs)) {
    stale.push('workspaceModel');
  }
  if (flags.workspaceImpact && isStale(input.impactGeneratedAt, maxStaleAgeMs)) {
    stale.push('workspaceImpact');
  }
  if (flags.workspaceVerify && isStale(input.verifyGeneratedAt, maxStaleAgeMs)) {
    stale.push('workspaceVerify');
  }

  const present = (Object.keys(flags) as IncidentEvidenceArtifactKey[]).filter((key) => flags[key]);
  const missing = (Object.keys(flags) as IncidentEvidenceArtifactKey[]).filter(
    (key) => !flags[key]
  );

  let score = 0;
  for (const key of present) {
    score += ARTIFACT_WEIGHTS[key];
    if (stale.includes(key)) {
      score -= Math.round(ARTIFACT_WEIGHTS[key] * 0.45);
    }
  }

  score = Math.max(0, Math.min(100, score));
  const level = levelFromScore(score);
  const recommendedNextCommand = recommendedCommandForMissing(missing);

  const summary =
    level === 'enterprise-ready'
      ? 'Evidence chain is enterprise-ready across doctor, analyze, intelligence, and verify artifacts.'
      : level === 'operational'
        ? `Operational evidence present (${present.length}/8 artifacts). ${missing.length > 0 ? `Missing: ${missing.slice(0, 3).join(', ')}.` : ''}`
        : level === 'partial'
          ? `Partial evidence (${present.length}/8). Run the intelligence chain before release claims.`
          : 'Degraded evidence posture. Start with doctor workspace and analyze.';

  return {
    level,
    score,
    present,
    missing,
    stale,
    recommendedNextCommand,
    summary,
  };
}

export function normalizeEvidenceCompletenessFromGraph(
  graphCompleteness: unknown
): IncidentStudioCompletenessAssessment | null {
  if (!graphCompleteness || typeof graphCompleteness !== 'object') {
    return null;
  }

  const raw = graphCompleteness as Record<string, unknown>;
  const level = raw.level;
  const normalizedLevel: IncidentStudioCompletenessLevel =
    level === 'enterprise-ready' ||
    level === 'operational' ||
    level === 'partial' ||
    level === 'degraded'
      ? level
      : 'partial';

  return {
    level: normalizedLevel,
    score: Number(raw.score ?? 0),
    present: Array.isArray(raw.present) ? (raw.present as IncidentEvidenceArtifactKey[]) : [],
    missing: Array.isArray(raw.missing) ? (raw.missing as IncidentEvidenceArtifactKey[]) : [],
    stale: Array.isArray(raw.stale) ? (raw.stale as IncidentEvidenceArtifactKey[]) : [],
    recommendedNextCommand:
      typeof raw.recommendedNextCommand === 'string' ? raw.recommendedNextCommand : undefined,
    summary: typeof raw.summary === 'string' ? raw.summary : 'Evidence completeness updated.',
  };
}

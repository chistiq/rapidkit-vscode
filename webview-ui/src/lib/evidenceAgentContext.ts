import type { DashboardEvidenceCard, DashboardEvidencePayload } from '@/lib/dashboardEvidence';
import { outcomeCards } from '@/lib/dashboardEvidence';

export function cardNeedsAgentAttention(card: DashboardEvidenceCard): boolean {
  return card.status === 'fail' || card.status === 'warn' || (card.blockers?.length ?? 0) > 0;
}

export type EvidenceAttentionItem = {
  card: DashboardEvidenceCard;
  severity: 'fail' | 'warn';
  blockerCount: number;
  attentionScore: number;
  rankReasons: string[];
};

const GOVERNANCE_IMPACT_SCORE: Partial<Record<DashboardEvidenceCard['id'], number>> = {
  pipeline: 35,
  readiness: 34,
  autopilot: 32,
  doctor: 30,
  projectDoctor: 28,
  analyze: 26,
  workspaceRun: 24,
  workspaceVerify: 24,
  workspaceImpact: 20,
  workspaceContextAgent: 18,
  agentGrounding: 18,
};

function recencyScore(card: DashboardEvidenceCard, nowMs = Date.now()): number {
  const generatedAt = typeof card.generatedAt === 'string' ? Date.parse(card.generatedAt) : NaN;
  if (!Number.isFinite(generatedAt)) {
    return 0;
  }
  const ageMs = Math.max(0, nowMs - generatedAt);
  if (ageMs <= 15 * 60 * 1000) {
    return 18;
  }
  if (ageMs <= 60 * 60 * 1000) {
    return 12;
  }
  if (ageMs <= 24 * 60 * 60 * 1000) {
    return 6;
  }
  return 0;
}

function buildAttentionRank(
  card: DashboardEvidenceCard
): Pick<EvidenceAttentionItem, 'attentionScore' | 'rankReasons'> {
  const blockerCount = card.blockers?.length ?? 0;
  const severityScore = card.status === 'fail' ? 100 : card.status === 'warn' ? 45 : 0;
  const blockerScore = Math.min(blockerCount, 5) * 8;
  const governanceScore = GOVERNANCE_IMPACT_SCORE[card.id] ?? 0;
  const recency = recencyScore(card);
  const attentionScore = severityScore + blockerScore + governanceScore + recency;
  const rankReasons = [
    card.status === 'fail' ? 'blocked' : card.status === 'warn' ? 'attention' : '',
    blockerCount > 0 ? `${blockerCount} blocker${blockerCount === 1 ? '' : 's'}` : '',
    governanceScore > 0 ? 'governance impact' : '',
    recency > 0 ? 'recent evidence' : '',
  ].filter(Boolean);

  return { attentionScore, rankReasons };
}

export function buildEvidenceAttentionInbox(
  evidence: DashboardEvidencePayload | null | undefined
): EvidenceAttentionItem[] {
  return outcomeCards(evidence)
    .map((card) => {
      const blockerCount = card.blockers?.length ?? 0;
      return {
        card,
        severity: card.status === 'fail' ? ('fail' as const) : ('warn' as const),
        blockerCount,
        ...buildAttentionRank(card),
      };
    })
    .sort((left, right) => {
      if (left.attentionScore !== right.attentionScore) {
        return right.attentionScore - left.attentionScore;
      }
      if (left.severity !== right.severity) {
        return left.severity === 'fail' ? -1 : 1;
      }
      return left.card.label.localeCompare(right.card.label);
    });
}

export function countEvidenceAttentionBuckets(
  evidence: DashboardEvidencePayload | null | undefined
): { blocked: number; attention: number; ok: number } {
  const cards = evidence?.cards ?? [];
  let blocked = 0;
  let attention = 0;
  let ok = 0;

  for (const card of cards) {
    if (card.status === 'fail' || (card.blockers?.length ?? 0) > 0) {
      blocked += 1;
    } else if (card.status === 'warn') {
      attention += 1;
    } else if (card.status === 'pass') {
      ok += 1;
    }
  }

  return { blocked, attention, ok };
}

export function buildEvidenceCardStudioQuery(
  card: DashboardEvidenceCard,
  evidence: DashboardEvidencePayload | null | undefined,
  workspace?: { path?: string; name?: string }
): string {
  const workspacePath = workspace?.path || evidence?.workspacePath || 'this workspace';
  const workspaceName = workspace?.name || workspacePath;
  const projectPath = card.scope === 'project' ? evidence?.projectPath : undefined;
  const projectName = card.scope === 'project' ? evidence?.projectName : undefined;
  const blockers = card.blockers ?? [];
  const stderrTail =
    typeof card.metrics?.stderrTail === 'string' ? card.metrics.stderrTail.trim() : '';

  const lines = [
    `Diagnose and fix the ${card.status} evidence issue "${card.label}" in workspace ${workspaceName}.`,
    `Summary: ${card.summary}`,
    card.artifactPath ? `Artifact: ${card.artifactPath}` : undefined,
    projectPath
      ? `Project scope: ${projectName || projectPath}`
      : `Workspace path: ${workspacePath}`,
    ...blockers.slice(0, 10).map((blocker) => `Blocker: ${blocker}`),
    stderrTail ? `Recent stderr:\n${stderrTail.slice(0, 800)}` : undefined,
    'Use workspace intelligence already synced in Studio. Recommend the smallest safe fix and one immediate next command.',
  ].filter((line): line is string => Boolean(line));

  return lines.join('\n');
}

export function buildEvidenceCardLogPreview(card: DashboardEvidenceCard): {
  exitCode?: number;
  commandId?: string;
  stderrTail?: string;
  runId?: string;
} {
  return {
    exitCode: typeof card.metrics?.exitCode === 'number' ? card.metrics.exitCode : undefined,
    commandId: typeof card.metrics?.commandId === 'string' ? card.metrics.commandId : undefined,
    stderrTail: typeof card.metrics?.stderrTail === 'string' ? card.metrics.stderrTail : undefined,
    runId: typeof card.metrics?.runId === 'string' ? card.metrics.runId : undefined,
  };
}

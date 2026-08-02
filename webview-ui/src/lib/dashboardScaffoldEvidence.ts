/**
 * Scaffold vs release-blocker semantics for empty workspaces — dashboard webview UI.
 * Keep patterns aligned with the Workspai CLI workspace scaffold contract.
 */

import type {
  DashboardEvidenceCard,
  DashboardEvidencePayload,
  DashboardEvidenceStatus,
} from './dashboardEvidence';
import { workspaceRegisteredProjectCount } from './dashboardReleaseReadiness';

export function isEmptyWorkspaceScaffoldBlocker(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('stale') ||
    lower.includes('missing evidence') ||
    lower.includes('missing required report') ||
    lower.includes('agents.md not synced') ||
    lower.includes('no projects') ||
    lower.includes('projects.empty') ||
    lower.includes('projects discovered') ||
    lower.includes('projects.missing') ||
    lower.includes('not yet run') ||
    lower.includes('doctor-last-run') ||
    lower.includes('pipeline-last-run') ||
    lower.includes('release-readiness') ||
    lower.includes('analyze-last-run') ||
    lower.includes('analyze reported') ||
    lower.includes('analyze verdict') ||
    lower.includes('analyze needs attention') ||
    lower.includes('toolchain.lock') ||
    lower.includes('not pinned') ||
    lower.includes('readiness:') ||
    lower.includes('env:') ||
    lower.includes('workspace-run-last') ||
    lower.includes('pre-project') ||
    lower.includes('before adding projects') ||
    lower.includes('workspace.projects.missing') ||
    lower.includes('no backend projects') ||
    lower.includes('index.json') ||
    lower.includes('workspace-intelligence-history') ||
    lower.includes('validation warning') ||
    lower.includes('workspace model validation') ||
    lower.includes('workspace.marker') ||
    lower.includes('no project roots') ||
    lower.includes('no infrastructure services') ||
    lower.includes('infra/overrides') ||
    lower.includes('infra dependencies') ||
    lower.includes('contract verify') ||
    lower.includes('contract inspect') ||
    lower.includes('publish verify evidence') ||
    lower.includes('rapidkit core not installed')
  );
}

export function filterEmptyWorkspaceScaffoldBlockers(blockers: string[]): string[] {
  return blockers.filter((blocker) => !isEmptyWorkspaceScaffoldBlocker(blocker));
}

export function areScaffoldOnlyBlockers(blockers: string[]): boolean {
  return (
    blockers.length === 0 || blockers.every((blocker) => isEmptyWorkspaceScaffoldBlocker(blocker))
  );
}

export function effectiveCardBlockers(
  card: DashboardEvidenceCard,
  workspaceProjectCount: number | null
): string[] {
  const blockers = card.blockers ?? [];
  if (workspaceProjectCount === 0) {
    return filterEmptyWorkspaceScaffoldBlockers(blockers);
  }
  return blockers;
}

function isFreshnessOnlyBlocker(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('evidence is stale') ||
    lower.includes('is stale relative to') ||
    (lower.includes('generated at') && lower.includes('before impact')) ||
    (lower.includes('stale report:') &&
      (lower.includes('.workspai/reports/') || lower.includes('.rapidkit/reports/')))
  );
}

export function cardCountsAsReleaseBlocker(
  card: DashboardEvidenceCard,
  workspaceProjectCount: number | null
): boolean {
  const effectiveBlockers = effectiveCardBlockers(card, workspaceProjectCount);
  if (workspaceProjectCount === 0) {
    if (effectiveBlockers.length === 0) {
      return false;
    }
    return card.blocking ?? card.status === 'fail';
  }
  if (card.blocking !== undefined) {
    return card.blocking;
  }
  if (effectiveBlockers.length > 0 && effectiveBlockers.every(isFreshnessOnlyBlocker)) {
    return false;
  }
  return card.status === 'fail';
}

export function evidenceCardVisualTone(
  card: DashboardEvidenceCard,
  workspaceProjectCount: number | null
): 'danger' | 'warn' | 'good' | 'neutral' {
  if (Number(card.metrics?.staleEvidence ?? 0) > 0 && card.status !== 'fail') {
    return 'warn';
  }
  if (workspaceProjectCount === 0 && !cardCountsAsReleaseBlocker(card, workspaceProjectCount)) {
    if (card.status === 'fail' || card.status === 'warn') {
      return 'warn';
    }
  }
  if (cardCountsAsReleaseBlocker(card, workspaceProjectCount)) {
    return 'danger';
  }
  if (card.status === 'fail') {
    return 'danger';
  }
  if (card.status === 'warn') {
    return 'warn';
  }
  if (card.status === 'pass') {
    return 'good';
  }
  return 'neutral';
}

export function evidenceCardStatusLabelForWorkspace(
  card: DashboardEvidenceCard,
  workspaceProjectCount: number | null
): string {
  if (
    workspaceProjectCount === 0 &&
    (card.status === 'fail' || card.status === 'warn' || card.status === 'missing') &&
    !cardCountsAsReleaseBlocker(card, workspaceProjectCount)
  ) {
    return 'Expected before first project';
  }
  const tone = evidenceCardVisualTone(card, workspaceProjectCount);
  if (tone === 'danger') {
    return 'Blocked';
  }
  if (tone === 'warn') {
    return 'Attention';
  }
  if (tone === 'good') {
    return 'Passed';
  }
  return 'Missing';
}

export function resolveWorkspaceProjectCountFromEvidence(
  evidence: DashboardEvidencePayload | null | undefined
): number | null {
  return workspaceRegisteredProjectCount(evidence ?? null);
}

export function countReleaseBlockingCards(
  cards: DashboardEvidenceCard[],
  workspaceProjectCount: number | null
): number {
  return cards.filter((card) => cardCountsAsReleaseBlocker(card, workspaceProjectCount)).length;
}

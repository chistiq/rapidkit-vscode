import type { DashboardEvidenceCard, DashboardEvidencePayload } from '@/lib/dashboardEvidence';

export type DashboardEvidenceProjectAttribution = {
  label: string;
  projectName?: string;
  projectPath?: string;
};

function metricString(card: DashboardEvidenceCard, key: string): string | undefined {
  const value = card.metrics?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function resolveEvidenceProjectAttribution(
  card: DashboardEvidenceCard,
  evidence: DashboardEvidencePayload | null | undefined
): DashboardEvidenceProjectAttribution | null {
  if (card.scope !== 'project') {
    return null;
  }

  const projectName =
    metricString(card, 'projectName') ||
    metricString(card, 'project') ||
    evidence?.projectName?.trim() ||
    undefined;
  const projectPath =
    metricString(card, 'projectPath') ||
    metricString(card, 'path') ||
    evidence?.projectPath?.trim() ||
    undefined;

  if (!projectName && !projectPath) {
    return {
      label: 'Project-scoped blocker',
    };
  }

  return {
    label: projectName || projectPath || 'Project-scoped blocker',
    projectName,
    projectPath,
  };
}

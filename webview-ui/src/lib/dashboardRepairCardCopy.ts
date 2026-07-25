import type { DashboardEvidenceCard } from './dashboardEvidence';

export type DashboardRepairCardCopy = {
  issue: string;
  guidance: string;
  remainingFindingCount: number;
};

function sentence(value: string): string {
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text) {
    return '';
  }
  const normalized = `${text.slice(0, 1).toUpperCase()}${text.slice(1)}`;
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function humanizeIdentifier(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function simplifyRepairFinding(value: string): string {
  const text = value.trim();
  if (!text) {
    return '';
  }

  const staleReport = text.match(/^Stale report:\s*(.+)$/i);
  if (staleReport) {
    const fileName = staleReport[1]?.split(/[\\/]/).filter(Boolean).pop() ?? 'evidence report';
    return `${fileName} is out of date.`;
  }

  const projectEvidence = text.match(
    /^project\.([^.]+)\.([^.]+):\s*Workspace run evidence (?:does not include project [^.]+|is missing or unreadable)\.?$/i
  );
  if (projectEvidence) {
    return `Run evidence for ${projectEvidence[1]} (${humanizeIdentifier(projectEvidence[2] ?? '')}) is missing.`;
  }

  const unmanagedProject = text.match(/^([^:]+):\s*Not a Workspai-managed project/i);
  if (unmanagedProject) {
    return `${unmanagedProject[1]?.trim()} is not registered as a Workspai project.`;
  }

  const missingDependencies = text.match(/^([^:]+):\s*Dependencies not installed/i);
  if (missingDependencies) {
    return `Dependencies are not installed for ${missingDependencies[1]?.trim()}.`;
  }

  if (/^analyze-evidence:/i.test(text)) {
    const score = text.match(/\((\d+\/100)\)/)?.[1];
    return `Workspace analysis needs attention${score ? ` (score ${score})` : ''}.`;
  }
  if (/^readiness-evidence:/i.test(text)) {
    return 'Release readiness needs review before verification.';
  }
  if (/^verify:/i.test(text)) {
    return 'Workspace verification is still blocked.';
  }
  if (/^graph\.subgraph\./i.test(text)) {
    const project = text.match(/^graph\.subgraph\.([^:]+):/i)?.[1];
    return `The changed ${project ?? 'project'} graph still needs verification evidence.`;
  }
  if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(text)) {
    return `Supporting ${humanizeIdentifier(text)} evidence is missing.`;
  }

  const scopedMessage = text.match(/^[A-Za-z0-9_.-]+:\s*(.+)$/)?.[1] ?? text;
  return sentence(scopedMessage);
}

function summaryIssue(card: DashboardEvidenceCard): string {
  const fail = Number(card.metrics?.fail ?? 0);
  const warn = Number(card.metrics?.warn ?? 0);
  const score = Number(card.metrics?.score);
  if (card.id === 'analyze' && (fail > 0 || warn > 0)) {
    const findings = [
      fail > 0 ? `${fail} failure${fail === 1 ? '' : 's'}` : '',
      warn > 0 ? `${warn} warning${warn === 1 ? '' : 's'}` : '',
    ].filter(Boolean);
    return `Analysis found ${findings.join(' and ')}${Number.isFinite(score) ? ` (score ${score})` : ''}.`;
  }
  if (card.id === 'readiness' && /all readiness gates passed/i.test(card.summary)) {
    return 'Release gates passed, but related evidence still needs review.';
  }
  if (card.status === 'missing') {
    return `${card.label} evidence has not been generated yet.`;
  }
  return sentence(card.summary) || `${card.label} needs attention.`;
}

export function buildDashboardRepairCardCopy(input: {
  card: DashboardEvidenceCard;
  blockers: readonly string[];
  actionLabel?: string;
  blocking: boolean;
}): DashboardRepairCardCopy {
  const findings = input.blockers.map(simplifyRepairFinding).filter(Boolean);
  const issue = findings[0] ?? summaryIssue(input.card);
  const remainingFindingCount = Math.max(findings.length - 1, 0);

  let guidance: string;
  if (input.blocking) {
    guidance = 'This issue blocks verification or release.';
  } else if (input.card.status === 'missing') {
    guidance = input.actionLabel
      ? `Run ${input.actionLabel} to create the missing evidence.`
      : 'Generate this evidence to complete the workspace record.';
  } else {
    guidance = 'This does not currently block release, but it should be reviewed.';
  }

  return { issue, guidance, remainingFindingCount };
}

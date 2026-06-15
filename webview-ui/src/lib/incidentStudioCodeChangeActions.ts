import type { StudioEvidenceSummary } from '@/components/StudioRedesign/state/studioState';
import type { StudioActionId } from '@/components/StudioRedesign/state/studioActions';
import type { IncidentProjectSelection } from '@/lib/incidentStudioPayload';

export type StudioCodeChangeActionPayload = {
  issueSummary?: string;
  logContext?: string;
  featureIntent?: string;
  moduleName?: string;
  targetPath?: string;
};

export type StudioChatBrainActionResolution = {
  actionType: string;
  userMessage: string;
  payload?: StudioCodeChangeActionPayload;
};

function pickPrimaryFinding(evidence?: StudioEvidenceSummary | null) {
  if (!evidence?.topFindings?.length) {
    return null;
  }
  return (
    evidence.topFindings.find((finding) => finding.severity === 'fail') ??
    evidence.topFindings.find((finding) => finding.severity === 'warn') ??
    evidence.topFindings[0]
  );
}

export function buildStudioEvidenceIssueContext(
  evidence?: StudioEvidenceSummary | null,
  projectSelection?: IncidentProjectSelection | null
): StudioCodeChangeActionPayload {
  const primaryFinding = pickPrimaryFinding(evidence);
  const projectLabel = projectSelection?.name || projectSelection?.path;

  if (!primaryFinding) {
    return {
      issueSummary: projectLabel
        ? `Review analyze evidence for project "${projectLabel}" and fix the highest-priority issue.`
        : 'Review workspace analyze evidence and fix the highest-priority issue.',
    };
  }

  const issueSummary = [
    projectLabel ? `Project: ${projectLabel}` : null,
    `${primaryFinding.target}: ${primaryFinding.title}`,
    primaryFinding.remediation ? `Suggested remediation: ${primaryFinding.remediation}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const logContext = [
    evidence?.generatedAt ? `Evidence generated at ${evidence.generatedAt}` : null,
    typeof evidence?.score === 'number' ? `Analyze score: ${evidence.score}` : null,
    evidence?.verdict ? `Verdict: ${evidence.verdict}` : null,
    `Findings: ${evidence?.findings.fail ?? 0} fail / ${evidence?.findings.warn ?? 0} warn / ${evidence?.findings.info ?? 0} info`,
  ]
    .filter(Boolean)
    .join('\n');

  return { issueSummary, logContext };
}

export function buildStudioModuleInstallContext(
  projectSelection?: IncidentProjectSelection | null
): StudioCodeChangeActionPayload {
  const projectLabel = projectSelection?.name || projectSelection?.path || 'selected project';
  const targetPath = projectSelection?.path;

  return {
    featureIntent: `Recommend and install the best RapidKit catalog module for "${projectLabel}" based on project type, existing modules, and analyze evidence. Prefer catalog slugs over ad-hoc scaffolding.`,
    moduleName: '',
    targetPath,
  };
}

export function resolveStudioActionChatBrainExecution(
  actionId: StudioActionId,
  evidence?: StudioEvidenceSummary | null,
  projectSelection?: IncidentProjectSelection | null
): StudioChatBrainActionResolution | null {
  switch (actionId) {
    case 'fix-lens': {
      const payload = buildStudioEvidenceIssueContext(evidence, projectSelection);
      return {
        actionType: 'apply-debug-patch',
        userMessage: 'Generate a governed code patch from workspace analyze evidence.',
        payload,
      };
    }
    case 'install-module': {
      const payload = buildStudioModuleInstallContext(projectSelection);
      return {
        actionType: 'apply-module-gen',
        userMessage: 'Install or scaffold the best catalog module for the selected project.',
        payload,
      };
    }
    default:
      return null;
  }
}

export function isStudioCodeChangeActionId(actionId: StudioActionId): boolean {
  return actionId === 'fix-lens' || actionId === 'install-module';
}

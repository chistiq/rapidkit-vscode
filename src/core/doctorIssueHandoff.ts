import type {
  DoctorIssueAIContext,
  DoctorProbe,
  ProjectEvidence,
} from '../ui/treeviews/doctorEvidenceProvider.js';
import type { DoctorFindingTarget } from './doctorEvidenceProjection.js';

export type DoctorIssueKind = 'issue' | 'probe' | 'policy-violation';

export interface DoctorIssueHandoffPayload {
  issue: string;
  kind: DoctorIssueKind;
  probe?: Pick<DoctorProbe, 'id' | 'label' | 'status' | 'reason' | 'recommendation'>;
  finding?: DoctorFindingTarget;
  workspacePath: string;
  workspaceName?: string;
  generatedAt?: string;
  healthScore?: DoctorIssueAIContext['healthScore'];
  systemVersions?: DoctorIssueAIContext['systemVersions'];
  project?: Pick<
    ProjectEvidence,
    'name' | 'path' | 'framework' | 'kit' | 'projectKind' | 'depsInstalled' | 'fixCommands'
  >;
}

export function buildDoctorIssueHandoffPayload(input: {
  issue: string;
  kind: DoctorIssueKind;
  evidence?: {
    workspacePath?: string;
    workspaceName?: string;
    generatedAt?: string;
    healthScore?: DoctorIssueAIContext['healthScore'];
    system?: { versions?: { core?: string; npm?: string } };
  };
  project?: ProjectEvidence;
  probe?: DoctorProbe;
  finding?: DoctorFindingTarget;
}): DoctorIssueHandoffPayload | null {
  const workspacePath = input.evidence?.workspacePath?.trim();
  if (!workspacePath || !input.issue.trim()) {
    return null;
  }

  const versions = input.evidence?.system?.versions;
  return {
    issue: input.issue.trim(),
    kind: input.kind,
    ...(input.probe
      ? {
          probe: {
            id: input.probe.id,
            label: input.probe.label,
            status: input.probe.status,
            reason: input.probe.reason,
            recommendation: input.probe.recommendation,
          },
        }
      : {}),
    ...(input.finding ? { finding: input.finding } : {}),
    workspacePath,
    workspaceName: input.evidence?.workspaceName,
    generatedAt: input.evidence?.generatedAt,
    healthScore: input.evidence?.healthScore,
    systemVersions:
      versions && (versions.core || versions.npm)
        ? {
            core: typeof versions.core === 'string' ? versions.core : undefined,
            npm: typeof versions.npm === 'string' ? versions.npm : undefined,
          }
        : undefined,
    ...(input.project
      ? {
          project: {
            name: input.project.name,
            path: input.project.path,
            framework: input.project.framework,
            kit: input.project.kit,
            projectKind: input.project.projectKind,
            depsInstalled: input.project.depsInstalled,
            fixCommands: input.project.fixCommands,
          },
        }
      : {}),
  };
}

function structuredDoctorContext(payload: DoctorIssueHandoffPayload): Record<string, unknown> {
  const source =
    payload.kind === 'policy-violation' ? 'workspace-governance-policy' : 'workspace-health';
  return {
    source,
    issue: payload.issue,
    kind: payload.kind,
    probe: payload.probe,
    finding: payload.finding,
    project: payload.project,
    workspace: {
      name: payload.workspaceName,
      path: payload.workspacePath,
      generatedAt: payload.generatedAt,
      healthScore: payload.healthScore,
      versions: payload.systemVersions,
    },
  };
}

function issueSourceLabel(payload: DoctorIssueHandoffPayload): string {
  if (payload.kind === 'policy-violation') {
    return 'Workspai Governance Policy';
  }
  return 'Workspai Doctor (Workspace Health)';
}

function issueHeading(payload: DoctorIssueHandoffPayload): string {
  if (payload.kind === 'policy-violation') {
    return 'Governance policy issue';
  }
  return 'Doctor issue';
}

function issueTaskIntro(payload: DoctorIssueHandoffPayload): string {
  if (payload.kind === 'policy-violation') {
    return 'You are Workspai Incident Studio. Diagnose and fix this workspace governance evidence issue with the smallest safe change set.';
  }
  return 'You are Workspai Incident Studio. Diagnose and fix this Workspace Health issue with the smallest safe change set.';
}

function issueEvidenceName(payload: DoctorIssueHandoffPayload): string {
  if (payload.kind === 'policy-violation') {
    return 'workspace verify/model evidence';
  }
  return 'doctor evidence';
}

export function buildDoctorIssueAdvisorQuestion(payload: DoctorIssueHandoffPayload): string {
  const framework = payload.project?.framework ?? 'unknown';
  const projectName = payload.project?.name ?? 'workspace';
  const lines = [
    `Project: ${projectName} (${framework})`,
    `Issue detected by ${issueSourceLabel(payload)}:`,
    payload.issue,
  ];

  if (payload.probe?.recommendation?.trim()) {
    lines.push(`Recommendation: ${payload.probe.recommendation.trim()}`);
  }
  if (payload.finding) {
    lines.push(
      `Canonical finding: ${payload.finding.id}`,
      ...(payload.finding.causalKey ? [`Causal key: ${payload.finding.causalKey}`] : []),
      ...(payload.finding.capabilityId
        ? [`Repair capability: ${payload.finding.capabilityId}`]
        : []),
      `Repair disposition: ${payload.finding.repairDisposition ?? 'unknown'}`
    );
  }
  if (payload.project?.fixCommands?.length) {
    lines.push(
      `Suggested fix commands:\n${payload.project.fixCommands.map((command) => `  ${command}`).join('\n')}`
    );
  }

  lines.push(
    `Doctor evidence (structured JSON):\n${JSON.stringify(structuredDoctorContext(payload), null, 2)}`
  );
  return lines.join('\n');
}

export function buildDoctorIssueStudioPrompt(payload: DoctorIssueHandoffPayload): string {
  const framework = payload.project?.framework ?? 'unknown';
  const projectName = payload.project?.name;
  const lines = [
    issueTaskIntro(payload),
    '',
    `## ${issueHeading(payload)}`,
    `- Issue: ${payload.issue}`,
    `- Kind: ${payload.kind}`,
    `- Workspace: ${payload.workspaceName || payload.workspacePath} (${payload.workspacePath})`,
  ];

  if (projectName) {
    lines.push(`- Project: ${projectName} (${payload.project?.path ?? 'unknown path'})`);
    lines.push(`- Framework: ${framework}`);
  }
  if (payload.probe?.label) {
    lines.push(
      `- Probe: ${payload.probe.label}${payload.probe.status ? ` (${payload.probe.status})` : ''}`
    );
  }
  if (payload.probe?.reason?.trim()) {
    lines.push(`- Reason: ${payload.probe.reason.trim()}`);
  }
  if (payload.finding) {
    lines.push(`- Canonical finding: ${payload.finding.id}`);
    if (payload.finding.causalKey) {
      lines.push(`- Causal key: ${payload.finding.causalKey}`);
    }
    if (payload.finding.capabilityId) {
      lines.push(`- Repair capability: ${payload.finding.capabilityId}`);
    }
    lines.push(`- Repair disposition: ${payload.finding.repairDisposition ?? 'unknown'}`);
  }
  if (payload.healthScore) {
    lines.push(
      `- Health score: ${payload.healthScore.passed}/${payload.healthScore.total} passed, ${payload.healthScore.warnings} warnings, ${payload.healthScore.errors} errors`
    );
  }
  if (payload.project?.fixCommands?.length) {
    lines.push('', '## Suggested fix commands');
    for (const command of payload.project.fixCommands) {
      lines.push(`- \`${command}\``);
    }
  }

  lines.push(
    '',
    '## Your task',
    `1. Identify the root cause using workspace intelligence and this ${issueEvidenceName(payload)}.`,
    '2. Propose the safest fix path (commands + file edits) without re-scanning the entire repository.',
    `3. Call out missing prerequisites if ${issueEvidenceName(payload)} is stale.`,
    '4. Return one recommended next action the operator can run immediately.',
    '',
    '## Structured context',
    '```json',
    JSON.stringify(structuredDoctorContext(payload), null, 2),
    '```'
  );

  return lines.join('\n');
}

export function buildDoctorIssueCopilotQuestion(payload: DoctorIssueHandoffPayload): string {
  const target = payload.project?.name
    ? `project "${payload.project.name}"`
    : `workspace "${payload.workspaceName || payload.workspacePath}"`;
  const issueName =
    payload.kind === 'policy-violation'
      ? 'Workspai governance policy issue'
      : 'Workspai Doctor issue';
  return [
    `Fix this ${issueName} for ${target}.`,
    `Work ONLY inside the Workspai workspace at \`${payload.workspacePath.replace(/\\/g, '/')}\`.`,
    payload.project?.path
      ? `Target project path: \`${payload.project.path.replace(/\\/g, '/')}\`.`
      : undefined,
    `Primary issue: ${payload.issue}`,
    payload.probe?.recommendation?.trim()
      ? `Recommendation: ${payload.probe.recommendation.trim()}`
      : undefined,
    `Use the attached workspace intelligence pack and ${issueEvidenceName(payload)} artifacts.`,
    'Do not re-explore sibling repos — start from this doctor issue and suggested fix commands.',
  ]
    .filter((line): line is string => Boolean(line))
    .join(' ');
}

export function resolveDoctorIssueHandoff(item?: unknown): DoctorIssueHandoffPayload | null {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const record = item as { issueHandoff?: DoctorIssueHandoffPayload };
  return record.issueHandoff ?? null;
}

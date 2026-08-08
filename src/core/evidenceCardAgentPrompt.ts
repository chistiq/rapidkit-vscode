import type { DashboardEvidenceCard } from './dashboardEvidenceBridge.js';
import { resolveDashboardCommandExecutionPlan } from './dashboardCommandExecutionPlan.js';
import { resolveDashboardCommandForEvidenceCard } from './dashboardReportRegistry.js';
import { buildStudioSourceCommandForCard } from './studioCardSourceShell.js';
import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';
import {
  buildAgentPackHandoffSummaryLines,
  buildStandardAnswerContractPromptLines,
  readAgentCustomizationPackReport,
  summarizeAgentCustomizationPack,
} from './agentCustomizationPack.js';
import {
  buildWorkspaceImpactPromptSection,
  readWorkspaceImpactReport,
  type WorkspaceImpactReport,
} from './workspaceImpactReader.js';
import { AGENT_CUSTOMIZATION_PACK_REPORT_PATH } from './workspaceIntelligencePaths.js';

function toPosixPath(absolutePath: string): string {
  return absolutePath.replace(/\\/g, '/');
}

function buildCardSpecificStudioGuidance(
  card: NonNullable<EvidenceCardAgentContextInput['card']>
): string[] {
  switch (card.id) {
    case 'workspaceImpact':
      return [
        '',
        '## Impact card semantics',
        '- This card measures blast-radius / drift from the workspace model diff — not doctor health or test pass/fail.',
        '- `affectedProjects: 0` with many workspace-level items usually means git-untracked governance files (AGENTS.md, Copilot/Cursor hooks) after agent-sync — not a broken atlas-api project.',
        '- Do NOT delete `workspace-impact-last-run.json` and do NOT run `workspai doctor` to fix this card — doctor does not regenerate impact.',
        '- Prefer: inspect workspace-level samples in the impact artifact, then either commit the expected grounding files or refresh baseline via snapshot + diff + impact.',
        '- Recommended verify path: `npx workspai workspace verify --from-impact .workspai/reports/workspace-impact-last-run.json --json`.',
      ];
    case 'workspaceVerify':
      return [
        '',
        '## Verify card semantics',
        '- Use the linked impact artifact and verification plan — do not infer success from doctor alone.',
      ];
    case 'workspaceDiff':
      return [
        '',
        '## Diff card semantics',
        '- Diff compares current workspace model to a baseline snapshot/report. Refresh snapshot if the baseline is intentionally outdated.',
      ];
    default:
      return [];
  }
}

function buildWorkspaceImpactCardStudioSection(report: WorkspaceImpactReport | null): string {
  if (!report) {
    return [
      '',
      '## Impact artifact',
      '- Impact report missing on disk. Run: `npx workspai workspace impact --from .workspai/reports/workspace-model-diff-last-run.json --json`',
    ].join('\n');
  }

  return ['', '## Impact artifact excerpt', buildWorkspaceImpactPromptSection(report)].join('\n');
}

export type EvidenceCardAgentContextInput = {
  card?: Pick<
    DashboardEvidenceCard,
    | 'id'
    | 'label'
    | 'status'
    | 'summary'
    | 'scope'
    | 'artifactPath'
    | 'blockers'
    | 'blocking'
    | 'metrics'
  >;
  workspacePath: string;
  workspaceName?: string;
  projectPath?: string;
  projectName?: string;
  userQuestion?: string;
  blockerHandoff?: Pick<StudioBlockerHandoff, 'incidentSummary' | 'blockers' | 'blockerSignature'>;
};

function buildStudioIncidentPromptSection(
  handoff?: EvidenceCardAgentContextInput['blockerHandoff']
): string[] {
  const summary = handoff?.incidentSummary;
  if (!summary) {
    return [];
  }
  const lines = [
    '',
    '## Incident summary',
    `- Title: ${summary.title}`,
    `- Phase: ${summary.phase}`,
    `- Primary action: ${summary.primaryAction}`,
    `- Verify required: ${summary.verifyRequired ? 'yes' : 'no'}`,
    `- Audit status: ${summary.auditStatus}`,
  ];
  if (handoff?.blockerSignature?.trim()) {
    lines.push(`- Blocker signature: ${handoff.blockerSignature.trim()}`);
  }
  if (handoff?.blockers?.length) {
    lines.push('- Active blockers:');
    for (const blocker of handoff.blockers.slice(0, 6)) {
      if (blocker.trim()) {
        lines.push(`  - ${blocker.trim()}`);
      }
    }
  }
  return lines;
}

export function buildEvidenceCardStudioPrompt(input: EvidenceCardAgentContextInput): string {
  const { card, workspacePath, workspaceName, projectPath, projectName } = input;
  if (!card) {
    return [
      'You are Workspai Incident Studio. Use the loaded workspace intelligence to help the operator.',
      '',
      `- Workspace: ${workspaceName || workspacePath} (${workspacePath})`,
      input.userQuestion?.trim()
        ? `\n## Operator question\n${input.userQuestion.trim()}`
        : '\nSummarize blockers and propose the safest next actions.',
    ].join('\n');
  }
  const commandId = resolveDashboardCommandForEvidenceCard(card.id);
  const commandPlan = commandId ? resolveDashboardCommandExecutionPlan(commandId) : undefined;
  const blockers = card.blockers ?? [];
  const stderrTail =
    typeof card.metrics?.stderrTail === 'string' ? card.metrics.stderrTail.trim() : '';
  const exitCode =
    typeof card.metrics?.exitCode === 'number' ? String(card.metrics.exitCode) : undefined;

  const lines = [
    'You are Workspai Incident Studio. Diagnose and fix this workspace evidence issue with the smallest safe change set.',
    '',
    '## Evidence card',
    `- Card: ${card.label} (${card.id})`,
    `- Status: ${card.status}`,
    `- Scope: ${card.scope}`,
    `- Summary: ${card.summary.trim() || 'No summary'}`,
    `- Workspace: ${workspaceName || workspacePath} (${workspacePath})`,
  ];

  if (projectPath) {
    lines.push(`- Project: ${projectName || projectPath} (${projectPath})`);
  }
  if (commandId) {
    lines.push(`- Source command: ${commandId}`);
  }
  if (commandPlan?.cliArgs.length) {
    lines.push(`- Workspai CLI: npx workspai ${commandPlan.cliArgs.join(' ')}`);
  }
  if (commandPlan?.executionChannel) {
    lines.push(`- Execution channel: ${commandPlan.executionChannel}`);
  }
  if (commandPlan?.capabilityRequirement) {
    lines.push(`- Capability gate: ${commandPlan.capabilityRequirement.label}`);
  }
  if (commandPlan?.safetyPolicy) {
    lines.push(`- Command risk: ${commandPlan.safetyPolicy.risk}`);
    if (commandPlan.safetyPolicy.confirmation) {
      lines.push(`- Requires confirmation: ${commandPlan.safetyPolicy.confirmation.confirmLabel}`);
    }
    if (commandPlan.safetyPolicy.refreshCommands?.length) {
      lines.push(
        `- Refresh after run: ${commandPlan.safetyPolicy.refreshCommands
          .map((command) => `npx workspai ${command.join(' ')}`)
          .join(' ; ')}`
      );
    }
  }
  if (card.artifactPath?.trim()) {
    lines.push(`- Artifact: ${card.artifactPath.trim()}`);
  }
  if (exitCode) {
    lines.push(`- Last exit code: ${exitCode}`);
  }

  if (blockers.length > 0) {
    lines.push('', '## Blockers');
    for (const blocker of blockers.slice(0, 12)) {
      lines.push(`- ${blocker}`);
    }
  }

  lines.push(...buildStudioIncidentPromptSection(input.blockerHandoff));

  if (stderrTail) {
    lines.push('', '## Recent stderr (tail)', '```', stderrTail.slice(0, 1200), '```');
  }

  lines.push(
    '',
    '## Your task',
    '1. Identify the root cause using the attached workspace intelligence and this card evidence.',
    '2. Propose the safest fix path (commands + file edits) without re-scanning the entire repository.',
    '3. Call out any missing prerequisite command if evidence is stale or incomplete.',
    `4. Prefer the mapped source command when refreshing this evidence: \`${buildStudioSourceCommandForCard(card.id)}\`.`,
    '5. Return one recommended next action the operator can run immediately.'
  );

  lines.push(...buildCardSpecificStudioGuidance(card));

  return lines.join('\n');
}

function buildAgentPackStudioSection(packLines: string[], packFileRef: string | undefined): string {
  const lines = ['', '## Agent customization pack'];
  if (packFileRef) {
    lines.push(`- Pack report: ${packFileRef}`);
  }
  for (const entry of packLines) {
    lines.push(`- ${entry}`);
  }
  lines.push('', ...buildStandardAnswerContractPromptLines());
  return lines.join('\n');
}

export async function buildEvidenceCardStudioPromptEnriched(
  input: EvidenceCardAgentContextInput
): Promise<string> {
  const base = buildEvidenceCardStudioPrompt(input);
  const agentPack = await readAgentCustomizationPackReport(input.workspacePath);
  const agentPackSummary = agentPack ? summarizeAgentCustomizationPack(agentPack) : null;
  const packSection = buildAgentPackStudioSection(
    buildAgentPackHandoffSummaryLines(agentPack, agentPackSummary),
    `#file:${input.workspacePath.replace(/\\/g, '/')}/${AGENT_CUSTOMIZATION_PACK_REPORT_PATH}`
  );

  if (input.card?.id !== 'workspaceImpact') {
    return [base, packSection].join('\n');
  }

  const report = await readWorkspaceImpactReport(input.workspacePath);
  return [base, packSection, buildWorkspaceImpactCardStudioSection(report)].join('\n');
}

export function buildEvidenceCardCopilotQuestion(input: EvidenceCardAgentContextInput): string {
  if (input.userQuestion?.trim()) {
    return input.userQuestion.trim();
  }
  if (!input.card) {
    return 'Summarize this workspace using the attached intelligence pack and list the safest next Workspai commands.';
  }
  const statusLabel =
    input.card.status === 'fail'
      ? 'blocked'
      : input.card.status === 'warn'
        ? 'needs attention'
        : input.card.status;
  return [
    `Fix the ${statusLabel} Workspai evidence issue for "${input.card.label}".`,
    `Work ONLY inside the Workspai workspace at \`${toPosixPath(input.workspacePath)}\`.`,
    input.projectPath ? `Target project path: \`${toPosixPath(input.projectPath)}\`.` : undefined,
    'Use the attached workspace intelligence pack and evidence artifacts (absolute #file paths).',
    'Do not re-explore the whole VS Code workspace or sibling repos — start from the blockers and artifact paths below.',
    input.card.blockers?.[0]
      ? `Primary blocker: ${input.card.blockers[0]}`
      : `Summary: ${input.card.summary}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join(' ');
}

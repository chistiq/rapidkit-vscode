import fs from 'fs-extra';
import path from 'path';

import type { DashboardEvidenceCard } from './dashboardEvidenceBridge.js';
import {
  buildAgentPackHandoffSummaryLines,
  buildStandardAnswerContractPromptLines,
  readAgentCustomizationPackReport,
  summarizeAgentCustomizationPack,
  type AgentCustomizationPackReport,
  type AgentCustomizationPackSummary,
} from './agentCustomizationPack.js';
import {
  buildEvidenceCardCopilotQuestion,
  type EvidenceCardAgentContextInput,
} from './evidenceCardAgentPrompt.js';
import {
  AGENT_GROUNDING_DOC_PATH,
  AGENT_CUSTOMIZATION_PACK_REPORT_PATH,
  AGENT_REPORTS_INDEX_PATH,
  AGENTS_MD_PATH,
  RAPIDKIT_MCP_DESIGN_REPORT_PATH,
  WORKSPACE_CONTEXT_AGENT_REPORT_PATH,
  WORKSPACE_CONTRACT_VERIFY_REPORT_PATH,
  WORKSPACE_EXPLAIN_REPORT_PATH,
  WORKSPACE_HISTORY_PATH,
  WORKSPACE_IMPACT_REPORT_PATH,
  WORKSPACE_MODEL_REPORT_PATH,
  WORKSPACE_MODEL_DIFF_REPORT_PATH,
  WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH,
  WORKSPACE_TRACE_REPORT_PATH,
  WORKSPACE_VERIFY_REPORT_PATH,
  WORKSPACE_WHY_REPORT_PATH,
  WORKSPACE_SKILLS_INDEX_PATH,
} from './workspaceIntelligencePaths.js';

export type EvidenceAgentAttachment = {
  relativePath: string;
  label: string;
  required: boolean;
  exists: boolean;
  validity?: 'valid' | 'invalid' | 'uncontracted' | 'missing';
  validationError?: string;
};

export type EvidenceAgentContextBundle = {
  workspacePath: string;
  workspaceName?: string;
  projectPath?: string;
  projectName?: string;
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
  attachments: EvidenceAgentAttachment[];
  missingRequired: string[];
  summaryLines: string[];
  agentPack?: AgentCustomizationPackReport | null;
  agentPackSummary?: AgentCustomizationPackSummary | null;
  copilotQuestion: string;
};

const INTELLIGENCE_ATTACHMENTS: Array<{ relativePath: string; label: string; required: boolean }> =
  [
    {
      relativePath: '.workspai/reports/doctor-remediation-plan-last-run.json',
      label: 'Doctor remediation plan',
      required: false,
    },
    {
      relativePath: '.workspai/reports/artifact-remediation-plan-last-run.json',
      label: 'Artifact remediation plan',
      required: false,
    },
    {
      relativePath: '.workspai/reports/doctor-fix-result-last-run.json',
      label: 'Doctor fix result',
      required: false,
    },
    {
      relativePath: '.workspai/reports/analyze-last-run.json',
      label: 'Analyze evidence',
      required: false,
    },
    {
      relativePath: AGENT_REPORTS_INDEX_PATH,
      label: 'Agent reports index',
      required: false,
    },
    {
      relativePath: WORKSPACE_CONTEXT_AGENT_REPORT_PATH,
      label: 'Agent context pack',
      required: true,
    },
    {
      relativePath: AGENT_CUSTOMIZATION_PACK_REPORT_PATH,
      label: 'Agent customization pack',
      required: false,
    },
    {
      relativePath: WORKSPACE_MODEL_REPORT_PATH,
      label: 'Workspace model graph',
      required: false,
    },
    {
      relativePath: WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH,
      label: 'Workspace model snapshot',
      required: false,
    },
    {
      relativePath: WORKSPACE_MODEL_DIFF_REPORT_PATH,
      label: 'Workspace model diff',
      required: false,
    },
    {
      relativePath: WORKSPACE_IMPACT_REPORT_PATH,
      label: 'Workspace impact analysis',
      required: false,
    },
    {
      relativePath: WORKSPACE_VERIFY_REPORT_PATH,
      label: 'Workspace verify report',
      required: false,
    },
    {
      relativePath: WORKSPACE_EXPLAIN_REPORT_PATH,
      label: 'Workspace explain report',
      required: false,
    },
    {
      relativePath: WORKSPACE_WHY_REPORT_PATH,
      label: 'Workspace why report',
      required: false,
    },
    {
      relativePath: WORKSPACE_TRACE_REPORT_PATH,
      label: 'Workspace trace report',
      required: false,
    },
    {
      relativePath: WORKSPACE_CONTRACT_VERIFY_REPORT_PATH,
      label: 'Workspace contract verify report',
      required: false,
    },
    {
      relativePath: WORKSPACE_HISTORY_PATH,
      label: 'Workspace intelligence history',
      required: false,
    },
    {
      relativePath: WORKSPACE_SKILLS_INDEX_PATH,
      label: 'Operational skills index',
      required: false,
    },
    {
      relativePath: RAPIDKIT_MCP_DESIGN_REPORT_PATH,
      label: 'MCP tool design',
      required: false,
    },
    {
      relativePath: AGENT_GROUNDING_DOC_PATH,
      label: 'Agent grounding guide',
      required: false,
    },
    {
      relativePath: AGENTS_MD_PATH,
      label: 'Cross-tool AGENTS hub',
      required: false,
    },
  ];

function toPosixPath(absolutePath: string): string {
  return absolutePath.replace(/\\/g, '/');
}

function attachmentFileRef(workspacePath: string, relativePath: string): string {
  return `#file:${toPosixPath(path.join(workspacePath, relativePath))}`;
}

function relativeArtifactPath(workspacePath: string, artifactPath?: string): string | undefined {
  if (!artifactPath?.trim()) {
    return undefined;
  }
  const normalizedWorkspace = workspacePath.replace(/\\/g, '/');
  const normalizedArtifact = artifactPath.trim().replace(/\\/g, '/');
  if (normalizedArtifact.startsWith(`${normalizedWorkspace}/`)) {
    return normalizedArtifact.slice(normalizedWorkspace.length + 1);
  }
  if (!path.isAbsolute(artifactPath)) {
    return normalizedArtifact.replace(/^\.?\//, '');
  }
  return undefined;
}

export async function buildEvidenceAgentContextBundle(
  input: EvidenceCardAgentContextInput
): Promise<EvidenceAgentContextBundle> {
  const attachments: EvidenceAgentAttachment[] = [];
  const missingRequired: string[] = [];

  for (const entry of INTELLIGENCE_ATTACHMENTS) {
    const absolutePath = path.join(input.workspacePath, entry.relativePath);
    const exists = await fs.pathExists(absolutePath);
    attachments.push({
      relativePath: entry.relativePath,
      label: entry.label,
      required: entry.required,
      exists,
    });
    if (entry.required && !exists) {
      missingRequired.push(entry.relativePath);
    }
  }

  // INDEX.json is the CLI-authored consumer manifest. Merge its complete,
  // ordered report catalog instead of forcing every extension consumer to
  // maintain a second artifact registry.
  let reportReadOrder: string[] = [];
  try {
    const indexPath = path.join(input.workspacePath, AGENT_REPORTS_INDEX_PATH);
    const index = (await fs.readJson(indexPath)) as {
      readOrder?: unknown;
      reports?: unknown;
    };
    reportReadOrder = Array.isArray(index.readOrder)
      ? index.readOrder.filter((entry): entry is string => typeof entry === 'string')
      : [];
    const reports = Array.isArray(index.reports) ? index.reports : [];
    for (const rawReport of reports) {
      if (!rawReport || typeof rawReport !== 'object' || Array.isArray(rawReport)) {
        continue;
      }
      const report = rawReport as Record<string, unknown>;
      if (typeof report.path !== 'string' || !report.path.trim()) {
        continue;
      }
      const relativePath = report.path.replace(/\\/g, '/').replace(/^\.\//, '');
      const absolutePath = path.resolve(input.workspacePath, relativePath);
      const workspaceRelative = path.relative(path.resolve(input.workspacePath), absolutePath);
      if (workspaceRelative.startsWith('..') || path.isAbsolute(workspaceRelative)) {
        continue;
      }
      const exists = await fs.pathExists(absolutePath);
      const required = report.required === true;
      const validity =
        report.validity === 'valid' ||
        report.validity === 'invalid' ||
        report.validity === 'uncontracted' ||
        report.validity === 'missing'
          ? report.validity
          : undefined;
      // INDEX.json is the canonical catalog, but an older producer could write
      // it immediately before creating workspace-skills-index.json. Reconcile
      // that known stale `missing` observation with current disk state so a
      // present artifact cannot prevent Studio from reaching AI repair.
      const reconciledValidity = validity === 'missing' && exists ? undefined : validity;
      const descriptor: EvidenceAgentAttachment = {
        relativePath,
        label:
          typeof report.label === 'string' && report.label.trim()
            ? report.label.trim()
            : relativePath,
        required,
        exists,
        ...(reconciledValidity ? { validity: reconciledValidity } : {}),
        ...(typeof report.validationError === 'string' && report.validationError.trim()
          ? { validationError: report.validationError.trim() }
          : {}),
      };
      const existingIndex = attachments.findIndex(
        (attachment) => attachment.relativePath === relativePath
      );
      if (existingIndex >= 0) {
        attachments[existingIndex] = descriptor;
      } else {
        attachments.push(descriptor);
      }
      if (required && (!exists || validity === 'invalid')) {
        missingRequired.push(relativePath);
      }
    }
  } catch {
    // The static baseline above remains available when an older workspace has
    // not generated the contract-backed reports index yet.
  }

  if (reportReadOrder.length > 0) {
    const order = new Map(reportReadOrder.map((relativePath, index) => [relativePath, index]));
    attachments.sort(
      (left, right) =>
        (order.get(left.relativePath) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(right.relativePath) ?? Number.MAX_SAFE_INTEGER)
    );
  }

  const cardArtifactRelative = relativeArtifactPath(input.workspacePath, input.card?.artifactPath);
  if (cardArtifactRelative) {
    const exists = await fs.pathExists(path.join(input.workspacePath, cardArtifactRelative));
    attachments.push({
      relativePath: cardArtifactRelative,
      label: `${input.card?.label ?? 'Evidence'} artifact`,
      required: false,
      exists,
    });
  }

  const agentPack = await readAgentCustomizationPackReport(input.workspacePath);
  const agentPackSummary = agentPack ? summarizeAgentCustomizationPack(agentPack) : null;

  const summaryLines = [
    `Workspace: ${input.workspaceName || path.basename(input.workspacePath)} (${toPosixPath(input.workspacePath)})`,
    input.projectPath
      ? `Project: ${input.projectName || path.basename(input.projectPath)} (${toPosixPath(input.projectPath)})`
      : undefined,
    input.card
      ? `Evidence: ${input.card.label} (${input.card.status}) — ${input.card.summary}`
      : undefined,
    ...(input.card?.blockers ?? []).slice(0, 8).map((blocker) => `Blocker: ${blocker}`),
    missingRequired.length > 0
      ? `Missing or invalid intelligence: ${Array.from(new Set(missingRequired)).join(', ')} (run workspace context/model first)`
      : undefined,
    ...buildAgentPackHandoffSummaryLines(agentPack, agentPackSummary),
  ].filter((line): line is string => Boolean(line));

  return {
    workspacePath: input.workspacePath,
    workspaceName: input.workspaceName,
    projectPath: input.projectPath,
    projectName: input.projectName,
    card: input.card,
    attachments,
    missingRequired: Array.from(new Set(missingRequired)),
    summaryLines,
    agentPack,
    agentPackSummary,
    copilotQuestion: buildEvidenceCardCopilotQuestion(input),
  };
}

export function buildSendToCopilotPrompt(bundle: EvidenceAgentContextBundle): string {
  const workspaceRoot = toPosixPath(bundle.workspacePath);
  const fileLines = bundle.attachments
    .filter((attachment) => attachment.exists)
    .map((attachment) => attachmentFileRef(bundle.workspacePath, attachment.relativePath));

  const contextLines = [
    '## Workspai workspace root (READ THIS FIRST)',
    `- Absolute path: \`${workspaceRoot}\``,
    '- All evidence artifacts live under this directory. The VS Code multi-root folder may differ — trust this path.',
    '- Run shell commands with `cwd` set to this path. Do not edit sibling repositories unless they are registered projects inside this workspace.',
    ...(bundle.projectPath
      ? [
          '',
          '## Target project',
          `- Absolute path: \`${toPosixPath(bundle.projectPath)}\``,
          `- Name: ${bundle.projectName || path.basename(bundle.projectPath)}`,
        ]
      : []),
    '',
    '@workspace',
    ...fileLines,
    '',
    '## Workspai intelligence handoff',
    ...bundle.summaryLines.map((line) => `- ${line}`),
  ];

  if (bundle.card?.blockers?.length) {
    contextLines.push('', '## Blockers');
    for (const blocker of bundle.card.blockers.slice(0, 12)) {
      contextLines.push(`- ${blocker}`);
    }
  }

  const stderrTail =
    typeof bundle.card?.metrics?.stderrTail === 'string'
      ? bundle.card.metrics.stderrTail.trim()
      : '';
  if (stderrTail) {
    contextLines.push('', '## stderr tail', '```', stderrTail.slice(0, 1200), '```');
  }

  contextLines.push('', ...buildStandardAnswerContractPromptLines());
  contextLines.push('', bundle.copilotQuestion);

  return contextLines.join('\n');
}

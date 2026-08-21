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
  AGENT_REPORTS_INDEX_PATH,
  AGENTS_MD_PATH,
  WORKSPACE_CONTEXT_AGENT_REPORT_PATH,
} from './workspaceIntelligencePaths.js';
import {
  WORKSPAI_RUNTIME_REPORT_ARTIFACTS,
  workspaceArtifactLabel,
} from './workspaceIntelligenceArtifactCatalog.js';
import { getWorkspaceIntelligenceAgentReadOrder } from './workspaceIntelligenceChainContract.js';
import { readWorkspaceSkillsIndexArtifact } from './workspaceSkillsIndexReader.js';

export type EvidenceAgentAttachment = {
  relativePath: string;
  label: string;
  required: boolean;
  exists: boolean;
  validity?: 'valid' | 'invalid' | 'uncontracted' | 'missing';
  validationError?: string;
  /** False keeps an artifact tool-readable without preloading it into prompts. */
  promptEligible?: boolean;
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

const CONTRACT_ARTIFACT_PATHS = new Set(
  WORKSPAI_RUNTIME_REPORT_ARTIFACTS.map((artifact) => artifact.artifactPath)
);

const INTELLIGENCE_ATTACHMENTS: Array<{ relativePath: string; label: string; required: boolean }> =
  [
    ...getWorkspaceIntelligenceAgentReadOrder().map((relativePath) => ({
      relativePath,
      label: CONTRACT_ARTIFACT_PATHS.has(relativePath)
        ? workspaceArtifactLabel(relativePath)
        : relativePath === '.workspai/goals/index.json'
          ? 'Active Goal index'
          : relativePath === '.workspai/reports/goal-pack-last-run.json'
            ? 'Latest Goal Pack'
            : workspaceArtifactLabel(relativePath),
      // Preserve the 0.61 compatibility floor. A live INDEX from newer CLIs
      // can strengthen the required set below.
      required: relativePath === WORKSPACE_CONTEXT_AGENT_REPORT_PATH,
    })),
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

function normalizedSearchTokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && token !== 'workspai' && token !== 'workspace');
}

function operationalSkillScore(input: { skillId: string; title: string; query: string }): number {
  const query = input.query.toLowerCase();
  return [...new Set(normalizedSearchTokens(`${input.skillId} ${input.title}`))].reduce(
    (score, token) => score + (query.includes(token) ? 1 : 0),
    0
  );
}

export async function buildEvidenceAgentContextBundle(
  input: EvidenceCardAgentContextInput
): Promise<EvidenceAgentContextBundle> {
  const attachments: EvidenceAgentAttachment[] = [];
  const missingRequired: string[] = [];
  const matchedOperationalSkills: string[] = [];

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
      if (reportReadOrder.length > 0 && !reportReadOrder.includes(relativePath)) {
        continue;
      }
      const absolutePath = path.resolve(input.workspacePath, relativePath);
      const workspaceRelative = path.relative(path.resolve(input.workspacePath), absolutePath);
      if (workspaceRelative.startsWith('..') || path.isAbsolute(workspaceRelative)) {
        continue;
      }
      const exists = await fs.pathExists(absolutePath);
      const existingIndex = attachments.findIndex(
        (attachment) => attachment.relativePath === relativePath
      );
      // A live INDEX may strengthen the bundled baseline, but it cannot
      // downgrade a report the extension requires for grounded AI actions.
      const required =
        report.required === true ||
        (existingIndex >= 0 && attachments[existingIndex]?.required === true);
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

  // Operational Skills are generated from the live workspace model. Authorize
  // every safe indexed Skill for on-demand inspection, but preload only the
  // three most relevant Skills so a large polyglot workspace stays bounded.
  try {
    const skillsIndexResult = await readWorkspaceSkillsIndexArtifact(input.workspacePath);
    const skillsIndex = skillsIndexResult.kind === 'valid' ? skillsIndexResult.index : null;
    const query = [
      input.userQuestion,
      input.card?.label,
      input.card?.summary,
      ...(input.card?.blockers ?? []),
    ]
      .filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
      .join(' ');
    const skills = (skillsIndex?.skills ?? [])
      .flatMap((value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return [];
        }
        const skill = value as Record<string, unknown>;
        if (
          typeof skill.skillId !== 'string' ||
          typeof skill.path !== 'string' ||
          typeof skill.title !== 'string' ||
          !/^\.workspai\/skills\/[a-z0-9][a-z0-9-]*\.md$/.test(skill.path)
        ) {
          return [];
        }
        return [
          {
            skillId: skill.skillId,
            relativePath: skill.path,
            title: skill.title,
            score: operationalSkillScore({
              skillId: skill.skillId,
              title: skill.title,
              query,
            }),
          },
        ];
      })
      .sort((left, right) => right.score - left.score || left.skillId.localeCompare(right.skillId));
    const selected = new Set(
      skills
        .filter((skill) => skill.score > 0)
        .slice(0, 3)
        .map((skill) => skill.relativePath)
    );
    for (const skill of skills) {
      const exists = await fs.pathExists(path.join(input.workspacePath, skill.relativePath));
      attachments.push({
        relativePath: skill.relativePath,
        label: `Operational skill: ${skill.title}`,
        required: false,
        exists,
        validity: exists ? 'valid' : 'missing',
        promptEligible: selected.has(skill.relativePath),
      });
      if (exists && selected.has(skill.relativePath)) {
        matchedOperationalSkills.push(`${skill.title} (${skill.relativePath})`);
      }
    }
  } catch {
    // Older CLI workspaces remain supported through the context artifact.
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
  if (
    cardArtifactRelative &&
    !attachments.some((attachment) => attachment.relativePath === cardArtifactRelative)
  ) {
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
    ...matchedOperationalSkills.map((skill) => `Relevant operational skill: ${skill}`),
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
    .filter((attachment) => attachment.exists && attachment.promptEligible !== false)
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

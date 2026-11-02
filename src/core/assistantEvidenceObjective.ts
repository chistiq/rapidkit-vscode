import {
  isAutonomousWorkspaiAssistantMode,
  type WorkspaiAssistantMode,
} from './assistantModeContract.js';
import {
  evidenceAttachmentLocator,
  type EvidenceAgentContextBundle,
} from './evidenceAgentContextBundle.js';
import type { EvidenceFreshnessAssessment } from './workspaceEvidenceFreshness.js';
import { STUDIO_INTELLIGENCE_USAGE_HINT } from './studioIntelligenceKnowledge.js';

/**
 * Ground every Assistant mode in the same CLI-authored artifact inventory.
 * The model receives paths and freshness posture, then reads only the smallest
 * relevant artifacts through the allowlisted inspect-evidence tool.
 */
export function buildAssistantEvidenceObjective(input: {
  task: string;
  assistantMode: WorkspaiAssistantMode;
  executionAuthority?: 'workspace';
  evidence: EvidenceAgentContextBundle;
  freshness: EvidenceFreshnessAssessment;
}): string {
  if (input.executionAuthority === 'workspace') {
    const present = input.evidence.attachments
      .filter((attachment) => attachment.exists)
      .map(evidenceAttachmentLocator);
    return [
      input.task,
      'Workspace-native task: inspect applicable repository instructions and relevant source, perform the requested change, test the result and review the diff. Workspai reports, an active Goal, generated skills and intelligence refresh are optional context, not prerequisites for an ordinary coding or scaffolding request.',
      'When the user delegates project type, stack or name, choose reasonable defaults and an unused directory, state the choice and proceed. Ask only for essential information that cannot be inferred safely. Use the Workspai CLI for a request to scaffold with Workspai: inspect its create command syntax, choose a supported kit, and use an available command or terminal tool. Never overwrite an existing project or bypass exact tool approvals.',
      ...(present.length
        ? [
            STUDIO_INTELLIGENCE_USAGE_HINT,
            `Optional existing intelligence: ${JSON.stringify({ freshness: input.freshness.verdict, locators: present.slice(0, 6), available: present.length, omitted: Math.max(0, present.length - 6) })}. Read locators only when relevant; availability is not freshness or execution authorization.`,
          ]
        : []),
    ].join('\n\n');
  }
  const availablePaths = input.evidence.attachments
    .filter((attachment) => attachment.exists)
    .map(evidenceAttachmentLocator);

  return [
    input.task,
    '',
    '## Workspai governed evidence',
    `Freshness: ${input.freshness.verdict} — ${input.freshness.reason}`,
    ...input.evidence.summaryLines.map((line) => `- ${line}`),
    `Tool-readable evidence artifacts: ${JSON.stringify(availablePaths)}`,
    input.evidence.missingRequired.length > 0
      ? `Missing required evidence: ${JSON.stringify(input.evidence.missingRequired)}`
      : 'Required agent context is present.',
    isAutonomousWorkspaiAssistantMode(input.assistantMode) && input.freshness.verdict !== 'fresh'
      ? 'Refresh the governed producer before relying on stale or missing evidence.'
      : 'Use inspect-evidence for the smallest relevant artifact set; do not infer artifact contents from filenames.',
    isAutonomousWorkspaiAssistantMode(input.assistantMode)
      ? 'You have full autonomy to resolve this request. Follow the CLI-authored canonical read order: begin with INDEX, the active Goal and Goal Pack when present, bounded workspace context, and the most relevant generated operational Skill. Use query-workspace-graph only for the smallest missing proof set; do not preload full model or graph exports. Inspect source only after grounding, apply changes through the CLI-owned repair transaction, verify the exact target, and complete within the intelligent loop.'
      : undefined,
    !isAutonomousWorkspaiAssistantMode(input.assistantMode) && input.freshness.verdict !== 'fresh'
      ? 'Ask and Plan are read-only: report the freshness limitation instead of presenting stale evidence as current truth.'
      : undefined,
  ]
    .filter((line): line is string => typeof line === 'string')
    .join('\n');
}

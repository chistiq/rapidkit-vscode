import {
  isAutonomousWorkspaiAssistantMode,
  type WorkspaiAssistantMode,
} from './assistantModeContract.js';
import type { EvidenceAgentContextBundle } from './evidenceAgentContextBundle.js';
import type { EvidenceFreshnessAssessment } from './workspaceEvidenceFreshness.js';

/**
 * Ground every Assistant mode in the same CLI-authored artifact inventory.
 * The model receives paths and freshness posture, then reads only the smallest
 * relevant artifacts through the allowlisted inspect-evidence tool.
 */
export function buildAssistantEvidenceObjective(input: {
  task: string;
  assistantMode: WorkspaiAssistantMode;
  evidence: EvidenceAgentContextBundle;
  freshness: EvidenceFreshnessAssessment;
}): string {
  const availablePaths = input.evidence.attachments
    .filter((attachment) => attachment.exists)
    .map((attachment) => attachment.relativePath);

  return [
    input.task,
    '',
    '## Workspai governed evidence',
    `Freshness: ${input.freshness.verdict} — ${input.freshness.reason}`,
    ...input.evidence.summaryLines.map((line) => `- ${line}`),
    `Available evidence artifacts: ${JSON.stringify(availablePaths)}`,
    input.evidence.missingRequired.length > 0
      ? `Missing required evidence: ${JSON.stringify(input.evidence.missingRequired)}`
      : 'Required agent context is present.',
    isAutonomousWorkspaiAssistantMode(input.assistantMode) && input.freshness.verdict !== 'fresh'
      ? 'Refresh the governed producer before relying on stale or missing evidence.'
      : 'Use inspect-evidence for the smallest relevant artifact set; do not infer artifact contents from filenames.',
    !isAutonomousWorkspaiAssistantMode(input.assistantMode) && input.freshness.verdict !== 'fresh'
      ? 'Ask and Plan are read-only: report the freshness limitation instead of presenting stale evidence as current truth.'
      : undefined,
  ]
    .filter((line): line is string => typeof line === 'string')
    .join('\n');
}

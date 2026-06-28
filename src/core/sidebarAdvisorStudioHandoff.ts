import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';

export function buildAdvisorStudioPrefill(input: {
  question?: string;
  answer?: string;
  blockerHandoff?: StudioBlockerHandoff;
  freshnessStatus?: string;
}): string {
  const handoff = input.blockerHandoff;
  const freshnessStatus = input.freshnessStatus?.trim() || 'unknown - verify before use';
  const lines = [
    '## Advisor → Studio handoff',
    'Context from Workspace Advisor (read-only). Studio owns mutating fix execution and verify.',
    '',
    '### Evidence contract',
    '- Advisor role: read-only explanation, plan, impact, risk, and next action.',
    '- Mutation boundary: Studio must run any fix, file edit, or verification.',
    `- Freshness: ${freshnessStatus}.`,
  ];
  if (handoff?.artifactPath?.trim()) {
    lines.push(`- Artifact: ${handoff.artifactPath.trim()}`);
  }
  if (handoff?.verifyArtifact?.trim()) {
    lines.push(`- Verify artifact: ${handoff.verifyArtifact.trim()}`);
  }
  if (handoff?.sourceCommand?.trim()) {
    lines.push(`- Source command: ${handoff.sourceCommand.trim()}`);
  }
  if (handoff?.verifyCommand?.trim()) {
    lines.push(`- Verify command: ${handoff.verifyCommand.trim()}`);
  }
  if (handoff?.scope) {
    lines.push(`- Scope: ${handoff.scope}`);
  }
  if (handoff?.blockerSignature?.trim()) {
    lines.push(`- Blocker signature: ${handoff.blockerSignature.trim()}`);
  }
  if (handoff?.blockers?.length) {
    lines.push('', '### Incident context');
    for (const blocker of handoff.blockers.slice(0, 8)) {
      if (blocker.trim()) {
        lines.push(`- ${blocker.trim()}`);
      }
    }
  }
  if (input.question?.trim()) {
    lines.push('', '### Advisor question', input.question.trim());
  }
  if (input.answer?.trim()) {
    lines.push('', '### Advisor plan', input.answer.trim());
  }
  lines.push(
    '',
    'Use this plan as context only. Apply fixes from Studio — do not duplicate advisor analysis or auto-run fixes from the advisor session.'
  );
  return lines.join('\n');
}

export function attachAdvisorHandoffSource(
  handoff: StudioBlockerHandoff | undefined
): StudioBlockerHandoff | undefined {
  if (!handoff) {
    return undefined;
  }
  return {
    ...handoff,
    handoffSource: 'advisor',
  };
}

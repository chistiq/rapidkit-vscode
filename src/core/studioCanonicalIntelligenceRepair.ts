import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';

const CANONICAL_INTELLIGENCE_REPORT =
  /(?:^|\/)\.workspai\/reports\/(?:workspace-model(?:-snapshot|-diff-last-run)?|workspace-impact-last-run|doctor-(?:last-run|project-last-run|capabilities|validation-last-run|receipt-last-run|workspace-cache)|workspace-contract-verify-last-run|analyze-last-run|release-readiness-last-run|workspace-verify-last-run|workspace-intelligence-history|workspace-context-agent|agent-customization-pack|workspace-skills-index|workspace-explain-last-run)\.json$/i;

export const STUDIO_CANONICAL_INTELLIGENCE_ARGS = [
  'workspace',
  'intelligence',
  'run',
  '--for-agent',
  'vscode',
  '--strict',
  '--json',
] as const;

export const STUDIO_CANONICAL_INTELLIGENCE_COMMAND = `npx workspai ${STUDIO_CANONICAL_INTELLIGENCE_ARGS.join(
  ' '
)}`;

export function shouldRunCanonicalIntelligenceRepair(handoff: StudioBlockerHandoff): boolean {
  if (handoff.cardId !== 'agentGrounding') {
    return false;
  }
  return handoff.blockers.some((blocker) => {
    const match = blocker.match(/stale report:\s*([^\s]+)/i);
    return Boolean(match?.[1] && CANONICAL_INTELLIGENCE_REPORT.test(match[1]));
  });
}

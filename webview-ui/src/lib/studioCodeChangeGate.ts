import type { StudioEvidenceSummary } from '@/components/StudioRedesign/state/studioState';
import type { StudioActionId } from '@/components/StudioRedesign/state/studioActions';
import { isStudioCodeChangeActionId } from '@/lib/incidentStudioCodeChangeActions';

export function resolveStudioCodeChangeActionBlockReason(
  actionId: StudioActionId,
  evidence?: StudioEvidenceSummary | null
): string | null {
  if (!isStudioCodeChangeActionId(actionId)) {
    return null;
  }

  if (!evidence?.generatedAt) {
    return 'Run workspace analyze first — governed fix and module actions require analyze evidence.';
  }

  if (evidence.verdict === 'blocked') {
    return 'Analyze evidence is blocked — resolve blockers before governed code changes.';
  }

  return null;
}

import { normalizeBlockerReason } from './incidentStudioBlockerText';
import type { IncidentReproPackEvidence } from './incidentStudioPayload';

export const MEMORY_INFLUENCE_TIMELINE_HEADING = 'Memory influence timeline';

export function formatReproPackSensitivityLabel(
  label: IncidentReproPackEvidence['sensitivityLabel'] | undefined
): string {
  return (label || 'internal').toUpperCase();
}

export function buildReplayQueryFromIncidentReproPack(
  reproPack: IncidentReproPackEvidence
): string {
  const replay = reproPack.replayPayload;
  const verifyList =
    replay.verifyChecklist.length > 0
      ? replay.verifyChecklist.map((item, index) => `${index + 1}. ${item}`).join('\n')
      : '1. Run deterministic verification checks for this flow.';
  const blockedReasons =
    replay.blockedReasons.length > 0
      ? replay.blockedReasons
          .map((item, index) => `${index + 1}. ${normalizeBlockerReason(item)}`)
          .join('\n')
      : '1. No blocked reasons were captured in this pack.';
  const relatedFiles =
    replay.relatedFiles.length > 0 ? replay.relatedFiles.join(', ') : 'none captured';

  return [
    'Replay this imported incident repro pack inside Incident Studio.',
    `Pack ID: ${reproPack.packId}`,
    `Action type: ${replay.actionType}`,
    `Risk level: ${replay.riskLevel}`,
    replay.likelyFailureMode ? `Likely failure mode: ${replay.likelyFailureMode}` : null,
    `Related files: ${relatedFiles}`,
    'Blocked reasons:',
    blockedReasons,
    'Verification checklist:',
    verifyList,
    'Return one safe next step and an explicit verify command.',
  ]
    .filter((line): line is string => Boolean(line && line.trim().length > 0))
    .join('\n');
}

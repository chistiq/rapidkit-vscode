export type BlockerSeverity = 'hard' | 'soft';

export function normalizeBlockerReason(raw: string): string {
  let text = raw.trim();

  text = text.replace(/^Verify-path completion/, 'Verify evidence completion');
  text = text.replace(/^False-confidence rate/, 'Unrecovered verification failures');
  text = text.replace(/^Rollback recovery/, 'Rollback success rate');
  text = text.replace(/^Repeat verified resolution/, 'Resolution pattern reuse');
  text = text.replace(/is below threshold/g, 'below target');
  text = text.replace(/is above threshold/g, 'above target');

  if (text && !text.endsWith('.')) {
    text = `${text}.`;
  }

  return text;
}

export function classifyBlockerSeverity(
  blockerText: string,
  releaseReadinessBlockers: string[],
  verifyPackBlockers: string[]
): BlockerSeverity {
  const isFromReleaseReadiness = releaseReadinessBlockers.some(
    (reason) => normalizeBlockerReason(reason) === blockerText
  );
  const isFromVerifyPack = verifyPackBlockers.some(
    (reason) => normalizeBlockerReason(reason) === blockerText
  );

  if (isFromReleaseReadiness || isFromVerifyPack) {
    return 'hard';
  }

  return 'soft';
}

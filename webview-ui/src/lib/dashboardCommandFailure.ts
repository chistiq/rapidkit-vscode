import type {
  DashboardEvidenceCard,
  DashboardEvidenceCardId,
  DashboardEvidencePayload,
} from './dashboardEvidence';

export type DashboardCommandFailure = {
  command: string;
  reason: string;
  cardIds: DashboardEvidenceCardId[];
  exitCode?: number;
  stderrTail?: string;
  suggestedNextAction?: string;
  timestamp?: number;
};

export type DashboardCommandFailureMap = Partial<
  Record<DashboardEvidenceCardId, DashboardCommandFailure>
>;

function failureSummary(failure: DashboardCommandFailure): string {
  const exit = typeof failure.exitCode === 'number' ? `exit ${failure.exitCode}` : 'failed';
  return `Last run failed (${exit}). ${failure.suggestedNextAction ?? 'Open the evidence log or repair this card.'}`;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];
}

export function applyDashboardCommandFailureToCard(
  card: DashboardEvidenceCard,
  failure: DashboardCommandFailure
): DashboardEvidenceCard {
  const blockers = uniqueStrings([failure.reason, ...(card.blockers ?? [])]).slice(0, 12);
  return {
    ...card,
    status: 'fail',
    // A command invocation failure is an operational warning. Preserve an
    // already-proven gate blocker, but never manufacture a release blocker
    // solely because a refresh/run command exited non-zero.
    blocking: card.blocking ?? false,
    summary: failureSummary(failure),
    blockers,
    metrics: {
      ...(card.metrics ?? {}),
      commandId: failure.command,
      ...(typeof failure.exitCode === 'number' ? { exitCode: failure.exitCode } : {}),
      ...(failure.stderrTail ? { stderrTail: failure.stderrTail.slice(0, 1000) } : {}),
      failedRun: 1,
    },
    detailSections: [
      {
        id: `failed-run-${failure.command}`,
        title: 'Last command failure',
        body: [
          `command: ${failure.command}`,
          typeof failure.exitCode === 'number' ? `exitCode: ${failure.exitCode}` : undefined,
          `reason: ${failure.reason}`,
          failure.stderrTail ? `stderrTail: ${failure.stderrTail}` : undefined,
          failure.suggestedNextAction ? `next: ${failure.suggestedNextAction}` : undefined,
        ]
          .filter((line): line is string => Boolean(line))
          .join('\n'),
      },
      ...(card.detailSections ?? []),
    ],
  };
}

export function applyDashboardCommandFailures(
  payload: DashboardEvidencePayload | null,
  failures: DashboardCommandFailureMap
): DashboardEvidencePayload | null {
  if (!payload) {
    return payload;
  }
  const cards = payload.cards.map((card) => {
    const failure = failures[card.id];
    return failure ? applyDashboardCommandFailureToCard(card, failure) : card;
  });
  return { ...payload, cards };
}

export function successfulEvidenceCardIds(
  payload: DashboardEvidencePayload | null | undefined
): DashboardEvidenceCardId[] {
  return (payload?.cards ?? [])
    .filter(
      (card) =>
        card.status !== 'fail' &&
        card.status !== 'missing' &&
        Boolean(card.generatedAt || card.artifactPath)
    )
    .map((card) => card.id);
}

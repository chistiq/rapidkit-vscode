import { describeStudioExecutionReceipts } from './studioAgentExecutionEvidence.js';
import type { StudioAgentPersistedSession } from './studioAgentEvents.js';
import { localizeStudioOutcome } from './studioOutcomeLanguage.js';

/** A terminal answer is distinct from verified completion and survives provider failure. */
export function buildStudioIncompleteAnswer(
  session: StudioAgentPersistedSession,
  input: { reason: string; summary?: string; nextSteps?: string[]; cancelled?: boolean }
): string {
  const request = [...session.events].reverse().find((event) => event.type === 'request.started');
  const events = session.events.filter((event) => event.sequence > (request?.sequence ?? 0));
  const completed = session.taskLedger?.steps.filter((step) => step.status === 'completed') ?? [];
  const remaining = session.taskLedger?.steps.filter((step) => step.status !== 'completed') ?? [];
  const failed = [...events].reverse().find((event) => event.type === 'tool.failed');
  const delegated = [...events]
    .reverse()
    .find(
      (event) =>
        ['tool.completed', 'tool.failed'].includes(event.type) &&
        ['delegate-research', 'delegate-task'].includes(String(event.data.toolName))
    );
  const delegatedOutput = delegated?.data.output as
    | { results?: Array<{ answer?: unknown }>; answer?: string }
    | undefined;
  const findings =
    !input.summary && Array.isArray(delegatedOutput?.results)
      ? delegatedOutput.results
          .filter((result) => typeof result.answer === 'string')
          .slice(0, 3)
          .map((result) => String(result.answer).slice(0, 500))
          .join('\n')
      : !input.summary
        ? delegatedOutput?.answer?.slice(0, 1_500)
        : undefined;
  const transactionEvent = [...events].reverse().find((event) => {
    const output = event.data.output as { transaction?: { state?: unknown } } | undefined;
    return (
      (event.type === 'tool.completed' || event.type === 'tool.failed') &&
      typeof output?.transaction?.state === 'string'
    );
  });
  const transaction = transactionEvent?.data.output as
    | { transaction?: { state?: string } }
    | undefined;
  const mode = session.executionPolicy?.toolMode ?? session.assistantMode;
  if (mode === 'ask' || mode === 'plan') {
    return localizeStudioOutcome(
      session,
      [
        input.summary?.trim() ||
          (input.cancelled
            ? 'This question was cancelled before a final answer was ready.'
            : `I could not finish answering this question. ${input.reason.slice(0, 400)}`),
        findings ? `Research findings retained:\n${findings}` : undefined,
        !input.summary && failed
          ? `The last information source failed: ${String(failed.data.error ?? 'unavailable').slice(0, 200)}`
          : undefined,
        input.nextSteps?.length
          ? input.nextSteps.slice(0, 3).join('\n')
          : input.cancelled
            ? undefined
            : 'You can ask a narrower question or provide an authoritative source to continue.',
      ]
        .filter(Boolean)
        .join('\n\n')
    );
  }
  const parts = [
    input.cancelled ? 'This request was cancelled.' : 'This request remains incomplete.',
    input.summary?.trim().slice(0, 1_000),
    findings ? `Unverified research findings:\n${findings}` : undefined,
    describeStudioExecutionReceipts(session),
    `Reason: ${input.reason.slice(0, 400)}`,
    transaction?.transaction?.state
      ? `Latest source transaction: ${transaction.transaction.state}.`
      : undefined,
    completed.length
      ? `Completed steps: ${completed
          .slice(-3)
          .map((step) => step.description.slice(0, 100))
          .join('; ')}.`
      : undefined,
    !input.summary && failed
      ? `Last unsuccessful tool: ${String(failed.data.toolName ?? 'unknown')}. ${String(failed.data.error ?? '').slice(0, 200)}`
      : undefined,
    remaining.length
      ? `Remaining: ${remaining
          .slice(0, 3)
          .map((step) => step.description.slice(0, 100))
          .join('; ')}.`
      : undefined,
    input.nextSteps?.length
      ? `Next steps: ${input.nextSteps
          .slice(0, 3)
          .map((step) => step.slice(0, 160))
          .join('; ')}`
      : input.cancelled
        ? 'Review the retained work before starting another attempt.'
        : 'Review the reason above, then resume this session with the missing information or a different approach or model.',
    'No verified completion is claimed. Existing changes and verification obligations must be reviewed before claiming success.',
  ];
  return localizeStudioOutcome(session, parts.filter(Boolean).join('\n\n'));
}

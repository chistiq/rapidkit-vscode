import type { StudioAgentModelAction, StudioAgentModelContext } from './studioAgentSession.js';

export type StudioTaskCompletionReview = Array<{
  requirement: string;
  status: 'verified' | 'unresolved' | 'not-applicable';
  evidenceSequences: number[];
  detail: string;
}>;

export const STUDIO_TASK_COMPLETION_REVIEW_SCHEMA = {
  type: 'array',
  minItems: 1,
  maxItems: 16,
  description:
    'Account for every requested outcome and distinct failure in the original request, including secondary errors hidden by success messages. An unrelated passing check does not verify a requirement. List unresolved work honestly; explain any not-applicable item. This is agent assessment, not machine proof of semantic correctness.',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['requirement', 'status', 'evidenceSequences', 'detail'],
    properties: {
      requirement: { type: 'string', minLength: 1, maxLength: 300 },
      status: { type: 'string', enum: ['verified', 'unresolved', 'not-applicable'] },
      evidenceSequences: { type: 'array', maxItems: 8, items: { type: 'integer', minimum: 1 } },
      detail: { type: 'string', minLength: 1, maxLength: 500 },
    },
  },
} as const;

/** Validate references, never pretend that successful tools prove arbitrary user outcomes. */
export function reviewStudioTaskCompletion(
  summary: string,
  value: unknown,
  context: StudioAgentModelContext
): StudioAgentModelAction {
  const invalid = (): StudioAgentModelAction => ({
    type: 'message',
    text: 'Before completing, provide review for each requested outcome with status, detail and successful evidenceSequences from this request. Keep unresolved work explicit; tools remain available.',
  });
  if (!Array.isArray(value) || !value.length || value.length > 16) {
    return invalid();
  }
  const newest = [...context.session.events].reverse();
  const currentRequest =
    newest.find((event) => event.type === 'request.started')?.requestId ??
    newest.find((event) => event.requestId)?.requestId;
  const successful = new Set(
    context.session.events
      .filter(
        (event) =>
          event.requestId === currentRequest &&
          ['tool.completed', 'verify.completed'].includes(event.type) &&
          event.data.ok === true
      )
      .map((event) => event.sequence)
  );
  for (const receipt of context.session.activityLog ?? []) {
    if (
      receipt.requestId === currentRequest &&
      receipt.status === 'done' &&
      ['tool.completed', 'verify.completed'].includes(receipt.eventType)
    ) {
      successful.add(receipt.sequence);
    }
  }
  const review: StudioTaskCompletionReview = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return invalid();
    }
    const item = raw as Record<string, unknown>;
    if (
      Object.keys(item).some(
        (key) => !['requirement', 'status', 'evidenceSequences', 'detail'].includes(key)
      ) ||
      typeof item.requirement !== 'string' ||
      !item.requirement.trim() ||
      item.requirement.length > 300 ||
      typeof item.detail !== 'string' ||
      !item.detail.trim() ||
      item.detail.length > 500 ||
      !['verified', 'unresolved', 'not-applicable'].includes(String(item.status)) ||
      !Array.isArray(item.evidenceSequences) ||
      item.evidenceSequences.length > 8 ||
      item.evidenceSequences.some(
        (sequence) => !Number.isSafeInteger(sequence) || !successful.has(sequence)
      ) ||
      (item.status === 'verified' && !item.evidenceSequences.length)
    ) {
      return invalid();
    }
    review.push(item as unknown as StudioTaskCompletionReview[number]);
  }
  const key = (value: string) => value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
  for (const pending of context.session.requirementReview ?? []) {
    if (
      pending.status === 'unresolved' &&
      !review.some((entry) => key(entry.requirement) === key(pending.requirement))
    ) {
      review.push(pending);
    }
  }
  const unresolved = review.filter((item) => item.status === 'unresolved');
  return unresolved.length
    ? {
        type: 'feedback',
        review,
        text: `Completion is still open: ${unresolved.map((item) => `${item.requirement}: ${item.detail}`).join('; ')}. Continue applicable work with any available tool. If blocked, use workspai-report-outcome with actual effects and concrete next steps; do not claim verified completion.`,
      }
    : { type: 'complete', summary, review };
}

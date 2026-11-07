/** Public execution receipts, separate from model context and private reasoning. */
export const STUDIO_ACTIVITY_EVENTS = {
  'session.created': 'session',
  'session.status': 'session',
  'request.started': 'request',
  'request.steered': 'request',
  'workspace.target.bound': 'scope',
  'model.request.started': 'model',
  'model.request.progress': 'model',
  'model.request.finished': 'model',
  'model.message': 'narration',
  'model.resolved': 'model',
  'model.checkpoint': 'checkpoint',
  'tool.requested': 'tool',
  'tool.permission': 'permission',
  'tool.approval.requested': 'approval',
  'tool.approval.approved': 'approval',
  'tool.approval.rejected': 'approval',
  'tool.started': 'tool',
  'tool.progress': 'tool',
  'tool.completed': 'tool',
  'tool.failed': 'tool',
  'verify.completed': 'verification',
  'session.completed': 'outcome',
  'session.failed': 'outcome',
  'session.cancelled': 'outcome',
} as const;
export type StudioActivityEventType = keyof typeof STUDIO_ACTIVITY_EVENTS;
export type StudioActivityKind =
  | (typeof STUDIO_ACTIVITY_EVENTS)[StudioActivityEventType]
  | 'unknown';
export interface StudioActivityReceipt {
  eventId: string;
  eventType: string;
  sequence: number;
  sessionId: string;
  requestId?: string;
  invocationId?: string;
  timestamp: string;
  kind: StudioActivityKind;
  title: string;
  summary: string;
  status: 'running' | 'review' | 'done' | 'failed';
  durationMs?: number;
  unsupported?: boolean;
  /** Observation references only; never approval or execution grants. */
  toolName?: string;
  transactionId?: string;
  verificationAuthority?: 'workspace-evidence' | 'workspai-cli';
}
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown, limit = 800): string =>
  typeof value === 'string' ? value.slice(0, limit) : '';

export function studioActivityReceipt(value: unknown): StudioActivityReceipt | undefined {
  const event = record(value),
    data = record(event.data);
  if (typeof event.type !== 'string' || typeof event.sessionId !== 'string') {
    return undefined;
  }
  const kind = Object.prototype.hasOwnProperty.call(STUDIO_ACTIVITY_EVENTS, event.type)
    ? STUDIO_ACTIVITY_EVENTS[event.type as StudioActivityEventType]
    : 'unknown';
  const stage = event.type.split('.').at(-1);
  const tool = text(data.toolName, 160);
  let title = tool || event.type,
    summary = '',
    status: StudioActivityReceipt['status'] = 'done';
  switch (kind) {
    case 'model':
      title =
        stage === 'started'
          ? 'Requesting model response'
          : stage === 'progress'
            ? 'Receiving model response'
            : stage === 'finished'
              ? 'Model response received'
              : data.decisionId
                ? 'Model response received'
                : 'Model selected';
      status =
        stage === 'started' || stage === 'progress'
          ? 'running'
          : data.outcome === 'failed'
            ? 'failed'
            : data.outcome === 'cancelled'
              ? 'review'
              : 'done';
      if (data.outcome === 'failed') {
        title = 'Model request failed';
      }
      if (data.outcome === 'cancelled') {
        title = 'Model request cancelled';
      }
      summary =
        stage === 'resolved'
          ? [data.provider, data.modelId].filter((v) => typeof v === 'string').join(' · ')
          : text(data.summary);
      break;
    case 'narration':
      title = data.inputRequired ? 'Question for you' : 'Assistant update';
      summary = text(data.text);
      status = data.inputRequired ? 'review' : 'done';
      break;
    case 'checkpoint':
      title = data.retention === true ? 'Activity retention limit reached' : 'Progress checkpoint';
      summary = text(data.summary || data.reason || data.message);
      status = data.retention === true ? 'review' : 'done';
      break;
    case 'scope':
      title = data.kind === 'project' ? 'Project source selected' : 'Workspace selected';
      summary = text(data.name);
      break;
    case 'request':
      title = stage === 'steered' ? 'Instructions updated' : 'Request started';
      break;
    case 'session':
      title = 'Session state';
      summary = text(data.status);
      break;
    case 'outcome':
      title =
        stage === 'completed'
          ? data.verificationAuthority === 'workspace-evidence'
            ? 'Response ready'
            : 'Response completed'
          : stage === 'cancelled'
            ? 'Request stopped'
            : 'Request needs attention';
      status = stage === 'failed' ? 'failed' : stage === 'cancelled' ? 'review' : 'done';
      summary = text(data.error || data.reason);
      break;
    case 'approval':
      if (stage === 'rejected' && data.optional === true) {
        title = 'Optional onboarding skipped';
        status = 'done';
        summary = 'Continuing the original task without adopting or importing the project.';
        break;
      }
      title =
        stage === 'requested'
          ? 'Approval requested'
          : stage === 'approved'
            ? 'Approved'
            : 'Approval declined';
      status = stage === 'requested' ? 'review' : stage === 'rejected' ? 'review' : 'done';
      summary = text(data.summary || data.error);
      break;
    case 'permission':
      title = data.allowed === true ? 'Permission checked' : 'Permission required';
      status = data.allowed === true ? 'done' : 'review';
      summary = text(data.reason);
      break;
    case 'verification':
      title =
        data.ok === true && data.cardBlocking === false
          ? 'Verification passed'
          : 'Verification has remaining work';
      status = data.ok === true && data.cardBlocking === false ? 'done' : 'review';
      break;
    case 'tool':
      title = `${tool || 'Tool'} · ${stage}`;
      status = stage === 'failed' ? 'failed' : stage === 'completed' ? 'done' : 'running';
      summary = text(data.message || data.summary || data.error || data.reason);
      if (!summary) {
        const detail = [
          data.process,
          data.repair,
          data.subagent,
          data.browser,
          data.notebook,
          data.debug,
          data.task,
        ]
          .map(record)
          .find((value) => Object.keys(value).length);
        if (detail) {
          summary = [detail.message, detail.summary, detail.phase, detail.state, detail.status]
            .filter((value) => typeof value === 'string')
            .join(' · ')
            .slice(0, 800);
        }
      }
      break;
    default:
      title = 'Unsupported activity';
      status = 'review';
      summary = `An activity of type ${text(event.type, 160)} was received. Its payload was not interpreted or executed.`;
  }
  const sequence = Number.isSafeInteger(event.sequence) ? Number(event.sequence) : 0;
  const output = record(data.output);
  const transactionId = text(output.transactionId || record(output.transaction).transactionId, 200);
  return {
    eventId: text(event.id, 240) || `${event.sessionId}:${sequence}:${event.type}`,
    eventType: text(event.type, 160),
    sequence,
    sessionId: text(event.sessionId, 160),
    ...(typeof event.requestId === 'string' ? { requestId: text(event.requestId, 160) } : {}),
    ...(typeof event.toolCallId === 'string'
      ? { invocationId: text(event.toolCallId, 160) }
      : typeof data.decisionId === 'string'
        ? { invocationId: `model:${text(data.decisionId, 160)}` }
        : {}),
    timestamp: text(event.timestamp, 40),
    kind,
    title,
    summary,
    status,
    ...(tool ? { toolName: tool } : {}),
    ...(transactionId ? { transactionId } : {}),
    ...(['workspace-evidence', 'workspai-cli'].includes(String(data.verificationAuthority))
      ? {
          verificationAuthority: data.verificationAuthority as
            | 'workspace-evidence'
            | 'workspai-cli',
        }
      : {}),
    ...(typeof data.durationMs === 'number' && Number.isFinite(data.durationMs)
      ? { durationMs: Math.max(0, data.durationMs) }
      : {}),
    ...(kind === 'unknown' ? { unsupported: true } : {}),
  };
}

export function isStudioActivityReceipt(value: unknown): value is StudioActivityReceipt {
  const item = record(value);
  return (
    typeof item.eventId === 'string' &&
    item.eventId.length <= 240 &&
    typeof item.eventType === 'string' &&
    item.eventType.length <= 160 &&
    typeof item.sessionId === 'string' &&
    item.sessionId.length <= 160 &&
    (item.requestId === undefined ||
      (typeof item.requestId === 'string' && item.requestId.length <= 160)) &&
    (item.invocationId === undefined ||
      (typeof item.invocationId === 'string' && item.invocationId.length <= 166)) &&
    typeof item.timestamp === 'string' &&
    item.timestamp.length <= 40 &&
    Number.isSafeInteger(item.sequence) &&
    Number(item.sequence) >= 0 &&
    typeof item.title === 'string' &&
    item.title.length <= 500 &&
    typeof item.summary === 'string' &&
    item.summary.length <= 800 &&
    (item.durationMs === undefined ||
      (typeof item.durationMs === 'number' &&
        Number.isFinite(item.durationMs) &&
        item.durationMs >= 0)) &&
    (item.unsupported === undefined || typeof item.unsupported === 'boolean') &&
    (item.toolName === undefined ||
      (typeof item.toolName === 'string' && item.toolName.length <= 160)) &&
    (item.transactionId === undefined ||
      (typeof item.transactionId === 'string' && item.transactionId.length <= 200)) &&
    (item.verificationAuthority === undefined ||
      ['workspace-evidence', 'workspai-cli'].includes(String(item.verificationAuthority))) &&
    ['running', 'review', 'done', 'failed'].includes(String(item.status)) &&
    [...Object.values(STUDIO_ACTIVITY_EVENTS), 'unknown'].includes(item.kind as StudioActivityKind)
  );
}

/** Session metadata has no execution authority. Anchor it for display using
 * adjacent request receipts, including the state emitted before request.start. */
export function correlateStudioActivityReceipts(
  receipts: readonly StudioActivityReceipt[]
): StudioActivityReceipt[] {
  let previousRequest: string | undefined;
  const firstRequest = receipts.find((receipt) => receipt.requestId)?.requestId;
  return receipts.map((receipt, index) => {
    if (receipt.requestId) {
      previousRequest = receipt.requestId;
      return receipt;
    }
    const following = receipts[index + 1];
    const requestId =
      following?.eventType === 'request.started'
        ? following.requestId
        : (previousRequest ?? firstRequest);
    return requestId ? { ...receipt, requestId } : receipt;
  });
}

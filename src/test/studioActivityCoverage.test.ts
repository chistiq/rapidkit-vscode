import { describe, expect, it } from 'vitest';
import {
  STUDIO_ACTIVITY_EVENTS,
  studioActivityReceipt,
  isStudioActivityReceipt,
  correlateStudioActivityReceipts,
} from '../contracts/studioActivity.js';
import { studioEventProgress } from '../../webview-ui/src/lib/studioActivityView';
import { appendStudioRepairTimelineEntry } from '../../webview-ui/src/lib/studioRepairTimeline';
import { renderNativeStudioAgentEvent } from '../core/nativeChatToolEventRenderer';

const event = (type: string, sequence = 1, data: Record<string, unknown> = {}) => ({
  id: `s:${sequence}`,
  sessionId: 's',
  requestId: 'r',
  toolCallId: 'call',
  sequence,
  timestamp: '2026-11-02T20:00:00.000Z',
  type,
  data,
});
describe('Complete public activity coverage', () => {
  it('retains a comparison reference after raw edit events are evicted without storing source or granting Undo', () => {
    const receipt = studioActivityReceipt(
      event('tool.completed', 1, {
        toolName: 'apply-workspace-edits',
        output: {
          transactionId: 'native-test',
          source: 'must-not-be-copied',
          fileChanges: [{ body: 'private source' }],
        },
      })
    )!;
    expect(receipt).toMatchObject({
      toolName: 'apply-workspace-edits',
      transactionId: 'native-test',
    });
    expect(JSON.stringify(receipt)).not.toMatch(/must-not-be-copied|private source/);
    expect(studioEventProgress(event('tool.completed'), true)?.canUndo).toBeUndefined();
  });
  it('anchors unscoped lifecycle metadata to adjacent requests for observation only', () => {
    const receipt = (type: string, sequence: number, requestId?: string) =>
      studioActivityReceipt({ ...event(type, sequence), requestId })!;
    const receipts = correlateStudioActivityReceipts([
      receipt('session.created', 1),
      receipt('session.status', 2),
      receipt('request.started', 3, 'old'),
      receipt('session.completed', 4, 'old'),
      receipt('session.status', 5),
      receipt('session.status', 6),
      receipt('request.started', 7, 'new'),
      receipt('session.status', 8),
    ]);
    expect(receipts.map((receipt) => receipt.requestId)).toEqual([
      'old',
      'old',
      'old',
      'old',
      'old',
      'new',
      'new',
      'new',
    ]);
  });
  it('upgrades a live unscoped receipt in place when replay supplies its owner', () => {
    const raw = { ...event('session.status'), requestId: undefined, toolCallId: undefined };
    const live = studioEventProgress(raw)!;
    const restored = studioEventProgress({ ...raw, requestId: 'r' }, true)!;
    const rows = appendStudioRepairTimelineEntry([live], restored, false);
    expect(rows).toHaveLength(1);
    expect(rows[0].requestId).toBe('r');
  });
  it.each(Object.keys(STUDIO_ACTIVITY_EVENTS))(
    'retains and projects %s without executable replay controls',
    (type) => {
      const input = event(type, 1, {
        toolName: 'future-tool',
        outcome: 'responded',
        durationMs: 43000,
      });
      const receipt = studioActivityReceipt(input)!;
      expect(isStudioActivityReceipt(JSON.parse(JSON.stringify(receipt)))).toBe(true);
      expect(receipt.kind).not.toBe('unknown');
      const history = studioEventProgress(input, true)!;
      expect(history.status).not.toBe('running');
      expect(history.approvalRequest).toBeUndefined();
      expect(history.nextAction).toBeUndefined();
      expect(history.sessionId).toBe('s');
      expect(history.requestId).toBe('r');
    }
  );
  it.each(Object.keys(STUDIO_ACTIVITY_EVENTS))('also presents %s in native Chat', (type) => {
    const output: string[] = [];
    renderNativeStudioAgentEvent(
      {
        progress: (value) => {
          output.push(value);
        },
        markdown: (value) => {
          output.push(String(value));
        },
      },
      event(type, 1, {
        toolName: 'future-tool',
        text: '\u0633\u0644\u0627\u0645',
        durationMs: 43000,
      }) as never
    );
    expect(output.length).toBeGreaterThan(0);
  });
  it('keeps one model decision row with elapsed time as telemetry arrives', () => {
    let rows: ReturnType<typeof studioEventProgress>[] = [];
    for (const [index, type] of [
      'model.request.started',
      'model.request.finished',
      'model.resolved',
    ].entries()) {
      const raw = {
        ...event(type, index + 1, {
          decisionId: 'decision-1',
          durationMs: index ? 43000 : 0,
          provider: 'vscode-lm',
          modelId: 'test-model',
        }),
        toolCallId: undefined,
      };
      rows = appendStudioRepairTimelineEntry(rows as never, studioEventProgress(raw)!, false);
    }
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('done');
    expect(rows[0]?.receipt?.durationMs).toBe(43000);
    expect(rows[0]?.phaseHistory).toHaveLength(3);
  });
  it('rejects corrupt receipt metadata before replay', () => {
    const receipt = studioActivityReceipt(event('tool.started'))!;
    for (const bad of [
      { durationMs: Infinity },
      { durationMs: -1 },
      { invocationId: 42 },
      { requestId: {} },
      { unsupported: 'yes' },
    ]) {
      expect(isStudioActivityReceipt({ ...receipt, ...bad })).toBe(false);
    }
  });
  it.each(['future.rendered', '__proto__', 'constructor'])(
    'makes unsupported %s explicit without exposing its payload',
    (type) => {
      const receipt = studioActivityReceipt(
        event(type, 1, { secret: 'never-display', encrypted_content: 'opaque-private-data' })
      )!;
      expect(receipt.unsupported).toBe(true);
      expect(receipt.status).toBe('review');
      expect(JSON.stringify(receipt)).not.toMatch(/never-display|opaque-private-data/);
    }
  );
  it('does not turn private provider state or arbitrary tool output into public reasoning', () => {
    const receipt = studioActivityReceipt(
      event('model.request.finished', 1, {
        outcome: 'responded',
        durationMs: 43000,
        reasoning: 'private-trace',
        encrypted_content: 'cipher',
        output: { token: 'secret' },
      })
    )!;
    expect(receipt.durationMs).toBe(43000);
    expect(receipt.title).toBe('Model response received');
    expect(JSON.stringify(receipt)).not.toMatch(/private-trace|cipher|secret/);
  });
  it('preserves all phases when older events are replayed after completion without restoring stale approval', () => {
    let rows = [studioEventProgress(event('tool.completed', 10, { toolName: 'run-command' }))!];
    for (const [at, type] of [
      'tool.requested',
      'tool.permission',
      'tool.approval.requested',
      'tool.approval.approved',
      'tool.started',
      'tool.progress',
    ].entries()) {
      rows = appendStudioRepairTimelineEntry(
        rows,
        studioEventProgress(event(type, at + 1, { toolName: 'run-command' }), true)!,
        false
      );
    }
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('done');
    expect(rows[0].phaseHistory?.map((receipt) => receipt.sequence)).toEqual([
      1, 2, 3, 4, 5, 6, 10,
    ]);
    expect(rows[0].approvalRequest).toBeUndefined();
    rows = appendStudioRepairTimelineEntry(
      rows,
      studioEventProgress(event('tool.started', 5), true)!,
      false
    );
    expect(rows[0].phaseHistory).toHaveLength(7);
  });
});

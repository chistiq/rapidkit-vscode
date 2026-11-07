import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { projectStudioReadResult, projectStudioSourceRead } from '../core/studioReadProjection.js';
import {
  rememberStudioReadCoverage,
  studioReadCoverageFeedback,
} from '../core/studioReadCoverage.js';
import { StudioAgentSession, type StudioAgentModelContext } from '../core/studioAgentSession.js';
import {
  StudioAgentToolRegistry,
  type StudioAgentToolResult,
} from '../core/studioAgentToolRegistry.js';
import {
  ContractStudioAgentModelAdapter,
  STUDIO_AGENT_REPORT_TOOL_NAME,
  type StudioAgentConversationMessage,
} from '../core/studioAgentModelProtocol.js';
import { reviewStudioTaskCompletion } from '../core/studioTaskCompletionReview.js';

const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
function state() {
  return new StudioAgentSession(
    {
      id: 'read-owner',
      workspacePath: '/workspace',
      assistantMode: 'agent',
      executionAuthority: 'workspace',
      cardId: 'assistant:agent',
      requiresVerifiedCompletion: false,
      workspaceTrusted: true,
    },
    { next: async () => ({ type: 'report', summary: 'unused', nextSteps: ['unused'] }) },
    new StudioAgentToolRegistry(),
    { save: async () => {} }
  ).snapshot();
}
function file(name: string, start: number, end: number, sha256 = hash(name)) {
  return {
    path: name,
    kind: 'source',
    sha256,
    exists: true,
    lineStart: start,
    lineEnd: end,
    content: Array.from({ length: end - start + 1 }, (_, index) => `line ${start + index}`).join(
      '\n'
    ),
    truncated: false,
  };
}
function batch(id: string, files: ReturnType<typeof file>[], ok = true): StudioAgentToolResult {
  return {
    ok,
    output: {
      concurrent: true,
      results: files.map((entry, index) => ({
        id: `${id}-${index}`,
        kind: 'source',
        result: { ok: true, output: [entry] },
      })),
    },
  };
}

describe('Returned source coverage and request continuity', () => {
  it('preserves read history across non-source effects, marks uncertain effects, and refreshes only observed versions', () => {
    const session = state();
    const read = (sequence: number) =>
      rememberStudioReadCoverage(session, {
        toolName: 'inspect-source',
        toolInput: {},
        result: { ok: true, output: [file('setup.sh', 1, 20)] },
        requestId: 'request',
        sequence,
      });
    read(1);
    rememberStudioReadCoverage(session, {
      toolName: 'start-terminal',
      toolInput: {},
      result: {
        ok: true,
        changed: true,
        output: { terminalId: 't', effects: { externalSystem: true } },
      },
      requestId: 'request',
      sequence: 2,
    });
    expect(studioReadCoverageFeedback(session)?.files[0]).toMatchObject({
      path: 'setup.sh',
      ranges: [[1, 20]],
      requiresFreshObservation: true,
    });
    read(3);
    expect(studioReadCoverageFeedback(session)?.files[0].requiresFreshObservation).toBe(false);
    rememberStudioReadCoverage(session, {
      toolName: 'run-workspace-command',
      toolInput: {},
      result: {
        ok: true,
        changed: true,
        output: { effects: { source: false, externalSystem: true } },
      },
      requestId: 'request',
      sequence: 4,
    });
    expect(session.readCoverage?.files).toHaveLength(1);
    rememberStudioReadCoverage(session, {
      toolName: 'run-workspace-command',
      toolInput: {},
      result: {
        ok: true,
        changed: true,
        output: { observedSourceChange: true, changedPaths: ['setup.sh'] },
      },
      requestId: 'request',
      sequence: 5,
    });
    expect(session.readCoverage?.files).toEqual([]);
  });
  it('seeds multiple requested outcomes before execution and preserves the actual ledger on Resume', async () => {
    const initialOutcomes = {
      objective: 'Fix setup and lint',
      requirements: ['Fix setup tool failures', 'Fix lint error'],
    };
    const options = {
      workspacePath: '/workspace',
      assistantMode: 'agent' as const,
      executionAuthority: 'workspace' as const,
      cardId: 'assistant:agent',
      workspaceTrusted: true,
      requiresVerifiedCompletion: false,
      initialOutcomes,
    };
    const next = vi.fn(async (ctx: StudioAgentModelContext) => {
      expect(ctx.session.taskLedger?.steps.map((step) => step.description)).toEqual(
        initialOutcomes.requirements
      );
      return {
        type: 'report' as const,
        summary: 'Environment remains blocked.',
        nextSteps: ['Repair the toolchain.'],
      };
    });
    const session = new StudioAgentSession(options, { next }, new StudioAgentToolRegistry(), {
      save: async () => {},
    });
    expect(session.snapshot().taskLedger?.steps).toHaveLength(2);
    const result = await session.run('Fix setup and lint');
    expect(next).toHaveBeenCalledTimes(1);
    result.taskLedger!.steps[0].status = 'completed';
    const resumed = new StudioAgentSession(
      { ...options, restoredSession: result },
      { next },
      new StudioAgentToolRegistry(),
      { save: async () => {} }
    );
    expect(resumed.snapshot().taskLedger?.steps[0].status).toBe('completed');
    for (const override of [
      { initialOutcomes: { ...initialOutcomes, requirements: ['Fix one defect'] } },
      { assistantMode: 'ask' as const },
      { executionAuthority: 'workspai-cli' as const },
    ]) {
      const single = new StudioAgentSession(
        { ...options, ...override },
        { next },
        new StudioAgentToolRegistry(),
        { save: async () => {} }
      );
      expect(single.snapshot().taskLedger).toBeUndefined();
    }
  });
  it('counts logical batch reads and partial overlaps independently of operation IDs, order and partitioning', () => {
    const session = state();
    const observe = (sequence: number, result: StudioAgentToolResult) =>
      rememberStudioReadCoverage(session, {
        toolName: 'inspect-workspace-batch',
        toolInput: {},
        result: projectStudioReadResult('inspect-workspace-batch', result),
        requestId: 'request',
        sequence,
      });
    observe(1, batch('first', [file('a.ts', 1, 20), file('b.ts', 1, 10)]));
    observe(2, batch('renamed', [file('b.ts', 1, 10), file('a.ts', 10, 30)]));
    observe(3, batch('split', [file('a.ts', 15, 25)]));
    const feedback = studioReadCoverageFeedback(session)!;
    expect(feedback.logicalReads).toBe(5);
    expect(feedback.overlappingReads).toBe(2);
    expect(feedback.readsWithoutNewCoverage).toBe(1);
    expect(feedback.files.find((entry) => entry.path === 'a.ts')).toMatchObject({
      ranges: [[1, 30]],
      reads: 3,
      returnedUnits: 30,
    });
    expect(JSON.stringify(session.readCoverage)).not.toContain('line 15');
  });

  it('records successful children of failed batches and invalidates only changed files or the changed scope', () => {
    const session = state();
    const result = batch('partial', [file('a.ts', 1, 10), file('b.ts', 1, 10)], false);
    (result.output as { results: unknown[] }).results.push({
      id: 'denied',
      kind: 'source',
      result: { ok: false, error: 'Unavailable' },
    });
    rememberStudioReadCoverage(session, {
      toolName: 'inspect-workspace-batch',
      toolInput: {},
      result,
      requestId: 'r',
      sequence: 1,
    });
    expect(session.readCoverage?.files).toHaveLength(2);
    rememberStudioReadCoverage(session, {
      toolName: 'apply-workspace-edits',
      toolInput: {},
      result: { ok: true, changed: true, output: { changedPaths: ['a.ts'] } },
      requestId: 'r',
      sequence: 2,
    });
    expect(session.readCoverage?.files.map((entry) => entry.path)).toEqual(['b.ts']);
    rememberStudioReadCoverage(session, {
      toolName: 'inspect-source',
      toolInput: {},
      result: { ok: true, output: [file('b.ts', 20, 25, hash('new version'))] },
      requestId: 'r',
      sequence: 3,
    });
    expect(session.readCoverage?.files[0].ranges).toEqual([[20, 25]]);
    expect(session.readCoverage?.files[0].reads).toBe(1);
    session.projectPath = '/workspace/other';
    expect(studioReadCoverageFeedback(session)).toBeUndefined();
    rememberStudioReadCoverage(session, {
      toolName: 'inspect-source',
      toolInput: {},
      result: { ok: true, output: [file('b.ts', 1, 2)] },
      requestId: 'r',
      sequence: 4,
    });
    expect(session.readCoverage?.files[0].ranges).toEqual([[1, 2]]);
  });

  it('preserves bounded metadata through persistence and labels inherited request observations as historical', () => {
    const session = state();
    rememberStudioReadCoverage(session, {
      toolName: 'inspect-source',
      toolInput: {},
      result: { ok: true, output: [file('source.ts', 5, 20)] },
      requestId: 'first',
      sequence: 1,
    });
    const restored = JSON.parse(JSON.stringify(session));
    rememberStudioReadCoverage(restored, {
      toolName: 'inspect-workspace',
      toolInput: {},
      result: { ok: true },
      requestId: 'resumed',
      sequence: 600,
    });
    expect(studioReadCoverageFeedback(restored)?.files[0].historical).toBe(true);
    rememberStudioReadCoverage(restored, {
      toolName: 'inspect-source',
      toolInput: {},
      result: { ok: true, output: [file('source.ts', 10, 12)] },
      requestId: 'resumed',
      sequence: 601,
    });
    expect(studioReadCoverageFeedback(restored)?.files[0]).toMatchObject({
      historical: false,
      ranges: [[5, 20]],
    });
    for (let index = 0; index < 100; index++)
      rememberStudioReadCoverage(restored, {
        toolName: 'inspect-source',
        toolInput: {},
        result: { ok: true, output: [file(`${index}.ts`, 1, 2)] },
        requestId: 'resumed',
        sequence: index + 602,
      });
    expect(restored.readCoverage.files).toHaveLength(64);
  });

  it('bounds every batch preview without losing later results, hashes, failures or continuation locations', () => {
    const result = batch(
      'many',
      Array.from({ length: 8 }, (_, index) => ({
        ...file(`${index}.ts`, 100, 999),
        content: 'const value = 123;\n'.repeat(900),
      }))
    );
    const projected = projectStudioReadResult('inspect-workspace-batch', result);
    const output = projected.output as {
      results: Array<{ id: string; result: { output: Array<Record<string, unknown>> } }>;
    };
    expect(output.results).toHaveLength(8);
    let total = 0;
    for (const row of output.results) {
      const entry = row.result.output[0];
      total += String(entry.content).length;
      expect(entry.truncated).toBe(true);
      expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(entry.nextRead).toMatchObject({
        tool: 'inspect-source',
        input: { lineStart: Number(entry.lineEnd) + 1 },
      });
      expect(String(entry.content).endsWith('\n')).toBe(true);
    }
    expect(total).toBeLessThanOrEqual(12_000);
    expect(JSON.stringify(projected).length).toBeLessThan(24_000);
    const session = state();
    rememberStudioReadCoverage(session, {
      toolName: 'inspect-workspace-batch',
      toolInput: {},
      result: projected,
      requestId: 'r',
      sequence: 1,
    });
    expect(session.readCoverage?.files[0].ranges[0][1]).toBeLessThan(999);
  });

  it('does not invent complete line coverage for a long line and preserves instruction UTF-8 offsets', () => {
    const long = projectStudioSourceRead(
      { ...file('long.ts', 1, 1), content: 'x'.repeat(12_000) },
      500
    );
    expect(long).toMatchObject({
      lineEnd: 0,
      partialLastLine: true,
      nextRead: { tool: 'search-workspace' },
    });
    const content = '\u0633'.repeat(6000);
    const result = projectStudioReadResult(
      'inspect-agent-instructions',
      {
        ok: true,
        output: {
          documents: [
            {
              path: '/workspace/src/AGENTS.md',
              locator: 'workspace:src/AGENTS.md',
              offset: 4000,
              content,
              truncated: false,
            },
          ],
          nextReads: [],
        },
      },
      { path: 'src/main.ts' }
    );
    const out = result.output as {
      documents: Array<{ content: string; consumedBytes: number }>;
      nextReads: Array<{ input: object }>;
    };
    expect(out.documents[0].consumedBytes).toBe(Buffer.byteLength(out.documents[0].content));
    expect(out.nextReads[0].input).toMatchObject({
      path: 'src/main.ts',
      document: 'workspace:src/AGENTS.md',
      offset: 4000 + out.documents[0].consumedBytes,
    });
  });

  it('reuses source bytes within a payload despite renamed and reordered batch operations', async () => {
    const session = state();
    const entry = { ...file('setup.sh', 180, 200), content: 'UNIQUE-SOURCE-' + 'x'.repeat(1500) };
    const history: StudioAgentConversationMessage[] = [];
    for (let index = 0; index < 2; index++)
      history.push(
        { role: 'user', content: 'Continue' },
        {
          role: 'assistant',
          toolCall: {
            callId: `batch-${index}`,
            name: 'inspect-workspace-batch',
            input: {
              operations: [{ id: `different-${index}`, kind: 'source', paths: ['setup.sh'] }],
            },
          },
        },
        {
          role: 'tool',
          toolResult: {
            callId: `batch-${index}`,
            name: 'inspect-workspace-batch',
            content: JSON.stringify(batch(`changed-${index}`, [entry])),
          },
        }
      );
    const model = new ContractStudioAgentModelAdapter(
      'Fix setup',
      async (_prompt, request) => {
        const payload = JSON.stringify(request.messages);
        expect(payload.match(/UNIQUE-SOURCE-/g)).toHaveLength(1);
        expect(payload).toContain('contentReference');
        expect(payload).toContain('batch-0');
        return {
          toolName: STUDIO_AGENT_REPORT_TOOL_NAME,
          input: { summary: 'Work remains.', nextSteps: ['Run checks.'] },
        };
      },
      undefined,
      history
    ).enableEfficientContext();
    await model.next({
      session,
      steering: [],
      tools: [
        {
          name: 'inspect-workspace-batch',
          title: 'Read',
          description: 'Read',
          inputSchema: { type: 'object' },
          activity: 'inspect',
          risk: 'read',
        },
      ],
    });
  });

  it('retains omitted unresolved outcomes and distinguishes semantic feedback from invalid protocol', () => {
    const session = state();
    session.requirementReview = [
      {
        requirement: 'Fix setup failures',
        status: 'unresolved',
        evidenceSequences: [],
        detail: 'Executable failures are still ignored.',
      },
    ];
    const ctx: StudioAgentModelContext = { session, tools: [], steering: [] };
    const action = reviewStudioTaskCompletion(
      'All done',
      [
        {
          requirement: 'Review lint',
          status: 'not-applicable',
          evidenceSequences: [],
          detail: 'No lint changes were requested.',
        },
      ],
      ctx
    );
    expect(action).toMatchObject({
      type: 'feedback',
      review: expect.arrayContaining([
        expect.objectContaining({ requirement: 'Fix setup failures', status: 'unresolved' }),
      ]),
    });
  });

  it('keeps a native request active across semantic feedback and read-loop thresholds without automatic verified completion', async () => {
    const registry = new StudioAgentToolRegistry();
    const verify = vi.fn(async () => ({ ok: true, cardBlocking: false }));
    registry.register({
      name: 'verify-blocker',
      title: 'Verify',
      description: 'Verify',
      inputSchema: { type: 'object' },
      activity: 'verify',
      risk: 'read',
      execute: verify,
    });
    let calls = 0;
    const runtime = new StudioAgentSession(
      {
        workspacePath: '/workspace',
        cardId: 'assistant:agent',
        assistantMode: 'agent',
        executionAuthority: 'workspace',
        requiresVerifiedCompletion: false,
        workspaceTrusted: true,
        maxModelDecisionsWithoutSourceProgress: 2,
      },
      {
        next: async (ctx) => {
          expect(ctx.tools.some((tool) => tool.name === 'verify-blocker')).toBe(true);
          if (calls++ < 4)
            return {
              type: 'feedback',
              text: 'Setup remains open; choose another applicable tool.',
              review: [
                {
                  requirement: 'Fix setup',
                  status: 'unresolved',
                  evidenceSequences: [],
                  detail: 'Original behavior remains untested.',
                },
              ],
            };
          return {
            type: 'report',
            summary: 'Concrete environment blocker; changes retained.',
            nextSteps: ['Run setup in a functioning toolchain.'],
          };
        },
      },
      registry,
      { save: async () => {} }
    );
    const result = await runtime.run('Fix setup');
    expect(calls).toBe(5);
    expect(verify).not.toHaveBeenCalled();
    expect(result.budgetLedger?.totalProtocolMisses).toBe(0);
    expect(result.events.some((event) => event.type === 'session.completed')).toBe(false);
    expect(result.requirementReview?.[0].status).toBe('unresolved');
    expect(result.events.some((event) => event.data.recovery === 'observation-reorientation')).toBe(
      true
    );
  });
});

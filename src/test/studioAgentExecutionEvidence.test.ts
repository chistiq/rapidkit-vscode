import { describe, expect, it } from 'vitest';
import {
  studioAgentExecutionEvidence,
  describeStudioExecutionReceipts,
} from '../core/studioAgentExecutionEvidence.js';
import { ContractStudioAgentModelAdapter } from '../core/studioAgentModelProtocol.js';
import { StudioAgentSession } from '../core/studioAgentSession.js';
import { StudioAgentToolRegistry } from '../core/studioAgentToolRegistry.js';

function session() {
  const state = new StudioAgentSession(
    {
      workspacePath: '/workspace',
      cardId: 'assistant:agent',
      assistantMode: 'agent',
      executionAuthority: 'workspace',
      permissionLevel: 'default',
      workspaceTrusted: true,
      requiresVerifiedCompletion: false,
    },
    { next: async () => ({ type: 'complete', summary: 'unused' }) },
    new StudioAgentToolRegistry(),
    { save: async () => {} }
  ).snapshot();
  const event = (sequence: number, type: string, data: object) => ({
    schemaVersion: 'workspai.studio-agent-event.v1' as const,
    id: `e-${sequence}`,
    sessionId: state.id,
    timestamp: '2026-10-31T18:04:00Z',
    sequence,
    type,
    requestId: 'current',
    data,
  });
  state.events = [
    event(1, 'request.started', { request: 'Create a project' }),
    event(2, 'tool.failed', {
      toolName: 'run-workspace-command',
      input: { executable: 'npm', args: ['run', 'lint'], cwd: 'sample' },
      ok: false,
      output: { exitCode: 127 },
    }),
    event(3, 'tool.completed', {
      toolName: 'run-workspace-command',
      input: { executable: 'npm', args: ['ci'], cwd: 'sample', purpose: 'dependency' },
      ok: true,
      output: { exitCode: 0 },
    }),
    event(4, 'tool.completed', {
      toolName: 'run-workspace-command',
      input: { executable: 'npm', args: ['run', 'lint'], cwd: 'sample', purpose: 'test' },
      ok: true,
      output: { exitCode: 0 },
    }),
    event(5, 'tool.completed', {
      toolName: 'run-workspace-command',
      input: { executable: 'npm', args: ['run', 'build'], cwd: 'sample', purpose: 'build' },
      ok: true,
      output: { exitCode: 0 },
    }),
    ...Array.from({ length: 20 }, (_, index) =>
      event(6 + index, 'tool.completed', {
        toolName: 'inspect-workspace-changes',
        ok: true,
        output: { status: '?? sample' },
      })
    ),
  ] as typeof state.events;
  state.taskLedger = {
    schemaVersion: 'workspai.studio-task-ledger.v1',
    objective: 'Create a project',
    steps: [
      {
        id: 'verify',
        description: 'Verify',
        status: 'in-progress',
        evidence: 'eslint was unavailable; build has not run.',
      },
    ],
    updatedAt: '2026-10-31T18:00:00Z',
    updatedSequence: 2,
  };
  return state;
}

describe('Durable execution receipts', () => {
  it('distinguishes an exit-zero build with restored source from a compiler failure', () => {
    const state = session();
    state.events.push({
      ...state.events[0],
      type: 'tool.failed',
      sequence: 30,
      data: {
        toolName: 'run-workspace-command',
        ok: false,
        input: { executable: 'npm', args: ['run', 'build'], cwd: 'sample', purpose: 'build' },
        error: 'Source mutation was not declared.',
        output: { exitCode: 0, rollback: { reason: 'unapproved-mutation' } },
      },
    });
    expect(studioAgentExecutionEvidence(state).commands.at(-1)).toMatchObject({
      ok: false,
      processOutcome: 'passed',
      sourceRestored: true,
      exitCode: 0,
    });
    const report = describeStudioExecutionReceipts(state);
    expect(report).toContain('process passed; tool outcome not accepted, exit 0');
    expect(report).toContain('source changes restored, verification remains open');
    expect(report).not.toContain('failed, exit 0');
  });
  it('retains terminal cwd through later polling observations', () => {
    const state = session();
    const base = state.events[0];
    state.events.push(
      {
        ...base,
        type: 'tool.completed',
        sequence: 30,
        data: {
          toolName: 'start-terminal',
          input: { command: 'npx workspai create project nextjs web', cwd: 'new-workspace' },
          ok: true,
          output: { terminalId: 'owned', state: 'running' },
        },
      },
      {
        ...base,
        type: 'tool.completed',
        sequence: 31,
        data: {
          toolName: 'read-terminal',
          input: { terminalId: 'owned' },
          ok: true,
          output: { terminalId: 'owned', state: 'exited', exitCode: 0 },
        },
      }
    );
    expect(studioAgentExecutionEvidence(state).terminals[0]).toMatchObject({
      cwd: 'new-workspace',
      state: 'exited',
    });
    expect(describeStudioExecutionReceipts(state)).toContain('[new-workspace]: exit 0');
  });
  it('retains install, lint and build success after many inspections and supersedes the earlier lint failure', () => {
    const evidence = studioAgentExecutionEvidence(session());
    expect(evidence.commands).toHaveLength(3);
    expect(evidence.commands.find((command) => command.command === 'npm run lint')).toMatchObject({
      ok: true,
      exitCode: 0,
      supersedesFailure: true,
    });
    expect(describeStudioExecutionReceipts(session())).toContain(
      'npm run build [sample]: passed, exit 0'
    );
    expect(evidence.ledgerUpdatedSequence).toBe(2);
    const later = session();
    later.events.push({
      ...later.events[0],
      sequence: 30,
      id: 'new-request',
      requestId: 'new',
      data: { request: 'Different task' },
    });
    expect(studioAgentExecutionEvidence(later).commands).toEqual([]);
  });

  it('supplies successful receipts to the compact final report despite stale ledger notes and an unrelated latest observation', async () => {
    const adapter = new ContractStudioAgentModelAdapter(
      'Create a project',
      async (prompt, request) => {
        expect(request.tools.map((tool) => tool.name)).toEqual(['workspai-report-outcome']);
        expect(prompt).toContain('Observed execution receipts:');
        expect(prompt).toContain('npm ci');
        expect(prompt).toContain('npm run lint');
        expect(prompt).toContain('npm run build');
        expect(prompt).toContain('"exitCode":0');
        expect(prompt).toContain('"supersedesFailure":true');
        expect(prompt).toContain('Ledger notes can be stale');
        return {
          toolName: 'workspai-report-outcome',
          input: {
            summary:
              'Project created; installation, lint and build passed. Final task-ledger acceptance is unfinished.',
            nextSteps: ['Reconcile the ledger with the successful checks.'],
          },
        };
      }
    );
    const action = await adapter.next({
      session: session(),
      tools: [],
      steering: [],
      recentObservations: [],
      latestObservation: { ok: true, output: { status: '?? sample' } },
      finalOutcomeOnly: true,
    });
    expect(action.type).toBe('report');
    if (action.type === 'report') expect(action.summary).toContain('lint and build passed');
  });
});

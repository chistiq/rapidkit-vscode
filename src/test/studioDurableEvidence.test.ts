import { describe, expect, it } from 'vitest';
import { studioDurableEventValue } from '../core/studioDurableEvidence.js';
import { projectStudioSourceRead } from '../core/studioReadProjection.js';
import { StudioAgentSession } from '../core/studioAgentSession.js';
import { StudioAgentToolRegistry } from '../core/studioAgentToolRegistry.js';
import { rememberStudioProjectOperation } from '../core/studioProjectOperationReceipts.js';
import { studioAgentExecutionEvidence } from '../core/studioAgentExecutionEvidence.js';
import { buildStudioIncompleteAnswer } from '../core/studioAgentOutcome.js';

function session() {
  return new StudioAgentSession(
    {
      workspacePath: '/workspace',
      cardId: 'assistant:agent',
      assistantMode: 'agent',
      executionAuthority: 'workspace',
      workspaceTrusted: true,
      requiresVerifiedCompletion: false,
      permissionLevel: 'default',
    },
    { next: async () => ({ type: 'report', summary: 'Blocked', nextSteps: ['Review'] }) },
    new StudioAgentToolRegistry(),
    { save: async () => {} }
  ).snapshot();
}

describe('Durable execution evidence fidelity', () => {
  it('round-trips nested batch hashes and continuation metadata while omitting private bodies', () => {
    const body = 'PRIVATE-SOURCE-BODY';
    const file = {
      path: 'setup.sh',
      sha256: 'a'.repeat(64),
      lineStart: 120,
      lineEnd: 240,
      content: body,
      nextRead: {
        tool: 'inspect-source',
        input: { paths: ['setup.sh'], lineStart: 241, lineEnd: 400 },
      },
    };
    const event = studioDurableEventValue({
      ok: true,
      output: {
        results: [
          {
            id: 'first',
            kind: 'source',
            result: {
              ok: true,
              output: { files: [file], failures: [{ path: 'denied.ts', error: 'Denied' }] },
            },
          },
        ],
      },
    }) as any;
    const restored = JSON.parse(JSON.stringify(event));
    const metadata = restored.output.results[0].result.output.files[0];
    expect(metadata).toMatchObject({
      path: 'setup.sh',
      sha256: 'a'.repeat(64),
      lineStart: 120,
      lineEnd: 240,
      contentOmitted: true,
      nextRead: file.nextRead,
    });
    expect(projectStudioSourceRead(metadata)).toMatchObject({
      lineStart: 120,
      lineEnd: 240,
      contentOmitted: true,
    });
    expect(JSON.stringify(restored)).not.toContain(body);
    expect(restored.output.results[0].result.output.failures).toEqual([
      { path: 'denied.ts', error: 'Denied' },
    ]);
    expect(
      studioDurableEventValue({ diff: 'x'.repeat(4_000), nativeDiffTruncated: false })
    ).toMatchObject({ durableTruncatedFields: ['diff'] });
  });

  it('retains onboarding provenance across event compaction without treating it as verification', () => {
    const state = session();
    rememberStudioProjectOperation(
      state,
      'onboard-project',
      {
        ok: true,
        output: {
          operation: 'adopt',
          projectPath: '/workspace/core',
          workspacePath: '/workspace/managed',
          commands: [{ args: ['adopt', '/workspace/core'], exitCode: 0 }],
        },
      },
      'request',
      12
    );
    const restored = JSON.parse(JSON.stringify(state));
    restored.events = [];
    expect(studioAgentExecutionEvidence(restored)).toMatchObject({
      projectOperations: [
        {
          operation: 'adopt',
          source: '/workspace/core',
          destination: '/workspace/managed',
          status: 'succeeded',
        },
      ],
      verification: undefined,
    });
    rememberStudioProjectOperation(
      restored,
      'onboard-project',
      { ok: false, output: { operation: 'import', commands: [{ args: ['import'], exitCode: 1 }] } },
      'request',
      13
    );
    expect(restored.projectOperations[1].status).toBe('partial');
  });

  it('reports the actual terminal reason even when the model supplies a summary', () => {
    const answer = buildStudioIncompleteAnswer(session(), {
      reason: 'Execution allowance ended: estimated usage; not a provider bill.',
      summary: 'Source edits were retained.',
      nextSteps: ['Diagnose the process crash.'],
    });
    expect(answer).toContain('Execution allowance ended');
    expect(answer).toContain('not a provider bill');
    expect(answer).toContain('Source edits were retained.');
  });
});

import { describe, expect, it, vi } from 'vitest';

import {
  runRapidkitStreaming,
  type RapidkitSpawn,
  type RapidkitSubprocess,
} from '../core/streamingRapidkitRunner';

function cliEvent(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 'cli-log-event-v1',
    runId: 'run-abcdef12',
    timestamp: '2026-06-22T10:00:00.000Z',
    level: 'info',
    event: 'progress',
    component: 'workspace.model',
    message: 'progress event',
    ...overrides,
  });
}

/**
 * Build a fake spawn that emits the given stderr chunks (the cli-log-event
 * stream) and stdout chunks (the result), then resolves with an exit code.
 */
function fakeSpawn(config: {
  stderrChunks: string[];
  stdoutChunks: string[];
  exitCode: number;
  onArgs?: (command: string, args: string[], env: NodeJS.ProcessEnv) => void;
  onKill?: () => void;
}): RapidkitSpawn {
  return (command, args, options) => {
    config.onArgs?.(command, args, options.env);
    let stdoutListener: ((chunk: string) => void) | undefined;
    let stderrListener: ((chunk: string) => void) | undefined;

    const completed = new Promise<{ exitCode: number; stdout: string; stderr: string }>(
      (resolve) => {
        // Emit on the next microtask so listeners are attached first.
        queueMicrotask(() => {
          for (const chunk of config.stderrChunks) {
            stderrListener?.(chunk);
          }
          for (const chunk of config.stdoutChunks) {
            stdoutListener?.(chunk);
          }
          resolve({
            exitCode: config.exitCode,
            stdout: config.stdoutChunks.join(''),
            stderr: config.stderrChunks.join(''),
          });
        });
      }
    );

    const subprocess: RapidkitSubprocess = {
      onStdoutChunk: (listener) => {
        stdoutListener = listener;
      },
      onStderrChunk: (listener) => {
        stderrListener = listener;
      },
      completed,
      kill: () => config.onKill?.(),
    };
    return subprocess;
  };
}

describe('runRapidkitStreaming', () => {
  it('consumes the event stream and parses the definitive stdout result', async () => {
    const onProgress = vi.fn();
    const result = await runRapidkitStreaming<{ verdict: string }>({
      command: ['workspace', 'verify', '--json'],
      cwd: '/tmp/ws',
      onProgress,
      spawn: fakeSpawn({
        stderrChunks: [
          `${cliEvent({ event: 'run.started', message: 'started' })}\n`,
          `${cliEvent({ message: 'analyzing graph' })}\n`,
          `${cliEvent({ event: 'run.completed', message: 'done', command: ['workspace', 'verify'] })}\n`,
        ],
        stdoutChunks: ['{"verdict":', '"ready"}'],
        exitCode: 0,
      }),
    });

    expect(result.exitCode).toBe(0);
    expect(result.failed).toBe(false);
    expect(result.events).toHaveLength(3);
    expect(result.lastLifecycleEvent?.event).toBe('run.completed');
    expect(result.result).toEqual({ verdict: 'ready' });
    expect(onProgress).toHaveBeenCalledWith('started', expect.anything());
    expect(onProgress).toHaveBeenCalledWith('analyzing graph', expect.anything());
  });

  it('requests structured logs via RAPIDKIT_LOG_FORMAT=json', async () => {
    const onArgs = vi.fn();
    await runRapidkitStreaming({
      command: ['workspace', 'model', '--json', '--write'],
      cwd: '/tmp/ws',
      spawn: fakeSpawn({ stderrChunks: [], stdoutChunks: ['{}'], exitCode: 0, onArgs }),
    });

    expect(onArgs).toHaveBeenCalled();
    const [command, , env] = onArgs.mock.calls[0];
    expect(command).toBe('npx');
    expect(env.RAPIDKIT_LOG_FORMAT).toBe('json');
  });

  it('marks the run failed on a non-zero exit code', async () => {
    const result = await runRapidkitStreaming({
      command: ['workspace', 'verify', '--json'],
      cwd: '/tmp/ws',
      spawn: fakeSpawn({ stderrChunks: [], stdoutChunks: [''], exitCode: 2 }),
    });
    expect(result.failed).toBe(true);
    expect(result.result).toBeNull();
  });

  it('marks the run failed on a run.failed lifecycle event even with exit 0', async () => {
    const result = await runRapidkitStreaming({
      command: ['workspace', 'verify', '--json'],
      cwd: '/tmp/ws',
      spawn: fakeSpawn({
        stderrChunks: [`${cliEvent({ event: 'run.failed', message: 'boom' })}\n`],
        stdoutChunks: ['{}'],
        exitCode: 0,
      }),
    });
    expect(result.failed).toBe(true);
    expect(result.lastLifecycleEvent?.event).toBe('run.failed');
  });

  it('kills the subprocess when cancellation fires', async () => {
    const onKill = vi.fn();
    let cancel: (() => void) | undefined;
    await runRapidkitStreaming({
      command: ['workspace', 'model', '--json'],
      cwd: '/tmp/ws',
      signal: { onCancelled: (listener) => (cancel = listener) },
      spawn: fakeSpawn({ stderrChunks: [], stdoutChunks: ['{}'], exitCode: 0, onKill }),
    });
    cancel?.();
    expect(onKill).toHaveBeenCalled();
  });
});

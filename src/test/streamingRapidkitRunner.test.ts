import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  window: {
    showErrorMessage: vi.fn(),
  },
  commands: {
    executeCommand: vi.fn(),
  },
}));

import {
  runRapidkitStreaming,
  type RapidkitSpawn,
  type RapidkitSubprocess,
} from '../core/streamingRapidkitRunner';
import { buildRapidkitExecutionSpec } from '../utils/platformCapabilities';

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
  onArgs?: (
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv,
    options: { shell: boolean }
  ) => void;
  onKill?: () => void;
}): RapidkitSpawn {
  return (command, args, options) => {
    config.onArgs?.(command, args, options.env, { shell: options.shell });
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
      enterpriseGate: false,
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
      enterpriseGate: false,
      spawn: fakeSpawn({ stderrChunks: [], stdoutChunks: ['{}'], exitCode: 0, onArgs }),
    });

    expect(onArgs).toHaveBeenCalled();
    const [command, , env] = onArgs.mock.calls[0];
    expect(command).toBe(
      buildRapidkitExecutionSpec(['workspace', 'model', '--json', '--write']).command
    );
    expect(env.RAPIDKIT_LOG_FORMAT).toBe('json');
    expect(env.npm_config_package).toBeUndefined();
    expect(env.npm_config__package).toBeUndefined();
  });

  it('passes canonical npx args and shell mode as separate execution fields', async () => {
    const onArgs = vi.fn();
    await runRapidkitStreaming({
      command: ['workspace', 'verify', 'my folder'],
      cwd: '/tmp/ws',
      enterpriseGate: false,
      spawn: fakeSpawn({ stderrChunks: [], stdoutChunks: ['{}'], exitCode: 0, onArgs }),
    });

    const [command, args, , options] = onArgs.mock.calls[0];
    const execution = buildRapidkitExecutionSpec(['workspace', 'verify', 'my folder']);
    expect(command).toBe(execution.command);
    expect(args).toEqual(execution.args);
    expect(typeof options.shell).toBe('boolean');
  });

  it('marks the run failed on a non-zero exit code', async () => {
    const result = await runRapidkitStreaming({
      command: ['workspace', 'verify', '--json'],
      cwd: '/tmp/ws',
      enterpriseGate: false,
      spawn: fakeSpawn({ stderrChunks: [], stdoutChunks: [''], exitCode: 2 }),
    });
    expect(result.failed).toBe(true);
    expect(result.result).toBeNull();
  });

  it('marks the run failed on a run.failed lifecycle event even with exit 0', async () => {
    const result = await runRapidkitStreaming({
      command: ['workspace', 'verify', '--json'],
      cwd: '/tmp/ws',
      enterpriseGate: false,
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
      enterpriseGate: false,
      signal: { onCancelled: (listener) => (cancel = listener) },
      spawn: fakeSpawn({ stderrChunks: [], stdoutChunks: ['{}'], exitCode: 0, onKill }),
    });
    cancel?.();
    expect(onKill).toHaveBeenCalled();
  });

  it('fails closed before spawning when the enterprise gate blocks the command', async () => {
    const spawn = vi.fn();
    const result = await runRapidkitStreaming({
      command: ['workspace', 'verify', '--json'],
      cwd: '/tmp/ws',
      featureLabel: 'Workspace Verify',
      enterpriseGate: async ({ args, cwd, featureLabel }) => {
        expect(args).toEqual(['workspace', 'verify', '--json']);
        expect(cwd).toBe('/tmp/ws');
        expect(featureLabel).toBe('Workspace Verify');
        return {
          allowed: false,
          error: 'Workspace Verify is blocked until rapidkit is updated.',
        };
      },
      spawn,
    });

    expect(result).toMatchObject({
      exitCode: 1,
      failed: true,
      stderr: 'Workspace Verify is blocked until rapidkit is updated.',
      stdout: '',
      events: [],
      result: null,
    });
    expect(spawn).not.toHaveBeenCalled();
  });
});

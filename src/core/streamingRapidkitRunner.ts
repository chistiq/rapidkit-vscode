import {
  buildPackageRunnerSubprocessEnv,
  buildRapidkitExecutionSpec,
} from '../utils/platformCapabilities';
import { parseTrailingJson } from './canonicalProjectLifecycle';
import { CliLogEventStreamParser, isProgressEvent, isRunLifecycleEvent } from './cliLogEventStream';
import type { CliLogEvent } from './cliLogEventContract';
import { gateRapidkitCliArgs, type EnterpriseCliGateResult } from './rapidkitEnterpriseCliGate';

/**
 * Minimal subprocess surface the streaming runner depends on. The default
 * implementation wires `execa`; tests inject a fake that emits chunks so the
 * runner is exercised without a live CLI.
 */
export interface RapidkitSubprocess {
  onStdoutChunk(listener: (chunk: string) => void): void;
  onStderrChunk(listener: (chunk: string) => void): void;
  completed: Promise<{ exitCode: number; stdout: string; stderr: string }>;
  kill?(): void;
}

export type RapidkitSpawn = (
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeoutMs: number;
    stdin?: string;
    shell: boolean;
  }
) => RapidkitSubprocess;

export type RapidkitStreamingEnterpriseGate =
  | false
  | ((options: {
      args: readonly string[];
      cwd: string;
      featureLabel: string;
    }) => Promise<EnterpriseCliGateResult>);

export interface StreamingRunOptions {
  /** RapidKit CLI args, e.g. `['workspace', 'model', '--json', '--write']`. */
  command: string[];
  cwd: string;
  /** Human label for enterprise version/capability gates. */
  featureLabel?: string;
  timeoutMs?: number;
  /** Optional stdin payload (e.g. feedback JSON). */
  stdin?: string;
  /** Fired for every decoded `cli-log-event.v1` event. */
  onEvent?: (event: CliLogEvent) => void;
  /** Fired for progress-advancing events with a UI-ready message. */
  onProgress?: (message: string, event: CliLogEvent) => void;
  /** Cancellation: when it fires the subprocess is killed. */
  signal?: { onCancelled(listener: () => void): void };
  /** Injectable spawn (defaults to execa). */
  spawn?: RapidkitSpawn;
  /** Injectable enterprise gate; defaults to the shared fail-closed RapidKit CLI gate. */
  enterpriseGate?: RapidkitStreamingEnterpriseGate;
}

export interface StreamingRunResult<T = unknown> {
  exitCode: number;
  events: CliLogEvent[];
  /** Last `run.completed` / `run.failed` event (the definitive verdict). */
  lastLifecycleEvent: CliLogEvent | null;
  /** Trailing JSON document parsed from stdout (the definitive result). */
  result: T | null;
  stdout: string;
  stderr: string;
  /** True when the CLI reported failure (non-zero exit or `run.failed`). */
  failed: boolean;
}

const DEFAULT_TIMEOUT_MS = 120_000;

const defaultSpawn: RapidkitSpawn = (command, args, options) => {
  let stdoutListener: ((chunk: string) => void) | undefined;
  let stderrListener: ((chunk: string) => void) | undefined;
  let killer: (() => void) | undefined;

  const completed = (async () => {
    const { execa } = (await import('execa')) as any;
    const subprocess = execa(command, args, {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeoutMs,
      reject: false,
      shell: options.shell,
      ...(options.stdin != null ? { input: options.stdin } : {}),
    });

    killer = () => {
      try {
        subprocess.kill('SIGTERM');
      } catch {
        // best-effort cancellation
      }
    };

    subprocess.stdout?.on('data', (chunk: Buffer | string) => {
      stdoutListener?.(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    });
    subprocess.stderr?.on('data', (chunk: Buffer | string) => {
      stderrListener?.(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    });

    const result = await subprocess;
    return {
      exitCode: typeof result.exitCode === 'number' ? result.exitCode : 0,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  })();

  return {
    onStdoutChunk: (listener) => {
      stdoutListener = listener;
    },
    onStderrChunk: (listener) => {
      stderrListener = listener;
    },
    completed,
    kill: () => killer?.(),
  };
};

/**
 * Run a single RapidKit CLI command programmatically, consuming the
 * `cli-log-event.v1` NDJSON stream on stderr for real progress and the trailing
 * JSON document on stdout for the definitive result (roadmap item 2.2).
 *
 * The CLI is asked for structured logs via `RAPIDKIT_LOG_FORMAT=json`, which
 * keeps stdout as the single result document and stderr as the pure event
 * stream (the channel separation guaranteed by the CLI).
 */
export async function runRapidkitStreaming<T = unknown>(
  options: StreamingRunOptions
): Promise<StreamingRunResult<T>> {
  const spawn = options.spawn ?? defaultSpawn;
  const enterpriseGate =
    options.enterpriseGate === undefined ? gateRapidkitCliArgs : options.enterpriseGate;
  if (enterpriseGate !== false) {
    const gate = await enterpriseGate({
      args: options.command,
      cwd: options.cwd,
      featureLabel: options.featureLabel ?? 'RapidKit streaming command',
    });
    if (!gate.allowed) {
      return {
        exitCode: 1,
        events: [],
        lastLifecycleEvent: null,
        result: null,
        stdout: '',
        stderr: gate.error,
        failed: true,
      };
    }
  }

  const parser = new CliLogEventStreamParser();
  const events: CliLogEvent[] = [];
  let stdoutBuffer = '';

  const execution = buildRapidkitExecutionSpec([...options.command]);
  const env: NodeJS.ProcessEnv = buildPackageRunnerSubprocessEnv({
    ...process.env,
    RAPIDKIT_LOG_FORMAT: 'json',
  });

  const subprocess = spawn(execution.command, execution.args, {
    cwd: options.cwd,
    env,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    stdin: options.stdin,
    shell: execution.shell,
  });

  const handleEvent = (event: CliLogEvent): void => {
    events.push(event);
    options.onEvent?.(event);
    if (isProgressEvent(event) || event.event === 'log') {
      options.onProgress?.(event.message, event);
    }
  };

  subprocess.onStderrChunk((chunk) => {
    for (const event of parser.push(chunk)) {
      handleEvent(event);
    }
  });
  subprocess.onStdoutChunk((chunk) => {
    stdoutBuffer += chunk;
  });

  options.signal?.onCancelled(() => {
    subprocess.kill?.();
  });

  const outcome = await subprocess.completed;

  for (const event of parser.flush()) {
    handleEvent(event);
  }

  const effectiveStdout = stdoutBuffer || outcome.stdout;
  const lastLifecycleEvent =
    [...events].reverse().find((event) => isRunLifecycleEvent(event)) ?? null;
  const result = parseTrailingJson<T>(effectiveStdout);
  const failed = outcome.exitCode !== 0 || lastLifecycleEvent?.event === 'run.failed';

  return {
    exitCode: outcome.exitCode,
    events,
    lastLifecycleEvent,
    result,
    stdout: effectiveStdout,
    stderr: outcome.stderr,
    failed,
  };
}

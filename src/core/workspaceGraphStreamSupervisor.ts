import {
  applyWorkspaceGraphStreamEvent,
  createWorkspaceGraphReplaySnapshot,
  type WorkspaceGraphStreamApplyResult,
  type WorkspaceGraphStreamEnvelope,
  type WorkspaceGraphStreamState,
} from '../contracts/workspaceGraphStream.js';
import {
  buildPackageRunnerSubprocessEnv,
  buildRapidkitExecutionSpec,
} from '../utils/platformCapabilities.js';
import { WorkspaceGraphNdjsonDecoder } from './workspaceGraphStreamDecoder.js';
import {
  DEFAULT_WORKSPACE_GRAPH_MEMORY_BUDGET_BYTES,
  WorkspaceGraphMemoryAccountant,
  type WorkspaceGraphMemorySample,
} from './workspaceGraphMemoryBudget.js';

export type WorkspaceGraphWatchProcess = {
  onStdoutChunk(listener: (chunk: string) => void): void;
  onStderrChunk(listener: (chunk: string) => void): void;
  completed: Promise<{ exitCode: number; stderr?: string }>;
  kill(): void;
};

export type WorkspaceGraphWatchSpawn = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; shell: boolean }
) => WorkspaceGraphWatchProcess;

export type WorkspaceGraphStreamStatus = 'starting' | 'live' | 'resyncing' | 'stopped' | 'error';

export type WorkspaceGraphStreamSupervisorOptions = {
  spawn?: WorkspaceGraphWatchSpawn;
  onEvent?: (event: WorkspaceGraphStreamEnvelope, state: WorkspaceGraphStreamState) => void;
  onStatus?: (status: WorkspaceGraphStreamStatus, detail?: string) => void;
  onMemorySample?: (sample: WorkspaceGraphMemorySample) => void;
  memoryBudgetBytes?: number;
};

const defaultSpawn: WorkspaceGraphWatchSpawn = (command, args, options) => {
  let stdoutListener: ((chunk: string) => void) | undefined;
  let stderrListener: ((chunk: string) => void) | undefined;
  let killSubprocess: (() => void) | undefined;
  const completed = (async () => {
    const { execa } = await import('execa');
    const subprocess = execa(command, args, {
      cwd: options.cwd,
      env: options.env,
      reject: false,
      shell: options.shell,
    });
    killSubprocess = () => {
      subprocess.kill('SIGTERM');
    };
    subprocess.stdout?.on('data', (chunk: Buffer | string) =>
      stdoutListener?.(typeof chunk === 'string' ? chunk : chunk.toString('utf8'))
    );
    subprocess.stderr?.on('data', (chunk: Buffer | string) =>
      stderrListener?.(typeof chunk === 'string' ? chunk : chunk.toString('utf8'))
    );
    const result = await subprocess;
    const stderr =
      typeof result.stderr === 'string'
        ? result.stderr
        : result.stderr
          ? String(result.stderr)
          : '';
    return { exitCode: result.exitCode ?? 0, stderr };
  })();
  return {
    onStdoutChunk: (listener) => {
      stdoutListener = listener;
    },
    onStderrChunk: (listener) => {
      stderrListener = listener;
    },
    completed,
    kill: () => {
      killSubprocess?.();
    },
  };
};

export class WorkspaceGraphStreamSupervisor {
  private process: WorkspaceGraphWatchProcess | null = null;
  private state: WorkspaceGraphStreamState | null = null;
  private workspacePath: string | null = null;
  private epoch = 0;
  private stderr = '';
  private consecutiveResyncs = 0;
  private readonly memoryAccountant = new WorkspaceGraphMemoryAccountant();

  public constructor(private readonly options: WorkspaceGraphStreamSupervisorOptions = {}) {}

  public start(workspacePath: string): void {
    const normalized = workspacePath.trim();
    if (!normalized) {
      return;
    }
    if (this.workspacePath === normalized && this.process) {
      this.replayCurrent();
      return;
    }
    this.stop(false);
    this.workspacePath = normalized;
    this.consecutiveResyncs = 0;
    this.launch('starting');
  }

  public resync(): void {
    if (!this.workspacePath) {
      return;
    }
    this.stop(false, true);
    this.launch('resyncing');
  }

  public stop(notify = true, preserveWorkspace = false): void {
    this.epoch += 1;
    this.process?.kill();
    this.process = null;
    this.state = null;
    this.memoryAccountant.reset();
    this.stderr = '';
    if (!preserveWorkspace) {
      this.consecutiveResyncs = 0;
      this.workspacePath = null;
    }
    if (notify) {
      this.options.onStatus?.('stopped');
    }
  }

  public snapshot(): WorkspaceGraphStreamState | null {
    return this.state;
  }

  public replayCurrent(): boolean {
    if (!this.state) {
      return false;
    }
    this.options.onStatus?.('live', `replayed:revision:${this.state.revision}`);
    this.options.onEvent?.(createWorkspaceGraphReplaySnapshot(this.state), this.state);
    return true;
  }

  private launch(status: 'starting' | 'resyncing'): void {
    const workspacePath = this.workspacePath;
    if (!workspacePath) {
      return;
    }
    const epoch = ++this.epoch;
    const decoder = new WorkspaceGraphNdjsonDecoder();
    this.state = null;
    this.stderr = '';
    this.options.onStatus?.(status);
    const execution = buildRapidkitExecutionSpec([
      'workspace',
      'watch',
      '--workspace',
      workspacePath,
      '--graph-stream',
      '--json',
    ]);
    const spawn = this.options.spawn ?? defaultSpawn;
    const process = spawn(execution.command, execution.args, {
      cwd: workspacePath,
      env: buildPackageRunnerSubprocessEnv({ ...processEnv(), RAPIDKIT_LOG_FORMAT: 'text' }),
      shell: execution.shell,
    });
    this.process = process;
    process.onStdoutChunk((chunk) => {
      if (epoch !== this.epoch) {
        return;
      }
      for (const event of decoder.push(chunk)) {
        this.accept(event);
      }
    });
    process.onStderrChunk((chunk) => {
      if (epoch === this.epoch) {
        this.stderr = `${this.stderr}${chunk}`.slice(-4_000);
      }
    });
    void process.completed.then((outcome) => {
      if (epoch !== this.epoch) {
        return;
      }
      for (const event of decoder.flush()) {
        this.accept(event);
      }
      this.process = null;
      if (outcome.exitCode !== 0) {
        this.options.onStatus?.('error', this.stderr.trim() || `CLI exited ${outcome.exitCode}`);
      } else {
        this.options.onStatus?.('stopped');
      }
    });
  }

  private accept(event: WorkspaceGraphStreamEnvelope): void {
    const result: WorkspaceGraphStreamApplyResult = applyWorkspaceGraphStreamEvent(
      this.state,
      event
    );
    if (result.status === 'resync-required') {
      this.consecutiveResyncs += 1;
      if (this.consecutiveResyncs > 3) {
        this.options.onStatus?.('error', `resync-exhausted:${result.reason}`);
        this.stop(false, true);
        return;
      }
      this.options.onStatus?.('resyncing', result.reason);
      queueMicrotask(() => this.resync());
      return;
    }
    if (result.status === 'applied') {
      const memorySample = this.memoryAccountant.sample(
        result.state,
        event,
        this.options.memoryBudgetBytes ?? DEFAULT_WORKSPACE_GRAPH_MEMORY_BUDGET_BYTES
      );
      this.options.onMemorySample?.(memorySample);
      if (memorySample.exceeded) {
        this.haltForMemoryBudget(memorySample);
        return;
      }
      this.state = result.state;
      if (event.type === 'graph.snapshot') {
        this.consecutiveResyncs = 0;
      }
      this.options.onStatus?.('live');
      this.options.onEvent?.(event, result.state);
    }
  }

  private haltForMemoryBudget(sample: WorkspaceGraphMemorySample): void {
    this.epoch += 1;
    this.process?.kill();
    this.process = null;
    this.options.onStatus?.(
      'error',
      `memory-budget-exceeded:${sample.estimatedBytes}:${sample.budgetBytes}`
    );
  }
}

function processEnv(): NodeJS.ProcessEnv {
  return process.env;
}

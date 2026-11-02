import crypto from 'node:crypto';
import path from 'node:path';
import * as vscode from 'vscode';
import type {
  StudioAgentToolContext,
  StudioAgentToolDefinition,
} from './studioAgentToolRegistry.js';
import { collectToolImages } from './aiImageContent.js';

type Value = Record<string, unknown>;
function value(raw: unknown): Value {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Value) : {};
}
function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}
function fingerprint(name: string, input: unknown, root: string): string {
  return crypto.createHash('sha256').update(JSON.stringify({ name, input, root })).digest('hex');
}
type TaskRun = {
  owner: string;
  scope: string;
  execution: vscode.TaskExecution;
  ended: boolean;
  background: boolean;
  exitCode?: number;
};
type NotebookRun = {
  owner: string;
  scope: string;
  document: vscode.NotebookDocument;
  cells: number[];
  started: number;
  error?: string;
};

/** Own editor executions independently of Copilot or MCP registration. */
export class StudioEditorTools implements vscode.Disposable {
  private readonly tasks = new Map<string, TaskRun>();
  private readonly taskEnds = new WeakMap<
    vscode.TaskExecution,
    { ended: boolean; exitCode?: number }
  >();
  private readonly waiters = new Set<() => void>();
  private readonly activeOperations = new Set<() => void>();
  private wake(): void {
    for (const waiter of this.waiters) {
      waiter();
    }
  }
  private async waitFor(
    context: StudioAgentToolContext,
    raw: unknown,
    done: () => boolean
  ): Promise<number> {
    const waitMs = raw ?? 0;
    if (typeof waitMs !== 'number' || !Number.isInteger(waitMs) || waitMs < 0 || waitMs > 30_000) {
      throw new Error('waitMs must be an integer from 0 to 30000.');
    }
    if (!waitMs || done()) {
      return 0;
    }
    const started = Date.now();
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        this.waiters.delete(wake);
        context.signal.removeEventListener('abort', finish);
        resolve();
      };
      const wake = () => {
        if (done()) {
          finish();
        }
      };
      const timer = setTimeout(finish, waitMs);
      this.waiters.add(wake);
      context.signal.addEventListener('abort', finish, { once: true });
      wake();
      if (context.signal.aborted) {
        finish();
      }
    });
    if (context.signal.aborted) {
      throw new Error('Editor status wait was cancelled.');
    }
    return Date.now() - started;
  }
  private readonly debug = new Map<
    string,
    { owner: string; scope: string; session: vscode.DebugSession }
  >();
  private readonly notebooks = new Map<string, NotebookRun>();
  private readonly subscriptions: vscode.Disposable[];
  constructor() {
    this.subscriptions = [
      vscode.tasks.onDidEndTaskProcess((event) => {
        this.taskEnds.set(event.execution, { ended: true, exitCode: event.exitCode });
        for (const run of this.tasks.values()) {
          if (run.execution === event.execution) {
            run.ended = true;
            run.exitCode = event.exitCode;
          }
        }
        this.wake();
      }),
      vscode.tasks.onDidEndTask((event) => {
        this.taskEnds.set(event.execution, { ...this.taskEnds.get(event.execution), ended: true });
        for (const run of this.tasks.values()) {
          if (run.execution === event.execution) {
            run.ended = true;
          }
        }
        this.wake();
      }),
      vscode.debug.onDidTerminateDebugSession((session) => {
        this.debug.delete(session.id);
      }),
    ];
    if (typeof vscode.workspace.onDidChangeNotebookDocument === 'function') {
      this.subscriptions.push(vscode.workspace.onDidChangeNotebookDocument(() => this.wake()));
    }
  }
  cancelSession(owner: string): void {
    for (const run of this.tasks.values()) {
      if (run.owner === owner && !run.ended) {
        run.execution.terminate();
      }
    }
    for (const run of this.debug.values()) {
      if (run.owner === owner) {
        void vscode.debug.stopDebugging(run.session);
      }
    }
    for (const run of this.notebooks.values()) {
      if (run.owner === owner) {
        void vscode.commands
          .executeCommand('notebook.cell.cancelExecution', {
            document: run.document.uri,
            ranges: run.cells.map((cell) => ({ start: cell, end: cell + 1 })),
          })
          .then(undefined, () => undefined);
      }
    }
  }
  dispose(): void {
    for (const abort of this.activeOperations) {
      abort();
    }
    for (const owner of new Set(
      [...this.tasks.values(), ...this.debug.values(), ...this.notebooks.values()].map(
        (run) => run.owner
      )
    )) {
      this.cancelSession(owner);
    }
    this.subscriptions.forEach((item) => item.dispose());
    this.tasks.clear();
    this.debug.clear();
    this.notebooks.clear();
    this.wake();
  }
  private root(context: StudioAgentToolContext): string {
    return path.resolve(context.projectPath ?? context.workspacePath);
  }
  private actionFingerprint(name: string, input: Value, context: StudioAgentToolContext): string {
    if (name === 'editor-debug' && input.operation === 'start') {
      const configurations = vscode.workspace
        .getConfiguration('launch', vscode.Uri.file(this.root(context)))
        .get<Array<Record<string, unknown>>>('configurations', []);
      const configuration = Array.isArray(configurations)
        ? configurations.find((entry) => entry.name === input.configuration)
        : undefined;
      return fingerprint(name, { input, configuration }, this.root(context));
    }
    return fingerprint(name, input, this.root(context));
  }
  private async taskCatalog(context: StudioAgentToolContext) {
    const root = this.root(context);
    return (await vscode.tasks.fetchTasks())
      .filter((task) =>
        typeof task.scope === 'object'
          ? inside(context.workspacePath, task.scope.uri.fsPath) ||
            inside(task.scope.uri.fsPath, root)
          : task.scope === vscode.TaskScope.Workspace
      )
      .map((task) => ({
        task,
        id: fingerprint(
          'editor-task',
          {
            name: task.name,
            source: task.source,
            definition: task.definition,
            background: task.isBackground,
            execution: task.execution,
            scope: typeof task.scope === 'object' ? task.scope.uri.toString() : task.scope,
          },
          root
        ),
      }));
  }
  tools(readOnly: boolean): StudioAgentToolDefinition[] {
    const make = (
      name: string,
      description: string,
      operations: string[],
      readOperations: string[],
      execute: (
        input: Value,
        context: StudioAgentToolContext
      ) => Promise<import('./studioAgentToolRegistry.js').StudioAgentToolResult>
    ): StudioAgentToolDefinition => ({
      name,
      title: name.replace(/-/g, ' '),
      description,
      inputSchema: {
        type: 'object',
        required: ['operation'],
        additionalProperties: false,
        properties: {
          operation: { type: 'string', enum: readOnly ? readOperations : operations },
          id: { type: 'string' },
          configuration: { type: 'string' },
          path: { type: 'string' },
          cells: { type: 'array', items: { type: 'integer', minimum: 0 }, maxItems: 50 },
          request: { type: 'string' },
          waitMs: {
            type: 'integer',
            minimum: 0,
            maximum: 30_000,
            description:
              'For pending task/notebook status, wait for completion up to this duration instead of repeatedly polling.',
          },
          arguments: { type: 'object' },
        },
      },
      activity: 'inspect',
      risk: 'read',
      authorize: async (raw, context) => {
        const input = value(raw);
        const operation = String(input.operation);
        if (!operations.includes(operation)) {
          throw new Error('Unknown editor operation.');
        }
        if (readOperations.includes(operation)) {
          return { risk: 'read' };
        }
        if (readOnly) {
          throw new Error('This editor operation requires Agent or Goal mode.');
        }
        const selectedTask =
          name === 'editor-task' && operation === 'run'
            ? (await this.taskCatalog(context)).find((entry) => entry.id === input.id)
            : undefined;
        if (name === 'editor-task' && operation === 'run' && !selectedTask) {
          throw new Error('Refresh the task catalog before running this task.');
        }
        return {
          risk: 'invasive',
          approval: {
            fingerprint: this.actionFingerprint(name, input, context),
            title: `Run ${name}: ${operation}`,
            summary: selectedTask
              ? `Run task ${selectedTask.task.name} from ${selectedTask.task.source}. Definition: ${selectedTask.id}`
              : JSON.stringify(input),
            scope: context.projectPath ? 'project' : 'workspace',
            reasons: [
              'Editor tasks, debug requests and notebook cells can execute project code and affect external systems.',
            ],
            execution: 'once',
            allowedExecutions: ['once'],
          },
        };
      },
      execute: async (raw, context) => {
        const input = value(raw);
        const operation = String(input.operation);
        if (!operations.includes(operation)) {
          throw new Error('Unknown editor operation.');
        }
        if (
          !readOperations.includes(operation) &&
          (readOnly ||
            context.approval?.fingerprint !== this.actionFingerprint(name, input, context))
        ) {
          throw new Error('Exact editor action approval is required.');
        }
        if (context.signal.aborted) {
          return { ok: false, error: 'Editor action was cancelled.' };
        }
        const controller = new AbortController();
        let rejectWait: ((error: Error) => void) | undefined;
        const abort = () => {
          controller.abort();
          rejectWait?.(
            new Error('Editor operation was cancelled. Review any retained task or kernel state.')
          );
        };
        const interrupted = new Promise<never>((_resolve, reject) => {
          rejectWait = reject;
        });
        context.signal.addEventListener('abort', abort, { once: true });
        this.activeOperations.add(abort);
        const timer = setTimeout(() => {
          controller.abort();
          rejectWait?.(
            new Error(
              'The editor operation did not finish within 45 seconds. Check task/debugger/kernel prompts or use a project command or terminal instead.'
            )
          );
        }, 45_000);
        if (context.signal.aborted) {
          abort();
        }
        try {
          return await Promise.race([
            execute(input, { ...context, signal: controller.signal }),
            interrupted,
          ]);
        } finally {
          clearTimeout(timer);
          context.signal.removeEventListener('abort', abort);
          this.activeOperations.delete(abort);
        }
      },
    });
    return [
      make(
        'editor-task',
        'List scoped VS Code tasks, run an exact catalog task id, inspect execution status/exit code, or stop a task owned by this session. A started task is not a successful task. Use run-workspace-command or terminal for captured process output.',
        ['list', 'run', 'status', 'stop'],
        ['list', 'status'],
        async (input, context) => {
          if (input.operation === 'list') {
            const catalog = await this.taskCatalog(context);
            return {
              ok: true,
              output: {
                tasks: catalog.map(({ task, id }) => ({
                  id,
                  name: task.name,
                  source: task.source,
                })),
              },
            };
          }
          if (input.operation === 'run') {
            const match = (await this.taskCatalog(context)).find((entry) => entry.id === input.id);
            if (!match) {
              throw new Error(
                'Task changed or is unavailable. Refresh the task catalog before approval.'
              );
            }
            if (context.signal.aborted) {
              throw new Error('Task launch was cancelled.');
            }
            const execution = await vscode.tasks.executeTask(match.task);
            const id = crypto.randomUUID();
            this.tasks.set(id, {
              owner: context.sessionId,
              scope: this.root(context),
              execution,
              ended: false,
              background: match.task.isBackground === true,
              ...this.taskEnds.get(execution),
            });
            if (context.signal.aborted) {
              execution.terminate();
            }
            return {
              ok: true,
              output: {
                id,
                state: 'running',
                effects: { verificationScopes: [`editor-task:${id}`] },
              },
            };
          }
          const id = String(input.id);
          const run = this.tasks.get(id);
          if (!run || run.owner !== context.sessionId || run.scope !== this.root(context)) {
            throw new Error('Task execution is not owned by this session.');
          }
          if (input.operation === 'stop') {
            run.execution.terminate();
          }
          const waitedMs =
            input.operation === 'status'
              ? await this.waitFor(context, input.waitMs, () => run.ended || run.background)
              : 0;
          return {
            ok: true,
            output: {
              id,
              state: run.ended ? 'ended' : 'running',
              background: run.background,
              waitedMs,
              exitCode: run.exitCode,
              observationScopes: run.ended || run.background ? [`editor-task:${id}`] : [],
            },
          };
        }
      ),
      make(
        'editor-debug',
        'List launch configurations and owned debug sessions. Start a named configuration, inspect threads/stackTrace/scopes/variables/source, issue an approved continue/next/stepIn/stepOut/pause/evaluate request, or stop an owned session. DAP requests use arguments; never claim success from launch alone.',
        ['list', 'start', 'inspect', 'request', 'stop'],
        ['list', 'inspect'],
        async (input, context) => {
          const root = this.root(context);
          const uri = vscode.Uri.file(root);
          if (input.operation === 'list') {
            return {
              ok: true,
              output: {
                configurations: vscode.workspace
                  .getConfiguration('launch', uri)
                  .get<Array<Record<string, unknown>>>('configurations', [])
                  .map((configuration) => ({
                    name: configuration.name,
                    type: configuration.type,
                    request: configuration.request,
                    program: configuration.program,
                  })),
                sessions: [...this.debug.values()]
                  .filter((entry) => entry.owner === context.sessionId)
                  .map(({ session }) => ({
                    id: session.id,
                    name: session.name,
                    type: session.type,
                  })),
              },
            };
          }
          if (input.operation === 'start') {
            if (typeof input.configuration !== 'string' || !input.configuration.trim()) {
              throw new Error('A launch configuration name is required.');
            }
            let started: vscode.DebugSession | undefined;
            const listener = vscode.debug.onDidStartDebugSession((session) => {
              if (
                session.name === input.configuration &&
                session.workspaceFolder &&
                inside(session.workspaceFolder.uri.fsPath, root)
              ) {
                started = session;
              }
            });
            try {
              const ok = await vscode.debug.startDebugging(
                vscode.workspace.getWorkspaceFolder(uri),
                input.configuration
              );
              if (!ok || !started) {
                return {
                  ok: false,
                  error:
                    'Debugger did not report a matching session. Check the launch configuration and installed debugger.',
                };
              }
              const session: vscode.DebugSession = started;
              this.debug.set(session.id, {
                owner: context.sessionId,
                scope: this.root(context),
                session,
              });
              if (context.signal.aborted) {
                await vscode.debug.stopDebugging(session);
              }
              return {
                ok: true,
                output: {
                  id: session.id,
                  state: 'started',
                  effects: { verificationScopes: [`editor-debug:${session.id}`] },
                },
              };
            } finally {
              listener.dispose();
            }
          }
          const id = String(input.id);
          const run = this.debug.get(id);
          if (!run || run.owner !== context.sessionId || run.scope !== this.root(context)) {
            if (input.operation === 'inspect') {
              return {
                ok: true,
                output: {
                  id,
                  state: 'ended-or-unavailable',
                  observationScopes: [`editor-debug:${id}`],
                },
              };
            }
            throw new Error('Debug session is not owned by this assistant session.');
          }
          if (input.operation === 'stop') {
            await vscode.debug.stopDebugging(run.session);
            return { ok: true, output: { id, state: 'stop-requested' } };
          }
          const request = String(input.request ?? 'threads');
          const allowed =
            input.operation === 'inspect'
              ? ['threads', 'stackTrace', 'scopes', 'variables', 'source']
              : ['continue', 'next', 'stepIn', 'stepOut', 'pause', 'evaluate'];
          if (!allowed.includes(request)) {
            throw new Error('Unsupported debug request for this operation.');
          }
          return {
            ok: true,
            output: {
              id,
              state: 'active',
              response: await run.session.customRequest(request, value(input.arguments)),
              ...(input.operation === 'inspect'
                ? { observationScopes: [`editor-debug:${id}`] }
                : { effects: { verificationScopes: [`editor-debug:${id}`] } }),
            },
          };
        }
      ),
      make(
        'editor-notebook',
        'Inspect notebook cells, execution summaries and text/image outputs; execute selected zero-based cells with the installed notebook kernel and inspect run status. Missing kernels are reported. For source changes, inspect-source then apply-workspace-patch to valid .ipynb JSON, preserving SHA/transaction checks.',
        ['inspect', 'run', 'status'],
        ['inspect', 'status'],
        async (input, context) => {
          if (input.operation === 'status') {
            const id = String(input.id);
            const run = this.notebooks.get(id);
            if (!run || run.owner !== context.sessionId || run.scope !== this.root(context)) {
              throw new Error('Notebook run is not owned by this session.');
            }
            const finished = () =>
              Boolean(run.error) ||
              run.cells.every((index) => {
                const summary = run.document.cellAt(index).executionSummary;
                return summary?.timing && summary.timing.endTime >= run.started;
              });
            const waitedMs = await this.waitFor(context, input.waitMs, finished);
            const cells = run.cells.map((index) => ({
              index,
              execution: run.document.cellAt(index).executionSummary,
            }));
            const ended =
              Boolean(run.error) ||
              cells.every(
                (cell) => cell.execution?.timing && cell.execution.timing.endTime >= run.started
              );
            return {
              ok: true,
              output: {
                id,
                state: run.error ? 'failed' : ended ? 'ended' : 'pending',
                ...(run.error ? { error: run.error } : {}),
                waitedMs,
                cells,
                observationScopes: ended ? [`editor-notebook:${id}`] : [],
              },
            };
          }
          if (typeof input.path !== 'string') {
            throw new Error('A notebook path is required.');
          }
          const target = path.resolve(this.root(context), input.path);
          const fs = await import('node:fs/promises');
          const [root, real] = await Promise.all([
            fs.realpath(this.root(context)),
            fs.realpath(target),
          ]);
          if (!inside(root, real) || path.extname(real).toLowerCase() !== '.ipynb') {
            throw new Error('Notebook must be inside the current project/workspace scope.');
          }
          const document = await vscode.workspace.openNotebookDocument(vscode.Uri.file(real));
          const indices = Array.isArray(input.cells)
            ? input.cells
            : Array.from({ length: Math.min(document.cellCount, 20) }, (_, index) => index);
          if (
            !indices.length ||
            indices.length > 50 ||
            indices.some(
              (index) =>
                !Number.isInteger(index) || Number(index) < 0 || Number(index) >= document.cellCount
            )
          ) {
            throw new Error('Notebook cell selection is invalid.');
          }
          const cells = indices as number[];
          if (input.operation === 'run') {
            const codeCells = cells.filter((index) => document.cellAt(index).kind === 2);
            if (!codeCells.length) {
              throw new Error('No executable code cells are selected.');
            }
            await vscode.window.showNotebookDocument(document, { preserveFocus: true });
            if (context.signal.aborted) {
              throw new Error('Notebook execution was cancelled.');
            }
            const started = Date.now();
            const id = crypto.randomUUID();
            const run: NotebookRun = {
              owner: context.sessionId,
              scope: this.root(context),
              document,
              cells: codeCells,
              started,
            };
            this.notebooks.set(id, run);
            void vscode.commands
              .executeCommand('notebook.cell.execute', {
                document: document.uri,
                ranges: codeCells.map((cell) => ({ start: cell, end: cell + 1 })),
              })
              .then(undefined, (error) => {
                run.error = error instanceof Error ? error.message : String(error);
                this.wake();
              });
            if (context.signal.aborted) {
              this.cancelSession(context.sessionId);
            }
            return {
              ok: true,
              output: {
                id,
                state: 'execution-requested',
                selectedCells: codeCells,
                totalCells: document.cellCount,
                selectionIsPartial: !Array.isArray(input.cells) && document.cellCount > 20,
                effects: { verificationScopes: [`editor-notebook:${id}`] },
              },
            };
          }
          const images: Array<{ mimeType: string; data: Uint8Array }> = [];
          const result = cells.map((index) => {
            const cell = document.cellAt(index);
            return {
              index,
              kind: cell.kind,
              language: cell.document.languageId,
              source: cell.document.getText().slice(0, 5_000),
              execution: cell.executionSummary,
              outputs: cell.outputs.flatMap((output) =>
                output.items.map((item) => {
                  if (item.mime.startsWith('image/')) {
                    images.push({ mimeType: item.mime, data: item.data });
                    return { mimeType: item.mime, image: true };
                  }
                  return {
                    mimeType: item.mime,
                    text: new TextDecoder().decode(item.data).slice(0, 4_000),
                  };
                })
              ),
            };
          });
          return {
            ok: true,
            images: collectToolImages(images),
            output: { path: input.path, totalCells: document.cellCount, cells: result },
          };
        }
      ),
    ];
  }
}

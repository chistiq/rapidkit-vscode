import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';
import { opendir } from 'node:fs/promises';
import { createTwoFilesPatch } from 'diff';
import {
  StudioAgentSession,
  type StudioAgentModelAdapter,
  type StudioAgentSessionStore,
} from './studioAgentSession.js';
import {
  StudioAgentToolRegistry,
  type StudioAgentToolContext,
  type StudioAgentToolDefinition,
} from './studioAgentToolRegistry.js';
import { studioAgentInstructionsTool } from './studioAgentInstructions.js';
import { studioSourcePathDenialReason } from './studioWorkspacePathPolicy.js';
import { readStudioWorkingBytes } from './studioNativeDocuments.js';
import { studioSourceIgnore } from './studioSourceIgnore.js';
import { assertStudioSessionRetained, isStudioSessionDeleted } from './studioSessionDeletion.js';
import { deleteStudioIsolatedTaskData } from './studioIsolatedTaskStorage.js';

const digest = (text: string | null) =>
  text === null ? null : crypto.createHash('sha256').update(text).digest('hex');
type Task = { objective: string; writePaths: string[] };
type FileChange = { path: string; before: string | null; after: string; sha256: string | null };
type Segment = Task & {
  id: string;
  childSessionId: string;
  status: string;
  answer?: string;
  changes: FileChange[];
};
type Job = {
  version: 1;
  id: string;
  owner: string;
  requestId: string;
  root: string;
  identity: { dev: number; ino: number };
  createdAt: number;
  state: string;
  segments: Segment[];
  base: Record<string, string>;
  seedCoverage: { files: number; omitted: number };
};
const running = new Set<string>();
const skipped = new Set([
  '.git',
  '.workspai',
  '.rapidkit',
  'node_modules',
  'vendor',
  'dist',
  'build',
  'target',
  '.venv',
  'venv',
  '.cache',
  '.mypy_cache',
  '.pytest_cache',
  '.ruff_cache',
  '__pycache__',
  '.next',
  '.nuxt',
]);
const safe = (file: unknown): file is string =>
  typeof file === 'string' &&
  file.length > 0 &&
  file.length <= 2000 &&
  file.split('/').length <= 32 &&
  !path.isAbsolute(file) &&
  !/[\\\0]/.test(file) &&
  !file.split('/').some((p) => !p || p === '.' || p === '..') &&
  !studioSourcePathDenialReason(file) &&
  !/(?:^|\/)(?:\.aws|\.ssh|\.azure|\.kube|\.config|\.docker|\.gcloud)(?:\/|$)|\.(?:pem|key|p12|pfx)$/i.test(
    file
  );
function check(signal: AbortSignal) {
  if (signal.aborted) {
    throw new Error('Isolated task was cancelled.');
  }
}
async function seed(root: string, signal: AbortSignal) {
  const ignored = await studioSourceIgnore(root),
    files: Record<string, string> = Object.create(null);
  const queue = [''];
  let bytes = 0,
    omitted = 0,
    visited = 0;
  for (let at = 0; at < queue.length; at++) {
    check(signal);
    const currentDirectory = path.join(root, queue[at]);
    if ((await fs.realpath(currentDirectory)) !== currentDirectory) {
      throw new Error('Source directory was redirected during isolated seeding.');
    }
    for await (const entry of await opendir(currentDirectory)) {
      check(signal);
      if (++visited > 20_000) {
        throw new Error(
          'Isolated source discovery exceeds its entry budget; use focused direct tools or sequential delegation.'
        );
      }
      const relative = queue[at] ? `${queue[at]}/${entry.name}` : entry.name;
      const instruction =
        entry.name === 'AGENTS.md' || relative === '.github/copilot-instructions.md';
      const instructionDirectory = relative === '.github';
      if (entry.isSymbolicLink() && (instruction || instructionDirectory)) {
        throw new Error(
          'Applicable instructions use a link. Inspect them with parent tools and use direct or sequential execution.'
        );
      }
      if (
        skipped.has(entry.name) ||
        entry.isSymbolicLink() ||
        !safe(relative) ||
        (!instruction && !instructionDirectory && (await ignored(relative)))
      ) {
        omitted++;
        continue;
      }
      if (entry.isDirectory()) {
        if (queue.length >= 3000) {
          throw new Error(
            'Isolated source discovery exceeds its directory budget; use focused direct tools or sequential delegation.'
          );
        }
        queue.push(relative);
        continue;
      }
      if (!entry.isFile()) {
        omitted++;
        continue;
      }
      const file = path.join(root, relative),
        stat = await fs.stat(file);
      if ((await fs.realpath(file)) !== file) {
        throw new Error('Source file was redirected during isolated seeding.');
      }
      if (stat.size > 256 * 1024) {
        if (instruction) {
          throw new Error(
            'Applicable instructions exceed the source-fork budget. Use parent tools to read their complete pages.'
          );
        }
        omitted++;
        continue;
      }
      const raw = await readStudioWorkingBytes(file);
      if (raw.length > 256 * 1024 || raw.includes(0)) {
        if (instruction) {
          throw new Error(
            'Applicable instructions could not be copied as bounded text. Use parent instruction tools.'
          );
        }
        omitted++;
        continue;
      }
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw);
      } catch {
        if (instruction) {
          throw new Error(
            'Applicable instructions are not valid UTF-8. Inspect them with parent tools.'
          );
        }
        omitted++;
        continue;
      }
      bytes += raw.length;
      if (bytes > 8 * 1024 * 1024 || Object.keys(files).length >= 3000) {
        throw new Error(
          'Isolated source seed exceeds its budget. Use focused direct tools or sequential delegation; nothing was changed in the parent.'
        );
      }
      files[relative] = text;
    }
  }
  return { files, omitted };
}

/** Source-fork isolation, not an OS sandbox. Children receive no terminal, host, onboarding or scope-switch tool. */
export class StudioIsolatedTasks {
  private readonly directory: string;
  constructor(
    private readonly options: {
      storageRoot: string;
      store: StudioAgentSessionStore;
      createModel(
        objective: string,
        restored?: import('./studioAgentEvents.js').StudioAgentPersistedSession
      ): StudioAgentModelAdapter;
    }
  ) {
    this.directory = path.join(options.storageRoot, 'assistant-isolated-tasks');
  }
  private async owner(context: StudioAgentToolContext) {
    await assertStudioSessionRetained(this.options.storageRoot, context.sessionId);
    const root = path.join(
      this.directory,
      crypto.createHash('sha256').update(context.sessionId).digest('hex')
    );
    for (const directory of [this.directory, root]) {
      await fs.ensureDir(directory, { mode: 0o700 });
      const stat = await fs.lstat(directory);
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        (await fs.realpath(directory)) !== path.resolve(directory)
      ) {
        throw new Error('Isolated task storage was redirected.');
      }
    }
    return root;
  }
  private async folder(id: unknown, context: StudioAgentToolContext) {
    if (typeof id !== 'string' || !/^isolated-[a-f0-9-]{36}$/.test(id)) {
      throw new Error('Select an observed isolated task identity.');
    }
    const folder = path.join(await this.owner(context), id);
    const stat = await fs.lstat(folder);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (await fs.realpath(folder)) !== folder) {
      throw new Error('Isolated task directory was redirected.');
    }
    return folder;
  }
  private async save(folder: string, job: Job) {
    await assertStudioSessionRetained(this.options.storageRoot, job.owner);
    const content = JSON.stringify(job),
      temporary = path.join(folder, `${crypto.randomUUID()}.tmp`);
    if (Buffer.byteLength(content) > 39 * 1024 * 1024) {
      throw new Error('Isolated task receipt exceeds its storage budget.');
    }
    try {
      await fs.writeFile(temporary, JSON.stringify({ job, digest: digest(content) }), {
        flag: 'wx',
        mode: 0o600,
      });
      await fs.rename(temporary, path.join(folder, 'job.json'));
    } finally {
      await fs.remove(temporary).catch(() => undefined);
    }
  }
  private async load(id: unknown, context: StudioAgentToolContext) {
    const folder = await this.folder(id, context),
      file = path.join(folder, 'job.json'),
      stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 40 * 1024 * 1024) {
      throw new Error('Invalid isolated task receipt.');
    }
    const record = (await fs.readJSON(file)) as { job: Job; digest: string };
    const job = record.job;
    if (
      !job ||
      record.digest !== digest(JSON.stringify(job)) ||
      job.version !== 1 ||
      job.id !== id ||
      job.owner !== context.sessionId ||
      Date.now() - job.createdAt > 7 * 24 * 3600_000
    ) {
      throw new Error('Isolated task ownership, integrity or retention check failed.');
    }
    const root = await fs.realpath(context.projectPath ?? context.workspacePath),
      identity = await fs.stat(root);
    if (
      job.root !== root ||
      job.identity.dev !== identity.dev ||
      job.identity.ino !== identity.ino
    ) {
      throw new Error('Isolated task belongs to a different source directory.');
    }
    return { job, folder };
  }
  private view(job: Job) {
    return {
      jobId: job.id,
      state: job.state,
      seedCoverage: job.seedCoverage,
      segments: job.segments.map((segment) => ({
        id: segment.id,
        objective: segment.objective,
        status: segment.status,
        childSessionId: segment.childSessionId,
        answer: segment.answer,
        files: segment.changes.map((file) => ({
          path: file.path,
          created: file.before === null,
          diff: createTwoFilesPatch(file.path, file.path, file.before ?? '', file.after).slice(
            0,
            4000
          ),
        })),
      })),
      instruction:
        (job.segments.some((segment) => segment.status === 'integrated')
          ? 'Integrated segments were submitted through parent transactions; inspect the parent receipts before repeating work. Remaining segments are private proposals. '
          : 'These are private source-fork proposals; no parent file has changed. ') +
        'Review and integrate selected completed segments through integrate-isolated-task, then run parent project checks and final verification. Terminal/IDE/CLI actions remain available to the parent or sequential delegate-task; private children cannot execute them.',
    };
  }
  private async create(tasks: unknown, context: StudioAgentToolContext) {
    if (!Array.isArray(tasks) || !tasks.length || tasks.length > 3) {
      throw new Error('Provide one to three independent focused tasks.');
    }
    const claimed = new Set<string>();
    for (const task of tasks as Task[]) {
      if (
        !task ||
        Object.keys(task).some((key) => !['objective', 'writePaths'].includes(key)) ||
        typeof task.objective !== 'string' ||
        !task.objective.trim() ||
        task.objective.length > 4000 ||
        !Array.isArray(task.writePaths) ||
        !task.writePaths.length ||
        task.writePaths.length > 8
      ) {
        throw new Error('Each task needs an objective and exact source-relative writePaths.');
      }
      for (const file of task.writePaths) {
        if (
          !safe(file) ||
          [...claimed].some(
            (other) =>
              other === file || other.startsWith(file + '/') || file.startsWith(other + '/')
          )
        ) {
          throw new Error('Isolated write claims must be safe, exact and disjoint.');
        }
        claimed.add(file);
      }
    }
    const root = await fs.realpath(context.projectPath ?? context.workspacePath),
      identity = await fs.stat(root);
    const snapshot = await seed(root, context.signal);
    check(context.signal);
    for (const file of claimed) {
      const target = path.join(root, file),
        stat = await fs.lstat(target).catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') {
            return undefined;
          }
          throw error;
        });
      if (stat && !(file in snapshot.files)) {
        throw new Error(`Claimed source was omitted by seed policy: ${file}. Use direct tools.`);
      }
      if (stat && !stat.isFile()) {
        throw new Error('Isolated claims must target regular files.');
      }
    }
    const owner = await this.owner(context);
    let retainedJobs = 0;
    for (const ownerDirectory of await fs.readdir(this.directory, { withFileTypes: true })) {
      if (!ownerDirectory.isDirectory() || !/^[a-f0-9]{64}$/.test(ownerDirectory.name)) {
        continue;
      }
      for (const item of await fs.readdir(path.join(this.directory, ownerDirectory.name), {
        withFileTypes: true,
      })) {
        if (!item.isDirectory() || !/^isolated-[a-f0-9-]{36}$/.test(item.name)) {
          continue;
        }
        const target = path.join(this.directory, ownerDirectory.name, item.name),
          stat = await fs.lstat(target);
        if (!running.has(item.name) && Date.now() - stat.mtimeMs > 7 * 24 * 3600_000) {
          await fs.remove(target);
        } else {
          retainedJobs++;
        }
      }
    }
    if (retainedJobs >= 16) {
      throw new Error(
        'The private source-fork quota is full. Discard old jobs before creating another.'
      );
    }
    const names = (await fs.readdir(owner)).filter((name) => /^isolated-[a-f0-9-]{36}$/.test(name));
    if (names.length >= 4) {
      throw new Error(
        'This chat retains four source forks. Inspect/discard an earlier job before creating another.'
      );
    }
    const job: Job = {
      version: 1,
      id: `isolated-${crypto.randomUUID()}`,
      owner: context.sessionId,
      requestId: context.requestId,
      root,
      identity: { dev: identity.dev, ino: identity.ino },
      createdAt: Date.now(),
      state: 'prepared',
      base: snapshot.files,
      seedCoverage: { files: Object.keys(snapshot.files).length, omitted: snapshot.omitted },
      segments: tasks.map((task: Task) => ({
        ...task,
        id: crypto.randomUUID(),
        childSessionId: crypto.randomUUID(),
        status: 'prepared',
        changes: [],
      })),
    };
    const folder = path.join(owner, job.id);
    await fs.mkdir(folder, { mode: 0o700 });
    try {
      await this.save(folder, job);
      for (const segment of job.segments) {
        await fs.ensureDir(path.join(folder, segment.id, 'source'), { mode: 0o700 });
        for (const [file, text] of Object.entries(job.base)) {
          check(context.signal);
          await fs.outputFile(path.join(folder, segment.id, 'source', file), text, { mode: 0o600 });
        }
      }
    } catch (error) {
      await fs.remove(folder);
      throw error;
    }
    return { job, folder };
  }
  private childRegistry(root: string, segment: Segment) {
    const registry = new StudioAgentToolRegistry(),
      inspected = new Map<string, string | null>();
    const target = async (raw: unknown) => {
      if (!safe(raw)) {
        throw new Error('Use a safe source-relative path inside this private fork.');
      }
      const file = path.join(root, raw),
        parent = path.dirname(file);
      let existing = parent;
      while (!(await fs.pathExists(existing))) {
        existing = path.dirname(existing);
      }
      const real = await fs.realpath(existing),
        relative = path.relative(root, real);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error('Isolated source path escaped its fork.');
      }
      const stat = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          return undefined;
        }
        throw error;
      });
      if (stat && (!stat.isFile() || stat.isSymbolicLink())) {
        throw new Error('Isolated source must be a regular file.');
      }
      return { file, relative: raw };
    };
    registry.register({
      ...studioAgentInstructionsTool,
      async execute(raw, context) {
        const stat = await fs.lstat(root);
        if (!stat.isDirectory() || stat.isSymbolicLink() || (await fs.realpath(root)) !== root) {
          throw new Error('Private source fork was redirected.');
        }
        return studioAgentInstructionsTool.execute(raw, context);
      },
    });
    registry.register({
      name: 'inspect-source',
      title: 'Read private source',
      risk: 'read',
      activity: 'inspect',
      description:
        'Read up to eight exact source files in this private fork before editing. No original source or terminal is accessible.',
      inputSchema: {
        type: 'object',
        required: ['paths'],
        properties: {
          paths: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string' } },
        },
      },
      async execute(raw, context) {
        const paths = (raw as { paths?: unknown }).paths;
        if (!Array.isArray(paths) || !paths.length || paths.length > 8) {
          throw new Error('Select up to eight private source paths.');
        }
        const output = [];
        for (const relative of paths) {
          check(context.signal);
          const { file } = await target(relative);
          const text = await fs.readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT') {
              return null;
            }
            throw error;
          });
          if (text !== null && text.length > 48 * 1024) {
            throw new Error('Private source file exceeds the focused read budget.');
          }
          const sha256 = digest(text);
          inspected.set(relative, sha256);
          output.push({ path: relative, exists: text !== null, sha256, content: text ?? '' });
        }
        return { ok: true, output };
      },
    });
    registry.register({
      name: 'apply-isolated-edits',
      title: 'Edit claimed private source',
      risk: 'safe-write',
      activity: 'change',
      description:
        'Replace one inspected claimed file in the private fork. This does not edit the parent. Parent integration and verification are separate.',
      inputSchema: {
        type: 'object',
        required: ['path', 'content'],
        additionalProperties: false,
        properties: { path: { type: 'string' }, content: { type: 'string', maxLength: 48000 } },
      },
      async execute(raw, context) {
        const input = raw as { path: unknown; content: unknown };
        if (
          !safe(input.path) ||
          !segment.writePaths.includes(input.path) ||
          typeof input.content !== 'string' ||
          input.content.length > 48000 ||
          input.content.includes('\0')
        ) {
          throw new Error('Edit only an exact claimed text path.');
        }
        const { file } = await target(input.path),
          before = await fs.readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT') {
              return null;
            }
            throw error;
          });
        if (!inspected.has(input.path) || inspected.get(input.path) !== digest(before)) {
          throw new Error('Inspect current private source before replacing it.');
        }
        if (path.extname(file) === '.json') {
          JSON.parse(input.content);
        }
        check(context.signal);
        await fs.outputFile(file, input.content, { mode: 0o600 });
        inspected.set(input.path, digest(input.content));
        return {
          ok: true,
          changed: true,
          output: {
            privateForkOnly: true,
            changedPaths: [input.path],
            instruction: 'Private proposal only; no parent changes or verified completion.',
          },
        };
      },
    });
    return registry;
  }
  tools(): StudioAgentToolDefinition[] {
    return [
      {
        name: 'delegate-isolated-tasks',
        title: 'Delegate independent edits in parallel source forks',
        risk: 'read',
        activity: 'inspect',
        description:
          'Run up to three focused editable children concurrently in independent private source forks seeded from current source and unsaved buffers. Declare disjoint exact writePaths and include all constraints. Children may inspect source and edit only their claims; they have no terminal, host, onboarding or scope-switch tools. Parent retains all capabilities and must integrate/review/test proposals. Supports status, resume and discard by observed jobId; completed child work is not repeated on resume. Not an OS sandbox or a Git branch/worktree.',
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            operation: {
              type: 'string',
              enum: ['run', 'status', 'resume', 'discard'],
              default: 'run',
            },
            jobId: { type: 'string' },
            tasks: {
              type: 'array',
              minItems: 1,
              maxItems: 3,
              items: {
                type: 'object',
                required: ['objective', 'writePaths'],
                additionalProperties: false,
                properties: {
                  objective: { type: 'string', maxLength: 4000 },
                  writePaths: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 8,
                    items: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        execute: async (raw, context) => {
          if (
            !raw ||
            typeof raw !== 'object' ||
            Array.isArray(raw) ||
            Object.keys(raw).some((key) => !['operation', 'jobId', 'tasks'].includes(key))
          ) {
            throw new Error('Invalid isolated-task request.');
          }
          const input = raw as { operation?: string; jobId?: string; tasks?: unknown };
          const operation = input.operation ?? 'run';
          if (!['run', 'status', 'resume', 'discard'].includes(operation)) {
            throw new Error('Unknown isolated-task operation.');
          }
          if (operation === 'status' || operation === 'discard') {
            const { job, folder } = await this.load(input.jobId, context);
            if (operation === 'discard') {
              if (running.has(job.id)) {
                throw new Error('Stop the running fork before discarding it.');
              }
              await fs.remove(folder);
              return { ok: true, output: { jobId: job.id, state: 'discarded' } };
            }
            return { ok: true, output: this.view(job) };
          }
          const bridge = context.delegate;
          if (!bridge || bridge.remainingProviderRequests < 4 || bridge.remainingTokens < 2000) {
            return {
              ok: false,
              error:
                'Insufficient parent allowance for isolation; use direct tools or sequential delegation.',
            };
          }
          const { job, folder } =
            operation === 'resume'
              ? await this.load(input.jobId, context)
              : await this.create(input.tasks, context);
          if (running.has(job.id) || job.state === 'integrated') {
            throw new Error('This fork is already running or integrated.');
          }
          running.add(job.id);
          job.state = 'running';
          const pending = job.segments.filter(
            (segment) => !['completed', 'integrated'].includes(segment.status)
          );
          const budgetUsage = {
            providerRequests: 0,
            inputTokens: 0,
            outputTokens: 0,
            estimatedTokenMeasurements: 0,
          };
          try {
            await this.save(folder, job);
            const outcomes = await Promise.allSettled(
              pending.map(async (segment) => {
                const root = path.join(folder, segment.id, 'source');
                const sourceStat = await fs.lstat(root);
                if (
                  !sourceStat.isDirectory() ||
                  sourceStat.isSymbolicLink() ||
                  (await fs.realpath(root)) !== root
                ) {
                  throw new Error('Private source fork was redirected.');
                }
                const task = `Parent request/constraints:\n${bridge.parentContext}\n\nYour segment: ${segment.objective}\nExact writable source paths: ${JSON.stringify(segment.writePaths)}\nAvailable private source files (bounded): ${JSON.stringify(Object.keys(job.base).slice(0, 300))}. All parent tools remain available to the parent; ask it to run checks or external tools. You have no command execution. Inspect applicable instructions, inspect each claimed file before editing, make focused source proposals, and report what changed and what still needs checking. Do not claim edits in this private fork changed the parent or verified the complete request.`;
                const restored =
                  operation === 'resume'
                    ? await this.options.store.load?.(segment.childSessionId)
                    : undefined;
                const child = new StudioAgentSession(
                  {
                    id: segment.childSessionId,
                    parent: {
                      sessionId: context.sessionId,
                      requestId: job.requestId,
                      toolCallId: context.toolCallId,
                      kind: 'execution',
                      objective: segment.objective,
                    },
                    workspacePath: root,
                    cardId: 'assistant:execution-subagent',
                    assistantMode: 'agent',
                    executionAuthority: 'workspace',
                    permissionLevel: 'default',
                    workspaceTrusted: true,
                    requiresVerifiedCompletion: false,
                    effectsManagedByParent: true,
                    returnOnInput: true,
                    restoredSession: restored,
                    providerRequestBudget: Math.max(
                      1,
                      Math.floor(bridge.remainingProviderRequests / Math.max(1, pending.length))
                    ),
                    tokenBudget: Math.max(
                      1,
                      Math.floor(bridge.remainingTokens / Math.max(1, pending.length))
                    ),
                    maxTurns: 30,
                  },
                  this.options.createModel(task, restored),
                  this.childRegistry(root, segment),
                  this.options.store
                );
                const stop = () => child.cancel();
                const unsteer = bridge.subscribeToSteering?.((message, images) =>
                  child.steer(message, images)
                );
                context.signal.addEventListener('abort', stop, { once: true });
                try {
                  if (context.signal.aborted) {
                    stop();
                  }
                  await context.reportProgress?.({
                    jobId: job.id,
                    childSessionId: child.id,
                    summary: `Isolated task: ${segment.objective.slice(0, 150)}`,
                  });
                  const prior = restored?.budgetLedger;
                  const state = await child.run(task, { userRequest: '' });
                  segment.status = state.status;
                  const terminal = [...state.events]
                    .reverse()
                    .find((event) =>
                      ['session.completed', 'session.failed', 'session.cancelled'].includes(
                        event.type
                      )
                    );
                  const question = [...state.events]
                    .reverse()
                    .find(
                      (event) => event.type === 'model.message' && event.data.inputRequired === true
                    );
                  segment.answer = String(
                    terminal?.data.summary ??
                      terminal?.data.answer ??
                      question?.data.text ??
                      'No final answer; inspect the retained child.'
                  ).slice(0, 4000);
                  budgetUsage.providerRequests += Math.max(
                    0,
                    (state.budgetLedger?.totalProviderRequests ?? 0) -
                      (prior?.totalProviderRequests ?? 0)
                  );
                  budgetUsage.inputTokens += Math.max(
                    0,
                    (state.budgetLedger?.totalInputTokens ?? 0) - (prior?.totalInputTokens ?? 0)
                  );
                  budgetUsage.outputTokens += Math.max(
                    0,
                    (state.budgetLedger?.totalOutputTokens ?? 0) - (prior?.totalOutputTokens ?? 0)
                  );
                  budgetUsage.estimatedTokenMeasurements += Math.max(
                    0,
                    (state.budgetLedger?.estimatedTokenMeasurements ?? 0) -
                      (prior?.estimatedTokenMeasurements ?? 0)
                  );
                  segment.changes = [];
                  for (const file of segment.writePaths) {
                    const after = await fs
                      .readFile(path.join(root, file), 'utf8')
                      .catch((error: NodeJS.ErrnoException) => {
                        if (error.code === 'ENOENT') {
                          return null;
                        }
                        throw error;
                      });
                    const before = Object.prototype.hasOwnProperty.call(job.base, file)
                      ? job.base[file]
                      : null;
                    if (after !== null && after !== before) {
                      segment.changes.push({ path: file, before, after, sha256: digest(before) });
                    }
                  }
                } catch (error) {
                  segment.status = 'failed';
                  segment.answer = error instanceof Error ? error.message : String(error);
                } finally {
                  unsteer?.();
                  context.signal.removeEventListener('abort', stop);
                }
              })
            );
            outcomes.forEach((outcome, index) => {
              if (outcome.status === 'rejected') {
                pending[index].status = 'failed';
                pending[index].answer = String(
                  outcome.reason instanceof Error ? outcome.reason.message : outcome.reason
                ).slice(0, 4000);
              }
            });
            job.state = context.signal.aborted
              ? 'cancelled'
              : job.segments.every((segment) => segment.status === 'integrated')
                ? 'integrated'
                : job.segments.every((segment) =>
                      ['completed', 'integrated'].includes(segment.status)
                    )
                  ? 'ready'
                  : 'partial';
            await this.save(folder, job);
            return { ok: job.state === 'ready', output: { ...this.view(job), budgetUsage } };
          } finally {
            running.delete(job.id);
            if (await isStudioSessionDeleted(this.options.storageRoot, context.sessionId)) {
              await deleteStudioIsolatedTaskData(this.options.storageRoot, context.sessionId);
            }
          }
        },
      },
      {
        name: 'integrate-isolated-task',
        title: 'Integrate reviewed isolated source proposals',
        // This orchestration performs no source write: the nested parent tool
        // retains its actual risk, admission, transaction and visible edit receipt.
        risk: 'read',
        activity: 'inspect',
        description:
          'Integrate selected completed segments from an observed private job through the parent inspected-source transaction and checkpoint. Rejects changed parent source, scope mismatch and stale proposals; does not overwrite concurrent user work. Parent must still run combined checks and final review. This is not cherry-pick, terminal execution or verification.',
        inputSchema: {
          type: 'object',
          required: ['jobId', 'segmentIds'],
          additionalProperties: false,
          properties: {
            jobId: { type: 'string' },
            segmentIds: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string' } },
          },
        },
        execute: async (raw, context) => {
          if (
            !raw ||
            typeof raw !== 'object' ||
            Array.isArray(raw) ||
            Object.keys(raw).some((key) => !['jobId', 'segmentIds'].includes(key))
          ) {
            throw new Error('Invalid isolated integration request.');
          }
          const input = raw as { jobId: unknown; segmentIds: unknown };
          const { job, folder } = await this.load(input.jobId, context);
          if (
            running.has(job.id) ||
            job.state === 'integrated' ||
            !Array.isArray(input.segmentIds) ||
            !input.segmentIds.length ||
            input.segmentIds.length > 3 ||
            new Set(input.segmentIds).size !== input.segmentIds.length
          ) {
            throw new Error(
              'Select unique completed segments from an inactive, unintegrated fork.'
            );
          }
          const selected = job.segments.filter((segment) =>
            (input.segmentIds as unknown[]).includes(segment.id)
          );
          if (
            selected.length !== input.segmentIds.length ||
            selected.some((segment) => segment.status !== 'completed')
          ) {
            throw new Error('Only completed segments may be integrated.');
          }
          if (!context.delegate) {
            throw new Error('Parent integration bridge is unavailable.');
          }
          running.add(job.id);
          try {
            const files = selected.flatMap((segment) => segment.changes);
            if (files.length > 16) {
              throw new Error('Integrate at most sixteen claimed files in one transaction.');
            }
            const instructions = new Set(['AGENTS.md', '.github/copilot-instructions.md']);
            for (const file of files) {
              const parts = file.path.split('/');
              for (let length = 1; length < parts.length; length++) {
                instructions.add(`${parts.slice(0, length).join('/')}/AGENTS.md`);
              }
            }
            for (const file of instructions) {
              check(context.signal);
              const target = path.join(job.root, file);
              const stat = await fs.lstat(target).catch((error: NodeJS.ErrnoException) => {
                if (error.code === 'ENOENT') {
                  return undefined;
                }
                throw error;
              });
              if (
                stat &&
                (!stat.isFile() || stat.isSymbolicLink() || (await fs.realpath(target)) !== target)
              ) {
                return {
                  ok: false,
                  error:
                    'Repository instructions were redirected after the fork. Read current parent instructions before preparing a new proposal.',
                };
              }
              const current = stat ? (await readStudioWorkingBytes(target)).toString('utf8') : null;
              const original = Object.prototype.hasOwnProperty.call(job.base, file)
                ? job.base[file]
                : null;
              if (digest(current) !== digest(original)) {
                return {
                  ok: false,
                  error:
                    'Repository instructions changed after the fork. Read the new parent rules and prepare a fresh proposal; no private changes were integrated.',
                };
              }
            }
            for (const file of files) {
              if (
                !safe(file.path) ||
                !selected.some((segment) => segment.writePaths.includes(file.path))
              ) {
                throw new Error('Invalid persisted write claim.');
              }
              check(context.signal);
              const target = path.join(job.root, file.path);
              const stat = await fs.lstat(target).catch((error: NodeJS.ErrnoException) => {
                if (error.code === 'ENOENT') {
                  return undefined;
                }
                throw error;
              });
              if (stat && (!stat.isFile() || stat.isSymbolicLink())) {
                throw new Error('Parent source is no longer a regular file.');
              }
              if (stat) {
                const real = await fs.realpath(target),
                  relative = path.relative(job.root, real);
                if (
                  relative === '..' ||
                  relative.startsWith(`..${path.sep}`) ||
                  path.isAbsolute(relative) ||
                  !safe(relative.replace(/\\/g, '/'))
                ) {
                  throw new Error('Parent source was redirected after the fork.');
                }
              }
              const text = stat ? (await readStudioWorkingBytes(target)).toString('utf8') : null;
              if (digest(text) !== file.sha256) {
                return {
                  ok: false,
                  error: `Parent source changed after the fork: ${file.path}. Review the conflict; no proposal was applied.`,
                };
              }
            }
            if (!files.length) {
              for (const segment of selected) {
                segment.status = 'integrated';
              }
              job.state = job.segments.every((segment) => segment.status === 'integrated')
                ? 'integrated'
                : 'partial-integration';
              await this.save(folder, job);
              return {
                ok: true,
                changed: false,
                output: { jobId: job.id, state: job.state, noProposedChanges: true },
              };
            }
            const observed = await context.delegate.invoke(
              'inspect-source',
              { paths: files.map((file) => file.path) },
              'Inspect exact parent baselines before isolated integration'
            );
            if (!observed.ok) {
              return observed;
            }
            const observations = Array.isArray(observed.output)
              ? observed.output
              : observed.output && typeof observed.output === 'object'
                ? (observed.output as { files?: unknown }).files
                : undefined;
            if (
              !Array.isArray(observations) ||
              files.some(
                (file) =>
                  !observations.some(
                    (entry) => entry && entry.path === file.path && entry.sha256 === file.sha256
                  )
              )
            ) {
              return {
                ok: false,
                error: 'Parent source changed during integration inspection; nothing was applied.',
              };
            }
            const result = await context.delegate.invoke(
              'apply-workspace-patch',
              {
                patches: files.map((file) => ({
                  relativePath: file.path,
                  patchedContent: file.after,
                  baseSha256: file.sha256,
                })),
              },
              'Integrate disjoint private proposals through the parent checkpoint'
            );
            if (!result.ok) {
              return result;
            }
            for (const segment of selected) {
              segment.status = 'integrated';
            }
            job.state = job.segments.every((segment) => segment.status === 'integrated')
              ? 'integrated'
              : 'partial-integration';
            await this.save(folder, job);
            return {
              ok: true,
              changed: false,
              output: {
                jobId: job.id,
                state: job.state,
                parentTransactionId:
                  result.output && typeof result.output === 'object'
                    ? (result.output as { transactionId?: unknown }).transactionId
                    : undefined,
                instruction:
                  'The nested parent source transaction owns these changes and Undo. Run applicable combined checks and final review; child completion did not verify the parent objective.',
              },
            };
          } finally {
            running.delete(job.id);
          }
        },
      },
    ];
  }
}

import crypto from 'node:crypto';

import {
  createStudioAgentEvent,
  type StudioAgentEvent,
  type StudioAgentPersistedSession,
  type StudioAgentSessionStatus,
} from './studioAgentEvents.js';
import {
  resolveStudioAgentToolPermission,
  type StudioAgentPermissionLevel,
  type StudioAgentToolContext,
  type StudioAgentToolRegistry,
  type StudioAgentToolResult,
} from './studioAgentToolRegistry.js';
import type { WorkspaiAssistantMode } from './assistantModeContract.js';

export type StudioAgentModelAction =
  | { type: 'tool'; toolName: string; input: unknown; reason: string }
  | { type: 'message'; text: string }
  | { type: 'complete'; summary: string };

export type StudioAgentModelContext = {
  session: StudioAgentPersistedSession;
  tools: Array<{
    name: string;
    title: string;
    description: string;
    inputSchema: Record<string, unknown>;
    activity: string;
    risk: string;
  }>;
  latestObservation?: StudioAgentToolResult;
  steering: string[];
};

export interface StudioAgentModelAdapter {
  next(context: StudioAgentModelContext): Promise<StudioAgentModelAction>;
  compact?(context: StudioAgentModelContext): Promise<string>;
}

export interface StudioAgentSessionStore {
  save(session: StudioAgentPersistedSession): Promise<void>;
  load?(sessionId: string): Promise<StudioAgentPersistedSession | undefined>;
}

const DURABLE_EVENT_STRING_LIMIT = 2_000;
const DURABLE_EVENT_ARRAY_LIMIT = 50;

function durableEventValue(value: unknown, depth = 0): unknown {
  if (depth > 5) {
    return '[depth-limited]';
  }
  if (typeof value === 'string') {
    return value.length > DURABLE_EVENT_STRING_LIMIT
      ? `${value.slice(0, DURABLE_EVENT_STRING_LIMIT)}…`
      : value;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, DURABLE_EVENT_ARRAY_LIMIT)
      .map((entry) => durableEventValue(entry, depth + 1));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 80)
      .map(([key, entry]) => [
        key,
        /^(?:content|originalContent|patchedContent)$/i.test(key)
          ? '[omitted from durable session]'
          : durableEventValue(entry, depth + 1),
      ])
  );
}

function durableToolResult(result: StudioAgentToolResult): StudioAgentToolResult {
  return durableEventValue(result) as StudioAgentToolResult;
}

export type StudioAgentSessionOptions = {
  id?: string;
  workspacePath: string;
  projectPath?: string;
  cardId: string;
  assistantMode: WorkspaiAssistantMode;
  selectedModelId?: string;
  blockerSignature?: string;
  permissionLevel: StudioAgentPermissionLevel;
  workspaceTrusted: boolean;
  requiresVerifiedCompletion?: boolean;
  checkpointEvery?: number;
  maxTurns?: number;
  maxModelDecisionsWithoutSourceProgress?: number;
  restoredSession?: StudioAgentPersistedSession;
};

export class StudioAgentSession {
  private static readonly MAX_IN_MEMORY_EVENTS = 500;
  private readonly listeners = new Set<(event: StudioAgentEvent) => void>();
  private readonly steering: string[] = [];
  private readonly abortController = new AbortController();
  private readonly toolAttemptsByEpoch = new Map<string, number>();
  private readonly exhaustedTools = new Set<string>();
  private causalEpoch = 0;
  private latestEvidenceGeneration: string | undefined;
  private latestBlockerSignature: string | undefined;
  private running: Promise<StudioAgentPersistedSession> | undefined;
  private state: StudioAgentPersistedSession;

  constructor(
    private readonly options: StudioAgentSessionOptions,
    private readonly model: StudioAgentModelAdapter,
    private readonly registry: StudioAgentToolRegistry,
    private readonly store: StudioAgentSessionStore,
    private readonly now: () => Date = () => new Date()
  ) {
    const createdAt = this.now().toISOString();
    this.state = options.restoredSession
      ? structuredClone(options.restoredSession)
      : {
          schemaVersion: 'workspai.studio-agent-session.v1',
          id: options.id ?? crypto.randomUUID(),
          workspacePath: options.workspacePath,
          ...(options.projectPath ? { projectPath: options.projectPath } : {}),
          cardId: options.cardId,
          assistantMode: options.assistantMode,
          ...(options.selectedModelId ? { selectedModelId: options.selectedModelId } : {}),
          ...(options.blockerSignature ? { blockerSignature: options.blockerSignature } : {}),
          status: 'idle',
          createdAt,
          updatedAt: createdAt,
          sequence: 0,
          events: [],
        };
    this.latestBlockerSignature =
      options.blockerSignature ?? options.restoredSession?.blockerSignature;
    for (const event of this.state.events) {
      const data =
        event.data && typeof event.data === 'object' && !Array.isArray(event.data)
          ? (event.data as Record<string, unknown>)
          : undefined;
      if (data?.changed === true) {
        this.exhaustedTools.clear();
      }
      this.rememberExhaustedTools(data?.output);
    }
  }

  get id(): string {
    return this.state.id;
  }

  snapshot(): StudioAgentPersistedSession {
    return structuredClone(this.state);
  }

  onEvent(listener: (event: StudioAgentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  steer(message: string): void {
    const normalized = message.trim();
    if (!normalized) {
      return;
    }
    this.steering.push(normalized);
    void this.emit('request.steered', { message: normalized });
  }

  cancel(): void {
    this.abortController.abort();
  }

  run(request: string): Promise<StudioAgentPersistedSession> {
    if (this.running) {
      this.steer(request);
      return this.running;
    }
    this.running = this.execute(request).finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async execute(request: string): Promise<StudioAgentPersistedSession> {
    const requestId = crypto.randomUUID();
    await this.setStatus('running');
    await this.emit(
      'request.started',
      {
        request,
        assistantMode: this.state.assistantMode,
        selectedModelId: this.state.selectedModelId,
      },
      requestId
    );
    let latestObservation: StudioAgentToolResult | undefined;
    let turnsSinceCheckpoint = 0;
    let totalTurns = 0;
    let consecutiveProtocolMisses = 0;
    let consecutiveCausalRejections = 0;
    let causalRecoveryAttempts = 0;
    let modelDecisionsWithoutSourceProgress = 0;
    let deterministicRecoveryPending =
      this.state.assistantMode === 'agent' &&
      Boolean(this.registry.get('recover-active-blocker')) &&
      !this.state.events.some((event) => {
        if (event.type !== 'tool.completed' && event.type !== 'tool.failed') {
          return false;
        }
        const data =
          event.data && typeof event.data === 'object' && !Array.isArray(event.data)
            ? (event.data as Record<string, unknown>)
            : undefined;
        return data?.toolName === 'recover-active-blocker';
      });
    try {
      while (!this.abortController.signal.aborted) {
        totalTurns += 1;
        // maxTurns is an explicit test/host safety boundary. Production Agent
        // sessions are durable and checkpointed; an arbitrary per-request turn
        // count must never hand an unresolved blocker back to the operator.
        if (this.options.maxTurns !== undefined && totalTurns > this.options.maxTurns) {
          throw new Error(
            'Assistant turn budget exhausted. The durable session can resume safely.'
          );
        }
        const modelDecisionLimit = this.options.maxModelDecisionsWithoutSourceProgress ?? 12;
        if (
          this.state.assistantMode === 'agent' &&
          modelDecisionsWithoutSourceProgress >= modelDecisionLimit
        ) {
          if (this.registry.get('verify-blocker')) {
            await this.emit(
              'model.checkpoint',
              {
                summary:
                  'Provider-call circuit breaker reached. Studio is verifying once without spending another model call.',
                recovery: 'provider-call-circuit-breaker',
                modelDecisions: modelDecisionsWithoutSourceProgress,
              },
              requestId
            );
            latestObservation = await this.executeTool(
              {
                type: 'tool',
                toolName: 'verify-blocker',
                input: {},
                reason:
                  'Protect provider credits and verify the current blocker deterministically.',
              },
              requestId
            );
            if (latestObservation.ok === true && latestObservation.cardBlocking === false) {
              await this.emit(
                'session.completed',
                { summary: 'Deterministic verification confirmed that the blocker is resolved.' },
                requestId
              );
              await this.setStatus('completed');
              return this.snapshot();
            }
          }
          throw new Error(
            `Studio stopped provider calls after ${modelDecisionLimit} model decisions without a source change. ` +
              'The blocker remains verified as unresolved; no additional model credit was spent.'
          );
        }
        const action: StudioAgentModelAction = deterministicRecoveryPending
          ? {
              type: 'tool',
              toolName: 'recover-active-blocker',
              input: {},
              reason:
                'Run the contract-first blocker recovery prelude before spending a model decision.',
            }
          : await this.model.next(this.modelContext(latestObservation));
        if (deterministicRecoveryPending) {
          deterministicRecoveryPending = false;
          await this.emit(
            'model.checkpoint',
            {
              summary:
                'Studio is resolving the fresh blocker contract before asking the model to explore source.',
              recovery: 'active-blocker-prelude',
            },
            requestId
          );
        } else {
          modelDecisionsWithoutSourceProgress += 1;
        }
        turnsSinceCheckpoint += 1;
        if (action.type === 'message') {
          consecutiveProtocolMisses += 1;
          await this.emit('model.message', { text: action.text }, requestId);
          if (consecutiveProtocolMisses >= 3) {
            throw new Error(
              'Selected model did not produce a valid native Studio tool call after 3 attempts.'
            );
          }
          latestObservation = {
            ok: false,
            error:
              'The repair is still active. Choose a tool or complete only after verified evidence.',
          };
        } else if (action.type === 'complete') {
          consecutiveProtocolMisses = 0;
          if (
            this.options.requiresVerifiedCompletion === false ||
            this.hasVerifiedCompletion(requestId)
          ) {
            await this.emit('session.completed', { summary: action.summary }, requestId);
            await this.setStatus('completed');
            return this.snapshot();
          }
          latestObservation = {
            ok: false,
            error:
              'Completion rejected: successful non-blocking verification and canonical post-mutation chain closure are required.',
          };
        } else {
          consecutiveProtocolMisses = 0;
          const causalEpochBeforeTool = this.causalEpoch;
          let effectiveAction = action;
          latestObservation = await this.executeTool(effectiveAction, requestId);
          const dependencyPlan = (observation: StudioAgentToolResult) => {
            const output =
              observation.output &&
              typeof observation.output === 'object' &&
              !Array.isArray(observation.output)
                ? (observation.output as Record<string, unknown>)
                : undefined;
            const candidates = Array.isArray(output?.upgradeCandidates)
              ? output.upgradeCandidates.filter(
                  (entry): entry is Record<string, unknown> =>
                    Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
                )
              : [];
            return { output, candidates };
          };
          let { output: observationOutput, candidates: upgradeCandidates } =
            dependencyPlan(latestObservation);
          const inspectedProjectName =
            typeof observationOutput?.target === 'object' &&
            observationOutput.target !== null &&
            !Array.isArray(observationOutput.target) &&
            typeof (observationOutput.target as Record<string, unknown>).projectName === 'string'
              ? String((observationOutput.target as Record<string, unknown>).projectName)
              : undefined;
          if (
            this.state.assistantMode === 'agent' &&
            effectiveAction.toolName === 'inspect-dependency-security' &&
            latestObservation.ok === true &&
            upgradeCandidates.length === 1 &&
            inspectedProjectName &&
            this.registry.get('repair-dependency-security')
          ) {
            await this.emit(
              'model.checkpoint',
              {
                summary:
                  'Fresh audit evidence identified one direct dependency path. Studio is attempting the bounded package-manager repair before upgrading it.',
                recovery: 'dependency-bounded-repair',
              },
              requestId
            );
            effectiveAction = {
              type: 'tool',
              toolName: 'repair-dependency-security',
              input: { projectName: inspectedProjectName },
              reason: 'Attempt the bounded package-manager repair once.',
            };
            latestObservation = await this.executeTool(effectiveAction, requestId);
            ({ output: observationOutput, candidates: upgradeCandidates } =
              dependencyPlan(latestObservation));
          }
          const deterministicUpgrade = upgradeCandidates.length === 1 ? upgradeCandidates[0] : null;
          if (
            this.state.assistantMode === 'agent' &&
            effectiveAction.toolName === 'repair-dependency-security' &&
            latestObservation.ok === false &&
            observationOutput?.nextAction === 'upgrade-dependency-security' &&
            deterministicUpgrade &&
            typeof deterministicUpgrade.packageName === 'string' &&
            this.registry.get('upgrade-dependency-security')
          ) {
            await this.emit(
              'model.checkpoint',
              {
                summary:
                  'The bounded repair exposed one audit-authorized direct upgrade. Studio is executing that governed transaction without another model call.',
                recovery: 'dependency-upgrade-transaction',
              },
              requestId
            );
            effectiveAction = {
              type: 'tool',
              toolName: 'upgrade-dependency-security',
              input: {
                ...(typeof observationOutput.target === 'object' &&
                observationOutput.target !== null &&
                !Array.isArray(observationOutput.target) &&
                typeof (observationOutput.target as Record<string, unknown>).projectName ===
                  'string'
                  ? {
                      projectName: (observationOutput.target as Record<string, unknown>)
                        .projectName,
                    }
                  : {}),
                packageName: deterministicUpgrade.packageName,
              },
              reason: 'Execute the single fresh audit-authorized dependency upgrade candidate.',
            };
            latestObservation = await this.executeTool(effectiveAction, requestId);
          }
          if (
            latestObservation.changed === true &&
            effectiveAction.toolName !== 'run-governed-command' &&
            effectiveAction.toolName !== 'verify-blocker'
          ) {
            modelDecisionsWithoutSourceProgress = 0;
          }
          if (this.causalEpoch > causalEpochBeforeTool) {
            causalRecoveryAttempts = 0;
          }
          const shouldRunPostMutationClosure =
            this.state.assistantMode === 'agent' &&
            latestObservation.changed === true &&
            effectiveAction.toolName !== 'run-governed-command' &&
            effectiveAction.toolName !== 'verify-blocker' &&
            Boolean(this.registry.get('run-governed-command')) &&
            Boolean(this.registry.get('verify-blocker'));
          if (shouldRunPostMutationClosure) {
            await this.emit(
              'model.checkpoint',
              {
                summary:
                  'Source changed. Studio is closing the governed intelligence loop before asking the model for another decision.',
                recovery: 'post-mutation-chain',
              },
              requestId
            );
            const chainObservation = await this.executeTool(
              {
                type: 'tool',
                toolName: 'run-governed-command',
                input: { commandId: 'workspaceIntelligenceChain' },
                reason: 'Refresh the canonical intelligence chain after a source mutation.',
              },
              requestId
            );
            latestObservation = await this.executeTool(
              {
                type: 'tool',
                toolName: 'verify-blocker',
                input: {},
                reason: 'Verify the card immediately after post-mutation evidence refresh.',
              },
              requestId
            );
            consecutiveCausalRejections = 0;
            causalRecoveryAttempts = 0;
            if (
              chainObservation.ok === true &&
              latestObservation.ok === true &&
              latestObservation.cardBlocking === false &&
              this.hasCanonicalChainClosure(requestId)
            ) {
              await this.emit(
                'session.completed',
                { summary: 'Post-mutation verification confirmed that the blocker is resolved.' },
                requestId
              );
              await this.setStatus('completed');
              return this.snapshot();
            }
          }
          const causalRejection =
            latestObservation.ok === false &&
            /already produced|already ran|same semantic|unchanged generation/i.test(
              latestObservation.error ?? ''
            );
          consecutiveCausalRejections = causalRejection ? consecutiveCausalRejections + 1 : 0;
          if (consecutiveCausalRejections >= 2) {
            if (causalRecoveryAttempts >= 1) {
              throw new Error(
                'Studio Agent stopped a causal retry loop after deterministic verification produced no new evidence.'
              );
            }
            causalRecoveryAttempts += 1;
            consecutiveCausalRejections = 0;
            await this.emit(
              'model.checkpoint',
              {
                summary:
                  'Repeated causal actions were rejected. Studio is verifying the current evidence before choosing a new path.',
                recovery: 'verify-blocker',
              },
              requestId
            );
            const causalEpochBeforeRecovery = this.causalEpoch;
            latestObservation = await this.executeTool(
              {
                type: 'tool',
                toolName: 'verify-blocker',
                input: {},
                reason: 'Recover from a causal retry loop with fresh card verification.',
              },
              requestId
            );
            if (this.causalEpoch > causalEpochBeforeRecovery) {
              causalRecoveryAttempts = 0;
            }
            if (latestObservation.ok === true && latestObservation.cardBlocking === false) {
              await this.emit(
                'session.completed',
                { summary: 'Deterministic verification confirmed that the blocker is resolved.' },
                requestId
              );
              await this.setStatus('completed');
              return this.snapshot();
            }
          }
        }

        if (turnsSinceCheckpoint >= (this.options.checkpointEvery ?? 12)) {
          await this.emit(
            'model.checkpoint',
            {
              summary: `Local checkpoint persisted after ${totalTurns} turn(s).`,
              evidenceGeneration: this.latestEvidenceGeneration,
              blockerSignature: this.latestBlockerSignature,
            },
            requestId
          );
          turnsSinceCheckpoint = 0;
        }
      }
      await this.emit('session.cancelled', { reason: 'cancelled' }, requestId);
      await this.setStatus('cancelled');
      return this.snapshot();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.emit('session.failed', { error: message }, requestId);
      await this.setStatus('failed');
      return this.snapshot();
    }
  }

  private async executeTool(
    action: Extract<StudioAgentModelAction, { type: 'tool' }>,
    requestId: string
  ): Promise<StudioAgentToolResult> {
    const tool = this.registry.get(action.toolName);
    const toolCallId = crypto.randomUUID();
    const durableInput = durableEventValue(action.input);
    await this.emit(
      'tool.requested',
      { toolName: action.toolName, reason: action.reason, input: durableInput },
      requestId,
      toolCallId
    );
    if (!tool) {
      const result = { ok: false, error: `Unknown Studio Agent tool: ${action.toolName}` };
      await this.emit('tool.failed', result, requestId, toolCallId);
      return result;
    }
    if (this.exhaustedTools.has(tool.name)) {
      const result = {
        ok: false,
        evidenceGeneration: this.latestEvidenceGeneration,
        blockerSignature: this.latestBlockerSignature,
        error:
          `${tool.name} is exhausted for the current causal source generation. ` +
          'Use the general workspace capability plane until source or blocker evidence materially changes.',
      };
      await this.emit(
        'tool.failed',
        { toolName: tool.name, input: durableInput, acceleratorExhausted: true, ...result },
        requestId,
        toolCallId
      );
      return result;
    }
    const toolAttemptKey = `${this.causalEpoch}:${tool.name}:${canonicalJson(action.input)}`;
    const attemptsInEpoch = this.toolAttemptsByEpoch.get(toolAttemptKey) ?? 0;
    const maxAttemptsWithoutProgress = 1;
    if (attemptsInEpoch >= maxAttemptsWithoutProgress) {
      const result = {
        ok: false,
        evidenceGeneration: this.latestEvidenceGeneration,
        blockerSignature: this.latestBlockerSignature,
        error:
          `${tool.name} already produced an observation in the current causal evidence generation. ` +
          'Do not repeat it. Use the prior result, choose a different causal tool, or change source evidence before retrying.',
      };
      await this.emit(
        'tool.failed',
        { toolName: tool.name, input: durableInput, duplicate: true, ...result },
        requestId,
        toolCallId
      );
      if (tool.activity === 'verify') {
        await this.emit('verify.completed', result, requestId, toolCallId);
      }
      return result;
    }
    this.toolAttemptsByEpoch.set(toolAttemptKey, attemptsInEpoch + 1);
    const permission = resolveStudioAgentToolPermission({
      level: this.options.permissionLevel,
      risk: tool.risk,
      workspaceTrusted: this.options.workspaceTrusted,
    });
    await this.emit(
      'tool.permission',
      { toolName: tool.name, ...permission },
      requestId,
      toolCallId
    );
    if (!permission.allowed) {
      const result = { ok: false, error: permission.reason };
      await this.emit('tool.failed', { toolName: tool.name, ...result }, requestId, toolCallId);
      return result;
    }
    await this.emit(
      'tool.started',
      {
        toolName: tool.name,
        activity: tool.activity,
        input: durableInput,
        reason: action.reason,
      },
      requestId,
      toolCallId
    );
    const context: StudioAgentToolContext = {
      sessionId: this.id,
      requestId,
      toolCallId,
      workspacePath: this.options.workspacePath,
      ...(this.options.projectPath ? { projectPath: this.options.projectPath } : {}),
      signal: this.abortController.signal,
    };
    let result: StudioAgentToolResult;
    try {
      result = await tool.execute(action.input, context);
    } catch (error) {
      result = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    const evidenceAdvanced =
      Boolean(result.changed) ||
      (tool.activity !== 'change' &&
        this.latestEvidenceGeneration !== undefined &&
        Boolean(result.evidenceGeneration) &&
        result.evidenceGeneration !== this.latestEvidenceGeneration) ||
      (this.latestBlockerSignature !== undefined &&
        Boolean(result.blockerSignature) &&
        result.blockerSignature !== this.latestBlockerSignature);
    if (result.evidenceGeneration) {
      this.latestEvidenceGeneration = result.evidenceGeneration;
    }
    if (result.blockerSignature) {
      this.latestBlockerSignature = result.blockerSignature;
    }
    if (result.changed === true) {
      this.exhaustedTools.clear();
    }
    this.rememberExhaustedTools(result.output);
    if (evidenceAdvanced) {
      this.causalEpoch += 1;
    }
    const durableResult = durableToolResult(result);
    await this.emit(
      result.ok ? 'tool.completed' : 'tool.failed',
      { toolName: tool.name, input: durableInput, reason: action.reason, ...durableResult },
      requestId,
      toolCallId
    );
    if (tool.activity === 'verify') {
      await this.emit('verify.completed', durableResult, requestId, toolCallId);
    }
    return result;
  }

  private hasVerifiedCompletion(requestId: string): boolean {
    const latestVerify = [...this.state.events]
      .reverse()
      .find((event) => event.type === 'verify.completed' && event.requestId === requestId);
    if (!latestVerify) {
      return false;
    }
    const result = latestVerify.data as StudioAgentToolResult;
    return (
      result.ok === true &&
      result.cardBlocking === false &&
      this.hasCanonicalChainClosure(requestId)
    );
  }

  private hasCanonicalChainClosure(requestId: string): boolean {
    const requestEvents = this.state.events.filter((event) => event.requestId === requestId);
    const latestSourceMutation = [...requestEvents].reverse().find((event) => {
      if (event.type !== 'tool.completed') {
        return false;
      }
      const data = event.data as Record<string, unknown>;
      return (
        data.changed === true &&
        data.toolName !== 'run-governed-command' &&
        data.toolName !== 'verify-blocker'
      );
    });
    if (!latestSourceMutation) {
      return true;
    }

    return requestEvents.some((event) => {
      if (event.sequence <= latestSourceMutation.sequence || event.type !== 'tool.completed') {
        return false;
      }
      const data = event.data as Record<string, unknown>;
      const toolInput =
        data.input && typeof data.input === 'object' && !Array.isArray(data.input)
          ? (data.input as Record<string, unknown>)
          : undefined;
      return (
        data.toolName === 'run-governed-command' &&
        toolInput?.commandId === 'workspaceIntelligenceChain' &&
        data.ok === true
      );
    });
  }

  private modelContext(latestObservation?: StudioAgentToolResult): StudioAgentModelContext {
    return {
      session: this.snapshot(),
      tools: this.registry
        .list()
        .filter((tool) => !this.exhaustedTools.has(tool.name))
        .map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          activity: tool.activity,
          risk: tool.risk,
        })),
      latestObservation,
      steering: this.steering.splice(0),
    };
  }

  private rememberExhaustedTools(output: unknown): void {
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      return;
    }
    const exhausted = (output as Record<string, unknown>).exhaustedTools;
    if (!Array.isArray(exhausted)) {
      return;
    }
    for (const name of exhausted) {
      if (typeof name === 'string' && this.registry.get(name)) {
        this.exhaustedTools.add(name);
      }
    }
  }

  private async setStatus(status: StudioAgentSessionStatus): Promise<void> {
    this.state.status = status;
    await this.emit('session.status', { status });
  }

  private async emit<T>(
    type: StudioAgentEvent['type'],
    data: T,
    requestId?: string,
    toolCallId?: string
  ): Promise<void> {
    const sequence = this.state.sequence + 1;
    const event = createStudioAgentEvent({
      sessionId: this.id,
      sequence,
      type,
      data,
      requestId,
      toolCallId,
      now: this.now,
    });
    this.state.sequence = sequence;
    this.state.updatedAt = event.timestamp;
    this.state.events.push(event as StudioAgentEvent);
    if (this.state.events.length > StudioAgentSession.MAX_IN_MEMORY_EVENTS) {
      this.state.events = this.state.events.slice(-StudioAgentSession.MAX_IN_MEMORY_EVENTS);
    }
    await this.store.save(this.snapshot());
    this.listeners.forEach((listener) => listener(event as StudioAgentEvent));
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

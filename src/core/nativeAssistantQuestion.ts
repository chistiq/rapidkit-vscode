import { studioProjectSelectionTool } from './studioProjectTarget.js';
import { collectAssistantUserPaths } from './consumerPathRedaction.js';
import { requestVSCodeStudioToolApproval } from './studioToolApproval.js';
import { resolveStudioCliInspectionCwd } from './studioWorkspaceAvailability.js';
import { randomUUID } from 'node:crypto';
import { studioSessionHistoryTool } from './studioSessionHistoryTool.js';
import { registerStudioResearchCapability } from './studioResearchCapabilities.js';
import { studioToolImageRetention } from './studioHostToolOutputStore.js';
import path from 'node:path';
import { runRapidkitStreaming } from './streamingRapidkitRunner.js';
import { studioWorkspaceIntelligenceReaders } from './studioWorkspaceIntelligenceReads.js';
import * as vscode from 'vscode';
import { dispatchAssistantTurn } from './assistantTurn.js';
import { askConfiguredAIProviderForToolAction } from './aiProviderService.js';
import { createConfiguredStudioAgentModel } from './configuredStudioAgentModel.js';
import { StudioAgentSession } from './studioAgentSession.js';
import { VSCodeStudioAgentSessionStore } from './studioAgentSessionStore.js';
import {
  createStudioAgentWorkspaiToolRegistry,
  type StudioAgentWorkspaiToolHost,
} from './studioAgentWorkspaiTools.js';
import { studioHostLanguageModelToolAdapters } from './studioHostLanguageModelTools.js';
import {
  discoverStudioWorkspaceFiles,
  inspectStudioWorkspaceChanges,
  inspectStudioWorkspaceDiagnostics,
  searchStudioWorkspaceSource,
} from './studioWorkspaceInspection.js';
import { inspectStudioAgentFiles } from './sidebarStudioAgentRuntime.js';
import { runStudioCodeIntelligenceTool } from './studioCodeIntelligence.js';
import { studioAssistantIdeCapabilities } from './studioAssistantIdeCapabilities.js';
import type { AIModalContext, AIConversationHistoryEntry } from './aiService.js';

/** Native Ask/Debug use the same routing, model contract, tools and durable session as Sidebar. */
export async function runNativeAssistantQuestion(input: {
  context: vscode.ExtensionContext;
  scope: AIModalContext;
  task: string;
  history: AIConversationHistoryEntry[];
  token: vscode.CancellationToken;
  toolInvocationToken?: vscode.ChatParticipantToolToken;
  modelId?: string;
  previousSessionId?: string;
  stream: Pick<vscode.ChatResponseStream, 'markdown' | 'progress' | 'button'>;
}): Promise<{ sessionId?: string; status: string }> {
  let outcome: { sessionId?: string; status: string } = {
    ...(input.previousSessionId ? { sessionId: input.previousSessionId } : {}),
    status: 'answered',
  };
  await dispatchAssistantTurn({
    task: input.task,
    selectedMode: 'ask',
    hasProjectScope: Boolean(input.scope.projectRootPath),
    history: input.history,
    isCancelled: () => input.token.isCancellationRequested,
    complete: async ({ prompt, toolName, toolSchema }) => {
      const response = await askConfiguredAIProviderForToolAction(
        input.context,
        [{ role: 'user', content: prompt }],
        [
          {
            name: toolName,
            description: 'Classify the request and preserve the user intent.',
            inputSchema: toolSchema,
          },
        ],
        input.token,
        input.modelId
      );
      return response.type === 'tool'
        ? { type: 'tool', toolName: response.toolName, input: response.input }
        : { type: 'text', text: response.text };
    },
    respond: (answer) => input.stream.markdown(answer),
    suggest: (_route, policy) => {
      if (policy.suggestion) {
        input.stream.markdown(`${policy.suggestion.description}\n\n`);
      }
    },
    execute: async (route, policy) => {
      const workspacePath = input.scope.workspaceRootPath ?? input.scope.path;
      const scoped = Boolean(workspacePath);
      const root = workspacePath ?? input.context.globalStorageUri.fsPath;
      const store = new VSCodeStudioAgentSessionStore(input.context);
      const previous = input.previousSessionId
        ? await store.load(input.previousSessionId)
        : undefined;
      const sameScope =
        previous?.assistantMode === 'ask' &&
        previous.cardId === 'assistant:ask' &&
        previous.executionAuthority === 'workspace' &&
        path.resolve(previous.workspacePath) === path.resolve(root) &&
        (previous.projectPath ? path.resolve(previous.projectPath) : undefined) ===
          (input.scope.projectRootPath ? path.resolve(input.scope.projectRootPath) : undefined);
      const sessionId = sameScope ? previous.id : randomUUID();
      const restored =
        sameScope &&
        route.continuesPreviousTask === true &&
        ['waiting-input', 'failed', 'cancelled'].includes(previous.status)
          ? previous
          : undefined;
      const previousRequest = restored
        ? [...restored.events].reverse().find((event) => event.type === 'request.started')?.data
            .request
        : undefined;
      const unavailable = async () => ({
        ok: false,
        error:
          'This is a read-only conversation. Use Agent or the governed repair surface to change files.',
      });
      const readCli = async (command: string[]) => {
        if (input.token.isCancellationRequested) {
          return { ok: false, error: 'CLI inspection was cancelled.' };
        }
        let cancellation: vscode.Disposable | undefined;
        try {
          const result = await runRapidkitStreaming({
            command,
            cwd: await resolveStudioCliInspectionCwd([
              root,
              input.context.extensionUri?.fsPath,
              process.cwd(),
            ]),
            timeoutMs: 60_000,
            featureLabel: 'Assistant CLI inspection',
            signal: {
              onCancelled(listener) {
                cancellation = input.token.onCancellationRequested(listener);
                if (input.token.isCancellationRequested) {
                  listener();
                }
              },
            },
          });
          return {
            ok: !result.failed && result.exitCode === 0,
            output: result.result ?? { text: result.stdout },
            ...(result.failed
              ? {
                  error:
                    result.stderr ||
                    'CLI inspection failed. Use the bundled catalog or other readers.',
                }
              : {}),
          };
        } finally {
          cancellation?.dispose();
        }
      };
      const host: StudioAgentWorkspaiToolHost = {
        ...studioHostLanguageModelToolAdapters(input.token, input.toolInvocationToken, {
          root: input.context.storageUri?.fsPath ?? input.context.globalStorageUri.fsPath,
        }),
        inspectCliCommands: () => readCli(['commands', '--json']),
        inspectCliHelp: (command) => readCli([...command, '--help']),
        ...studioWorkspaceIntelligenceReaders(),
        discover: async (request) => ({
          ok: true,
          output: { files: await discoverStudioWorkspaceFiles(request) },
        }),
        inspect: async (request) => ({ ok: true, output: await inspectStudioAgentFiles(request) }),
        search: async (request) => ({
          ok: true,
          output: await searchStudioWorkspaceSource(request),
        }),
        diagnostics: async (request) => ({
          ok: true,
          output: { diagnostics: inspectStudioWorkspaceDiagnostics(request) },
        }),
        codeIntelligence: runStudioCodeIntelligenceTool,
        inspectChanges: async (request) => ({
          ok: true,
          output: await inspectStudioWorkspaceChanges(request),
        }),
        applyPatches: unavailable,
        deleteFiles: unavailable,
        runGovernedCommand: unavailable,
        runWorkspaceCommand: unavailable,
        inspectRemediationPlan: unavailable,
        executeRemediationStep: unavailable,
        verify: unavailable,
      };
      const registry = createStudioAgentWorkspaiToolRegistry({
        host,
        cardId: 'assistant:ask',
        assistantMode: 'ask',
        executionAuthority: 'workspace',
        externalResearch:
          !scoped && !collectAssistantUserPaths(input.task).length && !restored?.executionTarget,
      });
      registry.register(studioSessionHistoryTool(input.context));
      registry.register(
        studioProjectSelectionTool({
          ideRoots: vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [],
        })
      );
      if (scoped) {
        studioAssistantIdeCapabilities(input.context).register(registry, true);
        registerStudioResearchCapability({
          context: input.context,
          registry,
          host,
          token: input.token,
          modelId: input.modelId,
        });
      }
      const model = createConfiguredStudioAgentModel({
        context: input.context,
        objective: `Original user request: ${typeof previousRequest === 'string' ? previousRequest : input.task}\nCurrent message: ${input.task}\nResolved intent: ${route.normalizedRequest}`,
        restoredSession: restored,
        token: input.token,
        modelId: input.modelId,
        history: input.history,
        reviewAnswerDelivery: true,
        pathIdentities: [
          { path: root, token: '$WORKSPACE' },
          { path: input.scope.projectRootPath, token: '$PROJECT' },
        ],
      });
      const session = new StudioAgentSession(
        {
          id: sessionId,
          retainToolImages: studioToolImageRetention(
            input.context.storageUri?.fsPath ?? input.context.globalStorageUri.fsPath
          ),
          restoredSession: restored,
          workspacePath: root,
          projectPath: input.scope.projectRootPath,
          cardId: 'assistant:ask',
          assistantMode: 'ask',
          executionAuthority: 'workspace',
          executionPolicy: policy,
          permissionLevel: 'default',
          workspaceTrusted: vscode.workspace.isTrusted,
          requestToolApproval: (request) =>
            requestVSCodeStudioToolApproval(request, input.context.workspaceState),
          returnOnInput: true,
          requiresVerifiedCompletion: false,
        },
        model,
        registry,
        store
      );
      const cancellation = input.token.onCancellationRequested(() => session.cancel());
      try {
        if (input.token.isCancellationRequested) {
          session.cancel();
        }
        session.onEvent((event) => {
          if (event.type === 'tool.started') {
            input.stream.progress(`Using ${String(event.data.toolName)}`);
          }
          if (event.type === 'model.message' && event.data.inputRequired === true) {
            input.stream.markdown(`${String(event.data.text)}\n\n`);
          }
        });
        const state = await session.run(input.task);
        const terminal = [...state.events]
          .reverse()
          .find((event) =>
            ['session.completed', 'session.failed', 'session.cancelled'].includes(event.type)
          );
        const answer = terminal?.data.summary ?? terminal?.data.answer ?? terminal?.data.error;
        if (typeof answer === 'string' && answer.trim()) {
          input.stream.markdown(answer);
        }
        outcome = { sessionId: state.id, status: state.status };
      } finally {
        cancellation.dispose();
      }
    },
  });
  return outcome;
}

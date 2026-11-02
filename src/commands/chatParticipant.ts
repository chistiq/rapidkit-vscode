/**
 * Workspai Chat Participant
 *
 * Registers the `@workspai` participant in the VS Code Chat panel.
 * Supports two slash commands:
 *   /ask   — freeform Q&A with full project context (architecture, modules, conventions)
 *   /debug — structured debug flow: root cause + fix + prevention
 *
 * Ask and Debug use the shared routed Studio runtime; repair retains its CLI-owned scope.
 */

import * as vscode from 'vscode';
import { runNativeAssistantQuestion } from '../core/nativeAssistantQuestion.js';
import type { AIConversationHistoryEntry } from '../core/aiService';
import { resolvePreferredAIModalContext } from '../core/aiContextResolver';
import { collectDebugPrefillQuestion } from './aiDebugger';
import { runNativeChatRepair } from '../core/nativeChatRepair.js';
import { isGoalPlanResult, runGoalCommand, type GoalPlanResult } from '../core/workspaceGoals.js';

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const PARTICIPANT_ID = 'workspai.assistant';

const EMPTY_PROMPT_MSG = {
  ask: 'Ask me anything about your Workspai project — architecture, modules, configuration, best practices.',
  debug:
    'No question or error provided. Open a file with a diagnostic error, select failing code, or describe the issue.',
  recipe:
    'Which recipe would you like to run? Try: /recipe ship-readiness, /recipe auth-hardening, /recipe test-gaps, or leave blank to pick from the full list.',
  memory:
    'Describe what you want to record in workspace memory (conventions, decisions, or project overview), or leave blank to open the memory wizard.',
  repair:
    'Run `/repair` to resolve the highest-priority canonical blocker, or add a card name such as `/repair Workspace Verify`.',
  goal: 'Describe one engineering outcome, for example: `/goal Raise test coverage to 85%`. Leave it blank to review existing Goals.',
};

// ────────────────────────────────────────────────────────────────────────────
// Context resolution
// ────────────────────────────────────────────────────────────────────────────

/**
 * Collect a prefill question for /debug mode.
 * Priority: (1) selected text in active editor  (2) VS Code diagnostics  (3) user prompt.
 */
function collectDebugContext(userPrompt: string): string {
  const prefill = collectDebugPrefillQuestion();
  if (prefill) {
    // Combine editor context with any explicit user question
    return userPrompt
      ? `${userPrompt}\n\n<editor_context>\n${prefill}\n</editor_context>`
      : prefill;
  }
  return userPrompt;
}

// ────────────────────────────────────────────────────────────────────────────
// Conversation history adapter
// ────────────────────────────────────────────────────────────────────────────

/**
 * Convert VS Code chat history turns into the internal history format.
 * Keeps only the last 8 turns to stay within context budget.
 */
function extractHistory(chatContext: vscode.ChatContext): AIConversationHistoryEntry[] {
  const entries: AIConversationHistoryEntry[] = [];

  for (const turn of chatContext.history) {
    if (turn instanceof vscode.ChatRequestTurn) {
      entries.push({ role: 'user', content: turn.prompt });
    } else if (turn instanceof vscode.ChatResponseTurn) {
      const text = turn.response
        .flatMap((part) =>
          part instanceof vscode.ChatResponseMarkdownPart ? [part.value.value] : []
        )
        .join('');
      if (text) {
        entries.push({ role: 'assistant', content: text });
      }
    }
  }

  return entries.slice(-8);
}

/** Metadata is supplied by this participant, not parsed from user prose. */
function previousQuestionSession(chatContext: vscode.ChatContext): string | undefined {
  for (const turn of [...chatContext.history].reverse()) {
    if (!(turn instanceof vscode.ChatResponseTurn) || turn.participant !== PARTICIPANT_ID) {
      continue;
    }
    const metadata = turn.result?.metadata as
      | { command?: unknown; sessionId?: unknown }
      | undefined;
    if (
      (metadata?.command === 'ask' || metadata?.command === 'debug') &&
      typeof metadata.sessionId === 'string' &&
      metadata.sessionId.length <= 200
    ) {
      return metadata.sessionId;
    }
  }
  return undefined;
}

// ────────────────────────────────────────────────────────────────────────────
// Request handler
// ────────────────────────────────────────────────────────────────────────────

async function handleWorkspaiRequest(
  request: vscode.ChatRequest,
  chatContext: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  extensionContext?: vscode.ExtensionContext
): Promise<vscode.ChatResult> {
  // Determine mode from slash command; default to 'ask'
  const rawCommand = request.command?.toLowerCase();
  const mode: 'ask' | 'debug' = rawCommand === 'debug' ? 'debug' : 'ask';

  // Handle /recipe — delegate to the recipe packs command and confirm in chat
  if (rawCommand === 'recipe') {
    const recipeId = request.prompt.trim() || undefined;
    stream.progress('Opening recipe picker…');
    await vscode.commands.executeCommand('workspai.aiRecipePacks', recipeId);
    stream.markdown(
      recipeId
        ? `Recipe **${recipeId}** opened in the AI modal.`
        : 'Recipe picker opened. Select a recipe from the panel.'
    );
    stream.button({ command: 'workspai.aiRecipePacks', title: '$(zap) Browse All Recipes' });
    return {};
  }

  // Handle /memory — delegate to the memory wizard and confirm in chat
  if (rawCommand === 'memory') {
    const memoryNote = request.prompt.trim();
    if (memoryNote) {
      stream.progress('Opening AI modal with memory context…');
      await vscode.commands.executeCommand('workspai.aiWorkspaceMemoryWizard', {
        seed: memoryNote,
        source: 'chat-participant',
        trigger: 'slash-memory',
      });
      stream.markdown(`Memory wizard opened. Your note: _"${memoryNote}"_ — add it in the wizard.`);
    } else {
      stream.progress('Opening memory wizard…');
      await vscode.commands.executeCommand('workspai.aiWorkspaceMemoryWizard');
      stream.markdown('Workspace memory wizard opened in the panel.');
    }
    stream.button({ command: 'workspai.aiWorkspaceMemoryWizard', title: '$(brain) Edit Memory' });
    return {};
  }

  if (rawCommand === 'repair') {
    if (!vscode.workspace.isTrusted) {
      stream.markdown(
        '**Workspace Trust is required.** Native repair can inspect evidence in an untrusted workspace, but it cannot start a mutation-capable CLI transaction.'
      );
      return { metadata: { command: 'repair', trusted: false } };
    }
    const ctx = await resolvePreferredAIModalContext();
    try {
      const repair = await runNativeChatRepair({
        prompt: request.prompt,
        context: ctx,
        stream,
        token,
        extensionContext,
        requestedModelId: request.model?.id,
        toolInvocationToken: request.toolInvocationToken,
        history: extractHistory(chatContext),
      });
      return { metadata: { command: 'repair', repair } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stream.markdown(
        `### Repair stopped safely\n\n${message}\n\nNo success is reported without a closed CLI repair transaction.`
      );
      return { metadata: { command: 'repair', error: message } };
    }
  }

  if (rawCommand === 'goal') {
    const intent = request.prompt.trim();
    if (!intent) {
      stream.progress('Opening governed Goals…');
      await vscode.commands.executeCommand('workspai.workspaceGoalShow');
      stream.markdown(
        'Opened the canonical Goal list. Lifecycle actions remain owned and verified by the Workspai CLI.'
      );
      return { metadata: { command: 'goal', operation: 'list' } };
    }
    const selectedProject = await vscode.commands.executeCommand<{ path?: string }>(
      'workspai.getSelectedProject'
    );
    const selectedWorkspace = await vscode.commands.executeCommand<{ path?: string }>(
      'workspai.getSelectedWorkspace'
    );
    const cwd = selectedProject?.path || selectedWorkspace?.path;
    if (!cwd) {
      stream.markdown('Select a Workspai project or workspace before planning a governed Goal.');
      return { metadata: { command: 'goal', error: 'missing-workspace' } };
    }
    stream.progress('Binding intent to the canonical Model and proof-backed Graph…');
    const result = await runGoalCommand({
      workspacePath: cwd,
      args: [intent, '--for-agent', 'generic'],
      label: 'Chat Goal Plan',
    });
    if (!result.ok) {
      stream.markdown(
        `### Goal planning stopped safely\n\n${result.error}\n\nNo source was changed and no Goal state was inferred by Chat.`
      );
      return { metadata: { command: 'goal', error: result.error } };
    }
    if (!isGoalPlanResult(result.value)) {
      stream.markdown(
        '### Goal planning stopped safely\n\nThe CLI returned a lifecycle result where a planning result was required.'
      );
      return { metadata: { command: 'goal', error: 'incompatible-result-operation' } };
    }
    const plan: GoalPlanResult = result.value;
    const posture =
      plan.result === 'planned'
        ? 'Ready for governed work'
        : plan.result === 'needs-confirmation'
          ? 'A decision is required'
          : plan.result === 'needs-evidence'
            ? 'Measurement evidence is required'
            : 'Blocked by current workspace evidence';
    stream.markdown(
      `### Goal Pack created\n\n**${intent}**\n\n- State: **${plan.result}**\n- Posture: ${posture}\n- Scope: ${plan.resolution.invocationScope}\n- Agent handoff: bounded and evidence-backed\n\nThe CLI remains the lifecycle and verification authority.`
    );
    stream.button({
      command: 'workspai.workspaceGoalShow',
      title: '$(target) Review Goal',
      arguments: [{ goalId: plan.goalPack.id }],
    });
    return {
      metadata: { command: 'goal', goalId: plan.goalPack.id, result: plan.result },
    };
  }

  // Build question
  const question: string = mode === 'debug' ? collectDebugContext(request.prompt) : request.prompt;

  if (!question.trim()) {
    stream.markdown(EMPTY_PROMPT_MSG[mode]);
    return { metadata: { command: mode } };
  }
  if (!extensionContext) {
    throw new Error('The Assistant extension context is unavailable.');
  }
  const ctx = await resolvePreferredAIModalContext();
  try {
    const result = await runNativeAssistantQuestion({
      context: extensionContext,
      scope: ctx,
      task: question,
      history: extractHistory(chatContext),
      previousSessionId: previousQuestionSession(chatContext),
      token,
      stream,
      modelId: request.model?.id,
      toolInvocationToken: request.toolInvocationToken,
    });
    return {
      metadata: {
        command: mode,
        ...result,
        ctx: { type: ctx.type, name: ctx.name, path: ctx.path },
      },
    };
  } catch (error) {
    if (!token.isCancellationRequested) {
      stream.markdown(
        `Workspai could not finish this request: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return {
      metadata: { command: mode, status: token.isCancellationRequested ? 'cancelled' : 'failed' },
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Registration
// ────────────────────────────────────────────────────────────────────────────

export function registerWorkspaiChatParticipant(context: vscode.ExtensionContext): void {
  const participant = vscode.chat.createChatParticipant(
    PARTICIPANT_ID,
    (request, chat, stream, token) => handleWorkspaiRequest(request, chat, stream, token, context)
  );

  participant.iconPath = new vscode.ThemeIcon('sparkle');

  // Register slash commands so VS Code autocompletes them in the chat panel
  if ('commands' in participant) {
    (participant as unknown as { commands: { name: string; description: string }[] }).commands = [
      { name: 'ask', description: 'Ask anything about your Workspai project' },
      { name: 'debug', description: 'Debug: root cause + fix + prevention for an error' },
      { name: 'repair', description: 'Repair a canonical blocker through the CLI Repair Engine' },
      { name: 'goal', description: 'Turn one plain-language outcome into a governed Goal Pack' },
      { name: 'recipe', description: 'Run an AI recipe pack (ship-readiness, auth-hardening, …)' },
      { name: 'memory', description: 'Open the workspace memory wizard' },
    ];
  }

  participant.followupProvider = {
    provideFollowups(
      result: vscode.ChatResult,
      _chatContext: vscode.ChatContext,
      _token: vscode.CancellationToken
    ): vscode.ChatFollowup[] {
      const meta = result.metadata as { command?: string; ctx?: { type?: string } } | undefined;

      const followups: vscode.ChatFollowup[] = [];

      if (meta?.command === 'debug') {
        followups.push(
          {
            prompt: 'Can you show me the full corrected file after this fix?',
            label: 'Show full corrected file',
            command: 'ask',
          },
          {
            prompt: 'Are there any related tests I should update?',
            label: 'Check related tests',
            command: 'ask',
          }
        );
      } else {
        followups.push(
          {
            prompt: 'How do I add tests for this?',
            label: 'Add tests',
            command: 'ask',
          },
          {
            prompt: 'Which RapidKit module would implement this best?',
            label: 'Suggest a module',
            command: 'ask',
          }
        );
      }

      return followups;
    },
  };

  context.subscriptions.push(participant);
}

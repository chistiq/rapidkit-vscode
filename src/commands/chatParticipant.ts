/**
 * Workspai Chat Participant
 *
 * Registers the `@workspai` participant in the VS Code Chat panel.
 * Supports two slash commands:
 *   /ask   — freeform Q&A with full project context (architecture, modules, conventions)
 *   /debug — structured debug flow: root cause + fix + prevention
 *
 * Both commands reuse the same AI infrastructure as the WelcomePanel modal
 * (prepareAIConversation → streamAIResponse) so the quality is identical.
 */

import * as vscode from 'vscode';
import {
  prepareAIConversation,
  streamAIResponse,
  type AIModalContext,
  type AIConversationMode,
  type AIConversationHistoryEntry,
} from '../core/aiService';
import { resolvePreferredAIModalContext } from '../core/aiContextResolver';
import { collectDebugPrefillQuestion } from './aiDebugger';
import { WorkspaceUsageTracker } from '../utils/workspaceUsageTracker';

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

// ────────────────────────────────────────────────────────────────────────────
// Request handler
// ────────────────────────────────────────────────────────────────────────────

async function handleWorkspaiRequest(
  request: vscode.ChatRequest,
  chatContext: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
  // Determine mode from slash command; default to 'ask'
  const rawCommand = request.command?.toLowerCase();
  const mode: AIConversationMode = rawCommand === 'debug' ? 'debug' : 'ask';

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

  // Build question
  const question: string = mode === 'debug' ? collectDebugContext(request.prompt) : request.prompt;

  const ctx: AIModalContext = await resolvePreferredAIModalContext();
  const history = extractHistory(chatContext);
  const canTrackTelemetry =
    typeof (vscode.window as { createOutputChannel?: unknown }).createOutputChannel === 'function';

  const trackChatOutcome = async (
    result: 'success' | 'empty' | 'prepare-error' | 'clarification-needed' | 'cancelled' | 'error',
    extraProps?: Record<string, unknown>
  ) => {
    if (!canTrackTelemetry) {
      return;
    }

    try {
      await WorkspaceUsageTracker.getInstance().trackCommandEvent(
        `workspai.chat.${mode}`,
        ctx.path,
        {
          source: 'chat-participant',
          result,
          historyTurns: history.length,
          hasPrompt: Boolean(request.prompt?.trim()),
          ...extraProps,
        }
      );
    } catch {
      // Telemetry should never interrupt chat UX.
    }
  };

  // Guard: empty question
  if (!question.trim()) {
    await trackChatOutcome('empty');
    stream.markdown(EMPTY_PROMPT_MSG[mode] ?? EMPTY_PROMPT_MSG.ask);
    return {};
  }

  // Show progress while scanning project context
  stream.progress('Scanning project context…');

  let prepared: Awaited<ReturnType<typeof prepareAIConversation>>;
  try {
    prepared = await prepareAIConversation(mode, question, ctx, history);
  } catch (err: unknown) {
    await trackChatOutcome('prepare-error', {
      error: err instanceof Error ? err.message.slice(0, 180) : String(err).slice(0, 180),
    });
    const msg = err instanceof Error ? err.message : String(err);
    stream.markdown(`**Workspai:** Failed to prepare context — ${msg}`);
    return {};
  }

  if (token.isCancellationRequested) {
    await trackChatOutcome('cancelled', { stage: 'before-stream' });
    return {};
  }

  if (prepared.validation.clarificationNeeded) {
    if (canTrackTelemetry) {
      try {
        await WorkspaceUsageTracker.getInstance().trackCommandEvent(
          'workspai.chat.clarification_gate',
          ctx.path,
          {
            source: 'chat-participant',
            mode,
            missingFields: prepared.validation.missing,
          }
        );
      } catch {
        // Telemetry should never interrupt chat UX.
      }
    }

    await trackChatOutcome('clarification-needed', {
      missingFields: prepared.validation.missing,
    });
    stream.markdown(
      `**Workspai:** ${
        prepared.validation.clarificationReason ??
        'I need workspace evidence first to give a safe answer.'
      }\n\n` +
        'Please select the workspace/project and run `npx rapidkit doctor workspace`, then retry your request.'
    );
    return {
      metadata: {
        command: mode,
        clarificationNeeded: true,
        ctx: { type: ctx.type, name: ctx.name, path: ctx.path },
      },
    };
  }

  // Stream the AI response
  let hasContent = false;
  try {
    await streamAIResponse(
      prepared.messages,
      (chunk) => {
        if (chunk.text) {
          stream.markdown(chunk.text);
          hasContent = true;
        }
      },
      token
    );
  } catch (err: unknown) {
    if (token.isCancellationRequested) {
      await trackChatOutcome('cancelled', { stage: 'during-stream' });
      return {};
    }
    await trackChatOutcome('error', {
      error: err instanceof Error ? err.message.slice(0, 180) : String(err).slice(0, 180),
    });
    const msg = err instanceof Error ? err.message : String(err);

    if (!hasContent) {
      stream.markdown(
        `**Workspai:** The AI request failed.\n\n` +
          `> ${msg}\n\n` +
          `Make sure you have an active Copilot or compatible language model subscription.`
      );
    }
    return {};
  }

  await trackChatOutcome('success', {
    responseHasContent: hasContent,
  });

  // Append context-aware follow-up buttons
  if (!token.isCancellationRequested) {
    stream.button({
      command: 'workspai.debugWithAI',
      title: '$(bug) Debug in Modal',
      tooltip: 'Open the full Workspai debug modal for this file',
    });

    if (mode === 'debug' && prepared.scanned?.projectRoot) {
      stream.button({
        command: 'workspai.workspaceBrain',
        title: '$(brain) Workspace Brain',
        tooltip: 'Open the Workspace Brain for a broader project overview',
      });
    }
  }

  return {
    metadata: {
      command: mode,
      ctx: { type: ctx.type, name: ctx.name, path: ctx.path },
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Registration
// ────────────────────────────────────────────────────────────────────────────

export function registerWorkspaiChatParticipant(context: vscode.ExtensionContext): void {
  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handleWorkspaiRequest);

  participant.iconPath = new vscode.ThemeIcon('sparkle');

  // Register slash commands so VS Code autocompletes them in the chat panel
  if ('commands' in participant) {
    (participant as unknown as { commands: { name: string; description: string }[] }).commands = [
      { name: 'ask', description: 'Ask anything about your Workspai project' },
      { name: 'debug', description: 'Debug: root cause + fix + prevention for an error' },
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

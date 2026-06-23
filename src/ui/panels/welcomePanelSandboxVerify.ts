import type { SandboxVerifyCommand } from '../../core/sandboxSimulation';
import { buildVerifyPackPlan, toVerifyPackCommandStrings } from '../../core/verifyPackProfiles';
import type { ChatBrainConversation } from './welcomePanelChatBrainQuery';

export function tokenizeSandboxCommand(
  commandText: string
): { command: string; args: string[] } | null {
  const trimmed = commandText.trim();
  if (!trimmed) {
    return null;
  }

  // Keep simulation command intake strict: reject shell chaining and interpolation.
  if (/[;&|><`$()]/.test(trimmed)) {
    return null;
  }

  const parts = trimmed.split(/\s+/).filter((part) => part.length > 0);
  if (parts.length === 0) {
    return null;
  }

  const command = parts[0];
  const args = parts.slice(1);
  const commandAllowlist = new Set([
    'rapidkit',
    'npm',
    'pnpm',
    'yarn',
    'poetry',
    'pytest',
    'python',
    'python3',
    'uv',
    'go',
    'mvn',
    'mvnw',
    './mvnw',
    'gradle',
    './gradlew',
  ]);

  if (!commandAllowlist.has(command)) {
    return null;
  }

  return { command, args };
}

export function extractVerifyCommandCandidatesFromText(text: string): string[] {
  const candidates: string[] = [];
  const verifyLineRegex = /^\s*verify command\s*:\s*(.+)$/gim;
  let lineMatch: RegExpExecArray | null = verifyLineRegex.exec(text);
  while (lineMatch) {
    const commandText = (lineMatch[1] || '').trim();
    if (commandText) {
      candidates.push(commandText);
    }
    lineMatch = verifyLineRegex.exec(text);
  }

  const fencedCodeRegex = /```(?:bash|sh|zsh)?\n([\s\S]*?)```/gim;
  let fencedMatch: RegExpExecArray | null = fencedCodeRegex.exec(text);
  while (fencedMatch) {
    const block = fencedMatch[1] || '';
    for (const line of block.split(/\r?\n/)) {
      const cleaned = line.replace(/^\s*\$\s*/, '').trim();
      if (cleaned) {
        candidates.push(cleaned);
      }
    }
    fencedMatch = fencedCodeRegex.exec(text);
  }

  return candidates;
}

export function toSandboxVerifyCommands(candidates: string[]): SandboxVerifyCommand[] {
  const results: SandboxVerifyCommand[] = [];
  const seen = new Set<string>();

  for (const rawCandidate of candidates) {
    const parsed = tokenizeSandboxCommand(rawCandidate);
    if (!parsed) {
      continue;
    }

    const key = `${parsed.command} ${parsed.args.join(' ')}`.trim().toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    results.push({
      command: parsed.command,
      args: parsed.args,
      label: `verify: ${parsed.command}`,
    });

    if (results.length >= 2) {
      break;
    }
  }

  return results;
}

export function buildSandboxVerifyCommands(input: {
  actionType: string;
  inlineQuery: string;
  impactVerifyChecklist: string[];
  assistantHistoryContent: string[];
  projectType?: string;
  projectPath?: string;
}): SandboxVerifyCommand[] {
  const candidates: string[] = [];

  for (const checklistItem of input.impactVerifyChecklist) {
    const trimmed = checklistItem.trim();
    if (!trimmed) {
      continue;
    }

    const checklistCommandRegex = /`([^`]+)`/g;
    let match: RegExpExecArray | null = checklistCommandRegex.exec(trimmed);
    while (match) {
      const commandText = (match[1] || '').trim();
      if (commandText) {
        candidates.push(commandText);
      }
      match = checklistCommandRegex.exec(trimmed);
    }
  }

  for (const content of input.assistantHistoryContent) {
    candidates.push(...extractVerifyCommandCandidatesFromText(content));
  }

  candidates.push(...extractVerifyCommandCandidatesFromText(input.inlineQuery));

  const verifyPackPlan = buildVerifyPackPlan({
    projectType: input.projectType,
    projectPath: input.projectPath,
  });
  candidates.push(...toVerifyPackCommandStrings(verifyPackPlan));

  const fallbackByActionType: Record<string, string> = {
    'doctor-fix': 'rapidkit doctor --fix',
    'change-impact-lite': 'rapidkit change-impact-lite',
    'fix-preview-lite': 'rapidkit fix-preview-lite',
  };
  if (fallbackByActionType[input.actionType]) {
    candidates.push(fallbackByActionType[input.actionType]);
  }

  return toSandboxVerifyCommands(candidates);
}

export function buildSandboxVerifyCommandsForConversation(input: {
  actionType: string;
  inlineQuery: string;
  impactVerifyChecklist: string[];
  conversationId?: string;
  chatBrainConversations: Map<string, ChatBrainConversation>;
  projectType?: string;
  projectPath?: string;
}): SandboxVerifyCommand[] {
  const conversation =
    input.conversationId && input.chatBrainConversations.has(input.conversationId)
      ? input.chatBrainConversations.get(input.conversationId)
      : undefined;
  const assistantHistoryContent = (conversation?.history || [])
    .filter((entry) => entry.role === 'assistant')
    .slice(-3)
    .map((entry) => entry.content);

  return buildSandboxVerifyCommands({
    actionType: input.actionType,
    inlineQuery: input.inlineQuery,
    impactVerifyChecklist: input.impactVerifyChecklist,
    assistantHistoryContent,
    projectType: input.projectType,
    projectPath: input.projectPath,
  });
}

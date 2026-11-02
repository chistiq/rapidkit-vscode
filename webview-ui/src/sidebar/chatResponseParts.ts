import type { ChatTurn } from './sidebarSessions';
import type { SidebarStudioActionProgressView } from '@/lib/sidebarStudioActionProgress';

/** Text offsets keep the ordered transcript without duplicating response text in storage. */
export type ChatResponsePart =
  | { kind: 'text'; start: number; end: number }
  | { kind: 'activity'; id: string };

export function chatResponseParts(turn: ChatTurn): ChatResponsePart[] {
  if (Array.isArray(turn.parts) && turn.parts.length) {
    let cursor = 0;
    const valid = turn.parts.every((part) => {
      if (!part || typeof part !== 'object') {
        return false;
      }
      if (part.kind === 'activity') {
        return typeof part.id === 'string';
      }
      if (
        part.kind !== 'text' ||
        !Number.isInteger(part.start) ||
        !Number.isInteger(part.end) ||
        part.start !== cursor ||
        part.end <= part.start ||
        part.end > turn.content.length
      ) {
        return false;
      }
      cursor = part.end;
      return true;
    });
    if (valid && cursor === turn.content.length) {
      return turn.parts;
    }
  }
  // Earlier versions did not record ordering. Preserve their existing presentation.
  return [
    ...(turn.activity ?? []).map(
      (entry, index): ChatResponsePart => ({
        kind: 'activity',
        id: entry.transcriptId ?? `legacy:${index}`,
      })
    ),
    ...(turn.content ? [{ kind: 'text' as const, start: 0, end: turn.content.length }] : []),
  ];
}

export function appendChatResponseText(turn: ChatTurn, text: string): ChatTurn {
  if (!text) {
    return turn;
  }
  const parts = [...chatResponseParts(turn)];
  const last = parts.at(-1);
  const end = turn.content.length + text.length;
  if (last?.kind === 'text') {
    parts[parts.length - 1] = { ...last, end };
  } else {
    parts.push({ kind: 'text', start: turn.content.length, end });
  }
  return { ...turn, content: turn.content + text, parts };
}

/** Replace streamed answer text, while retaining narration that preceded intervening tools. */
export function finalizeChatResponseText(turn: ChatTurn, answer: string): ChatTurn {
  if (turn.content === answer) {
    return turn;
  }
  const parts = [...chatResponseParts(turn)];
  const last = parts.at(-1);
  const start = last?.kind === 'text' ? last.start : turn.content.length;
  if (last?.kind === 'text') {
    parts.pop();
  }
  return appendChatResponseText({ ...turn, content: turn.content.slice(0, start), parts }, answer);
}

export function chatResponseActivityId(
  entry: SidebarStudioActionProgressView,
  index: number
): string {
  return entry.transcriptId ?? `legacy:${index}`;
}

export type ChatResponseDisplayPart =
  | { kind: 'text'; text: string }
  | { kind: 'activity'; entries: SidebarStudioActionProgressView[] };

export function chatResponseDisplayParts(turn: ChatTurn): ChatResponseDisplayPart[] {
  const entries = new Map(
    (turn.activity ?? []).map((entry, index) => [chatResponseActivityId(entry, index), entry])
  );
  const result: ChatResponseDisplayPart[] = [];
  for (const part of chatResponseParts(turn)) {
    if (part.kind === 'text') {
      result.push({ kind: 'text', text: turn.content.slice(part.start, part.end) });
    } else {
      const entry = entries.get(part.id);
      if (!entry) {
        continue;
      }
      const last = result.at(-1);
      if (last?.kind === 'activity') {
        last.entries.push(entry);
      } else {
        result.push({ kind: 'activity', entries: [entry] });
      }
    }
  }
  return result;
}

export function truncateChatResponse(turn: ChatTurn, limit: number, note: string): ChatTurn {
  if (turn.content.length <= limit) {
    return turn;
  }
  const prefix = note.slice(0, limit);
  const cut = turn.content.length - (limit - prefix.length);
  const parts: ChatResponsePart[] = prefix ? [{ kind: 'text', start: 0, end: prefix.length }] : [];
  for (const part of chatResponseParts(turn)) {
    if (part.kind === 'activity') {
      parts.push(part);
    } else if (part.end > cut) {
      parts.push({
        kind: 'text',
        start: Math.max(cut, part.start) - cut + prefix.length,
        end: part.end - cut + prefix.length,
      });
    }
  }
  return { ...turn, content: prefix + turn.content.slice(cut), parts };
}

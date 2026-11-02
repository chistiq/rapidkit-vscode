import { describe, expect, it } from 'vitest';
import {
  appendChatResponseText,
  chatResponseDisplayParts,
  chatResponseParts,
  finalizeChatResponseText,
  truncateChatResponse,
} from '../../webview-ui/src/sidebar/chatResponseParts';
import type { ChatTurn } from '../../webview-ui/src/sidebar/sidebarSessions';

const activity = (id: string, title: string) => ({
  transcriptId: id,
  action: 'inspect-source',
  status: 'done' as const,
  title,
  summary: '',
});
describe('Ordered assistant response', () => {
  it('retains narration, tool placement, and the authoritative final answer through JSON reload', () => {
    let turn: ChatTurn = appendChatResponseText(
      { role: 'assistant', content: '' },
      'Inspecting the API.'
    );
    turn = {
      ...turn,
      activity: [activity('read', 'Read source')],
      parts: [...chatResponseParts(turn), { kind: 'activity', id: 'read' }],
    };
    turn = appendChatResponseText(turn, 'Draft answer');
    turn = finalizeChatResponseText(turn, 'The API is ready.');
    expect(chatResponseDisplayParts(JSON.parse(JSON.stringify(turn)))).toEqual([
      { kind: 'text', text: 'Inspecting the API.' },
      { kind: 'activity', entries: [activity('read', 'Read source')] },
      { kind: 'text', text: 'The API is ready.' },
    ]);
    expect(turn.content).toBe('Inspecting the API.The API is ready.');
    expect(finalizeChatResponseText(turn, turn.content)).toBe(turn);
  });
  it('bounds persisted text without invalid offsets or losing tool identity', () => {
    let turn: ChatTurn = { role: 'assistant', content: '' };
    turn = appendChatResponseText(turn, 'Earlier narration '.repeat(200));
    turn = {
      ...turn,
      activity: [activity('build', 'Build')],
      parts: [...chatResponseParts(turn), { kind: 'activity', id: 'build' }],
    };
    turn = appendChatResponseText(turn, 'Final result');
    const compacted = truncateChatResponse(turn, 100, '[Earlier text omitted]\n');
    const view = chatResponseDisplayParts(compacted);
    expect(compacted.content).toHaveLength(100);
    expect(
      view
        .filter((part) => part.kind === 'text')
        .map((part) => part.text)
        .join('')
    ).toBe(compacted.content);
    expect(view.at(-1)).toEqual({ kind: 'text', text: 'Final result' });
    expect(
      view.some((part) => part.kind === 'activity' && part.entries[0].transcriptId === 'build')
    ).toBe(true);
  });
  it('migrates legacy responses and ignores malformed persisted offsets', () => {
    const turn: ChatTurn = {
      role: 'assistant',
      content: 'Answer',
      activity: [activity('a', 'Read')],
    };
    expect(chatResponseDisplayParts(turn).map((part) => part.kind)).toEqual(['activity', 'text']);
    expect(
      chatResponseDisplayParts({ ...turn, parts: [{ kind: 'text', start: -5, end: 40 }] })
    ).toEqual(chatResponseDisplayParts(turn));
  });
});

import { describe, expect, it } from 'vitest';
import { StudioConversationMemory } from '../core/studioConversationMemory.js';
import type { AIMessage } from '../core/aiService.js';
describe('Bounded historical conversation excerpts', () => {
  it('retains explicit user constraints while omitting tool bodies and synthetic control turns', () => {
    const memory = new StudioConversationMemory();
    const messages: AIMessage[] = [
      {
        role: 'user',
        content: 'Use Python, preserve existing user changes, and do not adopt this project.',
      },
      { role: 'assistant', content: 'I will inspect the source.' },
      { role: 'assistant', toolCall: { callId: 'call', name: 'inspect-source', input: {} } },
      {
        role: 'tool',
        toolResult: { callId: 'call', name: 'inspect-source', content: 'private source body' },
      },
      {
        role: 'user',
        content:
          'Continue the same user request using the current execution policy and observed tool results.',
      },
    ];
    memory.capture(messages, []);
    const snapshot = memory.snapshot()!;
    expect(snapshot.excerpts).toHaveLength(2);
    expect(JSON.stringify(snapshot)).toContain('do not adopt');
    expect(JSON.stringify(snapshot)).not.toContain('private source body');
    expect(snapshot.instruction).toContain('not current observations or new authorization');
  });
  it('bounds excerpts, keeps omissions visible and does not inflate omissions when a window is revisited', () => {
    const memory = new StudioConversationMemory();
    const messages: AIMessage[] = Array.from({ length: 30 }, (_, index) => ({
      role: 'user',
      content: `${index}:` + 'x'.repeat(3000),
    }));
    memory.capture(messages, []);
    const before = memory.snapshot()!;
    expect(JSON.stringify(before).length).toBeLessThan(9000);
    expect(before.omittedExcerpts).toBeGreaterThan(0);
    expect(before.excerpts.every((entry) => entry.truncated)).toBe(true);
    memory.capture(messages, []);
    expect(memory.snapshot()).toEqual(before);
  });
  it('does not duplicate exchanges still present in the coherent conversation window', () => {
    const memory = new StudioConversationMemory();
    const current: AIMessage = { role: 'user', content: 'Create a separate workspace.' };
    memory.capture([current], [current]);
    expect(memory.snapshot()).toBeUndefined();
    memory.capture([current], []);
    expect(memory.snapshot()?.excerpts[0].content).toBe(current.content);
  });
});

import { describe, expect, it } from 'vitest';
import {
  jsonToolMessages,
  parseJsonToolEnvelope,
  isNativeToolTransportUnsupported,
} from '../core/aiToolTransport.js';
const tools = [
  { name: 'inspect-source', description: 'Read source', inputSchema: { type: 'object' } },
];
describe('Governed JSON tool transport', () => {
  it('retains schemas, observed tool results and images without using unsupported native message roles', () => {
    const messages = jsonToolMessages(
      [
        { role: 'user', content: 'Explain this file' },
        {
          role: 'assistant',
          toolCall: { callId: 'c', name: 'inspect-source', input: { paths: ['file.py'] } },
        },
        {
          role: 'tool',
          toolResult: {
            callId: 'c',
            name: 'inspect-source',
            content: 'actual result',
            images: [{ mimeType: 'image/png', base64: 'bytes' }],
          },
        },
      ],
      tools
    );
    expect(messages.every((message) => 'content' in message && message.role !== 'tool')).toBe(true);
    expect(JSON.stringify(messages)).toContain('actual result');
    expect(JSON.stringify(messages)).toContain('inputSchema');
    expect(JSON.stringify(messages)).toContain('hostToolObservation');
    expect(messages.at(-1)).toMatchObject({ images: [{ mimeType: 'image/png', base64: 'bytes' }] });
  });
  it.each([
    '{"toolName":"inspect-source","input":{"paths":["file.py"]}}',
    '```json\n{"toolName":"inspect-source","input":{}}\n```',
  ])('admits only one listed tool with object arguments', (text) => {
    expect(parseJsonToolEnvelope(text, tools)?.toolName).toBe('inspect-source');
  });
  it('preserves a large catalog without passing an oversized message to provider sanitizers', () => {
    const catalog = Array.from({ length: 140 }, (_, index) => ({
      name: `tool-${index}`,
      description: 'schema detail '.repeat(160),
      inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
    }));
    const messages = jsonToolMessages([], catalog);
    const segments = messages
      .slice(1)
      .map((message) =>
        'content' in message ? message.content.slice(message.content.indexOf('\n') + 1) : ''
      );
    expect(JSON.parse(segments.join(''))).toEqual(catalog);
    expect(
      messages.every((message) => 'content' in message && message.content.length < 49000)
    ).toBe(true);
  });
  it.each([
    '[{"toolName":"inspect-source","input":{}}]',
    '{"toolName":"unlisted","input":{}}',
    '{"toolName":"inspect-source","input":[]}',
    '{"toolName":"inspect-source","input":{},"approved":true}',
    'I executed inspect-source',
  ])('does not treat invalid or invented output as tool execution', (text) => {
    expect(parseJsonToolEnvelope(text, tools)).toBeUndefined();
  });
  it.each([
    '400: This model does not support tools',
    'Unrecognized request argument: tool_choice',
    'Tool calling is not supported',
    'Auto mode needs a prompt or a command to route a request.',
  ])('recognizes explicit transport incompatibility: %s', (error) =>
    expect(isNativeToolTransportUnsupported(error)).toBe(true)
  );
  it.each([
    '403: tools are not permitted',
    '401 unauthorized',
    '429 tool quota',
    'context length limit with tools',
    'Unsupported model',
  ])('does not bypass authorization or unrelated errors: %s', (error) =>
    expect(isNativeToolTransportUnsupported(error)).toBe(false)
  );
});

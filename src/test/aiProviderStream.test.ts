import { describe, expect, it, vi } from 'vitest';
import { readAIProviderResponse } from '../core/aiProviderStream.js';
function response(parts: string[], keepOpen = false) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const part of parts) {
          controller.enqueue(encoder.encode(part));
        }
        if (!keepOpen) {
          controller.close();
        }
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } }
  );
}
const data = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
const input = (
  response: Response,
  protocol: 'openai-compatible' | 'anthropic-messages' = 'openai-compatible'
) => ({ response, protocol, signal: new AbortController().signal });
describe('Bounded provider SSE transport', () => {
  it('assembles split function names/arguments and late usage without publishing source text through progress', async () => {
    const raw =
      data({
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                { index: 0, id: 'call-1', function: { name: 'inspect-', arguments: '{"path":' } },
              ],
            },
          },
        ],
      }) +
      data({
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [{ index: 0, function: { name: 'source', arguments: '"src/a.ts"}' } }],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }) +
      data({ choices: [], usage: { prompt_tokens: 123, completion_tokens: 10 } }) +
      'data: [DONE]\n\n';
    const progress = vi.fn();
    const result = JSON.parse(
      await readAIProviderResponse({
        ...input(response([...raw].map((character) => character))),
        onProgress: progress,
      })
    );
    expect(result).toMatchObject({
      usage: { prompt_tokens: 123, completion_tokens: 10 },
      choices: [
        {
          message: {
            tool_calls: [
              {
                id: 'call-1',
                function: { name: 'inspect-source', arguments: '{"path":"src/a.ts"}' },
              },
            ],
          },
        },
      ],
    });
    expect(progress).toHaveBeenCalled();
    expect(JSON.stringify(progress.mock.calls)).not.toContain('src/a.ts');
  });

  it('preserves split UTF-8 and CRLF multiline events and stops at DONE even if the connection stays open', async () => {
    const raw = `: heartbeat\r\nevent: message\r\ndata: {"choices":\r\ndata: [{"index":0,"delta":{"content":"caf\u00e9"},"finish_reason":"stop"}]}\r\n\r\ndata: [DONE]\r\n\r\n`;
    const bytes = new TextEncoder().encode(raw);
    const streamed = new Response(
      new ReadableStream({
        start(controller) {
          bytes.forEach((byte) => controller.enqueue(Uint8Array.of(byte)));
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } }
    );
    expect(
      JSON.parse(await readAIProviderResponse(input(streamed))).choices[0].message.content
    ).toBe('caf\u00e9');
  });

  it('assembles Anthropic tool blocks and usage while omitting reasoning deltas', async () => {
    const raw = [
      { type: 'message_start', message: { usage: { input_tokens: 30, output_tokens: 1 } } },
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'thinking', thinking: 'private reasoning' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'private reasoning' },
      },
      { type: 'content_block_stop', index: 0 },
      {
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'tool_use', name: 'inspect-source', id: 'tool-1', input: {} },
      },
      {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '{"paths":' },
      },
      {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '["src/a.ts"]}' },
      },
      { type: 'content_block_stop', index: 1 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 8 } },
      { type: 'message_stop' },
    ].map(data);
    const progress = vi.fn();
    const result = await readAIProviderResponse({
      ...input(response(raw), 'anthropic-messages'),
      onProgress: progress,
    });
    expect(JSON.parse(result)).toMatchObject({
      usage: { input_tokens: 30, output_tokens: 8 },
      content: [{ type: 'tool_use', name: 'inspect-source', input: { paths: ['src/a.ts'] } }],
    });
    expect(result).not.toContain('private reasoning');
    expect(JSON.stringify(progress.mock.calls)).not.toContain('private reasoning');
  });

  it.each([
    data({ choices: [{ delta: { content: 'partial' } }] }),
    data({ choices: [{ delta: { content: 'partial' } }] }) + 'data: [DONE]\n\n',
    data({ choices: [{ delta: {}, finish_reason: 'length' }] }),
    'data: not valid json\n\n',
    data({ error: { message: 'server exception' } }),
  ])(
    'rejects an incomplete or invalid response instead of accepting a partial action',
    async (raw) => {
      await expect(readAIProviderResponse(input(response([raw])))).rejects.toThrow();
    }
  );

  it('rejects an Anthropic tool that never closed and cancels a stalled reader promptly', async () => {
    await expect(
      readAIProviderResponse(
        input(
          response([
            data({
              type: 'content_block_start',
              index: 0,
              content_block: { type: 'tool_use', name: 'edit', id: 't' },
            }),
            data({ type: 'message_stop' }),
          ]),
          'anthropic-messages'
        )
      )
    ).rejects.toThrow('complete response');
    const controller = new AbortController();
    const pending = readAIProviderResponse({
      ...input(response([], true)),
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toThrow();
  });

  it('retains non-streaming JSON compatibility and enforces per-event bounds', async () => {
    expect(await readAIProviderResponse(input(new Response('{"choices":[]}')))).toBe(
      '{"choices":[]}'
    );
    await expect(
      readAIProviderResponse(input(response(['data: ' + 'x'.repeat(1024 * 1024 + 1) + '\n\n'])))
    ).rejects.toThrow('bounded limit');
  });

  it('bounds JSON and HTTP error bodies during reading, and releases cancellation even without SSE', async () => {
    let cancelled = false;
    const oversized = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1));
        },
        cancel() {
          cancelled = true;
        },
      }),
      { status: 400 }
    );
    await expect(readAIProviderResponse(input(oversized))).rejects.toThrow(
      'bounded transport limit'
    );
    expect(cancelled).toBe(true);
    const controller = new AbortController();
    const stalled = new Response(new ReadableStream({ start() {} }));
    const pending = readAIProviderResponse({ ...input(stalled), signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow();
  });

  it('does not expose partial argument contents from malformed Anthropic JSON', async () => {
    const raw = [
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', name: 'edit', id: 't' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{private-argument' },
      },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
      { type: 'message_stop' },
    ].map(data);
    const error = await readAIProviderResponse(input(response(raw), 'anthropic-messages')).catch(
      (error) => error
    );
    expect(error.message).toContain('invalid tool arguments');
    expect(error.message).not.toContain('private-argument');
  });

  it('distinguishes retryable stream errors without exposing provider payloads', async () => {
    const overload = response([
      data({ type: 'error', error: { type: 'overloaded_error', message: 'private details' } }),
    ]);
    const failure = await readAIProviderResponse(input(overload, 'anthropic-messages')).catch(
      (error) => error
    );
    expect(failure.message).toContain('temporarily unavailable');
    expect(failure.message).not.toContain('private details');
    const denied = response([
      data({ type: 'error', error: { type: 'authentication_error', message: 'private details' } }),
    ]);
    await expect(readAIProviderResponse(input(denied, 'anthropic-messages'))).rejects.toThrow(
      'reported an error'
    );
  });
});

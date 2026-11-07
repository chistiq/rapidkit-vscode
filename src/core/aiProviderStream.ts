export type AIProviderStreamProgress = {
  receivedBytes: number;
  textCharacters: number;
  argumentCharacters: number;
  toolCalls: number;
};
export type AIProviderStreamObserver = (progress: AIProviderStreamProgress) => Promise<void> | void;
type Value = Record<string, unknown>;
const record = (value: unknown): Value =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Value) : {};
const LIMIT = 8 * 1024 * 1024;

async function readBoundedBody(response: Response, signal: AbortSignal): Promise<string> {
  if (signal.aborted) {
    throw signal.reason ?? new Error('AI provider response was cancelled.');
  }
  if (!response.body?.getReader) {
    // Compatibility for response adapters which expose text() but no stream.
    const raw = await response.text();
    if (Buffer.byteLength(raw) > LIMIT) {
      throw new Error('AI provider response exceeds the bounded transport limit.');
    }
    return raw;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0,
    text = '';
  let abort!: () => void;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => {
      void reader.cancel().catch(() => undefined);
      reject(signal.reason ?? new Error('AI provider response was cancelled.'));
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
    }
  });
  try {
    for (;;) {
      const chunk = await Promise.race([reader.read(), cancelled]);
      if (signal.aborted) {
        throw signal.reason ?? new Error('AI provider response was cancelled.');
      }
      if (chunk.done) {
        return text + decoder.decode();
      }
      bytes += chunk.value.byteLength;
      if (bytes > LIMIT) {
        throw new Error('AI provider response exceeds the bounded transport limit.');
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    signal.removeEventListener('abort', abort);
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** SSE assembly is transport only. Never dispatch a partial tool, show private reasoning,
 * or promote a streamed draft to a verified outcome. Callers consume one complete payload. */
export async function readAIProviderResponse(input: {
  response: Response;
  protocol: 'openai-compatible' | 'anthropic-messages';
  signal: AbortSignal;
  onProgress?: AIProviderStreamObserver;
}): Promise<string> {
  if (
    !input.response.ok ||
    !input.response.headers?.get?.('content-type')?.toLowerCase().includes('text/event-stream')
  ) {
    return readBoundedBody(input.response, input.signal);
  }
  if (!input.response.body) {
    throw new Error('AI provider returned an empty streaming body.');
  }
  const reader = input.response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '',
    eventLines: string[] = [],
    eventBytes = 0;
  let complete = false,
    finished = false,
    text = '',
    usage: Value | undefined;
  const calls = new Map<
    number,
    { id: string; name: string; arguments: string; initial?: unknown; closed?: boolean }
  >();
  const metric: AIProviderStreamProgress = {
    receivedBytes: 0,
    textCharacters: 0,
    argumentCharacters: 0,
    toolCalls: 0,
  };
  let abort!: () => void;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => {
      void reader.cancel().catch(() => undefined);
      reject(input.signal.reason ?? new Error('AI provider stream was cancelled.'));
    };
    input.signal.addEventListener('abort', abort, { once: true });
    if (input.signal.aborted) {
      abort();
    }
  });
  const indexOf = (raw: unknown): number => {
    if (!Number.isSafeInteger(raw) || Number(raw) < 0 || Number(raw) > 63) {
      throw new Error('AI provider stream returned an invalid content/tool index.');
    }
    return raw as number;
  };
  const consume = (data: string) => {
    if (complete) {
      return;
    }
    if (data === '[DONE]' && input.protocol === 'openai-compatible') {
      complete = true;
      return;
    }
    let payload: Value;
    try {
      payload = record(JSON.parse(data));
    } catch {
      throw new Error(
        'AI provider returned malformed streaming JSON; no partial tool was dispatched.'
      );
    }
    if (payload.error || payload.type === 'error') {
      const error = record(payload.error);
      if (
        [
          'overloaded_error',
          'rate_limit_error',
          'api_error',
          'server_error',
          'rate_limit_exceeded',
        ].includes(String(error.type ?? error.code))
      ) {
        throw new Error(
          'AI provider temporarily unavailable during streaming; no partial tool was dispatched.'
        );
      }
      throw new Error(
        'AI provider reported an error during streaming; no partial tool was dispatched.'
      );
    }
    if (input.protocol === 'openai-compatible') {
      if (payload.usage && typeof payload.usage === 'object') {
        usage = record(payload.usage);
      }
      const choice = Array.isArray(payload.choices)
        ? payload.choices.find(
            (entry) => record(entry).index === 0 || record(entry).index === undefined
          )
        : undefined;
      if (!choice) {
        return;
      }
      const value = record(choice),
        delta = record(value.delta);
      if (typeof delta.content === 'string') {
        text += delta.content;
        metric.textCharacters += delta.content.length;
      }
      for (const raw of Array.isArray(delta.tool_calls) ? delta.tool_calls : []) {
        const part = record(raw),
          index = indexOf(part.index);
        let call = calls.get(index);
        if (!call) {
          call = { id: '', name: '', arguments: '' };
          calls.set(index, call);
        }
        const fn = record(part.function);
        if (typeof part.id === 'string') {
          call.id += part.id;
        }
        if (typeof fn.name === 'string') {
          call.name += fn.name;
        }
        if (typeof fn.arguments === 'string') {
          call.arguments += fn.arguments;
          metric.argumentCharacters += fn.arguments.length;
        }
      }
      if (value.finish_reason) {
        if (!['stop', 'tool_calls', 'function_call'].includes(String(value.finish_reason))) {
          throw new Error(
            `AI provider stream ended with ${String(value.finish_reason).slice(0, 80)}; no partial action was accepted.`
          );
        }
        finished = true;
      }
    } else {
      if (payload.type === 'message_start') {
        usage = record(record(payload.message).usage);
      }
      if (payload.type === 'content_block_start') {
        const block = record(payload.content_block);
        if (block.type === 'tool_use') {
          const index = indexOf(payload.index);
          if (calls.has(index)) {
            throw new Error('AI provider stream repeated a tool block.');
          }
          calls.set(index, {
            id: String(block.id ?? ''),
            name: String(block.name ?? ''),
            arguments: '',
            initial: block.input,
          });
        } else if (block.type === 'text' && typeof block.text === 'string') {
          text += block.text;
          metric.textCharacters += block.text.length;
        }
      }
      if (payload.type === 'content_block_delta') {
        const delta = record(payload.delta);
        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          text += delta.text;
          metric.textCharacters += delta.text.length;
        }
        if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          const call = calls.get(indexOf(payload.index));
          if (!call || call.closed) {
            throw new Error('AI provider stream returned a tool delta outside an open tool block.');
          }
          call.arguments += delta.partial_json;
          metric.argumentCharacters += delta.partial_json.length;
        }
      }
      if (payload.type === 'content_block_stop') {
        const call = calls.get(indexOf(payload.index));
        if (call) {
          call.closed = true;
        }
      }
      if (payload.type === 'message_delta') {
        usage = { ...usage, ...record(payload.usage) };
        const reason = record(payload.delta).stop_reason;
        if (reason && !['end_turn', 'tool_use', 'stop_sequence'].includes(String(reason))) {
          throw new Error(
            'AI provider stream did not complete its message; no partial action was accepted.'
          );
        }
        if (reason) {
          finished = true;
        }
      }
      if (payload.type === 'message_stop') {
        complete = true;
      }
    }
    metric.toolCalls = calls.size;
    if (
      metric.textCharacters + metric.argumentCharacters > LIMIT ||
      [...calls.values()].some((call) => call.id.length > 1000 || call.name.length > 200)
    ) {
      throw new Error('AI provider stream exceeds the bounded action limit.');
    }
  };
  const line = (value: string) => {
    if (value === '') {
      if (eventLines.length) {
        consume(eventLines.join('\n'));
      }
      eventLines = [];
      eventBytes = 0;
    } else if (value.startsWith('data:')) {
      const data = value.slice(5).replace(/^ /, '');
      eventBytes += data.length;
      if (eventBytes > 1024 * 1024) {
        throw new Error('AI provider stream event exceeds its bounded limit.');
      }
      eventLines.push(data);
    }
  };
  try {
    for (;;) {
      const chunk = await Promise.race([reader.read(), cancelled]);
      if (chunk.done) {
        buffer += decoder.decode();
        break;
      }
      metric.receivedBytes += chunk.value.byteLength;
      if (metric.receivedBytes > LIMIT) {
        throw new Error('AI provider stream exceeds the bounded transport limit.');
      }
      buffer += decoder.decode(chunk.value, { stream: true });
      let at: number;
      while ((at = buffer.indexOf('\n')) >= 0) {
        line(buffer.slice(0, at).replace(/\r$/, ''));
        buffer = buffer.slice(at + 1);
      }
      if (buffer.length > 1024 * 1024) {
        throw new Error('AI provider stream line exceeds its bounded limit.');
      }
      await input.onProgress?.({ ...metric });
      if (complete) {
        break;
      }
    }
    if (buffer) {
      line(buffer.replace(/\r$/, ''));
    }
    if (eventLines.length) {
      line('');
    }
    if (input.signal.aborted) {
      throw input.signal.reason ?? new Error('AI provider stream was cancelled.');
    }
    if (
      input.protocol === 'openai-compatible'
        ? !finished
        : !complete || !finished || [...calls.values()].some((call) => !call.closed)
    ) {
      throw new Error(
        'network request aborted: AI provider stream ended before a complete response; no partial action was dispatched.'
      );
    }
    const ordered = [...calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => call);
    if (ordered.some((call) => !call.name.trim())) {
      throw new Error(
        'AI provider stream returned an incomplete tool name; no partial tool was dispatched.'
      );
    }
    if (input.protocol === 'openai-compatible') {
      return JSON.stringify({
        choices: [
          {
            message: {
              content: text,
              tool_calls: ordered.map((call) => ({
                id: call.id,
                type: 'function',
                function: { name: call.name, arguments: call.arguments },
              })),
            },
          },
        ],
        ...(usage ? { usage } : {}),
      });
    }
    return JSON.stringify({
      content: [
        ...(text ? [{ type: 'text', text }] : []),
        ...ordered.map((call) => ({
          type: 'tool_use',
          id: call.id,
          name: call.name,
          input: parseToolInput(call.arguments, call.initial),
        })),
      ],
      ...(usage ? { usage } : {}),
    });
  } finally {
    input.signal.removeEventListener('abort', abort);
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function parseToolInput(argumentsText: string, initial: unknown): unknown {
  try {
    return argumentsText ? JSON.parse(argumentsText) : (initial ?? {});
  } catch {
    throw new Error(
      'AI provider returned incomplete or invalid tool arguments; no tool was dispatched.'
    );
  }
}

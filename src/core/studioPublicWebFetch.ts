import dns from 'node:dns/promises';

export const STUDIO_PUBLIC_WEB_FETCH_SCHEMA_VERSION =
  'workspai.studio-public-web-fetch.v1' as const;

const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_OUTPUT_CHARS = 24_000;
const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 15_000;
const USER_AGENT = 'Workspai-Studio/0.48 (governed public-web fetch)';

export type StudioPublicWebFetchRequest = {
  url: string;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type StudioPublicWebFetchResult = {
  ok: boolean;
  output?: {
    schemaVersion: typeof STUDIO_PUBLIC_WEB_FETCH_SCHEMA_VERSION;
    requestedUrl: string;
    finalUrl: string;
    status: number;
    contentType: string;
    truncated: boolean;
    text: string;
  };
  error?: string;
};

export type StudioPublicWebFetchDeps = {
  fetch: typeof fetch;
  lookup(hostname: string): Promise<{ address: string; family: number }>;
};

const defaultDeps: StudioPublicWebFetchDeps = {
  fetch: globalThis.fetch.bind(globalThis),
  lookup: (hostname) => dns.lookup(hostname),
};

export function htmlToPublicText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(p|div|br|hr|h[1-6]|li|tr|section|article)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_match, value: string) => String.fromCharCode(Number(value)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function isBlockedIpAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    ip === '::1' ||
    ip === '::' ||
    ip === '0:0:0:0:0:0:0:1' ||
    ip.startsWith('fc') ||
    ip.startsWith('fd') ||
    ip.startsWith('fe80')
  ) {
    return true;
  }
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(v4)) {
    return false;
  }
  const [first, second] = v4.split('.').map((part) => Number(part));
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127)
  );
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    host === 'localhost' ||
    host === 'localhost.localdomain' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal' ||
    host === '0.0.0.0' ||
    isBlockedIpAddress(host)
  );
}

export async function assertPublicHttpsUrl(
  rawUrl: string,
  deps: StudioPublicWebFetchDeps = defaultDeps
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Public web fetch requires a valid HTTPS URL.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Public web fetch only allows HTTPS URLs.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Public web fetch rejects URLs that embed credentials.');
  }
  if (isBlockedHostname(parsed.hostname)) {
    throw new Error(`Public web fetch blocked a private or local host: ${parsed.hostname}`);
  }
  const resolved = await deps.lookup(parsed.hostname);
  if (isBlockedIpAddress(resolved.address)) {
    throw new Error(`Public web fetch blocked a private address for ${parsed.hostname}.`);
  }
  return parsed;
}

async function readLimitedBody(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > MAX_RESPONSE_BYTES) {
      throw new Error(`Public web fetch exceeded ${MAX_RESPONSE_BYTES} bytes.`);
    }
    return buffer;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    const value = chunk.value;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error(`Public web fetch exceeded ${MAX_RESPONSE_BYTES} bytes.`);
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}

function decodePublicBody(buffer: Uint8Array, contentType: string): string {
  const text = new TextDecoder('utf-8').decode(buffer);
  if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
    return htmlToPublicText(text);
  }
  if (contentType.includes('application/json')) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }
  if (
    contentType.startsWith('text/') ||
    contentType.includes('xml') ||
    contentType.includes('javascript')
  ) {
    return text;
  }
  throw new Error(`Public web fetch does not return binary content (${contentType || 'unknown'}).`);
}

export async function fetchStudioPublicWeb(
  request: StudioPublicWebFetchRequest,
  deps: StudioPublicWebFetchDeps = defaultDeps
): Promise<StudioPublicWebFetchResult> {
  const timeoutMs =
    typeof request.timeoutMs === 'number' && Number.isFinite(request.timeoutMs)
      ? Math.min(30_000, Math.max(1_000, Math.trunc(request.timeoutMs)))
      : DEFAULT_TIMEOUT_MS;
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const onCallerAbort = () => timeout.abort();
  request.signal?.addEventListener('abort', onCallerAbort, { once: true });
  try {
    let current = await assertPublicHttpsUrl(request.url, deps);
    let response: Response | undefined;
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      response = await deps.fetch(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.5',
          'User-Agent': USER_AGENT,
        },
        signal: timeout.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new Error(
            `Public web fetch received a redirect without Location (${response.status}).`
          );
        }
        current = await assertPublicHttpsUrl(new URL(location, current).toString(), deps);
        continue;
      }
      break;
    }
    if (!response) {
      throw new Error('Public web fetch did not receive a response.');
    }
    if (!response.ok) {
      throw new Error(
        `Public web fetch failed: HTTP ${response.status} ${response.statusText}`.trim()
      );
    }
    const contentType = response.headers.get('content-type') ?? 'text/plain';
    const body = decodePublicBody(await readLimitedBody(response), contentType);
    const truncated = body.length > MAX_OUTPUT_CHARS;
    return {
      ok: true,
      output: {
        schemaVersion: STUDIO_PUBLIC_WEB_FETCH_SCHEMA_VERSION,
        requestedUrl: request.url,
        finalUrl: response.url || current.toString(),
        status: response.status,
        contentType,
        truncated,
        text: truncated ? `${body.slice(0, MAX_OUTPUT_CHARS)}\n[truncated]` : body,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: timeout.signal.aborted
        ? request.signal?.aborted
          ? 'Public web fetch was cancelled.'
          : `Public web fetch timed out after ${timeoutMs}ms.`
        : message,
    };
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener('abort', onCallerAbort);
  }
}

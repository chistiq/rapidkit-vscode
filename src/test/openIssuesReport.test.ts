import { describe, expect, it, vi } from 'vitest';

import { fetchIssues } from '../../scripts/export-open-issues-report.mjs';

function response(input: {
  ok: boolean;
  status: number;
  statusText?: string;
  payload?: unknown;
  body?: string;
  retryAfter?: string;
}) {
  return {
    ok: input.ok,
    status: input.status,
    statusText: input.statusText ?? '',
    headers: { get: () => input.retryAfter ?? null },
    json: async () => input.payload,
    text: async () => input.body ?? '',
  } as Response;
}

describe('open issues release report', () => {
  it('retries a transient transport failure and preserves the issue payload', async () => {
    const transient = new TypeError('fetch failed', {
      cause: Object.assign(new Error('socket disconnected'), { code: 'UND_ERR_SOCKET' }),
    });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce(
        response({
          ok: true,
          status: 200,
          payload: [{ id: 1, number: 14, title: 'Release blocker', state: 'open' }],
        })
      );
    const sleep = vi.fn(async () => undefined);

    await expect(
      fetchIssues({
        repo: 'chistiq/rapidkit-vscode',
        token: 'token',
        state: 'open',
        fetchImpl,
        sleep,
      })
    ).resolves.toEqual([expect.objectContaining({ number: 14, title: 'Release blocker' })]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it('retries retryable GitHub responses but fails closed on permission errors', async () => {
    const sleep = vi.fn(async () => undefined);
    const retryingFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({ ok: false, status: 503, statusText: 'Unavailable', retryAfter: '0' })
      )
      .mockResolvedValueOnce(response({ ok: true, status: 200, payload: [] }));

    await expect(
      fetchIssues({
        repo: 'chistiq/rapidkit-vscode',
        token: 'token',
        state: 'open',
        fetchImpl: retryingFetch,
        sleep,
      })
    ).resolves.toEqual([]);
    expect(sleep).toHaveBeenCalledWith(0);

    const forbiddenFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response({ ok: false, status: 403, statusText: 'Forbidden', body: 'denied' })
      );
    await expect(
      fetchIssues({
        repo: 'chistiq/rapidkit-vscode',
        token: 'token',
        state: 'open',
        fetchImpl: forbiddenFetch,
        sleep,
      })
    ).rejects.toThrow('403 Forbidden');
    expect(forbiddenFetch).toHaveBeenCalledTimes(1);
  });

  it('reports the final transport cause after exhausting the bounded retry budget', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(
      new TypeError('fetch failed', {
        cause: Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }),
      })
    );

    await expect(
      fetchIssues({
        repo: 'chistiq/rapidkit-vscode',
        token: 'token',
        state: 'open',
        fetchImpl,
        sleep: async () => undefined,
        attempts: 3,
      })
    ).rejects.toThrow(
      'GitHub API transport failed after 3 attempt(s): fetch failed (ECONNRESET: connection reset)'
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

import { describe, expect, it, vi } from 'vitest';

import {
  assertPublicHttpsUrl,
  fetchStudioPublicWeb,
  htmlToPublicText,
  isBlockedIpAddress,
} from '../core/studioPublicWebFetch.js';

describe('Studio public web fetch', () => {
  it('rejects private, local, credentialed, and non-HTTPS URLs', async () => {
    expect(isBlockedIpAddress('127.0.0.1')).toBe(true);
    expect(isBlockedIpAddress('10.0.0.8')).toBe(true);
    expect(isBlockedIpAddress('192.168.1.9')).toBe(true);
    expect(isBlockedIpAddress('169.254.169.254')).toBe(true);
    expect(isBlockedIpAddress('::1')).toBe(true);
    expect(isBlockedIpAddress('8.8.8.8')).toBe(false);

    await expect(assertPublicHttpsUrl('http://example.com')).rejects.toThrow(/HTTPS/);
    await expect(assertPublicHttpsUrl('https://user:pass@example.com/secret')).rejects.toThrow(
      /credentials/
    );
    await expect(
      assertPublicHttpsUrl('https://localhost/docs', {
        fetch: vi.fn(),
        lookup: async () => ({ address: '127.0.0.1', family: 4 }),
      })
    ).rejects.toThrow(/private or local/);
    await expect(
      assertPublicHttpsUrl('https://docs.example.com/api', {
        fetch: vi.fn(),
        lookup: async () => ({ address: '10.1.1.1', family: 4 }),
      })
    ).rejects.toThrow(/private address/);
  });

  it('strips HTML and returns bounded public text', async () => {
    expect(htmlToPublicText('<html><script>x()</script><h1>Title</h1><p>Body</p></html>')).toMatch(
      /Title[\s\S]*Body/
    );
    const fetchMock = vi.fn(async () => {
      return new Response('<html><h1>Rate limit</h1><p>Retry after 60 seconds.</p></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    });
    await expect(
      fetchStudioPublicWeb(
        { url: 'https://docs.example.com/errors' },
        {
          fetch: fetchMock as unknown as typeof fetch,
          lookup: async () => ({ address: '93.184.216.34', family: 4 }),
        }
      )
    ).resolves.toMatchObject({
      ok: true,
      output: {
        schemaVersion: 'workspai.studio-public-web-fetch.v1',
        requestedUrl: 'https://docs.example.com/errors',
        status: 200,
        truncated: false,
        text: expect.stringContaining('Rate limit'),
      },
    });
  });

  it('re-validates redirect targets before following them', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://docs.example.com/old') {
        return new Response('', {
          status: 302,
          headers: { location: 'http://127.0.0.1/secret' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    await expect(
      fetchStudioPublicWeb(
        { url: 'https://docs.example.com/old' },
        {
          fetch: fetchMock as unknown as typeof fetch,
          lookup: async () => ({ address: '93.184.216.34', family: 4 }),
        }
      )
    ).resolves.toMatchObject({
      ok: false,
      error: expect.stringMatching(/HTTPS|private or local/),
    });
  });
});

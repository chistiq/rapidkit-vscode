import { fetchStudioPublicWeb, type StudioPublicWebFetchResult } from './studioPublicWebFetch.js';

export async function searchStudioPublicWeb(
  input: { query: string; signal?: AbortSignal },
  fetchPage: typeof fetchStudioPublicWeb = fetchStudioPublicWeb
): Promise<StudioPublicWebFetchResult> {
  const query = input.query.trim();
  if (!query || query.length > 1_000) {
    return { ok: false, error: 'Web search requires a query of 1 to 1000 characters.' };
  }
  const failures: string[] = [];
  for (const endpoint of [
    'https://html.duckduckgo.com/html/?q=',
    'https://www.bing.com/search?q=',
  ]) {
    if (input.signal?.aborted) {
      return { ok: false, error: 'Web search was cancelled.' };
    }
    const result = await fetchPage({
      url: endpoint + encodeURIComponent(query),
      signal: input.signal,
    });
    const links = result.output?.links?.filter(
      (link) =>
        !['duckduckgo.com', 'html.duckduckgo.com', 'www.bing.com', 'bing.com'].includes(
          new URL(link.url).hostname
        )
    );
    if (
      result.ok &&
      result.output &&
      links?.length &&
      !/captcha|challenge-form|verify you are human/i.test(result.output.text)
    ) {
      return {
        ...result,
        output: {
          ...result.output,
          links,
          text: `Search query: ${query}\n\n${result.output.text}`,
        },
      };
    }
    failures.push(
      result.error || 'Search provider returned no usable results or requested a browser challenge.'
    );
  }
  return {
    ok: false,
    error: `Public web search could not retrieve results. ${failures.join(' ')} Try fetch-public-web with an official documentation URL or a registered search/browser host tool.`,
  };
}

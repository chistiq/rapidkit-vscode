export class AIProviderConfigurationError extends Error {}

export function validateAIProviderBaseUrl(baseUrl: string): string | null {
  if (!baseUrl.trim()) {
    return 'Base URL is missing.';
  }
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return 'Base URL must use HTTP or HTTPS.';
    }
    if (url.username || url.password || url.search || url.hash) {
      return 'Base URL cannot contain credentials, query parameters, or a fragment.';
    }
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      return 'HTTP AI providers are only allowed for localhost.';
    }
    return null;
  } catch {
    return 'Base URL is not a valid URL.';
  }
}

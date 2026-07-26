import { describe, expect, it } from 'vitest';

import {
  getAIProviderDefinition,
  isAIProviderKind,
  listAIProviderDefinitions,
  normalizeAIProviderKind,
} from '../core/aiProviderCatalog.js';

describe('AI provider catalog', () => {
  it('publishes unique, executable provider definitions', () => {
    const providers = listAIProviderDefinitions();
    expect(providers.map((provider) => provider.id)).toEqual([
      'vscode-lm',
      'openai',
      'anthropic',
      'gemini',
      'kimi',
      'deepseek',
      'openrouter',
      'groq',
      'mistral',
      'xai',
      'ollama',
      'openai-compatible',
    ]);
    expect(new Set(providers.map((provider) => provider.id)).size).toBe(providers.length);

    for (const provider of providers) {
      expect(provider.label.trim()).not.toBe('');
      expect(provider.description.trim()).not.toBe('');
      if (provider.id !== 'vscode-lm' && provider.id !== 'openai-compatible') {
        expect(provider.defaultBaseUrl).toMatch(/^https?:\/\//);
        expect(provider.defaultModel).not.toBe('');
        expect(provider.docsUrl).toMatch(/^https:\/\//);
      }
    }
  });

  it('normalizes unknown providers without accepting arbitrary configuration values', () => {
    expect(isAIProviderKind('gemini')).toBe(true);
    expect(isAIProviderKind('unknown-cloud')).toBe(false);
    expect(normalizeAIProviderKind('unknown-cloud')).toBe('vscode-lm');
    expect(getAIProviderDefinition('kimi')).toMatchObject({
      protocol: 'openai-compatible',
      requiresApiKey: true,
    });
  });
});

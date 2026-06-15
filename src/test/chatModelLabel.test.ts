import { describe, expect, it } from 'vitest';
import { resolveChatModelLabel } from '../../webview-ui/src/lib/chatModelLabel';

describe('resolveChatModelLabel', () => {
  const models = [
    { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', vendor: 'OpenAI' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', vendor: 'Anthropic' },
  ];

  it('returns Auto when no model is selected', () => {
    expect(resolveChatModelLabel(null, models, 'auto')).toBe('Auto');
    expect(resolveChatModelLabel(undefined, models, 'auto')).toBe('Auto');
  });

  it('uses preferred model when session selection is unset', () => {
    expect(resolveChatModelLabel(null, models, 'gpt-5.3-codex')).toBe('GPT-5.3 Codex');
  });

  it('prefers explicit session selection over preferred model', () => {
    expect(resolveChatModelLabel('claude-sonnet-4-6', models, 'gpt-5.3-codex')).toBe(
      'Claude Sonnet 4.6'
    );
  });
});

import { describe, expect, it } from 'vitest';

import {
  languageModelSelectionIdentifier,
  languageModelSupportsExtensionRequests,
} from '../core/aiModelIdentity.js';

describe('AI model picker identity', () => {
  it('uses provider-qualified identifiers and preserves provider-less models', () => {
    expect(languageModelSelectionIdentifier({ vendor: 'copilot', id: 'gpt-5.4' })).toBe(
      'copilot/gpt-5.4'
    );
    expect(languageModelSelectionIdentifier({ vendor: 'byok', id: 'gpt-5.4' })).toBe(
      'byok/gpt-5.4'
    );
    expect(languageModelSelectionIdentifier({ id: 'local-model' })).toBe('local-model');
  });

  it('excludes session-only providers that cannot answer extension LM requests', () => {
    expect(languageModelSupportsExtensionRequests({ vendor: 'copilot' })).toBe(true);
    expect(languageModelSupportsExtensionRequests({ vendor: 'byok' })).toBe(true);
    expect(languageModelSupportsExtensionRequests({ vendor: 'copilotcli' })).toBe(false);
    expect(languageModelSupportsExtensionRequests({ vendor: 'claude-code' })).toBe(false);
  });
});

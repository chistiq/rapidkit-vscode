import { describe, expect, it } from 'vitest';

import { redactAIActionText } from '../core/aiActionRedaction';

describe('aiActionRedaction', () => {
  it('redacts common provider and api tokens from evidence text', () => {
    const redacted = redactAIActionText(
      [
        'Authorization: Bearer abc.def.ghi',
        'plain Bearer xyz.abc.def',
        'OPENAI_API_KEY=sk-secret-value',
        'token: ghp_abcdefghijklmnopqrstuvwxyz123456',
        'raw=abcdefghijklmnopqrstuvwxyz1234567890ABCDEF',
      ].join('\n')
    );

    expect(redacted).toContain('Authorization=[redacted]');
    expect(redacted).toContain('plain Bearer [redacted]');
    expect(redacted).toContain('OPENAI_API_KEY=[redacted]');
    expect(redacted).toContain('token=[redacted]');
    expect(redacted).toContain('raw=[redacted]');
    expect(redacted).not.toContain('sk-secret-value');
    expect(redacted).not.toContain('abc.def.ghi');
    expect(redacted).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz123456');
  });

  it('leaves ordinary command output intact', () => {
    expect(redactAIActionText('PASS src/test/example.test.ts')).toBe(
      'PASS src/test/example.test.ts'
    );
  });
});

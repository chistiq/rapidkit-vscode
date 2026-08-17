import { describe, expect, it } from 'vitest';

import { redactKnownRuntimePathsForConsumer } from '../core/consumerPathRedaction.js';

describe('known runtime path redaction', () => {
  it('removes session roots while preserving API route evidence', () => {
    const value = [
      'workspace=/srv/team/workspai',
      'project=/srv/team/workspai/services/api/src/main.ts',
      'route=/api/health',
    ].join('\n');

    const redacted = redactKnownRuntimePathsForConsumer(value, [
      { path: '/srv/team/workspai/services/api', token: '$PROJECT' },
      { path: '/srv/team/workspai', token: '$WORKSPACE' },
    ]);

    expect(redacted).toContain('workspace=$WORKSPACE');
    expect(redacted).toContain('project=$PROJECT/src/main.ts');
    expect(redacted).toContain('route=/api/health');
    expect(redacted).not.toContain('/srv/team');
  });

  it('normalizes Windows separator variants without exposing drive identity', () => {
    const redacted = redactKnownRuntimePathsForConsumer(
      'C:\\Users\\dev\\workspace\\api\\src\\app.ts and C:/Users/dev/workspace',
      [
        { path: 'C:\\Users\\dev\\workspace\\api', token: '$PROJECT' },
        { path: 'C:\\Users\\dev\\workspace', token: '$WORKSPACE' },
      ]
    );

    expect(redacted).toBe('$PROJECT\\src\\app.ts and $WORKSPACE');
  });
});

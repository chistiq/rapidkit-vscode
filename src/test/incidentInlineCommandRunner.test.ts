import { describe, expect, it } from 'vitest';

import {
  parseRapidkitInlineCommand,
  resolveRapidkitExecutionPlan,
} from '../core/incidentInlineCommandRunner';

describe('incidentInlineCommandRunner', () => {
  it('parses allowed rapidkit commands without shell metacharacters', () => {
    expect(parseRapidkitInlineCommand('npx rapidkit doctor workspace --json')).toEqual({
      rapidkitArgs: ['doctor', 'workspace', '--json'],
      displayCommand: 'rapidkit doctor workspace --json',
    });
  });

  it('rejects shell chaining and unknown roots', () => {
    expect(parseRapidkitInlineCommand('npx rapidkit doctor workspace; rm -rf /')).toMatchObject({
      error: expect.stringContaining('metacharacters'),
    });
    expect(parseRapidkitInlineCommand('npx rapidkit deploy workspace')).toMatchObject({
      error: expect.stringContaining('not allowed'),
    });
  });

  it('rejects projects outside the active workspace', async () => {
    const plan = await resolveRapidkitExecutionPlan({
      command: 'npx rapidkit test',
      workspacePath: '/ws',
      projectPath: '/other/project',
      projectBelongsToWorkspace: false,
    });

    expect(plan).toMatchObject({
      error: expect.stringContaining('outside the active workspace'),
    });
  });
});

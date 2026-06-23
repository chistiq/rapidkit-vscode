import fs from 'fs-extra';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('architectureLensCodeLensProvider', () => {
  it('routes primary code lens to npm architecture workspace advisor with AI fallback', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../providers/architectureLensCodeLensProvider.ts'),
      'utf8'
    );

    expect(source).toContain("command: 'workspai.architectureImpactLens'");
    expect(source).toContain("command: 'workspai.aiChangeImpactLite'");
    expect(source).toContain('Run npm Workspace Advisor with graph-backed project scope');
    expect(source).toContain('Optional AI review with architecture graph seed context');
  });
});

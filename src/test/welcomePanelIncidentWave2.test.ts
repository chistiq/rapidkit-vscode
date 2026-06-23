import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('welcomePanelIncidentWave2', () => {
  it('exports buildIncidentWave2Contracts with release-gate verify completeness wiring', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelIncidentWave2.ts'),
      'utf8'
    );

    expect(source).toContain('export async function buildIncidentWave2Contracts');
    expect(source).toContain('resolveFallbackWorkspacePath?.()');
    expect(source).toContain('const verifyCompletenessCheck = assessVerifyCompleteness');
    expect(source).toContain('blockMutationWhenScopeUnknown');
  });
});

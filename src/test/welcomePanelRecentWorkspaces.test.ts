import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('welcomePanelRecentWorkspaces', () => {
  it('exports buildRecentWorkspaces with workspace enrichment wiring', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelRecentWorkspaces.ts'),
      'utf8'
    );

    expect(source).toContain('export async function buildRecentWorkspaces');
    expect(source).toContain('WorkspaceManager.getInstance()');
    expect(source).toContain('CoreVersionService.getInstance()');
    expect(source).toContain('host.detectProjectType');
    expect(source).toContain('bootstrap-compliance');
    expect(source).toContain('mirror-ops');
    expect(source).toContain('coreLatestVersion: versionInfo.latest');
  });
});

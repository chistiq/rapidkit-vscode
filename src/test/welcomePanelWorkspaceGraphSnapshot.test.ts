import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('vscode', () => ({
  workspace: { workspaceFolders: [] },
  window: {},
}));

describe('welcomePanelWorkspaceGraphSnapshot', () => {
  it('exports buildWorkspaceGraphSnapshot with evidence completeness wiring', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelWorkspaceGraphSnapshot.ts'),
      'utf8'
    );

    expect(source).toContain('export async function buildWorkspaceGraphSnapshot');
    expect(source).toContain('assessIncidentStudioCompleteness');
    expect(source).toContain('mapCompletenessLevelToGraphFlag');
    expect(source).toContain("snapshotVersion: 'v1'");
    expect(source).toContain('host.readInstalledModules');
    expect(source).toContain('Git context unavailable (not a repository or git is not installed).');
  });
});

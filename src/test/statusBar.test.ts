import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('workspaiStatusBar', () => {
  it('uses native codicons instead of emoji in status bar labels', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(path.resolve(currentDir, '../ui/statusBar.ts'), 'utf8');

    expect(source).toContain('$(rocket) Workspai');
    expect(source).toContain('$(sync~spin) Workspai:');
    expect(source).toContain('$(error) Workspai');
    expect(source).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });

  it('keeps one ambient truth line for workspace, top blocker, and CLI version', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(path.resolve(currentDir, '../ui/statusBar.ts'), 'utf8');

    expect(source).toContain('export type WorkspaiStatusBarTruth');
    expect(source).toContain('updateAmbientTruth');
    expect(source).toContain('workspaceName');
    expect(source).toContain('topBlocker');
    expect(source).toContain('cliVersion');
    expect(source).toContain("`$(rocket) Workspai · ${segments.join(' · ')}`");
    expect(source).toContain('Top: none loaded');
    expect(source).toContain('compactStatusSegment');
    expect(source).toContain('Top blocker:');
    expect(source).toContain('Workspai CLI:');
  });
});

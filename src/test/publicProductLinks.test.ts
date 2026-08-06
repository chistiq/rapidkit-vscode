import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('public product links and version truth', () => {
  it('centralizes dashboard links on the canonical extension URLs', () => {
    const shortcuts = read('src/ui/panels/welcomePanelDashboardShortcutMessages.ts');
    const constants = read('src/utils/constants.ts');

    expect(shortcuts).toContain('vscode.Uri.parse(URLS.GITHUB)');
    expect(shortcuts).toContain('vscode.Uri.parse(URLS.MARKETPLACE)');
    expect(shortcuts).not.toContain('github.com/rapidkit/rapidkit');
    expect(shortcuts).not.toContain("itemName=rapidkit.rapidkit'");
    expect(constants).toContain("GITHUB: 'https://github.com/chistiq/rapidkit-vscode'");
    expect(constants).toContain('itemName=rapidkit.rapidkit-vscode');
  });

  it('never reports a stale hard-coded extension version when VS Code metadata is unavailable', () => {
    const constants = read('src/utils/constants.ts');

    expect(constants).toContain(": 'unknown'");
    expect(constants).not.toMatch(/return extension\?\.packageJSON\?\.version \|\| '\\d/);
  });
});

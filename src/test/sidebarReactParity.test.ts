import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { SIDEBAR_ACTION_SURFACE } from '../contracts/sidebarActionSurface';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

/**
 * Guards the React sidebar migration (roadmap 2.11). The activity-bar Quick
 * Actions now render via the React `sidebar` bundle instead of raw HTML; these
 * checks keep the command IDs in sync with the host action surface and ensure
 * the bundle is actually built + loaded.
 */
describe('React sidebar parity (roadmap 2.11)', () => {
  it('Quick Actions command IDs resolve against the sidebar action surface', () => {
    const source = read('webview-ui/src/sidebar/QuickActionsGrid.tsx');
    const commandIds = Array.from(source.matchAll(/command:\s*'([^']+)'/g)).map((m) => m[1]);

    expect(commandIds).toEqual([
      'openWelcome',
      'createWithAI',
      'workspaceAdvisor',
      'incidentStudioNext',
      'doctor',
    ]);

    for (const id of commandIds) {
      expect(
        (SIDEBAR_ACTION_SURFACE as Record<string, unknown>)[id],
        `sidebar action surface should define "${id}"`
      ).toBeTruthy();
    }
  });

  it('esbuild builds a dedicated sidebar entry point', () => {
    const esbuild = read('webview-ui/esbuild.js');
    expect(esbuild).toContain("sidebar: 'src/sidebar/index.tsx'");
  });

  it('both provider variants load the React sidebar bundle', () => {
    const provider = read('src/ui/webviews/actionsWebviewProvider.ts');
    expect(provider).toContain("bundleName: 'sidebar'");
    expect(provider).toContain('WORKSPAI_SIDEBAR_VARIANT: this._variant');
  });

  it('the shared React webview shell helper is used by the dashboard panel too', () => {
    const welcome = read('src/ui/panels/welcomePanel.ts');
    expect(welcome).toContain('buildReactWebviewHtml');
    expect(welcome).toContain("bundleName: 'webview'");
  });
});

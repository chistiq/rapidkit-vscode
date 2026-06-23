import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('workspaiA11ySurfaces', () => {
  it('loads shared a11y overrides on every webview bundle entrypoint', () => {
    const dashboardEntry = read('webview-ui/src/index.tsx');
    const sidebarEntry = read('webview-ui/src/sidebar/index.tsx');

    expect(dashboardEntry).toContain("import '@/styles/workspai-a11y.css'");
    expect(sidebarEntry).toContain("import '@/styles/workspai-a11y.css'");
    expect(dashboardEntry.indexOf("import '@/styles/workspai-a11y.css'")).toBeGreaterThan(
      dashboardEntry.indexOf("import '@/styles/responsive.css'")
    );
    expect(sidebarEntry.indexOf("import '@/styles/workspai-a11y.css'")).toBeGreaterThan(
      sidebarEntry.indexOf('./sidebar.css')
    );
  });

  it('locks reduced-motion and forced-colors rules in the shared stylesheet', () => {
    const a11y = read('webview-ui/src/styles/workspai-a11y.css');

    expect(a11y).toContain('@media (prefers-reduced-motion: reduce)');
    expect(a11y).toContain('@media (forced-colors: active)');
    expect(a11y).toContain('animation-duration: 0.01ms !important');
    expect(a11y).toContain('scroll-behavior: auto !important');
    expect(a11y).toContain('outline: 2px solid Highlight !important');
    expect(a11y).toContain('.ws-sidebar__tile');
    expect(a11y).toContain('.ws-card');
    expect(a11y).toContain('.studio-glass-card');
  });

  it('avoids duplicate global a11y media blocks in surface stylesheets', () => {
    const studioChrome = read('webview-ui/src/styles/workspai-studio-chrome.css');
    const responsive = read('webview-ui/src/styles/responsive.css');
    const sidebar = read('webview-ui/src/sidebar/sidebar.css');

    expect(studioChrome).toContain('workspai-a11y.css');
    expect(studioChrome).not.toContain('@media (prefers-reduced-motion: reduce)');
    expect(responsive).not.toContain('@media (prefers-reduced-motion: reduce)');
    expect(sidebar).not.toContain('@media (prefers-reduced-motion: reduce)');
    expect(sidebar).not.toContain('@media (forced-colors: active)');
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('welcomePanelDashboardEvidence', () => {
  it('exports dashboard evidence assembly and host wiring hooks', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelDashboardEvidence.ts'),
      'utf8'
    );
    const welcomePanelSource = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanel.ts'),
      'utf8'
    );

    expect(source).toContain('export async function sendDashboardEvidence');
    expect(source).toContain('export function resolveDashboardProjectContext');
    expect(source).toContain('export function isActiveDashboardWorkspace');
    expect(source).toContain('buildDashboardEvidenceBundle');
    expect(source).toContain("postWebviewMessage(\n    'dashboardEvidence'");
    expect(source).toContain('onboarding:');
    expect(source).toContain('refreshMode:');
    expect(welcomePanelSource).toContain('_dashboardEvidenceHost()');
    expect(welcomePanelSource).toContain('sendDashboardEvidence(this._dashboardEvidenceHost()');
    expect(welcomePanelSource).not.toContain('buildDashboardEvidenceBundle({');
  });
});

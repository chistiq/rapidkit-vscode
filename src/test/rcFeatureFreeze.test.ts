import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { DASHBOARD_EVIDENCE_CARD_IDS } from '../contracts/dashboardEvidenceCards';
import { DASHBOARD_SECTIONS } from '../../webview-ui/src/lib/dashboardSections';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

describe('RC feature freeze', () => {
  it('freezes dashboard evidence card expansion until RC', () => {
    expect([...DASHBOARD_EVIDENCE_CARD_IDS]).toEqual([
      'doctor',
      'projectDoctor',
      'pipeline',
      'analyze',
      'readiness',
      'bootstrap',
      'workspaceSync',
      'foundation',
      'contract',
      'autopilot',
      'workspaceRun',
      'setup',
      'importReadiness',
      'snapshot',
      'workspaceModel',
      'intelligenceSnapshot',
      'workspaceDiff',
      'workspaceImpact',
      'workspaceVerify',
      'workspaceExplain',
      'workspaceWhy',
      'workspaceTrace',
      'workspaceWatch',
      'workspaceContextAgent',
      'agentGrounding',
      'share',
      'archive',
      'mirror',
      'cache',
      'policy',
      'infra',
    ]);
  });

  it('freezes primary Dashboard tabs and labels until RC', () => {
    expect(DASHBOARD_SECTIONS.map((section) => [section.id, section.label])).toEqual([
      ['overview', 'Home'],
      ['operate', 'Run'],
      ['repair', 'Repair'],
      ['evidence', 'Artifacts'],
      ['console', 'Project'],
      ['catalog', 'Library'],
    ]);
  });

  it('freezes secondary sidebar tabs and Studio modes until RC', () => {
    const sidebar = read('webview-ui/src/sidebar/SecondarySidebar.tsx');

    expect(sidebar).toContain("id: 'create'");
    expect(sidebar).toContain("id: 'impact'");
    expect(sidebar).toContain("id: 'studio'");
    expect(sidebar).toContain("label: 'Create with AI'");
    expect(sidebar).toContain("shortLabel: 'Create'");
    expect(sidebar).toContain("label: 'Workspace Advisor'");
    expect(sidebar).toContain("label: 'Studio'");
    expect(sidebar).toContain("type StudioMode = 'investigate' | 'verify' | 'prepare'");
    expect(sidebar).toContain("{ id: 'investigate', label: 'Detect'");
    expect(sidebar).toContain("id: 'verify'");
    expect(sidebar).toContain("id: 'prepare'");
    expect(sidebar).not.toContain("type StudioMode = 'investigate' | 'verify' | 'prepare' |");
  });
});

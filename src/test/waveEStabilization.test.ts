import fs from 'fs-extra';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { WORKSPAI_AI_NARRATIVE } from '../../webview-ui/src/lib/workspaiAiNarrative';
import { WORKSPAI_AI_NARRATIVE as HOST_AI_NARRATIVE } from '../core/workspaiAiNarrative';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('Wave E — Studio vs Dashboard AI narrative', () => {
  it('keeps canonical narrative in contracts/workspai-ai-narrative.v1.json', () => {
    const contract = JSON.parse(
      read('contracts/workspai-ai-narrative.v1.json')
    ) as typeof WORKSPAI_AI_NARRATIVE;

    expect(contract.schemaVersion).toBe('workspai-ai-narrative-v1');
    expect(contract.workflowLoop).toBe('Evidence → deterministic command → verify');
    expect(WORKSPAI_AI_NARRATIVE).toEqual(contract);
    expect(HOST_AI_NARRATIVE).toEqual(contract);
  });

  it('routes Dashboard and Studio surfaces through workspaiAiNarrative', () => {
    const dashboardRail = read('webview-ui/src/components/DashboardNextStepRail.tsx');
    const narrativeLib = read('webview-ui/src/lib/workspaiAiNarrative.ts');
    const secondarySidebar = read('webview-ui/src/sidebar/SecondarySidebar.tsx');
    const projectActions = read('webview-ui/src/components/ProjectActions.tsx');
    const enterpriseFlow = read('webview-ui/src/components/EnterpriseDashboardFlow.tsx');
    const extension = read('src/extension.ts');

    expect(dashboardRail).toContain('WORKSPAI_DASHBOARD_NEXT_STEPS_META');
    expect(narrativeLib).toContain('WORKSPAI_STUDIO_GUIDED_EMPTY_BODY');
    expect(narrativeLib).toContain('WORKSPAI_GUIDED_CHIP_VERIFY_DETAIL');
    expect(secondarySidebar).toContain("id: 'studio'");
    expect(secondarySidebar).toContain("label: 'Assistant'");
    expect(projectActions).toContain('WORKSPAI_INCIDENT_STUDIO_PROJECT_TILE_DETAIL');
    expect(projectActions).toContain('WORKSPAI_AI_ASSISTANT_TILE_DETAIL');
    expect(enterpriseFlow).toContain('WORKSPAI_INCIDENT_STUDIO_WORKSPACE_TILE_DETAIL');
    expect(extension).toContain('WORKSPAI_AI_FLOWS_ONBOARDING_HEADLINE');
  });

  it('preserves distinct repair and guidance capabilities behind the unified Assistant', () => {
    expect(WORKSPAI_AI_NARRATIVE.incidentStudio.label).toBe('Incident Studio');
    expect(WORKSPAI_AI_NARRATIVE.aiAssistant.label).toBe('Workspace Advisor');
    expect(WORKSPAI_AI_NARRATIVE.incidentStudio.workspaceTileDetail).toContain('Evidence');
    expect(WORKSPAI_AI_NARRATIVE.aiAssistant.tileDetail).toContain('Workspace-aware');
  });
});

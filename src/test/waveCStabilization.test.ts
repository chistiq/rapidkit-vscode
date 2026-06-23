import fs from 'fs-extra';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('Wave C stabilization', () => {
  it('prefers polyglot before enterprise in stack intent heuristic', () => {
    const source = read('src/core/creationStackIntent.ts');
    expect(source).toContain('Full-stack signals win over governance-only enterprise cues');
    expect(source.indexOf("return 'polyglot'")).toBeLessThan(source.indexOf("return 'enterprise'"));
  });

  it('distinguishes recovery snapshot from intelligence snapshot in evidence bridge', () => {
    const source = read('src/core/dashboardEvidenceBridge.ts');
    expect(source).toContain("label: 'Recovery Snapshot'");
    expect(source).toContain('rapidkit workspace snapshot --json (not recovery snapshot create)');
  });

  it('parses LLM secondaryProject and gates adopt CLI', () => {
    const aiService = read('src/core/aiService.ts');
    const capabilities = read('src/core/rapidkitCliCapabilities.ts');
    const adoptProject = read('src/commands/adoptProject.ts');
    const modal = read('webview-ui/src/components/AICreateModal.tsx');

    expect(aiService).toContain('normalizeSecondaryProject');
    expect(aiService).toContain('"secondaryProject"');
    expect(capabilities).toContain('gateAdoptCli');
    expect(adoptProject).toContain('gateAdoptCli');
    expect(modal).toContain('editedCompanionProjectName');
  });

  it('auto-selects sole workspace project and syncs selectedProjectPath', () => {
    const welcomePanel = read('src/ui/panels/welcomePanel.ts');
    const workspaceSelection = read('src/commands/workspaceSelection.ts');

    expect(welcomePanel).toContain('projects.length === 1');
    expect(welcomePanel).toContain('setSelectedProjectPath');
    expect(workspaceSelection).toContain('setSelectedProjectPath(project.path)');
  });
});

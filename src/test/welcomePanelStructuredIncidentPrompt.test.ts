import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('vscode', () => ({
  workspace: { workspaceFolders: [] },
  window: {},
}));

describe('welcomePanelStructuredIncidentPrompt', () => {
  it('builds project-scoped AI modal context when project path is explicit', async () => {
    const { buildStructuredPromptAIModalContext } =
      await import('../ui/panels/welcomePanelStructuredIncidentPrompt.js');
    const context = buildStructuredPromptAIModalContext({
      workspacePath: '/tmp/ws',
      projectPath: '/tmp/ws/api',
      projectName: 'api',
      projectType: 'fastapi',
      scopeIntent: 'project',
    });

    expect(context.type).toBe('project');
    expect(context.path).toBe('/tmp/ws/api');
    expect(context.framework).toBe('fastapi');
    expect(context.workspaceRootPath).toBe('/tmp/ws');
  });

  it('builds workspace-scoped AI modal context when no project is selected', async () => {
    const { buildStructuredPromptAIModalContext } =
      await import('../ui/panels/welcomePanelStructuredIncidentPrompt.js');
    const context = buildStructuredPromptAIModalContext({
      workspacePath: '/tmp/ws',
      scopeIntent: 'workspace',
    });

    expect(context.type).toBe('workspace');
    expect(context.path).toBe('/tmp/ws');
    expect(context.name).toBe('ws');
  });

  it('keeps workspace and project structured prompt contracts stable', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelStructuredIncidentPrompt.ts'),
      'utf8'
    );

    expect(source).toContain('export async function buildStructuredIncidentPrompt');
    expect(source).toContain('WORKSPACE-LEVEL ANALYSIS');
    expect(source).toContain('Workspace Status:');
    expect(source).toContain('PROJECT EXECUTION STATE:');
    expect(source).toContain('buildIncidentFirstResponseRules');
  });
});

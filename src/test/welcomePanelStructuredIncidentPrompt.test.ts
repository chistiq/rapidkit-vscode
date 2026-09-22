import { describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
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

  it('reports governed agent readiness without treating it as a generic service', async () => {
    const project = mkdtempSync(path.join(os.tmpdir(), 'workspai-studio-agent-'));
    try {
      mkdirSync(path.join(project, 'agents', 'primary'), { recursive: true });
      mkdirSync(path.join(project, '.workspai', 'agent-frameworks'), { recursive: true });
      mkdirSync(path.join(project, '.workspai', 'reports'), { recursive: true });
      writeFileSync(path.join(project, 'agents', 'primary', 'pyproject.toml'), '[project]\n');
      writeFileSync(
        path.join(project, '.workspai', 'reports', 'project-context-agent.md'),
        'bounded evidence\n'
      );

      const { buildProjectExecutionBlock } =
        await import('../ui/panels/welcomePanelStructuredIncidentPrompt.js');
      const block = await buildProjectExecutionBlock(
        { projectPath: project, projectName: 'support-agent', projectType: 'agent' },
        async () => 'unknown'
      );

      expect(block).toContain('Governed agent runtime: python');
      expect(block).toContain('Managed adapter state: present');
      expect(block).toContain('Bounded agent context: present');
      expect(block).toContain('verified agent handoff');
      expect(block).not.toContain('path to a running service');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('describes an OpenRouter gateway without a synthetic service port or RapidKit modules', async () => {
    const project = mkdtempSync(path.join(os.tmpdir(), 'workspai-studio-gateway-'));
    try {
      const { buildProjectExecutionBlock } =
        await import('../ui/panels/welcomePanelStructuredIncidentPrompt.js');
      const block = await buildProjectExecutionBlock(
        {
          projectPath: project,
          projectName: 'model-gateway',
          projectType: 'gateway.openrouter.typescript',
        },
        async () => 'unknown'
      );

      expect(block).toContain('source-ready');
      expect(block).toContain('Attach is unsupported');
      expect(block).toContain('Do not treat this project as a RapidKit module host');
      expect(block).not.toContain('path to a running service');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });
});

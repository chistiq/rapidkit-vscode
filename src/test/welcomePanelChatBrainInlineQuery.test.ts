import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  env: {
    clipboard: {
      readText: vi.fn(async () => ''),
    },
  },
  window: {
    activeTextEditor: undefined,
  },
  commands: {
    executeCommand: vi.fn(async () => undefined),
  },
}));

describe('welcomePanelChatBrainInlineQuery', () => {
  it('builds inline-command decision clarity contract for project scope', async () => {
    const { buildInlineQueryFromAction } =
      await import('../ui/panels/welcomePanelChatBrainInlineQuery.js');
    const query = await buildInlineQueryFromAction(
      'inline-command',
      { command: 'pnpm test --filter api' },
      'project'
    );

    expect(query).toContain('inline command intent: pnpm test --filter api');
    expect(query).toContain('1) Situation');
    expect(query).toContain('7) Rollback plan');
  });

  it('builds workspace-scoped verify-pack-autopilot sections', async () => {
    const { buildInlineQueryFromAction } =
      await import('../ui/panels/welcomePanelChatBrainInlineQuery.js');
    const query = await buildInlineQueryFromAction('verify-pack-autopilot', {}, 'workspace');

    expect(query).toContain('ALL projects in this workspace');
    expect(query).toContain('Workspace verify pack quality score');
    expect(query).toContain('Blocking reasons (workspace-level and per-project)');
  });

  it('falls back to generic orchestrate guidance with payload label', async () => {
    const { buildInlineQueryFromAction } =
      await import('../ui/panels/welcomePanelChatBrainInlineQuery.js');
    const query = await buildInlineQueryFromAction(
      'custom-action',
      { label: 'Audit auth middleware' },
      'project'
    );

    expect(query).toContain('Audit auth middleware');
    expect(query).toContain('for my project');
  });
});

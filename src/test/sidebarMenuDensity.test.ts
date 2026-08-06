import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

type MenuEntry = {
  command?: string;
  when?: string;
  group?: string;
};

function manifestMenus(): Record<string, MenuEntry[]> {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
  ) as {
    contributes?: { menus?: Record<string, MenuEntry[]> };
  };
  return manifest.contributes?.menus ?? {};
}

describe('primary sidebar menu density', () => {
  it('keeps workspace title actions focused and moves secondary actions to overflow', () => {
    const titleActions = (manifestMenus()['view/title'] ?? []).filter(
      (entry) => entry.when === 'view == rapidkitWorkspaces'
    );
    const visible = titleActions.filter((entry) => entry.group?.startsWith('navigation@'));
    const overflow = titleActions.filter((entry) => entry.group?.startsWith('workspace_actions@'));

    expect(visible.map((entry) => entry.command)).toEqual([
      'workspai.quickSwitchWorkspace',
      'workspai.refreshWorkspaces',
    ]);
    expect(overflow.map((entry) => entry.command)).toEqual([
      'workspai.discoverWorkspaces',
      'workspai.importWorkspace',
      'workspai.exportWorkspaceShareBundle',
    ]);
  });

  it('caps inline workspace and project actions at three without losing run commands', () => {
    const menus = manifestMenus();
    const itemActions = menus['view/item/context'] ?? [];
    const workspaceInline = itemActions.filter(
      (entry) =>
        entry.when === 'view == rapidkitWorkspaces && viewItem == workspace' &&
        entry.group?.startsWith('inline@')
    );
    const projectInline = itemActions.filter(
      (entry) =>
        entry.when?.includes('view == rapidkitProjects') && entry.group?.startsWith('inline@')
    );

    expect(workspaceInline).toHaveLength(3);
    expect(new Set(projectInline.map((entry) => entry.group))).toEqual(
      new Set(['inline@0', 'inline@2', 'inline@3'])
    );
    expect((menus['workspai.workspace.run'] ?? []).map((entry) => entry.command)).toEqual(
      expect.arrayContaining(['workspai.workspaceTerminal', 'workspai.workspaceRunTest'])
    );
  });
});

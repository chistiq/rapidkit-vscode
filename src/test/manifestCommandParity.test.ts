import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

const INTERNAL_REGISTERED_COMMANDS = new Set([
  'workspai.clearRequirementCache',
  'workspai.getSelectedProject',
  'workspai.getSelectedWorkspace',
  'workspai.incidentStudioNext',
  'workspai.openDashboardSection',
  'workspai.openProjectModal',
  'workspai.test',
  'workspai.workspaceSelected',
]);

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function collectSourceFiles(dir: string, baseDir = dir): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(absolutePath, baseDir);
    }
    if (!entry.name.endsWith('.ts')) {
      return [];
    }
    return [path.relative(baseDir, absolutePath)];
  });
}

function collectRegisteredCommands(): string[] {
  const sourceFiles = collectSourceFiles(path.join(repoRoot, 'src'))
    .filter((relPath) => !relPath.startsWith('test/'))
    .filter((relPath) => !relPath.includes(`${path.sep}test${path.sep}`));
  const commandIds = new Set<string>();
  const commandPattern = /registerCommand\(\s*['"]([^'"]+)['"]/g;

  for (const relPath of sourceFiles) {
    const content = read(path.join('src', relPath));
    let match: RegExpExecArray | null;
    while ((match = commandPattern.exec(content)) !== null) {
      commandIds.add(match[1]);
    }
  }

  return [...commandIds].sort();
}

describe('extension manifest command parity', () => {
  it('keeps user-facing registered workspai commands contributed in package.json', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      contributes?: { commands?: Array<{ command: string }> };
    };
    const contributedCommands = new Set(
      (packageJson.contributes?.commands ?? []).map((entry) => entry.command)
    );
    const registeredCommands = collectRegisteredCommands().filter((commandId) =>
      commandId.startsWith('workspai.')
    );
    const uncontributedCommands = registeredCommands.filter(
      (commandId) => !contributedCommands.has(commandId)
    );

    expect(uncontributedCommands).toEqual([...INTERNAL_REGISTERED_COMMANDS].sort());
  });

  it('keeps every contributed workspai command backed by a registered source command', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      contributes?: { commands?: Array<{ command: string }> };
    };
    const registeredCommands = new Set(collectRegisteredCommands());
    const contributedCommands = (packageJson.contributes?.commands ?? [])
      .map((entry) => entry.command)
      .filter((commandId) => commandId.startsWith('workspai.'));

    for (const commandId of contributedCommands) {
      expect(registeredCommands, commandId).toContain(commandId);
    }
  });

  it('routes workspace AI context actions to the Workspai sidebar surface', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      contributes?: {
        menus?: Record<string, Array<{ command?: string; when?: string }>>;
        submenus?: Array<{ id?: string; label?: string }>;
      };
    };
    const workspaceAICommands = (
      packageJson.contributes?.menus?.['workspai.workspace.ai'] ?? []
    ).map((entry) => entry.command);
    const workspaceAISubmenu = packageJson.contributes?.submenus?.find(
      (entry) => entry.id === 'workspai.workspace.ai'
    );
    const paletteEntry = packageJson.contributes?.menus?.commandPalette?.find(
      (entry) => entry.command === 'workspai.aiWorkspaceMemoryWizard'
    );

    expect(workspaceAISubmenu?.label).toBe('Workspai Actions');
    expect(workspaceAISubmenu?.label).not.toBe('AI & Insights');
    expect(workspaceAICommands).toContain('workspai.openCreateWithAI');
    expect(workspaceAICommands).toContain('workspai.openWorkspaceAdvisor');
    expect(workspaceAICommands).toContain('workspai.openIncidentStudio');
    expect(workspaceAICommands).not.toContain('workspai.editWorkspaceMemory');
    expect(workspaceAICommands).not.toContain('workspai.aiWorkspaceMemoryWizard');
    expect(paletteEntry?.when).toBe('false');
  });
});

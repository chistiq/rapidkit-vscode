import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  PALETTE_CORE_COMMAND_IDS,
  PALETTE_CORE_COMMANDS,
  isPaletteCoreCommand,
} from '../contracts/paletteCommandSurface';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('paletteCommandSurface', () => {
  it('declares core palette commands for navigation, onboarding, and sidebar quick actions', () => {
    expect(PALETTE_CORE_COMMAND_IDS.length).toBeGreaterThanOrEqual(5);
    expect(PALETTE_CORE_COMMAND_IDS.length).toBeLessThanOrEqual(10);
    expect(new Set(PALETTE_CORE_COMMAND_IDS).size).toBe(PALETTE_CORE_COMMAND_IDS.length);

    expect(PALETTE_CORE_COMMAND_IDS).toContain('workspai.showWelcome');
    expect(PALETTE_CORE_COMMAND_IDS).toContain('workspai.createWorkspace');
    expect(PALETTE_CORE_COMMAND_IDS).toContain('workspai.importWorkspace');
    expect(PALETTE_CORE_COMMAND_IDS).toContain('workspai.adoptProject');
    expect(PALETTE_CORE_COMMAND_IDS).toContain('workspai.openCreateWithAI');
    expect(PALETTE_CORE_COMMAND_IDS).toContain('workspai.openWorkspaceAdvisor');
    expect(PALETTE_CORE_COMMAND_IDS).toContain('workspai.openIncidentStudio');
    expect(PALETTE_CORE_COMMAND_IDS).toContain('workspai.doctor');

    for (const entry of PALETTE_CORE_COMMANDS) {
      expect(entry.command.startsWith('workspai.')).toBe(true);
      expect(entry.label.trim().length).toBeGreaterThan(0);
      expect(isPaletteCoreCommand(entry.command)).toBe(true);
    }
  });

  it('keeps package.json commandPalette limited to core-visible workspai commands', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      contributes?: {
        commands?: Array<{ command?: string }>;
        menus?: { commandPalette?: Array<{ command?: string; when?: string }> };
      };
    };
    const contributedWorkspaiCommands = (packageJson.contributes?.commands ?? [])
      .map((entry) => entry.command)
      .filter(
        (command): command is string =>
          typeof command === 'string' && command.startsWith('workspai.')
      );
    const paletteEntries = packageJson.contributes?.menus?.commandPalette ?? [];
    const paletteByCommand = new Map(
      paletteEntries
        .filter(
          (entry): entry is { command: string; when?: string } => typeof entry.command === 'string'
        )
        .map((entry) => [entry.command, entry])
    );

    expect(paletteEntries.length).toBe(contributedWorkspaiCommands.length);

    const visiblePaletteCommands = paletteEntries
      .filter((entry) => entry.when !== 'false')
      .map((entry) => entry.command)
      .filter((command): command is string => typeof command === 'string');

    expect(visiblePaletteCommands.sort()).toEqual([...PALETTE_CORE_COMMAND_IDS].sort());

    for (const command of contributedWorkspaiCommands) {
      expect(paletteByCommand.has(command), command).toBe(true);
      if (isPaletteCoreCommand(command)) {
        expect(paletteByCommand.get(command)?.when, command).not.toBe('false');
      } else {
        expect(paletteByCommand.get(command)?.when, command).toBe('false');
      }
    }
  });

  it('documents the palette sync script in package.json scripts', () => {
    const packageJson = JSON.parse(read('package.json')) as { scripts?: Record<string, string> };
    expect(packageJson.scripts?.['sync:palette-surface']).toBe(
      'node scripts/sync-palette-command-surface.mjs'
    );
    expect(packageJson.scripts?.['check:palette-surface']).toBe(
      'node scripts/sync-palette-command-surface.mjs --check'
    );
  });
});

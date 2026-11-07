import os from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const executeCommand = vi.hoisted(() => vi.fn());

vi.mock('vscode', () => {
  class Uri {
    readonly scheme = 'file';
    constructor(readonly fsPath: string) {}
    static file(value: string) {
      return new Uri(value);
    }
  }
  class Position {
    constructor(
      readonly line: number,
      readonly character: number
    ) {}
  }
  class Range {
    constructor(
      readonly start: Position,
      readonly end: Position
    ) {}
  }
  class Location {
    constructor(
      readonly uri: Uri,
      readonly range: Range
    ) {}
  }
  return { Uri, Position, Range, Location, commands: { executeCommand } };
});

import * as vscode from 'vscode';
import { inspectStudioCodeIntelligence } from '../core/studioCodeIntelligence.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});

beforeEach(() => executeCommand.mockReset());

async function sourceRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-code-intelligence-'));
  roots.push(root);
  await fs.ensureDir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'index.ts'), 'export const value = 1;\n');
  return root;
}

describe('Studio code intelligence', () => {
  it('projects definition locations inside the selected source boundary', async () => {
    const root = await sourceRoot();
    executeCommand.mockResolvedValueOnce([
      new vscode.Location(
        vscode.Uri.file(path.join(root, 'src', 'index.ts')),
        new vscode.Range(new vscode.Position(0, 7), new vscode.Position(0, 12))
      ),
      new vscode.Location(
        vscode.Uri.file('/outside/dependency.ts'),
        new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1))
      ),
    ]);

    await expect(
      inspectStudioCodeIntelligence({
        operation: 'definition',
        path: 'src/index.ts',
        line: 1,
        column: 8,
        workspacePath: root,
      })
    ).resolves.toMatchObject({
      operation: 'definition',
      source: { path: 'src/index.ts', line: 1, column: 8 },
      locations: [{ path: 'src/index.ts', line: 1, column: 8, endLine: 1, endColumn: 13 }],
      truncated: true,
    });
    expect(executeCommand).toHaveBeenCalledWith(
      'vscode.executeDefinitionProvider',
      expect.objectContaining({ fsPath: path.join(root, 'src', 'index.ts') }),
      expect.objectContaining({ line: 0, character: 7 })
    );
  });

  it('uses workspace symbol providers without requiring a source position', async () => {
    const root = await sourceRoot();
    executeCommand.mockResolvedValueOnce([
      {
        name: 'value',
        kind: 13,
        location: new vscode.Location(
          vscode.Uri.file(path.join(root, 'src', 'index.ts')),
          new vscode.Range(new vscode.Position(0, 13), new vscode.Position(0, 18))
        ),
      },
    ]);

    const result = await inspectStudioCodeIntelligence({
      operation: 'workspace-symbols',
      query: 'value',
      workspacePath: root,
    });
    expect(result.symbols).toEqual([
      expect.objectContaining({ name: 'value', path: 'src/index.ts', line: 1, column: 14 }),
    ]);
  });

  it('rejects generated, sensitive, missing, and out-of-scope paths before provider execution', async () => {
    const root = await sourceRoot();
    await expect(
      inspectStudioCodeIntelligence({
        operation: 'hover',
        path: 'node_modules/package/index.js',
        workspacePath: root,
      })
    ).rejects.toThrow('path is blocked');
    await expect(
      inspectStudioCodeIntelligence({
        operation: 'hover',
        path: '../outside.ts',
        workspacePath: root,
      })
    ).rejects.toThrow('unavailable');
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it('finds selected-project symbols after more than 100 sibling results', async () => {
    const root = await sourceRoot();
    const project = path.join(root, 'project');
    await fs.ensureDir(project);
    await fs.writeFile(path.join(project, 'value.ts'), 'export const value = 1;');
    const symbol = (file: string) => ({
      name: 'value',
      kind: 13,
      location: new vscode.Location(
        vscode.Uri.file(file),
        new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 5))
      ),
    });
    executeCommand.mockResolvedValueOnce([
      ...Array.from({ length: 150 }, () => symbol(path.join(root, 'src/index.ts'))),
      symbol(path.join(project, 'value.ts')),
    ]);
    expect(
      await inspectStudioCodeIntelligence({
        operation: 'workspace-symbols',
        query: 'value',
        workspacePath: root,
        projectPath: project,
      })
    ).toMatchObject({
      symbols: [{ name: 'value', path: 'value.ts' }],
      truncated: true,
    });
  });

  it('rejects an external source symlink and filters sensitive or escaped provider results', async () => {
    const root = await sourceRoot();
    const outside = await sourceRoot();
    await fs.symlink(path.join(outside, 'src/index.ts'), path.join(root, 'escaped.ts'));
    await fs.ensureDir(path.join(root, '.env'));
    await fs.writeFile(path.join(root, '.env/private.ts'), 'secret');
    await fs.symlink(path.join(root, '.env/private.ts'), path.join(root, 'alias.ts'));
    for (const file of ['escaped.ts', 'alias.ts']) {
      await expect(
        inspectStudioCodeIntelligence({ operation: 'hover', path: file, workspacePath: root })
      ).rejects.toThrow('unavailable');
    }
    expect(executeCommand).not.toHaveBeenCalled();
    const location = (file: string) =>
      new vscode.Location(
        vscode.Uri.file(path.join(root, file)),
        new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1))
      );
    executeCommand.mockResolvedValueOnce(
      ['escaped.ts', 'alias.ts', '.env/private.ts', 'src/index.ts'].map(location)
    );
    expect(
      await inspectStudioCodeIntelligence({
        operation: 'references',
        path: 'src/index.ts',
        workspacePath: root,
      })
    ).toMatchObject({
      locations: [{ path: 'src/index.ts' }],
      truncated: true,
    });
  });

  it('validates operations and source positions, and bounds a single oversized hover', async () => {
    const root = await sourceRoot();
    for (const position of [{ line: NaN }, { column: Infinity }, { line: 1.5 }, { column: 0 }]) {
      await expect(
        inspectStudioCodeIntelligence({
          operation: 'hover',
          path: 'src/index.ts',
          workspacePath: root,
          ...position,
        })
      ).rejects.toThrow('positive integers');
    }
    await expect(
      inspectStudioCodeIntelligence({
        operation: 'unknown' as 'hover',
        path: 'src/index.ts',
        workspacePath: root,
      })
    ).rejects.toThrow('operation is invalid');
    expect(executeCommand).not.toHaveBeenCalled();
    executeCommand.mockResolvedValueOnce([{ contents: ['x'.repeat(100_000)] }]);
    const result = await inspectStudioCodeIntelligence({
      operation: 'hover',
      path: 'src/index.ts',
      workspacePath: root,
    });
    expect(result.hover.join('').length).toBe(24_000);
    expect(result.truncated).toBe(true);
  });
});

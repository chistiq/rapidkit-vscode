import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';
import surface from '../../contracts/runtime-command-surface.v1.json';
import { buildStudioCliCatalog } from '../core/studioCliKnowledge.js';
import { studioWorkspaceImageTool } from '../core/studioWorkspaceImage.js';
import { studioAgentInstructionsTool } from '../core/studioAgentInstructions.js';
import {
  createStudioAgentWorkspaiToolRegistry,
  type StudioAgentWorkspaiToolHost,
} from '../core/studioAgentWorkspaiTools.js';
import { StudioAgentSession } from '../core/studioAgentSession.js';
import { ContractStudioAgentModelAdapter } from '../core/studioAgentModelProtocol.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});
const context = (workspacePath: string, projectPath?: string) => ({
  workspacePath,
  projectPath,
  sessionId: 's',
  requestId: 'r',
  toolCallId: 't',
  signal: new AbortController().signal,
});
const root = async () => {
  const value = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-parity-'));
  roots.push(value);
  return value;
};

describe('Assistant capability discovery parity', () => {
  it('rechecks Agent host-tool effects after catalog changes and requires exact approval', async () => {
    let readLike = true;
    const invokeHostTool = vi.fn(async () => ({ ok: true }));
    const registry = createStudioAgentWorkspaiToolRegistry({
      host: {
        listHostTools: () => ({ ok: true, output: { tools: [{ name: 'mcp.dynamic', readLike }] } }),
        invokeHostTool,
      } as unknown as StudioAgentWorkspaiToolHost,
      cardId: 'assistant:agent',
      assistantMode: 'agent',
    });
    const tool = registry.get('invoke-host-tool')!;
    const invocation = { name: 'mcp.dynamic', arguments: { target: 'current' } };
    const scope = context('/workspace');
    expect(await tool.authorize!(invocation, scope)).toEqual({ risk: 'read' });
    readLike = false;
    await expect(tool.execute(invocation, scope)).rejects.toThrow('exact approval');
    expect(invokeHostTool).not.toHaveBeenCalled();
    const authorization = await tool.authorize!(invocation, scope);
    expect(
      (
        await tool.execute(invocation, {
          ...scope,
          approval: {
            fingerprint: authorization.approval!.fingerprint,
            approvedBy: 'user',
            approvedAt: new Date().toISOString(),
          },
        })
      ).ok
    ).toBe(true);
    await expect(
      tool.execute(
        { ...invocation, arguments: { target: 'other' } },
        {
          ...scope,
          approval: {
            fingerprint: authorization.approval!.fingerprint,
            approvedBy: 'user',
            approvedAt: new Date().toISOString(),
          },
        }
      )
    ).rejects.toThrow('exact approval');
  });

  it('provides all CLI-authored command documentation through stable offline pages', () => {
    let offset = 0;
    const commands: string[] = [];
    for (;;) {
      const page = buildStudioCliCatalog({ offset, limit: 40 });
      expect(page.source).toBe('bundled-contract');
      expect(JSON.stringify(page).length).toBeLessThan(20_000);
      expect(page.detailsIncluded).toBe(false);
      commands.push(...page.commands.map((entry) => entry.command));
      if (page.nextOffset === null) break;
      offset = page.nextOffset;
    }
    expect(new Set(commands).size).toBe(commands.length);
    for (const entry of surface.commandDocumentation) expect(commands).toContain(entry.invocation);
    const action = buildStudioCliCatalog({
      query: 'workspace sync',
      includeDetails: true,
    }).commands.find((entry) => entry.command === 'workspace sync');
    expect(action?.usage).toContain('workspai workspace sync');
    expect(action?.options?.length).toBeGreaterThan(0);
    expect(action?.examples?.length).toBeGreaterThan(0);
  });

  it('keeps live installed options/version separate from the bundled reference', () => {
    const catalog = buildStudioCliCatalog({
      includeDetails: true,
      installed: {
        schemaVersion: 'rapidkit-command-capabilities-v1',
        version: '99.1.0',
        runtimeInventory: {
          schemaVersion: 'workspai-cli-runtime-command-inventory-v1',
          commands: [
            {
              path: ['future', 'inspect'],
              description: 'Future command',
              options: [{ flags: '--exact <name>' }],
              arguments: [{ name: 'file', required: true }],
            },
          ],
        },
        commands: { coreBacked: ['doctor'], projectScoped: ['test'] },
        workspace: { subcommands: ['graph'] },
      },
    });
    expect(catalog.version).toBe('99.1.0');
    expect(catalog.source).toBe('installed-runtime');
    expect(catalog.commands.find((entry) => entry.command === 'future inspect')?.options).toEqual([
      { flags: '--exact <name>' },
    ]);
    expect(catalog.commands.map((entry) => entry.command)).toEqual([
      'doctor',
      'future inspect',
      'test',
      'workspace graph',
    ]);
    expect(() => buildStudioCliCatalog({ installed: {} })).toThrow(
      'supported runtime command inventory'
    );
    expect(() => buildStudioCliCatalog({ offset: -1 })).toThrow('offset');
  });

  it('lets global research inspect the CLI contract without a host or workspace setup', async () => {
    const registry = createStudioAgentWorkspaiToolRegistry({
      host: {} as StudioAgentWorkspaiToolHost,
      cardId: 'assistant:research',
      assistantMode: 'ask',
      externalResearch: true,
    });
    expect(registry.get('view-workspace-image')).toBeUndefined();
    const bundled = await registry
      .get('inspect-cli-commands')!
      .execute({ query: 'create' }, context('/not-a-workspace'));
    expect(bundled.ok).toBe(true);
    expect(JSON.stringify(bundled.output)).toContain('create');
    expect(
      await registry
        .get('inspect-cli-commands')!
        .execute({ source: 'installed' }, context('/not-a-workspace'))
    ).toMatchObject({ ok: false, error: expect.stringContaining('source=bundled') });
  });

  it('discovers a tool after 150 others and loads just its schema', async () => {
    const tools = Array.from({ length: 150 }, (_, index) => ({
      name: `mcp.a${String(index).padStart(3, '0')}`,
      description: 'Other capability',
      tags: ['read'],
      readLike: true,
      inputSchema: { description: 'x'.repeat(4_000) },
    }));
    tools.push({
      name: 'mcp.zBrowser',
      description: 'Browser screenshot inspection',
      tags: ['read'],
      readLike: true,
      inputSchema: { description: 'Selected screenshot schema' },
    });
    const host = {
      listHostTools: () => ({ ok: true, output: { tools } }),
    } as unknown as StudioAgentWorkspaiToolHost;
    const registry = createStudioAgentWorkspaiToolRegistry({
      host,
      cardId: 'assistant:agent',
      assistantMode: 'agent',
    });
    const tool = registry.get('list-host-tools')!;
    const first = await tool.execute({}, context('/workspace'));
    expect(JSON.stringify(first)).not.toContain('x'.repeat(100));
    expect(first.output).toMatchObject({ totalTools: 151, nextOffset: 20, schemasIncluded: false });
    const last = await tool.execute({ offset: 150 }, context('/workspace'));
    expect(last.output).toMatchObject({ nextOffset: null, tools: [{ name: 'mcp.zBrowser' }] });
    const found = await tool.execute(
      { query: 'mcp.zBrowser', includeSchemas: true },
      context('/workspace')
    );
    expect(found.output).toMatchObject({
      count: 1,
      tools: [{ inputSchema: { description: 'Selected screenshot schema' } }],
    });
  });

  it('answers a CLI question from offline catalog evidence without web reads or Verify', async () => {
    const registry = createStudioAgentWorkspaiToolRegistry({
      host: {} as StudioAgentWorkspaiToolHost,
      cardId: 'assistant:research',
      assistantMode: 'ask',
      externalResearch: true,
    });
    let calls = 0;
    const adapter = new ContractStudioAgentModelAdapter(
      'What are Workspai workspace sync options?',
      async (prompt) => {
        if (++calls === 1) {
          expect(prompt).toContain('CLI knowledge');
          return {
            toolName: 'inspect-cli-commands',
            input: { query: 'workspace sync', includeDetails: true, limit: 10 },
          };
        }
        expect(prompt).toContain('--project-grounding');
        return {
          type: 'text',
          text: 'The bundled CLI contract documents workspai workspace sync --project-grounding <mode>, --workspace and --json. Check installed help for your version.',
        };
      }
    );
    const result = await new StudioAgentSession(
      {
        workspacePath: '/not-a-workspace',
        cardId: 'assistant:research',
        assistantMode: 'ask',
        requiresVerifiedCompletion: false,
        permissionLevel: 'default',
        workspaceTrusted: true,
      },
      adapter,
      registry,
      { save: vi.fn(async () => {}) }
    ).run('What are workspace sync options?');
    expect(result.status).toBe('completed');
    expect(result.events.filter((event) => event.type === 'tool.completed')).toHaveLength(1);
    expect(result.events.some((event) => event.type === 'verify.completed')).toBe(false);
  });
});

describe('Repository instruction context', () => {
  it('reads root and nested instructions for a target file without unrelated sibling rules', async () => {
    const workspace = await root();
    await fs.outputFile(path.join(workspace, 'AGENTS.md'), 'Root conventions');
    await fs.outputFile(
      path.join(workspace, '.github/copilot-instructions.md'),
      'Repository guidance'
    );
    await fs.outputFile(path.join(workspace, 'src/AGENTS.md'), 'Source conventions');
    await fs.outputFile(path.join(workspace, 'other/AGENTS.md'), 'Unrelated conventions');
    const result = await studioAgentInstructionsTool.execute(
      { path: 'src/new/file.ts' },
      context(workspace)
    );
    const text = JSON.stringify(result.output);
    expect(text).toContain('Root conventions');
    expect(text).toContain('Repository guidance');
    expect(text).toContain('Source conventions');
    expect(text).not.toContain('Unrelated conventions');
  });

  it('includes instructions in a directory target and pages long UTF-8 rules without repeating a prefix', async () => {
    const workspace = await root();
    await fs.outputFile(path.join(workspace, 'AGENTS.md'), 'Root rules');
    const full = 'a'.repeat(3999) + String.fromCodePoint(0x1f680) + ' remaining nested rules';
    await fs.outputFile(path.join(workspace, 'app/AGENTS.md'), full);
    const first = await studioAgentInstructionsTool.execute({ path: 'app' }, context(workspace));
    const output = first.output as {
      documents: Array<{ content: string; locator: string }>;
      nextReads: Array<{ input: Record<string, unknown> }>;
    };
    expect(output.documents).toHaveLength(2);
    const nested = output.documents.find(
      (document) => document.locator === 'workspace:app/AGENTS.md'
    )!;
    expect(nested.content).toBe('a'.repeat(3999));
    const next = await studioAgentInstructionsTool.execute(
      output.nextReads[0].input,
      context(workspace)
    );
    const rest = next.output as { documents: Array<{ content: string }>; nextReads: unknown[] };
    expect(nested.content + rest.documents[0].content).toBe(full);
    expect(rest.nextReads).toEqual([]);
    await expect(
      studioAgentInstructionsTool.execute(
        { path: 'app', document: 'workspace:other/AGENTS.md', offset: 0 },
        context(workspace)
      )
    ).rejects.toThrow('not in the applicable instruction chain');
  });

  it('handles absent instructions and marks bounded reads while excluding outside symlinks', async () => {
    const workspace = await root();
    const outside = await root();
    expect(
      (await studioAgentInstructionsTool.execute({}, context(workspace))).output
    ).toMatchObject({ documents: [] });
    await fs.writeFile(path.join(workspace, 'AGENTS.md'), 'a'.repeat(8_000));
    await fs.writeFile(path.join(outside, 'instructions.md'), 'Outside instructions');
    await fs.ensureDir(path.join(workspace, 'src'));
    await fs.symlink(path.join(outside, 'instructions.md'), path.join(workspace, 'src/AGENTS.md'));
    const result = await studioAgentInstructionsTool.execute(
      { path: 'src/file.ts' },
      context(workspace)
    );
    expect(result.output).toMatchObject({
      documents: [{ truncated: true }],
      warnings: [expect.stringContaining('symlink')],
    });
    expect(JSON.stringify(result.output)).not.toContain('Outside instructions');
  });
});

describe('Workspace image observations', () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X8N8AAAAASUVORK5CYII=',
    'base64'
  );
  it('returns screenshot bytes to the model including build output', async () => {
    const workspace = await root();
    await fs.outputFile(path.join(workspace, 'dist/screenshot.png'), png);
    const result = await studioWorkspaceImageTool.execute(
      { path: 'dist/screenshot.png' },
      context(workspace)
    );
    expect(result).toMatchObject({
      ok: true,
      output: { mimeType: 'image/png', bytes: png.length },
      images: [{ mimeType: 'image/png', base64: png.toString('base64') }],
    });
  });
  it('honors imported project scope while rejecting a symlink outside both roots', async () => {
    const workspace = await root();
    const project = await root();
    const outside = await root();
    await fs.writeFile(path.join(project, 'screen.png'), png);
    expect(
      (await studioWorkspaceImageTool.execute({ path: 'screen.png' }, context(workspace, project)))
        .ok
    ).toBe(true);
    await fs.writeFile(path.join(outside, 'private.png'), png);
    await fs.symlink(path.join(outside, 'private.png'), path.join(workspace, 'escape.png'));
    await expect(
      studioWorkspaceImageTool.execute({ path: 'escape.png' }, context(workspace, project))
    ).rejects.toThrow('outside');
  });
  it('rejects text renamed to an image and oversized files before reading their bodies', async () => {
    const workspace = await root();
    await fs.writeFile(path.join(workspace, 'fake.png'), 'not an image');
    await expect(
      studioWorkspaceImageTool.execute({ path: 'fake.png' }, context(workspace))
    ).rejects.toThrow('supported');
    await fs.writeFile(path.join(workspace, 'large.png'), Buffer.alloc(5 * 1024 * 1024 + 1));
    await expect(
      studioWorkspaceImageTool.execute({ path: 'large.png' }, context(workspace))
    ).rejects.toThrow('5 MiB');
  });
});

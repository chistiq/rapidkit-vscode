import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
const { next } = vi.hoisted(() => ({ next: vi.fn() }));
vi.mock('vscode', () => ({ workspace: { isTrusted: true } }));
vi.mock('../core/configuredStudioAgentModel.js', () => ({
  createConfiguredStudioAgentModel: () => ({ next }),
}));
vi.mock('../core/studioAgentSessionStore.js', () => ({
  VSCodeStudioAgentSessionStore: class {
    async save() {}
  },
}));
vi.mock('../core/studioAssistantIdeCapabilities.js', () => ({
  studioAssistantIdeCapabilities: () => ({ register() {} }),
}));
import { registerStudioResearchCapability } from '../core/studioResearchCapabilities.js';
import {
  createStudioAgentWorkspaiToolRegistry,
  type StudioAgentWorkspaiToolHost,
} from '../core/studioAgentWorkspaiTools.js';

let root: string;
afterEach(async () => {
  if (root) await fs.remove(root);
  next.mockReset();
});
describe('Shared child capability registration', () => {
  it('uses dynamic evidence in the actual child registry and never acquires write tools in Ask', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'research-registry-'));
    await fs.outputJSON(path.join(root, '.workspai/workspace.json'), {
      workspace_name: 'research',
    });
    await fs.outputJSON(path.join(root, '.workspai/reports/INDEX.json'), {
      destination: 'fresh child evidence',
    });
    const legacyInspect = vi.fn(async () => ({
      ok: false,
      error: 'Legacy allowlist does not contain this report',
    }));
    const host = { inspect: legacyInspect } as unknown as StudioAgentWorkspaiToolHost;
    const registry = createStudioAgentWorkspaiToolRegistry({
      host,
      assistantMode: 'ask',
      cardId: 'assistant:ask',
      executionAuthority: 'workspace',
    });
    registerStudioResearchCapability({
      registry,
      host,
      context: {
        globalStorageUri: { fsPath: path.join(root, 'storage') },
      } as vscode.ExtensionContext,
    });
    expect(registry.get('delegate-task')).toBeUndefined();
    next
      .mockImplementationOnce(async (context) => {
        expect(context.session.executionAuthority).toBe('workspace');
        expect(context.tools.some((tool) => tool.name === 'apply-workspace-patch')).toBe(false);
        expect(context.tools.some((tool) => tool.name.startsWith('delegate-'))).toBe(false);
        return {
          type: 'tool',
          toolName: 'inspect-evidence',
          input: { paths: ['.workspai/reports/INDEX.json'] },
          reason: 'Read current evidence',
        };
      })
      .mockImplementationOnce(async (context) => {
        expect(JSON.stringify(context.latestObservation)).toContain('fresh child evidence');
        return { type: 'complete', summary: 'Current report confirmed.' };
      });
    const result = await registry.get('delegate-research')!.execute(
      { objectives: ['Read the current report'] },
      {
        sessionId: 'parent',
        requestId: 'request',
        toolCallId: 'child',
        workspacePath: root,
        signal: new AbortController().signal,
      }
    );
    expect(result).toMatchObject({
      ok: true,
      output: { results: [{ answer: 'Current report confirmed.' }] },
    });
    expect(legacyInspect).not.toHaveBeenCalled();
  });
  it.each(['agent', 'goal', 'plan', 'ask'] as const)(
    'registers execution delegation only for mutable %s capabilities',
    (assistantMode) => {
      const host = {} as StudioAgentWorkspaiToolHost;
      const registry = createStudioAgentWorkspaiToolRegistry({
        host,
        assistantMode,
        cardId: `assistant:${assistantMode}`,
      });
      registerStudioResearchCapability({
        registry,
        host,
        context: { globalStorageUri: { fsPath: '/storage' } } as vscode.ExtensionContext,
      });
      expect(Boolean(registry.get('delegate-task'))).toBe(
        assistantMode === 'agent' || assistantMode === 'goal'
      );
    }
  );
});

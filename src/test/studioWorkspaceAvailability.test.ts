import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
const findFiles = vi.hoisted(() => vi.fn(async () => []));
vi.mock('vscode', () => ({ workspace: { findFiles }, RelativePattern: class {} }));
import {
  inspectStudioWorkspaceAvailability,
  resolveStudioCliInspectionCwd,
} from '../core/studioWorkspaceAvailability.js';
import { inspectStudioWorkspaceInventory } from '../core/studioWorkspaceInventory.js';
import { discoverStudioWorkspaceFiles } from '../core/studioWorkspaceInspection.js';
import { studioAgentInstructionsTool } from '../core/studioAgentInstructions.js';
import { captureStudioWorkspaceSourceSnapshot } from '../core/studioWorkspaceSourceSnapshot.js';
import {
  createStudioAgentWorkspaiToolRegistry,
  type StudioAgentWorkspaiToolHost,
} from '../core/studioAgentWorkspaiTools.js';
import { StudioAgentToolRegistry } from '../core/studioAgentToolRegistry.js';
import { StudioAgentSession } from '../core/studioAgentSession.js';
import { createStudioNativeWorkspaceCapabilities } from '../core/studioNativeWorkspace.js';
import {
  ContractStudioAgentModelAdapter,
  STUDIO_AGENT_COMPLETE_TOOL_NAME,
} from '../core/studioAgentModelProtocol.js';
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-scope-'));
  roots.push(root);
  return { root, missing: path.join(root, 'removed-workspace') };
}
describe('Stale workspace scope recovery', () => {
  it('rejects a command in a missing directory before requesting pointless execution approval', async () => {
    const { missing } = await fixture();
    const capabilities = createStudioNativeWorkspaceCapabilities({
      workspacePath: missing,
      inspectedSource: new Map(),
      diagnostics: async () => ({ ok: true, output: { diagnostics: [] } }),
      inspectChanges: async () => ({ ok: true }),
    });
    const registry = createStudioAgentWorkspaiToolRegistry({
      host: capabilities as StudioAgentWorkspaiToolHost,
      cardId: 'assistant:agent',
      assistantMode: 'agent',
      executionAuthority: 'workspace',
    });
    const approval = vi.fn();
    let turn = 0;
    const state = await new StudioAgentSession(
      {
        workspacePath: missing,
        cardId: 'assistant:agent',
        assistantMode: 'agent',
        executionAuthority: 'workspace',
        workspaceTrusted: true,
        requiresVerifiedCompletion: false,
        requestToolApproval: approval,
      },
      {
        next: async () =>
          turn++ === 0
            ? {
                type: 'tool',
                toolName: 'run-workspace-command',
                input: { executable: 'pwd', args: [], purpose: 'inspect' },
                reason: 'Inspect directory',
              }
            : {
                type: 'complete',
                summary:
                  'The selected directory is unavailable; independent creation remains available.',
              },
      },
      registry,
      { save: async () => {} }
    ).run('Check the selected directory');
    expect(approval).not.toHaveBeenCalled();
    expect(
      state.events.some(
        (event) =>
          event.type === 'tool.failed' &&
          event.data.authorizationRejected === true &&
          String(event.data.error).includes('not an empty workspace')
      )
    ).toBe(true);
    expect(state.events.some((event) => event.type === 'tool.started')).toBe(false);
    expect(await fs.pathExists(missing)).toBe(false);
  });
  it('distinguishes a missing scope from an empty folder across discovery, instructions, inventory and checkpoints', async () => {
    const { root, missing } = await fixture();
    expect(await inspectStudioWorkspaceAvailability(missing)).toMatchObject({ status: 'missing' });
    expect(await inspectStudioWorkspaceAvailability(root)).toMatchObject({ status: 'available' });
    const absent = await inspectStudioWorkspaceInventory(missing);
    expect(absent).toMatchObject({
      availability: { status: 'missing' },
      completeness: 'unavailable',
      management: 'unknown',
    });
    expect('projectCount' in absent).toBe(false);
    expect(await inspectStudioWorkspaceInventory(root)).toMatchObject({
      projectCount: 0,
      availability: { status: 'available' },
      management: 'unmanaged',
    });
    findFiles.mockClear();
    await expect(discoverStudioWorkspaceFiles({ workspacePath: missing })).rejects.toThrow(
      'not an empty workspace'
    );
    expect(findFiles).not.toHaveBeenCalled();
    await expect(discoverStudioWorkspaceFiles({ workspacePath: root })).resolves.toEqual([]);
    await expect(
      studioAgentInstructionsTool.execute(
        {},
        {
          workspacePath: missing,
          sessionId: 's',
          requestId: 'r',
          toolCallId: 't',
          signal: new AbortController().signal,
        }
      )
    ).rejects.toThrow('not an empty workspace');
    expect(await captureStudioWorkspaceSourceSnapshot({ workspacePath: missing })).toBeUndefined();
    expect(await captureStudioWorkspaceSourceSnapshot({ workspacePath: root })).toMatchObject({
      files: {},
    });
    expect(await fs.pathExists(missing)).toBe(false);
  });
  it('does not report a file or inaccessible root as an empty project', async () => {
    const { root } = await fixture();
    const file = path.join(root, 'file');
    await fs.writeFile(file, 'text');
    expect(await inspectStudioWorkspaceAvailability(file)).toMatchObject({
      status: 'not-directory',
    });
    vi.spyOn(fs, 'access').mockRejectedValueOnce(
      Object.assign(new Error('denied'), { code: 'EACCES' })
    );
    expect(await inspectStudioWorkspaceAvailability(root)).toMatchObject({
      status: 'inaccessible',
    });
  });
  it('keeps architecture knowledge and CLI inspection available without the selected directory', async () => {
    const { root, missing } = await fixture();
    expect(await resolveStudioCliInspectionCwd([missing, root])).toBe(root);
    const registry = createStudioAgentWorkspaiToolRegistry({
      host: {} as StudioAgentWorkspaiToolHost,
      cardId: 'assistant:agent',
      assistantMode: 'agent',
      executionAuthority: 'workspace',
    });
    const context = {
      workspacePath: missing,
      sessionId: 's',
      requestId: 'r',
      toolCallId: 't',
      signal: new AbortController().signal,
    };
    const inventory = await registry.get('inspect-workspace')!.execute({}, context);
    expect(inventory).toMatchObject({ ok: false, output: { availability: { status: 'missing' } } });
    const architecture = await registry
      .get('inspect-cli-commands')!
      .execute({ topic: 'architecture', query: 'backend' }, context);
    expect(architecture).toMatchObject({ ok: true, output: { source: 'bundled-create-contract' } });
    const text = JSON.stringify(architecture.output);
    expect(text).toContain('nestjs.standard');
    expect(text).toContain('workspai adopt <path>');
    expect(text).not.toContain('frontend.nextjs');
    expect(await fs.pathExists(missing)).toBe(false);
  });
  it('lets independent tools run after an owned destination was removed while preserving validation for scoped tools', async () => {
    const { missing } = await fixture();
    const registry = createStudioAgentWorkspaiToolRegistry({
      host: {} as StudioAgentWorkspaiToolHost,
      cardId: 'assistant:agent',
      assistantMode: 'agent',
      executionAuthority: 'workspace',
    });
    const selected: string[] = [];
    registry.register({
      name: 'select-destination',
      title: 'Select',
      description: '',
      inputSchema: {},
      scopeIndependent: true,
      risk: 'read',
      activity: 'inspect',
      execute: async () => {
        selected.push('selected');
        return { ok: true };
      },
    });
    registry.register({
      name: 'read-scoped-file',
      title: 'Read',
      description: '',
      inputSchema: {},
      risk: 'read',
      activity: 'inspect',
      execute: async () => {
        selected.push('read');
        return { ok: true };
      },
    });
    const validate = vi.fn(async () => {
      throw new Error('Destination was removed.');
    });
    let turn = 0;
    const actions = [
      { type: 'tool' as const, toolName: 'read-scoped-file', input: {}, reason: 'Inspect scope' },
      {
        type: 'tool' as const,
        toolName: 'select-destination',
        input: {},
        reason: 'Recover destination',
      },
      { type: 'complete' as const, summary: 'Independent destination inspection succeeded.' },
    ];
    const state = await new StudioAgentSession(
      {
        workspacePath: missing,
        cardId: 'assistant:agent',
        executionAuthority: 'workspace',
        assistantMode: 'agent',
        workspaceTrusted: true,
        requiresVerifiedCompletion: false,
        executionTarget: {
          ref: 'workspace-11111111-1111-1111-1111-111111111111',
          workspacePath: missing,
          name: 'removed',
        },
        validateExecutionTarget: validate,
      },
      { next: async () => actions[turn++] ?? actions[2] },
      registry,
      { save: async () => {} }
    ).run('Inspect a usable destination');
    expect(selected).toEqual(['selected']);
    expect(validate).toHaveBeenCalledOnce();
    expect(
      state.events.some(
        (event) => event.type === 'tool.failed' && event.data.error === 'Destination was removed.'
      )
    ).toBe(true);
  });
  it('does not run a declined adoption and lets the requested work continue', async () => {
    const { root } = await fixture();
    const registry = new StudioAgentToolRegistry();
    const adopt = vi.fn(async () => ({ ok: true, changed: true }));
    registry.register({
      name: 'adopt-existing-project',
      title: 'Adopt',
      description: '',
      inputSchema: {},
      activity: 'change',
      risk: 'invasive',
      authorize: () => ({
        risk: 'invasive',
        approval: {
          fingerprint: 'exact-adopt-plan',
          title: 'Adopt this existing project?',
          summary: 'Register the existing project with Workspai.',
          scope: 'project',
          reasons: ['Explicit adoption consent'],
          execution: 'once',
        },
      }),
      execute: adopt,
    });
    registry.register({
      name: 'do-requested-work',
      title: 'Requested work',
      description: '',
      inputSchema: {},
      activity: 'change',
      risk: 'safe-write',
      execute: async () => {
        await fs.writeFile(path.join(root, 'requested.txt'), 'requested work completed');
        return { ok: true, changed: true };
      },
    });
    registry.register({
      name: 'inspect-workspace-changes',
      title: 'Review',
      description: '',
      inputSchema: {},
      activity: 'inspect',
      risk: 'read',
      execute: async () => ({
        ok:
          (await fs.readFile(path.join(root, 'requested.txt'), 'utf8')) ===
          'requested work completed',
      }),
    });
    registry.register({
      name: 'verify-blocker',
      title: 'Verify',
      description: '',
      inputSchema: {},
      activity: 'verify',
      risk: 'read',
      execute: async () => ({
        ok: true,
        cardBlocking: false,
        output: { authority: 'workspace-evidence' },
      }),
    });
    const approval = vi.fn(async () => ({ approved: false, fingerprint: 'exact-adopt-plan' }));
    const actions = [
      {
        type: 'tool' as const,
        toolName: 'adopt-existing-project',
        input: {},
        reason: 'Offer Workspai adoption',
      },
      {
        type: 'tool' as const,
        toolName: 'do-requested-work',
        input: {},
        reason: 'Honor the decision and continue',
      },
      {
        type: 'tool' as const,
        toolName: 'inspect-workspace-changes',
        input: {},
        reason: 'Review the requested result',
      },
      {
        type: 'tool' as const,
        toolName: 'verify-blocker',
        input: {},
        reason: 'Verify the requested result',
      },
      {
        type: 'complete' as const,
        summary: 'Requested work completed without adopting the project.',
      },
    ];
    let turn = 0;
    const state = await new StudioAgentSession(
      {
        workspacePath: root,
        cardId: 'assistant:agent',
        executionAuthority: 'workspace',
        assistantMode: 'agent',
        workspaceTrusted: true,
        permissionLevel: 'autopilot',
        requiresVerifiedCompletion: false,
        requestToolApproval: approval,
      },
      { next: async () => actions[turn++] ?? actions[4] },
      registry,
      { save: async () => {} }
    ).run('Work on my existing project');
    expect(approval).toHaveBeenCalledOnce();
    expect(adopt).not.toHaveBeenCalled();
    expect(await fs.readFile(path.join(root, 'requested.txt'), 'utf8')).toBe(
      'requested work completed'
    );
    expect(state.status).toBe('completed');
  });
  it('instructs the actual model adapter to use Workspai defaults, preserve opt-out and require adoption consent', async () => {
    const { root } = await fixture();
    let prompt = '';
    const adapter = new ContractStudioAgentModelAdapter(
      'Build a shop with backend and frontend',
      async (text) => {
        prompt = text;
        return {
          toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME,
          input: { summary: 'Context reviewed.' },
        };
      }
    );
    await adapter.next({
      session: {
        schemaVersion: 'workspai.studio-agent-session.v1',
        id: 's',
        workspacePath: root,
        cardId: 'assistant:agent',
        executionAuthority: 'workspace',
        assistantMode: 'agent',
        status: 'running',
        sequence: 0,
        events: [],
        createdAt: '',
        updatedAt: '',
      },
      tools: [],
      steering: [],
    });
    for (const expected of [
      'Workspai architecture by default',
      'not a fixed sample stack',
      'Adoption needs user acceptance',
      'undecided or declined',
      'independent architecture or no Workspai',
      'not a completed shop',
    ])
      expect(prompt).toContain(expected);
  });
});

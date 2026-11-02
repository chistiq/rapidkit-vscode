import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectAssistantUserPaths,
  redactAssistantRequestForConsumer,
} from '../core/consumerPathRedaction.js';
import { routeAssistantIntent } from '../core/assistantIntentRouter.js';
import { StudioAgentSession } from '../core/studioAgentSession.js';
import { StudioAgentToolRegistry } from '../core/studioAgentToolRegistry.js';
import {
  ContractStudioAgentModelAdapter,
  STUDIO_AGENT_REPORT_TOOL_NAME,
} from '../core/studioAgentModelProtocol.js';
import { studioWorkspaceCreationTool } from '../core/studioWorkspaceCreation.js';
import { resolveStudioScopePath } from '../core/studioScopePath.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});

describe('Explicit user destinations across routing and execution', () => {
  it('preserves only supplied paths, including quoted spaces, while continuing to redact unrelated host paths', () => {
    const request =
      'Create a workspace under "/opt/fixtures/My Systems" and adopt "../existing app"; reference https://example.test/help.';
    const paths = collectAssistantUserPaths(request);
    expect(paths).toEqual(['/opt/fixtures/My Systems', '../existing app']);
    expect(
      redactAssistantRequestForConsumer(
        `${request}\nHost cache: /opt/fixtures/private-cache/state.json`,
        paths
      )
    ).toBe(`${request}\nHost cache: $LOCAL_PATH`);
    const windows = String.raw`Use "C:\Work Dir\Systems" as the destination`;
    expect(redactAssistantRequestForConsumer(windows, collectAssistantUserPaths(windows))).toBe(
      windows
    );
    expect(redactAssistantRequestForConsumer('Host /opt/fixtures/private-cache')).toBe(
      'Host $LOCAL_PATH'
    );
  });
  it('keeps the user path through classification without accepting a model-invented path as user-provided context', async () => {
    const task = 'Create a workspace under "/opt/fixtures/My Systems"';
    const route = await routeAssistantIntent({
      task,
      selectedMode: 'agent',
      hasProjectScope: false,
      complete: async ({ prompt }) => {
        expect(prompt).toContain('/opt/fixtures/My Systems');
        return {
          type: 'tool',
          toolName: 'route-workspai-request',
          input: {
            intent: 'engineering-task',
            confidence: 'high',
            normalizedRequest: `${task}; inspect /opt/fixtures/unrequested-host-data`,
            userResponse: '',
            reason: 'Create the requested system',
            workspaceIntent: 'create-new',
          },
        };
      },
    });
    expect(route.normalizedRequest).toContain('/opt/fixtures/My Systems');
    expect(route.normalizedRequest).not.toContain('/opt/fixtures/unrequested-host-data');
  });
  it('carries an explicit custom parent through the real model adapter, exact approval, target binding and durable state', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-user-destination-'));
    roots.push(root);
    const selected = path.join(root, 'selected');
    await fs.ensureDir(selected);
    const outputParent = path.join(root, 'Custom Systems');
    const request = `Create workspace demo under "${outputParent}"`;
    const registry = new StudioAgentToolRegistry();
    const calls: Array<{ args: string[]; cwd: string }> = [];
    registry.register(
      studioWorkspaceCreationTool({
        managedHome: path.join(root, 'managed'),
        run: async (input) => {
          calls.push(input);
          await fs.outputJSON(
            path.join(
              input.args[input.args.indexOf('--output') + 1],
              input.args[2],
              '.workspai/workspace.json'
            ),
            { workspace_name: input.args[2] }
          );
          return { exitCode: 0 };
        },
      })
    );
    let turn = 0;
    const adapter = new ContractStudioAgentModelAdapter(
      `${request}\nInternal host cache: /opt/fixtures/host-private-cache`,
      async (prompt) => {
        expect(prompt).toContain(outputParent);
        expect(prompt).not.toContain('/opt/fixtures/host-private-cache');
        return turn++ === 0
          ? { toolName: 'create-workspace', input: { name: 'demo', projects: [], outputParent } }
          : {
              toolName: STUDIO_AGENT_REPORT_TOOL_NAME,
              input: {
                summary:
                  'The requested workspace was created; no application was requested or verified.',
                nextSteps: ['Inspect the workspace foundation'],
              },
            };
      }
    );
    const approvals: string[] = [];
    const state = await new StudioAgentSession(
      {
        workspacePath: selected,
        cardId: 'assistant:agent',
        assistantMode: 'agent',
        executionAuthority: 'workspace',
        workspaceTrusted: true,
        permissionLevel: 'autopilot',
        requestToolApproval: async (input) => {
          approvals.push(input.cwd!);
          return { approved: true, fingerprint: input.fingerprint };
        },
      },
      adapter,
      registry,
      { save: async () => {} }
    ).run(`${request}\nInternal host cache: /opt/fixtures/host-private-cache`, {
      userRequest: request,
    });
    expect(approvals).toEqual([path.join(outputParent, 'demo')]);
    expect(calls[0].cwd).toBe(outputParent);
    expect(state.executionTarget?.workspacePath).toBe(path.join(outputParent, 'demo'));
    expect(JSON.parse(JSON.stringify(state)).userRequestedPaths).toContain(outputParent);
    expect(state.userRequestedPaths).not.toContain('/opt/fixtures/host-private-cache');
    expect(await fs.readdir(selected)).toEqual([]);
    const continued = new ContractStudioAgentModelAdapter(
      'Continue at the user-selected location',
      async (_prompt, input) => {
        expect(JSON.stringify(input.messages)).toContain(outputParent);
        return {
          toolName: STUDIO_AGENT_REPORT_TOOL_NAME,
          input: { summary: 'Pending inspection', nextSteps: ['Inspect the chosen destination'] },
        };
      },
      state,
      [{ role: 'user', content: request }]
    );
    await continued.next({ session: state, tools: [], steering: [] });
  });
  it('resolves a user-provided home-relative destination without asking a shell to expand it', () => {
    expect(resolveStudioScopePath({ workspacePath: '/opt/fixtures/selected' }, '~/systems')).toBe(
      path.join(os.homedir(), 'systems')
    );
  });
});

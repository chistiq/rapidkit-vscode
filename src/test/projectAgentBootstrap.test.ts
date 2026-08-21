import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  window: { showErrorMessage: vi.fn() },
  commands: { executeCommand: vi.fn() },
}));

import {
  bootstrapProjectAgent,
  buildProjectAgentBootstrapPromptSection,
  requireReadyProjectAgentBootstrap,
  resetProjectAgentBootstrapCache,
  type AgentBootstrapReceipt,
} from '../core/projectAgentBootstrap.js';

const tempRoots: string[] = [];

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'workspai-extension-agent-entry-'));
  tempRoots.push(root);
  return root;
}

function receipt(status: AgentBootstrapReceipt['status'] = 'ready'): AgentBootstrapReceipt {
  return {
    schemaVersion: 'workspai.agent-bootstrap-receipt.v1',
    generatedAt: '2026-08-17T12:00:00.000Z',
    receiptId: 'a'.repeat(64),
    status,
    requestedAgent: 'generic',
    resolvedHost: 'generic',
    project: { name: 'api', relativePath: 'external/api', runtime: 'node' },
    workspace: {
      name: 'workspai',
      relationship: 'adopted',
      resolved: true,
      identityIsFilesystemPath: false,
      resolverCommand: 'workspai project workspace status --json',
      portableUriScheme: 'workspace:',
      resolvedPathPolicy: 'runtime-private-never-persist',
    },
    entry: {
      artifact: '.workspai/agent-entry.v1.json',
      schemaVersion: 'workspai.agent-entry.v1',
      hostStatus: status,
      entryFiles: ['AGENTS.md'],
    },
    canonicalEvidence: {
      projectContext: '.workspai/reports/project-context-agent.json',
      workspaceIndex: 'workspace:.workspai/reports/INDEX.json',
      workspaceContext: 'workspace:.workspai/reports/workspace-context-agent.json',
      workspaceModel: 'workspace:.workspai/reports/workspace-model.json',
      knowledgeGraph: 'workspace:.workspai/reports/workspace-knowledge-graph.json',
      modelFreshness: 'fresh',
      graphFreshness: 'fresh',
      graphMatchesModel: true,
      liveInputsValidated: true,
      blockerCount: 0,
    },
    activeGoal: { present: false, appliesToProject: false, status: 'none' },
    requiredReadOrder: [
      '.workspai/agent-entry.v1.json',
      '.workspai/PROJECT-GROUNDING.md',
      '.workspai/reports/project-context-agent.json',
      'workspace:.workspai/reports/INDEX.json',
      'workspace:.workspai/reports/workspace-context-agent.json',
      'workspace:.workspai/reports/workspace-model.json',
    ],
    claims: {
      architecture: status === 'ready' ? 'allowed-with-citations' : 'prohibited',
      sourceInspection: 'bounded-and-targeted',
      sourceMutation: 'governed-cli-transaction-only',
      verification: 'cli-evidence-only',
    },
    checks: Array.from({ length: 6 }, (_, index) => ({
      id: `check-${index + 1}`,
      status: 'passed' as const,
      message: 'Canonical evidence validated.',
    })),
    nextActions: ['Read the bounded project lens.'],
    integrity: {
      algorithm: 'sha256',
      manifestHash: 'c'.repeat(64),
      projectContextHash: 'd'.repeat(64),
      portable: true,
      absolutePathsEmitted: false,
      payloadHash: 'b'.repeat(64),
    },
  };
}

function boundedReceipt(status: AgentBootstrapReceipt['status'] = 'ready'): AgentBootstrapReceipt {
  const value = receipt(status);
  delete value.canonicalEvidence.workspaceModel;
  delete value.canonicalEvidence.knowledgeGraph;
  value.canonicalEvidence.workspaceSkillsIndex =
    'workspace:.workspai/reports/workspace-skills-index.json';
  value.canonicalEvidence.boundedGraphSearch =
    'command:workspai workspace graph search <task-query> --scope project:<project> --limit 12 --json';
  value.requiredReadOrder = [
    '.workspai/agent-entry.v1.json',
    '.workspai/PROJECT-GROUNDING.md',
    '.workspai/reports/project-context-agent.json',
    'workspace:.workspai/reports/INDEX.json',
    'workspace:.workspai/reports/workspace-context-agent.json',
    'workspace:.workspai/reports/workspace-skills-index.json',
    'command:workspai workspace graph search <task-query> --scope project:api --limit 12 --json',
  ];
  return value;
}

function runner(value: unknown, exitCode = 0) {
  return vi.fn(async () => ({
    exitCode,
    events: [],
    lastLifecycleEvent: null,
    result: value,
    stdout: JSON.stringify(value),
    stderr: '',
    failed: exitCode !== 0,
  }));
}

afterEach(async () => {
  resetProjectAgentBootstrapCache();
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('project agent bootstrap', () => {
  it('leaves a raw project outside a canonical workspace available', async () => {
    const projectPath = await fixture();
    const run = runner(receipt());

    await expect(bootstrapProjectAgent({ projectPath, run })).resolves.toEqual({
      status: 'not-applicable',
      adopted: false,
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('fail-closes a workspace-linked project with no portable entry contract', async () => {
    const projectPath = await fixture();
    const workspacePath = path.join(projectPath, '..', 'workspace');
    await mkdir(path.join(workspacePath, '.workspai'), { recursive: true });
    await writeFile(path.join(workspacePath, '.workspai', 'workspace.contract.json'), '{}\n');

    const result = await bootstrapProjectAgent({
      projectPath,
      workspacePath,
      run: runner(receipt()),
    });

    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('no portable agent entry contract');
  });

  it('runs the CLI bootstrap from the project boundary and accepts a portable receipt', async () => {
    const projectPath = await fixture();
    await mkdir(path.join(projectPath, '.workspai'), { recursive: true });
    await writeFile(path.join(projectPath, '.workspai', 'agent-entry.v1.json'), '{}\n');
    const run = runner(receipt());

    const result = await bootstrapProjectAgent({ projectPath, run });

    expect(result.status).toBe('ready');
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        command: ['agent', 'bootstrap', '--for-agent', 'generic', '--json'],
        cwd: projectPath,
      })
    );
    expect(buildProjectAgentBootstrapPromptSection(result)).toContain(
      'Canonical workspace identity: workspai (resolved privately at runtime)'
    );
    expect(() => requireReadyProjectAgentBootstrap(result)).not.toThrow();
  });

  it('accepts the CLI 0.62 bounded Skill and Graph bootstrap route', async () => {
    const projectPath = await fixture();
    await mkdir(path.join(projectPath, '.workspai'), { recursive: true });
    await writeFile(path.join(projectPath, '.workspai', 'agent-entry.v1.json'), '{}\n');

    const result = await bootstrapProjectAgent({ projectPath, run: runner(boundedReceipt()) });

    expect(result.status).toBe('ready');
    expect(buildProjectAgentBootstrapPromptSection(result)).toContain(
      'Bounded graph retrieval: command:workspai workspace graph search'
    );
    expect(() => requireReadyProjectAgentBootstrap(result)).not.toThrow();
  });

  it('rejects receipts that leak machine-local paths', async () => {
    const projectPath = await fixture();
    await mkdir(path.join(projectPath, '.workspai'), { recursive: true });
    await writeFile(path.join(projectPath, '.workspai', 'agent-entry.v1.json'), '{}\n');
    const leaked = receipt();
    leaked.nextActions = ['Read /home/example/private/project.json'];

    const result = await bootstrapProjectAgent({ projectPath, run: runner(leaked) });

    expect(result.status).toBe('blocked');
    expect(result.receipt).toBeUndefined();
  });

  it('allows degraded receipts for bounded context but rejects source mutation', async () => {
    const projectPath = await fixture();
    await mkdir(path.join(projectPath, '.workspai'), { recursive: true });
    await writeFile(path.join(projectPath, '.workspai', 'agent-entry.v1.json'), '{}\n');

    const result = await bootstrapProjectAgent({
      projectPath,
      run: runner(receipt('degraded')),
    });

    expect(result.status).toBe('degraded');
    expect(buildProjectAgentBootstrapPromptSection(result)).toContain(
      'Architecture claims: prohibited'
    );
    expect(() => requireReadyProjectAgentBootstrap(result)).toThrow(/bounded project lens/i);
  });
});

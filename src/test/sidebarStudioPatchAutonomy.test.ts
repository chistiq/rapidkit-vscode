import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const askConfiguredAIProviderMock = vi.hoisted(() => vi.fn());

vi.mock('vscode', () => ({
  workspace: { workspaceFolders: [], getConfiguration: () => ({ get: () => undefined }) },
  lm: { selectChatModels: async () => [] },
  LanguageModelChatMessage: { User: (value: string) => value, Assistant: (value: string) => value },
  CancellationTokenSource: class {
    token = {};
    dispose() {}
  },
}));

vi.mock('../core/aiProviderService.js', () => ({
  askConfiguredAIProvider: askConfiguredAIProviderMock,
}));

import {
  canAutonomouslyApplySidebarPatches,
  collectSidebarStudioRepairEvidence,
  executeSidebarApplyDebugPatch,
  parseStudioEvidenceRefreshRequest,
  validateSidebarStudioRepairResponse,
} from '../core/sidebarStudioPatchBridge.js';
import type { FilePatch } from '../core/patchApplyEngine.js';
import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';
import { STUDIO_BLOCKER_HANDOFF_SCHEMA_VERSION } from '../contracts/studio-blocker-handoff-contract.js';

function handoff(targetPath = 'apps/api/config.json'): StudioBlockerHandoff {
  return {
    schemaVersion: STUDIO_BLOCKER_HANDOFF_SCHEMA_VERSION,
    cardId: 'contract',
    cardStatus: 'fail',
    blockers: ['Contract field is missing.'],
    artifactPath: '.workspai/reports/workspace-verify-last-run.json',
    sourceCommand: 'npx workspai workspace contract --json',
    scope: 'project',
    blockerSignature: '1234567890abcdef',
    verifyCommand: 'npx workspai workspace verify --json',
    resolutionHints: [
      {
        blocker: 'Contract field is missing.',
        resolutionClass: 'config-fixable',
        fixHints: [{ actionKind: 'edit-file', targetPath }],
      },
    ],
  };
}

function patch(relativePath = 'apps/api/config.json'): FilePatch {
  return {
    relativePath,
    isNewFile: false,
    patchedContent: '{"enabled":true}\n',
    hunks: [],
    status: 'pending',
  };
}

describe('sidebar Studio AI patch autonomy boundary', () => {
  it('keeps command, inspect, and patch actions in one bounded model transcript', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-studio-agent-loop-'));
    const reportsPath = path.join(workspacePath, '.workspai', 'reports');
    const targetPath = path.join(workspacePath, 'config.json');
    await fs.mkdir(reportsPath, { recursive: true });
    await fs.writeFile(
      path.join(reportsPath, 'workspace-context-agent.json'),
      JSON.stringify({ schemaVersion: 'workspace-context-agent-v1' })
    );
    await fs.writeFile(targetPath, '{"port":3000}\n');
    askConfiguredAIProviderMock
      .mockResolvedValueOnce({
        provider: 'vscode-lm',
        text: JSON.stringify({
          schemaVersion: 'workspai.studio-agent-action.v1',
          action: 'run-command',
          commandId: 'workspaceContractVerify',
          reason: 'Refresh the stale contract verification artifact.',
        }),
      })
      .mockResolvedValueOnce({
        provider: 'vscode-lm',
        text: JSON.stringify({
          schemaVersion: 'workspai.studio-agent-action.v1',
          action: 'inspect-files',
          paths: ['config.json'],
          reason: 'Confirm the current port before editing.',
        }),
      })
      .mockResolvedValueOnce({
        provider: 'vscode-lm',
        text: '```json path: config.json\n{"port":3001}\n```',
      });
    const phases: string[] = [];
    try {
      const result = await executeSidebarApplyDebugPatch({
        context: {} as never,
        workspacePath,
        handoff: { ...handoff('config.json'), safetyRisk: 'destructive' },
        onProgress: (progress) => phases.push(progress.phase),
        onRunAgentCommand: async (commandId) => ({
          success: commandId === 'workspaceContractVerify',
          summary: 'Contract verification refreshed.',
        }),
      });
      expect(askConfiguredAIProviderMock).toHaveBeenCalledTimes(3);
      const secondMessages = askConfiguredAIProviderMock.mock.calls[1][1] as Array<{
        role: string;
        content: string;
      }>;
      expect(secondMessages.at(-1)?.content).toContain('workspaceContractVerify');
      expect(secondMessages.at(-1)?.content).toContain('Contract verification refreshed.');
      const thirdMessages = askConfiguredAIProviderMock.mock.calls[2][1] as Array<{
        role: string;
        content: string;
      }>;
      expect(thirdMessages.at(-1)?.content).toContain('workspai.studio-agent-observation.v1');
      expect(thirdMessages.at(-1)?.content).toContain('{\\"port\\":3000}');
      expect(phases).toContain('running-agent-command');
      expect(phases).toContain('inspecting-agent-files');
      expect(result.status).toBe('review');
      expect(result.pendingPatches?.[0]).toMatchObject({
        relativePath: 'config.json',
        originalContent: '{"port":3000}\n',
        patchedContent: '{"port":3001}\n',
      });
    } finally {
      askConfiguredAIProviderMock.mockReset();
      await fs.rm(workspacePath, { recursive: true, force: true });
    }
  }, 15_000);
  it('accepts exactly one repair protocol and rejects mixed or malformed control output', () => {
    expect(
      validateSidebarStudioRepairResponse('```json path: apps/api/config.json\n{}\n```')
    ).toMatchObject({ valid: true, mode: 'patch' });
    expect(
      validateSidebarStudioRepairResponse(
        '```json\n{"schemaVersion":"workspai.studio-evidence-action.v1","action":"refresh-evidence","commandId":"workspaceVerify","reason":"fresh evidence required"}\n```\n```json path: apps/api/config.json\n{}\n```'
      )
    ).toMatchObject({ valid: false, mode: 'invalid' });
    expect(
      validateSidebarStudioRepairResponse(
        '{"schemaVersion":"workspai.studio-evidence-action.v1","action":"refresh-evidence","commandId":"shell","reason":"unsafe"}'
      )
    ).toMatchObject({ valid: false, mode: 'invalid' });
  });
  it('parses only versioned allowlisted live-evidence requests from the model', () => {
    expect(
      parseStudioEvidenceRefreshRequest(`
\`\`\`json
{"schemaVersion":"workspai.studio-evidence-action.v1","action":"refresh-evidence","commandId":"workspaceVerify","reason":"Contract evidence changed"}
\`\`\`
`)
    ).toEqual({
      schemaVersion: 'workspai.studio-evidence-action.v1',
      action: 'refresh-evidence',
      commandId: 'workspaceVerify',
      reason: 'Contract evidence changed',
    });
    expect(
      parseStudioEvidenceRefreshRequest(`
\`\`\`json
{"schemaVersion":"workspai.studio-evidence-action.v1","action":"refresh-evidence","commandId":"arbitraryShell","reason":"run anything"}
\`\`\`
`)
    ).toBeNull();
  });

  it('allows a small patch when the CLI hint names the exact target and verify is present', () => {
    expect(canAutonomouslyApplySidebarPatches({ handoff: handoff(), patches: [patch()] })).toBe(
      true
    );
  });

  it('requires review for unscoped, sensitive, destructive, or multi-file proposals', () => {
    expect(
      canAutonomouslyApplySidebarPatches({ handoff: handoff(), patches: [patch('other.json')] })
    ).toBe(false);
    expect(
      canAutonomouslyApplySidebarPatches({
        handoff: handoff('apps/api/.env'),
        patches: [patch('apps/api/.env')],
      })
    ).toBe(false);
    expect(
      canAutonomouslyApplySidebarPatches({
        handoff: { ...handoff(), safetyRisk: 'destructive' },
        patches: [patch()],
      })
    ).toBe(false);
    expect(
      canAutonomouslyApplySidebarPatches({
        handoff: handoff(),
        patches: [patch(), patch(), patch(), patch()],
      })
    ).toBe(false);
  });

  it('requires review when aggregate patch content exceeds the autonomous budget', () => {
    const large = 'x'.repeat(140 * 1024);
    expect(
      canAutonomouslyApplySidebarPatches({
        handoff: {
          ...handoff('a.txt'),
          resolutionHints: [
            {
              blocker: 'large',
              resolutionClass: 'config-fixable',
              fixHints: [
                { actionKind: 'edit-file', targetPath: 'a.txt' },
                { actionKind: 'edit-file', targetPath: 'b.txt' },
              ],
            },
          ],
        },
        patches: [
          { ...patch('a.txt'), patchedContent: large },
          { ...patch('b.txt'), patchedContent: large },
        ],
      })
    ).toBe(false);
  });

  it('grounds project-scoped repair targets in CLI evidence and exact source hashes', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-studio-evidence-'));
    const projectPath = path.join(workspacePath, 'apps', 'api');
    const targetPath = path.join(projectPath, 'config.json');
    await fs.mkdir(path.join(workspacePath, '.workspai', 'reports'), { recursive: true });
    await fs.mkdir(projectPath, { recursive: true });
    await fs.writeFile(
      path.join(workspacePath, '.workspai', 'reports', 'workspace-context-agent.json'),
      JSON.stringify({
        schemaVersion: 'workspace-context-agent-v1',
        validation: { status: 'pass' },
      })
    );
    await fs.writeFile(targetPath, '{"enabled":false}\n');

    try {
      const evidence = await collectSidebarStudioRepairEvidence({
        workspacePath,
        projectPath,
        handoff: handoff('config.json'),
      });

      expect(evidence.missingRequired).toEqual([]);
      expect(evidence.evidenceFingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(evidence.exactTargetPaths).toEqual(['config.json']);
      expect(evidence.promptSection).toContain('<repair-target path="config.json"');
      expect(evidence.promptSection).toContain('{"enabled":false}');
      expect(evidence.expectedBaseSha256['config.json']).toBe(
        crypto.createHash('sha256').update('{"enabled":false}\n').digest('hex')
      );
      await fs.writeFile(targetPath, '{"enabled":true,"generation":2}\n');
      const nextGeneration = await collectSidebarStudioRepairEvidence({
        workspacePath,
        projectPath,
        handoff: handoff('config.json'),
      });
      expect(nextGeneration.evidenceFingerprint).not.toBe(evidence.evidenceFingerprint);
      expect(nextGeneration.promptSection).toContain('"generation":2');
      const beforeSameSizeRewrite = nextGeneration.evidenceFingerprint;
      await fs.writeFile(targetPath, '{"enabled":true,"generation":3}\n');
      const sameSizeRewrite = await collectSidebarStudioRepairEvidence({
        workspacePath,
        projectPath,
        handoff: handoff('config.json'),
      });
      expect(sameSizeRewrite.evidenceFingerprint).not.toBe(beforeSameSizeRewrite);
    } finally {
      await fs.rm(workspacePath, { recursive: true, force: true });
    }
  });

  it('promotes contractPath from a valid CLI artifact into an exact repair target', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-studio-contract-'));
    const reportsPath = path.join(workspacePath, '.workspai', 'reports');
    const contractPath = path.join(workspacePath, '.workspai', 'workspace.contract.json');
    await fs.mkdir(reportsPath, { recursive: true });
    await fs.writeFile(contractPath, '{"projects":[]}\n');
    await fs.writeFile(
      path.join(reportsPath, 'workspace-context-agent.json'),
      JSON.stringify({ schemaVersion: 'workspace-context-agent-v1' })
    );
    await fs.writeFile(
      path.join(reportsPath, 'workspace-contract-verify-last-run.json'),
      JSON.stringify({
        schemaVersion: 'workspace-contract-verify.v1',
        status: 'failed',
        contractPath,
        violations: ['Port collision'],
      })
    );
    await fs.writeFile(
      path.join(reportsPath, 'INDEX.json'),
      JSON.stringify({
        readOrder: [
          '.workspai/reports/workspace-context-agent.json',
          '.workspai/reports/workspace-contract-verify-last-run.json',
        ],
        reports: [
          {
            path: '.workspai/reports/workspace-context-agent.json',
            required: true,
            exists: true,
            validity: 'valid',
          },
          {
            path: '.workspai/reports/workspace-contract-verify-last-run.json',
            required: false,
            exists: true,
            validity: 'valid',
          },
        ],
      })
    );

    try {
      const evidence = await collectSidebarStudioRepairEvidence({
        workspacePath,
        handoff: { ...handoff(''), scope: 'workspace' },
      });
      expect(evidence.exactTargetPaths).not.toContain('.workspai/workspace.contract.json');
      expect(evidence.autonomousTargetPaths).not.toContain('.workspai/workspace.contract.json');
      expect(evidence.promptSection).not.toContain('{"projects":[]}');
    } finally {
      await fs.rm(workspacePath, { recursive: true, force: true });
    }
  });

  it('returns machine-readable missing evidence so the host can refresh and retry once', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-studio-stale-index-'));
    const reportsPath = path.join(workspacePath, '.workspai', 'reports');
    await fs.mkdir(reportsPath, { recursive: true });
    await fs.writeFile(
      path.join(reportsPath, 'workspace-context-agent.json'),
      JSON.stringify({ schemaVersion: 'workspace-context-agent-v1' })
    );
    await fs.writeFile(
      path.join(reportsPath, 'INDEX.json'),
      JSON.stringify({
        reports: [
          {
            path: '.workspai/reports/workspace-context-agent.json',
            required: true,
            exists: true,
            validity: 'valid',
          },
          {
            path: '.workspai/reports/workspace-skills-index.json',
            required: true,
            exists: false,
            validity: 'missing',
          },
        ],
      })
    );

    try {
      const result = await executeSidebarApplyDebugPatch({
        context: {} as never,
        workspacePath,
        handoff: { ...handoff(''), scope: 'workspace' },
      });
      expect(result.status).toBe('blocked');
      expect(result.missingRequired).toEqual(['.workspai/reports/workspace-skills-index.json']);
    } finally {
      await fs.rm(workspacePath, { recursive: true, force: true });
    }
  });

  it('promotes Analyze missing-file findings into project-scoped inspect targets', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-studio-analyze-ci-'));
    const projectPath = path.join(workspacePath, 'commerce-api');
    const reportsPath = path.join(workspacePath, '.workspai', 'reports');
    await fs.mkdir(reportsPath, { recursive: true });
    await fs.mkdir(projectPath, { recursive: true });
    await fs.writeFile(
      path.join(workspacePath, '.workspai', 'reports', 'workspace-context-agent.json'),
      JSON.stringify({ schemaVersion: 'workspace-context-agent-v1' })
    );
    await fs.writeFile(
      path.join(reportsPath, 'analyze-last-run.json'),
      JSON.stringify({
        schemaVersion: 'rapidkit-analyze-v1',
        findings: [
          {
            id: 'project.ci.missing',
            severity: 'warn',
            title: 'Continuous integration is missing',
            detail: 'No recognized CI/CD configuration file was detected for this project.',
            target: 'commerce-api',
            remediation:
              'Add CI configuration so tests and checks run automatically for every change.',
            files: ['.github/workflows/ci.yml'],
          },
        ],
      })
    );

    try {
      const evidence = await collectSidebarStudioRepairEvidence({
        workspacePath,
        projectPath,
        handoff: {
          schemaVersion: STUDIO_BLOCKER_HANDOFF_SCHEMA_VERSION,
          cardId: 'analyze',
          cardStatus: 'fail',
          blockers: ['Continuous integration is missing'],
          artifactPath: '.workspai/reports/analyze-last-run.json',
          sourceCommand: 'npx workspai analyze --json',
          scope: 'project',
          blockerSignature: 'analyze-ci-missing',
          verifyCommand: 'npx workspai analyze --json',
        },
      });
      expect(evidence.exactTargetPaths).toContain('.github/workflows/ci.yml');
      expect(evidence.autonomousTargetPaths).toContain('.github/workflows/ci.yml');
      expect(evidence.expectedBaseSha256['.github/workflows/ci.yml']).toBeNull();
      expect(evidence.promptSection).toContain(
        '<repair-target path=".github/workflows/ci.yml" base-sha256="absent">'
      );
      expect(evidence.promptSection).toContain('[file does not exist]');
    } finally {
      await fs.rm(workspacePath, { recursive: true, force: true });
    }
  });
});

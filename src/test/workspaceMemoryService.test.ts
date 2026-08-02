import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { WorkspaceMemoryService } from '../core/workspaceMemoryService';

describe('workspaceMemoryService', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-memory-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('writes new memory to canonical Workspai metadata and prefers it over legacy memory', async () => {
    const svc = WorkspaceMemoryService.getInstance();
    const wsPath = path.join(tempRoot, 'ws-canonical');
    const legacyPath = path.join(wsPath, '.rapidkit', 'workspace-memory.json');
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(
      legacyPath,
      JSON.stringify({
        context: 'Legacy context',
        conventions: [],
        decisions: [],
        lastUpdated: '2026-04-20T00:00:00.000Z',
      })
    );

    await svc.write(
      wsPath,
      {
        context: 'Canonical context',
        conventions: [],
        decisions: [],
        lastUpdated: '',
      },
      {
        actor: 'test',
        operation: 'workspace-memory-wizard',
        mode: 'user-initiated',
        reason: 'Verify canonical ownership.',
        approvedByUser: true,
      }
    );

    expect(await svc.resolveMemoryPath(wsPath)).toBe(
      path.join(wsPath, '.workspai', 'workspace-memory.json')
    );
    await expect(svc.read(wsPath)).resolves.toMatchObject({ context: 'Canonical context' });
  });

  it('sanitizes invalid memory schema and self-heals file content', async () => {
    const svc = WorkspaceMemoryService.getInstance();
    const wsPath = path.join(tempRoot, 'ws-schema');
    const memoryDir = path.join(wsPath, '.rapidkit');
    const memoryPath = path.join(memoryDir, 'workspace-memory.json');

    fs.mkdirSync(memoryDir, { recursive: true });
    fs.writeFileSync(
      memoryPath,
      JSON.stringify(
        {
          context: '  Orders workspace  ',
          conventions: ['  Use ports/adapters  ', '', 42],
          decisions: ['  PostgreSQL over MongoDB  ', null],
          lastUpdated: 'invalid-date',
        },
        null,
        2
      )
    );

    const parsed = await svc.read(wsPath);

    expect(parsed.context).toBe('Orders workspace');
    expect(parsed.conventions).toEqual(['Use ports/adapters']);
    expect(parsed.decisions).toEqual(['PostgreSQL over MongoDB']);
    expect(parsed.lastUpdated).toBe('');

    const healed = JSON.parse(fs.readFileSync(memoryPath, 'utf8')) as {
      context: string;
      conventions: string[];
      decisions: string[];
      lastUpdated: string;
    };

    expect(healed.context).toBe('Orders workspace');
    expect(healed.conventions).toEqual(['Use ports/adapters']);
    expect(healed.decisions).toEqual(['PostgreSQL over MongoDB']);
    expect(healed.lastUpdated).not.toBe('');
    expect(Number.isNaN(Date.parse(healed.lastUpdated))).toBe(false);
  });

  it('backs up corrupt memory json and repairs file with defaults', async () => {
    const svc = WorkspaceMemoryService.getInstance();
    const wsPath = path.join(tempRoot, 'ws-corrupt');
    const memoryDir = path.join(wsPath, '.rapidkit');
    const memoryPath = path.join(memoryDir, 'workspace-memory.json');

    fs.mkdirSync(memoryDir, { recursive: true });
    fs.writeFileSync(memoryPath, '{ invalid json', 'utf8');

    const parsed = await svc.read(wsPath);

    expect(parsed.context).toBe('');
    expect(parsed.conventions).toEqual([]);
    expect(parsed.decisions).toEqual([]);

    const repaired = JSON.parse(fs.readFileSync(memoryPath, 'utf8')) as {
      context: string;
      conventions: string[];
      decisions: string[];
      lastUpdated: string;
    };

    expect(repaired.context).toBe('');
    expect(repaired.conventions).toEqual([]);
    expect(repaired.decisions).toEqual([]);
    expect(repaired.lastUpdated).not.toBe('');

    const backupFiles = fs
      .readdirSync(memoryDir)
      .filter((name) => name.startsWith('workspace-memory.corrupt-') && name.endsWith('.json'));

    expect(backupFiles.length).toBeGreaterThan(0);
  });

  it('reads nearest ancestor memory for nested project paths', async () => {
    const svc = WorkspaceMemoryService.getInstance();
    const workspaceRoot = path.join(tempRoot, 'ws-nearest');
    const projectPath = path.join(workspaceRoot, 'services', 'billing-api');
    const memoryDir = path.join(workspaceRoot, '.rapidkit');
    const memoryPath = path.join(memoryDir, 'workspace-memory.json');

    fs.mkdirSync(projectPath, { recursive: true });
    fs.mkdirSync(memoryDir, { recursive: true });
    fs.writeFileSync(
      memoryPath,
      JSON.stringify(
        {
          context: 'Shared workspace memory',
          conventions: ['Always use repository interfaces'],
          decisions: ['Redis for rate limiting'],
          lastUpdated: '2026-04-20T00:00:00.000Z',
        },
        null,
        2
      )
    );

    const resolvedPath = await svc.resolveNearestMemoryPath(projectPath);
    const parsed = await svc.readNearest(projectPath);

    expect(resolvedPath).toBe(memoryPath);
    expect(parsed.context).toBe('Shared workspace memory');
    expect(parsed.conventions).toContain('Always use repository interfaces');
    expect(parsed.decisions).toContain('Redis for rate limiting');
  });

  it('redacts sensitive values from memory before returning and formatting prompt', async () => {
    const svc = WorkspaceMemoryService.getInstance();
    const wsPath = path.join(tempRoot, 'ws-redaction');
    const memoryDir = path.join(wsPath, '.rapidkit');
    const memoryPath = path.join(memoryDir, 'workspace-memory.json');

    fs.mkdirSync(memoryDir, { recursive: true });
    fs.writeFileSync(
      memoryPath,
      JSON.stringify(
        {
          context: 'authorization: Bearer eyJ.long.token',
          conventions: ['api_key=prod-123-secret'],
          decisions: ['password: letmein'],
          lastUpdated: '2026-04-20T00:00:00.000Z',
        },
        null,
        2
      )
    );

    const parsed = await svc.read(wsPath);
    const prompt = svc.formatForPrompt(parsed);

    expect(parsed.context).toContain('[REDACTED]');
    expect(parsed.conventions[0]).toContain('[REDACTED]');
    expect(parsed.decisions[0]).toContain('[REDACTED]');
    expect(prompt).toContain('[REDACTED]');
    expect(prompt).not.toContain('prod-123-secret');
    expect(prompt).not.toContain('letmein');
    expect(prompt).not.toContain('eyJ.long.token');
  });

  it('sanitizes policy profile and derives local processing mode for sensitive repositories', async () => {
    const svc = WorkspaceMemoryService.getInstance();
    const wsPath = path.join(tempRoot, 'ws-policy-derived');
    const memoryDir = path.join(wsPath, '.rapidkit');
    const memoryPath = path.join(memoryDir, 'workspace-memory.json');

    fs.mkdirSync(memoryDir, { recursive: true });
    fs.writeFileSync(
      memoryPath,
      JSON.stringify(
        {
          context: 'Sensitive repo',
          conventions: [],
          decisions: [],
          policyProfile: 'strict',
          sensitivity: 'sensitive',
          lastUpdated: '2026-04-20T00:00:00.000Z',
        },
        null,
        2
      )
    );

    const parsed = await svc.read(wsPath);
    const policy = svc.resolvePolicy(parsed);

    expect(parsed.policyProfile).toBe('strict');
    expect(parsed.sensitivity).toBe('sensitive');
    expect(parsed.localProcessingMode).toBe(true);
    expect(policy).toEqual({
      profile: 'strict',
      sensitivity: 'sensitive',
      localProcessingMode: true,
    });
  });

  it('falls back to balanced policy profile and keeps explicit local-processing override', async () => {
    const svc = WorkspaceMemoryService.getInstance();
    const wsPath = path.join(tempRoot, 'ws-policy-fallback');
    const memoryDir = path.join(wsPath, '.rapidkit');
    const memoryPath = path.join(memoryDir, 'workspace-memory.json');

    fs.mkdirSync(memoryDir, { recursive: true });
    fs.writeFileSync(
      memoryPath,
      JSON.stringify(
        {
          context: 'General repo',
          conventions: [],
          decisions: [],
          policyProfile: 'unsupported-profile',
          sensitivity: 'normal',
          localProcessingMode: true,
          lastUpdated: '2026-04-20T00:00:00.000Z',
        },
        null,
        2
      )
    );

    const parsed = await svc.read(wsPath);

    expect(parsed.policyProfile).toBe('balanced');
    expect(parsed.sensitivity).toBe('normal');
    expect(parsed.localProcessingMode).toBe(true);
    expect(svc.formatForPrompt(parsed)).toContain('Memory policy: balanced');
  });

  it('enforces local-processing mode for strict profile even when file sets false', async () => {
    const svc = WorkspaceMemoryService.getInstance();
    const wsPath = path.join(tempRoot, 'ws-policy-strict-enforced');
    const memoryDir = path.join(wsPath, '.rapidkit');
    const memoryPath = path.join(memoryDir, 'workspace-memory.json');

    fs.mkdirSync(memoryDir, { recursive: true });
    fs.writeFileSync(
      memoryPath,
      JSON.stringify(
        {
          context: 'Strict repo',
          conventions: [],
          decisions: [],
          policyProfile: 'strict',
          sensitivity: 'normal',
          localProcessingMode: false,
          lastUpdated: '2026-04-20T00:00:00.000Z',
        },
        null,
        2
      )
    );

    const parsed = await svc.read(wsPath);
    const policy = svc.resolvePolicy(parsed);

    expect(parsed.localProcessingMode).toBe(true);
    expect(policy.localProcessingMode).toBe(true);
  });

  it('enforces local-processing mode for sensitive profile even when file sets false', async () => {
    const svc = WorkspaceMemoryService.getInstance();
    const wsPath = path.join(tempRoot, 'ws-policy-sensitive-enforced');
    const memoryDir = path.join(wsPath, '.rapidkit');
    const memoryPath = path.join(memoryDir, 'workspace-memory.json');

    fs.mkdirSync(memoryDir, { recursive: true });
    fs.writeFileSync(
      memoryPath,
      JSON.stringify(
        {
          context: 'Sensitive repo',
          conventions: [],
          decisions: [],
          policyProfile: 'balanced',
          sensitivity: 'sensitive',
          localProcessingMode: false,
          lastUpdated: '2026-04-20T00:00:00.000Z',
        },
        null,
        2
      )
    );

    const parsed = await svc.read(wsPath);
    const policy = svc.resolvePolicy(parsed);

    expect(parsed.localProcessingMode).toBe(true);
    expect(policy.localProcessingMode).toBe(true);
  });

  it('allows contract-gated user-initiated memory write', async () => {
    const svc = WorkspaceMemoryService.getInstance();
    const wsPath = path.join(tempRoot, 'ws-write-contract-allow');

    await svc.write(
      wsPath,
      {
        context: 'Workspace memory created by user wizard',
        conventions: ['Use explicit error boundaries'],
        decisions: ['Adopt strict incident runbooks'],
        policyProfile: 'balanced',
        sensitivity: 'normal',
        localProcessingMode: false,
        lastUpdated: '',
      },
      {
        actor: 'workspai.aiWorkspaceMemoryWizard',
        operation: 'workspace-memory-wizard',
        mode: 'user-initiated',
        reason: 'User approved memory update from wizard.',
        approvedByUser: true,
      }
    );

    const parsed = await svc.read(wsPath);
    expect(parsed.context).toBe('Workspace memory created by user wizard');
    expect(parsed.conventions).toContain('Use explicit error boundaries');
    expect(parsed.decisions).toContain('Adopt strict incident runbooks');
  });

  it('blocks memory writes when access contract is missing', async () => {
    const svc = WorkspaceMemoryService.getInstance();
    const wsPath = path.join(tempRoot, 'ws-write-contract-missing');

    await expect(
      svc.write(wsPath, {
        context: 'Write without explicit contract',
        conventions: [],
        decisions: [],
        policyProfile: 'balanced',
        sensitivity: 'normal',
        localProcessingMode: false,
        lastUpdated: '',
      })
    ).rejects.toThrow(/missing access contract/i);
  });

  it('blocks memory writes when access contract mode is invalid', async () => {
    const svc = WorkspaceMemoryService.getInstance();
    const wsPath = path.join(tempRoot, 'ws-write-contract-invalid-mode');

    await expect(
      svc.write(
        wsPath,
        {
          context: 'Write with invalid mode',
          conventions: [],
          decisions: [],
          policyProfile: 'balanced',
          sensitivity: 'normal',
          localProcessingMode: false,
          lastUpdated: '',
        },
        {
          actor: 'incident-studio.replay-learning',
          operation: 'incident-replay-learning',
          mode: 'invalid-mode' as any,
          reason: 'Attempted write with malformed contract mode.',
        }
      )
    ).rejects.toThrow(/invalid access mode/i);
  });

  it('blocks unapproved system-enrichment writes under strict policy profile', async () => {
    const svc = WorkspaceMemoryService.getInstance();
    const wsPath = path.join(tempRoot, 'ws-write-contract-block');

    await svc.write(
      wsPath,
      {
        context: 'Strict workspace',
        conventions: [],
        decisions: [],
        policyProfile: 'strict',
        sensitivity: 'normal',
        localProcessingMode: true,
        lastUpdated: '',
      },
      {
        actor: 'workspai.aiWorkspaceMemoryWizard',
        operation: 'workspace-memory-wizard',
        mode: 'user-initiated',
        reason: 'Initial strict memory setup by user.',
        approvedByUser: true,
      }
    );

    await expect(
      svc.write(
        wsPath,
        {
          context: 'Strict workspace',
          conventions: [],
          decisions: ['Replay learning: similar incident fixed with verify pack'],
          policyProfile: 'strict',
          sensitivity: 'normal',
          localProcessingMode: true,
          lastUpdated: '',
        },
        {
          actor: 'incident-studio.replay-learning',
          operation: 'incident-replay-learning',
          mode: 'system-enrichment',
          reason: 'Persist replay learning without direct user approval.',
          approvedByUser: false,
        }
      )
    ).rejects.toThrow(/blocked by policy profile strict/i);
  });
});

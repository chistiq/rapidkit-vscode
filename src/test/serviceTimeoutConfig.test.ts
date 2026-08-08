import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockConfigGet,
  mockRun,
  mockAxiosGet,
  mockPathExists,
  mockReadJson,
  mockEnsureDir,
  mockWriteJson,
  mockRemove,
} = vi.hoisted(() => ({
  mockConfigGet: vi.fn(),
  mockRun: vi.fn(),
  mockAxiosGet: vi.fn(),
  mockPathExists: vi.fn(),
  mockReadJson: vi.fn(),
  mockEnsureDir: vi.fn(),
  mockWriteJson: vi.fn(),
  mockRemove: vi.fn(),
}));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: mockConfigGet,
    }),
  },
}));

vi.mock('../utils/exec', () => ({
  run: mockRun,
}));

vi.mock('axios', () => ({
  default: {
    get: mockAxiosGet,
  },
  get: mockAxiosGet,
}));

vi.mock('fs-extra', () => ({
  pathExists: mockPathExists,
  readJson: mockReadJson,
  ensureDir: mockEnsureDir,
  writeJson: mockWriteJson,
  remove: mockRemove,
}));

import { KitsService } from '../core/kitsService';
import { ExamplesService } from '../core/examplesService';

describe('service timeout config', () => {
  const context = {
    globalStorageUri: {
      fsPath: '/tmp/workspai-vscode-tests',
    },
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    (KitsService as any).instance = null;
    (ExamplesService as any).instance = null;

    mockConfigGet.mockImplementation((_key: string, fallback: number) => fallback);
    mockPathExists.mockResolvedValue(false);
    mockReadJson.mockResolvedValue(null);
    mockEnsureDir.mockResolvedValue(undefined);
    mockWriteJson.mockResolvedValue(undefined);
    mockRemove.mockResolvedValue(undefined);
  });

  it('uses clamped command timeout for kits CLI fetch', async () => {
    mockConfigGet.mockImplementation((key: string, fallback: number) => {
      if (key === 'commandTimeoutMs') {
        return 100000;
      }
      return fallback;
    });

    mockRun.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({
        schema_version: 1,
        ok: true,
        count: 0,
        kits: [],
      }),
      stderr: '',
    });

    const service = KitsService.initialize(context);
    await service.getKits();

    expect(mockRun).toHaveBeenCalledWith(
      'npx',
      ['--yes', '--package', 'workspai', 'workspai', 'list', '--json'],
      expect.objectContaining({ timeout: 60000 })
    );
  });

  it('falls back to default kits command timeout when config is non-finite', async () => {
    mockConfigGet.mockImplementation((key: string, fallback: number) => {
      if (key === 'commandTimeoutMs') {
        return Number.NaN;
      }
      return fallback;
    });

    mockRun.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({
        schema_version: 1,
        ok: true,
        count: 0,
        kits: [],
      }),
      stderr: '',
    });

    const service = KitsService.initialize(context);
    await service.getKits();

    expect(mockRun).toHaveBeenCalledWith(
      'npx',
      ['--yes', '--package', 'workspai', 'workspai', 'list', '--json'],
      expect.objectContaining({ timeout: 15000 })
    );
  });

  it('uses clamped network timeout for examples metadata fetch', async () => {
    mockConfigGet.mockImplementation((key: string, fallback: number) => {
      if (key === 'networkTimeoutMs') {
        return 100;
      }
      return fallback;
    });

    mockAxiosGet.mockResolvedValue({
      data: {
        version: '1.0.0',
        lastUpdated: '2026-01-01T00:00:00.000Z',
        repository: 'https://github.com/chistiq/rapidkit-examples',
        workspaces: [],
      },
    });

    const service = ExamplesService.initialize(context);
    await service.getExamples();

    expect(mockAxiosGet).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/chistiq/rapidkit-examples/main/examples.json',
      expect.objectContaining({ timeout: 1000 })
    );
  });

  it('publishes runnable examples and raw profile foundations through one catalog', async () => {
    mockAxiosGet.mockResolvedValue({
      data: {
        version: '1.1.0',
        lastUpdated: '2026-08-08T00:00:00.000Z',
        repository: 'https://github.com/chistiq/rapidkit-examples',
        workspaces: [
          {
            id: 'quickstart',
            name: 'quickstart-workspace',
            title: 'Quickstart Workspace',
            description: 'Runnable example',
            path: 'quickstart-workspace',
            projects: [],
          },
        ],
        profileWorkspaces: [
          {
            id: 'go-only',
            name: 'go-only-workspace',
            profile: 'go-only',
            path: 'go-only-workspace',
            kind: 'raw-profile-fixture',
            projects: [],
            lifecycleStatus: 'published',
          },
          {
            id: 'draft',
            name: 'draft-workspace',
            profile: 'minimal',
            path: 'draft-workspace',
            kind: 'raw-profile-fixture',
            projects: [],
            lifecycleStatus: 'draft',
          },
        ],
      },
    });

    const service = ExamplesService.initialize(context);
    const catalog = await service.getExamples();

    expect(catalog).toHaveLength(2);
    expect(catalog[0]).toMatchObject({
      id: 'quickstart',
      catalogKind: 'runnable-example',
    });
    expect(catalog[1]).toMatchObject({
      id: 'go-only',
      profile: 'go-only',
      catalogKind: 'profile-foundation',
      title: 'Go Workspace Foundation',
    });
  });
});

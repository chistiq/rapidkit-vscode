import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { runMock } = vi.hoisted(() => ({
  runMock: vi.fn(),
}));

vi.mock('../utils/exec', () => ({
  run: runMock,
}));

import {
  clearProjectCommandCapabilitiesCache,
  fetchProjectCommandCapabilities,
  getUnsupportedProjectCommandReason,
  isModuleMutationSupported,
  isProjectCommandSupported,
  resolveProjectLifecycleCommand,
} from '../core/projectCommandCapabilities';

function buildCapabilities(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    scope: 'project',
    projectRoot: '/tmp/demo',
    runtime: 'python',
    framework: 'fastapi',
    frameworkDisplayName: 'FastAPI',
    moduleSupport: true,
    fleetStages: ['init', 'test', 'build', 'start'],
    localOnlyCommands: ['dev', 'lint', 'format'],
    commandMap: {
      init: { command: 'init', owner: 'runtime', status: 'supported', fleetEligible: true },
      dev: { command: 'dev', owner: 'runtime', status: 'supported', fleetEligible: false },
      test: { command: 'test', owner: 'runtime', status: 'supported', fleetEligible: true },
      build: { command: 'build', owner: 'runtime', status: 'supported', fleetEligible: true },
      start: { command: 'start', owner: 'runtime', status: 'supported', fleetEligible: true },
      lint: { command: 'lint', owner: 'core', status: 'supported', fleetEligible: false },
      format: { command: 'format', owner: 'core', status: 'supported', fleetEligible: false },
      add: { command: 'add', owner: 'core', status: 'supported' },
      modules: { command: 'modules', owner: 'core', status: 'supported' },
      help: { command: 'help', owner: 'runtime', status: 'unsupported', reason: 'help only' },
    },
    supportedCommands: [
      'init',
      'dev',
      'test',
      'build',
      'start',
      'lint',
      'format',
      'add',
      'modules',
    ],
    unsupportedCommands: ['help'],
    ...overrides,
  };
}

describe('project command capabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearProjectCommandCapabilitiesCache();
  });

  afterEach(() => {
    clearProjectCommandCapabilitiesCache();
  });

  it('fetches capabilities from rapidkit project commands --json', async () => {
    const payload = buildCapabilities();
    runMock.mockResolvedValue({
      exitCode: 0,
      stdout: `prelude\n${JSON.stringify(payload)}`,
      stderr: '',
    });

    const capabilities = await fetchProjectCommandCapabilities('/tmp/demo');

    expect(capabilities?.frameworkDisplayName).toBe('FastAPI');
    expect(runMock).toHaveBeenCalledWith(
      'npx',
      expect.arrayContaining(['project', 'commands', '--json']),
      expect.objectContaining({ cwd: '/tmp/demo' })
    );
  });

  it('returns null when the CLI contract is unavailable', async () => {
    runMock.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'offline' });

    const capabilities = await fetchProjectCommandCapabilities('/tmp/demo');

    expect(capabilities).toBeNull();
  });

  it('blocks unsupported lifecycle commands with framework-specific reasons', async () => {
    const payload = buildCapabilities({
      frameworkDisplayName: 'Go Fiber',
      moduleSupport: false,
      commandMap: {
        dev: { command: 'dev', owner: 'runtime', status: 'supported', fleetEligible: false },
        test: {
          command: 'test',
          owner: 'runtime',
          status: 'unsupported',
          reason: 'Go tests use go test',
        },
      },
      supportedCommands: ['dev'],
      unsupportedCommands: ['test'],
    });
    runMock.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify(payload),
      stderr: '',
    });

    const resolution = await resolveProjectLifecycleCommand('/tmp/go-app', 'test');

    expect(resolution.allowed).toBe(false);
    if (!resolution.allowed) {
      expect(resolution.reason).toBe('Go tests use go test');
    }
  });

  it('treats fleet stages separately from local-only dev', () => {
    const capabilities = buildCapabilities() as ReturnType<typeof buildCapabilities> & {
      commandMap: Record<string, { fleetEligible?: boolean }>;
    };

    expect(capabilities.fleetStages).toEqual(['init', 'test', 'build', 'start']);
    expect(capabilities.fleetStages).not.toContain('dev');
    expect(capabilities.commandMap.dev?.fleetEligible).toBe(false);
    expect(capabilities.commandMap.test?.fleetEligible).toBe(true);
  });

  it('requires module support and add/modules commands for module mutation', () => {
    const supported = buildCapabilities();
    const unsupported = buildCapabilities({
      moduleSupport: false,
      commandMap: {
        ...buildCapabilities().commandMap,
        add: { command: 'add', owner: 'core', status: 'unsupported' },
      },
    });

    expect(isModuleMutationSupported(supported as never)).toBe(true);
    expect(isModuleMutationSupported(unsupported as never)).toBe(false);
    expect(isProjectCommandSupported(supported as never, 'dev')).toBe(true);
    expect(getUnsupportedProjectCommandReason(supported as never, 'help')).toBe('help only');
  });
});

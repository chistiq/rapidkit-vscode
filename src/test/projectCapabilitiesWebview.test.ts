import { describe, expect, it } from 'vitest';

import {
  getDashboardLifecycleDisableReason,
  isDashboardLifecycleCommandSupported,
  isModuleMutationSupportedFromCapabilities,
  isProjectLifecycleCommandSupported,
} from '@/lib/projectCapabilities';

const fastapiCapabilities = {
  available: true,
  runtime: 'python',
  frameworkDisplayName: 'FastAPI',
  moduleSupport: true,
  supportedCommands: ['init', 'dev', 'test', 'build', 'add', 'modules'],
  commandMap: {
    init: { status: 'supported' },
    dev: { status: 'supported' },
    test: { status: 'supported' },
    build: { status: 'supported' },
    add: { status: 'supported' },
    modules: { status: 'supported' },
  },
} as const;

const goCapabilities = {
  available: true,
  runtime: 'go',
  frameworkDisplayName: 'Go Fiber',
  moduleSupport: false,
  supportedCommands: ['dev'],
  unsupportedCommands: ['test'],
  commandMap: {
    dev: { status: 'supported' },
    test: { status: 'unsupported', reason: 'Use go test in this project' },
  },
} as const;

describe('projectCapabilities webview bridge', () => {
  it('maps dashboard lifecycle commands to rapidkit command support', () => {
    expect(isDashboardLifecycleCommandSupported(fastapiCapabilities, 'projectInit')).toBe(true);
    expect(isDashboardLifecycleCommandSupported(goCapabilities, 'projectTest')).toBe(false);
    expect(getDashboardLifecycleDisableReason(goCapabilities, 'projectTest')).toBe(
      'Use go test in this project'
    );
  });

  it('falls back to permissive behavior when capabilities are unavailable', () => {
    expect(isProjectLifecycleCommandSupported(undefined, 'test')).toBe(true);
    expect(isDashboardLifecycleCommandSupported(undefined, 'projectTest')).toBe(true);
  });

  it('derives module mutation support from npm capability snapshot', () => {
    expect(isModuleMutationSupportedFromCapabilities(fastapiCapabilities)).toBe(true);
    expect(isModuleMutationSupportedFromCapabilities(goCapabilities)).toBe(false);
    expect(isModuleMutationSupportedFromCapabilities({ available: false })).toBe(false);
  });
});

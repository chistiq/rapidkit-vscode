import { describe, expect, it } from 'vitest';

import {
  resolveProjectCapabilitiesPayload,
  serializeProjectCapabilitiesForWebview,
} from '../core/projectCapabilityBridge';

describe('project capability bridge', () => {
  it('serializes npm capability snapshots for the dashboard webview', () => {
    const payload = serializeProjectCapabilitiesForWebview({
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
      },
      supportedCommands: ['init', 'dev'],
      unsupportedCommands: [],
    });

    expect(payload.available).toBe(true);
    expect(payload.frameworkDisplayName).toBe('FastAPI');
    expect(payload.commandMap?.init).toEqual({
      status: 'supported',
      reason: undefined,
      fleetEligible: true,
    });
  });

  it('returns unavailable payload when npm capabilities cannot be resolved', async () => {
    const payload = await resolveProjectCapabilitiesPayload('/definitely-missing-project-path');
    expect(payload).toEqual({ available: false });
  });
});

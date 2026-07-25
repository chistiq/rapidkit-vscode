import { describe, expect, it } from 'vitest';

import {
  resolveStudioAgentToolPermission,
  StudioAgentToolRegistry,
} from '../core/studioAgentToolRegistry.js';

describe('Studio Agent tool registry and permission policy', () => {
  it('registers typed tools exactly once', () => {
    const registry = new StudioAgentToolRegistry();
    const tool = {
      name: 'inspect-source',
      title: 'Inspect source',
      activity: 'inspect' as const,
      risk: 'read' as const,
      async execute() {
        return { ok: true };
      },
    };
    registry.register(tool);
    expect(registry.get('inspect-source')).toBe(tool);
    expect(() => registry.register(tool)).toThrow('unique name');
  });

  it('auto-approves governed reversible operations only in trusted Autopilot sessions', () => {
    expect(
      resolveStudioAgentToolPermission({
        level: 'autopilot',
        risk: 'guarded-write',
        workspaceTrusted: true,
      })
    ).toMatchObject({ allowed: true, requiresUserConfirmation: false });
    expect(
      resolveStudioAgentToolPermission({
        level: 'default',
        risk: 'guarded-write',
        workspaceTrusted: true,
      })
    ).toMatchObject({ allowed: false, requiresUserConfirmation: true });
    expect(
      resolveStudioAgentToolPermission({
        level: 'autopilot',
        risk: 'safe-write',
        workspaceTrusted: false,
      })
    ).toMatchObject({ allowed: false });
    expect(
      resolveStudioAgentToolPermission({
        level: 'autopilot',
        risk: 'invasive',
        workspaceTrusted: true,
      })
    ).toMatchObject({ allowed: false, requiresUserConfirmation: true });
  });
});

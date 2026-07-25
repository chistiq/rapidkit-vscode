import { describe, expect, it } from 'vitest';
import {
  resolveCreateCapabilityFromPrompt,
  resolveCreatePlannerCapability,
} from '../contracts/createPlannerCapabilities';

describe('create planner capabilities contract', () => {
  it('keeps native Workspai kits in the native lane', () => {
    expect(resolveCreatePlannerCapability({ kitId: 'fastapi.standard' })).toMatchObject({
      lane: 'native',
      status: 'available',
      canExecuteCreate: true,
      resolved: 'fastapi.standard',
    });
  });

  it('routes official frontend generators through the available official lane', () => {
    expect(resolveCreatePlannerCapability({ kitId: 'frontend.vite-react' })).toMatchObject({
      lane: 'official',
      status: 'available',
      canExecuteCreate: true,
      resolved: 'frontend.vite-react',
    });
  });

  it('routes WordPress and Laravel prompts to official planned create', () => {
    expect(resolveCreateCapabilityFromPrompt('Create a WordPress site for commerce')).toMatchObject(
      {
        lane: 'official',
        status: 'planned',
        canExecuteCreate: false,
        resolved: 'wordpress-site',
        fallbackLane: 'existing',
      }
    );

    expect(
      resolveCreateCapabilityFromPrompt('Build a Laravel project management portal')
    ).toMatchObject({
      lane: 'official',
      status: 'planned',
      canExecuteCreate: false,
      resolved: 'laravel',
      fallbackLane: 'existing',
    });
  });

  it('routes generic PHP to existing without matching unrelated words', () => {
    expect(resolveCreateCapabilityFromPrompt('Create a PHP application')).toMatchObject({
      lane: 'existing',
      status: 'available',
      canExecuteCreate: false,
      resolved: 'php',
    });

    expect(resolveCreateCapabilityFromPrompt('Build a shopping app')).toBeUndefined();
  });

  it('does not treat existing runtime signals as an adopt/import allowlist', () => {
    expect(resolveCreatePlannerCapability({ runtime: 'zig' })).toMatchObject({
      lane: 'existing',
      status: 'available',
      canExecuteCreate: false,
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  resolveCreateCapabilityFromPrompt,
  resolveCreatePlannerCapability,
} from '../contracts/createPlannerCapabilities';

describe('create planner capabilities contract', () => {
  it('keeps native RapidKit kits in the native-create lane', () => {
    expect(resolveCreatePlannerCapability({ kitId: 'fastapi.standard' })).toMatchObject({
      lane: 'native-create',
      status: 'available',
      canExecuteCreate: true,
      resolved: 'fastapi.standard',
    });

    expect(resolveCreatePlannerCapability({ kitId: 'frontend.vite-react' })).toMatchObject({
      lane: 'native-create',
      status: 'available',
      canExecuteCreate: true,
      resolved: 'frontend.vite-react',
    });
  });

  it('routes WordPress and Laravel prompts to external-create-adopt', () => {
    expect(resolveCreateCapabilityFromPrompt('Create a WordPress site for commerce')).toMatchObject(
      {
        lane: 'external-create-adopt',
        status: 'planned',
        canExecuteCreate: false,
        resolved: 'wordpress-site',
        fallbackLane: 'adopt-only',
      }
    );

    expect(
      resolveCreateCapabilityFromPrompt('Build a Laravel project management portal')
    ).toMatchObject({
      lane: 'external-create-adopt',
      status: 'planned',
      canExecuteCreate: false,
      resolved: 'laravel',
      fallbackLane: 'adopt-only',
    });
  });

  it('routes generic PHP to adopt-only without matching unrelated words', () => {
    expect(resolveCreateCapabilityFromPrompt('Create a PHP application')).toMatchObject({
      lane: 'adopt-only',
      status: 'available',
      canExecuteCreate: false,
      resolved: 'php',
    });

    expect(resolveCreateCapabilityFromPrompt('Build a shopping app')).toBeUndefined();
  });
});

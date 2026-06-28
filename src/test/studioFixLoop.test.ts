import { describe, expect, it } from 'vitest';

import {
  resolveBlockerResolutionClass,
  shouldForbidSourceCommandRerun,
} from '../core/studioBlockerResolution.js';
import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';
import { STUDIO_BLOCKER_HANDOFF_SCHEMA_VERSION } from '../contracts/studio-blocker-handoff-contract.js';

function baseHandoff(overrides: Partial<StudioBlockerHandoff> = {}): StudioBlockerHandoff {
  return {
    schemaVersion: STUDIO_BLOCKER_HANDOFF_SCHEMA_VERSION,
    cardId: 'doctor',
    cardStatus: 'fail',
    blockers: ['doctor: missing evidence'],
    artifactPath: '.rapidkit/reports/doctor-last-run.json',
    sourceCommand: 'npx rapidkit doctor --json',
    scope: 'workspace',
    blockerSignature: 'abc123456789abcd',
    ...overrides,
  };
}

describe('studio fix loop resolution', () => {
  it('returns RUN_ONCE for artifact-missing with zero command runs', () => {
    const mode = resolveBlockerResolutionClass({
      handoff: baseHandoff({
        resolutionClass: 'artifact-missing',
        commandRunCount: 0,
      }),
    });
    expect(mode).toBe('RUN_ONCE');
  });

  it('anti-loop: commandRunCount >= 1 forces FIX for unchanged signature', () => {
    const mode = resolveBlockerResolutionClass({
      handoff: baseHandoff({
        resolutionClass: 'artifact-missing',
        commandRunCount: 2,
      }),
    });
    expect(mode).toBe('FIX');
  });

  it('returns FIX for command-failed-repeat even on first open', () => {
    const mode = resolveBlockerResolutionClass({
      handoff: baseHandoff({
        blockers: ['doctor: fail — tests failed'],
        resolutionClass: 'command-failed-repeat',
        commandRunCount: 0,
      }),
    });
    expect(mode).toBe('FIX');
  });

  it('returns EXPLAIN for unresolvable-without-human', () => {
    const mode = resolveBlockerResolutionClass({
      handoff: baseHandoff({
        blockers: [],
        resolutionClass: 'unresolvable-without-human',
      }),
    });
    expect(mode).toBe('EXPLAIN');
  });

  it('forbids source command rerun after repeated failure with same signature', () => {
    expect(
      shouldForbidSourceCommandRerun({
        mode: 'FIX',
        commandRunCount: 1,
        blockerSignature: 'sig-a',
        priorSignature: 'sig-a',
      })
    ).toBe(true);
    expect(
      shouldForbidSourceCommandRerun({
        mode: 'RUN_ONCE',
        commandRunCount: 0,
        blockerSignature: 'sig-a',
        priorSignature: 'sig-a',
      })
    ).toBe(false);
  });
});

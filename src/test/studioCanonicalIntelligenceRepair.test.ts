import { describe, expect, it } from 'vitest';

import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';
import {
  shouldRunCanonicalIntelligenceRepair,
  STUDIO_CANONICAL_INTELLIGENCE_ARGS,
  STUDIO_CANONICAL_INTELLIGENCE_COMMAND,
} from '../core/studioCanonicalIntelligenceRepair.js';

function handoff(blocker: string, cardId = 'agentGrounding'): StudioBlockerHandoff {
  return {
    schemaVersion: 'studio-blocker-handoff.v1',
    cardId,
    cardStatus: 'fail',
    scope: 'workspace',
    blockers: [blocker],
    blockerSignature: blocker,
    artifactPath: '.workspai/reports/agent-customization-pack.json',
    sourceCommand: 'npx workspai workspace agent-sync --write --json',
    verifyCommand: 'npx workspai workspace agent-sync --write --json',
    studioMode: 'FIX',
  };
}

describe('Studio canonical intelligence repair routing', () => {
  it.each([
    '.workspai/reports/workspace-model-snapshot.json',
    '.workspai/reports/workspace-intelligence-history.json',
    '.workspai/reports/workspace-impact-last-run.json',
  ])('routes stale canonical artifact %s through the unified runner', (artifact) => {
    expect(shouldRunCanonicalIntelligenceRepair(handoff(`Stale report: ${artifact}`))).toBe(true);
  });

  it('does not route unrelated cards or reports through the canonical loop', () => {
    expect(shouldRunCanonicalIntelligenceRepair(handoff('Stale report: custom/report.json'))).toBe(
      false
    );
    expect(
      shouldRunCanonicalIntelligenceRepair(
        handoff('Stale report: .workspai/reports/workspace-model.json', 'readiness')
      )
    ).toBe(false);
  });

  it('uses the strict contract-backed runner for the VS Code agent surface', () => {
    expect(STUDIO_CANONICAL_INTELLIGENCE_ARGS).toEqual([
      'workspace',
      'intelligence',
      'run',
      '--for-agent',
      'vscode',
      '--strict',
      '--json',
    ]);
    expect(STUDIO_CANONICAL_INTELLIGENCE_COMMAND).toBe(
      'npx workspai workspace intelligence run --for-agent vscode --strict --json'
    );
  });
});

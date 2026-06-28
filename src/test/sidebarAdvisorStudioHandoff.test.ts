import { describe, expect, it } from 'vitest';

import {
  attachAdvisorHandoffSource,
  buildAdvisorStudioPrefill,
} from '../core/sidebarAdvisorStudioHandoff.js';
import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';

describe('sidebarAdvisorStudioHandoff (roadmap 3.24)', () => {
  it('builds read-only Studio prefill from advisor Q&A without fix commands', () => {
    const prefill = buildAdvisorStudioPrefill({
      question: 'Why is verify failing?',
      answer: 'Run doctor --fix for missing .env keys.',
    });

    expect(prefill).toContain('Advisor → Studio handoff');
    expect(prefill).toContain('Evidence contract');
    expect(prefill).toContain('Advisor role: read-only explanation');
    expect(prefill).toContain('Mutation boundary: Studio must run any fix');
    expect(prefill).toContain('Freshness: unknown - verify before use');
    expect(prefill).toContain('Why is verify failing?');
    expect(prefill).toContain('Run doctor --fix');
    expect(prefill).toContain('do not duplicate advisor analysis');
    expect(prefill).not.toContain('auto-fix');
  });

  it('carries incident artifact, blocker, freshness, and verify context into Studio', () => {
    const prefill = buildAdvisorStudioPrefill({
      question: 'What blocks release?',
      answer: 'Fix the stale contract evidence first.',
      freshnessStatus: 'stale - refresh before use',
      blockerHandoff: {
        schemaVersion: 'rapidkit-studio-blocker-handoff-v1',
        cardId: 'governance',
        cardStatus: 'fail',
        blockers: ['workspace.contract.verify is stale', 'readiness is blocked'],
        sourceCommand: 'rapidkit workspace pipeline --json',
        scope: 'workspace',
        blockerSignature: 'sig-release-1234',
        artifactPath: '.rapidkit/reports/pipeline-last-run.json',
        verifyArtifact: '.rapidkit/reports/workspace-contract-verify.json',
        verifyCommand: 'rapidkit workspace contract verify --json',
        handoffSource: 'advisor',
      },
    });

    expect(prefill).toContain('Freshness: stale - refresh before use');
    expect(prefill).toContain('Artifact: .rapidkit/reports/pipeline-last-run.json');
    expect(prefill).toContain('Verify artifact: .rapidkit/reports/workspace-contract-verify.json');
    expect(prefill).toContain('Source command: rapidkit workspace pipeline --json');
    expect(prefill).toContain('Verify command: rapidkit workspace contract verify --json');
    expect(prefill).toContain('Blocker signature: sig-release-1234');
    expect(prefill).toContain('workspace.contract.verify is stale');
    expect(prefill).toContain('readiness is blocked');
  });

  it('tags active blocker handoff with advisor source and preserves resolutionClass', () => {
    const handoff: StudioBlockerHandoff = {
      schemaVersion: 'rapidkit-studio-blocker-handoff-v1',
      cardId: 'card-1',
      cardStatus: 'fail',
      blockers: ['missing env'],
      sourceCommand: 'rapidkit workspace verify',
      scope: 'workspace',
      blockerSignature: 'sig-abc',
      resolutionClass: 'config-fixable',
      artifactPath: '.workspai/evidence/verify.json',
      verifyCommand: 'rapidkit workspace verify --json',
      handoffSource: 'dashboard',
    };

    const tagged = attachAdvisorHandoffSource(handoff);
    expect(tagged?.handoffSource).toBe('advisor');
    expect(tagged?.resolutionClass).toBe('config-fixable');
    expect(tagged?.blockerSignature).toBe('sig-abc');
  });

  it('returns undefined when no handoff is active', () => {
    expect(attachAdvisorHandoffSource(undefined)).toBeUndefined();
  });
});

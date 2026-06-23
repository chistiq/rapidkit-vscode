import { describe, expect, it } from 'vitest';

import {
  AGENT_CUSTOMIZATION_PACK_SCHEMA,
  agentCustomizationPackStatus,
  evaluateAgentCustomizationPackSynced,
  parseAgentCustomizationPack,
  summarizeAgentCustomizationPack,
} from '../core/agentCustomizationPack';

describe('agentCustomizationPack', () => {
  const samplePack = {
    schemaVersion: AGENT_CUSTOMIZATION_PACK_SCHEMA,
    generatedAt: '2026-06-23T10:00:00.000Z',
    preset: 'enterprise',
    targets: ['vscode'],
    outputInventory: [
      {
        path: '.github/agents/workspai-advisor.agent.md',
        kind: 'agent',
        status: 'written',
        required: true,
      },
      {
        path: '.github/prompts/rapidkit-diagnose.prompt.md',
        kind: 'prompt',
        status: 'written',
        required: true,
      },
    ],
    drift: {
      missingRequired: [],
      staleReports: [],
      strictViolations: [],
    },
    experimental: {
      hooksEnabled: false,
      mcpReady: true,
    },
  } as const;

  it('parses the canonical pack schema version', () => {
    expect(parseAgentCustomizationPack(samplePack)).toEqual(samplePack);
    expect(parseAgentCustomizationPack({ schemaVersion: 'legacy' })).toBeNull();
  });

  it('summarizes written surfaces and drift blockers', () => {
    expect(summarizeAgentCustomizationPack(samplePack)).toEqual({
      preset: 'enterprise',
      targets: ['vscode'],
      writtenOutputs: 2,
      totalOutputs: 2,
      hooksEnabled: false,
      mcpReady: true,
      blockers: [],
      generatedAt: '2026-06-23T10:00:00.000Z',
    });
  });

  it('evaluates walkthrough sync from pack first with legacy fallback', () => {
    expect(
      evaluateAgentCustomizationPackSynced(samplePack, { hasIndex: false, hasAgentsMd: false })
    ).toBe(true);
    expect(evaluateAgentCustomizationPackSynced(null, { hasIndex: true, hasAgentsMd: true })).toBe(
      true
    );
    expect(evaluateAgentCustomizationPackSynced(null, { hasIndex: true, hasAgentsMd: false })).toBe(
      false
    );
  });

  it('maps pack drift to dashboard card status', () => {
    const summary = summarizeAgentCustomizationPack(samplePack);
    expect(agentCustomizationPackStatus(samplePack, summary, [])).toBe('pass');
    expect(agentCustomizationPackStatus(samplePack, summary, ['index failed'])).toBe('fail');
    expect(
      agentCustomizationPackStatus(
        {
          ...samplePack,
          drift: { missingRequired: ['.github/agents/workspai-repair.agent.md'] },
        },
        summarizeAgentCustomizationPack({
          ...samplePack,
          drift: { missingRequired: ['.github/agents/workspai-repair.agent.md'] },
        }),
        []
      )
    ).toBe('fail');
  });
});

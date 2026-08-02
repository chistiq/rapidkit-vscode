import { describe, expect, it } from 'vitest';

import { DASHBOARD_EVIDENCE_CARD_IDS } from '../contracts/dashboardEvidenceCards.js';
import { DASHBOARD_COMMAND_CONTRACTS } from '../core/dashboardCommandContracts.js';
import {
  buildStudioSourceCommandForCard,
  CARD_SOURCE_SHELL,
} from '../core/studioCardSourceShell.js';
import { parseRapidkitInlineCommand } from '../core/incidentInlineCommandRunner.js';

describe('studioCardSourceShell', () => {
  it('defines an executable shell command for every evidence card', () => {
    expect(Object.keys(CARD_SOURCE_SHELL).sort()).toEqual([...DASHBOARD_EVIDENCE_CARD_IDS].sort());

    for (const cardId of DASHBOARD_EVIDENCE_CARD_IDS) {
      const command = buildStudioSourceCommandForCard(cardId);
      expect(command, cardId).toMatch(/^npx workspai /);
      expect(command, cardId).not.toContain('workspai:');
      expect(command, cardId).not.toMatch(/\bnpx workspai doctor --json\b/);

      const parsed = parseRapidkitInlineCommand(command);
      expect(parsed.error, `${cardId}: ${command}`).toBeUndefined();
      expect(parsed.rapidkitArgs?.length, cardId).toBeGreaterThan(0);
    }
  });

  it('aligns contract card shell with dashboard contract verify args', () => {
    const contractArgs = DASHBOARD_COMMAND_CONTRACTS.workspaceContractVerify.cliArgs ?? [];
    expect(CARD_SOURCE_SHELL.contract).toBe(`npx workspai ${contractArgs.join(' ')}`);
  });

  it('derives generic card shell commands from the host execution plan', () => {
    expect(CARD_SOURCE_SHELL.workspaceModel).toBe('npx workspai workspace model --json --write');
    expect(CARD_SOURCE_SHELL.workspaceVerify).toBe('npx workspai workspace verify --json');
    expect(CARD_SOURCE_SHELL.projectDoctor).toBe('npx workspai doctor project --json');
  });

  it('pins intelligence-chain from paths for diff and impact', () => {
    expect(CARD_SOURCE_SHELL.workspaceDiff).toContain('workspace diff --from');
    expect(CARD_SOURCE_SHELL.workspaceImpact).toContain('workspace impact --from');
    expect(CARD_SOURCE_SHELL.workspaceVerify).toContain('workspace verify');
  });

  it('uses deterministic CI mode for bootstrap evidence refreshes', () => {
    expect(CARD_SOURCE_SHELL.bootstrap).toBe('npx workspai bootstrap --ci --json');
  });

  it('uses an explicit archive output path for Studio archive refreshes', () => {
    expect(CARD_SOURCE_SHELL.archive).toBe(
      'npx workspai workspace export --output team-workspace.workspai-archive.zip --json'
    );
  });

  it('uses the dashboard evidence share bundle path for Studio share refreshes', () => {
    expect(CARD_SOURCE_SHELL.share).toBe(
      'npx workspai workspace share --output .workspai/reports/share-bundle.json --json'
    );
  });
});

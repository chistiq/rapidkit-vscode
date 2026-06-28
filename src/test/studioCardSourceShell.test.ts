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
      expect(command, cardId).toMatch(/^npx rapidkit /);
      expect(command, cardId).not.toContain('workspai:');
      expect(command, cardId).not.toMatch(/\bnpx rapidkit doctor --json\b/);

      const parsed = parseRapidkitInlineCommand(command);
      expect(parsed.error, `${cardId}: ${command}`).toBeUndefined();
      expect(parsed.rapidkitArgs?.length, cardId).toBeGreaterThan(0);
    }
  });

  it('aligns contract card shell with dashboard contract verify args', () => {
    const contractArgs = DASHBOARD_COMMAND_CONTRACTS.workspaceContractVerify.cliArgs ?? [];
    expect(CARD_SOURCE_SHELL.contract).toBe(`npx rapidkit ${contractArgs.join(' ')}`);
  });

  it('pins intelligence-chain from paths for diff and impact', () => {
    expect(CARD_SOURCE_SHELL.workspaceDiff).toContain('workspace diff --from');
    expect(CARD_SOURCE_SHELL.workspaceImpact).toContain('workspace impact --from');
    expect(CARD_SOURCE_SHELL.workspaceVerify).toContain('workspace verify');
  });
});

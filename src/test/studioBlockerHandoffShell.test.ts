import { describe, expect, it } from 'vitest';

import { DASHBOARD_COMMAND_CONTRACTS } from '../core/dashboardCommandContracts.js';
import { CARD_SOURCE_SHELL } from '../core/studioBlockerHandoffBuilder.js';

describe('studio blocker handoff source shell', () => {
  it('matches dashboard terminal CLI args for analyze and pipeline', () => {
    expect(CARD_SOURCE_SHELL.analyze).toBe(
      `npx rapidkit ${DASHBOARD_COMMAND_CONTRACTS.workspaceAnalyze.cliArgs?.join(' ')}`
    );
    expect(CARD_SOURCE_SHELL.pipeline).toBe(
      `npx rapidkit ${DASHBOARD_COMMAND_CONTRACTS.workspacePipeline.cliArgs?.join(' ')}`
    );
  });

  it('pins doctor, verify, impact, and explain shells for Studio handoff', () => {
    expect(CARD_SOURCE_SHELL.doctor).toBe('npx rapidkit doctor workspace --json');
    expect(CARD_SOURCE_SHELL.projectDoctor).toBe('npx rapidkit doctor project --json');
    expect(CARD_SOURCE_SHELL.workspaceVerify).toContain('workspace verify');
    expect(CARD_SOURCE_SHELL.workspaceVerify).not.toContain('--write');
    expect(CARD_SOURCE_SHELL.workspaceImpact).toContain('workspace impact');
    expect(CARD_SOURCE_SHELL.workspaceImpact).not.toContain('--write');
    expect(CARD_SOURCE_SHELL.contract).toBe(
      `npx rapidkit ${DASHBOARD_COMMAND_CONTRACTS.workspaceContractVerify.cliArgs?.join(' ')}`
    );
    expect(CARD_SOURCE_SHELL.workspaceExplain).toContain('workspace explain release-blocked');
  });
});

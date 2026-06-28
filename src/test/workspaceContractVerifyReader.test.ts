import { describe, expect, it } from 'vitest';

import {
  isWorkspaceContractVerifyEvidence,
  WORKSPACE_CONTRACT_VERIFY_SCHEMA_VERSION,
} from '../core/workspaceContractVerifyReader.js';

describe('workspaceContractVerifyReader', () => {
  it('rejects partial contract verify payloads without schemaVersion', () => {
    expect(
      isWorkspaceContractVerifyEvidence({
        generatedAt: new Date().toISOString(),
        status: 'passed',
      })
    ).toBe(false);
  });

  it('accepts npm-shaped contract verify evidence', () => {
    expect(
      isWorkspaceContractVerifyEvidence({
        schemaVersion: WORKSPACE_CONTRACT_VERIFY_SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        status: 'passed',
        contractPath: '.rapidkit/workspace.contract.json',
        projectCount: 1,
        checks: [{ id: 'projects', status: 'passed', message: 'ok' }],
        violations: [],
      })
    ).toBe(true);
  });
});

import path from 'path';
import { describe, expect, it } from 'vitest';

import { validateEnterpriseValidationMatrix } from '../../scripts/enterprise-validation-matrix.mjs';
import matrix from '../../releases/enterprise-validation-matrix.json';

const repoRoot = path.resolve(__dirname, '..', '..');

describe('enterprise validation matrix', () => {
  it('maps every P0/P1 release scenario to source, tests, or CI evidence', () => {
    const result = validateEnterpriseValidationMatrix(repoRoot);

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.scenarioCount).toBeGreaterThanOrEqual(10);
  });

  it('keeps the New-P P2 gates in the release validation matrix', () => {
    const scenarioIds = matrix.scenarios.map((scenario) => scenario.id);

    expect(scenarioIds).toEqual(
      expect.arrayContaining([
        'dashboard.home.attention_rank',
        'dashboard.first_artifact.celebration',
        'studio.verify.closure_return',
        'statusbar.ambient_truth',
        'repair.guided_default.keyboard',
        'performance.evidence_refresh_coalesced',
        'performance.remediation_plan_cache',
        'dashboard.archive.paginated',
        'governance.activation_and_command_surface',
      ])
    );
  });
});

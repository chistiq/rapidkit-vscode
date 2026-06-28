import path from 'path';
import { describe, expect, it } from 'vitest';

import { validateEnterpriseValidationMatrix } from '../../scripts/enterprise-validation-matrix.mjs';

const repoRoot = path.resolve(__dirname, '..', '..');

describe('enterprise validation matrix', () => {
  it('maps every P0/P1 release scenario to source, tests, or CI evidence', () => {
    const result = validateEnterpriseValidationMatrix(repoRoot);

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.scenarioCount).toBeGreaterThanOrEqual(10);
  });
});

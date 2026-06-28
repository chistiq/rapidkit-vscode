import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../..');
const npmContract = path.resolve(
  repoRoot,
  '..',
  'rapidkit-npm',
  'contracts',
  'agent-customization-pack.v1.json'
);
const vscodeContract = path.resolve(repoRoot, 'contracts', 'agent-customization-pack.v1.json');
const vscodeSrcContract = path.resolve(
  repoRoot,
  'src',
  'contracts',
  'agent-customization-pack.v1.json'
);

describe('agent-customization-pack contract parity', () => {
  it('keeps extension mirrors aligned with rapidkit-npm', () => {
    expect(fs.existsSync(npmContract)).toBe(true);
    const npmJson = JSON.parse(fs.readFileSync(npmContract, 'utf8'));
    const vscodeJson = JSON.parse(fs.readFileSync(vscodeContract, 'utf8'));
    const srcJson = JSON.parse(fs.readFileSync(vscodeSrcContract, 'utf8'));

    expect(vscodeJson).toEqual(npmJson);
    expect(srcJson).toEqual(npmJson);
    expect(npmJson.outputKinds).toContain('hook');
    expect(npmJson.outputKinds).toContain('mcp-design');
    expect(npmJson.outputKinds).toContain('skills-index');
    expect(npmJson.outputKinds).toContain('operational-skill');
    expect(npmJson.standardAnswerContract).toEqual([
      'Scope',
      'Evidence',
      'Diagnosis',
      'Fix Plan',
      'Run',
      'Verify',
      'Assumptions',
    ]);
  });
});

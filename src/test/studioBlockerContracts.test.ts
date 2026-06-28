import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');
const npmContractsRoot = path.resolve(repoRoot, '..', 'rapidkit-npm', 'contracts');

const PHASE3_CONTRACTS = [
  'workspace-intelligence/blocker-resolution.v1.json',
  'workspace-intelligence/studio-blocker-handoff.v1.json',
];

describe('Phase 3 studio contracts parity', () => {
  it('mirrors blocker-resolution and studio-blocker-handoff JSON to extension contracts', () => {
    for (const contractPath of PHASE3_CONTRACTS) {
      const npmPath = path.join(npmContractsRoot, contractPath);
      const extensionPath = path.join(repoRoot, 'contracts', contractPath);
      expect(fs.existsSync(npmPath), npmPath).toBe(true);
      expect(fs.existsSync(extensionPath), extensionPath).toBe(true);
      expect(JSON.parse(fs.readFileSync(extensionPath, 'utf8'))).toEqual(
        JSON.parse(fs.readFileSync(npmPath, 'utf8'))
      );
    }
  });

  it('ships typed handoff + resolution modules in extension host', () => {
    const resolution = fs.readFileSync(
      path.join(repoRoot, 'src/core/studioBlockerResolution.ts'),
      'utf8'
    );
    const handoffBuilder = fs.readFileSync(
      path.join(repoRoot, 'src/core/studioBlockerHandoffBuilder.ts'),
      'utf8'
    );
    expect(resolution).toContain('resolveBlockerResolutionClass');
    expect(resolution).toContain('shouldForbidSourceCommandRerun');
    expect(handoffBuilder).toContain('buildStudioBlockerHandoff');
    expect(handoffBuilder).toContain('pickStudioFixActionId');
    expect(
      fs.readFileSync(path.join(repoRoot, 'src/core/studioBlockerFixRouting.ts'), 'utf8')
    ).toContain('STUDIO_CARD_FIX_ROUTING');
  });
});

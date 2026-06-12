import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('legacy AIIncidentStudio archive removal', () => {
  const repoRoot = path.resolve(__dirname, '../..');

  it('removes the monolith from production paths and keeps contracts in lib tests', () => {
    const appSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/App.tsx'), 'utf8');
    const indexSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/index.ts'),
      'utf8'
    );
    const contractsTestSource = fs.readFileSync(
      path.join(repoRoot, 'src/test/incidentStudioPresentationContracts.test.ts'),
      'utf8'
    );

    expect(
      fs.existsSync(path.join(repoRoot, 'webview-ui/src/components/AIIncidentStudio.tsx'))
    ).toBe(false);
    expect(
      fs.existsSync(path.join(repoRoot, 'webview-ui/src/components/_legacy/AIIncidentStudio.tsx'))
    ).toBe(false);

    expect(appSource).not.toContain('AIIncidentStudio');
    expect(indexSource).not.toContain('designTokens');
    expect(contractsTestSource).toContain('presentation contracts (lib parity)');
    expect(contractsTestSource).not.toContain('_legacy/AIIncidentStudio');
  });
});

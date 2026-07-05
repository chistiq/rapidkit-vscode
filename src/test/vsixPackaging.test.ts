import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('VSIX packaging exclusions', () => {
  it('excludes local test artifacts and dev-only trees from shipped VSIX', () => {
    const vscodeignore = read('.vscodeignore');

    for (const pattern of [
      '!dist/**',
      'test-results/**',
      '**/test/**',
      '**/*.map',
      'src/**',
      'scripts/**',
      'coverage/**',
    ]) {
      expect(vscodeignore, pattern).toContain(pattern);
    }
  });

  it('requires production build before vsce package', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.['vscode:prepublish']).toBe('npm run build');
    expect(packageJson.scripts?.prepackage).toBe('npm run build');
    expect(packageJson.scripts?.build).toContain('--production');
    expect(packageJson.scripts?.['package:ci']).toBe(
      'npm run build && vsce package --no-dependencies --out rapidkit-vscode-${npm_package_version}.vsix'
    );
    expect(packageJson.scripts?.['smoke:vsix-artifact']).toBe(
      'node scripts/inspect-vsix-artifact.mjs --artifact rapidkit-vscode-${npm_package_version}.vsix'
    );
    expect(packageJson.scripts?.['smoke:vsix-electron']).toBe(
      'node scripts/vsix-electron-smoke.mjs --artifact rapidkit-vscode-${npm_package_version}.vsix'
    );
    expect(packageJson.scripts?.['publish:guard']).toBe(
      'node scripts/guard-vsix-publish.mjs --artifact rapidkit-vscode-${npm_package_version}.vsix'
    );
    expect(packageJson.scripts?.['publish:ci']).toBe(
      'npm run publish:guard && vsce publish --packagePath rapidkit-vscode-${npm_package_version}.vsix'
    );
    expect(packageJson.scripts?.['release:enterprise-matrix']).toBe(
      'node scripts/enterprise-validation-matrix.mjs'
    );
    expect(packageJson.scripts?.['release:audit-gate']).toBe(
      'node scripts/npm-audit-gate.mjs --level high'
    );
    expect(packageJson.scripts?.['soak:studio-reload']).toBe('node scripts/studio-reload-soak.mjs');
    expect(packageJson.scripts?.publish).toBe('npm run publish:ci');
    expect(packageJson.scripts?.publish).not.toBe('vsce publish');
  });

  it('does not compile test helpers into tsc output tree', () => {
    const tsconfig = JSON.parse(read('tsconfig.json')) as { exclude?: string[] };

    expect(tsconfig.exclude).toEqual(expect.arrayContaining(['**/*.test.ts', 'src/test/**']));
  });

  it('uses typecheck-only pretest so vitest does not leave unbundled dist artifacts', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.pretest).toBe('npm run typecheck && npm run lint');
    expect(packageJson.scripts?.pretest).not.toContain('compile');
  });

  it('inspects the built VSIX artifact for required runtime assets and denied dev files', () => {
    const script = read('scripts/inspect-vsix-artifact.mjs');
    const electronSmokeScript = read('scripts/vsix-electron-smoke.mjs');
    const electronSmokeTests = read('scripts/vsix-electron-smoke-tests.cjs');

    for (const required of [
      'extension/dist/extension.js',
      'extension/dist/webview.js',
      'extension/dist/webview.css',
      'extension/dist/sidebar.js',
      'extension/dist/sidebar.css',
      'extension/contracts/runtime-command-surface.v1.json',
      'extension/contracts/extension-cli-compatibility.v1.json',
      'extension/contracts/workspace-intelligence/workspace-verify.v1.json',
      'extension/media/icons/icon.png',
    ]) {
      expect(script, required).toContain(required);
    }

    for (const denied of [
      '^extension\\/src\\/',
      '^extension\\/scripts\\/',
      '^extension\\/webview-ui\\/',
      'ALLOWED_NODE_MODULE_METADATA',
      '\\.map$',
    ]) {
      expect(script, denied).toContain(denied);
    }

    expect(electronSmokeScript).toContain("downloadAndUnzipVSCode } from '@vscode/test-electron'");
    expect(electronSmokeScript).toContain(
      "version: process.env.WORKSPAI_VSCODE_TEST_VERSION || '1.100.0'"
    );
    expect(electronSmokeScript).toContain('delete childEnv.ELECTRON_RUN_AS_NODE');
    expect(electronSmokeScript).toContain('pathToFileURL(workspacePath).toString()');
    expect(electronSmokeScript).toContain('function runVsCodeSmoke');
    expect(electronSmokeScript).toContain('`--extensionDevelopmentPath=${extensionDir}`');
    expect(electronSmokeScript).toContain('`--extensionTestsPath=${extensionTestsPath}`');
    expect(electronSmokeScript).toContain('--disable-workspace-trust');
    expect(electronSmokeScript).toContain('--folder-uri');
    expect(electronSmokeScript).toContain('workspace-model.json');
    expect(electronSmokeScript).toContain('workspace-explain-last-run.json');
    expect(electronSmokeScript).toContain('workspace-why-last-run.json');
    expect(electronSmokeScript).toContain('workspace-trace-last-run.json');
    expect(electronSmokeTests).toContain('workspai.openDashboardSection');
    expect(electronSmokeTests).toContain('workspai.openIncidentStudio');
    expect(electronSmokeTests).toContain('workspai.workspaceExplain');
    expect(electronSmokeTests).toContain("section: 'operate'");
    expect(electronSmokeTests).toContain("operateZone: 'intelligence'");
    expect(electronSmokeTests).toContain("section: 'evidence'");
  });

  it('wires CI to build, inspect, and upload the exact VSIX artifact', () => {
    const workflow = read('.github/workflows/extension-smoke-matrix.yml');

    expect(workflow).toContain('vsix-package-smoke:');
    expect(workflow).toContain('needs: [contract-parity-gate, smoke]');
    expect(workflow).toContain('Enterprise validation matrix');
    expect(workflow).toContain('npm run release:enterprise-matrix');
    expect(workflow).toContain('npm run package:ci');
    expect(workflow).toContain('npm run smoke:vsix-artifact');
    expect(workflow).toContain('actions/upload-artifact@v4');
    expect(workflow).toContain('path: rapidkit-vscode-*.vsix');
    expect(workflow).toContain('run_electron_smoke:');
    expect(workflow).toContain('run_audit_gate:');
    expect(workflow).toContain('npm run release:audit-gate');
    expect(workflow).toContain('vsix-electron-smoke:');
    expect(workflow).toContain(
      "if: github.event_name == 'workflow_dispatch' && inputs.run_electron_smoke == true"
    );
    expect(workflow).toContain('actions/download-artifact@v4');
    expect(workflow).toContain('xvfb-run -a npm run smoke:vsix-electron');
  });

  it('gates marketplace publish on the inspected VSIX artifact and npm target version', () => {
    const workflow = read('.github/workflows/release-extension.yml');
    const guard = read('scripts/guard-vsix-publish.mjs');

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('smoke_run_id:');
    expect(workflow).toContain('commit_sha:');
    expect(workflow).toContain('rapidkit_npm_version:');
    expect(workflow).toContain('npm view rapidkit@${{ inputs.rapidkit_npm_version }} version');
    expect(workflow).toContain('actions/download-artifact@v4');
    expect(workflow).toContain('name: workspai-vsix-${{ inputs.commit_sha }}');
    expect(workflow).toContain('run-id: ${{ inputs.smoke_run_id }}');
    expect(workflow).toContain('npm run smoke:vsix-artifact');
    expect(workflow).toContain('npm run publish:guard');
    expect(workflow).toContain("if: inputs.publish_target == 'marketplace'");
    expect(workflow).toContain('npm run publish:ci');
    expect(workflow).not.toContain('vsce publish\n');

    expect(guard).toContain('WORKSPAI_EXPECTED_COMMIT_SHA');
    expect(guard).toContain('WORKSPAI_VSIX_ARTIFACT_NAME');
    expect(guard).toContain('workspai-vsix-${expectedCommit}');
    expect(guard).toContain('inspect-vsix-artifact.mjs');
    expect(guard).toContain('Publishing requires CI=true');
  });
});

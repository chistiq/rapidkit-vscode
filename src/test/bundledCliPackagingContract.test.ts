import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

describe('bundled CLI packaging contract', () => {
  it('pins the embedded CLI dependency to the exact verified release-policy version', () => {
    const packageJson = readJson('package.json');
    const lock = readJson('package-lock.json');
    const policy = readJson('contracts/extension-cli-release-policy.v1.json');

    expect(packageJson.devDependencies?.workspai).toBe(policy.verifiedCliVersion);
    expect(lock.packages?.['node_modules/workspai']?.version).toBe(policy.verifiedCliVersion);
    expect(packageJson.scripts?.['build:cli-runtime']).toBe(
      'node scripts/build-bundled-cli-runtime.mjs'
    );
    expect(packageJson.scripts?.['sync:cli-local']).toBe(
      'node scripts/sync-local-cli-candidate.mjs'
    );
    expect(packageJson.scripts?.['build:release']).toContain('esbuild-base:release');
    expect(packageJson.scripts?.['build:release']).toContain('check:cli-release-contracts');
    expect(packageJson.scripts?.['check:cli-release-contracts']).toContain(
      '--release-package --require-canonical'
    );
    expect(packageJson.scripts?.package).toBe('node scripts/package-vsix-variants.mjs');
    expect(packageJson.scripts?.['package:release']).toContain('--release-only');
    expect(packageJson.scripts?.['package:local']).toContain('--local-only');
    expect(packageJson.scripts?.['package:ci']).toContain('--release-only');
    const packager = fs.readFileSync(
      path.join(repoRoot, 'scripts', 'package-vsix-variants.mjs'),
      'utf8'
    );
    const runtimeBuilder = fs.readFileSync(
      path.join(repoRoot, 'scripts', 'build-bundled-cli-runtime.mjs'),
      'utf8'
    );
    expect(packager).toContain('withoutEmbeddedCliRuntime');
    expect(packager).toContain('moveDirectory');
    expect(packager).toContain("error.code === 'EXDEV'");
    expect(packager).toContain('.workspai-runtime-packaging-stash');
    expect(packager).toContain('restoreReleaseCliRuntime');
    expect(packager).toContain("['scripts/build-bundled-cli-runtime.mjs', '--release']");
    expect(packager).toContain('withPinnedReleaseContracts');
    const prepublish = fs.readFileSync(
      path.join(repoRoot, 'scripts', 'vscode-prepublish.mjs'),
      'utf8'
    );
    expect(prepublish).toContain("channel === 'release'");
    expect(prepublish).toContain("path.join(repositoryRoot, 'dist', 'workspai-runtime')");
    expect(prepublish).toContain('fs.rmSync');
    expect(packager).toContain("'--release-package'");
    expect(packager).toContain('restoreContractMirrors(snapshot)');
    expect(packager).toContain("new AggregateError(failures, 'One or more VSIX variants failed");
    expect(packageJson.scripts?.['esbuild-base']).toContain('build:cli-runtime');
    expect(packageJson.scripts?.['package:ci']).toContain('smoke:cli-first-run');
    expect(runtimeBuilder).toContain(
      "const RUNTIME_EXTERNAL_DEPENDENCIES = Object.freeze(['fsevents']);"
    );
    expect(runtimeBuilder).toContain('external: RUNTIME_EXTERNAL_DEPENDENCIES');
    expect(runtimeBuilder).toContain('!RUNTIME_EXTERNAL_DEPENDENCIES.includes(name)');
  });

  it('requires the runtime, integrity manifest, and license notices in the VSIX gate', () => {
    const inspector = fs.readFileSync(
      path.join(repoRoot, 'scripts', 'inspect-vsix-artifact.mjs'),
      'utf8'
    );
    const vscodeIgnore = fs.readFileSync(path.join(repoRoot, '.vscodeignore'), 'utf8');

    expect(vscodeIgnore).toContain('!dist/**');
    expect(vscodeIgnore).toContain('.workspai-cli-local.json');
    expect(inspector).toContain('extension/dist/workspai-runtime/manifest.json');
    expect(inspector).toContain('extension/dist/workspai-runtime/launcher.cjs');
    expect(inspector).toContain('extension/dist/workspai-runtime/dist/index.mjs');
    expect(inspector).toContain('workspai-vscode-official-cli-closure.v1');
    expect(inspector).toContain('Release VSIX must not embed a second Workspai CLI runtime.');
    expect(inspector).toContain('workspai-vscode-bundled-cli-runtime.v1');
    expect(inspector).toContain('runtimeManifest.channel !== options.channel');
    expect(inspector).toContain("expectedDistribution = options.channel === 'release'");
    expect(inspector).toContain('runtimeManifest.files');
    expect(inspector).toContain("createHash('sha256')");
    expect(inspector).toContain('exactly match its manifest');
    expect(inspector).toContain('^extension\\/\\.workspai-cli-local\\.json$');
  });

  it('runs an isolated no-npx first-run workspace smoke before packaging', () => {
    const packageJson = readJson('package.json');
    const smoke = fs.readFileSync(
      path.join(repoRoot, 'scripts', 'smoke-bundled-cli-first-run.mjs'),
      'utf8'
    );

    expect(packageJson.scripts?.['smoke:cli-first-run']).toBe(
      'node scripts/smoke-bundled-cli-first-run.mjs'
    );
    expect(smoke).toContain("'first-run-smoke-wsp'");
    expect(smoke).toContain("'.workspai-workspace'");
    expect(smoke).toContain("'.workspai', 'workspace.contract.json'");
    expect(smoke).toContain("'.npm', '_npx'");
  });
});

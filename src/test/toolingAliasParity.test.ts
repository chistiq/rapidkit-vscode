import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

describe('tooling alias parity', () => {
  it('keeps webview build, TypeScript, and Vitest aliases aligned', () => {
    const esbuildSource = read('webview-ui/esbuild.js');
    const webviewTsconfig = JSON.parse(read('webview-ui/tsconfig.json')) as {
      compilerOptions?: { paths?: Record<string, string[]> };
    };
    const vitestConfig = read('vitest.config.ts');

    expect(esbuildSource).toContain("'@': path.resolve(__dirname, './src')");
    expect(esbuildSource).toContain(
      "'@workspai-contracts': path.resolve(__dirname, '../src/contracts')"
    );

    expect(webviewTsconfig.compilerOptions?.paths?.['@/*']).toEqual(['./src/*']);
    expect(webviewTsconfig.compilerOptions?.paths?.['@workspai-contracts/*']).toEqual([
      '../src/contracts/*',
    ]);

    expect(vitestConfig).toContain("'@': path.resolve(__dirname, 'webview-ui/src')");
    expect(vitestConfig).toContain(
      "'@workspai-contracts': path.resolve(__dirname, 'src/contracts')"
    );
  });
});

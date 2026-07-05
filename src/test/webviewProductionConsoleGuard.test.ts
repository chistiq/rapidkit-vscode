import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '../..');

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      return listFiles(fullPath);
    }
    return fullPath;
  });
}

describe('webview production console guard', () => {
  it('drops console and debugger from production webview bundles', () => {
    const esbuild = read('webview-ui/esbuild.js');

    expect(esbuild).toContain('const production = process.argv.includes');
    expect(esbuild).toContain('...(production && {');
    expect(esbuild).toContain("drop: ['console', 'debugger']");
    expect(esbuild).toContain("legalComments: 'none'");
  });

  it('keeps operator-facing webview failure surfaces free of console dependencies', () => {
    for (const relativePath of [
      'webview-ui/src/sidebar/StudioBlockerChrome.tsx',
      'webview-ui/src/sidebar/SecondarySidebar.tsx',
      'webview-ui/src/lib/studioVerifyFailure.ts',
      'webview-ui/src/lib/sidebarStudioAuditState.ts',
      'webview-ui/src/lib/sidebarStudioReturnState.ts',
      'webview-ui/src/components/EvidenceAttentionInbox.tsx',
      'webview-ui/src/components/DashboardRepairFlow.tsx',
      'webview-ui/src/components/EvidenceCardActions.tsx',
    ]) {
      expect(read(relativePath), relativePath).not.toMatch(/\bconsole\./);
    }
  });

  it('keeps webview console usage limited to explicit diagnostic files before production drop', () => {
    const allowedConsoleFiles = new Set([
      'webview-ui/src/App.tsx',
      'webview-ui/src/components/WebviewErrorBoundary.tsx',
      'webview-ui/src/lib/chatBrainDebug.ts',
    ]);
    const files = listFiles(path.join(repoRoot, 'webview-ui/src')).filter((filePath) =>
      /\.(ts|tsx)$/.test(filePath)
    );
    const offenders = files
      .map((filePath) => path.relative(repoRoot, filePath))
      .filter((relativePath) => /\bconsole\./.test(read(relativePath)))
      .filter((relativePath) => !allowedConsoleFiles.has(relativePath));

    expect(offenders).toEqual([]);
  });
});

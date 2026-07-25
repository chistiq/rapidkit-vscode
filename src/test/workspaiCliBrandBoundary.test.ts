import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function productionFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') {
      continue;
    }
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...productionFiles(target));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
      files.push(target);
    }
  }
  return files;
}

describe('Workspai CLI brand boundary', () => {
  it('does not regress user-facing npm commands to the legacy rapidkit package', () => {
    const roots = [path.join(repoRoot, 'src'), path.join(repoRoot, 'webview-ui', 'src')];
    const violations: string[] = [];
    for (const filePath of roots.flatMap(productionFiles)) {
      const source = fs.readFileSync(filePath, 'utf8');
      if (
        /\bnpx rapidkit\b|npm (?:i|install) -g rapidkit\b|(?<!legacy [`'"(])\brapidkit workspace\b/.test(
          source
        )
      ) {
        violations.push(path.relative(repoRoot, filePath));
      }
    }
    expect(violations).toEqual([]);
  });
});

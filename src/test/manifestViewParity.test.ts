import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

describe('extension manifest view parity', () => {
  it('backs every contributed Workspai view with one registered provider', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      contributes?: { views?: Record<string, Array<{ id: string }>> };
    };
    const extension = read('src/extension.ts');
    const contributedViews = Object.values(packageJson.contributes?.views ?? {})
      .flat()
      .map((view) => view.id)
      .sort();
    const registeredViews = [
      ...Array.from(
        extension.matchAll(/register(?:TreeDataProvider|WebviewViewProvider)\(\s*['"]([^'"]+)['"]/g)
      ).map((match) => match[1]),
      ...Array.from(extension.matchAll(/createTreeView\(\s*['"]([^'"]+)['"]/g)).map(
        (match) => match[1]
      ),
      'rapidkitActionsWebview',
      'workspaiSecondarySidebar',
    ].sort();

    expect([...new Set(registeredViews)].sort()).toEqual(contributedViews);
  });
});

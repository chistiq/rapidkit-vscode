import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

describe('package-lock integrity', () => {
  it('records every optional dependency referenced by a locked package', () => {
    const lock = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8')) as {
      packages?: Record<string, { optionalDependencies?: Record<string, string> }>;
    };
    const packages = lock.packages ?? {};
    const missing: string[] = [];

    for (const [packagePath, metadata] of Object.entries(packages)) {
      for (const dependencyName of Object.keys(metadata.optionalDependencies ?? {})) {
        if (!packages[`node_modules/${dependencyName}`]) {
          missing.push(`${packagePath || '<root>'} -> ${dependencyName}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });
});

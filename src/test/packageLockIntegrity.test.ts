import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

describe('package-lock integrity', () => {
  it('routes every CI clean install through the package manager pinned by package.json', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
    ) as { packageManager?: string };
    const workflowDirectory = path.join(repoRoot, '.github', 'workflows');
    const workflowFiles = fs
      .readdirSync(workflowDirectory)
      .filter((fileName) => fileName.endsWith('.yml') || fileName.endsWith('.yaml'));
    const directInstallViolations: string[] = [];

    expect(packageJson.packageManager).toMatch(/^npm@\d+\.\d+\.\d+$/);

    for (const fileName of workflowFiles) {
      const source = fs.readFileSync(path.join(workflowDirectory, fileName), 'utf8');
      if (/^\s*run:\s+npm ci\s*$/mu.test(source)) {
        directInstallViolations.push(fileName);
      }
    }

    expect(directInstallViolations).toEqual([]);
  });

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

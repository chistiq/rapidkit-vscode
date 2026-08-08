import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  executeCliOwnedPatchRepair,
  verifyInstalledWorkspaiRepairCli,
} from '../core/workspaceRepairCliClient.js';

const canonicalPackageRoot = process.env.WORKSPAI_CLI_PACKAGE_PATH?.trim();

describe.skipIf(!canonicalPackageRoot)('canonical CLI repair consumer integration', () => {
  it('runtime-verifies the built CLI executable and repair protocol', async () => {
    const packageRoot = path.resolve(canonicalPackageRoot!);
    const manifestPath = path.join(packageRoot, 'package.json');
    const manifest = (await fs.readJson(manifestPath)) as { name: string; version: string };
    const workspacePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'workspai-repair-cli-integration-')
    );
    try {
      await fs.writeFile(path.join(workspacePath, '.workspai-workspace'), 'name=integration\n');
      const resolved = await verifyInstalledWorkspaiRepairCli({
        workspacePath,
        installedPackages: [
          {
            name: manifest.name,
            version: manifest.version,
            manifestPath,
            source: 'workspace',
          },
        ],
      });

      expect(resolved.version).toBe(manifest.version);
      expect(resolved.protocolVersion).toBe('workspai.workspace-repair-consumer-protocol.v1');
      expect(resolved.entrypoint).toBe(path.join(packageRoot, 'dist', 'index.js'));
    } finally {
      await fs.remove(workspacePath);
    }
  });

  it('executes one real extension-to-CLI repair through preflight, diff, producer, and verify', async () => {
    const packageRoot = path.resolve(canonicalPackageRoot!);
    const manifestPath = path.join(packageRoot, 'package.json');
    const manifest = (await fs.readJson(manifestPath)) as { name: string; version: string };
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-repair-cli-e2e-'));
    const before = '# Integration workspace\n';
    const after = '# Integration workspace\n\nRepair engine verified.\n';
    try {
      await fs.writeFile(path.join(workspacePath, '.workspai-workspace'), 'profile=minimal\n');
      await fs.writeFile(path.join(workspacePath, 'README.md'), before);
      const progress: string[] = [];
      const result = await executeCliOwnedPatchRepair({
        workspacePath,
        cardId: 'workspaceModel',
        blockerSignature: 'workspace-model:e2e:missing-guidance',
        patches: [
          {
            relativePath: 'README.md',
            baseSha256: createHash('sha256').update(before).digest('hex'),
            patchedContent: after,
          },
        ],
        approvedBy: 'extension-e2e',
        installedPackages: [
          {
            name: manifest.name,
            version: manifest.version,
            manifestPath,
            source: 'workspace',
          },
        ],
        reportProgress: (entry) => {
          progress.push(`${entry.phase}:${entry.state ?? ''}`);
        },
      });

      expect(result.transaction.state).toBe('closed');
      expect(result.transaction.stages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'target-precondition', status: 'passed' }),
          expect.objectContaining({ id: 'target-producer-verify', status: 'passed' }),
          expect.objectContaining({ id: 'canonical-verify', status: 'passed' }),
        ])
      );
      expect(result.changedPaths).toEqual(['README.md']);
      expect(result.fileChanges).toEqual([
        expect.objectContaining({ relativePath: 'README.md', stale: false, binary: false }),
      ]);
      expect(progress.some((entry) => entry.startsWith('execute:'))).toBe(true);
      expect(await fs.readFile(path.join(workspacePath, 'README.md'), 'utf8')).toBe(after);
    } finally {
      await fs.remove(workspacePath);
    }
  }, 120_000);
});

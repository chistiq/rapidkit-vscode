import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  applyBootstrapComplianceRemediation,
  isBootstrapComplianceHandoff,
  normalizeBootstrapComplianceCommand,
} from '../core/bootstrapComplianceRemediation.js';

describe('bootstrap compliance remediation', () => {
  let workspacePath: string;

  beforeEach(async () => {
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-bootstrap-fix-'));
  });

  afterEach(async () => {
    await fs.remove(workspacePath);
  });

  it('normalizes bootstrap verify commands to deterministic CI JSON mode', () => {
    expect(normalizeBootstrapComplianceCommand('npx rapidkit bootstrap --json')).toBe(
      'npx rapidkit bootstrap --ci --json'
    );
    expect(normalizeBootstrapComplianceCommand('rapidkit bootstrap')).toBe(
      'rapidkit bootstrap --ci --json'
    );
    expect(normalizeBootstrapComplianceCommand('npx rapidkit bootstrap --ci --json')).toBe(
      'npx rapidkit bootstrap --ci --json'
    );
    expect(normalizeBootstrapComplianceCommand('npx rapidkit doctor workspace --json')).toBe(
      'npx rapidkit doctor workspace --json'
    );
  });

  it('recognizes bootstrap compliance handoffs by deterministic enterprise blockers', () => {
    expect(
      isBootstrapComplianceHandoff({
        cardId: 'bootstrap',
        cardLabel: 'Bootstrap compliance',
        blockers: [],
      })
    ).toBe(false);
    expect(
      isBootstrapComplianceHandoff({
        cardId: 'unknown',
        cardLabel: 'Other',
        blockers: [
          'profile.enterprise.mirror-config: enterprise profile requires .rapidkit/mirror-config.json.',
        ],
      })
    ).toBe(true);
  });

  it('does not claim a source fix for profile mismatch blockers', async () => {
    const result = await applyBootstrapComplianceRemediation({
      workspacePath,
      handoff: {
        cardId: 'bootstrap',
        cardLabel: 'Bootstrap compliance',
        sourceCommand: 'npx rapidkit bootstrap --ci --json',
        blockers: [
          'profile.node-only: node-only profile mismatch: detected runtimes [node, python].',
        ],
      },
    });

    expect(result.handled).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.appliedFixes).toEqual([]);
  });

  it('creates missing enterprise baseline files without invoking AI', async () => {
    const result = await applyBootstrapComplianceRemediation({
      workspacePath,
      generatedAt: '2026-07-02T00:00:00.000Z',
      handoff: {
        cardId: 'bootstrap',
        cardLabel: 'Bootstrap compliance',
        sourceCommand: 'npx rapidkit bootstrap --json',
        blockers: [
          'profile.enterprise.ci: enterprise profile expects --ci for deterministic non-interactive mode.',
          'profile.enterprise.compatibility-matrix: enterprise profile requires .workspai/compatibility-matrix.json.',
          'profile.enterprise.mirror-config: enterprise profile requires .workspai/mirror-config.json.',
        ],
      },
    });

    expect(result.handled).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.verifyCommand).toBe('npx rapidkit bootstrap --ci --json');
    expect(result.appliedFixes).toEqual([
      {
        path: path.join('.workspai', 'compatibility-matrix.json'),
        action: 'file-create',
        outcome: 'applied',
      },
      {
        path: path.join('.workspai', 'mirror-config.json'),
        action: 'file-create',
        outcome: 'applied',
      },
    ]);

    const compatibilityMatrix = await fs.readJson(
      path.join(workspacePath, '.workspai', 'compatibility-matrix.json')
    );
    expect(compatibilityMatrix.schemaVersion).toBe('rapidkit.compatibility-matrix.v1');
    expect(compatibilityMatrix.runtimes).toEqual({});

    const mirrorConfig = await fs.readJson(
      path.join(workspacePath, '.workspai', 'mirror-config.json')
    );
    expect(mirrorConfig.schema_version).toBe('1.0');
    expect(mirrorConfig.enabled).toBe(false);
    expect(mirrorConfig.artifacts).toEqual([]);
  });

  it('is idempotent for already-created enterprise files', async () => {
    await applyBootstrapComplianceRemediation({
      workspacePath,
      handoff: {
        cardId: 'bootstrap',
        cardLabel: 'Bootstrap compliance',
        blockers: [
          'profile.enterprise.compatibility-matrix: enterprise profile requires .rapidkit/compatibility-matrix.json.',
          'profile.enterprise.mirror-config: enterprise profile requires .rapidkit/mirror-config.json.',
        ],
      },
    });
    const result = await applyBootstrapComplianceRemediation({
      workspacePath,
      handoff: {
        cardId: 'bootstrap',
        cardLabel: 'Bootstrap compliance',
        blockers: [
          'profile.enterprise.compatibility-matrix: enterprise profile requires .rapidkit/compatibility-matrix.json.',
          'profile.enterprise.mirror-config: enterprise profile requires .rapidkit/mirror-config.json.',
        ],
      },
    });

    expect(result.appliedFixes.map((fix) => fix.outcome)).toEqual(['unchanged', 'unchanged']);
  });
});

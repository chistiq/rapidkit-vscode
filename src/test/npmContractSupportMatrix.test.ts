import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  NPM_CONTRACT_SUPPORT_MATRIX,
  type NpmContractSupportMode,
} from '../core/npmContractSupportMatrix';

const repoRoot = path.resolve(__dirname, '../..');
const npmContractsRoot = path.resolve(repoRoot, '..', 'rapidkit-npm', 'contracts');

function listJsonContracts(dir: string, prefix = ''): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = path.join(prefix, entry.name);
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return listJsonContracts(absolutePath, relativePath);
      }
      return entry.isFile() && entry.name.endsWith('.json') ? [relativePath] : [];
    })
    .sort();
}

describe('npm contract support matrix', () => {
  it('classifies every npm contract shipped into the extension', () => {
    const npmContracts = listJsonContracts(npmContractsRoot);
    const matrixContracts = NPM_CONTRACT_SUPPORT_MATRIX.map((entry) => entry.contractPath).sort();
    const uniqueMatrixContracts = [...new Set(matrixContracts)];

    expect(npmContracts.length).toBeGreaterThan(0);
    expect(uniqueMatrixContracts).toEqual(matrixContracts);
    expect(matrixContracts).toEqual(npmContracts);

    for (const contractPath of npmContracts) {
      expect(fs.existsSync(path.join(repoRoot, 'contracts', contractPath)), contractPath).toBe(
        true
      );
    }
  });

  it('keeps each support decision explicit enough for enterprise UX routing', () => {
    const validModes: NpmContractSupportMode[] = [
      'runtime-consumed',
      'evidence-consumed',
      'schema-guarded',
      'mirrored-reserved',
    ];

    for (const entry of NPM_CONTRACT_SUPPORT_MATRIX) {
      expect(validModes, entry.contractPath).toContain(entry.mode);
      expect(entry.extensionSurface.trim().length, entry.contractPath).toBeGreaterThan(12);
      expect(entry.usage.trim().length, entry.contractPath).toBeGreaterThan(24);
    }
  });

  it('marks runtime, evidence, and reserved contracts with the right product intent', () => {
    const byPath = new Map(NPM_CONTRACT_SUPPORT_MATRIX.map((entry) => [entry.contractPath, entry]));

    for (const contractPath of [
      'agent-customization-pack.v1.json',
      'create-planner-capabilities.v1.json',
      'cli-log-event.v1.json',
      'module-support.v1.json',
      'release-readiness.v1.json',
      'runtime-command-surface.v1.json',
      'workspace-registry.v1.json',
    ]) {
      expect(byPath.get(contractPath)?.mode, contractPath).toBe('runtime-consumed');
    }

    for (const contractPath of [
      'workspace-intelligence/workspace-context.v1.json',
      'workspace-intelligence/workspace-impact.v1.json',
      'workspace-intelligence/workspace-model-diff.v1.json',
      'workspace-intelligence/workspace-model-snapshot.v1.json',
      'workspace-intelligence/workspace-model.v1.json',
      'workspace-intelligence/workspace-verify.v1.json',
      'workspace-intelligence/workspace-contract-verify.v1.json',
      'workspace-run-last.v1.json',
      'doctor-project-evidence.v1.json',
      'doctor-workspace-evidence.v1.json',
      'pipeline-last-run.v1.json',
      'analyze-last-run.v1.json',
      'infra-stack.v1.json',
    ]) {
      expect(byPath.get(contractPath)?.mode, contractPath).toBe('evidence-consumed');
    }

    expect(byPath.get('backend-import-stack-parity.snapshot.json')?.mode).toBe('schema-guarded');
    expect(byPath.get('module-layout.v1.json')?.mode).toBe('schema-guarded');
    expect(byPath.get('cli-log-event.v1.json')?.usage).toContain('RAPIDKIT_LOG_FORMAT=json');
    expect(
      byPath.get('workspace-intelligence/workspace-dependency-graph.v1.json')?.usage
    ).toContain('operational weight');
  });

  it('keeps runtime-consumed src mirrors aligned with npm canonical contracts', () => {
    for (const contractPath of [
      'agent-customization-pack.v1.json',
      'create-planner-capabilities.v1.json',
      'release-readiness.v1.json',
      'workspace-registry.v1.json',
    ]) {
      const srcCopy = JSON.parse(
        fs.readFileSync(path.join(repoRoot, 'src', 'contracts', contractPath), 'utf8')
      );
      const npmCopy = JSON.parse(
        fs.readFileSync(path.join(npmContractsRoot, contractPath), 'utf8')
      );

      expect(srcCopy, contractPath).toEqual(npmCopy);
    }
  });
});

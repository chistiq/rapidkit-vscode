import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { buildStudioBlockerHandoff } from '../core/studioBlockerHandoffBuilder.js';
import { isStudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';
import { DASHBOARD_EVIDENCE_CARD_IDS } from '../contracts/dashboardEvidenceCards.js';
import {
  requireStudioCardRepairCapability,
  studioCardAllowsModelSourceMutation,
} from '../contracts/studioCardRepairCapabilities.js';

const repoRoot = path.resolve(__dirname, '..', '..');
const workspaiCliContractsRoot = path.resolve(
  repoRoot,
  '..',
  'workspai',
  'packages',
  'cli',
  'contracts'
);

const PHASE3_CONTRACTS = [
  'workspace-intelligence/blocker-resolution.v1.json',
  'workspace-intelligence/studio-blocker-handoff.v1.json',
  'studio-card-repair-capabilities.v1.json',
];

describe('Phase 3 studio contracts parity', () => {
  it('mirrors blocker-resolution and studio-blocker-handoff JSON to extension contracts', () => {
    for (const contractPath of PHASE3_CONTRACTS) {
      const npmPath = path.join(workspaiCliContractsRoot, contractPath);
      const extensionPath = path.join(repoRoot, 'contracts', contractPath);
      expect(fs.existsSync(npmPath), npmPath).toBe(true);
      expect(fs.existsSync(extensionPath), extensionPath).toBe(true);
      expect(JSON.parse(fs.readFileSync(extensionPath, 'utf8'))).toEqual(
        JSON.parse(fs.readFileSync(npmPath, 'utf8'))
      );
    }
  });

  it('ships typed handoff + resolution modules in extension host', () => {
    const resolution = fs.readFileSync(
      path.join(repoRoot, 'src/core/studioBlockerResolution.ts'),
      'utf8'
    );
    const handoffBuilder = fs.readFileSync(
      path.join(repoRoot, 'src/core/studioBlockerHandoffBuilder.ts'),
      'utf8'
    );
    expect(resolution).toContain('resolveBlockerResolutionClass');
    expect(resolution).toContain('shouldForbidSourceCommandRerun');
    expect(handoffBuilder).toContain('buildStudioBlockerHandoff');
    expect(handoffBuilder).toContain('pickStudioFixActionId');
    expect(
      fs.readFileSync(path.join(repoRoot, 'src/core/studioBlockerFixRouting.ts'), 'utf8')
    ).toContain('STUDIO_CARD_FIX_ROUTING');
  });

  it('builds studio-blocker-handoff as the active incident object', async () => {
    const handoff = await buildStudioBlockerHandoff({
      workspacePath: '/tmp/workspai',
      card: {
        id: 'workspaceVerify',
        label: 'Workspace Verify',
        status: 'fail',
        scope: 'workspace',
        artifactPath: '.rapidkit/reports/workspace-verify-last-run.json',
        blockers: ['workspace.contract.verify is stale'],
        affectedProjectNames: ['web', 'api'],
      },
      projectPath: '/tmp/workspai/web',
    });

    expect(isStudioBlockerHandoff(handoff)).toBe(true);
    expect(handoff.incidentSummary).toEqual({
      title: 'Workspace Verify',
      phase: 'fix',
      primaryAction: 'Fix source issue',
      verifyRequired: true,
      auditStatus: 'not-started',
    });
    expect(handoff.verifyCommand).toBeTruthy();
    expect(handoff.blockerSignature).toHaveLength(16);
    expect(handoff.dashboardCommandId).toBe('workspaceVerify');
    expect(handoff.executionChannel).toBe('background');
    expect(handoff.capabilityGate).toBe('workspace verify');
    expect(handoff.affectedProjectNames).toEqual(['web', 'api']);
    expect(handoff.projectPath).toBeUndefined();
  });

  it('carries command safety metadata for guarded Studio handoffs', async () => {
    const handoff = await buildStudioBlockerHandoff({
      workspacePath: '/tmp/workspai',
      card: {
        id: 'foundation',
        label: 'Workspace Foundation',
        status: 'warn',
        blocking: false,
        scope: 'workspace',
        artifactPath: '.rapidkit/workspace.contract.json',
        blockers: ['foundation files are missing'],
      },
    });

    expect(isStudioBlockerHandoff(handoff)).toBe(true);
    expect(handoff.dashboardCommandId).toBe('workspaceFoundationEnsure');
    expect(handoff.safetyRisk).toBe('write');
    expect(handoff.blocking).toBe(false);
    expect(handoff.safetyRefreshCommands).toEqual([
      'npx workspai workspace contract inspect --json',
    ]);
    expect(handoff.studioMode).toBe('EXPLAIN');
    expect(handoff.incidentSummary).toMatchObject({
      phase: 'diagnose',
      primaryAction: 'Explain blockers',
    });
  });

  it('verifies Workspace Run by regenerating its own evidence artifact', async () => {
    const handoff = await buildStudioBlockerHandoff({
      workspacePath: '/tmp/workspai',
      card: {
        id: 'workspaceRun',
        label: 'Workspace Run',
        status: 'fail',
        scope: 'workspace',
        artifactPath: '.workspai/reports/workspace-run-last.json',
        blockers: ['Blocked by readiness'],
      },
    });

    expect(handoff.sourceCommand).toBe('npx workspai workspace run test --json');
    expect(handoff.verifyCommand).toBe(handoff.sourceCommand);
    expect(handoff.verifyArtifact).toBe('.workspai/reports/workspace-run-last.json');
  });

  it('binds a workspace-level failure to its one evidence-owned linked project', async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-handoff-scope-'));
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-linked-project-'));
    try {
      const reportsDir = path.join(workspacePath, '.workspai', 'reports');
      fs.mkdirSync(reportsDir, { recursive: true });
      fs.writeFileSync(
        path.join(reportsDir, 'workspace-model.json'),
        JSON.stringify({
          schemaVersion: 'workspace-model.v1',
          generatedAt: '2026-08-16T00:00:00.000Z',
          projects: [{ name: 'grpc', path: 'external/grpc', absolutePath: projectPath }],
        })
      );

      const handoff = await buildStudioBlockerHandoff({
        workspacePath,
        card: {
          id: 'workspaceRun',
          label: 'Workspace Run',
          status: 'fail',
          scope: 'workspace',
          artifactPath: '.workspai/reports/workspace-run-last.json',
          blockers: ['grpc: CMake failed'],
          affectedProjectNames: ['grpc'],
        },
      });

      expect(handoff.projectPath).toBe(projectPath);
      expect(handoff.affectedProjectNames).toEqual(['grpc']);
    } finally {
      fs.rmSync(workspacePath, { recursive: true, force: true });
      fs.rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it('fails closed when evidence-card scope drifts from its repair contract', async () => {
    await expect(
      buildStudioBlockerHandoff({
        workspacePath: '/tmp/workspai',
        card: {
          id: 'workspaceRun',
          label: 'Workspace Run',
          status: 'fail',
          scope: 'project',
          blockers: ['fixture'],
        },
      })
    ).rejects.toThrow('Studio card scope drift');
  });

  it('verifies Governance Gate by regenerating Pipeline evidence before aggregate verify', async () => {
    const handoff = await buildStudioBlockerHandoff({
      workspacePath: '/tmp/workspai',
      card: {
        id: 'pipeline',
        label: 'Governance Gate',
        status: 'fail',
        scope: 'workspace',
        artifactPath: '.workspai/reports/pipeline-last-run.json',
        blockers: ['doctor: web: No frontend environment contract marker detected.'],
      },
    });

    expect(handoff.verifyCommand).toBe(handoff.sourceCommand);
    expect(handoff.verifyCommand).toContain('pipeline');
    expect(handoff.verifyArtifact).toBe('.workspai/reports/pipeline-last-run.json');
  });

  it.each(DASHBOARD_EVIDENCE_CARD_IDS)(
    'binds %s to its exact canonical producer and verification artifact',
    async (cardId) => {
      const capability = requireStudioCardRepairCapability(cardId);
      const handoff = await buildStudioBlockerHandoff({
        workspacePath: '/tmp/workspai-card-matrix',
        card: {
          id: cardId,
          label: cardId,
          status: 'fail',
          scope: capability.scope,
          artifactPath: capability.producerArtifact,
          blockers: [`${cardId}: fixture blocker`],
        },
        ...(capability.scope === 'project'
          ? { projectPath: '/tmp/workspai-card-matrix/project' }
          : {}),
      });

      expect(handoff.sourceCommand).toBe(capability.producerCommand);
      expect(handoff.verifyCommand).toBe(capability.verifyCommand);
      expect(handoff.verifyArtifact).toBe(capability.verifyArtifact);
      if (!['doctor', 'projectDoctor', 'importReadiness'].includes(cardId)) {
        expect(handoff.sourceCommand).not.toContain(' doctor ');
      }
    }
  );

  it.each(DASHBOARD_EVIDENCE_CARD_IDS)(
    'enforces the declared producer/source ownership policy for %s',
    (cardId) => {
      const capability = requireStudioCardRepairCapability(cardId);
      expect(studioCardAllowsModelSourceMutation(cardId)).toBe(
        capability.repairPolicy !== 'refresh-producer'
      );
      if (capability.repairPolicy === 'refresh-producer') {
        expect(capability.producerCommand).toBe(capability.verifyCommand);
        expect(capability.producerArtifact).toBe(capability.verifyArtifact);
      }
    }
  );
});

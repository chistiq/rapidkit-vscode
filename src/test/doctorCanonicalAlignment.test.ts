import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { projectDoctorEvidence } from '../core/doctorEvidenceProjection.js';
import { buildStudioBlockerHandoff } from '../core/studioBlockerHandoffBuilder.js';
import { readDoctorEvidenceSnapshot } from '../ui/panels/incidentStudioDoctorEvidence.js';

function finding(input: {
  id: string;
  projectName: string;
  projectPath: string;
  status: 'blocking' | 'advisory';
  symptom: string;
  capabilityId?: string;
}) {
  return {
    id: input.id,
    causalKey: `${input.projectName}:dependency:${input.id}`,
    projectName: input.projectName,
    projectPath: input.projectPath,
    probeId: input.id.split(':')[0],
    label: input.id,
    status: input.status,
    severity: input.status === 'blocking' ? 'error' : 'warn',
    issueClass: 'dependency',
    operationalImpact: 'release-risk',
    applicability: 'applicable',
    confidence: 'high',
    confidenceScore: 0.95,
    diagnosisState: 'confirmed',
    symptom: input.symptom,
    proofs: [
      { kind: 'probe', role: 'observation', ref: `probe:${input.id}`, claim: input.symptom },
    ],
    repair: {
      disposition: input.capabilityId ? 'approval-required' : 'unavailable',
      ...(input.capabilityId ? { capabilityId: input.capabilityId } : {}),
      verifyCommand: 'npx workspai doctor project --json',
      requiresFreshEvidence: true,
    },
  };
}

function project(input: {
  name: string;
  projectPath: string;
  verdict: 'blocked' | 'attention';
  findings: ReturnType<typeof finding>[];
}) {
  return {
    name: input.name,
    path: input.projectPath,
    verdict: input.verdict,
    diagnosis: {
      schemaVersion: 'workspai.doctor-diagnosis.v1',
      findings: input.findings,
    },
  };
}

describe('Doctor 0.56 canonical extension alignment', () => {
  it('keeps advisories out of release blockers while retaining them as attention evidence', () => {
    const projectPath = '/workspace/web';
    const projection = projectDoctorEvidence(
      {
        summary: {
          verdict: 'attention',
          counts: { projectsScanned: 1, advisoryFindings: 1, blockingCauses: 0 },
        },
        projects: [
          project({
            name: 'web',
            projectPath,
            verdict: 'attention',
            findings: [
              finding({
                id: 'coverage:abc',
                projectName: 'web',
                projectPath,
                status: 'advisory',
                symptom: 'Coverage evidence has not been generated.',
              }),
            ],
          }),
        ],
      },
      { scope: 'workspace' }
    );

    expect(projection.canonical).toBe(true);
    expect(projection.verdict).toBe('attention');
    expect(projection.blockers).toEqual([]);
    expect(projection.advisories).toEqual(['web: Coverage evidence has not been generated.']);
  });

  it('carries stable finding and capability ids into the Studio repair handoff', async () => {
    const target = finding({
      id: 'runtime-dependency-materialization:abc',
      projectName: 'api',
      projectPath: '/workspace/api',
      status: 'blocking',
      symptom: 'Dependencies are not installed.',
      capabilityId: 'runtime-dependency-materialization.dependency-materialization',
    });
    const handoff = await buildStudioBlockerHandoff({
      workspacePath: '/workspace',
      projectPath: '/workspace/api',
      card: {
        id: 'projectDoctor',
        label: 'Project Doctor',
        status: 'fail',
        blocking: true,
        scope: 'project',
        artifactPath: '.workspai/reports/doctor-project-last-run.json',
        blockers: [target.symptom],
        affectedProjectNames: ['api'],
        doctorFindings: projectDoctorEvidence(
          {
            project: project({
              name: 'api',
              projectPath: '/workspace/api',
              verdict: 'blocked',
              findings: [target],
            }),
          },
          { scope: 'project', projectPath: '/workspace/api' }
        ).findings,
      },
    });

    expect(handoff.doctorFindings?.[0]).toMatchObject({
      id: target.id,
      causalKey: target.causalKey,
      capabilityId: target.repair.capabilityId,
      projectPath: '/workspace/api',
    });
    expect(handoff.resolutionHints?.[0]).toMatchObject({ blockerId: target.id });
    expect(handoff.resolutionHints?.[0]?.fixHints[0]?.detail).toContain(
      'runtime-dependency-materialization.dependency-materialization'
    );
  });

  it('isolates project Doctor context from unrelated workspace projects', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-doctor-scope-'));
    const apiPath = path.join(workspacePath, 'api');
    const webPath = path.join(workspacePath, 'web');
    const reportsPath = path.join(workspacePath, '.workspai', 'reports');
    await fs.ensureDir(reportsPath);
    const apiFinding = finding({
      id: 'dependencies:api',
      projectName: 'api',
      projectPath: apiPath,
      status: 'blocking',
      symptom: 'Dependencies are not installed.',
      capabilityId: 'runtime-dependency-materialization.dependency-materialization',
    });
    await fs.writeJSON(path.join(reportsPath, 'doctor-last-run.json'), {
      generatedAt: '2026-08-09T00:00:00.000Z',
      healthScore: { total: 2, passed: 0, warnings: 1, errors: 1 },
      projects: [
        project({ name: 'api', projectPath: apiPath, verdict: 'blocked', findings: [apiFinding] }),
        project({
          name: 'web',
          projectPath: webPath,
          verdict: 'attention',
          findings: [
            finding({
              id: 'coverage:web',
              projectName: 'web',
              projectPath: webPath,
              status: 'advisory',
              symptom: 'Coverage evidence is missing.',
            }),
          ],
        }),
      ],
    });
    await fs.writeJSON(path.join(reportsPath, 'doctor-project-last-run.json'), {
      generatedAt: '2026-08-09T00:01:00.000Z',
      projectPath: apiPath,
      projectName: 'api',
      healthScore: { total: 1, passed: 0, warnings: 0, errors: 1 },
      project: project({
        name: 'api',
        projectPath: apiPath,
        verdict: 'blocked',
        findings: [apiFinding],
      }),
    });

    const snapshot = await readDoctorEvidenceSnapshot(workspacePath, { projectPath: apiPath });
    expect(snapshot?.projects.map((entry) => entry.name)).toEqual(['api']);
    expect(snapshot?.canonicalFindings?.map((entry) => entry.id)).toEqual(['dependencies:api']);
    expect(snapshot?.verdict).toBe('blocked');

    await fs.remove(workspacePath);
  });
});

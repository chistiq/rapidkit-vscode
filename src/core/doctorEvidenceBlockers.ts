import { projectDoctorEvidence } from './doctorEvidenceProjection.js';

function collectStringItems(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, limit);
}

export function collectDoctorProjectRecordBlockers(
  record: Record<string, unknown>,
  limit = 8
): string[] {
  if (record.diagnosis && typeof record.diagnosis === 'object') {
    return projectDoctorEvidence(
      { project: record },
      {
        scope: 'project',
        projectPath: typeof record.path === 'string' ? record.path : undefined,
        projectName: typeof record.name === 'string' ? record.name : undefined,
      }
    ).blockers.slice(0, limit);
  }
  const blockers = collectStringItems(record.issues, limit);

  const vulnerabilities = Number(record.vulnerabilities);
  if (Number.isFinite(vulnerabilities) && vulnerabilities > 0) {
    blockers.push(
      `${vulnerabilities} npm security vulnerabilit${vulnerabilities === 1 ? 'y' : 'ies'} reported`
    );
  }

  const probes = Array.isArray(record.probes) ? record.probes : [];
  for (const probe of probes) {
    if (!probe || typeof probe !== 'object') {
      continue;
    }
    const entry = probe as Record<string, unknown>;
    const status = typeof entry.status === 'string' ? entry.status : '';
    if (status !== 'warn' && status !== 'fail') {
      continue;
    }
    const label =
      typeof entry.label === 'string'
        ? entry.label
        : typeof entry.id === 'string'
          ? entry.id
          : 'Probe check';
    const reason = typeof entry.reason === 'string' ? entry.reason.trim() : '';
    const recommendation =
      typeof entry.recommendation === 'string' ? entry.recommendation.trim() : '';
    const detail = reason || recommendation;
    blockers.push(detail ? `${label}: ${detail}` : label);
  }

  return blockers.slice(0, limit);
}

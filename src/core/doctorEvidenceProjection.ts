export type DoctorVerdict = 'passed' | 'attention' | 'blocked';

export type DoctorFindingTarget = {
  id: string;
  causalKey?: string;
  projectName?: string;
  projectPath?: string;
  probeId?: string;
  issueClass?: string;
  symptom: string;
  status: 'blocking' | 'advisory' | 'informational' | 'unknown';
  applicability?: 'applicable' | 'not-applicable' | 'unknown';
  diagnosisState?: 'confirmed' | 'candidate' | 'unknown';
  repairDisposition?: 'automatic' | 'approval-required' | 'manual' | 'unavailable' | 'not-needed';
  capabilityId?: string;
  verifyCommand?: string;
  requiresFreshEvidence?: boolean;
};

export type DoctorEvidenceProjection = {
  canonical: boolean;
  verdict: DoctorVerdict;
  blockers: string[];
  advisories: string[];
  affectedProjectNames: string[];
  findings: DoctorFindingTarget[];
  counts: {
    projectsScanned: number;
    affectedProjects: number;
    blockingCauses: number;
    advisoryFindings: number;
    unknownFindings: number;
    repairableFindings: number;
  };
  freshness?: 'fresh' | 'stale' | 'unknown';
};

type ProjectionOptions = {
  scope: 'workspace' | 'project';
  projectPath?: string;
  projectName?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeVerdict(value: unknown): DoctorVerdict | undefined {
  if (value === 'passed' || value === 'attention' || value === 'blocked') {
    return value;
  }
  if (value === 'pass' || value === 'ok' || value === 'ready') {
    return 'passed';
  }
  if (value === 'warn' || value === 'warning' || value === 'needs-attention') {
    return 'attention';
  }
  if (value === 'fail' || value === 'error') {
    return 'blocked';
  }
  return undefined;
}

function sameProject(
  project: Record<string, unknown>,
  options: Pick<ProjectionOptions, 'projectPath' | 'projectName'>
): boolean {
  const candidatePath = stringValue(project.path);
  const candidateName = stringValue(project.name);
  if (options.projectPath && candidatePath) {
    const normalize = (value: string) => value.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
    return normalize(candidatePath) === normalize(options.projectPath);
  }
  if (options.projectName && candidateName) {
    return candidateName.toLowerCase() === options.projectName.toLowerCase();
  }
  return true;
}

function scopedProjects(raw: Record<string, unknown>, options: ProjectionOptions) {
  const candidates: Record<string, unknown>[] = [];
  if (isRecord(raw.project)) {
    candidates.push(raw.project);
  }
  if (Array.isArray(raw.projects)) {
    candidates.push(...raw.projects.filter(isRecord));
  }
  if (options.scope === 'workspace') {
    return candidates;
  }
  return candidates.filter((project) => sameProject(project, options));
}

function normalizeFinding(value: unknown): DoctorFindingTarget | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = stringValue(value.id);
  const symptom = stringValue(value.symptom);
  const status = value.status;
  if (
    !id ||
    !symptom ||
    (status !== 'blocking' &&
      status !== 'advisory' &&
      status !== 'informational' &&
      status !== 'unknown')
  ) {
    return undefined;
  }
  const repair = isRecord(value.repair) ? value.repair : {};
  const disposition = repair.disposition;
  return {
    id,
    symptom,
    status,
    ...(stringValue(value.causalKey) ? { causalKey: stringValue(value.causalKey) } : {}),
    ...(stringValue(value.projectName) ? { projectName: stringValue(value.projectName) } : {}),
    ...(stringValue(value.projectPath) ? { projectPath: stringValue(value.projectPath) } : {}),
    ...(stringValue(value.probeId) ? { probeId: stringValue(value.probeId) } : {}),
    ...(stringValue(value.issueClass) ? { issueClass: stringValue(value.issueClass) } : {}),
    ...(value.applicability === 'applicable' ||
    value.applicability === 'not-applicable' ||
    value.applicability === 'unknown'
      ? { applicability: value.applicability }
      : {}),
    ...(value.diagnosisState === 'confirmed' ||
    value.diagnosisState === 'candidate' ||
    value.diagnosisState === 'unknown'
      ? { diagnosisState: value.diagnosisState }
      : {}),
    ...(disposition === 'automatic' ||
    disposition === 'approval-required' ||
    disposition === 'manual' ||
    disposition === 'unavailable' ||
    disposition === 'not-needed'
      ? { repairDisposition: disposition }
      : {}),
    ...(stringValue(repair.capabilityId) ? { capabilityId: stringValue(repair.capabilityId) } : {}),
    ...(stringValue(repair.verifyCommand)
      ? { verifyCommand: stringValue(repair.verifyCommand) }
      : {}),
    ...(typeof repair.requiresFreshEvidence === 'boolean'
      ? { requiresFreshEvidence: repair.requiresFreshEvidence }
      : {}),
  };
}

function findingLabel(finding: DoctorFindingTarget, scope: ProjectionOptions['scope']): string {
  if (scope === 'workspace' && finding.projectName) {
    return `${finding.projectName}: ${finding.symptom}`;
  }
  return finding.symptom;
}

function legacyProjectFindings(
  project: Record<string, unknown>,
  options: ProjectionOptions
): DoctorFindingTarget[] {
  const projectName = stringValue(project.name);
  const projectPath = stringValue(project.path);
  const findings: DoctorFindingTarget[] = [];
  const probes = Array.isArray(project.probes) ? project.probes.filter(isRecord) : [];
  for (const probe of probes) {
    const status = probe.status;
    if (status !== 'fail' && status !== 'warn') {
      continue;
    }
    const label = stringValue(probe.label) ?? stringValue(probe.id);
    const detail = stringValue(probe.reason) ?? stringValue(probe.recommendation);
    const symptom = label && detail ? `${label}: ${detail}` : (detail ?? label);
    if (!symptom) {
      continue;
    }
    findings.push({
      id: stringValue(probe.id) ?? `legacy-probe-${findings.length + 1}`,
      symptom,
      status: status === 'fail' ? 'blocking' : 'advisory',
      ...(projectName ? { projectName } : {}),
      ...(projectPath ? { projectPath } : {}),
      ...(stringValue(probe.id) ? { probeId: stringValue(probe.id) } : {}),
    });
  }
  if (findings.length === 0 && Array.isArray(project.issues)) {
    for (const issue of project.issues) {
      const symptom = stringValue(issue);
      if (!symptom) {
        continue;
      }
      findings.push({
        id: `legacy-issue-${findings.length + 1}`,
        symptom,
        status: 'blocking',
        ...(projectName ? { projectName } : {}),
        ...(projectPath ? { projectPath } : {}),
      });
    }
  }
  const vulnerabilities = numberValue(project.vulnerabilities);
  if (vulnerabilities > 0 && !findings.some((finding) => /vulnerabilit/i.test(finding.symptom))) {
    findings.push({
      id: 'legacy-dependency-vulnerabilities',
      symptom: `${vulnerabilities} npm security vulnerabilit${vulnerabilities === 1 ? 'y' : 'ies'} reported`,
      status: 'blocking',
      issueClass: 'security',
      ...(projectName ? { projectName } : {}),
      ...(projectPath ? { projectPath } : {}),
    });
  }
  return findings.filter(
    (finding) =>
      options.scope === 'workspace' || sameProject(finding as Record<string, unknown>, options)
  );
}

export function projectDoctorEvidence(
  raw: Record<string, unknown>,
  options: ProjectionOptions
): DoctorEvidenceProjection {
  const projects = scopedProjects(raw, options);
  const canonicalFindings = projects.flatMap((project) => {
    const diagnosis = isRecord(project.diagnosis) ? project.diagnosis : undefined;
    return Array.isArray(diagnosis?.findings)
      ? diagnosis.findings
          .map(normalizeFinding)
          .filter((entry): entry is DoctorFindingTarget => Boolean(entry))
      : [];
  });
  const canonical =
    canonicalFindings.length > 0 || projects.some((project) => isRecord(project.diagnosis));
  let findings = canonical
    ? canonicalFindings.filter((finding) => finding.applicability !== 'not-applicable')
    : projects.flatMap((project) => legacyProjectFindings(project, options));

  const summary = isRecord(raw.summary) ? raw.summary : {};
  const summaryCounts = isRecord(summary.counts) ? summary.counts : {};
  const healthScore = isRecord(raw.healthScore) ? raw.healthScore : {};
  const projectVerdicts = projects
    .map((project) => normalizeVerdict(project.verdict))
    .filter(Boolean);
  const explicitVerdict =
    normalizeVerdict(summary.verdict) ??
    (options.scope === 'project' ? projectVerdicts[0] : undefined) ??
    normalizeVerdict(healthScore.verdict);
  const errors = numberValue(healthScore.errors);
  const warnings = numberValue(healthScore.warnings);
  // Legacy Doctor envelopes used issues and warn probes as attention detail.
  // Preserve their health-score error count as the release-blocking signal.
  if (!canonical && errors === 0) {
    findings = findings.map((finding) =>
      finding.status === 'blocking' ? { ...finding, status: 'advisory' as const } : finding
    );
  }
  const blocking = findings.filter((finding) => finding.status === 'blocking');
  const advisories = findings.filter((finding) => finding.status === 'advisory');
  const unknowns = findings.filter((finding) => finding.status === 'unknown');
  const verdict: DoctorVerdict =
    explicitVerdict ??
    (blocking.length > 0 || errors > 0
      ? 'blocked'
      : advisories.length > 0 || unknowns.length > 0 || warnings > 0
        ? 'attention'
        : 'passed');

  const affectedProjectNames = [
    ...new Set(
      findings
        .filter((finding) => finding.status === 'blocking' || finding.status === 'advisory')
        .map((finding) => finding.projectName)
        .filter((name): name is string => Boolean(name))
    ),
  ];
  const evidenceFreshness = isRecord(raw.evidenceFreshness) ? raw.evidenceFreshness : {};
  const freshnessValue = evidenceFreshness.status;

  return {
    canonical,
    verdict,
    blockers: blocking.map((finding) => findingLabel(finding, options.scope)).slice(0, 12),
    advisories: advisories.map((finding) => findingLabel(finding, options.scope)).slice(0, 12),
    affectedProjectNames,
    findings: findings.slice(0, 64),
    counts: {
      projectsScanned:
        numberValue(summaryCounts.projectsScanned) ||
        (options.scope === 'project' ? (projects.length > 0 ? 1 : 0) : projects.length),
      affectedProjects: numberValue(summaryCounts.affectedProjects) || affectedProjectNames.length,
      blockingCauses:
        numberValue(summaryCounts.blockingCauses) ||
        numberValue(summary.blockingFindings) ||
        blocking.length,
      advisoryFindings:
        numberValue(summaryCounts.advisoryFindings) ||
        numberValue(summary.advisoryFindings) ||
        advisories.length,
      unknownFindings: numberValue(summaryCounts.unknownFindings) || unknowns.length,
      repairableFindings:
        numberValue(summaryCounts.repairableFindings) ||
        findings.filter(
          (finding) =>
            finding.repairDisposition === 'automatic' ||
            finding.repairDisposition === 'approval-required'
        ).length,
    },
    ...(freshnessValue === 'fresh' || freshnessValue === 'stale' || freshnessValue === 'unknown'
      ? { freshness: freshnessValue }
      : {}),
  };
}

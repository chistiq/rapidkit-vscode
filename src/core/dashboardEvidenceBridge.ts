import fs from 'fs-extra';
import path from 'path';

import {
  extractBlockersFromReport,
  normalizeEvidenceStatus,
  type DashboardReportKind,
} from './dashboardReportRegistry';

export type DashboardEvidenceStatus = 'pass' | 'warn' | 'fail' | 'missing';

export type DashboardEvidenceScope = 'workspace' | 'project';

export type DashboardEvidenceCardId =
  | 'doctor'
  | 'projectDoctor'
  | 'analyze'
  | 'readiness'
  | 'bootstrap'
  | 'autopilot'
  | 'snapshot'
  | 'share'
  | 'archive'
  | 'mirror'
  | 'cache'
  | 'policy'
  | 'infra';

export type DashboardEvidenceCard = {
  id: DashboardEvidenceCardId;
  label: string;
  status: DashboardEvidenceStatus;
  summary: string;
  scope: DashboardEvidenceScope;
  generatedAt?: string;
  artifactPath?: string;
  metrics?: Record<string, number | string>;
  blockers?: string[];
  incidentStudioTarget?: 'doctor' | 'analyze' | 'readiness' | 'release';
};

export type DashboardEvidenceBundle = {
  workspacePath?: string;
  projectPath?: string;
  projectName?: string;
  cards: DashboardEvidenceCard[];
};

async function readJsonIfExists(filePath: string): Promise<Record<string, unknown> | undefined> {
  try {
    if (!(await fs.pathExists(filePath))) {
      return undefined;
    }
    const raw = await fs.readJSON(filePath);
    return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function missingCard(
  id: DashboardEvidenceCardId,
  label: string,
  summary: string,
  scope: DashboardEvidenceScope = 'workspace',
  incidentStudioTarget?: DashboardEvidenceCard['incidentStudioTarget']
): DashboardEvidenceCard {
  return {
    id,
    label,
    status: 'missing',
    summary,
    scope,
    incidentStudioTarget,
  };
}

async function readBootstrapComplianceSummary(
  reportsDir: string
): Promise<DashboardEvidenceCard | undefined> {
  try {
    if (!(await fs.pathExists(reportsDir))) {
      return undefined;
    }
    const files = (await fs.readdir(reportsDir))
      .filter((name) => name.startsWith('bootstrap-compliance') && name.endsWith('.json'))
      .sort()
      .reverse();
    if (files.length === 0) {
      return undefined;
    }
    const artifactPath = path.join(reportsDir, files[0]);
    const raw = await readJsonIfExists(artifactPath);
    if (!raw) {
      return undefined;
    }
    const statusRaw =
      raw.status ??
      raw.result ??
      (raw.passed === true ? 'pass' : raw.passed === false ? 'fail' : undefined);
    const status = normalizeEvidenceStatus(statusRaw);
    const blockers = extractBlockersFromReport('bootstrap-compliance', raw);
    return {
      id: 'bootstrap',
      label: 'Bootstrap compliance',
      status: status === 'missing' ? 'warn' : status,
      summary:
        typeof raw.summary === 'string'
          ? raw.summary
          : blockers.length > 0
            ? blockers[0]
            : status === 'pass'
              ? 'Bootstrap compliance report is green.'
              : 'Bootstrap compliance needs attention.',
      scope: 'workspace',
      generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : undefined,
      artifactPath,
      blockers,
    };
  } catch {
    return undefined;
  }
}

const WORKSPACE_DOCTOR_REPORT = 'doctor-last-run.json';
const PROJECT_DOCTOR_REPORT = 'doctor-project-last-run.json';

function buildDoctorCard(
  reportsDir: string,
  raw: Record<string, unknown> | undefined,
  scope: DashboardEvidenceScope,
  id: DashboardEvidenceCardId,
  label: string,
  options?: { projectPath?: string; projectName?: string; reportFileName?: string }
): DashboardEvidenceCard {
  const reportFileName =
    options?.reportFileName ??
    (scope === 'project' ? PROJECT_DOCTOR_REPORT : WORKSPACE_DOCTOR_REPORT);
  const artifactPath = path.join(reportsDir, reportFileName);
  if (!raw) {
    return missingCard(
      id,
      label,
      scope === 'project'
        ? 'No project doctor evidence yet. Run project Doctor from Console.'
        : 'No doctor evidence yet. Run workspace or project Doctor.',
      scope,
      'doctor'
    );
  }

  const healthScore =
    raw.healthScore && typeof raw.healthScore === 'object'
      ? (raw.healthScore as Record<string, unknown>)
      : {};
  const passed = Number(healthScore.passed ?? 0);
  const warnings = Number(healthScore.warnings ?? 0);
  const errors = Number(healthScore.errors ?? 0);
  const total = Number(healthScore.total ?? passed + warnings + errors);
  const percent = total > 0 ? Math.round((passed / total) * 100) : 0;
  const blockers = extractBlockersFromReport('doctor-last-run', raw, options);
  const status: DashboardEvidenceStatus = errors > 0 ? 'fail' : warnings > 0 ? 'warn' : 'pass';

  return {
    id,
    label,
    status,
    summary: `${percent}% health · ${errors} errors · ${warnings} warnings`,
    scope,
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : undefined,
    artifactPath,
    metrics: { percent, errors, warnings, passed, total },
    blockers,
    incidentStudioTarget: 'doctor',
  };
}

async function buildHandoffCards(workspacePath: string): Promise<DashboardEvidenceCard[]> {
  const cards: DashboardEvidenceCard[] = [];
  const reportsDir = path.join(workspacePath, '.rapidkit', 'reports');

  const shareRaw = await readJsonIfExists(path.join(reportsDir, 'share-bundle.json'));
  if (shareRaw) {
    const blockers = extractBlockersFromReport('share-bundle', shareRaw);
    const healthTotals =
      shareRaw.healthTotals && typeof shareRaw.healthTotals === 'object'
        ? (shareRaw.healthTotals as Record<string, unknown>)
        : {};
    const errors = Number(healthTotals.errors ?? 0);
    const status: DashboardEvidenceStatus = errors > 0 ? 'warn' : 'pass';
    cards.push({
      id: 'share',
      label: 'Share bundle',
      status,
      summary:
        typeof shareRaw.workspaceName === 'string'
          ? `Handoff bundle for ${shareRaw.workspaceName}`
          : 'Workspace share bundle available.',
      scope: 'workspace',
      generatedAt: typeof shareRaw.generatedAt === 'string' ? shareRaw.generatedAt : undefined,
      artifactPath: path.join(reportsDir, 'share-bundle.json'),
      blockers,
    });
  }

  const snapshotRaw = await readJsonIfExists(path.join(reportsDir, 'snapshot-last-run.json'));
  if (snapshotRaw) {
    const blockers = extractBlockersFromReport('snapshot-last-run', snapshotRaw);
    const status = normalizeEvidenceStatus(snapshotRaw.status ?? snapshotRaw.result);
    cards.push({
      id: 'snapshot',
      label: 'Snapshot',
      status: status === 'missing' ? 'pass' : status,
      summary:
        typeof snapshotRaw.snapshotName === 'string'
          ? `Latest snapshot: ${snapshotRaw.snapshotName}`
          : 'Latest workspace snapshot recorded.',
      scope: 'workspace',
      generatedAt:
        typeof snapshotRaw.generatedAt === 'string' ? snapshotRaw.generatedAt : undefined,
      artifactPath: path.join(reportsDir, 'snapshot-last-run.json'),
      blockers,
    });
  }

  const archiveRaw = await readJsonIfExists(
    path.join(workspacePath, '.rapidkit', 'archive-manifest.json')
  );
  if (archiveRaw) {
    const blockers = extractBlockersFromReport('archive-manifest', archiveRaw);
    cards.push({
      id: 'archive',
      label: 'Archive',
      status: blockers.length > 0 ? 'warn' : 'pass',
      summary:
        typeof archiveRaw.summary === 'string'
          ? archiveRaw.summary
          : 'Workspace archive manifest is available.',
      scope: 'workspace',
      generatedAt: typeof archiveRaw.generatedAt === 'string' ? archiveRaw.generatedAt : undefined,
      artifactPath: path.join(workspacePath, '.rapidkit', 'archive-manifest.json'),
      blockers,
    });
  }

  return cards;
}

async function buildGovernanceOperationalCards(
  workspacePath: string,
  reportsDir: string
): Promise<DashboardEvidenceCard[]> {
  const cards: DashboardEvidenceCard[] = [];
  const rapidkitDir = path.join(workspacePath, '.rapidkit');

  const mirrorRaw = await readJsonIfExists(path.join(reportsDir, 'mirror-ops.latest.json'));
  if (mirrorRaw) {
    const mirrorMeta =
      mirrorRaw.mirror && typeof mirrorRaw.mirror === 'object'
        ? (mirrorRaw.mirror as Record<string, unknown>)
        : {};
    const configExists = mirrorMeta.configExists === true;
    const artifactsCount = Number(mirrorMeta.artifactsCount ?? 0);
    const result = normalizeEvidenceStatus(mirrorRaw.result ?? mirrorRaw.status);
    const blockers = extractBlockersFromReport('mirror-ops', mirrorRaw);
    const status: DashboardEvidenceStatus =
      result === 'fail' ? 'fail' : configExists ? (artifactsCount > 0 ? 'pass' : 'warn') : 'warn';
    cards.push({
      id: 'mirror',
      label: 'Mirror',
      status,
      summary: configExists
        ? `${artifactsCount} artifact(s) · config present`
        : 'Mirror config missing — run mirror status.',
      scope: 'workspace',
      generatedAt: typeof mirrorRaw.timestamp === 'string' ? mirrorRaw.timestamp : undefined,
      artifactPath: path.join(reportsDir, 'mirror-ops.latest.json'),
      blockers,
    });
  } else {
    cards.push(
      missingCard(
        'mirror',
        'Mirror',
        'No mirror ops evidence yet. Run mirror status from Governance.',
        'workspace'
      )
    );
  }

  const infraRaw = await readJsonIfExists(path.join(reportsDir, 'infra-plan.json'));
  if (infraRaw) {
    const services = Array.isArray(infraRaw.services) ? infraRaw.services : [];
    const serviceCount = services.length;
    const blockers = extractBlockersFromReport('infra-plan', infraRaw);
    const status: DashboardEvidenceStatus =
      serviceCount > 0 ? (blockers.length > 0 ? 'warn' : 'pass') : 'warn';
    cards.push({
      id: 'infra',
      label: 'Infra',
      status,
      summary:
        serviceCount > 0
          ? `${serviceCount} sidecar service(s) planned`
          : 'Infra plan has no services — run infra plan.',
      scope: 'workspace',
      generatedAt: typeof infraRaw.generatedAt === 'string' ? infraRaw.generatedAt : undefined,
      artifactPath: path.join(reportsDir, 'infra-plan.json'),
      metrics: { services: serviceCount },
      blockers,
    });
  } else {
    cards.push(
      missingCard(
        'infra',
        'Infra',
        'No infra plan evidence yet. Run infra plan from Governance.',
        'workspace'
      )
    );
  }

  const policiesPath = path.join(rapidkitDir, 'policies.yml');
  const governancePolicyPath = path.join(rapidkitDir, 'governance-policy.json');
  const hasPolicies = await fs.pathExists(policiesPath);
  const hasGovernancePolicy = await fs.pathExists(governancePolicyPath);
  if (hasPolicies || hasGovernancePolicy) {
    const artifactPath = hasPolicies ? policiesPath : governancePolicyPath;
    cards.push({
      id: 'policy',
      label: 'Policy',
      status: 'pass',
      summary: hasPolicies
        ? 'Workspace policies.yml is configured.'
        : 'Governance policy JSON is configured.',
      scope: 'workspace',
      artifactPath,
    });
  } else {
    cards.push(
      missingCard(
        'policy',
        'Policy',
        'No workspace policy file yet. Run workspace policy show or configure policies.yml.',
        'workspace'
      )
    );
  }

  const cacheConfigPath = path.join(rapidkitDir, 'cache-config.yml');
  if (await fs.pathExists(cacheConfigPath)) {
    let strategy = 'shared';
    try {
      const cacheConfigRaw = await fs.readFile(cacheConfigPath, 'utf8');
      const strategyMatch = cacheConfigRaw.match(/strategy:\s*(\S+)/i);
      if (strategyMatch?.[1]) {
        strategy = strategyMatch[1];
      }
    } catch {
      /* use default strategy label */
    }
    cards.push({
      id: 'cache',
      label: 'Cache',
      status: 'pass',
      summary: `Cache config present · strategy ${strategy}`,
      scope: 'workspace',
      artifactPath: cacheConfigPath,
    });
  } else {
    cards.push(
      missingCard(
        'cache',
        'Cache',
        'No cache-config.yml yet. Defaults apply — run cache status to inspect.',
        'workspace'
      )
    );
  }

  return cards;
}

export async function buildDashboardEvidenceBundle(input?: {
  workspacePath?: string;
  projectPath?: string;
  projectName?: string;
}): Promise<DashboardEvidenceBundle> {
  const workspacePath = input?.workspacePath;
  const projectPath = input?.projectPath;
  const projectName = input?.projectName;

  if (!workspacePath) {
    return { cards: [] };
  }

  const reportsDir = path.join(workspacePath, '.rapidkit', 'reports');
  const cards: DashboardEvidenceCard[] = [];

  const workspaceDoctorRaw = await readJsonIfExists(path.join(reportsDir, 'doctor-last-run.json'));
  cards.push(
    buildDoctorCard(reportsDir, workspaceDoctorRaw, 'workspace', 'doctor', 'Workspace Doctor')
  );

  if (projectPath) {
    const projectReportsDir = path.join(projectPath, '.rapidkit', 'reports');
    const projectDoctorRaw = await readJsonIfExists(
      path.join(projectReportsDir, PROJECT_DOCTOR_REPORT)
    );
    cards.push(
      buildDoctorCard(
        projectReportsDir,
        projectDoctorRaw,
        'project',
        'projectDoctor',
        'Project Doctor',
        { projectPath, projectName, reportFileName: PROJECT_DOCTOR_REPORT }
      )
    );
  }

  const analyzeRaw = await readJsonIfExists(path.join(reportsDir, 'analyze-last-run.json'));
  if (analyzeRaw) {
    const summary =
      analyzeRaw.summary && typeof analyzeRaw.summary === 'object'
        ? (analyzeRaw.summary as Record<string, unknown>)
        : {};
    const findings =
      summary.findings && typeof summary.findings === 'object'
        ? (summary.findings as Record<string, unknown>)
        : {};
    const fail = Number(findings.fail ?? 0);
    const warn = Number(findings.warn ?? 0);
    const score = Number(summary.score ?? 0);
    const verdict = normalizeEvidenceStatus(summary.verdict);
    const blockers = extractBlockersFromReport('analyze-last-run', analyzeRaw);
    cards.push({
      id: 'analyze',
      label: 'Analyze',
      status: verdict === 'missing' ? (fail > 0 ? 'fail' : warn > 0 ? 'warn' : 'pass') : verdict,
      summary: `Score ${score} · ${fail} fail · ${warn} warn`,
      scope: 'workspace',
      generatedAt: typeof analyzeRaw.generatedAt === 'string' ? analyzeRaw.generatedAt : undefined,
      artifactPath: path.join(reportsDir, 'analyze-last-run.json'),
      metrics: { score, fail, warn },
      blockers,
      incidentStudioTarget: 'analyze',
    });
  } else {
    cards.push(
      missingCard(
        'analyze',
        'Analyze',
        'No analyze report yet. Run workspace Analyze from Overview.',
        'workspace',
        'analyze'
      )
    );
  }

  const readinessRaw = await readJsonIfExists(
    path.join(reportsDir, 'release-readiness-last-run.json')
  );
  if (readinessRaw) {
    const overallStatus = normalizeEvidenceStatus(readinessRaw.overallStatus);
    const blockers = extractBlockersFromReport('release-readiness-last-run', readinessRaw);
    cards.push({
      id: 'readiness',
      label: 'Readiness',
      status: overallStatus === 'missing' ? 'warn' : overallStatus,
      summary:
        blockers.length > 0 ? `${blockers.length} blocking gate(s)` : 'All readiness gates passed.',
      scope: 'workspace',
      generatedAt:
        typeof readinessRaw.generatedAt === 'string' ? readinessRaw.generatedAt : undefined,
      artifactPath: path.join(reportsDir, 'release-readiness-last-run.json'),
      metrics: { blockers: blockers.length },
      blockers,
      incidentStudioTarget: 'readiness',
    });
  } else {
    cards.push(
      missingCard(
        'readiness',
        'Readiness',
        'No readiness evidence yet. Run Readiness before release.',
        'workspace',
        'readiness'
      )
    );
  }

  const bootstrapCard = await readBootstrapComplianceSummary(reportsDir);
  if (bootstrapCard) {
    cards.push(bootstrapCard);
  }

  const autopilotRaw = await readJsonIfExists(path.join(reportsDir, 'autopilot-release.json'));
  if (autopilotRaw) {
    const status = normalizeEvidenceStatus(
      autopilotRaw.overallStatus ?? autopilotRaw.status ?? autopilotRaw.result
    );
    const blockers = extractBlockersFromReport('autopilot-release', autopilotRaw);
    cards.push({
      id: 'autopilot',
      label: 'Autopilot release',
      status: status === 'missing' ? (blockers.length > 0 ? 'fail' : 'warn') : status,
      summary:
        blockers.length > 0
          ? `${blockers.length} release blocker(s)`
          : status === 'pass'
            ? 'Autopilot release succeeded.'
            : 'Autopilot release needs review.',
      scope: 'workspace',
      generatedAt:
        typeof autopilotRaw.generatedAt === 'string' ? autopilotRaw.generatedAt : undefined,
      artifactPath: path.join(reportsDir, 'autopilot-release.json'),
      blockers,
      incidentStudioTarget: 'release',
    });
  }

  cards.push(...(await buildHandoffCards(workspacePath)));
  cards.push(...(await buildGovernanceOperationalCards(workspacePath, reportsDir)));

  return {
    workspacePath,
    projectPath,
    projectName,
    cards,
  };
}

export function findEvidenceCardById(
  bundle: DashboardEvidenceBundle | undefined,
  id: DashboardEvidenceCardId
): DashboardEvidenceCard | undefined {
  return bundle?.cards.find((card) => card.id === id);
}

export function resolveCardForReportKind(
  bundle: DashboardEvidenceBundle,
  kind: DashboardReportKind,
  _projectPath?: string
): DashboardEvidenceCard | undefined {
  switch (kind) {
    case 'doctor-last-run':
      return findEvidenceCardById(bundle, 'doctor');
    case 'doctor-project-last-run':
      return findEvidenceCardById(bundle, 'projectDoctor');
    case 'analyze-last-run':
      return findEvidenceCardById(bundle, 'analyze');
    case 'release-readiness-last-run':
      return findEvidenceCardById(bundle, 'readiness');
    case 'bootstrap-compliance':
      return findEvidenceCardById(bundle, 'bootstrap');
    case 'autopilot-release':
      return findEvidenceCardById(bundle, 'autopilot');
    case 'share-bundle':
      return findEvidenceCardById(bundle, 'share');
    case 'snapshot-last-run':
      return findEvidenceCardById(bundle, 'snapshot');
    case 'archive-manifest':
      return findEvidenceCardById(bundle, 'archive');
    case 'mirror-ops':
      return findEvidenceCardById(bundle, 'mirror');
    case 'infra-plan':
      return findEvidenceCardById(bundle, 'infra');
    default:
      return undefined;
  }
}

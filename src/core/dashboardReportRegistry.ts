import path from 'path';

import type { DashboardEvidenceStatus } from './dashboardEvidenceBridge';

export type DashboardReportKind =
  | 'doctor-last-run'
  | 'doctor-project-last-run'
  | 'analyze-last-run'
  | 'release-readiness-last-run'
  | 'bootstrap-compliance'
  | 'autopilot-release'
  | 'share-bundle'
  | 'snapshot-last-run'
  | 'archive-manifest'
  | 'mirror-ops'
  | 'infra-plan';

export type DashboardReportBinding = {
  kind: DashboardReportKind;
  command: string;
  cardId: string;
  scope: 'workspace' | 'project' | 'system';
};

const REPORT_BINDINGS: Array<{
  match: (fileName: string) => boolean;
  binding: DashboardReportBinding;
}> = [
  {
    match: (name) => name === 'doctor-last-run.json',
    binding: {
      kind: 'doctor-last-run',
      command: 'checkWorkspaceHealth',
      cardId: 'doctor',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'doctor-project-last-run.json',
    binding: {
      kind: 'doctor-project-last-run',
      command: 'checkProjectHealth',
      cardId: 'projectDoctor',
      scope: 'project',
    },
  },
  {
    match: (name) => name === 'analyze-last-run.json',
    binding: {
      kind: 'analyze-last-run',
      command: 'workspaceAnalyze',
      cardId: 'analyze',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'release-readiness-last-run.json',
    binding: {
      kind: 'release-readiness-last-run',
      command: 'workspaceReadiness',
      cardId: 'readiness',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name.startsWith('bootstrap-compliance') && name.endsWith('.json'),
    binding: {
      kind: 'bootstrap-compliance',
      command: 'workspaceBootstrap',
      cardId: 'bootstrap',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'autopilot-release.json',
    binding: {
      kind: 'autopilot-release',
      command: 'workspaceAutopilotRelease',
      cardId: 'autopilot',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'share-bundle.json',
    binding: {
      kind: 'share-bundle',
      command: 'workspaceShare',
      cardId: 'share',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'snapshot-last-run.json' || name.startsWith('snapshot-'),
    binding: {
      kind: 'snapshot-last-run',
      command: 'workspaceSnapshotCreate',
      cardId: 'snapshot',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'archive-manifest.json',
    binding: {
      kind: 'archive-manifest',
      command: 'workspaceArchive',
      cardId: 'archive',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'mirror-ops.latest.json' || name.startsWith('mirror-ops-'),
    binding: {
      kind: 'mirror-ops',
      command: 'mirrorStatus',
      cardId: 'mirror',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'infra-plan.json',
    binding: {
      kind: 'infra-plan',
      command: 'workspaceInfra',
      cardId: 'infra',
      scope: 'workspace',
    },
  },
];

export function resolveReportBinding(filePath: string): DashboardReportBinding | undefined {
  const fileName = path.basename(filePath);
  return REPORT_BINDINGS.find((entry) => entry.match(fileName))?.binding;
}

export function normalizeEvidenceStatus(value: unknown): DashboardEvidenceStatus {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (
    normalized === 'pass' ||
    normalized === 'ready' ||
    normalized === 'ok' ||
    normalized === 'approved' ||
    normalized === 'success' ||
    normalized === 'succeeded'
  ) {
    return 'pass';
  }
  if (
    normalized === 'warn' ||
    normalized === 'needs-attention' ||
    normalized === 'partial' ||
    normalized === 'warning'
  ) {
    return 'warn';
  }
  if (
    normalized === 'fail' ||
    normalized === 'blocked' ||
    normalized === 'failing' ||
    normalized === 'failed' ||
    normalized === 'error'
  ) {
    return 'fail';
  }
  return 'missing';
}

function collectStringItems(value: unknown, limit = 6): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, limit);
}

export function extractBlockersFromReport(
  kind: DashboardReportKind,
  raw: Record<string, unknown>,
  options?: { projectPath?: string; projectName?: string }
): string[] {
  switch (kind) {
    case 'release-readiness-last-run':
      return collectStringItems(raw.blockingReasons, 8);
    case 'bootstrap-compliance':
      return collectStringItems(raw.violations ?? raw.blockers ?? raw.issues, 8);
    case 'autopilot-release': {
      const blockers = collectStringItems(raw.blockingReasons ?? raw.blockers, 8);
      if (blockers.length > 0) {
        return blockers;
      }
      const verdict = normalizeEvidenceStatus(raw.overallStatus ?? raw.status ?? raw.result);
      if (verdict === 'fail') {
        return collectStringItems(raw.errors ?? raw.messages, 8);
      }
      return [];
    }
    case 'analyze-last-run': {
      const summary =
        raw.summary && typeof raw.summary === 'object'
          ? (raw.summary as Record<string, unknown>)
          : {};
      const findings =
        summary.findings && typeof summary.findings === 'object'
          ? (summary.findings as Record<string, unknown>)
          : {};
      const items = collectStringItems(findings.items ?? findings.blockers ?? raw.blockers, 8);
      if (items.length > 0) {
        return items;
      }
      const fail = Number(findings.fail ?? 0);
      return fail > 0 ? [`${fail} analyze finding(s) require attention`] : [];
    }
    case 'doctor-last-run':
    case 'doctor-project-last-run': {
      const projects = Array.isArray(raw.projects) ? raw.projects : [];
      const projectPath = options?.projectPath;
      const projectName = options?.projectName;
      const scopedProjects = projects.filter((entry) => {
        if (!entry || typeof entry !== 'object') {
          return false;
        }
        const record = entry as Record<string, unknown>;
        if (projectPath && typeof record.path === 'string') {
          return record.path === projectPath;
        }
        if (projectName && typeof record.name === 'string') {
          return record.name === projectName;
        }
        return true;
      });
      const issues: string[] = [];
      for (const entry of scopedProjects) {
        const record = entry as Record<string, unknown>;
        issues.push(...collectStringItems(record.issues, 6));
      }
      if (issues.length > 0) {
        return issues.slice(0, 8);
      }
      const healthScore =
        raw.healthScore && typeof raw.healthScore === 'object'
          ? (raw.healthScore as Record<string, unknown>)
          : {};
      const errors = Number(healthScore.errors ?? 0);
      return errors > 0 ? [`${errors} doctor error(s) detected`] : [];
    }
    case 'share-bundle': {
      const healthTotals =
        raw.healthTotals && typeof raw.healthTotals === 'object'
          ? (raw.healthTotals as Record<string, unknown>)
          : {};
      const errors = Number(healthTotals.errors ?? 0);
      const blockers = collectStringItems(raw.blockingReasons, 8);
      if (blockers.length > 0) {
        return blockers;
      }
      return errors > 0 ? [`Share bundle reports ${errors} health error(s)`] : [];
    }
    case 'snapshot-last-run':
      return collectStringItems(raw.errors ?? raw.warnings, 6);
    case 'archive-manifest':
      return collectStringItems(raw.blockers ?? raw.issues, 6);
    case 'mirror-ops': {
      const mirror =
        raw.mirror && typeof raw.mirror === 'object' ? (raw.mirror as Record<string, unknown>) : {};
      if (mirror.configExists === false) {
        return ['Mirror config is missing'];
      }
      return collectStringItems(raw.errors ?? raw.messages, 6);
    }
    case 'infra-plan':
      return collectStringItems(raw.errors ?? raw.warnings ?? raw.blockers, 6);
    default:
      return [];
  }
}

export function activityStatusFromEvidenceStatus(
  status: DashboardEvidenceStatus
): 'completed' | 'failed' | 'dispatched' {
  if (status === 'pass') {
    return 'completed';
  }
  if (status === 'fail') {
    return 'failed';
  }
  if (status === 'warn') {
    return 'completed';
  }
  return 'dispatched';
}

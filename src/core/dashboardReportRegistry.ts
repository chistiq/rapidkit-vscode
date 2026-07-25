import path from 'path';

import { collectDoctorProjectRecordBlockers } from './doctorEvidenceBlockers.js';
import type { DashboardEvidenceStatus } from './dashboardEvidenceBridge';
import { resolveWorkspaceRunCardReport } from './workspaceRunEvidence.js';
import { summarizePolicyViolations } from './workspacePolicyViolations.js';

export type DashboardReportKind =
  | 'doctor-last-run'
  | 'doctor-project-last-run'
  | 'pipeline-last-run'
  | 'analyze-last-run'
  | 'release-readiness-last-run'
  | 'bootstrap-compliance'
  | 'autopilot-release'
  | 'workspace-run-last'
  | 'import-readiness'
  | 'share-bundle'
  | 'snapshot-last-run'
  | 'workspace-model'
  | 'workspace-knowledge-graph'
  | 'workspace-intelligence-evaluation'
  | 'workspace-model-snapshot'
  | 'workspace-model-diff'
  | 'workspace-impact'
  | 'workspace-intelligence-run'
  | 'workspace-verify'
  | 'workspace-contract-verify'
  | 'workspace-explain'
  | 'workspace-why'
  | 'workspace-trace'
  | 'workspace-skills-index'
  | 'workspace-context-agent'
  | 'agent-customization-pack'
  | 'agent-reports-index'
  | 'doctor-remediation-plan'
  | 'artifact-remediation-plan'
  | 'doctor-fix-result'
  | 'rapidkit-mcp-design'
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
      command: 'projectDoctor',
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
    match: (name) => name === 'pipeline-last-run.json',
    binding: {
      kind: 'pipeline-last-run',
      command: 'workspacePipeline',
      cardId: 'pipeline',
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
    match: (name) =>
      name === 'autopilot-release.json' || name === 'autopilot-release-last-run.json',
    binding: {
      kind: 'autopilot-release',
      command: 'workspaceAutopilotRelease',
      cardId: 'autopilot',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'workspace-run-last.json',
    binding: {
      kind: 'workspace-run-last',
      command: 'workspaceRunTest',
      cardId: 'workspaceRun',
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
    match: (name) => name === 'workspace-model.json',
    binding: {
      kind: 'workspace-model',
      command: 'workspaceModel',
      cardId: 'workspaceModel',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'workspace-knowledge-graph.json',
    binding: {
      kind: 'workspace-knowledge-graph',
      command: 'workspaceModel',
      cardId: 'workspaceModel',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'workspace-intelligence-evaluation-live.json',
    binding: {
      kind: 'workspace-intelligence-evaluation',
      command: 'workspaceEvaluationReport',
      cardId: 'workspaceIntelligenceRun',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'workspace-intelligence-evaluation-last-run.json',
    binding: {
      kind: 'workspace-intelligence-evaluation',
      command: 'workspaceEvaluationReport',
      cardId: 'workspaceIntelligenceRun',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'workspace-model-snapshot.json',
    binding: {
      kind: 'workspace-model-snapshot',
      command: 'workspaceIntelligenceSnapshot',
      cardId: 'intelligenceSnapshot',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'workspace-model-diff-last-run.json',
    binding: {
      kind: 'workspace-model-diff',
      command: 'workspaceDiff',
      cardId: 'workspaceDiff',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'workspace-impact-last-run.json',
    binding: {
      kind: 'workspace-impact',
      command: 'workspaceImpact',
      cardId: 'workspaceImpact',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'workspace-intelligence-run-last-run.json',
    binding: {
      kind: 'workspace-intelligence-run',
      command: 'workspaceIntelligenceChain',
      cardId: 'workspaceIntelligenceRun',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'workspace-context-agent.json',
    binding: {
      kind: 'workspace-context-agent',
      command: 'workspaceContextAgent',
      cardId: 'workspaceContextAgent',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'agent-customization-pack.json',
    binding: {
      kind: 'agent-customization-pack',
      command: 'workspaceAgentSync',
      cardId: 'agentGrounding',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'INDEX.json',
    binding: {
      kind: 'agent-reports-index',
      command: 'workspaceAgentSync',
      cardId: 'agentGrounding',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'workspai-mcp-design.json' || name === 'rapidkit-mcp-design.json',
    binding: {
      kind: 'rapidkit-mcp-design',
      command: 'workspaceAgentSync',
      cardId: 'agentGrounding',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'doctor-remediation-plan-last-run.json',
    binding: {
      kind: 'doctor-remediation-plan',
      command: 'checkWorkspaceHealth',
      cardId: 'doctor',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'artifact-remediation-plan-last-run.json',
    binding: {
      kind: 'artifact-remediation-plan',
      command: 'workspaceRemediationPlan',
      cardId: 'remediationPlan',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'doctor-fix-result-last-run.json',
    binding: {
      kind: 'doctor-fix-result',
      command: 'checkWorkspaceHealth',
      cardId: 'doctor',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'workspace-verify-last-run.json',
    binding: {
      kind: 'workspace-verify',
      command: 'workspaceVerify',
      cardId: 'workspaceVerify',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'workspace-contract-verify-last-run.json',
    binding: {
      kind: 'workspace-contract-verify',
      command: 'workspaceContractVerify',
      cardId: 'contract',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'workspace-explain-last-run.json',
    binding: {
      kind: 'workspace-explain',
      command: 'workspaceExplain',
      cardId: 'workspaceExplain',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'workspace-why-last-run.json',
    binding: {
      kind: 'workspace-why',
      command: 'workspaceWhy',
      cardId: 'workspaceWhy',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'workspace-trace-last-run.json',
    binding: {
      kind: 'workspace-trace',
      command: 'workspaceTrace',
      cardId: 'workspaceTrace',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'workspace-skills-index.json',
    binding: {
      kind: 'workspace-skills-index',
      command: 'workspaceAgentSync',
      cardId: 'agentGrounding',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'archive-manifest.json',
    binding: {
      kind: 'archive-manifest',
      command: 'exportWorkspace',
      cardId: 'archive',
      scope: 'workspace',
    },
  },
  {
    match: (name) => name === 'import-readiness.json',
    binding: {
      kind: 'import-readiness',
      command: 'projectDoctor',
      cardId: 'importReadiness',
      scope: 'project',
    },
  },
  {
    match: (name) => name === 'mirror-ops.latest.json' || name.startsWith('mirror-ops-'),
    binding: {
      kind: 'mirror-ops',
      command: 'mirrorOps',
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

const EVIDENCE_CARD_COMMAND_FALLBACKS: Record<string, string> = {
  doctor: 'checkWorkspaceHealth',
  projectDoctor: 'projectDoctor',
  pipeline: 'workspacePipeline',
  analyze: 'workspaceAnalyze',
  readiness: 'workspaceReadiness',
  bootstrap: 'workspaceBootstrap',
  workspaceSync: 'workspaceSync',
  foundation: 'workspaceFoundationEnsure',
  contract: 'workspaceContractVerify',
  autopilot: 'workspaceAutopilotRelease',
  workspaceRun: 'workspaceRunTest',
  setup: 'workspaceSetup',
  importReadiness: 'projectDoctor',
  snapshot: 'workspaceSnapshotCreate',
  workspaceModel: 'workspaceModel',
  intelligenceSnapshot: 'workspaceIntelligenceSnapshot',
  workspaceDiff: 'workspaceDiff',
  workspaceImpact: 'workspaceImpact',
  workspaceIntelligenceRun: 'workspaceIntelligenceChain',
  workspaceVerify: 'workspaceVerify',
  workspaceExplain: 'workspaceExplain',
  workspaceWhy: 'workspaceWhy',
  workspaceTrace: 'workspaceTrace',
  workspaceWatch: 'workspaceWatch',
  workspaceContextAgent: 'workspaceContextAgent',
  agentGrounding: 'workspaceAgentSync',
  share: 'workspaceShare',
  archive: 'workspaceArchive',
  mirror: 'mirrorOps',
  cache: 'cacheStatus',
  policy: 'workspacePolicyShow',
  infra: 'workspaceInfra',
};

export function resolveReportBinding(filePath: string): DashboardReportBinding | undefined {
  const fileName = path.basename(filePath);
  return REPORT_BINDINGS.find((entry) => entry.match(fileName))?.binding;
}

export function resolveEvidenceCardIdsForDashboardCommand(command: string): string[] {
  const cardIds = [
    ...REPORT_BINDINGS.filter((entry) => entry.binding.command === command).map(
      (entry) => entry.binding.cardId
    ),
    ...Object.entries(EVIDENCE_CARD_COMMAND_FALLBACKS)
      .filter(([, mappedCommand]) => mappedCommand === command)
      .map(([cardId]) => cardId),
  ];
  return [...new Set(cardIds)];
}

export function resolveDashboardCommandForEvidenceCard(cardId: string): string | undefined {
  if (cardId === 'workspaceIntelligenceRun') {
    return EVIDENCE_CARD_COMMAND_FALLBACKS[cardId];
  }
  return (
    REPORT_BINDINGS.find((entry) => entry.binding.cardId === cardId)?.binding.command ??
    EVIDENCE_CARD_COMMAND_FALLBACKS[cardId]
  );
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
  const explicitBlockers = collectStringItems(raw.blockers, 12);
  if (explicitBlockers.length > 0) {
    return explicitBlockers;
  }

  switch (kind) {
    case 'workspace-verify': {
      const policy = summarizePolicyViolations(raw);
      if (policy.blockers.length > 0) {
        return policy.blockers.slice(0, 8);
      }
      return collectStringItems(raw.blockingReasons ?? raw.missingEvidence, 8);
    }
    case 'release-readiness-last-run':
      return collectStringItems(raw.blockingReasons, 8);
    case 'pipeline-last-run':
      return collectStringItems(raw.blockingReasons, 8);
    case 'bootstrap-compliance':
      return collectStringItems(
        raw.violations ??
          raw.blockers ??
          raw.issues ??
          (Array.isArray(raw.checks)
            ? raw.checks
                .filter(
                  (entry) =>
                    entry &&
                    typeof entry === 'object' &&
                    (entry as Record<string, unknown>).status === 'failed'
                )
                .map((entry) => {
                  const record = entry as Record<string, unknown>;
                  return typeof record.message === 'string'
                    ? record.message
                    : 'Bootstrap check failed';
                })
            : undefined),
        8
      );
    case 'autopilot-release': {
      const blockers = collectStringItems(raw.blockingReasons ?? raw.blockers, 8);
      if (blockers.length > 0) {
        return blockers;
      }
      const summary =
        raw.summary && typeof raw.summary === 'object'
          ? (raw.summary as Record<string, unknown>)
          : {};
      const verdict = normalizeEvidenceStatus(
        raw.overallStatus ?? raw.status ?? raw.result ?? summary.verdict
      );
      if (verdict === 'fail') {
        return collectStringItems(raw.errors ?? raw.messages, 8);
      }
      return [];
    }
    case 'workspace-run-last': {
      const stageReport = resolveWorkspaceRunCardReport(raw) ?? raw;
      const projects = Array.isArray(stageReport.projects) ? stageReport.projects : [];
      const failedMessages = projects
        .filter(
          (entry) =>
            entry &&
            typeof entry === 'object' &&
            (entry as Record<string, unknown>).status === 'failed'
        )
        .map((entry) => {
          const record = entry as Record<string, unknown>;
          const name = typeof record.relativePath === 'string' ? record.relativePath : 'project';
          const reason =
            typeof record.reason === 'string'
              ? record.reason
              : typeof record.errorMessage === 'string'
                ? record.errorMessage
                : 'failed';
          return `${name}: ${reason}`;
        });
      if (failedMessages.length > 0) {
        return failedMessages.slice(0, 8);
      }
      const gates =
        stageReport.gates && typeof stageReport.gates === 'object'
          ? (stageReport.gates as Record<string, unknown>)
          : undefined;
      if (gates?.blocked === true) {
        const gate = typeof gates.blockingGate === 'string' ? gates.blockingGate : 'workspace gate';
        return [`Blocked by ${gate}`];
      }
      return collectStringItems(stageReport.blockingReasons ?? stageReport.blockers, 8);
    }
    case 'import-readiness': {
      const checks = Array.isArray(raw.checks) ? raw.checks : [];
      const failedChecks = checks
        .filter(
          (entry) =>
            entry &&
            typeof entry === 'object' &&
            (entry as Record<string, unknown>).status === 'fail'
        )
        .map((entry) => {
          const record = entry as Record<string, unknown>;
          return typeof record.message === 'string'
            ? record.message
            : 'Import readiness check failed';
        });
      if (failedChecks.length > 0) {
        return failedChecks.slice(0, 8);
      }
      return collectStringItems(raw.blockingReasons ?? raw.blockers, 8);
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
      const singletonProject = raw.project && typeof raw.project === 'object' ? [raw.project] : [];
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
      for (const entry of singletonProject) {
        const record = entry as Record<string, unknown>;
        const matchesPath =
          projectPath && typeof record.path === 'string' ? record.path === projectPath : undefined;
        const matchesName =
          projectName && typeof record.name === 'string' ? record.name === projectName : undefined;
        if (matchesPath === true || matchesName === true || (!projectPath && !projectName)) {
          scopedProjects.push(entry);
        }
      }
      const blockers: string[] = [];
      for (const entry of scopedProjects) {
        blockers.push(...collectDoctorProjectRecordBlockers(entry as Record<string, unknown>, 8));
      }
      if (blockers.length > 0) {
        return blockers.slice(0, 8);
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
    case 'workspace-model': {
      const validation =
        raw.validation && typeof raw.validation === 'object'
          ? (raw.validation as Record<string, unknown>)
          : {};
      const errors = Number(validation.errors ?? 0);
      const warnings = Number(validation.warnings ?? 0);
      if (errors > 0) {
        return [`${errors} workspace model validation error(s)`];
      }
      if (warnings > 0) {
        return [`${warnings} workspace model validation warning(s)`];
      }
      return [];
    }
    case 'workspace-model-diff': {
      const summary =
        raw.summary && typeof raw.summary === 'object'
          ? (raw.summary as Record<string, unknown>)
          : {};
      const changes = Array.isArray(raw.changes) ? raw.changes : [];
      const critical = changes
        .filter((entry) => {
          if (!entry || typeof entry !== 'object') {
            return false;
          }
          return (entry as Record<string, unknown>).severity === 'critical';
        })
        .map((entry) => {
          const record = entry as Record<string, unknown>;
          return typeof record.message === 'string' ? record.message : '';
        })
        .filter((message) => message.length > 0);
      if (critical.length > 0) {
        return critical.slice(0, 8);
      }
      if (summary.changed === true) {
        return ['Workspace model changed since baseline'];
      }
      return [];
    }
    case 'workspace-impact': {
      const summary =
        raw.summary && typeof raw.summary === 'object'
          ? (raw.summary as Record<string, unknown>)
          : {};
      const risk = typeof summary.risk === 'string' ? summary.risk : 'none';
      if (risk === 'critical' || risk === 'high') {
        const brief =
          raw.agentBrief && typeof raw.agentBrief === 'object'
            ? (raw.agentBrief as Record<string, unknown>)
            : {};
        const bullets = collectStringItems(brief.bullets, 6);
        if (bullets.length > 0) {
          return bullets;
        }
        return [`Workspace impact risk: ${risk}`];
      }
      return [];
    }
    case 'workspace-context-agent': {
      const validation =
        raw.validation && typeof raw.validation === 'object'
          ? (raw.validation as Record<string, unknown>)
          : {};
      const errors = Number(validation.errors ?? 0);
      if (errors > 0) {
        return [`Agent context validation has ${errors} error(s)`];
      }
      const missing =
        raw.evidence && typeof raw.evidence === 'object'
          ? collectStringItems((raw.evidence as Record<string, unknown>).missing, 6)
          : [];
      return missing;
    }
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
    case 'workspace-explain':
    case 'workspace-why':
    case 'workspace-trace':
      return collectStringItems(raw.blockingReasons ?? raw.blockers, 8);
    case 'workspace-skills-index':
      return collectStringItems(raw.blockers, 8);
    case 'workspace-contract-verify': {
      const violations = Array.isArray(raw.violations) ? raw.violations : [];
      if (violations.length > 0) {
        return violations.filter((entry): entry is string => typeof entry === 'string').slice(0, 8);
      }
      const status = String(raw.status ?? '').toLowerCase();
      return status === 'failed' || status === 'fail'
        ? ['Workspace contract verification failed']
        : [];
    }
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

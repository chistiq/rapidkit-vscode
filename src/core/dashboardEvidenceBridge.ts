import fs from 'fs-extra';
import path from 'path';

import {
  extractBlockersFromReport,
  normalizeEvidenceStatus,
  type DashboardReportKind,
} from './dashboardReportRegistry.js';
import type { DashboardEvidenceCardId } from '../contracts/dashboardEvidenceCards.js';
import { summarizePolicyViolations } from './workspacePolicyViolations.js';
import { readWorkspaceTrend } from './workspaceTrend.js';
import type { DashboardTrendSummary } from './workspaceTrend.js';
import {
  formatWorkspaceRegistrySyncSummary,
  readWorkspaceRegistrySummaryFromDisk,
  WORKSPACE_REGISTRY_SUMMARY_RELATIVE_PATH,
} from './workspaceRegistrySummary.js';
import {
  formatWorkspaceRunEvidenceSummary,
  listWorkspaceRunStageReports,
  resolveWorkspaceRunCardReport,
} from './workspaceRunEvidence.js';
import {
  agentCustomizationPackStatus,
  parseAgentCustomizationPack,
  summarizeAgentCustomizationPack,
} from './agentCustomizationPack.js';
import {
  readWorkspaceExplainReportArtifact,
  readWorkspaceTraceReportArtifact,
  readWorkspaceWhyReportArtifact,
  summarizeWorkspaceExplain,
  type WorkspaceExplainReport,
} from './workspaceExplainReader.js';
import {
  readWorkspaceSkillsIndexArtifact,
  summarizeOperationalSkills,
} from './workspaceSkillsIndexReader.js';
import {
  WORKSPACE_EXPLAIN_REPORT_PATH,
  WORKSPACE_TRACE_REPORT_PATH,
  WORKSPACE_WHY_REPORT_PATH,
  WORKSPACE_CONTRACT_VERIFY_REPORT_PATH,
  RAPIDKIT_MCP_DESIGN_REPORT_PATH,
} from './workspaceIntelligencePaths.js';
import {
  readWorkspaceContractVerifyEvidenceArtifact,
  summarizeWorkspaceContractVerify,
} from './workspaceContractVerifyReader.js';
import {
  filterBlockersForEmptyWorkspace,
  isEmptyWorkspaceScaffoldBlocker,
} from './workspaceScaffoldEvidence.js';
import { buildWorkspaceModelDetailSections } from './workspaceModelGraphVisual.js';
import { readJsonArtifact, type JsonArtifactReadResult } from './jsonArtifactReader.js';
import {
  buildStudioIncidentSummary,
  type StudioIncidentSummary,
} from '../contracts/studio-blocker-handoff-contract.js';
import { DEFAULT_VERIFY_COMMAND } from './studioCardSourceShell.js';

export type { DashboardEvidenceCardId };

function logEvidenceBridgeWarning(scope: string, detail: string, error?: unknown): void {
  const suffix =
    error === undefined ? '' : `: ${error instanceof Error ? error.message : String(error)}`;
  console.warn(`[dashboardEvidenceBridge] ${scope} ${detail}${suffix}`);
}

export type DashboardEvidenceStatus = 'pass' | 'warn' | 'fail' | 'missing';

export type DashboardEvidenceScope = 'workspace' | 'project';

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
  detailSections?: Array<{ id: string; title: string; body: string }>;
  incidentSummary?: StudioIncidentSummary;
  incidentStudioTarget?:
    | 'doctor'
    | 'analyze'
    | 'readiness'
    | 'release'
    | 'impact'
    | 'model'
    | 'pipeline';
};

function attachDashboardIncidentSummary(card: DashboardEvidenceCard): DashboardEvidenceCard {
  if (!card.incidentStudioTarget) {
    return card;
  }
  return {
    ...card,
    incidentSummary: buildStudioIncidentSummary({
      cardId: card.id,
      cardLabel: card.label,
      cardStatus: card.status,
      verifyCommand: card.status === 'pass' ? undefined : DEFAULT_VERIFY_COMMAND,
      auditStatus: 'not-started',
    }),
  };
}

export type DashboardEvidenceBundle = {
  workspacePath?: string;
  projectPath?: string;
  projectName?: string;
  cards: DashboardEvidenceCard[];
  trend?: DashboardTrendSummary | null;
};

function isStaleEvidenceBlocker(blocker: string): boolean {
  const lower = blocker.toLowerCase();
  return (
    lower.includes('evidence is stale') ||
    lower.includes('is stale relative to') ||
    (lower.includes('generated at') && lower.includes('before impact')) ||
    (lower.includes('stale report:') && lower.includes('.rapidkit/reports/'))
  );
}

function staleEvidenceMetric(blockers: string[]): Record<string, number | string> {
  const staleBlocker = blockers.find(isStaleEvidenceBlocker);
  return staleBlocker
    ? {
        staleEvidence: 1,
        staleEvidenceDetail: staleBlocker.slice(0, 240),
      }
    : {};
}

function governanceMetricsFromReport(
  raw: Record<string, unknown>
): Record<string, number | string> {
  const metrics: Record<string, number | string> = {};
  if (typeof raw.exitCode === 'number') {
    metrics.exitCode = raw.exitCode;
  }
  if (typeof raw.commandId === 'string') {
    metrics.commandId = raw.commandId;
  }
  if (typeof raw.runId === 'string') {
    metrics.runId = raw.runId;
  }
  if (typeof raw.stderrTail === 'string' && raw.stderrTail.trim()) {
    metrics.stderrTail = raw.stderrTail.slice(0, 500);
  }
  return metrics;
}

function mergeReportMetrics(
  base: Record<string, number | string>,
  raw: Record<string, unknown>
): Record<string, number | string> {
  return { ...base, ...governanceMetricsFromReport(raw) };
}

function softenEmptyWorkspaceVerifyStatus(input: {
  workspaceProjectCount: number;
  status: DashboardEvidenceStatus;
  policy: { errors: number; warnings: number };
  blockers: string[];
  verdict: string;
}): DashboardEvidenceStatus {
  if (input.workspaceProjectCount > 0 || input.status !== 'fail' || input.policy.errors > 0) {
    return input.status;
  }
  const scaffoldOnly =
    input.blockers.length === 0 ||
    input.blockers.every((blocker) => isEmptyWorkspaceScaffoldBlocker(blocker));
  if (
    scaffoldOnly &&
    (input.verdict === 'blocked' ||
      input.verdict === 'needs-attention' ||
      input.policy.warnings > 0)
  ) {
    return 'warn';
  }
  return input.status;
}

function softenEmptyWorkspaceGroundingStatus(input: {
  workspaceProjectCount: number;
  status: DashboardEvidenceStatus;
  blockers: string[];
}): DashboardEvidenceStatus {
  if (input.workspaceProjectCount > 0) {
    return input.status;
  }
  const scaffoldOnly =
    input.blockers.length === 0 ||
    input.blockers.every((blocker) => isEmptyWorkspaceScaffoldBlocker(blocker));
  if (scaffoldOnly && input.status === 'fail') {
    return 'warn';
  }
  return input.status;
}

function softenEmptyWorkspaceAnalyzeStatus(input: {
  workspaceProjectCount: number;
  status: DashboardEvidenceStatus;
  fail: number;
  warn: number;
  blockers: string[];
}): DashboardEvidenceStatus {
  if (input.workspaceProjectCount > 0 || input.fail > 0) {
    return input.status;
  }
  const scaffoldOnly =
    input.warn > 0 &&
    input.fail === 0 &&
    (input.blockers.length === 0 ||
      input.blockers.every((blocker) => isEmptyWorkspaceScaffoldBlocker(blocker)));
  if (scaffoldOnly && input.status === 'fail') {
    return 'warn';
  }
  return input.status;
}

function softenEmptyWorkspacePipelineStatus(input: {
  workspaceProjectCount: number;
  status: DashboardEvidenceStatus;
  blockers: string[];
}): DashboardEvidenceStatus {
  if (input.workspaceProjectCount > 0) {
    return input.status;
  }
  const scaffoldOnly =
    input.blockers.length === 0 ||
    input.blockers.every((blocker) => isEmptyWorkspaceScaffoldBlocker(blocker));
  if (scaffoldOnly && input.status === 'fail') {
    return 'warn';
  }
  return input.status;
}

function buildMcpDesignDetailSections(
  raw: Record<string, unknown> | null
): Array<{ id: string; title: string; body: string }> {
  if (!raw) {
    return [];
  }
  const tools = Array.isArray(raw.candidateTools) ? raw.candidateTools : [];
  return tools
    .slice(0, 12)
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const tool = entry as Record<string, unknown>;
      const name = typeof tool.name === 'string' ? tool.name : `tool-${index + 1}`;
      const reads = Array.isArray(tool.reads) ? tool.reads.join(', ') : '';
      const mutates = tool.mutates === true ? 'mutates workspace' : 'read-only';
      return {
        id: `mcp-${name}`,
        title: name,
        body: [
          typeof tool.summary === 'string' ? tool.summary : '',
          reads ? `reads: ${reads}` : '',
          mutates,
        ]
          .filter(Boolean)
          .join('\n'),
      };
    })
    .filter((section): section is { id: string; title: string; body: string } => Boolean(section));
}

function softenEmptyWorkspaceExplainStatus(input: {
  workspaceProjectCount: number;
  status: DashboardEvidenceStatus;
  blockers: string[];
}): DashboardEvidenceStatus {
  if (input.workspaceProjectCount > 0 || input.status !== 'fail') {
    return input.status;
  }
  const scaffoldOnly =
    input.blockers.length === 0 ||
    input.blockers.every(
      (blocker) =>
        isEmptyWorkspaceScaffoldBlocker(blocker) ||
        blocker.toLowerCase().includes('no projects') ||
        blocker.toLowerCase().includes('release')
    );
  return scaffoldOnly ? 'warn' : input.status;
}

function resolveExplainEvidenceStatus(
  explainReport: WorkspaceExplainReport,
  workspaceProjectCount: number
): DashboardEvidenceStatus {
  const blockers = explainReport.blockingReasons ?? [];
  const risk = explainReport.releaseRisk?.toLowerCase() ?? '';
  return softenEmptyWorkspaceExplainStatus({
    workspaceProjectCount,
    status:
      blockers.length > 0
        ? 'warn'
        : risk === 'critical' || risk === 'high'
          ? 'fail'
          : risk === 'medium' || risk === 'moderate'
            ? 'warn'
            : 'pass',
    blockers,
  });
}

function buildExplainDerivedEvidenceCard(
  id: 'workspaceExplain' | 'workspaceWhy' | 'workspaceTrace',
  label: string,
  explainReport: WorkspaceExplainReport,
  workspaceProjectCount: number,
  reportsDir: string,
  artifactRelativePath: string,
  options?: { derivedFrom?: string }
): DashboardEvidenceCard {
  const blockers = explainReport.blockingReasons ?? [];
  const status = resolveExplainEvidenceStatus(explainReport, workspaceProjectCount);
  const derivedSections = options?.derivedFrom
    ? [
        {
          id: 'artifact-source',
          title: 'Artifact source',
          body: `${label} is currently derived from ${options.derivedFrom}. Run the dedicated command to produce its own last-run artifact.`,
        },
      ]
    : [];
  return {
    id,
    label,
    status,
    summary: options?.derivedFrom
      ? `Derived from ${options.derivedFrom} · ${summarizeWorkspaceExplain(explainReport, { workspaceProjectCount })}`
      : summarizeWorkspaceExplain(explainReport, { workspaceProjectCount }),
    scope: 'workspace',
    generatedAt: explainReport.generatedAt,
    artifactPath: path.join(reportsDir, path.basename(artifactRelativePath)),
    metrics: {
      blockers: blockers.length,
      ...(options?.derivedFrom ? { derivedArtifact: 1, derivedFrom: options.derivedFrom } : {}),
      ...staleEvidenceMetric(blockers),
    },
    blockers: blockers.slice(0, 8),
    detailSections: [...derivedSections, ...explainReport.sections].slice(0, 12),
    incidentStudioTarget: id === 'workspaceTrace' ? 'impact' : 'release',
  };
}

function reportGeneratedAt(raw: Record<string, unknown>): string | undefined {
  if (typeof raw.generatedAt === 'string') {
    return raw.generatedAt;
  }
  if (typeof raw.timestamp === 'string') {
    return raw.timestamp;
  }
  return undefined;
}

async function readJsonIfExists(filePath: string): Promise<Record<string, unknown> | undefined> {
  const result = await readJsonArtifact(filePath);
  if (result.kind === 'valid') {
    return result.raw;
  }
  if (result.kind === 'corrupt' || result.kind === 'incompatible') {
    logEvidenceBridgeWarning('readJsonIfExists', filePath, result.error);
  }
  return undefined;
}

function isArtifactReadFailure<T extends { kind: string }>(
  result: T
): result is T & { kind: 'corrupt' | 'incompatible'; artifactPath: string; error: string } {
  return result.kind === 'corrupt' || result.kind === 'incompatible';
}

function corruptArtifactCard(input: {
  id: DashboardEvidenceCardId;
  label: string;
  artifactPath: string;
  error: string;
  kind?: 'corrupt' | 'incompatible';
  scope?: DashboardEvidenceScope;
  incidentStudioTarget?: DashboardEvidenceCard['incidentStudioTarget'];
}): DashboardEvidenceCard {
  const message = input.error.split('\n').slice(0, 2).join(' ').slice(0, 240);
  const incompatible = input.kind === 'incompatible';
  return {
    id: input.id,
    label: input.label,
    status: 'fail',
    summary: incompatible
      ? 'Artifact schema is incompatible with this extension.'
      : 'Artifact is unreadable or corrupt.',
    scope: input.scope ?? 'workspace',
    artifactPath: input.artifactPath,
    metrics: { corruptArtifact: 1 },
    blockers: [
      `${incompatible ? 'Incompatible' : 'Corrupt'} artifact: ${path.basename(input.artifactPath)}`,
      message,
    ],
    detailSections: [
      {
        id: 'artifact-read-error',
        title: incompatible ? 'Artifact compatibility error' : 'Artifact read error',
        body: [`path: ${input.artifactPath}`, `error: ${message}`].join('\n'),
      },
    ],
    incidentStudioTarget: input.incidentStudioTarget,
  };
}

function validateWorkspaceModelArtifact(raw: Record<string, unknown>): string | undefined {
  const summary = raw.summary;
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return 'Workspace model artifact is missing summary metadata.';
  }
  const validation = raw.validation;
  if (!validation || typeof validation !== 'object' || Array.isArray(validation)) {
    return 'Workspace model artifact is missing validation metadata.';
  }
  return undefined;
}

function validOrCorruptWorkspaceModelArtifact(
  result: JsonArtifactReadResult
): JsonArtifactReadResult {
  if (result.kind !== 'valid') {
    return result;
  }
  const schemaError = validateWorkspaceModelArtifact(result.raw);
  return schemaError
    ? {
        kind: 'incompatible',
        artifactPath: result.artifactPath,
        error: `Artifact schema is incompatible: expected workspace-model.v1, got ${typeof result.raw.schemaVersion === 'string' ? result.raw.schemaVersion : 'missing'}. ${schemaError}`,
      }
    : result;
}

async function readAutopilotReleaseReport(
  reportsDir: string
): Promise<{ raw: Record<string, unknown>; artifactPath: string } | undefined> {
  const aliasPath = path.join(reportsDir, AUTOPILOT_RELEASE_ALIAS_REPORT);
  const lastRunPath = path.join(reportsDir, AUTOPILOT_RELEASE_LAST_RUN_REPORT);
  const aliasRaw = await readJsonIfExists(aliasPath);
  if (aliasRaw) {
    return { raw: aliasRaw, artifactPath: aliasPath };
  }
  const lastRunRaw = await readJsonIfExists(lastRunPath);
  if (lastRunRaw) {
    return { raw: lastRunRaw, artifactPath: lastRunPath };
  }
  return undefined;
}

function autopilotEvidenceStatus(raw: Record<string, unknown>): DashboardEvidenceStatus {
  const summary =
    raw.summary && typeof raw.summary === 'object' ? (raw.summary as Record<string, unknown>) : {};
  return normalizeEvidenceStatus(raw.overallStatus ?? raw.status ?? raw.result ?? summary.verdict);
}

function summarizeToolchainSetup(input: {
  toolchainRaw?: Record<string, unknown>;
  workspaceProfile?: string;
}): Pick<DashboardEvidenceCard, 'status' | 'summary' | 'blockers'> {
  if (!input.toolchainRaw) {
    return {
      status: 'missing',
      summary: 'No toolchain.lock yet. Run rapidkit setup to pin runtimes.',
      blockers: [],
    };
  }

  const runtime =
    input.toolchainRaw.runtime && typeof input.toolchainRaw.runtime === 'object'
      ? (input.toolchainRaw.runtime as Record<string, unknown>)
      : {};
  const nodeRecord =
    runtime.node && typeof runtime.node === 'object'
      ? (runtime.node as Record<string, unknown>)
      : {};
  const pythonRecord =
    runtime.python && typeof runtime.python === 'object'
      ? (runtime.python as Record<string, unknown>)
      : {};
  const nodeVersion = typeof nodeRecord.version === 'string' ? nodeRecord.version : undefined;
  const pythonVersion = typeof pythonRecord.version === 'string' ? pythonRecord.version : undefined;
  const pythonExplicitlyUnpinned = pythonRecord.version === null;
  const profile = input.workspaceProfile ?? 'minimal';
  const needsPython = ['polyglot', 'python-only', 'enterprise'].includes(profile);

  const blockers: string[] = [];
  let status: DashboardEvidenceStatus = 'pass';

  if (!nodeVersion) {
    blockers.push('Node runtime is not pinned in toolchain.lock.');
    status = 'warn';
  }
  if (needsPython && (pythonExplicitlyUnpinned || !pythonVersion)) {
    blockers.push('Python runtime is not pinned — run rapidkit setup python.');
    status = 'warn';
  }

  const summaryParts = [
    nodeVersion ? `Node ${nodeVersion}` : 'Node unpinned',
    needsPython ? (pythonVersion ? `Python ${pythonVersion}` : 'Python unpinned') : undefined,
  ].filter((part): part is string => Boolean(part));

  return {
    status,
    summary: summaryParts.join(' · '),
    blockers,
  };
}

async function buildWorkspaceRunCard(reportsDir: string): Promise<DashboardEvidenceCard> {
  const artifactPath = path.join(reportsDir, WORKSPACE_RUN_LAST_REPORT);
  const raw = await readJsonIfExists(artifactPath);
  if (!raw) {
    return missingCard(
      'workspaceRun',
      'Workspace Run',
      'No workspace run evidence yet. Run Test, Build, Init, or Start from Operate.',
      'workspace'
    );
  }

  const stageEntries = listWorkspaceRunStageReports(raw);
  const stageReport = resolveWorkspaceRunCardReport(raw) ?? raw;
  const multiStage = stageEntries.length > 1;
  const primaryReport = multiStage ? stageEntries[stageEntries.length - 1].report : stageReport;

  const summaryLine =
    formatWorkspaceRunEvidenceSummary(raw) ??
    (() => {
      const summary =
        stageReport.summary && typeof stageReport.summary === 'object'
          ? (stageReport.summary as Record<string, unknown>)
          : {};
      const stage =
        typeof stageReport.stage === 'string'
          ? stageReport.stage
          : typeof (raw as Record<string, unknown>).latestStage === 'string'
            ? String((raw as Record<string, unknown>).latestStage)
            : 'run';
      const passed = Number(summary.passed ?? 0);
      const failed = Number(summary.failed ?? 0);
      const skipped = Number(summary.skipped ?? 0);
      return `${stage}: ${passed} passed · ${failed} failed · ${skipped} skipped`;
    })();

  const totals = stageEntries.reduce(
    (acc, { stage, report }) => {
      const numbers = {
        passed: Number((report.summary as Record<string, unknown> | undefined)?.passed ?? 0),
        failed: Number((report.summary as Record<string, unknown> | undefined)?.failed ?? 0),
        skipped: Number((report.summary as Record<string, unknown> | undefined)?.skipped ?? 0),
        selectedCount: Number(
          (report.summary as Record<string, unknown> | undefined)?.selectedCount ?? 0
        ),
        exitCode: Number((report.summary as Record<string, unknown> | undefined)?.exitCode ?? 0),
      };
      acc.passed += numbers.passed;
      acc.failed += numbers.failed;
      acc.skipped += numbers.skipped;
      acc.selectedCount = Math.max(acc.selectedCount, numbers.selectedCount);
      acc.exitCode = Math.max(acc.exitCode, numbers.exitCode);
      if (stage === 'test') {
        acc.testFailed = numbers.failed;
        acc.testPassed = numbers.passed;
      }
      if (stage === 'build') {
        acc.buildFailed = numbers.failed;
        acc.buildPassed = numbers.passed;
      }
      return acc;
    },
    {
      passed: 0,
      failed: 0,
      skipped: 0,
      selectedCount: 0,
      exitCode: 0,
      testFailed: 0,
      testPassed: 0,
      buildFailed: 0,
      buildPassed: 0,
    }
  );

  const blockers = multiStage
    ? stageEntries.flatMap(({ report }) => extractBlockersFromReport('workspace-run-last', report))
    : extractBlockersFromReport('workspace-run-last', stageReport);

  const uniqueBlockers = [...new Set(blockers)].slice(0, 8);

  const gates =
    primaryReport.gates && typeof primaryReport.gates === 'object'
      ? (primaryReport.gates as Record<string, unknown>)
      : {};
  const gatesBlocked = gates.blocked === true;

  let status: DashboardEvidenceStatus = 'pass';
  if (totals.failed > 0 || gatesBlocked) {
    status = 'fail';
  } else if (totals.exitCode !== 0) {
    status = totals.selectedCount === 0 ? 'warn' : 'fail';
  } else if (totals.skipped > 0 || uniqueBlockers.length > 0) {
    status = 'warn';
  } else if (totals.selectedCount === 0) {
    status = 'warn';
  }

  return {
    id: 'workspaceRun',
    label: 'Workspace Run',
    status,
    summary: summaryLine,
    scope: 'workspace',
    generatedAt:
      typeof primaryReport.generatedAt === 'string'
        ? primaryReport.generatedAt
        : typeof (raw as Record<string, unknown>).generatedAt === 'string'
          ? String((raw as Record<string, unknown>).generatedAt)
          : undefined,
    artifactPath,
    metrics: {
      passed: totals.passed,
      failed: totals.failed,
      skipped: totals.skipped,
      selectedCount: totals.selectedCount,
      testFailed: totals.testFailed,
      testPassed: totals.testPassed,
      buildFailed: totals.buildFailed,
      buildPassed: totals.buildPassed,
      stageCount: stageEntries.length,
    },
    blockers: uniqueBlockers,
    incidentStudioTarget: 'doctor',
  };
}

async function buildImportReadinessCard(
  projectPath: string,
  projectName?: string
): Promise<DashboardEvidenceCard | undefined> {
  const artifactPath = path.join(projectPath, '.rapidkit', IMPORT_READINESS_REPORT);
  const raw = await readJsonIfExists(artifactPath);
  if (!raw) {
    return undefined;
  }

  const statusValue = typeof raw.status === 'string' ? raw.status.toLowerCase() : '';
  const status: DashboardEvidenceStatus =
    statusValue === 'blocked' ? 'fail' : statusValue === 'review' ? 'warn' : 'pass';
  const blockers = extractBlockersFromReport('import-readiness', raw);
  const detection =
    raw.detection && typeof raw.detection === 'object'
      ? (raw.detection as Record<string, unknown>)
      : {};
  const frameworkDisplay =
    typeof detection.frameworkDisplayName === 'string'
      ? detection.frameworkDisplayName
      : typeof detection.framework === 'string'
        ? detection.framework
        : 'unknown';

  return {
    id: 'importReadiness',
    label: 'Import Readiness',
    status: blockers.length > 0 && status === 'pass' ? 'warn' : status,
    summary: `${frameworkDisplay} · import status ${statusValue || 'ready'}`,
    scope: 'project',
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : undefined,
    artifactPath,
    blockers,
    metrics: {
      checks: Array.isArray(raw.checks) ? raw.checks.length : 0,
      project: projectName ? 1 : 0,
    },
    incidentStudioTarget: 'doctor',
  };
}

function missingCard(
  id: DashboardEvidenceCardId,
  label: string,
  summary: string,
  scope: DashboardEvidenceScope = 'workspace',
  incidentStudioTarget?: DashboardEvidenceCard['incidentStudioTarget'],
  metrics?: DashboardEvidenceCard['metrics']
): DashboardEvidenceCard {
  return {
    id,
    label,
    status: 'missing',
    summary,
    scope,
    incidentStudioTarget,
    metrics,
  };
}

async function readWorkspaceProfileFromManifest(
  workspacePath: string
): Promise<string | undefined> {
  const manifestPath = path.join(workspacePath, '.rapidkit', 'workspace.json');
  try {
    if (!(await fs.pathExists(manifestPath))) {
      return undefined;
    }
    const manifest = (await fs.readJSON(manifestPath)) as Record<string, unknown>;
    const profile =
      (typeof manifest.profile === 'string' && manifest.profile.trim()) ||
      (typeof manifest.workspace_profile === 'string' && manifest.workspace_profile.trim());
    return profile || undefined;
  } catch (error) {
    logEvidenceBridgeWarning('readWorkspaceProfileFromManifest', manifestPath, error);
    return undefined;
  }
}

async function buildBootstrapPendingCard(workspacePath: string): Promise<DashboardEvidenceCard> {
  const profile = await readWorkspaceProfileFromManifest(workspacePath);
  const metrics = { pendingBootstrap: 1, ...(profile ? { profile } : {}) };

  if (profile) {
    return missingCard(
      'bootstrap',
      'Bootstrap compliance',
      `Profile "${profile}" was saved at create. Run Bootstrap once to generate the compliance report — use Operate → Bootstrap (same profile).`,
      'workspace',
      undefined,
      metrics
    );
  }

  return missingCard(
    'bootstrap',
    'Bootstrap compliance',
    'No compliance report yet. Run Bootstrap from Operate → Governance to validate policy and generate evidence.',
    'workspace',
    undefined,
    metrics
  );
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
      generatedAt: reportGeneratedAt(raw),
      artifactPath,
      blockers,
      metrics: mergeReportMetrics({}, raw),
      incidentStudioTarget: 'doctor',
    };
  } catch (error) {
    logEvidenceBridgeWarning('readBootstrapComplianceSummary', reportsDir, error);
    return undefined;
  }
}
const WORKSPACE_DOCTOR_REPORT = 'doctor-last-run.json';
const PROJECT_DOCTOR_REPORT = 'doctor-project-last-run.json';
const LEGACY_PROJECT_DOCTOR_REPORT = 'doctor-last-run.json';
const AUTOPILOT_RELEASE_ALIAS_REPORT = 'autopilot-release.json';
const AUTOPILOT_RELEASE_LAST_RUN_REPORT = 'autopilot-release-last-run.json';
const WORKSPACE_RUN_LAST_REPORT = 'workspace-run-last.json';
const IMPORT_READINESS_REPORT = 'import-readiness.json';

async function listRecentDoctorReports(
  reportsDir: string,
  options?: { workspaceLevel?: boolean; projectName?: string }
): Promise<string[]> {
  try {
    if (!(await fs.pathExists(reportsDir))) {
      return [];
    }
    const projectName = options?.projectName?.toLowerCase();
    const entries = await Promise.all(
      (await fs.readdir(reportsDir))
        .filter((name) => {
          const lower = name.toLowerCase();
          if (!lower.endsWith('.json') || !lower.includes('doctor')) {
            return false;
          }
          if (!options?.workspaceLevel) {
            return true;
          }
          return lower.includes('project') || (projectName ? lower.includes(projectName) : false);
        })
        .map(async (name) => {
          const artifactPath = path.join(reportsDir, name);
          const stat = await fs.stat(artifactPath);
          return { artifactPath, mtimeMs: stat.mtimeMs };
        })
    );
    return entries.sort((a, b) => b.mtimeMs - a.mtimeMs).map((entry) => entry.artifactPath);
  } catch (error) {
    logEvidenceBridgeWarning('listRecentDoctorReports', reportsDir, error);
    return [];
  }
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const candidate of paths) {
    const normalized = path.resolve(candidate);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(candidate);
  }
  return output;
}

function buildDoctorCard(
  reportsDir: string,
  raw: Record<string, unknown> | undefined,
  scope: DashboardEvidenceScope,
  id: DashboardEvidenceCardId,
  label: string,
  options?: {
    projectPath?: string;
    projectName?: string;
    reportFileName?: string;
    artifactPath?: string;
  }
): DashboardEvidenceCard {
  const reportFileName =
    options?.reportFileName ??
    (scope === 'project' ? PROJECT_DOCTOR_REPORT : WORKSPACE_DOCTOR_REPORT);
  const artifactPath = options?.artifactPath ?? path.join(reportsDir, reportFileName);
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
    generatedAt: reportGeneratedAt(raw),
    artifactPath,
    metrics: mergeReportMetrics({ percent, errors, warnings, passed, total }, raw),
    blockers,
    incidentStudioTarget: 'doctor',
  };
}

function projectDoctorReportMatchesScope(
  raw: Record<string, unknown>,
  projectPath?: string,
  projectName?: string,
  options?: { artifactPath?: string; projectReportsDir?: string }
): boolean {
  const nestedProject =
    raw.project && typeof raw.project === 'object' ? (raw.project as Record<string, unknown>) : {};
  const reportProjectPath =
    typeof raw.projectPath === 'string'
      ? raw.projectPath
      : typeof nestedProject.path === 'string'
        ? nestedProject.path
        : undefined;
  const reportProjectName =
    typeof raw.projectName === 'string'
      ? raw.projectName
      : typeof nestedProject.name === 'string'
        ? nestedProject.name
        : undefined;

  const artifactPath = options?.artifactPath;
  const projectReportsDir = options?.projectReportsDir;
  const isProjectLocalArtifact =
    artifactPath &&
    projectReportsDir &&
    path.resolve(artifactPath).startsWith(path.resolve(projectReportsDir));

  if (!reportProjectPath && !reportProjectName) {
    return Boolean(isProjectLocalArtifact);
  }

  if (projectPath && reportProjectPath) {
    return path.resolve(reportProjectPath) === path.resolve(projectPath);
  }
  if (projectName && reportProjectName) {
    return reportProjectName === projectName;
  }
  return false;
}

async function readProjectDoctorReport(input: {
  workspaceReportsDir: string;
  projectPath: string;
  projectName?: string;
}): Promise<
  | { kind: 'valid'; raw: Record<string, unknown>; artifactPath: string; reportsDir: string }
  | { kind: 'corrupt' | 'incompatible'; artifactPath: string; error: string; reportsDir: string }
  | undefined
> {
  const projectReportsDir = path.join(input.projectPath, '.rapidkit', 'reports');
  const candidates = uniquePaths([
    path.join(projectReportsDir, PROJECT_DOCTOR_REPORT),
    path.join(projectReportsDir, LEGACY_PROJECT_DOCTOR_REPORT),
    path.join(input.workspaceReportsDir, PROJECT_DOCTOR_REPORT),
    ...(await listRecentDoctorReports(projectReportsDir)),
    ...(await listRecentDoctorReports(input.workspaceReportsDir, {
      workspaceLevel: true,
      projectName: input.projectName,
    })),
  ]);

  for (const artifactPath of candidates) {
    const result = await readJsonArtifact(artifactPath);
    if (result.kind === 'missing') {
      continue;
    }
    if (isArtifactReadFailure(result)) {
      return {
        kind: result.kind,
        artifactPath: result.artifactPath,
        error: result.error,
        reportsDir: path.dirname(result.artifactPath),
      };
    }
    const raw = result.raw;
    if (
      !projectDoctorReportMatchesScope(raw, input.projectPath, input.projectName, {
        artifactPath,
        projectReportsDir,
      })
    ) {
      continue;
    }
    return { kind: 'valid', raw, artifactPath, reportsDir: path.dirname(artifactPath) };
  }

  return undefined;
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
      incidentStudioTarget: 'release',
    });
  }

  const snapshotRaw = await readJsonIfExists(path.join(reportsDir, 'snapshot-last-run.json'));
  if (snapshotRaw) {
    const blockers = extractBlockersFromReport('snapshot-last-run', snapshotRaw);
    const status = normalizeEvidenceStatus(snapshotRaw.status ?? snapshotRaw.result);
    cards.push({
      id: 'snapshot',
      label: 'Recovery Snapshot',
      status: status === 'missing' ? 'pass' : status,
      summary:
        typeof snapshotRaw.snapshotName === 'string'
          ? `Latest recovery snapshot: ${snapshotRaw.snapshotName}`
          : 'Latest recovery snapshot recorded (rapidkit snapshot create).',
      scope: 'workspace',
      generatedAt:
        typeof snapshotRaw.generatedAt === 'string' ? snapshotRaw.generatedAt : undefined,
      artifactPath: path.join(reportsDir, 'snapshot-last-run.json'),
      blockers,
      incidentStudioTarget: 'release',
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
      incidentStudioTarget: 'release',
    });
  } else {
    cards.push(
      missingCard(
        'archive',
        'Archive',
        'Export workspace to produce ship-handoff manifest (.rapidkit/archive-manifest.json).',
        'workspace',
        'release'
      )
    );
  }

  return cards;
}

async function buildWorkspaceStateCards(workspacePath: string): Promise<DashboardEvidenceCard[]> {
  const rapidkitDir = path.join(workspacePath, '.rapidkit');
  const markerPath = path.join(workspacePath, '.rapidkit-workspace');
  const workspaceJsonPath = path.join(rapidkitDir, 'workspace.json');
  const policiesPath = path.join(rapidkitDir, 'policies.yml');
  const toolchainPath = path.join(rapidkitDir, 'toolchain.lock');
  const contractPath = path.join(rapidkitDir, 'workspace.contract.json');

  const [
    hasMarker,
    workspaceRaw,
    hasPolicies,
    hasToolchain,
    contractRaw,
    toolchainRaw,
    registrySummary,
  ] = await Promise.all([
    fs.pathExists(markerPath),
    readJsonIfExists(workspaceJsonPath),
    fs.pathExists(policiesPath),
    fs.pathExists(toolchainPath),
    readJsonIfExists(contractPath),
    readJsonIfExists(toolchainPath),
    readWorkspaceRegistrySummaryFromDisk(workspacePath),
  ]);
  const hasWorkspaceJson = Boolean(workspaceRaw);
  const legacyProjects = Array.isArray(workspaceRaw?.projects) ? workspaceRaw.projects : [];
  const workspaceProfile =
    registrySummary?.profile ??
    (typeof workspaceRaw?.profile === 'string' ? workspaceRaw.profile : undefined);
  const profileRequested =
    typeof workspaceRaw?.profile_requested === 'string'
      ? workspaceRaw.profile_requested
      : undefined;
  const profileSuffix = workspaceProfile
    ? profileRequested && profileRequested !== workspaceProfile
      ? ` · profile ${workspaceProfile} (requested ${profileRequested})`
      : ` · profile ${workspaceProfile}`
    : '';
  const missingFoundationFiles = [
    hasMarker ? undefined : '.rapidkit-workspace',
    hasWorkspaceJson ? undefined : '.rapidkit/workspace.json',
    hasPolicies ? undefined : '.rapidkit/policies.yml',
    hasToolchain ? undefined : '.rapidkit/toolchain.lock',
  ].filter((item): item is string => Boolean(item));

  const cards: DashboardEvidenceCard[] = [];

  if (hasWorkspaceJson) {
    const registrySummaryPath = path.join(rapidkitDir, WORKSPACE_REGISTRY_SUMMARY_RELATIVE_PATH);

    if (registrySummary) {
      cards.push({
        id: 'workspaceSync',
        label: 'Workspace Sync',
        status: registrySummary.projectCount > 0 ? 'pass' : 'warn',
        summary: formatWorkspaceRegistrySyncSummary(registrySummary, profileSuffix),
        scope: 'workspace',
        artifactPath: registrySummaryPath,
        metrics: {
          projects: registrySummary.projectCount,
          projectCount: registrySummary.projectCount,
          authority: registrySummary.authority,
        },
      });
    } else {
      cards.push({
        id: 'workspaceSync',
        label: 'Workspace Sync',
        status: 'warn',
        summary: `Canonical registry summary is missing${profileSuffix}. Run workspace sync to publish ${WORKSPACE_REGISTRY_SUMMARY_RELATIVE_PATH}.`,
        scope: 'workspace',
        artifactPath: workspaceJsonPath,
        blockers: [`Missing ${WORKSPACE_REGISTRY_SUMMARY_RELATIVE_PATH}`],
      });
    }
  } else {
    cards.push(
      missingCard(
        'workspaceSync',
        'Workspace Sync',
        'No workspace state yet. Run workspace sync from Governance.',
        'workspace'
      )
    );
  }

  if (missingFoundationFiles.length === 0) {
    cards.push({
      id: 'foundation',
      label: 'Foundation',
      status: 'pass',
      summary: 'Foundation files present: marker, workspace, policies, and toolchain.',
      scope: 'workspace',
      artifactPath: workspaceJsonPath,
      metrics: { files: 4 },
    });
  } else {
    cards.push({
      id: 'foundation',
      label: 'Foundation',
      status: hasMarker || hasWorkspaceJson ? 'warn' : 'missing',
      summary: `Missing ${missingFoundationFiles.length} foundation file(s).`,
      scope: 'workspace',
      artifactPath: hasWorkspaceJson ? workspaceJsonPath : undefined,
      metrics: { missing: missingFoundationFiles.length },
      blockers: missingFoundationFiles,
    });
  }

  const setupSummary = summarizeToolchainSetup({
    toolchainRaw: toolchainRaw,
    workspaceProfile,
  });
  cards.push({
    id: 'setup',
    label: 'Toolchain Setup',
    status: setupSummary.status,
    summary: setupSummary.summary,
    scope: 'workspace',
    artifactPath: hasToolchain ? toolchainPath : undefined,
    blockers: setupSummary.blockers,
    incidentStudioTarget: 'doctor',
  });

  if (contractRaw) {
    const contractProjects = Array.isArray(contractRaw.projects)
      ? contractRaw.projects
      : legacyProjects;
    const contractVerifyArtifact = await readWorkspaceContractVerifyEvidenceArtifact(workspacePath);
    if (isArtifactReadFailure(contractVerifyArtifact)) {
      cards.push(
        corruptArtifactCard({
          id: 'contract',
          label: 'Workspace Contract',
          artifactPath: contractVerifyArtifact.artifactPath,
          error: contractVerifyArtifact.error,
          kind: contractVerifyArtifact.kind,
        })
      );
    } else {
      const contractVerifyEvidence =
        contractVerifyArtifact.kind === 'valid' ? contractVerifyArtifact.evidence : null;
      const contractVerifySummary = summarizeWorkspaceContractVerify(
        contractVerifyEvidence,
        contractProjects.length
      );
      const verifyEvidencePath = path.join(
        rapidkitDir,
        'reports',
        path.basename(WORKSPACE_CONTRACT_VERIFY_REPORT_PATH)
      );
      cards.push({
        id: 'contract',
        label: 'Workspace Contract',
        status: contractVerifySummary.status === 'missing' ? 'warn' : contractVerifySummary.status,
        summary: contractVerifySummary.summary,
        scope: 'workspace',
        artifactPath: contractVerifyEvidence ? verifyEvidencePath : contractPath,
        generatedAt: contractVerifyEvidence?.generatedAt,
        metrics: { projects: contractProjects.length },
        blockers: contractVerifySummary.blockers,
      });
    }
  } else {
    cards.push({
      id: 'contract',
      label: 'Workspace Contract',
      status: hasWorkspaceJson ? 'warn' : 'missing',
      summary: hasWorkspaceJson
        ? 'Workspace state exists; contract evidence has not been generated yet.'
        : 'No workspace contract evidence yet. Run contract inspect or verify.',
      scope: 'workspace',
      blockers: hasWorkspaceJson ? ['Run workspace contract inspect or verify.'] : undefined,
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
  const mirrorConfigPath = path.join(rapidkitDir, 'mirror-config.json');
  const mirrorConfigOnDisk = await fs.pathExists(mirrorConfigPath);
  if (mirrorRaw) {
    const mirrorMeta =
      mirrorRaw.mirror && typeof mirrorRaw.mirror === 'object'
        ? (mirrorRaw.mirror as Record<string, unknown>)
        : {};
    const configExists = mirrorMeta.configExists === true || mirrorConfigOnDisk;
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
        ? artifactsCount > 0
          ? `${artifactsCount} artifact(s) · config present`
          : 'Mirror config present · 0 artifacts configured (disabled or empty)'
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
        'No mirror ops evidence yet. Run Mirror Operations (status initializes config).',
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
    } catch (error) {
      logEvidenceBridgeWarning('readCacheConfigStrategy', cacheConfigPath, error);
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

async function buildWorkspaceIntelligenceCards(
  reportsDir: string
): Promise<DashboardEvidenceCard[]> {
  const cards: DashboardEvidenceCard[] = [];
  const workspaceRoot = path.dirname(path.dirname(reportsDir));

  const modelArtifact = validOrCorruptWorkspaceModelArtifact(
    await readJsonArtifact(path.join(reportsDir, 'workspace-model.json'))
  );
  const modelRaw = modelArtifact.kind === 'valid' ? modelArtifact.raw : undefined;
  const modelSummary =
    modelRaw?.summary && typeof modelRaw.summary === 'object'
      ? (modelRaw.summary as Record<string, unknown>)
      : {};
  const workspaceProjectCount = Number(modelSummary.projectCount ?? 0);

  if (isArtifactReadFailure(modelArtifact)) {
    cards.push(
      corruptArtifactCard({
        id: 'workspaceModel',
        label: 'Workspace Model',
        artifactPath: modelArtifact.artifactPath,
        error: modelArtifact.error,
        kind: modelArtifact.kind,
        incidentStudioTarget: 'model',
      })
    );
  } else if (modelRaw) {
    const summary =
      modelRaw.summary && typeof modelRaw.summary === 'object'
        ? (modelRaw.summary as Record<string, unknown>)
        : {};
    const validation =
      modelRaw.validation && typeof modelRaw.validation === 'object'
        ? (modelRaw.validation as Record<string, unknown>)
        : {};
    const projectCount = Number(summary.projectCount ?? 0);
    const projectNames = Array.isArray(modelRaw.projects)
      ? modelRaw.projects
          .map((entry) => {
            if (!entry || typeof entry !== 'object') {
              return null;
            }
            const name = (entry as Record<string, unknown>).name;
            return typeof name === 'string' && name.trim().length > 0 ? name.trim() : null;
          })
          .filter((name): name is string => Boolean(name))
      : [];
    const validationStatus = normalizeEvidenceStatus(validation.status);
    const blockers = extractBlockersFromReport('workspace-model', modelRaw);
    cards.push({
      id: 'workspaceModel',
      label: 'Workspace Model',
      status:
        validationStatus === 'missing' ? (blockers.length > 0 ? 'fail' : 'pass') : validationStatus,
      summary: `${projectCount} project(s) · validation ${String(validation.status ?? 'unknown')}`,
      scope: 'workspace',
      generatedAt: typeof modelRaw.generatedAt === 'string' ? modelRaw.generatedAt : undefined,
      artifactPath: path.join(reportsDir, 'workspace-model.json'),
      metrics: {
        projectCount,
        projectNames: projectNames.join(', '),
        errors: Number(validation.errors ?? 0),
        warnings: Number(validation.warnings ?? 0),
      },
      blockers,
      incidentStudioTarget: 'model',
      detailSections: buildWorkspaceModelDetailSections(modelRaw),
    });
  } else {
    cards.push(
      missingCard(
        'workspaceModel',
        'Workspace Model',
        'No workspace model yet. Run workspace model --json --write.'
      )
    );
  }

  const snapshotRaw = await readJsonIfExists(
    path.join(reportsDir, 'workspace-model-snapshot.json')
  );
  if (snapshotRaw) {
    const model =
      snapshotRaw.model && typeof snapshotRaw.model === 'object'
        ? (snapshotRaw.model as Record<string, unknown>)
        : {};
    const modelSummary =
      model.summary && typeof model.summary === 'object'
        ? (model.summary as Record<string, unknown>)
        : {};
    cards.push({
      id: 'intelligenceSnapshot',
      label: 'Intelligence Snapshot',
      status: 'pass',
      summary: `Hash ${String(snapshotRaw.modelHash ?? 'unknown').slice(0, 8)} · ${Number(modelSummary.projectCount ?? 0)} project(s)`,
      scope: 'workspace',
      generatedAt:
        typeof snapshotRaw.generatedAt === 'string' ? snapshotRaw.generatedAt : undefined,
      artifactPath: path.join(reportsDir, 'workspace-model-snapshot.json'),
      metrics: { projectCount: Number(modelSummary.projectCount ?? 0) },
    });
  } else {
    cards.push(
      missingCard(
        'intelligenceSnapshot',
        'Intelligence Snapshot',
        'No intelligence snapshot yet. Run rapidkit workspace snapshot --json (not recovery snapshot create).'
      )
    );
  }

  const diffRaw = await readJsonIfExists(
    path.join(reportsDir, 'workspace-model-diff-last-run.json')
  );
  if (diffRaw) {
    const summary =
      diffRaw.summary && typeof diffRaw.summary === 'object'
        ? (diffRaw.summary as Record<string, unknown>)
        : {};
    const changed = summary.changed === true;
    const blockers = extractBlockersFromReport('workspace-model-diff', diffRaw);
    const hasCritical = Array.isArray(diffRaw.changes)
      ? diffRaw.changes.some(
          (entry) =>
            entry &&
            typeof entry === 'object' &&
            (entry as Record<string, unknown>).severity === 'critical'
        )
      : false;
    const noProjectDrift =
      Number(summary.addedProjects ?? 0) === 0 &&
      Number(summary.removedProjects ?? 0) === 0 &&
      Number(summary.changedProjects ?? 0) === 0;
    const gitNoise =
      Number(summary.gitChangedFiles ?? 0) > 0 ||
      (diffRaw.git &&
        typeof diffRaw.git === 'object' &&
        Number((diffRaw.git as Record<string, unknown>).untrackedFiles ?? 0) > 0);
    let diffStatus: DashboardEvidenceStatus = changed ? (hasCritical ? 'fail' : 'warn') : 'pass';
    let diffSummary = changed
      ? `+${Number(summary.addedProjects ?? 0)} / -${Number(summary.removedProjects ?? 0)} / ~${Number(summary.changedProjects ?? 0)}`
      : 'Model matches baseline';
    if (changed && workspaceProjectCount === 0 && noProjectDrift && !hasCritical) {
      diffStatus = gitNoise ? 'pass' : 'warn';
      if (gitNoise) {
        diffSummary = 'Git working tree dirty · no project model drift';
      }
    }
    cards.push({
      id: 'workspaceDiff',
      label: 'Workspace Diff',
      status: diffStatus,
      summary: diffSummary,
      scope: 'workspace',
      generatedAt: typeof diffRaw.generatedAt === 'string' ? diffRaw.generatedAt : undefined,
      artifactPath: path.join(reportsDir, 'workspace-model-diff-last-run.json'),
      metrics: {
        addedProjects: Number(summary.addedProjects ?? 0),
        removedProjects: Number(summary.removedProjects ?? 0),
        changedProjects: Number(summary.changedProjects ?? 0),
      },
      blockers,
      incidentStudioTarget: 'impact',
    });
  } else {
    cards.push(
      missingCard(
        'workspaceDiff',
        'Workspace Diff',
        'No diff report yet. Run workspace diff --from <snapshot> --json.'
      )
    );
  }

  const impactArtifact = await readJsonArtifact(
    path.join(reportsDir, 'workspace-impact-last-run.json')
  );
  if (isArtifactReadFailure(impactArtifact)) {
    cards.push(
      corruptArtifactCard({
        id: 'workspaceImpact',
        label: 'Workspace Impact',
        artifactPath: impactArtifact.artifactPath,
        error: impactArtifact.error,
        kind: impactArtifact.kind,
        incidentStudioTarget: 'impact',
      })
    );
  } else if (impactArtifact.kind === 'valid') {
    const impactRaw = impactArtifact.raw;
    const summary =
      impactRaw.summary && typeof impactRaw.summary === 'object'
        ? (impactRaw.summary as Record<string, unknown>)
        : {};
    const risk = typeof summary.risk === 'string' ? summary.risk : 'none';
    const blockers = extractBlockersFromReport('workspace-impact', impactRaw);
    const affectedProjects = Number(summary.affectedProjects ?? 0);
    const workspaceItems = Number(summary.workspaceItems ?? 0);
    let status: DashboardEvidenceStatus =
      risk === 'critical' || risk === 'high' ? 'fail' : risk === 'medium' ? 'warn' : 'pass';
    if (
      workspaceProjectCount === 0 &&
      affectedProjects === 0 &&
      (risk === 'high' || risk === 'critical')
    ) {
      status = risk === 'critical' ? 'fail' : 'warn';
    } else if (
      affectedProjects === 0 &&
      workspaceItems > 0 &&
      (risk === 'high' || risk === 'critical')
    ) {
      // Workspace-level git noise (agent-sync / grounding files) — not a project code failure.
      status = 'warn';
    } else if (workspaceProjectCount === 0 && affectedProjects === 0 && risk === 'medium') {
      status = 'pass';
    }
    cards.push({
      id: 'workspaceImpact',
      label: 'Workspace Impact',
      status,
      summary:
        affectedProjects === 0 && workspaceItems > 0
          ? `Workspace-only risk ${risk} · 0 project code impact · ${workspaceItems} workspace item(s)`
          : `Risk ${risk} · ${affectedProjects} project(s) affected · ${workspaceItems} workspace item(s)`,
      scope: 'workspace',
      generatedAt: typeof impactRaw.generatedAt === 'string' ? impactRaw.generatedAt : undefined,
      artifactPath: impactArtifact.artifactPath,
      metrics: {
        affectedProjects: Number(summary.affectedProjects ?? 0),
        workspaceItems,
        recommendedCommands: Number(summary.recommendedCommands ?? 0),
      },
      blockers,
      incidentStudioTarget: 'impact',
    });
  } else {
    cards.push(
      missingCard(
        'workspaceImpact',
        'Workspace Impact',
        'No impact report yet. Run workspace impact --from <diff> --json.'
      )
    );
  }

  const contextRaw = await readJsonIfExists(path.join(reportsDir, 'workspace-context-agent.json'));
  if (contextRaw) {
    const validation =
      contextRaw.validation && typeof contextRaw.validation === 'object'
        ? (contextRaw.validation as Record<string, unknown>)
        : {};
    const validationStatus = normalizeEvidenceStatus(validation.status);
    const blockers = extractBlockersFromReport('workspace-context-agent', contextRaw);
    const safeCommands = Array.isArray(contextRaw.safeCommands)
      ? contextRaw.safeCommands.length
      : 0;
    const safeCommandSections = Array.isArray(contextRaw.safeCommands)
      ? contextRaw.safeCommands
          .slice(0, 24)
          .map((entry, index) => {
            if (!entry || typeof entry !== 'object') {
              return null;
            }
            const record = entry as Record<string, unknown>;
            const id = typeof record.id === 'string' ? record.id : `safe-${index + 1}`;
            const display = typeof record.display === 'string' ? record.display : '';
            const execute = typeof record.execute === 'string' ? record.execute : '';
            const description = typeof record.description === 'string' ? record.description : '';
            const scopeLabel = typeof record.scope === 'string' ? record.scope : 'workspace';
            const project =
              typeof record.project === 'string' && record.project.trim().length > 0
                ? `\nproject: ${record.project}`
                : '';
            return {
              id,
              title: `${id} (${scopeLabel})`,
              body: [display, execute, description, project.trim()].filter(Boolean).join('\n'),
            };
          })
          .filter((section): section is { id: string; title: string; body: string } =>
            Boolean(section)
          )
      : [];
    cards.push({
      id: 'workspaceContextAgent',
      label: 'Agent Context',
      status:
        validationStatus === 'missing' ? (blockers.length > 0 ? 'warn' : 'pass') : validationStatus,
      summary: `${safeCommands} safe command(s) · agent ${String(contextRaw.agent ?? 'generic')}`,
      scope: 'workspace',
      generatedAt: typeof contextRaw.generatedAt === 'string' ? contextRaw.generatedAt : undefined,
      artifactPath: path.join(reportsDir, 'workspace-context-agent.json'),
      metrics: { safeCommands },
      detailSections: safeCommandSections.length > 0 ? safeCommandSections : undefined,
      blockers,
    });
  } else {
    cards.push(
      missingCard(
        'workspaceContextAgent',
        'Agent Context',
        'No agent context pack yet. Run workspace context --for-agent --json --write.'
      )
    );
  }

  const indexRaw = await readJsonIfExists(path.join(reportsDir, 'INDEX.json'));
  const packRaw = await readJsonIfExists(path.join(reportsDir, 'agent-customization-pack.json'));
  const pack = parseAgentCustomizationPack(packRaw);
  const packSummary = pack ? summarizeAgentCustomizationPack(pack) : null;
  const agentsMdPath = path.join(workspaceRoot, 'AGENTS.md');
  const agentsMdExists = await fs.pathExists(agentsMdPath);
  if (indexRaw || pack) {
    const reports = Array.isArray(indexRaw?.reports) ? indexRaw.reports : [];
    const reportEntries = reports.filter((entry): entry is Record<string, unknown> =>
      Boolean(entry && typeof entry === 'object')
    );
    const existingCount = reportEntries.filter((entry) => entry.exists === true).length;
    const missingRequired = reportEntries
      .filter((entry) => entry.required === true && entry.exists !== true)
      .map((entry) => (typeof entry.path === 'string' ? entry.path : 'required agent report'));
    const indexBlockers = extractBlockersFromReport('agent-reports-index', indexRaw ?? {});
    const agentBlockers = [
      ...missingRequired.map((entry) => `Missing required report: ${entry}`),
      ...(!agentsMdExists ? ['AGENTS.md not synced — run agent customization sync'] : []),
      ...(packSummary?.blockers ?? []),
    ];
    const skillsArtifact = await readWorkspaceSkillsIndexArtifact(workspaceRoot);
    const skillsBlockers = isArtifactReadFailure(skillsArtifact)
      ? [`Operational skills index is incompatible: ${skillsArtifact.error}`]
      : [];
    const blockers = [...agentBlockers, ...skillsBlockers];
    const status = softenEmptyWorkspaceGroundingStatus({
      workspaceProjectCount,
      status: agentCustomizationPackStatus(pack, packSummary, blockers),
      blockers,
    });
    const mcpDesignRaw = await readJsonIfExists(
      path.join(reportsDir, path.basename(RAPIDKIT_MCP_DESIGN_REPORT_PATH))
    );
    const mcpDetailSections = buildMcpDesignDetailSections(mcpDesignRaw ?? null);
    const packLine = packSummary
      ? `${packSummary.preset} · ${packSummary.writtenOutputs}/${packSummary.totalOutputs} surfaces`
      : `${existingCount}/${reportEntries.length || 0} reports indexed`;
    const skillsIndex = skillsArtifact.kind === 'valid' ? skillsArtifact.index : null;
    const skillsLine = summarizeOperationalSkills(skillsIndex);
    const hookLine = packSummary?.hooksEnabled
      ? ' · advisory hooks'
      : packSummary?.mcpReady
        ? ' · MCP-ready design'
        : agentsMdExists
          ? ' · AGENTS.md synced'
          : ' · hooks missing';
    const reportBlockerSections =
      indexBlockers.length > 0
        ? [
            {
              id: 'workspace-report-blockers',
              title: 'Workspace report blockers',
              body: indexBlockers.slice(0, 12).join('\n'),
            },
          ]
        : [];
    const detailSections = [...reportBlockerSections, ...mcpDetailSections];
    cards.push({
      id: 'agentGrounding',
      label: 'Agent Customization Pack',
      status,
      summary: `${packLine}${skillsLine ? ` · ${skillsLine}` : ''}${hookLine}`,
      scope: 'workspace',
      generatedAt:
        packSummary?.generatedAt ??
        (typeof indexRaw?.generatedAt === 'string' ? indexRaw.generatedAt : undefined),
      artifactPath: pack
        ? path.join(reportsDir, 'agent-customization-pack.json')
        : path.join(reportsDir, 'INDEX.json'),
      metrics: {
        indexed: existingCount,
        surfaces: packSummary?.writtenOutputs ?? (agentsMdExists ? 1 : 0),
        skills: skillsIndex?.skills?.length ?? 0,
        mcpTools: mcpDetailSections.length,
        ...staleEvidenceMetric(blockers),
      },
      blockers: blockers.slice(0, 12),
      detailSections: detailSections.length > 0 ? detailSections : undefined,
    });
  } else {
    cards.push(
      missingCard(
        'agentGrounding',
        'Agent Customization Pack',
        'No agent customization pack yet. Run workspace agent-sync --write --refresh-context --preset enterprise.'
      )
    );
  }

  const verifyArtifact = await readJsonArtifact(
    path.join(reportsDir, 'workspace-verify-last-run.json')
  );
  if (isArtifactReadFailure(verifyArtifact)) {
    cards.push(
      corruptArtifactCard({
        id: 'workspaceVerify',
        label: 'Workspace Verify',
        artifactPath: verifyArtifact.artifactPath,
        error: verifyArtifact.error,
        kind: verifyArtifact.kind,
        incidentStudioTarget: 'release',
      })
    );
  } else if (verifyArtifact.kind === 'valid') {
    const verifyRaw = verifyArtifact.raw;
    const summary =
      verifyRaw.summary && typeof verifyRaw.summary === 'object'
        ? (verifyRaw.summary as Record<string, unknown>)
        : {};
    const verdict = typeof summary.verdict === 'string' ? summary.verdict : 'unknown';
    const blockers = extractBlockersFromReport('workspace-verify', verifyRaw);
    const policy = summarizePolicyViolations(verifyRaw);
    const verdictStatus: DashboardEvidenceStatus =
      verdict === 'blocked' ? 'fail' : verdict === 'needs-attention' ? 'warn' : 'pass';
    // Error-severity policy violations are a persistent blocker even in warn mode,
    // where the CLI verdict would otherwise stay below "blocked".
    const status = softenEmptyWorkspaceVerifyStatus({
      workspaceProjectCount,
      status:
        policy.errors > 0
          ? 'fail'
          : policy.warnings > 0 && verdictStatus === 'pass'
            ? 'warn'
            : verdictStatus,
      policy,
      blockers,
      verdict,
    });
    const policySuffix =
      policy.errors > 0 || policy.warnings > 0
        ? ` · policy ${policy.errors} error(s)/${policy.warnings} warning(s)`
        : '';
    const displayVerdict =
      workspaceProjectCount === 0 && (verdict === 'blocked' || verdict === 'needs-attention')
        ? `scaffold ${verdict === 'blocked' ? 'needs attention' : verdict.replace(/-/g, ' ')}`
        : `Verdict ${verdict}`;
    cards.push({
      id: 'workspaceVerify',
      label: 'Workspace Verify',
      status,
      summary: `${displayVerdict} · ${Number(summary.stepsPassed ?? 0)} passed · ${Number(summary.stepsMissing ?? 0)} missing${policySuffix}`,
      scope: 'workspace',
      generatedAt: typeof verifyRaw.generatedAt === 'string' ? verifyRaw.generatedAt : undefined,
      artifactPath: verifyArtifact.artifactPath,
      metrics: {
        stepsPassed: Number(summary.stepsPassed ?? 0),
        stepsMissing: Number(summary.stepsMissing ?? 0),
        stepsFailed: Number(summary.stepsFailed ?? 0),
        ...staleEvidenceMetric(blockers),
      },
      blockers,
      incidentStudioTarget: 'release',
    });
  } else {
    cards.push(
      missingCard(
        'workspaceVerify',
        'Workspace Verify',
        'No verify report yet. Run workspace verify --json.',
        'workspace',
        'release'
      )
    );
  }

  const explainArtifact = await readWorkspaceExplainReportArtifact(workspaceRoot);
  const whyArtifact = await readWorkspaceWhyReportArtifact(workspaceRoot);
  const traceArtifact = await readWorkspaceTraceReportArtifact(workspaceRoot);
  const explainReport = explainArtifact.kind === 'valid' ? explainArtifact.report : null;
  const whyReportDedicated = whyArtifact.kind === 'valid' ? whyArtifact.report : null;
  const traceReportDedicated = traceArtifact.kind === 'valid' ? traceArtifact.report : null;
  const whyReport =
    whyReportDedicated ??
    (explainReport?.target.kind === 'release-blocked' || explainReport?.target.kind === 'blocker'
      ? explainReport
      : null);
  const traceReport =
    traceReportDedicated ?? (explainReport?.target.kind === 'trace' ? explainReport : null);

  if (isArtifactReadFailure(explainArtifact)) {
    cards.push(
      corruptArtifactCard({
        id: 'workspaceExplain',
        label: 'Workspace Explain',
        artifactPath: explainArtifact.artifactPath,
        error: explainArtifact.error,
        kind: explainArtifact.kind,
        incidentStudioTarget: 'release',
      })
    );
  } else if (explainReport && explainReport.target.kind !== 'trace') {
    cards.push(
      buildExplainDerivedEvidenceCard(
        'workspaceExplain',
        'Workspace Explain',
        explainReport,
        workspaceProjectCount,
        reportsDir,
        WORKSPACE_EXPLAIN_REPORT_PATH
      )
    );
  } else {
    cards.push(
      missingCard(
        'workspaceExplain',
        'Workspace Explain',
        'No explain report yet. Run workspace explain release-blocked --write.',
        'workspace',
        'release'
      )
    );
  }

  if (isArtifactReadFailure(whyArtifact)) {
    cards.push(
      corruptArtifactCard({
        id: 'workspaceWhy',
        label: 'Workspace Why',
        artifactPath: whyArtifact.artifactPath,
        error: whyArtifact.error,
        kind: whyArtifact.kind,
        incidentStudioTarget: 'release',
      })
    );
  } else if (whyReport) {
    cards.push(
      buildExplainDerivedEvidenceCard(
        'workspaceWhy',
        'Workspace Why',
        whyReport,
        workspaceProjectCount,
        reportsDir,
        whyReportDedicated ? WORKSPACE_WHY_REPORT_PATH : WORKSPACE_EXPLAIN_REPORT_PATH,
        whyReportDedicated ? undefined : { derivedFrom: 'Workspace Explain' }
      )
    );
  } else {
    cards.push(
      missingCard(
        'workspaceWhy',
        'Workspace Why',
        'No why narrative yet. Run workspace why release-blocked --write.',
        'workspace',
        'release'
      )
    );
  }

  if (isArtifactReadFailure(traceArtifact)) {
    cards.push(
      corruptArtifactCard({
        id: 'workspaceTrace',
        label: 'Workspace Trace',
        artifactPath: traceArtifact.artifactPath,
        error: traceArtifact.error,
        kind: traceArtifact.kind,
        incidentStudioTarget: 'impact',
      })
    );
  } else if (traceReport) {
    cards.push(
      buildExplainDerivedEvidenceCard(
        'workspaceTrace',
        'Workspace Trace',
        traceReport,
        workspaceProjectCount,
        reportsDir,
        traceReportDedicated ? WORKSPACE_TRACE_REPORT_PATH : WORKSPACE_EXPLAIN_REPORT_PATH
      )
    );
  } else {
    cards.push(
      missingCard(
        'workspaceTrace',
        'Workspace Trace',
        'No trace narrative yet. Run workspace trace --from <diff> --write.',
        'workspace',
        'impact'
      )
    );
  }

  const modelCard = cards.find((card) => card.id === 'workspaceModel');
  if (modelCard && modelCard.status !== 'missing') {
    cards.push({
      id: 'workspaceWatch',
      label: 'Workspace Watch',
      status: modelCard.status,
      summary: `${modelCard.summary} · one-shot watch refreshes model`,
      scope: 'workspace',
      generatedAt: modelCard.generatedAt,
      artifactPath: modelCard.artifactPath,
      metrics: modelCard.metrics,
      blockers: modelCard.blockers,
      incidentStudioTarget: 'model',
    });
  } else {
    cards.push(
      missingCard(
        'workspaceWatch',
        'Workspace Watch',
        'Run workspace model first, then workspace watch --once.',
        'workspace',
        'model'
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

  const modelCountArtifact = await readJsonArtifact(path.join(reportsDir, 'workspace-model.json'));
  const analyzeCountArtifact = await readJsonArtifact(
    path.join(reportsDir, 'analyze-last-run.json')
  );
  const modelRawForCount = modelCountArtifact.kind === 'valid' ? modelCountArtifact.raw : undefined;
  const analyzeRawForCount =
    analyzeCountArtifact.kind === 'valid' ? analyzeCountArtifact.raw : undefined;
  const modelSummaryForCount =
    modelRawForCount?.summary && typeof modelRawForCount.summary === 'object'
      ? (modelRawForCount.summary as Record<string, unknown>)
      : {};
  const analyzeSummaryForCount =
    analyzeRawForCount?.summary && typeof analyzeRawForCount.summary === 'object'
      ? (analyzeRawForCount.summary as Record<string, unknown>)
      : {};
  const workspaceProjectCount = Number(
    modelSummaryForCount.projectCount ?? analyzeSummaryForCount.projectCount ?? 0
  );

  const workspaceDoctorArtifact = await readJsonArtifact(
    path.join(reportsDir, 'doctor-last-run.json')
  );
  if (isArtifactReadFailure(workspaceDoctorArtifact)) {
    cards.push(
      corruptArtifactCard({
        id: 'doctor',
        label: 'Workspace Doctor',
        artifactPath: workspaceDoctorArtifact.artifactPath,
        error: workspaceDoctorArtifact.error,
        kind: workspaceDoctorArtifact.kind,
        incidentStudioTarget: 'doctor',
      })
    );
  } else {
    cards.push(
      buildDoctorCard(
        reportsDir,
        workspaceDoctorArtifact.kind === 'valid' ? workspaceDoctorArtifact.raw : undefined,
        'workspace',
        'doctor',
        'Workspace Doctor'
      )
    );
  }

  const pipelineArtifact = await readJsonArtifact(path.join(reportsDir, 'pipeline-last-run.json'));
  if (isArtifactReadFailure(pipelineArtifact)) {
    cards.push(
      corruptArtifactCard({
        id: 'pipeline',
        label: 'Governance Gate',
        artifactPath: pipelineArtifact.artifactPath,
        error: pipelineArtifact.error,
        kind: pipelineArtifact.kind,
        incidentStudioTarget: 'readiness',
      })
    );
  } else if (pipelineArtifact.kind === 'valid') {
    const pipelineRaw = pipelineArtifact.raw;
    const summary =
      pipelineRaw.summary && typeof pipelineRaw.summary === 'object'
        ? (pipelineRaw.summary as Record<string, unknown>)
        : {};
    const verdict = normalizeEvidenceStatus(summary.verdict);
    const blockers = extractBlockersFromReport('pipeline-last-run', pipelineRaw);
    const stagesPassed = Number(summary.stagesPassed ?? 0);
    const stagesWarn = Number(summary.stagesWarn ?? 0);
    const stagesFailed = Number(summary.stagesFailed ?? 0);
    const rawStatus: DashboardEvidenceStatus =
      verdict === 'missing'
        ? stagesFailed > 0
          ? 'fail'
          : stagesWarn > 0
            ? 'warn'
            : 'pass'
        : verdict;
    cards.push({
      id: 'pipeline',
      label: 'Governance Gate',
      status: softenEmptyWorkspacePipelineStatus({
        workspaceProjectCount,
        status: rawStatus,
        blockers,
      }),
      summary: `${stagesPassed} passed · ${stagesWarn} warn · ${stagesFailed} failed`,
      scope: 'workspace',
      generatedAt: reportGeneratedAt(pipelineRaw),
      artifactPath: pipelineArtifact.artifactPath,
      metrics: mergeReportMetrics({ stagesPassed, stagesWarn, stagesFailed }, pipelineRaw),
      blockers,
      incidentStudioTarget: 'readiness',
    });
  } else {
    cards.push(
      missingCard(
        'pipeline',
        'Governance Gate',
        'Run the Governance Gate (sync → doctor → analyze → readiness → autopilot) from Operate or Evidence.',
        'workspace',
        'readiness'
      )
    );
  }

  cards.push(await buildWorkspaceRunCard(reportsDir));

  if (projectPath) {
    const projectDoctor = await readProjectDoctorReport({
      workspaceReportsDir: reportsDir,
      projectPath,
      projectName,
    });
    const projectReportsDir =
      projectDoctor?.reportsDir ?? path.join(projectPath, '.rapidkit', 'reports');
    if (projectDoctor && isArtifactReadFailure(projectDoctor)) {
      cards.push(
        corruptArtifactCard({
          id: 'projectDoctor',
          label: 'Project Doctor',
          artifactPath: projectDoctor.artifactPath,
          error: projectDoctor.error,
          kind: projectDoctor.kind,
          scope: 'project',
          incidentStudioTarget: 'doctor',
        })
      );
    } else {
      cards.push(
        buildDoctorCard(
          projectReportsDir,
          projectDoctor?.raw,
          'project',
          'projectDoctor',
          'Project Doctor',
          {
            projectPath,
            projectName,
            reportFileName: PROJECT_DOCTOR_REPORT,
            artifactPath: projectDoctor?.artifactPath,
          }
        )
      );
    }

    const importReadinessCard = await buildImportReadinessCard(projectPath, projectName);
    if (importReadinessCard) {
      cards.push(importReadinessCard);
    }
  }

  const analyzeArtifact = await readJsonArtifact(path.join(reportsDir, 'analyze-last-run.json'));
  if (isArtifactReadFailure(analyzeArtifact)) {
    cards.push(
      corruptArtifactCard({
        id: 'analyze',
        label: 'Analyze',
        artifactPath: analyzeArtifact.artifactPath,
        error: analyzeArtifact.error,
        kind: analyzeArtifact.kind,
        incidentStudioTarget: 'analyze',
      })
    );
  } else if (analyzeArtifact.kind === 'valid') {
    const analyzeRaw = analyzeArtifact.raw;
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
    const rawStatus: DashboardEvidenceStatus =
      verdict === 'missing' ? (fail > 0 ? 'fail' : warn > 0 ? 'warn' : 'pass') : verdict;
    cards.push({
      id: 'analyze',
      label: 'Analyze',
      status: softenEmptyWorkspaceAnalyzeStatus({
        workspaceProjectCount,
        status: rawStatus,
        fail,
        warn,
        blockers,
      }),
      summary: `Score ${score} · ${fail} fail · ${warn} warn`,
      scope: 'workspace',
      generatedAt: reportGeneratedAt(analyzeRaw),
      artifactPath: analyzeArtifact.artifactPath,
      metrics: mergeReportMetrics({ score, fail, warn }, analyzeRaw),
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

  const readinessArtifact = await readJsonArtifact(
    path.join(reportsDir, 'release-readiness-last-run.json')
  );
  if (isArtifactReadFailure(readinessArtifact)) {
    cards.push(
      corruptArtifactCard({
        id: 'readiness',
        label: 'Readiness',
        artifactPath: readinessArtifact.artifactPath,
        error: readinessArtifact.error,
        kind: readinessArtifact.kind,
        incidentStudioTarget: 'readiness',
      })
    );
  } else if (readinessArtifact.kind === 'valid') {
    const readinessRaw = readinessArtifact.raw;
    const overallStatus = normalizeEvidenceStatus(readinessRaw.overallStatus);
    const blockers = extractBlockersFromReport('release-readiness-last-run', readinessRaw);
    cards.push({
      id: 'readiness',
      label: 'Readiness',
      status: overallStatus === 'missing' ? 'warn' : overallStatus,
      summary:
        blockers.length > 0 ? `${blockers.length} blocking gate(s)` : 'All readiness gates passed.',
      scope: 'workspace',
      generatedAt: reportGeneratedAt(readinessRaw),
      artifactPath: readinessArtifact.artifactPath,
      metrics: mergeReportMetrics({ blockers: blockers.length }, readinessRaw),
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
  } else {
    cards.push(await buildBootstrapPendingCard(workspacePath));
  }

  const autopilotEvidence = await readAutopilotReleaseReport(reportsDir);
  if (autopilotEvidence) {
    const { raw: autopilotRaw, artifactPath } = autopilotEvidence;
    const status = autopilotEvidenceStatus(autopilotRaw);
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
      artifactPath,
      blockers,
      incidentStudioTarget: 'release',
    });
  } else {
    cards.push(
      missingCard(
        'autopilot',
        'Autopilot release',
        'No autopilot release report yet. Run Autopilot Release from Evidence or Operate.',
        'workspace',
        'release'
      )
    );
  }

  cards.push(...(await buildWorkspaceIntelligenceCards(reportsDir)));
  cards.push(...(await buildWorkspaceStateCards(workspacePath)));
  cards.push(...(await buildHandoffCards(workspacePath)));
  cards.push(...(await buildGovernanceOperationalCards(workspacePath, reportsDir)));

  const trend = await readWorkspaceTrend(workspacePath);

  const finalizedCards =
    workspaceProjectCount === 0
      ? cards.map((card) => ({
          ...card,
          blockers: filterBlockersForEmptyWorkspace(workspaceProjectCount, card.blockers ?? []),
        }))
      : cards;

  return {
    workspacePath,
    projectPath,
    projectName,
    cards: finalizedCards.map(attachDashboardIncidentSummary),
    trend,
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
    case 'pipeline-last-run':
      return findEvidenceCardById(bundle, 'pipeline');
    case 'release-readiness-last-run':
      return findEvidenceCardById(bundle, 'readiness');
    case 'bootstrap-compliance':
      return findEvidenceCardById(bundle, 'bootstrap');
    case 'autopilot-release':
      return findEvidenceCardById(bundle, 'autopilot');
    case 'workspace-run-last':
      return findEvidenceCardById(bundle, 'workspaceRun');
    case 'share-bundle':
      return findEvidenceCardById(bundle, 'share');
    case 'snapshot-last-run':
      return findEvidenceCardById(bundle, 'snapshot');
    case 'workspace-model':
      return findEvidenceCardById(bundle, 'workspaceModel');
    case 'workspace-model-snapshot':
      return findEvidenceCardById(bundle, 'intelligenceSnapshot');
    case 'workspace-model-diff':
      return findEvidenceCardById(bundle, 'workspaceDiff');
    case 'workspace-impact':
      return findEvidenceCardById(bundle, 'workspaceImpact');
    case 'workspace-verify':
      return findEvidenceCardById(bundle, 'workspaceVerify');
    case 'workspace-contract-verify':
      return findEvidenceCardById(bundle, 'contract');
    case 'workspace-explain':
      return findEvidenceCardById(bundle, 'workspaceExplain');
    case 'workspace-why':
      return findEvidenceCardById(bundle, 'workspaceWhy');
    case 'workspace-trace':
      return findEvidenceCardById(bundle, 'workspaceTrace');
    case 'workspace-skills-index':
      return findEvidenceCardById(bundle, 'agentGrounding');
    case 'workspace-context-agent':
      return findEvidenceCardById(bundle, 'workspaceContextAgent');
    case 'agent-reports-index':
      return findEvidenceCardById(bundle, 'agentGrounding');
    case 'archive-manifest':
      return findEvidenceCardById(bundle, 'archive');
    case 'mirror-ops':
      return findEvidenceCardById(bundle, 'mirror');
    case 'infra-plan':
      return findEvidenceCardById(bundle, 'infra');
    case 'import-readiness':
      return findEvidenceCardById(bundle, 'importReadiness');
    default:
      return undefined;
  }
}

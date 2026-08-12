/**
 * Doctor Evidence Provider
 * Reads canonical Workspai doctor evidence and, when a project is
 * selected, merges project-scoped `doctor-project-last-run.json` (probes, signals).
 */

import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import { buildRapidkitDisplayCommand } from '../../utils/platformCapabilities';
import {
  buildDoctorIssueHandoffPayload,
  type DoctorIssueHandoffPayload,
} from '../../core/doctorIssueHandoff';
import {
  summarizePolicyViolations,
  formatPolicyViolation,
} from '../../core/workspacePolicyViolations';
import {
  resolveWorkspaceArtifactPath,
  resolveWorkspaceReportsDir,
} from '../../core/workspaceIntelligencePaths';
import {
  projectDoctorEvidence,
  type DoctorFindingTarget,
  type DoctorVerdict,
} from '../../core/doctorEvidenceProjection.js';

const EVIDENCE_RELOAD_DEBOUNCE_MS = 200;

// ─── Evidence JSON shape (matches npm doctor output) ────────────────────────

interface SystemCheck {
  status: 'ok' | 'warn' | 'error';
  message: string;
  details?: string;
}

type SystemToolCheck = SystemCheck & {
  paths?: { location: string; path: string; version: string }[];
};

export interface DoctorProbe {
  id?: string;
  label?: string;
  status?: string;
  severity?: string;
  reason?: string;
  recommendation?: string;
}

export interface ProjectEvidence {
  name: string;
  path: string;
  framework?: string;
  kit?: string;
  projectKind?: string;
  depsInstalled?: boolean;
  modulesHealthy?: boolean;
  hasTests?: boolean;
  hasCodeQuality?: boolean;
  vulnerabilities?: number;
  issues: string[];
  fixCommands?: string[];
  probes?: DoctorProbe[];
  verdict?: DoctorVerdict;
  diagnosis?: DoctorFindingTarget[];
}

interface HealthScore {
  total: number;
  passed: number;
  warnings: number;
  errors: number;
}

export interface DoctorEvidence {
  generatedAt: string;
  workspacePath: string;
  workspaceName: string;
  projectScanCached?: boolean;
  healthScore: HealthScore;
  focusProjectPath?: string;
  focusHealthScore?: HealthScore;
  system: Record<string, SystemToolCheck> & {
    versions?: {
      core?: string;
      npm?: string;
    };
  };
  projects: ProjectEvidence[];
}

export interface DoctorIssueAIContext {
  workspaceName?: string;
  generatedAt?: string;
  healthScore?: HealthScore;
  systemVersions?: {
    core?: string;
    npm?: string;
  };
}

// ─── Item kinds ─────────────────────────────────────────────────────────────

type ItemKind =
  | 'summary'
  | 'timestamp'
  | 'section'
  | 'system-check'
  | 'project'
  | 'issue'
  | 'probe-section'
  | 'probe'
  | 'signal'
  | 'policy-section'
  | 'policy-violation'
  | 'no-data'
  | 'no-workspace';

export class DoctorEvidenceItem extends vscode.TreeItem {
  public issueHandoff?: DoctorIssueHandoffPayload;

  constructor(
    label: string,
    public readonly kind: ItemKind,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly evidenceData?: DoctorEvidence,
    public readonly projectData?: ProjectEvidence
  ) {
    super(label, collapsibleState);
  }
}

function attachDoctorIssueHandoff(
  item: DoctorEvidenceItem,
  input: {
    issue: string;
    kind: DoctorIssueHandoffPayload['kind'];
    probe?: DoctorProbe;
    finding?: DoctorFindingTarget;
  }
): DoctorEvidenceItem {
  const handoff = buildDoctorIssueHandoffPayload({
    issue: input.issue,
    kind: input.kind,
    evidence: item.evidenceData,
    project: item.projectData,
    probe: input.probe,
    finding: input.finding,
  });
  if (handoff) {
    item.issueHandoff = handoff;
    item.contextValue = 'doctorIssue';
  }
  return item;
}

function isInsideWorkspace(projectPath: string, workspacePath: string): boolean {
  const project = path.resolve(projectPath);
  const workspace = path.resolve(workspacePath);
  return project === workspace || project.startsWith(`${workspace}${path.sep}`);
}

function parseHealthScore(raw: unknown): HealthScore {
  const score =
    raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const passed = Number(score.passed ?? 0);
  const warnings = Number(score.warnings ?? 0);
  const errors = Number(score.errors ?? 0);
  const total = Number(score.total ?? passed + warnings + errors);
  return { total, passed, warnings, errors };
}

function parseProbes(raw: unknown): DoctorProbe[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const probes = raw
    .filter((probe): probe is Record<string, unknown> => probe && typeof probe === 'object')
    .map((probe) => ({
      id: typeof probe.id === 'string' ? probe.id : undefined,
      label: typeof probe.label === 'string' ? probe.label : undefined,
      status: typeof probe.status === 'string' ? probe.status : undefined,
      severity: typeof probe.severity === 'string' ? probe.severity : undefined,
      reason: typeof probe.reason === 'string' ? probe.reason : undefined,
      recommendation: typeof probe.recommendation === 'string' ? probe.recommendation : undefined,
    }));
  return probes.length > 0 ? probes : undefined;
}

export function normalizeProjectEvidence(raw: unknown): ProjectEvidence | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const projectPath = typeof record.path === 'string' ? record.path : '';
  if (!projectPath) {
    return null;
  }
  const vulnerabilitiesRaw = Number(record.vulnerabilities);
  const projection = projectDoctorEvidence(
    { project: record },
    {
      scope: 'project',
      projectPath,
      projectName: typeof record.name === 'string' ? record.name : undefined,
    }
  );
  return {
    name: typeof record.name === 'string' ? record.name : path.basename(projectPath),
    path: projectPath,
    framework: typeof record.framework === 'string' ? record.framework : undefined,
    kit: typeof record.kit === 'string' ? record.kit : undefined,
    projectKind: typeof record.projectKind === 'string' ? record.projectKind : undefined,
    depsInstalled: typeof record.depsInstalled === 'boolean' ? record.depsInstalled : undefined,
    modulesHealthy: typeof record.modulesHealthy === 'boolean' ? record.modulesHealthy : undefined,
    hasTests: typeof record.hasTests === 'boolean' ? record.hasTests : undefined,
    hasCodeQuality: typeof record.hasCodeQuality === 'boolean' ? record.hasCodeQuality : undefined,
    vulnerabilities: Number.isFinite(vulnerabilitiesRaw) ? vulnerabilitiesRaw : undefined,
    issues: Array.isArray(record.issues)
      ? record.issues.filter((issue): issue is string => typeof issue === 'string')
      : [],
    fixCommands: Array.isArray(record.fixCommands)
      ? record.fixCommands.filter((cmd): cmd is string => typeof cmd === 'string')
      : undefined,
    probes: parseProbes(record.probes),
    verdict: projection.verdict,
    diagnosis: projection.canonical ? projection.findings : undefined,
  };
}

function mergeProjectEvidence(base: ProjectEvidence, rich: ProjectEvidence): ProjectEvidence {
  return {
    ...base,
    ...rich,
    issues: rich.issues.length > 0 ? rich.issues : base.issues,
    probes: rich.probes?.length ? rich.probes : base.probes,
    fixCommands: rich.fixCommands?.length ? rich.fixCommands : base.fixCommands,
  };
}

function projectHasAttention(project: ProjectEvidence): boolean {
  if (project.verdict) {
    return project.verdict !== 'passed';
  }
  return (
    project.issues.length > 0 ||
    (project.probes?.some((probe) => probe.status === 'warn' || probe.status === 'fail') ??
      false) ||
    (project.vulnerabilities ?? 0) > 0
  );
}

function probeStatusIcon(status?: string): string {
  if (status === 'fail' || status === 'error') {
    return '❌';
  }
  if (status === 'warn') {
    return '⚠️';
  }
  return '✅';
}

// ─── Provider ───────────────────────────────────────────────────────────────

export class DoctorEvidenceProvider implements vscode.TreeDataProvider<DoctorEvidenceItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    DoctorEvidenceItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private workspacePathResolver: () => string | null;
  private projectPathResolver: () => string | null;
  private _overridePath: string | null = null;
  private fileWatcher?: vscode.FileSystemWatcher;
  private verifyWatcher?: vscode.FileSystemWatcher;
  private evidence: DoctorEvidence | null = null;
  private verifyReportRaw: Record<string, unknown> | null = null;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    workspacePathResolver: () => string | null = () => null,
    projectPathResolver: () => string | null = () => null
  ) {
    this.workspacePathResolver = workspacePathResolver;
    this.projectPathResolver = projectPathResolver;
    this.setupFileWatcher();
  }

  setWorkspacePath(workspacePath: string | null): void {
    this._overridePath = workspacePath;
    this.reload();
  }

  refresh(): void {
    this.reload();
  }

  private resolvedPath(): string | null {
    return this.workspacePathResolver() ?? this._overridePath;
  }

  private resolvedProjectPath(): string | null {
    const workspacePath = this.resolvedPath();
    const projectPath = this.projectPathResolver();
    if (!workspacePath || !projectPath) {
      return null;
    }
    if (!isInsideWorkspace(projectPath, workspacePath)) {
      return null;
    }
    return projectPath;
  }

  private async reload(): Promise<void> {
    this.evidence = null;
    this.evidence = await this.readEvidence();
    this.verifyReportRaw = await this.readVerifyReportRaw();
    this._onDidChangeTreeData.fire();
  }

  private setupFileWatcher(): void {
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      '**/{.workspai,.rapidkit}/reports/doctor-*.json',
      false,
      false,
      true
    );
    this.fileWatcher.onDidCreate(() => this.scheduleReload());
    this.fileWatcher.onDidChange(() => this.scheduleReload());

    // Workspace verify drives the governance/policy section of the health tree.
    this.verifyWatcher = vscode.workspace.createFileSystemWatcher(
      '**/{.workspai,.rapidkit}/reports/workspace-verify-last-run.json',
      false,
      false,
      true
    );
    this.verifyWatcher.onDidCreate(() => this.scheduleReload());
    this.verifyWatcher.onDidChange(() => this.scheduleReload());
  }

  private async readVerifyReportRaw(): Promise<Record<string, unknown> | null> {
    const workspacePath = this.resolvedPath();
    if (!workspacePath) {
      return null;
    }
    const reportsDir = await resolveWorkspaceReportsDir(workspacePath);
    const verifyPath = path.join(reportsDir, 'workspace-verify-last-run.json');
    try {
      if (!(await fs.pathExists(verifyPath))) {
        return null;
      }
      const raw = (await fs.readJSON(verifyPath)) as Record<string, unknown>;
      return raw && typeof raw === 'object' ? raw : null;
    } catch {
      return null;
    }
  }

  private scheduleReload(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }

    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null;
      void this.reload();
    }, EVIDENCE_RELOAD_DEBOUNCE_MS);
  }

  dispose(): void {
    this.fileWatcher?.dispose();
    this.verifyWatcher?.dispose();
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
    this._onDidChangeTreeData.dispose();
  }

  private async readWorkspaceEvidence(workspacePath: string): Promise<DoctorEvidence | null> {
    const reportsDir = await resolveWorkspaceReportsDir(workspacePath);
    const evidencePath = path.join(reportsDir, 'doctor-last-run.json');
    try {
      if (!(await fs.pathExists(evidencePath))) {
        return null;
      }
      const raw = (await fs.readJSON(evidencePath)) as DoctorEvidence;
      raw.projects = Array.isArray(raw.projects)
        ? raw.projects
            .map((project) => normalizeProjectEvidence(project))
            .filter((project): project is ProjectEvidence => project !== null)
        : [];
      return raw;
    } catch {
      return null;
    }
  }

  private async loadProjectDoctorRaw(
    workspacePath: string,
    projectPath: string
  ): Promise<Record<string, unknown> | undefined> {
    const candidates = [
      await resolveWorkspaceArtifactPath(
        projectPath,
        '.workspai/reports/doctor-project-last-run.json'
      ),
      await resolveWorkspaceArtifactPath(
        workspacePath,
        '.workspai/reports/doctor-project-last-run.json'
      ),
    ];

    for (const candidate of candidates) {
      try {
        if (!(await fs.pathExists(candidate))) {
          continue;
        }
        const raw = (await fs.readJSON(candidate)) as Record<string, unknown>;
        const nestedProject =
          raw.project && typeof raw.project === 'object'
            ? (raw.project as Record<string, unknown>)
            : undefined;
        const reportProjectPath =
          typeof raw.projectPath === 'string'
            ? raw.projectPath
            : typeof nestedProject?.path === 'string'
              ? nestedProject.path
              : undefined;
        if (reportProjectPath && path.resolve(reportProjectPath) !== path.resolve(projectPath)) {
          continue;
        }
        return raw;
      } catch {
        continue;
      }
    }

    return undefined;
  }

  private applyProjectDoctorEnvelope(
    evidence: DoctorEvidence | null,
    raw: Record<string, unknown>,
    workspacePath: string,
    projectPath: string
  ): DoctorEvidence {
    const projectRecord = normalizeProjectEvidence(raw.project);
    if (!projectRecord) {
      return evidence ?? this.emptyEvidence(workspacePath);
    }
    projectRecord.path = projectPath;

    const healthScore = parseHealthScore(raw.healthScore);
    const generatedAt =
      typeof raw.generatedAt === 'string' ? raw.generatedAt : new Date().toISOString();
    const system =
      raw.system && typeof raw.system === 'object'
        ? (raw.system as DoctorEvidence['system'])
        : (evidence?.system ?? ({} as DoctorEvidence['system']));

    if (!evidence) {
      return {
        generatedAt,
        workspacePath,
        workspaceName: path.basename(workspacePath),
        healthScore,
        focusProjectPath: projectPath,
        focusHealthScore: healthScore,
        system,
        projects: [projectRecord],
      };
    }

    const projects = [...evidence.projects];
    const index = projects.findIndex(
      (project) => path.resolve(project.path) === path.resolve(projectPath)
    );
    if (index >= 0) {
      projects[index] = mergeProjectEvidence(projects[index], projectRecord);
    } else {
      projects.push(projectRecord);
    }

    return {
      ...evidence,
      projects,
      focusProjectPath: projectPath,
      focusHealthScore: healthScore,
    };
  }

  private emptyEvidence(workspacePath: string): DoctorEvidence {
    return {
      generatedAt: new Date().toISOString(),
      workspacePath,
      workspaceName: path.basename(workspacePath),
      healthScore: { total: 0, passed: 0, warnings: 0, errors: 0 },
      system: {} as DoctorEvidence['system'],
      projects: [],
    };
  }

  private async readEvidence(): Promise<DoctorEvidence | null> {
    const workspacePath = this.resolvedPath();
    if (!workspacePath) {
      return null;
    }

    let evidence = await this.readWorkspaceEvidence(workspacePath);
    const selectedProjectPath = this.resolvedProjectPath();
    if (selectedProjectPath) {
      const projectRaw = await this.loadProjectDoctorRaw(workspacePath, selectedProjectPath);
      if (projectRaw) {
        evidence = this.applyProjectDoctorEnvelope(
          evidence,
          projectRaw,
          workspacePath,
          selectedProjectPath
        );
      }
    }

    return evidence;
  }

  private scoreBar(pct: number): string {
    const filled = Math.round(pct / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  private relativeTime(iso: string): string {
    try {
      const diff = Date.now() - new Date(iso).getTime();
      const secs = Math.floor(diff / 1000);
      if (secs < 60) {
        return 'just now';
      }
      const mins = Math.floor(secs / 60);
      if (mins < 60) {
        return `${mins}m ago`;
      }
      const hours = Math.floor(mins / 60);
      if (hours < 24) {
        return `${hours}h ago`;
      }
      return `${Math.floor(hours / 24)}d ago`;
    } catch {
      return '';
    }
  }

  private statusIcon(status: 'ok' | 'warn' | 'error'): string {
    return status === 'ok' ? '✅' : status === 'warn' ? '⚠️' : '❌';
  }

  private systemLabel(key: string): string {
    const labels: Record<string, string> = {
      python: 'Python',
      poetry: 'Poetry',
      pipx: 'pipx',
      go: 'Go',
      rapidkitCore: 'RapidKit Core',
    };
    return labels[key] ?? key;
  }

  private buildIssueItem(
    issue: string,
    evidence: DoctorEvidence | undefined,
    project?: ProjectEvidence,
    finding?: DoctorFindingTarget
  ): DoctorEvidenceItem {
    const item = new DoctorEvidenceItem(
      issue,
      'issue',
      vscode.TreeItemCollapsibleState.None,
      evidence,
      project
    );
    item.iconPath = new vscode.ThemeIcon('circle-filled');
    item.tooltip = issue;
    return attachDoctorIssueHandoff(item, { issue, kind: 'issue', finding });
  }

  private buildSignalRows(project: ProjectEvidence): DoctorEvidenceItem[] {
    const rows: DoctorEvidenceItem[] = [];
    if (typeof project.hasTests === 'boolean') {
      const item = new DoctorEvidenceItem(
        `${project.hasTests ? '✅' : '⊘'}  Tests`,
        'signal',
        vscode.TreeItemCollapsibleState.None
      );
      item.description = project.hasTests ? 'configured' : 'not detected';
      rows.push(item);
    }
    if (typeof project.hasCodeQuality === 'boolean') {
      const label =
        project.projectKind === 'frontend' ? 'Lint (ESLint)' : 'Code quality (Ruff/format)';
      const item = new DoctorEvidenceItem(
        `${project.hasCodeQuality ? '✅' : '⊘'}  ${label}`,
        'signal',
        vscode.TreeItemCollapsibleState.None
      );
      item.description = project.hasCodeQuality ? 'configured' : 'not detected';
      rows.push(item);
    }
    if (typeof project.modulesHealthy === 'boolean') {
      const label = project.projectKind === 'frontend' ? 'Source tree' : 'RapidKit modules';
      const item = new DoctorEvidenceItem(
        `${project.modulesHealthy ? '✅' : '⚠️'}  ${label}`,
        'signal',
        vscode.TreeItemCollapsibleState.None
      );
      item.description = project.modulesHealthy ? 'healthy' : 'needs attention';
      rows.push(item);
    }
    return rows;
  }

  getTreeItem(element: DoctorEvidenceItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: DoctorEvidenceItem): Promise<DoctorEvidenceItem[]> {
    if (!element) {
      if (!this.resolvedPath()) {
        const item = new DoctorEvidenceItem(
          'Select a workspace to view health',
          'no-workspace',
          vscode.TreeItemCollapsibleState.None
        );
        item.iconPath = new vscode.ThemeIcon('workspace');
        item.command = {
          command: 'workspai.quickSwitchWorkspace',
          title: 'Select Workspace',
        };
        item.tooltip = 'Select a workspace, then run doctor for health evidence.';
        return [item];
      }

      this.evidence = await this.readEvidence();
      this.verifyReportRaw = await this.readVerifyReportRaw();

      if (!this.evidence) {
        const item = new DoctorEvidenceItem(
          'No health data — run doctor to scan',
          'no-data',
          vscode.TreeItemCollapsibleState.None
        );
        item.iconPath = new vscode.ThemeIcon('pulse');
        item.command = {
          command: 'workspai.doctorEvidence.rerun',
          title: 'Run Doctor',
        };
        item.tooltip = `Run ${buildRapidkitDisplayCommand(['doctor', 'workspace'])}`;
        return [item];
      }

      const ev = this.evidence;
      const displayScore = ev.focusHealthScore ?? ev.healthScore;
      const pct =
        displayScore.total > 0 ? Math.round((displayScore.passed / displayScore.total) * 100) : 0;
      const focusedProject = ev.focusProjectPath
        ? ev.projects.find(
            (project) => path.resolve(project.path) === path.resolve(ev.focusProjectPath!)
          )
        : undefined;

      const summaryItem = new DoctorEvidenceItem(
        `${pct}%  ${this.scoreBar(pct)}`,
        'summary',
        vscode.TreeItemCollapsibleState.None,
        ev
      );
      summaryItem.description = focusedProject
        ? `${focusedProject.name} · ✅ ${displayScore.passed}  ⚠️ ${displayScore.warnings}  ❌ ${displayScore.errors}`
        : `✅ ${displayScore.passed}  ⚠️ ${displayScore.warnings}  ❌ ${displayScore.errors}`;
      summaryItem.iconPath = new vscode.ThemeIcon('pulse');
      summaryItem.contextValue = 'doctorSummary';
      summaryItem.tooltip = new vscode.MarkdownString(
        (focusedProject
          ? `**Project focus:** ${focusedProject.name}\n\n`
          : `**Workspace:** ${ev.workspaceName}\n\n`) +
          `Score: **${pct}%** (${displayScore.passed} passed, ` +
          `${displayScore.warnings} warnings, ${displayScore.errors} errors)\n\n` +
          (ev.projectScanCached
            ? '_Using cached project scan_'
            : focusedProject
              ? '_Project doctor evidence_'
              : '_Fresh scan_')
      );

      const tsItem = new DoctorEvidenceItem(
        `Last checked: ${this.relativeTime(ev.generatedAt)}`,
        'timestamp',
        vscode.TreeItemCollapsibleState.None,
        ev
      );
      tsItem.iconPath = new vscode.ThemeIcon('history');
      tsItem.description = ev.projectScanCached
        ? '(cached scan)'
        : focusedProject
          ? '(project)'
          : '';
      tsItem.tooltip = new Date(ev.generatedAt).toLocaleString();

      const systemKeys = Object.keys(ev.system).filter((key) => key !== 'versions');
      const systemWarnings = systemKeys.filter((key) => ev.system[key].status !== 'ok').length;
      const systemSection = new DoctorEvidenceItem(
        'System Tools',
        'section',
        vscode.TreeItemCollapsibleState.Collapsed,
        ev
      );
      systemSection.description = systemWarnings > 0 ? `${systemWarnings} issue(s)` : 'all ok';
      systemSection.iconPath = new vscode.ThemeIcon('server');

      const projectAttention = ev.projects.filter((project) => projectHasAttention(project)).length;
      const projectSection = new DoctorEvidenceItem(
        `Projects (${ev.projects.length})`,
        'section',
        vscode.TreeItemCollapsibleState.Collapsed,
        ev
      );
      projectSection.description =
        projectAttention > 0 ? `${projectAttention} need attention` : 'all healthy';
      projectSection.iconPath = new vscode.ThemeIcon('package');

      const nodes = [summaryItem, tsItem, systemSection, projectSection];

      const policy = summarizePolicyViolations(this.verifyReportRaw);
      if (policy.violations.length > 0 || policy.blockers.length > 0) {
        const policySection = new DoctorEvidenceItem(
          'Governance Policy',
          'policy-section',
          policy.errors > 0 || policy.blockers.length > 0
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed,
          ev
        );
        const modeSuffix = policy.mode ? ` · ${policy.mode}` : '';
        policySection.description = `${policy.errors} error(s) · ${policy.warnings} warning(s)${modeSuffix}`;
        policySection.iconPath = new vscode.ThemeIcon(
          policy.errors > 0 || policy.blockers.length > 0 ? 'shield' : 'warning'
        );
        policySection.contextValue = 'workspacePolicySection';
        policySection.tooltip = new vscode.MarkdownString(
          `**Governance policy** (\`workspace verify\`)\n\n` +
            `Mode: \`${policy.mode ?? 'unknown'}\`\n\n` +
            `${policy.errors} error(s), ${policy.warnings} warning(s).\n\n` +
            (policy.blockers.length > 0
              ? `Error-severity violations remain a persistent release blocker until resolved.`
              : `Warnings do not block release but should be reviewed.`)
        );
        nodes.push(policySection);
      }

      return nodes;
    }

    if (element.kind === 'section' && element.label?.toString().startsWith('System')) {
      const ev = element.evidenceData!;
      return Object.entries(ev.system)
        .filter((entry): entry is [string, SystemToolCheck] => entry[0] !== 'versions')
        .map(([key, check]) => {
          const item = new DoctorEvidenceItem(
            `${this.statusIcon(check.status)}  ${this.systemLabel(key)}`,
            'system-check',
            vscode.TreeItemCollapsibleState.None
          );
          item.description = check.message;
          item.tooltip = check.details ?? check.message;
          item.iconPath = undefined;
          return item;
        });
    }

    if (element.kind === 'section' && element.label?.toString().startsWith('Projects')) {
      const ev = element.evidenceData!;
      return ev.projects.map((project) => {
        const needsAttention = projectHasAttention(project);
        const isFocused =
          ev.focusProjectPath && path.resolve(project.path) === path.resolve(ev.focusProjectPath);
        const icon = project.verdict === 'blocked' ? '❌' : needsAttention ? '⚠️' : '✅';
        const item = new DoctorEvidenceItem(
          `${icon}  ${project.name}${isFocused ? ' (selected)' : ''}`,
          'project',
          needsAttention || isFocused
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.None,
          ev,
          project
        );
        const descriptionParts = [project.framework ?? project.kit ?? ''];
        if ((project.vulnerabilities ?? 0) > 0) {
          descriptionParts.push(`${project.vulnerabilities} vuln(s)`);
        }
        const probeWarnings =
          project.probes?.filter((probe) => probe.status === 'warn' || probe.status === 'fail') ??
          [];
        if (probeWarnings.length > 0) {
          descriptionParts.push(`${probeWarnings.length} probe(s)`);
        }
        item.description = descriptionParts.filter(Boolean).join(' · ');
        item.tooltip = needsAttention
          ? `${project.issues.length} issue(s), ${probeWarnings.length} probe warning(s)`
          : `Healthy · ${project.framework ?? ''}`;
        item.iconPath = new vscode.ThemeIcon(
          project.verdict === 'blocked' ? 'error' : needsAttention ? 'warning' : 'pass'
        );
        return item;
      });
    }

    if (element.kind === 'project' && element.projectData) {
      const project = element.projectData;
      const evidence = element.evidenceData;
      const items: DoctorEvidenceItem[] = [];

      items.push(...this.buildSignalRows(project));

      if (project.diagnosis?.length) {
        for (const finding of project.diagnosis.filter(
          (entry) => entry.status === 'blocking' || entry.status === 'advisory'
        )) {
          items.push(this.buildIssueItem(finding.symptom, evidence, project, finding));
        }
        return items;
      }

      if ((project.vulnerabilities ?? 0) > 0) {
        const count = project.vulnerabilities ?? 0;
        const vulnText = `${count} npm security vulnerabilit${count === 1 ? 'y' : 'ies'} reported`;
        items.push(this.buildIssueItem(vulnText, evidence, project));
      }

      if (project.probes && project.probes.length > 0) {
        const probeWarnings = project.probes.filter(
          (probe) => probe.status === 'warn' || probe.status === 'fail'
        );
        const probeSection = new DoctorEvidenceItem(
          'Probe checks',
          'probe-section',
          probeWarnings.length > 0
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed,
          evidence,
          project
        );
        probeSection.description =
          probeWarnings.length > 0 ? `${probeWarnings.length} need attention` : 'all pass';
        probeSection.iconPath = new vscode.ThemeIcon(probeWarnings.length > 0 ? 'warning' : 'pass');
        items.push(probeSection);
      }

      for (const issue of project.issues) {
        items.push(this.buildIssueItem(issue, evidence, project));
      }

      return items;
    }

    if (element.kind === 'probe-section' && element.projectData?.probes) {
      const evidence = element.evidenceData;
      const project = element.projectData;
      return element.projectData.probes.map((probe) => {
        const label = probe.label ?? probe.id ?? 'Probe check';
        const detail = probe.reason?.trim() || probe.recommendation?.trim() || '';
        const item = new DoctorEvidenceItem(
          `${probeStatusIcon(probe.status)}  ${label}`,
          'probe',
          vscode.TreeItemCollapsibleState.None,
          evidence,
          project
        );
        item.description = detail || (probe.status ?? '');
        item.tooltip = detail || label;
        if (probe.status === 'warn' || probe.status === 'fail') {
          const issueText = detail ? `${label}: ${detail}` : label;
          attachDoctorIssueHandoff(item, { issue: issueText, kind: 'probe', probe });
        }
        return item;
      });
    }

    if (element.kind === 'policy-section') {
      const evidence = element.evidenceData;
      const policy = summarizePolicyViolations(this.verifyReportRaw);
      const items: DoctorEvidenceItem[] = [];
      const errorViolationLabels = new Set(
        policy.violations
          .filter((violation) => violation.severity === 'error')
          .map(formatPolicyViolation)
      );

      const sorted = [...policy.violations].sort((a, b) =>
        a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1
      );
      for (const violation of sorted) {
        const icon = violation.severity === 'error' ? '❌' : '⚠️';
        const item = new DoctorEvidenceItem(
          `${icon}  policy.${violation.code}`,
          'policy-violation',
          vscode.TreeItemCollapsibleState.None,
          evidence
        );
        item.description = violation.message + (violation.target ? ` · ${violation.target}` : '');
        item.tooltip = `${formatPolicyViolation(violation)}\n\nSource: ${violation.source} · severity: ${violation.severity}`;
        attachDoctorIssueHandoff(item, {
          issue: formatPolicyViolation(violation),
          kind: 'policy-violation',
        });
        items.push(item);
      }

      // Surface non-policy blocking reasons (e.g. missing required evidence) too.
      for (const reason of policy.blockers) {
        if (errorViolationLabels.has(reason)) {
          continue;
        }
        const item = new DoctorEvidenceItem(
          `❌  ${reason}`,
          'policy-violation',
          vscode.TreeItemCollapsibleState.None,
          evidence
        );
        item.tooltip = reason;
        attachDoctorIssueHandoff(item, { issue: reason, kind: 'policy-violation' });
        items.push(item);
      }

      return items;
    }

    return [];
  }
}

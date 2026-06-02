/**
 * Doctor Evidence Provider
 * Reads .rapidkit/reports/doctor-last-run.json from the selected workspace
 * and renders it as an inline sidebar tree — no extra CLI call needed.
 */

import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';

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

export interface ProjectEvidence {
  name: string;
  path: string;
  framework?: string;
  depsInstalled?: boolean;
  issues: string[];
  fixCommands?: string[];
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
  | 'no-data'
  | 'no-workspace';

export class DoctorEvidenceItem extends vscode.TreeItem {
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

// ─── Provider ───────────────────────────────────────────────────────────────

export class DoctorEvidenceProvider implements vscode.TreeDataProvider<DoctorEvidenceItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    DoctorEvidenceItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  // Live resolver — called every time getChildren() runs.
  // Falls back to the last explicitly-set path so both code paths work.
  private workspacePathResolver: () => string | null;
  private _overridePath: string | null = null;
  private fileWatcher?: vscode.FileSystemWatcher;
  private evidence: DoctorEvidence | null = null;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(workspacePathResolver: () => string | null = () => null) {
    this.workspacePathResolver = workspacePathResolver;
    this.setupFileWatcher();
  }

  // Still available so the workspaceSelected command can force a refresh
  setWorkspacePath(workspacePath: string | null): void {
    this._overridePath = workspacePath;
    this.reload();
  }

  refresh(): void {
    this.reload();
  }

  private resolvedPath(): string | null {
    // Prefer live resolver; fall back to last explicit override
    return this.workspacePathResolver() ?? this._overridePath;
  }

  private async reload(): Promise<void> {
    this.evidence = null; // invalidate cache so getChildren re-reads fresh
    this.evidence = await this.readEvidence();
    this._onDidChangeTreeData.fire();
  }

  private setupFileWatcher(): void {
    // Auto-refresh whenever any evidence file is written by CLI
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      '**/.rapidkit/reports/doctor-last-run.json',
      false,
      false,
      true
    );
    this.fileWatcher.onDidCreate(() => this.scheduleReload());
    this.fileWatcher.onDidChange(() => this.scheduleReload());
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
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
    this._onDidChangeTreeData.dispose();
  }

  private evidencePath(): string | null {
    const p = this.resolvedPath();
    if (!p) {
      return null;
    }
    return path.join(p, '.rapidkit', 'reports', 'doctor-last-run.json');
  }

  private async readEvidence(): Promise<DoctorEvidence | null> {
    const ep = this.evidencePath();
    if (!ep) {
      return null;
    }
    try {
      if (!(await fs.pathExists(ep))) {
        return null;
      }
      return (await fs.readJSON(ep)) as DoctorEvidence;
    } catch {
      return null;
    }
  }

  // ─── Score bar helpers ────────────────────────────────────────────────────

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

  // ─── TreeDataProvider ─────────────────────────────────────────────────────

  getTreeItem(element: DoctorEvidenceItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: DoctorEvidenceItem): Promise<DoctorEvidenceItem[]> {
    // ── Root ──────────────────────────────────────────────────────────────
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
        item.tooltip = 'Click to choose a workspace, then run doctor for health evidence.';
        return [item];
      }

      // Always re-read from disk — ensures workspace switch shows fresh data
      this.evidence = await this.readEvidence();

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
        item.tooltip = 'Click to run: npx --yes --package rapidkit rapidkit doctor workspace';
        return [item];
      }

      const ev = this.evidence;
      const pct =
        ev.healthScore.total > 0
          ? Math.round((ev.healthScore.passed / ev.healthScore.total) * 100)
          : 0;

      // ── Summary row ───────────────────────────────────────────────────
      const summaryItem = new DoctorEvidenceItem(
        `${pct}%  ${this.scoreBar(pct)}`,
        'summary',
        vscode.TreeItemCollapsibleState.None,
        ev
      );
      summaryItem.description = `✅ ${ev.healthScore.passed}  ⚠️ ${ev.healthScore.warnings}  ❌ ${ev.healthScore.errors}`;
      summaryItem.iconPath = new vscode.ThemeIcon('pulse');
      summaryItem.contextValue = 'doctorSummary';
      summaryItem.tooltip = new vscode.MarkdownString(
        `**Workspace:** ${ev.workspaceName}\n\n` +
          `Score: **${pct}%** (${ev.healthScore.passed} passed, ` +
          `${ev.healthScore.warnings} warnings, ${ev.healthScore.errors} errors)\n\n` +
          (ev.projectScanCached ? '_Using cached project scan_' : '_Fresh scan_')
      );

      // ── Timestamp row ─────────────────────────────────────────────────
      const tsItem = new DoctorEvidenceItem(
        `Last checked: ${this.relativeTime(ev.generatedAt)}`,
        'timestamp',
        vscode.TreeItemCollapsibleState.None,
        ev
      );
      tsItem.iconPath = new vscode.ThemeIcon('history');
      tsItem.description = ev.projectScanCached ? '(cached scan)' : '';
      tsItem.tooltip = new Date(ev.generatedAt).toLocaleString();

      // ── System Tools section ──────────────────────────────────────────
      const systemKeys = Object.keys(ev.system).filter((k) => k !== 'versions');
      const systemWarnings = systemKeys.filter((k) => ev.system[k].status !== 'ok').length;
      const systemSection = new DoctorEvidenceItem(
        `System Tools`,
        'section',
        vscode.TreeItemCollapsibleState.Collapsed,
        ev
      );
      systemSection.description = systemWarnings > 0 ? `${systemWarnings} issue(s)` : 'all ok';
      systemSection.iconPath = new vscode.ThemeIcon('server');

      // ── Projects section ──────────────────────────────────────────────
      const projectIssues = ev.projects.filter((p) => p.issues.length > 0).length;
      const projectSection = new DoctorEvidenceItem(
        `Projects (${ev.projects.length})`,
        'section',
        vscode.TreeItemCollapsibleState.Collapsed,
        ev
      );
      projectSection.description =
        projectIssues > 0 ? `${projectIssues} with issues` : 'all healthy';
      projectSection.iconPath = new vscode.ThemeIcon('package');

      return [summaryItem, tsItem, systemSection, projectSection];
    }

    // ── System Tools children ──────────────────────────────────────────────
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

    // ── Projects children ──────────────────────────────────────────────────
    if (element.kind === 'section' && element.label?.toString().startsWith('Projects')) {
      const ev = element.evidenceData!;
      return ev.projects.map((project) => {
        const hasIssues = project.issues.length > 0;
        const icon = hasIssues ? '⚠️' : '✅';
        const item = new DoctorEvidenceItem(
          `${icon}  ${project.name}`,
          'project',
          hasIssues
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None,
          ev,
          project
        );
        item.description = project.framework ?? '';
        item.tooltip = hasIssues
          ? `${project.issues.length} issue(s): ${project.issues[0]}`
          : `Healthy · ${project.framework ?? ''}`;
        item.iconPath = new vscode.ThemeIcon(hasIssues ? 'warning' : 'pass');
        return item;
      });
    }

    // ── Project issues children ────────────────────────────────────────────
    if (element.kind === 'project' && element.projectData) {
      return element.projectData.issues.map((issue) => {
        const item = new DoctorEvidenceItem(issue, 'issue', vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('circle-filled');
        item.tooltip = issue;
        item.contextValue = 'doctorIssue';
        const evidence = element.evidenceData;
        const versions = evidence?.system?.versions;
        const aiContext: DoctorIssueAIContext = {
          workspaceName: evidence?.workspaceName,
          generatedAt: evidence?.generatedAt,
          healthScore: evidence?.healthScore,
          systemVersions:
            versions && (versions.core || versions.npm)
              ? {
                  core: typeof versions.core === 'string' ? versions.core : undefined,
                  npm: typeof versions.npm === 'string' ? versions.npm : undefined,
                }
              : undefined,
        };
        item.command = {
          command: 'workspai.doctorEvidence.fixIssueWithAI',
          title: 'Fix with AI',
          arguments: [issue, element.projectData, aiContext],
        };
        return item;
      });
    }

    return [];
  }
}

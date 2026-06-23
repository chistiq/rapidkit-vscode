import * as vscode from 'vscode';
import {
  readWorkspaceContractGraph,
  type WorkspaceContractGraphModel,
  type WorkspaceContractProject,
  WORKSPACE_CONTRACT_PATH,
} from '../../utils/workspaceContractGraph';

const CONTRACT_RELOAD_DEBOUNCE_MS = 200;

type ContractGraphItemKind =
  | 'summary'
  | 'section'
  | 'project'
  | 'port'
  | 'api'
  | 'env'
  | 'dependency'
  | 'event'
  | 'conflict'
  | 'missing'
  | 'invalid'
  | 'no-workspace';

export class WorkspaceContractGraphItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly kind: ContractGraphItemKind,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly model?: WorkspaceContractGraphModel,
    public readonly project?: WorkspaceContractProject
  ) {
    super(label, collapsibleState);
    this.contextValue = kind;
  }
}

export class WorkspaceContractGraphProvider implements vscode.TreeDataProvider<WorkspaceContractGraphItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    WorkspaceContractGraphItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly workspacePathResolver: () => string | null;
  private fileWatcher?: vscode.FileSystemWatcher;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;
  private overridePath: string | null = null;

  constructor(workspacePathResolver: () => string | null = () => null) {
    this.workspacePathResolver = workspacePathResolver;
    this.setupFileWatcher();
  }

  setWorkspacePath(workspacePath: string | null): void {
    this.overridePath = workspacePath;
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  dispose(): void {
    this.fileWatcher?.dispose();
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
    this._onDidChangeTreeData.dispose();
  }

  getTreeItem(element: WorkspaceContractGraphItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: WorkspaceContractGraphItem): Promise<WorkspaceContractGraphItem[]> {
    if (!element) {
      const workspacePath = this.resolvedPath();
      if (!workspacePath) {
        const item = new WorkspaceContractGraphItem(
          'Select a workspace to view contract graph',
          'no-workspace',
          vscode.TreeItemCollapsibleState.None
        );
        item.iconPath = new vscode.ThemeIcon('type-hierarchy');
        item.command = {
          command: 'workspai.quickSwitchWorkspace',
          title: 'Select Workspace',
        };
        item.tooltip = 'Select a workspace, then inspect service topology and ports.';
        return [item];
      }

      const model = await readWorkspaceContractGraph(workspacePath);
      if (model.status === 'missing') {
        const item = new WorkspaceContractGraphItem(
          'No contract found - initialize one',
          'missing',
          vscode.TreeItemCollapsibleState.None,
          model
        );
        item.description = 'click to create';
        item.iconPath = new vscode.ThemeIcon('add');
        item.command = {
          command: 'workspai.workspaceContractInit',
          title: 'Initialize Workspace Contract',
          arguments: [{ workspace: { path: workspacePath, name: model.workspaceName } }],
        };
        return [item];
      }

      if (model.status === 'invalid') {
        const item = new WorkspaceContractGraphItem(
          'Contract cannot be parsed',
          'invalid',
          vscode.TreeItemCollapsibleState.None,
          model
        );
        item.description = model.invalidReason;
        item.iconPath = new vscode.ThemeIcon('error');
        item.command = {
          command: 'workspai.workspaceContractOpen',
          title: 'Open Workspace Contract',
          arguments: [{ workspace: { path: workspacePath, name: model.workspaceName } }],
        };
        return [item];
      }

      return this.rootItems(model);
    }

    const model = element.model;
    if (!model || model.status !== 'ready') {
      return [];
    }

    if (element.kind === 'section') {
      return this.sectionChildren(element.label?.toString() || '', model);
    }

    if (element.kind === 'project' && element.project) {
      return this.projectChildren(model, element.project);
    }

    return [];
  }

  private rootItems(model: WorkspaceContractGraphModel): WorkspaceContractGraphItem[] {
    const summary = new WorkspaceContractGraphItem(
      `${model.projects.length} services · ${model.dependencyEdges.length} deps · ${model.eventEdges.length} events`,
      'summary',
      vscode.TreeItemCollapsibleState.None,
      model
    );
    summary.iconPath = new vscode.ThemeIcon(
      model.portConflicts.length > 0 ? 'warning' : 'type-hierarchy'
    );
    summary.description =
      model.portConflicts.length > 0 ? `${model.portConflicts.length} port conflict(s)` : undefined;
    summary.command = {
      command: 'workspai.workspaceContractGraph',
      title: 'Show Workspace Contract Graph',
      arguments: [{ workspace: { path: model.workspacePath, name: model.workspaceName } }],
    };

    const sections = [
      this.section('Services', model.projects.length, model),
      this.section('Dependency Links', model.dependencyEdges.length, model),
      this.section('Event Links', model.eventEdges.length, model),
      this.section('Port Conflicts', model.portConflicts.length, model),
    ];

    return [summary, ...sections];
  }

  private section(
    label: string,
    count: number,
    model: WorkspaceContractGraphModel
  ): WorkspaceContractGraphItem {
    const item = new WorkspaceContractGraphItem(
      label,
      'section',
      count > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
      model
    );
    item.description = String(count);
    item.iconPath = new vscode.ThemeIcon(
      label === 'Services'
        ? 'server-process'
        : label === 'Dependency Links'
          ? 'references'
          : label === 'Event Links'
            ? 'radio-tower'
            : 'warning'
    );
    return item;
  }

  private sectionChildren(
    sectionLabel: string,
    model: WorkspaceContractGraphModel
  ): WorkspaceContractGraphItem[] {
    if (sectionLabel === 'Services') {
      return model.projects.map((project) => {
        const item = new WorkspaceContractGraphItem(
          project.name || project.slug,
          'project',
          vscode.TreeItemCollapsibleState.Collapsed,
          model,
          project
        );
        item.description = project.framework || project.relativePath;
        item.tooltip = [
          `Slug: ${project.slug}`,
          `Path: ${project.relativePath}`,
          project.framework ? `Framework: ${project.framework}` : '',
        ]
          .filter(Boolean)
          .join('\n');
        item.iconPath = new vscode.ThemeIcon('server-process');
        return item;
      });
    }

    if (sectionLabel === 'Dependency Links') {
      return model.dependencyEdges.map((edge) => {
        const item = new WorkspaceContractGraphItem(
          `${edge.from} -> ${edge.to}`,
          'dependency',
          vscode.TreeItemCollapsibleState.None,
          model
        );
        item.iconPath = new vscode.ThemeIcon('references');
        return item;
      });
    }

    if (sectionLabel === 'Event Links') {
      return model.eventEdges.map((edge) => {
        const item = new WorkspaceContractGraphItem(
          `${edge.from} -> ${edge.to}`,
          'event',
          vscode.TreeItemCollapsibleState.None,
          model
        );
        item.description = edge.event;
        item.iconPath = new vscode.ThemeIcon('radio-tower');
        return item;
      });
    }

    if (sectionLabel === 'Port Conflicts') {
      return model.portConflicts.map((conflict) => {
        const item = new WorkspaceContractGraphItem(
          `:${conflict.port}`,
          'conflict',
          vscode.TreeItemCollapsibleState.None,
          model
        );
        item.description = conflict.projects.join(', ');
        item.iconPath = new vscode.ThemeIcon('warning');
        return item;
      });
    }

    return [];
  }

  private projectChildren(
    model: WorkspaceContractGraphModel,
    project: WorkspaceContractProject
  ): WorkspaceContractGraphItem[] {
    const items: WorkspaceContractGraphItem[] = [];

    for (const port of project.ports || []) {
      const item = new WorkspaceContractGraphItem(
        `${port.name}: ${port.port}`,
        'port',
        vscode.TreeItemCollapsibleState.None,
        model,
        project
      );
      item.description = port.protocol;
      item.iconPath = new vscode.ThemeIcon('plug');
      items.push(item);
    }

    for (const api of project.contracts?.apis || []) {
      const item = new WorkspaceContractGraphItem(
        api.name,
        'api',
        vscode.TreeItemCollapsibleState.None,
        model,
        project
      );
      item.description = api.basePath;
      item.iconPath = new vscode.ThemeIcon('symbol-interface');
      items.push(item);
    }

    for (const envName of project.contracts?.env || []) {
      const item = new WorkspaceContractGraphItem(
        envName,
        'env',
        vscode.TreeItemCollapsibleState.None,
        model,
        project
      );
      item.iconPath = new vscode.ThemeIcon('key');
      items.push(item);
    }

    return items;
  }

  private resolvedPath(): string | null {
    return this.workspacePathResolver() ?? this.overridePath;
  }

  private setupFileWatcher(): void {
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      `**/${WORKSPACE_CONTRACT_PATH.replace(/\\/g, '/')}`,
      false,
      false,
      true
    );
    this.fileWatcher.onDidCreate(() => this.scheduleReload());
    this.fileWatcher.onDidChange(() => this.scheduleReload());
    this.fileWatcher.onDidDelete(() => this.scheduleReload());
  }

  private scheduleReload(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null;
      this.refresh();
    }, CONTRACT_RELOAD_DEBOUNCE_MS);
  }
}

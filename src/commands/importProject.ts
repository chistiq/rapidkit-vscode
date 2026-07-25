import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import { WorkspaceManager } from '../core/workspaceManager';
import { Logger } from '../utils/logger';
import { upsertImportedProjectsRegistry } from '../utils/importedProjectsRegistry';
import { WorkspaceUsageTracker } from '../utils/workspaceUsageTracker';
import { evaluateWorkspaiContractRuntime } from '../core/workspaiContractRuntime';
import {
  describeCanonicalCliFailure,
  isCanonicalCliFailure,
  runCanonicalNpmImport,
} from '../core/canonicalProjectLifecycle';
import {
  ensureManagedDefaultWorkspace,
  ensureWorkspaceSkeletonViaNpm,
  registerManagedWorkspacePath,
} from '../core/ensureManagedDefaultWorkspace';
import { refreshExtensionAfterNpmProjectOnboard } from '../core/npmProjectOnboardRefresh';
import {
  hasWorkspaceRootMarkers,
  resolveManagedDefaultImportWorkspacePath,
  resolveNewWorkspacePath,
} from '../core/workspacePaths';
import { resolveEnableModulesPreference } from '../core/moduleEnablementPrompt';
import { gateImportCli } from '../core/rapidkitCliCapabilities';
import { ByopDiscoveryEngine } from '../core/byopDiscovery';
import {
  detectProjectStackFromByopDiscovery,
  detectProjectStackFromSignals,
  deriveProjectNameFromGitUrl,
  normalizeProjectName,
  type DetectedStack,
  type StackDetection,
} from './importProjectUtils';

type WorkspaceLike = { path: string; name?: string };
type ProjectLike = {
  path: string;
  name: string;
  type?: string;
  workspacePath: string;
};

type WorkspaceExplorerLike = {
  refresh: () => void;
  getSelectedWorkspace: () => WorkspaceLike | null | undefined;
};

type ProjectExplorerLike = {
  refresh: () => void;
};

type ImportSourceType = 'local-folder' | 'git-url' | 'drag-drop';
type WorkspaceResolutionMode = 'selected' | 'auto' | 'select' | 'new';
type ImportSourcePickerValue = ImportSourceType | 'drag-drop-helper';
type ImportTelemetrySource = 'local-folder' | 'git-url' | 'dragdrop';

interface ResolvedWorkspace {
  path: string;
  name: string;
  mode: WorkspaceResolutionMode;
}

interface ImportedProject {
  name: string;
  path: string;
  detection: StackDetection;
}

interface ImportProjectCommandOptions {
  getWorkspaceExplorer: () => WorkspaceExplorerLike | undefined;
  getProjectExplorer: () => ProjectExplorerLike | undefined;
}

interface ImportProjectInvocationSeed {
  source?: ImportSourceType;
  droppedPaths?: string[];
  enableModules?: boolean;
  path?: string;
  name?: string;
  useDefaultWorkspace?: boolean;
}

const OPEN_STUDIO_ACTION = 'Open Studio';
const VIEW_ARCHITECTURE_ACTION = 'View Architecture Map';
const HEALTH_CHECK_ACTION = 'Run Health Check';
const BATCH_IMPORT_CONCURRENCY = 3;
const PICK_WORKSPACE_ACTION = 'Pick Workspace';
const CREATE_WORKSPACE_ACTION = 'Create Workspace';
const USE_DEFAULT_WORKSPACE_ACTION = 'Use Default Workspace';
const IMPORT_WORKSPACE_ACTION = 'Import Workspace';

async function showImportWorkspaceResolutionHelp(input: {
  title: string;
  detail: string;
}): Promise<void> {
  const action = await vscode.window.showWarningMessage(
    `${input.title}\n${input.detail}\nNext: pick a registered workspace, create one, or use the managed default workspace.`,
    PICK_WORKSPACE_ACTION,
    CREATE_WORKSPACE_ACTION,
    USE_DEFAULT_WORKSPACE_ACTION
  );

  if (action === PICK_WORKSPACE_ACTION) {
    await vscode.commands.executeCommand('workspai.quickSwitchWorkspace');
    return;
  }

  if (action === CREATE_WORKSPACE_ACTION) {
    await vscode.commands.executeCommand('workspai.createWorkspace');
    return;
  }

  if (action === USE_DEFAULT_WORKSPACE_ACTION) {
    const ensured = await ensureManagedDefaultWorkspace();
    await vscode.commands.executeCommand('workspai.selectWorkspace', ensured.path);
  }
}

async function showWorkspaceSourceImportRedirect(sourcePath: string): Promise<void> {
  const action = await vscode.window.showWarningMessage(
    `This is a workspace. Import it as a workspace instead.\n${sourcePath}`,
    IMPORT_WORKSPACE_ACTION,
    'Cancel'
  );

  if (action === IMPORT_WORKSPACE_ACTION) {
    await vscode.commands.executeCommand('workspai.importWorkspace');
  }
}

function summarizeC06Status(input: {
  evaluated: boolean;
  errors: string[];
  warnings: string[];
  availableKinds: string[];
}): string {
  if (!input.evaluated) {
    return 'C06 contracts: not found';
  }
  return `C06 contracts: ${input.availableKinds.length} loaded, ${input.errors.length} error(s), ${input.warnings.length} warning(s)`;
}

function toTelemetryImportSource(source: ImportSourceType): ImportTelemetrySource {
  return source === 'drag-drop' ? 'dragdrop' : source;
}

async function trackImportLifecycleEvent(input: {
  workspacePath?: string;
  source?: ImportSourceType;
  workspaceResolutionMode?: WorkspaceResolutionMode;
  result: 'success' | 'cancelled' | 'failed';
  reason?: string;
  importedProjectCount?: number;
  stack?: StackDetection['stack'];
  confidence?: StackDetection['confidence'];
}): Promise<void> {
  const payload: Record<string, unknown> = {
    result: input.result,
  };

  if (input.source) {
    payload.source = toTelemetryImportSource(input.source);
  }

  if (input.workspaceResolutionMode) {
    payload.workspaceResolutionMode = input.workspaceResolutionMode;
  }

  if (input.reason) {
    payload.reason = input.reason;
  }

  if (typeof input.importedProjectCount === 'number') {
    payload.importedProjectCount = input.importedProjectCount;
  }

  if (input.stack) {
    payload.stack = input.stack;
  }

  if (input.confidence) {
    payload.confidence = input.confidence;
  }

  await WorkspaceUsageTracker.getInstance().trackCommandEvent(
    'workspai.importProject',
    input.workspacePath,
    payload
  );
}

interface BatchImportTask {
  sourcePath: string;
  sourceName: string;
  destinationPath: string;
}

function stackLabel(stack: DetectedStack): string {
  if (stack === 'fastapi') {
    return 'FastAPI';
  }
  if (stack === 'django') {
    return 'Django';
  }
  if (stack === 'flask') {
    return 'Flask';
  }
  if (stack === 'nestjs') {
    return 'NestJS';
  }
  if (stack === 'express') {
    return 'Express';
  }
  if (stack === 'koa') {
    return 'Koa';
  }
  if (stack === 'springboot') {
    return 'Spring Boot';
  }
  if (stack === 'go') {
    return 'Go (Gin/Echo/Go HTTP)';
  }
  if (stack === 'rails') {
    return 'Rails';
  }
  if (stack === 'dotnet') {
    return '.NET';
  }
  return 'Unknown';
}

function toInvocationSeed(seed: unknown): ImportProjectInvocationSeed | null {
  if (!seed || typeof seed !== 'object') {
    return null;
  }

  const candidate = seed as ImportProjectInvocationSeed;
  const sourceValid =
    candidate.source === 'local-folder' ||
    candidate.source === 'git-url' ||
    candidate.source === 'drag-drop';

  const hasWorkspacePath = typeof candidate.path === 'string' && candidate.path.trim().length > 0;

  if (
    !sourceValid &&
    !Array.isArray(candidate.droppedPaths) &&
    !hasWorkspacePath &&
    candidate.useDefaultWorkspace !== true
  ) {
    return null;
  }

  return {
    source: sourceValid ? candidate.source : undefined,
    droppedPaths: Array.isArray(candidate.droppedPaths)
      ? candidate.droppedPaths.filter((item): item is string => typeof item === 'string')
      : undefined,
    enableModules:
      typeof candidate.enableModules === 'boolean' ? candidate.enableModules : undefined,
    path: hasWorkspacePath ? candidate.path?.trim() : undefined,
    name: typeof candidate.name === 'string' ? candidate.name : undefined,
    useDefaultWorkspace: candidate.useDefaultWorkspace === true ? true : undefined,
  };
}

function isSameOrInsideDirectory(parentPath: string, childPath: string): boolean {
  const resolvedParent = path.resolve(parentPath);
  const resolvedChild = path.resolve(childPath);
  const relativePath = path.relative(resolvedParent, resolvedChild);
  return (
    relativePath === '' ||
    (relativePath.length > 0 && !relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  );
}

async function detectProjectStack(projectPath: string): Promise<StackDetection> {
  try {
    const discovery = await new ByopDiscoveryEngine(projectPath).discover();
    const byopDetection = detectProjectStackFromByopDiscovery(discovery);
    if (byopDetection.stack !== 'unknown') {
      return byopDetection;
    }
  } catch {
    // Fall back to lightweight marker-based detection below.
  }

  const packageJsonPath = path.join(projectPath, 'package.json');

  let hasNestDependency = false;
  const hasPackageJson = await fs.pathExists(packageJsonPath);
  if (hasPackageJson) {
    try {
      const pkg = await fs.readJSON(packageJsonPath);
      hasNestDependency = Boolean(
        pkg?.dependencies?.['@nestjs/core'] || pkg?.devDependencies?.['@nestjs/core']
      );
    } catch {
      hasNestDependency = false;
    }
  }

  return detectProjectStackFromSignals({
    hasPyProject: await fs.pathExists(path.join(projectPath, 'pyproject.toml')),
    hasGoMod: await fs.pathExists(path.join(projectPath, 'go.mod')),
    hasPomXml: await fs.pathExists(path.join(projectPath, 'pom.xml')),
    hasGradle: await fs.pathExists(path.join(projectPath, 'build.gradle')),
    hasGradleKts: await fs.pathExists(path.join(projectPath, 'build.gradle.kts')),
    hasCsproj: await hasFileWithExtension(projectPath, '.csproj'),
    hasSln: await hasFileWithExtension(projectPath, '.sln'),
    hasPackageJson,
    hasNestDependency,
  });
}

async function hasFileWithExtension(rootPath: string, extension: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(rootPath, { withFileTypes: true });
    return entries.some((entry) => entry.isFile() && entry.name.endsWith(extension));
  } catch {
    return false;
  }
}

async function ensureDefaultWorkspace(): Promise<ResolvedWorkspace> {
  const ensured = await ensureManagedDefaultWorkspace();
  return {
    path: ensured.path,
    name: ensured.name,
    mode: 'auto',
  };
}

async function promptWorkspaceSelectionFromRegistry(): Promise<ResolvedWorkspace | null> {
  const manager = WorkspaceManager.getInstance();
  const workspaces = await manager.loadWorkspaces();

  const picks = workspaces.map((ws) => ({
    label: ws.name,
    description: ws.path,
    detail: 'Registered Workspai workspace',
    value: ws.path,
  }));

  picks.push({
    label: '$(folder-opened) Browse Workspace Folder...',
    description: 'Select an existing workspace folder manually',
    detail: 'Folder must contain Workspai workspace markers',
    value: '__browse__',
  });

  const selected = await vscode.window.showQuickPick(picks, {
    title: 'Select Workspace Destination',
    placeHolder: 'Pick where the imported project should be placed',
    ignoreFocusOut: true,
  });

  if (!selected) {
    return null;
  }

  if (selected.value === '__browse__') {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Use Workspace Folder',
      title: 'Select Existing Workspai Workspace',
    });

    const folderPath = picked?.[0]?.fsPath;
    if (!folderPath) {
      return null;
    }

    const registered = await registerManagedWorkspacePath(folderPath);
    if (!registered) {
      await showImportWorkspaceResolutionHelp({
        title: 'Selected folder is not a governed Workspai workspace.',
        detail:
          'Import needs a workspace root with .rapidkit-workspace or .rapidkit/workspace.json.',
      });
      return null;
    }

    const manager = WorkspaceManager.getInstance();
    const workspace = manager.getWorkspaces().find((ws) => ws.path === folderPath);
    if (!workspace) {
      return null;
    }

    return {
      path: workspace.path,
      name: workspace.name ?? path.basename(workspace.path),
      mode: 'select',
    };
  }

  const workspace = workspaces.find((ws) => ws.path === selected.value);
  if (!workspace) {
    return null;
  }

  return {
    path: workspace.path,
    name: workspace.name,
    mode: 'select',
  };
}

async function promptNewWorkspaceCreation(): Promise<ResolvedWorkspace | null> {
  const workspaceNameInput = await vscode.window.showInputBox({
    title: 'Create Workspace for Import',
    prompt: 'Workspace name',
    value: `workspace-${new Date().toISOString().slice(0, 10)}`,
    ignoreFocusOut: true,
    validateInput: (value) => {
      const normalized = normalizeProjectName(value);
      if (!normalized) {
        return 'Workspace name cannot be empty.';
      }
      return undefined;
    },
  });

  if (!workspaceNameInput) {
    return null;
  }

  const workspaceName = normalizeProjectName(workspaceNameInput);
  if (!workspaceName) {
    return null;
  }

  const workspacePath = resolveNewWorkspacePath(workspaceName);

  await ensureWorkspaceSkeletonViaNpm(workspacePath, workspaceName);

  return {
    path: workspacePath,
    name: workspaceName,
    mode: 'new',
  };
}

async function resolveWorkspaceDestination(
  options: ImportProjectCommandOptions
): Promise<ResolvedWorkspace | null> {
  const workspaceExplorer = options.getWorkspaceExplorer();
  const selectedWorkspace = workspaceExplorer?.getSelectedWorkspace?.();

  if (selectedWorkspace?.path && (await fs.pathExists(selectedWorkspace.path))) {
    return {
      path: selectedWorkspace.path,
      name: selectedWorkspace.name ?? path.basename(selectedWorkspace.path),
      mode: 'selected',
    };
  }

  const destination = await vscode.window.showQuickPick(
    [
      {
        label: '$(rocket) Auto',
        description: 'Create or reuse default workspace automatically',
        detail: `Recommended for quick start (${resolveManagedDefaultImportWorkspacePath()})`,
        value: 'auto',
      },
      {
        label: '$(list-selection) Select',
        description: 'Choose an existing workspace',
        detail: 'Pick from registered workspaces or browse manually',
        value: 'select',
      },
      {
        label: '$(new-folder) New',
        description: 'Create a new workspace now',
        detail: 'Creates a lightweight workspace skeleton for import',
        value: 'new',
      },
    ],
    {
      title: 'Import Destination',
      placeHolder: 'No active workspace detected. Choose destination strategy.',
      ignoreFocusOut: true,
    }
  );

  if (!destination) {
    return null;
  }

  if (destination.value === 'auto') {
    return ensureDefaultWorkspace();
  }

  if (destination.value === 'select') {
    return promptWorkspaceSelectionFromRegistry();
  }

  return promptNewWorkspaceCreation();
}

async function resolveAvailableDestinationProjectPath(
  workspacePath: string,
  suggestedName: string
): Promise<string> {
  const baseName = normalizeProjectName(suggestedName) || 'imported-project';

  let attempt = 0;
  for (;;) {
    const candidateName =
      attempt === 0
        ? baseName
        : attempt === 1
          ? `${baseName}-imported`
          : `${baseName}-imported-${attempt}`;
    const candidatePath = path.join(workspacePath, candidateName);

    if (!(await fs.pathExists(candidatePath))) {
      return candidatePath;
    }

    attempt += 1;
  }
}

async function resolveDestinationProjectPath(
  workspacePath: string,
  suggestedName: string
): Promise<string | null> {
  const normalizedSuggested = normalizeProjectName(suggestedName) || 'imported-project';
  let destinationPath = path.join(workspacePath, normalizedSuggested);

  if (!(await fs.pathExists(destinationPath))) {
    return destinationPath;
  }

  const choice = await vscode.window.showWarningMessage(
    `A project named "${normalizedSuggested}" already exists in this workspace.`,
    { modal: true },
    'Rename Imported Project',
    'Use Safe Name',
    'Cancel'
  );

  if (choice === 'Cancel' || !choice) {
    return null;
  }

  if (choice === 'Use Safe Name') {
    return resolveAvailableDestinationProjectPath(workspacePath, normalizedSuggested);
  }

  const renamed = await vscode.window.showInputBox({
    title: 'Rename Imported Project',
    prompt: 'New project name',
    value: `${normalizedSuggested}-imported`,
    ignoreFocusOut: true,
    validateInput: (value) => {
      const normalized = normalizeProjectName(value);
      if (!normalized) {
        return 'Project name cannot be empty.';
      }
      return undefined;
    },
  });

  if (!renamed) {
    return null;
  }

  destinationPath = path.join(workspacePath, normalizeProjectName(renamed));
  if (await fs.pathExists(destinationPath)) {
    await showImportWorkspaceResolutionHelp({
      title: 'Destination project already exists.',
      detail: `Choose another workspace or rename the imported project before using "${normalizeProjectName(renamed)}".`,
    });
    return null;
  }

  return destinationPath;
}

async function importFromFolderPath(
  workspacePath: string | undefined,
  sourcePath: string,
  _progressTitle = 'Importing project folder...',
  options?: { enableModules?: boolean }
): Promise<{ project: ImportedProject; workspacePath: string } | null> {
  const sourceStats = await fs.stat(sourcePath).catch(() => null);
  if (!sourceStats || !sourceStats.isDirectory()) {
    await showImportWorkspaceResolutionHelp({
      title: 'Import source is not a project folder.',
      detail: 'Drop or select a directory that contains the project you want to adopt/import.',
    });
    return null;
  }

  if (hasWorkspaceRootMarkers(sourcePath)) {
    await showWorkspaceSourceImportRedirect(sourcePath);
    return null;
  }

  if (workspacePath && isSameOrInsideDirectory(workspacePath, sourcePath)) {
    await showImportWorkspaceResolutionHelp({
      title: 'Import source is inside the destination workspace.',
      detail:
        'Use Project Create for new in-workspace projects, or choose an external folder for import/adopt.',
    });
    return null;
  }

  const suggestedName = path.basename(sourcePath);
  let projectName = suggestedName;
  if (workspacePath) {
    const destinationPath = await resolveDestinationProjectPath(workspacePath, suggestedName);
    if (!destinationPath) {
      return null;
    }
    projectName = path.basename(destinationPath);
  }

  const canonicalResult = await runCanonicalNpmImport({
    workspacePath,
    source: sourcePath,
    projectName,
    enableModules: options?.enableModules,
  });
  if (isCanonicalCliFailure(canonicalResult)) {
    throw new Error(describeCanonicalCliFailure('import', canonicalResult));
  }

  const importedPath = canonicalResult.importedProject!.path!;
  const resolvedWorkspacePath = canonicalResult.workspacePath ?? workspacePath;
  if (!resolvedWorkspacePath) {
    throw new Error('Import finished without workspacePath in npm JSON output.');
  }

  const detection = await detectProjectStack(importedPath);
  return {
    workspacePath: resolvedWorkspacePath,
    project: {
      name: canonicalResult.importedProject!.name ?? projectName,
      path: importedPath,
      detection,
    },
  };
}

async function importFromFolderPathWithoutProgress(
  workspacePath: string,
  sourcePath: string,
  destinationPath: string,
  options?: { enableModules?: boolean }
): Promise<ImportedProject | null> {
  const sourceStats = await fs.stat(sourcePath).catch(() => null);
  if (!sourceStats || !sourceStats.isDirectory()) {
    return null;
  }

  if (hasWorkspaceRootMarkers(sourcePath)) {
    return null;
  }

  if (isSameOrInsideDirectory(workspacePath, sourcePath)) {
    return null;
  }

  const projectName = path.basename(destinationPath);
  const canonicalResult = await runCanonicalNpmImport({
    workspacePath,
    source: sourcePath,
    projectName,
    enableModules: options?.enableModules,
  });
  if (isCanonicalCliFailure(canonicalResult)) {
    throw new Error(describeCanonicalCliFailure('import', canonicalResult));
  }

  const detection = await detectProjectStack(canonicalResult.importedProject!.path!);
  return {
    name: projectName,
    path: canonicalResult.importedProject!.path!,
    detection,
  };
}

async function importFromLocalFolder(
  workspacePath: string | undefined,
  options?: { enableModules?: boolean }
): Promise<{ project: ImportedProject; workspacePath: string } | null> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Import Project Folder',
    title: 'Select Project Folder to Import',
  });

  const sourcePath = picked?.[0]?.fsPath;
  if (!sourcePath) {
    return null;
  }

  return importFromFolderPath(workspacePath, sourcePath, 'Importing project folder...', options);
}

async function resolveBatchDestinationProjectPath(
  workspacePath: string,
  suggestedName: string,
  reservedDestinationPaths: Set<string>
): Promise<string> {
  const baseName = normalizeProjectName(suggestedName) || 'imported-project';

  let attempt = 0;
  for (;;) {
    const candidateName =
      attempt === 0
        ? baseName
        : attempt === 1
          ? `${baseName}-imported`
          : `${baseName}-imported-${attempt}`;
    const candidatePath = path.join(workspacePath, candidateName);

    if (reservedDestinationPaths.has(candidatePath)) {
      attempt += 1;
      continue;
    }

    if (!(await fs.pathExists(candidatePath))) {
      reservedDestinationPaths.add(candidatePath);
      return candidatePath;
    }

    attempt += 1;
  }
}

async function importFromDroppedPaths(
  workspacePath: string,
  droppedPaths: string[],
  options?: { enableModules?: boolean }
): Promise<ImportedProject[] | null> {
  const uniquePaths = Array.from(
    new Set(droppedPaths.map((item) => item.trim()).filter((item) => item.length > 0))
  );
  if (uniquePaths.length === 0) {
    return null;
  }

  const directoryCandidates: string[] = [];
  for (const candidate of uniquePaths) {
    const stats = await fs.stat(candidate).catch(() => null);
    if (stats?.isDirectory()) {
      directoryCandidates.push(candidate);
    }
  }

  if (directoryCandidates.length === 0) {
    vscode.window.showWarningMessage('No folders detected in drop payload. Drop a project folder.');
    return null;
  }

  if (directoryCandidates.length === 1) {
    const imported = await importFromFolderPath(
      workspacePath,
      directoryCandidates[0],
      'Importing dropped project folder...',
      options
    );
    return imported ? [imported.project] : null;
  }

  const importAllChoice = 'Import All';
  const chooseOneChoice = 'Choose One';
  const modeSelection = await vscode.window.showQuickPick(
    [
      {
        label: importAllChoice,
        detail: `Import all ${directoryCandidates.length} dropped folders`,
        value: 'all',
      },
      {
        label: chooseOneChoice,
        detail: 'Select one folder from the dropped list',
        value: 'one',
      },
    ],
    {
      title: 'Dropped Multiple Folders',
      placeHolder: 'Choose import mode for dropped folders',
      ignoreFocusOut: true,
    }
  );

  if (!modeSelection) {
    return null;
  }

  if (modeSelection.value === 'one') {
    const picked = await vscode.window.showQuickPick(
      directoryCandidates.map((candidate) => ({
        label: path.basename(candidate) || candidate,
        description: candidate,
        value: candidate,
      })),
      {
        title: 'Select Dropped Folder to Import',
        placeHolder: 'Choose one folder to import',
        ignoreFocusOut: true,
      }
    );

    if (!picked) {
      return null;
    }

    const imported = await importFromFolderPath(
      workspacePath,
      picked.value,
      'Importing dropped project folder...',
      options
    );
    return imported ? [imported.project] : null;
  }

  const plannedImports: BatchImportTask[] = [];
  const reservedDestinationPaths = new Set<string>();
  for (const folderPath of directoryCandidates) {
    const sourceName = path.basename(folderPath) || folderPath;
    const destinationPath = await resolveBatchDestinationProjectPath(
      workspacePath,
      sourceName,
      reservedDestinationPaths
    );
    plannedImports.push({
      sourcePath: folderPath,
      sourceName,
      destinationPath,
    });
  }

  const importedProjectsByIndex: Array<ImportedProject | null> = new Array(
    plannedImports.length
  ).fill(null);
  let skippedCount = 0;
  let nextIndex = 0;
  let completedCount = 0;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Batch importing ${plannedImports.length} dropped folders...`,
      cancellable: false,
    },
    async (progress) => {
      const progressStep = 100 / plannedImports.length;
      const workerCount = Math.min(BATCH_IMPORT_CONCURRENCY, plannedImports.length);

      const runWorker = async (): Promise<void> => {
        for (;;) {
          const currentIndex = nextIndex;
          nextIndex += 1;

          if (currentIndex >= plannedImports.length) {
            return;
          }

          const task = plannedImports[currentIndex];
          progress.report({
            message: `[${currentIndex + 1}/${plannedImports.length}] Importing ${task.sourceName}`,
          });

          try {
            importedProjectsByIndex[currentIndex] = await importFromFolderPathWithoutProgress(
              workspacePath,
              task.sourcePath,
              task.destinationPath,
              options
            );
          } catch {
            importedProjectsByIndex[currentIndex] = null;
          }

          if (!importedProjectsByIndex[currentIndex]) {
            skippedCount += 1;
          }

          completedCount += 1;
          progress.report({
            increment: progressStep,
            message: `Completed ${completedCount}/${plannedImports.length}`,
          });
        }
      };

      await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    }
  );

  const importedProjects = importedProjectsByIndex.filter(
    (item): item is ImportedProject => item !== null
  );

  if (importedProjects.length === 0) {
    vscode.window.showWarningMessage('No dropped folders were imported.');
    return null;
  }

  if (skippedCount > 0) {
    vscode.window.showInformationMessage(
      `Imported ${importedProjects.length} folder(s). Skipped ${skippedCount}.`
    );
  }

  return importedProjects;
}

async function importFromGitUrl(
  workspacePath: string | undefined,
  options?: { enableModules?: boolean }
): Promise<{ project: ImportedProject; workspacePath: string } | null> {
  const gitUrl = await vscode.window.showInputBox({
    title: 'Clone and Import Project',
    prompt: 'Repository URL',
    placeHolder: 'https://github.com/owner/repo.git',
    ignoreFocusOut: true,
    validateInput: (value) => {
      const trimmed = value.trim();
      if (!trimmed) {
        return 'Git URL is required.';
      }

      if (!trimmed.includes('://') && !trimmed.includes('@')) {
        return 'Enter a valid HTTPS/SSH Git URL.';
      }

      return undefined;
    },
  });

  if (!gitUrl) {
    return null;
  }

  const suggested = deriveProjectNameFromGitUrl(gitUrl);
  const overrideName = await vscode.window.showInputBox({
    title: 'Project Name',
    prompt: 'Name for imported project',
    value: suggested,
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!normalizeProjectName(value)) {
        return 'Project name cannot be empty.';
      }
      return undefined;
    },
  });

  if (!overrideName) {
    return null;
  }

  const destinationPath = workspacePath
    ? await resolveDestinationProjectPath(workspacePath, overrideName)
    : null;
  if (workspacePath && !destinationPath) {
    return null;
  }

  const projectName = destinationPath
    ? path.basename(destinationPath)
    : normalizeProjectName(overrideName);
  const canonicalResult = await runCanonicalNpmImport({
    workspacePath,
    source: gitUrl.trim(),
    projectName,
    git: true,
    enableModules: options?.enableModules,
  });
  if (isCanonicalCliFailure(canonicalResult)) {
    throw new Error(describeCanonicalCliFailure('import', canonicalResult));
  }

  const resolvedWorkspacePath = canonicalResult.workspacePath ?? workspacePath;
  if (!resolvedWorkspacePath) {
    throw new Error('Import finished without workspacePath in npm JSON output.');
  }

  const detection = await detectProjectStack(canonicalResult.importedProject!.path!);
  return {
    workspacePath: resolvedWorkspacePath,
    project: {
      name: canonicalResult.importedProject!.name ?? projectName ?? suggested,
      path: canonicalResult.importedProject!.path!,
      detection,
    },
  };
}

async function chooseImportSource(): Promise<ImportSourceType | null> {
  const picked = await vscode.window.showQuickPick(
    [
      {
        label: '$(folder-opened) Import Local Folder',
        description: 'Import an existing project folder into current workspace',
        value: 'local-folder',
      },
      {
        label: '$(cloud-download) Clone and Import from Git URL',
        description: 'Clone a repository and import into current workspace',
        value: 'git-url',
      },
      {
        label: '$(repo-pull) Drag and Drop Folder (Helper)',
        description: 'Drop a folder directly onto the Projects sidebar',
        detail: 'Tip: drag a local folder from your OS file explorer and drop it on Projects.',
        value: 'drag-drop-helper',
      },
    ],
    {
      title: 'Import Project',
      placeHolder: 'Choose project import source',
      ignoreFocusOut: true,
    }
  );

  const selected = (picked?.value as ImportSourcePickerValue | undefined) ?? null;
  if (!selected) {
    return null;
  }

  if (selected === 'drag-drop-helper') {
    const followup = await vscode.window.showInformationMessage(
      'Drag a folder onto the Projects sidebar to trigger direct import. You can also continue with a picker-based flow now.',
      'Continue with Local Folder',
      'Continue with Git URL'
    );

    if (followup === 'Continue with Local Folder') {
      return 'local-folder';
    }

    if (followup === 'Continue with Git URL') {
      return 'git-url';
    }

    return null;
  }

  return selected;
}

async function postImportActions(
  workspace: ResolvedWorkspace,
  importedProjects: ImportedProject[]
): Promise<void> {
  if (importedProjects.length === 0) {
    return;
  }

  const primaryProjectPath = importedProjects.length === 1 ? importedProjects[0].path : undefined;
  const contractRuntime = await evaluateWorkspaiContractRuntime({
    workspacePath: workspace.path,
    projectPath: primaryProjectPath,
  });
  const c06StatusSummary = summarizeC06Status(contractRuntime);

  if (importedProjects.length > 1) {
    const action = await vscode.window.showInformationMessage(
      `Import done. ${importedProjects.length} projects imported. Analysis ready. ${c06StatusSummary}.`,
      OPEN_STUDIO_ACTION,
      VIEW_ARCHITECTURE_ACTION,
      HEALTH_CHECK_ACTION
    );

    if (action === OPEN_STUDIO_ACTION) {
      await vscode.commands.executeCommand('workspai.openIncidentStudio', {
        workspace: {
          path: workspace.path,
          name: workspace.name,
        },
      });
      return;
    }

    if (action === VIEW_ARCHITECTURE_ACTION) {
      await vscode.commands.executeCommand('workspai.openArchitectureMap', {
        workspace: {
          path: workspace.path,
          name: workspace.name,
        },
      });
      return;
    }

    if (action === HEALTH_CHECK_ACTION) {
      await vscode.commands.executeCommand('workspai.checkWorkspaceHealth', {
        workspace: {
          path: workspace.path,
          name: workspace.name,
        },
      });
    }

    return;
  }

  const project = importedProjects[0];
  const projectType = project.detection.stack === 'unknown' ? undefined : project.detection.stack;
  const projectContext: ProjectLike = {
    path: project.path,
    name: project.name,
    type: projectType,
    workspacePath: workspace.path,
  };

  const stackDetected = `${stackLabel(project.detection.stack)} (${project.detection.confidence})`;
  const action = await vscode.window.showInformationMessage(
    `Import done. Stack detected: ${stackDetected}. Analysis ready. ${c06StatusSummary}.`,
    OPEN_STUDIO_ACTION,
    VIEW_ARCHITECTURE_ACTION,
    HEALTH_CHECK_ACTION
  );

  if (action === OPEN_STUDIO_ACTION) {
    await vscode.commands.executeCommand('workspai.openIncidentStudio', {
      workspace: {
        path: workspace.path,
        name: workspace.name,
      },
      project: projectContext,
    });
    return;
  }

  if (action === VIEW_ARCHITECTURE_ACTION) {
    await vscode.commands.executeCommand('workspai.openArchitectureMap', {
      workspace: {
        path: workspace.path,
        name: workspace.name,
      },
      project: projectContext,
    });
    return;
  }

  if (action === HEALTH_CHECK_ACTION) {
    await vscode.commands.executeCommand('workspai.checkWorkspaceHealth', {
      workspace: {
        path: workspace.path,
        name: workspace.name,
      },
    });
  }
}

async function persistImportedProjectsRegistry(
  workspacePath: string,
  source: ImportSourceType,
  importedProjects: ImportedProject[]
): Promise<void> {
  if (importedProjects.length === 0) {
    return;
  }

  const importedAt = new Date().toISOString();
  await upsertImportedProjectsRegistry(
    workspacePath,
    importedProjects.map((project) => ({
      name: project.name,
      path: project.path,
      stack: project.detection.stack,
      confidence: project.detection.confidence,
      source,
      importedAt,
    }))
  );
}

export async function importProjectCommand(
  options: ImportProjectCommandOptions,
  seed?: unknown
): Promise<void> {
  const logger = Logger.getInstance();
  const invocationSeed = toInvocationSeed(seed);
  const hasDroppedFolders =
    invocationSeed?.source === 'drag-drop' &&
    Array.isArray(invocationSeed.droppedPaths) &&
    invocationSeed.droppedPaths.length > 0;

  const importSource: ImportSourceType | null = hasDroppedFolders
    ? 'drag-drop'
    : (invocationSeed?.source ?? (await chooseImportSource()));
  if (!importSource) {
    await trackImportLifecycleEvent({
      result: 'cancelled',
      reason: 'source-selection-dismissed',
    });
    return;
  }

  let resolvedWorkspace: ResolvedWorkspace | null = null;
  if (invocationSeed?.path && (await fs.pathExists(invocationSeed.path))) {
    resolvedWorkspace = {
      path: invocationSeed.path,
      name: invocationSeed.name ?? path.basename(invocationSeed.path),
      mode: 'selected',
    };
  } else if (invocationSeed?.useDefaultWorkspace) {
    resolvedWorkspace = {
      path: '',
      name: 'workspai',
      mode: 'auto',
    };
  } else {
    resolvedWorkspace = await resolveWorkspaceDestination(options);
  }
  if (!resolvedWorkspace) {
    await trackImportLifecycleEvent({
      source: importSource,
      result: 'cancelled',
      reason: 'workspace-resolution-dismissed',
    });
    await showImportWorkspaceResolutionHelp({
      title: 'Project import needs a destination workspace.',
      detail:
        'No workspace was selected for this import. Workspai can continue after you pick, create, or use the default workspace.',
    });
    return;
  }

  const enableModules = await resolveEnableModulesPreference(
    'Import project module support',
    invocationSeed?.enableModules
  );
  if (enableModules === undefined) {
    await trackImportLifecycleEvent({
      workspacePath: resolvedWorkspace.path,
      source: importSource,
      workspaceResolutionMode: resolvedWorkspace.mode,
      result: 'cancelled',
      reason: 'module-support-selection-dismissed',
    });
    return;
  }

  const importOptions = { enableModules };

  try {
    if (
      !(await gateImportCli('Import Project', {
        cwd: resolvedWorkspace.path || undefined,
      }))
    ) {
      await trackImportLifecycleEvent({
        workspacePath: resolvedWorkspace.path || undefined,
        source: importSource,
        workspaceResolutionMode: resolvedWorkspace.mode,
        result: 'cancelled',
        reason: 'import-cli-capability-missing',
      });
      return;
    }

    const workspaceExplorer = options.getWorkspaceExplorer();
    workspaceExplorer?.refresh();
    const npmWorkspacePath = resolvedWorkspace.path || undefined;
    if (npmWorkspacePath) {
      await vscode.commands.executeCommand('workspai.selectWorkspace', npmWorkspacePath);
    }

    let importedProjects: ImportedProject[] = [];
    let effectiveWorkspacePath = resolvedWorkspace.path;
    if (importSource === 'local-folder') {
      const imported = await importFromLocalFolder(npmWorkspacePath, importOptions);
      if (imported) {
        importedProjects = [imported.project];
        effectiveWorkspacePath = imported.workspacePath;
      }
    } else if (importSource === 'git-url') {
      const imported = await importFromGitUrl(npmWorkspacePath, importOptions);
      if (imported) {
        importedProjects = [imported.project];
        effectiveWorkspacePath = imported.workspacePath;
      }
    } else {
      importedProjects =
        (await importFromDroppedPaths(
          npmWorkspacePath ?? effectiveWorkspacePath,
          invocationSeed?.droppedPaths ?? [],
          importOptions
        )) ?? [];
    }

    if (importedProjects.length === 0) {
      await trackImportLifecycleEvent({
        workspacePath: effectiveWorkspacePath || undefined,
        source: importSource,
        workspaceResolutionMode: resolvedWorkspace.mode,
        result: 'cancelled',
        reason: 'import-aborted-or-empty',
      });
      return;
    }

    if (effectiveWorkspacePath) {
      resolvedWorkspace.path = effectiveWorkspacePath;
      resolvedWorkspace.name = path.basename(effectiveWorkspacePath);
      await refreshExtensionAfterNpmProjectOnboard({
        workspacePath: effectiveWorkspacePath,
        projectPath: importedProjects[0].path,
        projectName: importedProjects[0].name,
        projectType: importedProjects[0].detection.stack,
      });
    }

    await persistImportedProjectsRegistry(resolvedWorkspace.path, importSource, importedProjects);

    options.getProjectExplorer()?.refresh();
    await vscode.commands.executeCommand('workspai.refreshProjects');

    await trackImportLifecycleEvent({
      workspacePath: resolvedWorkspace.path,
      source: importSource,
      workspaceResolutionMode: resolvedWorkspace.mode,
      result: 'success',
      importedProjectCount: importedProjects.length,
      stack: importedProjects[0].detection.stack,
      confidence: importedProjects[0].detection.confidence,
    });

    logger.info('Project imported successfully', {
      workspace: resolvedWorkspace.path,
      importedProjectCount: importedProjects.length,
      projectPath: importedProjects[0].path,
      source: importSource,
      stack: importedProjects[0].detection.stack,
      confidence: importedProjects[0].detection.confidence,
    });

    await postImportActions(resolvedWorkspace, importedProjects);
  } catch (error) {
    await trackImportLifecycleEvent({
      workspacePath: resolvedWorkspace.path,
      source: importSource,
      workspaceResolutionMode: resolvedWorkspace.mode,
      result: 'failed',
      reason: 'unexpected-error',
    });
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Project import failed', error);
    await showImportWorkspaceResolutionHelp({
      title: 'Project import failed.',
      detail: message,
    });
  }
}

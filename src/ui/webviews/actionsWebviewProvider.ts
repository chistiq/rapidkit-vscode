/**
 * Actions Webview Provider
 * Sidebar action surface aligned with Workspai dashboard tile vocabulary.
 */

import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import {
  resolveSidebarActionSurface,
  type SidebarActionSurfaceMeta,
} from '../../contracts/sidebarActionSurface';
import {
  createExtensionWebviewMessage,
  normalizeWebviewMessage,
} from '../../contracts/webviewProtocol';
import { buildReactWebviewHtml } from './buildReactWebviewHtml';
import { WorkspaceUsageTracker } from '../../utils/workspaceUsageTracker';
import { askConfiguredAIProvider } from '../../core/aiProviderService';
import {
  listAvailableModels,
  parseCreationIntent,
  prepareAIConversation,
  resolveCreationProfile,
  streamAIResponse,
  type AIConversationHistoryEntry,
  type AIModalContext,
  type AICreationPlan,
  UnsupportedCreationStackError,
} from '../../core/aiService';
import { resolveNewWorkspacePath } from '../../core/workspacePaths';
import { ensureManagedDefaultWorkspace } from '../../core/ensureManagedDefaultWorkspace';
import { createProjectCommand } from '../../commands/createProject';
import { WorkspaiCLI } from '../../core/rapidkitCLI';
import { WorkspaceManager } from '../../core/workspaceManager';
import { readWorkspaiSettings, setWorkspaiPreferredModel } from '../../core/workspaiSettingsBridge';
import { resolvePreferredAIModalContext } from '../../core/aiContextResolver';
import { resolveRapidkitExecutionPlan } from '../../core/incidentInlineCommandRunner';
import { buildCoreRapidkitShellCommand, runCommandsInTerminal } from '../../utils/terminalExecutor';
import { createWorkspaceCommand } from '../../commands/createWorkspace';
import type { ScaffoldFramework } from '../../core/scaffoldKits';

async function readWorkspaceProfileFromManifest(
  workspacePath: string | undefined
): Promise<string | undefined> {
  if (!workspacePath) {
    return undefined;
  }
  const manifestPath = path.join(workspacePath, '.rapidkit', 'workspace.json');
  try {
    if (!(await fs.pathExists(manifestPath))) {
      return undefined;
    }
    const manifest = (await fs.readJSON(manifestPath)) as Record<string, unknown>;
    const profile =
      (typeof manifest.profile === 'string' && manifest.profile.trim()) ||
      (typeof manifest.workspace_profile === 'string' && manifest.workspace_profile.trim()) ||
      (typeof manifest.profile_requested === 'string' && manifest.profile_requested.trim());
    return profile || undefined;
  } catch {
    return undefined;
  }
}

async function syncWorkspaceAfterInlineCreate(workspacePath: string): Promise<void> {
  const manager = WorkspaceManager.getInstance();
  const workspace = await manager.addWorkspace(workspacePath);
  if (workspace) {
    await manager.updateWorkspace(workspace.path);
  }
  await vscode.commands.executeCommand('workspai.refreshWorkspaces');
  await vscode.commands.executeCommand('workspai.selectWorkspace', workspacePath);
  await vscode.commands.executeCommand('workspai.refreshProjects');
}

function cleanKnownString(value: unknown): string | undefined {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed && trimmed !== 'unknown' ? trimmed : undefined;
}

async function readProjectFrameworkFromMarker(
  projectPath: string | undefined
): Promise<string | undefined> {
  if (!projectPath) {
    return undefined;
  }
  try {
    const markerPath = path.join(projectPath, '.rapidkit', 'project.json');
    if (!(await fs.pathExists(markerPath))) {
      return undefined;
    }
    const marker = (await fs.readJSON(markerPath)) as Record<string, unknown>;
    return (
      cleanKnownString(marker.framework) ??
      cleanKnownString(marker.kit_name) ??
      cleanKnownString(marker.kit) ??
      cleanKnownString(marker.runtime)
    );
  } catch {
    return undefined;
  }
}

async function enrichAIModalContextWithProjectMarker(
  context: AIModalContext
): Promise<AIModalContext> {
  const projectPath =
    context.projectRootPath ?? (context.type === 'project' ? context.path : undefined);
  if (!projectPath) {
    return context;
  }
  const markerFramework = await readProjectFrameworkFromMarker(projectPath);
  if (!markerFramework) {
    return context;
  }
  return {
    ...context,
    framework: cleanKnownString(context.framework) ?? markerFramework,
  };
}

function resolveImpactScopeContext(payloadScope: unknown): AIModalContext | null {
  if (!payloadScope || typeof payloadScope !== 'object' || Array.isArray(payloadScope)) {
    return null;
  }
  const scope = payloadScope as Record<string, unknown>;
  const workspace =
    scope.workspace && typeof scope.workspace === 'object' && !Array.isArray(scope.workspace)
      ? (scope.workspace as Record<string, unknown>)
      : null;
  const project =
    scope.project && typeof scope.project === 'object' && !Array.isArray(scope.project)
      ? (scope.project as Record<string, unknown>)
      : null;
  const workspacePath =
    typeof workspace?.path === 'string' && workspace.path.trim().length > 0
      ? workspace.path.trim()
      : undefined;
  const projectPath =
    typeof project?.path === 'string' && project.path.trim().length > 0
      ? project.path.trim()
      : undefined;
  if (projectPath) {
    return {
      type: 'project',
      name:
        typeof project?.name === 'string' && project.name.trim().length > 0
          ? project.name.trim()
          : path.basename(projectPath),
      path: projectPath,
      framework:
        typeof project?.type === 'string' && project.type.trim().length > 0
          ? project.type.trim()
          : undefined,
      projectRootPath: projectPath,
      workspaceRootPath: workspacePath,
    };
  }
  if (workspacePath) {
    return {
      type: 'workspace',
      name:
        typeof workspace?.name === 'string' && workspace.name.trim().length > 0
          ? workspace.name.trim()
          : path.basename(workspacePath),
      path: workspacePath,
      workspaceRootPath: workspacePath,
    };
  }
  return null;
}

function isChildPathOfWorkspace(workspacePath: string | undefined, childPath?: string): boolean {
  if (!workspacePath || !childPath) {
    return false;
  }
  const relative = path.relative(path.resolve(workspacePath), path.resolve(childPath));
  return (
    relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function resolveStudioActionScope(payloadScope: unknown): {
  workspacePath?: string;
  projectPath?: string;
  projectBelongsToWorkspace: boolean;
} {
  const scope =
    payloadScope && typeof payloadScope === 'object' && !Array.isArray(payloadScope)
      ? (payloadScope as Record<string, unknown>)
      : {};
  const workspace =
    scope.workspace && typeof scope.workspace === 'object' && !Array.isArray(scope.workspace)
      ? (scope.workspace as Record<string, unknown>)
      : null;
  const project =
    scope.project && typeof scope.project === 'object' && !Array.isArray(scope.project)
      ? (scope.project as Record<string, unknown>)
      : null;
  const workspacePath =
    typeof workspace?.path === 'string' && workspace.path.trim().length > 0
      ? workspace.path.trim()
      : undefined;
  const projectPath =
    typeof project?.path === 'string' && project.path.trim().length > 0
      ? project.path.trim()
      : undefined;
  return {
    workspacePath,
    projectPath,
    projectBelongsToWorkspace: isChildPathOfWorkspace(workspacePath, projectPath),
  };
}

function resolveExplicitWorkspaceScope(payloadScope: unknown): { workspacePath?: string } {
  const scope =
    payloadScope && typeof payloadScope === 'object' && !Array.isArray(payloadScope)
      ? (payloadScope as Record<string, unknown>)
      : {};
  const workspace =
    scope.workspace && typeof scope.workspace === 'object' && !Array.isArray(scope.workspace)
      ? (scope.workspace as Record<string, unknown>)
      : null;
  const workspacePath =
    typeof workspace?.path === 'string' && workspace.path.trim().length > 0
      ? workspace.path.trim()
      : undefined;
  return { workspacePath };
}

export type WorkspaiSecondaryTab = 'create' | 'impact' | 'studio';
export type WorkspaiSecondaryTabPayload = {
  workspace?: { name?: string; path?: string; workspaceRootPath?: string } | null;
  project?: { name?: string; path?: string; type?: string; workspacePath?: string } | null;
  initialQuestion?: string;
  initialTask?: string;
  composerHandoff?: 'prefill' | 'submit';
  studioMode?: 'investigate' | 'verify' | 'prepare';
  createMode?: 'workspace' | 'project';
  useDefaultWorkspace?: boolean;
  source?: string;
  trigger?: string;
};

export class ActionsWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'rapidkitActionsWebview';
  public static readonly secondaryViewType = 'workspaiSecondarySidebar';
  private _view?: vscode.WebviewView;
  private _pendingSecondaryTab?: WorkspaiSecondaryTab;
  private _pendingSecondaryTabPayload?: WorkspaiSecondaryTabPayload;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _variant: 'activitybar' | 'secondary-sidebar' = 'activitybar',
    private readonly _context?: vscode.ExtensionContext
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlContent(webviewView.webview);
    void this._sendInlineModels();
    void this._sendInlineScope();
    if (this._pendingSecondaryTab) {
      this._postSecondaryTabActivation(this._pendingSecondaryTab, this._pendingSecondaryTabPayload);
    }

    webviewView.webview.onDidReceiveMessage((rawMessage) => {
      const message = normalizeWebviewMessage(rawMessage);
      if (!message) {
        return;
      }

      if (message.command === 'sidebarAiCreatePlan') {
        void this._runInlineAICreatePlan(message.data);
        return;
      }

      if (message.command === 'sidebarAiCreateConfirm') {
        void this._runInlineAICreateConfirm(message.data);
        return;
      }

      if (message.command === 'sidebarManualCreate') {
        void this._runSidebarManualCreate(message.data);
        return;
      }

      if (message.command === 'sidebarImpactQuery') {
        void this._runInlineImpactQuery(message.data);
        return;
      }

      if (message.command === 'sidebarAdvisorAction') {
        void this._runSidebarAdvisorAction(message.data);
        return;
      }

      if (message.command === 'sidebarStudioQuery') {
        void this._runInlineStudioQuery(message.data);
        return;
      }

      if (message.command === 'sidebarStudioAction') {
        void this._runSidebarStudioAction(message.data);
        return;
      }

      if (message.command === 'sidebarFocusView') {
        void this._focusPrimarySidebarView(message.data);
        return;
      }

      if (message.command === 'sidebarRefreshScope') {
        void this._sendInlineScope();
        return;
      }

      if (message.command === 'sidebarRefreshModels') {
        void this._sendInlineModels();
        return;
      }

      if (message.command === 'setPreferredModel') {
        const modelId = typeof message.data?.modelId === 'string' ? message.data.modelId : 'auto';
        void setWorkspaiPreferredModel(modelId).then(() => this._sendInlineModels());
        return;
      }

      const action = resolveSidebarActionSurface(message.command);
      if (!action) {
        console.warn(`[Workspai] Unknown sidebar action ignored: ${message.command}`);
        return;
      }

      void this._runSidebarAction(action, message.data);
    });
  }

  public refresh() {
    if (this._view) {
      this._view.webview.html = this._getHtmlContent(this._view.webview);
      void this._sendInlineModels();
      void this._sendInlineScope();
    }
  }

  public refreshScope(): void {
    void this._sendInlineScope();
  }

  public async revealSecondaryTab(
    tab: WorkspaiSecondaryTab,
    payload?: WorkspaiSecondaryTabPayload
  ): Promise<void> {
    this._pendingSecondaryTab = tab;
    this._pendingSecondaryTabPayload = payload;
    try {
      await vscode.commands.executeCommand(`${ActionsWebviewProvider.secondaryViewType}.focus`);
    } catch (error) {
      console.warn('[Workspai] Failed to focus Workspai secondary sidebar', error);
    }
    this._postSecondaryTabActivation(tab, payload);
  }

  private _postSecondaryTabActivation(
    tab: WorkspaiSecondaryTab,
    payload?: WorkspaiSecondaryTabPayload
  ): void {
    if (!this._view) {
      return;
    }
    this._pendingSecondaryTab = undefined;
    this._pendingSecondaryTabPayload = undefined;
    this._postInlineCreate('sidebarActivateTab', { tab, ...(payload ?? {}) });
  }

  private _postInlineCreate(command: string, data?: Record<string, unknown>): void {
    void this._view?.webview.postMessage(
      createExtensionWebviewMessage(command, data, {
        source: 'workspai-secondary-sidebar',
        version: '1',
      })
    );
  }

  private _postCreateTimelineStep(title: string, detail?: string): void {
    this._postInlineCreate('sidebarAiCreateProgress', {
      title,
      detail: detail ?? '',
    });
  }

  private async _sendInlineModels(): Promise<void> {
    try {
      const settings = readWorkspaiSettings();
      const models =
        settings.aiProvider === 'openai-compatible'
          ? [
              {
                id: settings.customAIModel || 'openai-compatible',
                name: settings.customAIModel || 'OpenAI-compatible',
                vendor: 'openai-compatible',
              },
            ]
          : await listAvailableModels();
      this._postInlineCreate('sidebarAiModelsList', {
        models,
        preferredModel: settings.preferredModel,
      });
    } catch {
      this._postInlineCreate('sidebarAiModelsList', {
        models: [],
        preferredModel: 'auto',
      });
    }
  }

  private async _sendInlineScope(): Promise<void> {
    const readCommand = async <T>(command: string): Promise<T | null> => {
      try {
        return ((await vscode.commands.executeCommand(command)) as T | undefined) ?? null;
      } catch {
        return null;
      }
    };
    const workspace = await readCommand<{
      name?: string;
      path?: string;
      profile?: string;
      workspace_profile?: string;
      mode?: string;
    }>('workspai.getSelectedWorkspace');
    const project = await readCommand<{ name?: string; path?: string; type?: string }>(
      'workspai.getSelectedProject'
    );
    const workspaceProfile =
      (typeof workspace?.profile === 'string' && workspace.profile.trim()) ||
      (typeof workspace?.workspace_profile === 'string' && workspace.workspace_profile.trim()) ||
      (await readWorkspaceProfileFromManifest(workspace?.path));
    this._postInlineCreate('sidebarAiScope', {
      workspace: workspace
        ? {
            name: workspace.name,
            path: workspace.path,
            profile: workspaceProfile,
          }
        : null,
      project: project
        ? {
            name: project.name,
            path: project.path,
            type: project.type,
          }
        : null,
    });
  }

  private async _runInlineAICreatePlan(payload: unknown): Promise<void> {
    const payloadRecord =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const prompt =
      payload && typeof payload === 'object' && 'prompt' in payload
        ? String((payload as { prompt?: unknown }).prompt ?? '').trim()
        : '';
    const requestedModelId =
      typeof payloadRecord.modelId === 'string' && payloadRecord.modelId.trim().length > 0
        ? payloadRecord.modelId.trim()
        : undefined;
    const stackFocus =
      typeof payloadRecord.stackFocus === 'string' && payloadRecord.stackFocus.trim().length > 0
        ? payloadRecord.stackFocus.trim()
        : undefined;
    if (!prompt) {
      return;
    }
    if (!this._context) {
      this._postInlineCreate('sidebarAiCreateError', {
        error: 'AI creation is not available until the extension context is ready.',
      });
      return;
    }

    this._postInlineCreate('sidebarAiCreateThinking', {
      label: 'Connecting to AI planner…',
    });
    try {
      const scope = resolveExplicitWorkspaceScope(payloadRecord.scope);
      const workspacePath = scope.workspacePath;
      const creationPrompt =
        stackFocus && stackFocus !== 'Any stack'
          ? `${prompt}\n\nStack focus: ${stackFocus}`
          : prompt;
      const { plan, modelId, planSource } = await parseCreationIntent(
        creationPrompt,
        'workspace',
        undefined,
        workspacePath,
        undefined,
        async (messages, token) => {
          if (requestedModelId && readWorkspaiSettings().aiProvider !== 'openai-compatible') {
            let text = '';
            const response = await streamAIResponse(
              messages,
              (chunk) => {
                text += chunk.text;
              },
              token,
              requestedModelId
            );
            return {
              text,
              modelId: response.modelId,
            };
          }
          const response = await askConfiguredAIProvider(this._context!, messages, token);
          return {
            text: response.text,
            modelId: response.provider,
          };
        }
      );
      if (planSource === 'heuristic') {
        this._postCreateTimelineStep(
          'Using local stack planner',
          'AI is unavailable — inferring framework, kit, and modules from your description.'
        );
      } else {
        this._postCreateTimelineStep(
          'Drafted creation plan',
          modelId ? `Model: ${modelId}` : 'Stack, framework, and modules mapped.'
        );
      }
      this._postInlineCreate('sidebarAiCreatePlan', { plan, modelId, planSource });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._postInlineCreate('sidebarAiCreateError', {
        error: message,
        unsupportedStack:
          error instanceof UnsupportedCreationStackError ? error.stackLabel : undefined,
        createCapability:
          error instanceof UnsupportedCreationStackError ? error.capability : undefined,
      });
    }
  }

  private async _runInlineAICreateConfirm(payload: unknown): Promise<void> {
    const plan =
      payload && typeof payload === 'object' && 'plan' in payload
        ? ((payload as { plan?: unknown }).plan as AICreationPlan | undefined)
        : undefined;
    if (!plan) {
      this._postInlineCreate('sidebarAiCreateError', { error: 'No AI creation plan to execute.' });
      return;
    }

    try {
      this._postInlineCreate('sidebarAiCreateProgress', {
        title: 'Creating workspace shell',
        detail: `Workspace: ${plan.workspaceName}`,
      });

      const profile = resolveCreationProfile(plan.profile, plan.framework);
      await vscode.commands.executeCommand('workspai.createWorkspace', {
        name: plan.workspaceName,
        profile,
        installMethod: plan.installMethod ?? 'auto',
        initGit: true,
        policyMode: 'warn',
        dependencySharing: 'isolated',
        suppressPostCreatePrompt: true,
        silent: true,
      });

      const workspacePath = resolveNewWorkspacePath(plan.workspaceName);
      const workspaceCreated = await fs.pathExists(workspacePath);
      if (!workspaceCreated) {
        throw new Error(`Workspace was not found after creation: ${workspacePath}`);
      }

      this._postInlineCreate('sidebarAiCreateProgress', {
        title: 'Creating project structure',
        detail: `${plan.projectName} · ${plan.framework} · ${plan.kit}`,
      });
      await createProjectCommand(workspacePath, plan.framework, plan.projectName, plan.kit, {
        suppressPostCreatePrompt: true,
        silent: true,
      });
      const createdProjects = [
        {
          name: plan.projectName,
          framework: plan.framework,
          kit: plan.kit,
          path: path.join(workspacePath, plan.projectName),
        },
      ];

      if (plan.secondaryProject) {
        this._postInlineCreate('sidebarAiCreateProgress', {
          title: 'Creating companion project',
          detail: `${plan.secondaryProject.projectName} · ${plan.secondaryProject.framework}`,
        });
        await createProjectCommand(
          workspacePath,
          plan.secondaryProject.framework,
          plan.secondaryProject.projectName,
          plan.secondaryProject.kit,
          { suppressPostCreatePrompt: true, silent: true }
        );
        createdProjects.push({
          name: plan.secondaryProject.projectName,
          framework: plan.secondaryProject.framework,
          kit: plan.secondaryProject.kit,
          path: path.join(workspacePath, plan.secondaryProject.projectName),
        });
      }

      this._postInlineCreate('sidebarAiCreateProgress', {
        title: 'Preparing workspace intelligence',
        detail:
          plan.suggestedModules.length > 0
            ? `Module suggestions captured: ${plan.suggestedModules.join(', ')}`
            : 'Workspace model and project evidence are ready.',
      });
      await syncWorkspaceAfterInlineCreate(workspacePath);
      this._postInlineCreate('sidebarAiCreateDone', {
        plan,
        workspacePath,
        projects: createdProjects,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._postInlineCreate('sidebarAiCreateError', { error: message });
    }
  }

  private async _runSidebarManualCreate(payload: unknown): Promise<void> {
    const payloadRecord =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const mode = payloadRecord.mode === 'project' ? 'project' : 'workspace';
    const name = typeof payloadRecord.name === 'string' ? payloadRecord.name.trim() : '';
    if (!name) {
      this._postInlineCreate('sidebarManualCreateResult', {
        status: 'failed',
        error: mode === 'project' ? 'Project name is required.' : 'Workspace name is required.',
      });
      return;
    }

    const profile =
      payloadRecord.profile === 'enterprise' ||
      payloadRecord.profile === 'polyglot' ||
      payloadRecord.profile === 'python-only' ||
      payloadRecord.profile === 'node-only' ||
      payloadRecord.profile === 'go-only' ||
      payloadRecord.profile === 'java-only' ||
      payloadRecord.profile === 'dotnet-only'
        ? payloadRecord.profile
        : 'minimal';
    const frameworkMap: Record<string, ScaffoldFramework> = {
      fastapi: 'fastapi',
      'fastapi-standard': 'fastapi',
      'fastapi-ddd': 'fastapi',
      nestjs: 'nestjs',
      'nestjs-standard': 'nestjs',
      go: 'go',
      gofiber: 'go',
      'gofiber-standard': 'go',
      gogin: 'go',
      'gogin-standard': 'go',
      nextjs: 'nextjs',
      remix: 'remix',
      'react-router': 'remix',
      'vite-react': 'vite-react',
      react: 'vite-react',
      'vite-vue': 'vite-vue',
      'vite-svelte': 'vite-svelte',
      'vite-solid': 'vite-solid',
      'vite-vanilla': 'vite-vanilla',
      nuxt: 'nuxt',
      angular: 'angular',
      astro: 'astro',
      sveltekit: 'sveltekit',
      springboot: 'springboot',
      'springboot-standard': 'springboot',
      dotnet: 'dotnet',
      'dotnet-webapi-clean': 'dotnet',
    };
    const defaultKitMap: Record<string, string> = {
      fastapi: 'fastapi.standard',
      'fastapi-standard': 'fastapi.standard',
      'fastapi-ddd': 'fastapi.ddd',
      nestjs: 'nestjs.standard',
      'nestjs-standard': 'nestjs.standard',
      go: 'gofiber.standard',
      gofiber: 'gofiber.standard',
      'gofiber-standard': 'gofiber.standard',
      gogin: 'gogin.standard',
      'gogin-standard': 'gogin.standard',
      springboot: 'springboot.standard',
      'springboot-standard': 'springboot.standard',
      dotnet: 'dotnet.webapi.clean',
      'dotnet-webapi-clean': 'dotnet.webapi.clean',
      nextjs: 'frontend.nextjs',
      remix: 'frontend.remix',
      'react-router': 'frontend.remix',
      'vite-react': 'frontend.vite-react',
      'vite-vue': 'frontend.vite-vue',
      'vite-svelte': 'frontend.vite-svelte',
      'vite-solid': 'frontend.vite-solid',
      'vite-vanilla': 'frontend.vite-vanilla',
      nuxt: 'frontend.nuxt',
      angular: 'frontend.angular',
      astro: 'frontend.astro',
      sveltekit: 'frontend.sveltekit',
    };
    const frameworkKey =
      typeof payloadRecord.framework === 'string' ? payloadRecord.framework.trim() : 'fastapi';
    const framework = frameworkMap[frameworkKey] ?? 'fastapi';
    const requestedKit = typeof payloadRecord.kit === 'string' ? payloadRecord.kit.trim() : '';
    const kitName = requestedKit || defaultKitMap[framework] || defaultKitMap.fastapi;

    try {
      if (mode === 'project') {
        this._postInlineCreate('sidebarAiCreateThinking', {
          label: 'Preparing project scaffold…',
        });
        this._postCreateTimelineStep(
          'Validated project plan',
          `${name} · ${frameworkKey} · ${kitName}`
        );

        const scope = resolveExplicitWorkspaceScope(payloadRecord.scope);
        const cli = new WorkspaiCLI();
        let workspacePath = scope.workspacePath;

        if (!workspacePath) {
          const ensured = await ensureManagedDefaultWorkspace();
          workspacePath = ensured.path;
          this._postCreateTimelineStep('Using default workspace');
        } else {
          this._postCreateTimelineStep(
            'Creating project in workspace',
            path.basename(workspacePath)
          );
        }

        this._postCreateTimelineStep(
          'Running RapidKit scaffold',
          `Generating files and installing dependencies for ${kitName}…`
        );

        const result = await cli.createProjectInWorkspace({
          name,
          kit: kitName,
          workspacePath,
          skipInstall: false,
        });
        const exitCode = (result as { exitCode?: number }).exitCode ?? 1;
        if (exitCode !== 0) {
          const stderr = (result as { stderr?: string }).stderr ?? '';
          const stdout = (result as { stdout?: string }).stdout ?? '';
          throw new Error(stderr || stdout || 'RapidKit project creation failed.');
        }
        const summary = `${name} · ${kitName}`;

        this._postCreateTimelineStep(
          'Syncing workspace intelligence',
          'Refreshing workspace model and evidence…'
        );
        await syncWorkspaceAfterInlineCreate(workspacePath);

        this._postCreateTimelineStep('Refreshing project explorer', 'Updating project list…');
        await vscode.commands.executeCommand('workspai.refreshProjects');

        this._postInlineCreate('sidebarManualCreateResult', {
          status: 'done',
          mode,
          name,
          kit: kitName,
          summary,
        });
        return;
      }

      this._postInlineCreate('sidebarAiCreateThinking', {
        label: 'Preparing workspace shell…',
      });
      this._postCreateTimelineStep('Validated workspace plan', `${name} · ${profile} profile`);
      this._postCreateTimelineStep(
        'Creating workspace shell',
        'Generating workspace files and governance defaults…'
      );

      await createWorkspaceCommand({
        name,
        profile,
        installMethod:
          payloadRecord.installMethod === 'poetry' ||
          payloadRecord.installMethod === 'venv' ||
          payloadRecord.installMethod === 'pipx'
            ? payloadRecord.installMethod
            : 'auto',
        initGit: payloadRecord.initGit !== false,
        policyMode: payloadRecord.policyMode === 'strict' ? 'strict' : 'warn',
        dependencySharing: payloadRecord.dependencySharing === 'shared' ? 'shared' : 'isolated',
        suppressPostCreatePrompt: true,
        silent: true,
      });

      this._postCreateTimelineStep(
        'Finalizing workspace',
        'Workspace shell is ready for projects and evidence.'
      );
      this._postInlineCreate('sidebarManualCreateResult', {
        status: 'done',
        mode,
        name,
        summary: name,
      });
    } catch (error) {
      this._postInlineCreate('sidebarManualCreateResult', {
        status: 'failed',
        mode,
        name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async _focusPrimarySidebarView(payload: unknown): Promise<void> {
    const payloadRecord =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const target = payloadRecord.target === 'projects' ? 'projects' : 'workspaces';
    try {
      if (target === 'projects') {
        await vscode.commands.executeCommand('workspai.refreshProjects');
        await vscode.commands.executeCommand('rapidkitProjects.focus');
        return;
      }
      await vscode.commands.executeCommand('workspai.refreshWorkspaces');
      await vscode.commands.executeCommand('rapidkitWorkspaces.focus');
    } catch (error) {
      console.warn('[Workspai] Failed to focus primary sidebar view', error);
    }
  }

  private async _runInlineImpactQuery(payload: unknown): Promise<void> {
    const payloadRecord =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const question =
      typeof payloadRecord.question === 'string' ? payloadRecord.question.trim() : '';
    const requestedModelId =
      typeof payloadRecord.modelId === 'string' && payloadRecord.modelId.trim().length > 0
        ? payloadRecord.modelId.trim()
        : undefined;
    const sessionId =
      typeof payloadRecord.sessionId === 'string' && payloadRecord.sessionId.trim().length > 0
        ? payloadRecord.sessionId.trim()
        : undefined;
    const rawHistory = Array.isArray(payloadRecord.history) ? payloadRecord.history : [];
    const history: AIConversationHistoryEntry[] = rawHistory
      .filter((entry): entry is AIConversationHistoryEntry => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return false;
        }
        const record = entry as Record<string, unknown>;
        return (
          (record.role === 'user' || record.role === 'assistant') &&
          typeof record.content === 'string' &&
          record.content.trim().length > 0
        );
      })
      .slice(-8);

    if (!question) {
      return;
    }
    if (!this._context) {
      this._postInlineCreate('sidebarImpactError', {
        sessionId,
        error: 'Workspace Advisor is not available until the extension context is ready.',
      });
      return;
    }

    try {
      const aiContext = await enrichAIModalContextWithProjectMarker(
        resolveImpactScopeContext(payloadRecord.scope) ?? (await resolvePreferredAIModalContext())
      );
      this._postInlineCreate('sidebarImpactScope', {
        sessionId,
        workspace: aiContext.workspaceRootPath
          ? { name: aiContext.name, path: aiContext.workspaceRootPath }
          : null,
        project: aiContext.projectRootPath
          ? {
              name: aiContext.type === 'project' ? aiContext.name : undefined,
              path: aiContext.projectRootPath,
              type: aiContext.framework,
            }
          : null,
      });
      this._postInlineCreate('sidebarImpactThinking', {
        sessionId,
        label: 'Reading workspace intelligence and impact context...',
      });

      const advisorPrompt = [
        'Respond as Workspai Workspace Advisor inside VS Code.',
        'Keep the answer concise, operational, and evidence-aware.',
        'Use these markdown sections when relevant: Answer, Evidence, Next safe step, Commands, Assumptions.',
        'Cite only workspace/project evidence available in context; if evidence is missing, say what is missing.',
        'Do not claim that files were changed or commands were run.',
        'Put runnable shell commands in bash code fences and say where to run them.',
        'Prefer one safest next step over a long generic checklist.',
        '',
        question,
      ].join('\n');
      const prepared = await prepareAIConversation('ask', advisorPrompt, aiContext, history);
      let answer = '';
      let modelId = '';

      if (readWorkspaiSettings().aiProvider === 'openai-compatible') {
        const response = await askConfiguredAIProvider(this._context, prepared.messages);
        modelId = response.provider;
        answer = response.text;
        this._postInlineCreate('sidebarImpactChunk', { sessionId, text: response.text });
      } else {
        const streamResult = await streamAIResponse(
          prepared.messages,
          (chunk) => {
            if (chunk.text) {
              answer += chunk.text;
              this._postInlineCreate('sidebarImpactChunk', { sessionId, text: chunk.text });
            }
          },
          undefined,
          requestedModelId
        );
        modelId = streamResult.modelId;
      }

      this._postInlineCreate('sidebarImpactDone', { sessionId, modelId, answer });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._postInlineCreate('sidebarImpactError', { sessionId, error: message });
    }
  }

  private async _runSidebarAdvisorAction(payload: unknown): Promise<void> {
    const payloadRecord =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const action = typeof payloadRecord.action === 'string' ? payloadRecord.action : '';
    const sessionId =
      typeof payloadRecord.sessionId === 'string' ? payloadRecord.sessionId : undefined;
    try {
      if (action === 'studio') {
        this._postInlineCreate('sidebarAdvisorActionResult', { sessionId, action, status: 'done' });
        return;
      }
      if (action === 'verify') {
        await vscode.commands.executeCommand('workspai.workspaceVerify', {
          source: 'workspai-secondary-sidebar',
          trigger: 'workspace-advisor-verify',
          scope: payloadRecord.scope,
        });
        this._postInlineCreate('sidebarAdvisorActionResult', { sessionId, action, status: 'done' });
        return;
      }
      if (action === 'copy') {
        const question =
          typeof payloadRecord.question === 'string' ? payloadRecord.question.trim() : '';
        const answer = typeof payloadRecord.answer === 'string' ? payloadRecord.answer.trim() : '';
        const scope =
          payloadRecord.scope &&
          typeof payloadRecord.scope === 'object' &&
          !Array.isArray(payloadRecord.scope)
            ? payloadRecord.scope
            : undefined;
        const text = [
          '# Workspace Advisor Plan',
          '',
          `Scope: ${JSON.stringify(scope ?? {})}`,
          question ? `Question: ${question}` : '',
          '',
          answer,
        ]
          .filter(Boolean)
          .join('\n');
        await vscode.env.clipboard.writeText(text);
        this._postInlineCreate('sidebarAdvisorActionResult', { sessionId, action, status: 'done' });
      }
    } catch (error) {
      console.warn('[Workspai] Workspace Advisor action failed', error);
      this._postInlineCreate('sidebarAdvisorActionResult', {
        sessionId,
        action,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async _runInlineStudioQuery(payload: unknown): Promise<void> {
    const payloadRecord =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const task = typeof payloadRecord.task === 'string' ? payloadRecord.task.trim() : '';
    const requestedModelId =
      typeof payloadRecord.modelId === 'string' && payloadRecord.modelId.trim().length > 0
        ? payloadRecord.modelId.trim()
        : undefined;
    const sessionId =
      typeof payloadRecord.sessionId === 'string' && payloadRecord.sessionId.trim().length > 0
        ? payloadRecord.sessionId.trim()
        : undefined;
    const studioMode =
      payloadRecord.mode === 'verify' || payloadRecord.mode === 'prepare'
        ? payloadRecord.mode
        : 'investigate';
    const rawHistory = Array.isArray(payloadRecord.history) ? payloadRecord.history : [];
    const history: AIConversationHistoryEntry[] = rawHistory
      .filter((entry): entry is AIConversationHistoryEntry => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return false;
        }
        const record = entry as Record<string, unknown>;
        return (
          (record.role === 'user' || record.role === 'assistant') &&
          typeof record.content === 'string' &&
          record.content.trim().length > 0
        );
      })
      .slice(-8);

    if (!task) {
      return;
    }
    if (!this._context) {
      this._postInlineCreate('sidebarStudioError', {
        sessionId,
        error: 'Studio is not available until the extension context is ready.',
      });
      return;
    }

    try {
      const aiContext = await enrichAIModalContextWithProjectMarker(
        resolveImpactScopeContext(payloadRecord.scope) ?? (await resolvePreferredAIModalContext())
      );
      this._postInlineCreate('sidebarStudioScope', {
        sessionId,
        workspace: aiContext.workspaceRootPath
          ? { name: aiContext.name, path: aiContext.workspaceRootPath }
          : null,
        project: aiContext.projectRootPath
          ? {
              name: aiContext.type === 'project' ? aiContext.name : undefined,
              path: aiContext.projectRootPath,
              type: aiContext.framework,
            }
          : null,
      });
      this._postInlineCreate('sidebarStudioThinking', {
        sessionId,
        label: 'Preparing evidence-aware Studio plan...',
      });

      const modeLabel =
        studioMode === 'verify'
          ? 'Verify'
          : studioMode === 'prepare'
            ? 'Prepare safe action'
            : 'Investigate';
      const loopFocus =
        studioMode === 'verify'
          ? 'Focus on Verify, but cite the Detect and Diagnose evidence that supports the verification path.'
          : studioMode === 'prepare'
            ? 'Focus on Plan and Learn/Prepare, but include the Verify gate that must pass before action.'
            : 'Focus on Detect and Diagnose first; include a short Plan only when the evidence is clear.';
      const studioPrompt = [
        `Studio mode: ${modeLabel}.`,
        'Internal Studio loop: Detect -> Diagnose -> Plan -> Verify -> Learn.',
        loopFocus,
        'Respond as Workspai Studio inside VS Code.',
        'Be concise, evidence-aware, and action-safe.',
        'Do not claim that files were changed unless an explicit tool/command did it.',
        'Return a clear next action, verification path, and any risk to check.',
        'Use short markdown sections only when relevant, in this order: Detect, Diagnose, Plan, Verify, Learn, Evidence, Commands, Assumptions.',
        'Each section should be brief: one short paragraph or up to three bullets.',
        'If evidence is missing, say exactly what evidence is missing and which command can refresh it.',
        'Put runnable shell commands in bash code fences or inline code so Studio can expose Run/Copy actions.',
        '',
        task,
      ].join('\n');
      const prepared = await prepareAIConversation('ask', studioPrompt, aiContext, history);
      let answer = '';
      let modelId = '';

      if (readWorkspaiSettings().aiProvider === 'openai-compatible') {
        const response = await askConfiguredAIProvider(this._context, prepared.messages);
        modelId = response.provider;
        answer = response.text;
        this._postInlineCreate('sidebarStudioChunk', { sessionId, text: response.text });
      } else {
        const streamResult = await streamAIResponse(
          prepared.messages,
          (chunk) => {
            if (chunk.text) {
              answer += chunk.text;
              this._postInlineCreate('sidebarStudioChunk', { sessionId, text: chunk.text });
            }
          },
          undefined,
          requestedModelId
        );
        modelId = streamResult.modelId;
      }

      this._postInlineCreate('sidebarStudioDone', { sessionId, modelId, answer });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._postInlineCreate('sidebarStudioError', { sessionId, error: message });
    }
  }

  private async _runSidebarStudioAction(payload: unknown): Promise<void> {
    const payloadRecord =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const action = typeof payloadRecord.action === 'string' ? payloadRecord.action : '';
    const sessionId =
      typeof payloadRecord.sessionId === 'string' ? payloadRecord.sessionId : undefined;
    try {
      if (action === 'verify') {
        const scope = resolveStudioActionScope(payloadRecord.scope);
        await vscode.commands.executeCommand('workspai.workspaceVerify', {
          source: 'workspai-secondary-sidebar',
          trigger: 'studio-inline-verify',
          scope: payloadRecord.scope,
          workspacePath: scope.workspacePath,
          projectPath: scope.projectPath,
        });
        this._postInlineCreate('sidebarStudioActionResult', { sessionId, action, status: 'done' });
        return;
      }
      if (action === 'run-command') {
        const commandText =
          typeof payloadRecord.commandText === 'string' &&
          payloadRecord.commandText.trim().length > 0
            ? payloadRecord.commandText.trim()
            : '';
        if (!commandText) {
          throw new Error('No command was provided to run.');
        }
        const scope = resolveStudioActionScope(payloadRecord.scope);
        if (!scope.workspacePath) {
          throw new Error('No workspace is selected for this Studio command.');
        }
        const executionPlan = await resolveRapidkitExecutionPlan({
          command: commandText,
          workspacePath: scope.workspacePath,
          projectPath: scope.projectPath,
          projectBelongsToWorkspace: scope.projectBelongsToWorkspace,
        });
        if ('error' in executionPlan) {
          throw new Error(executionPlan.error);
        }
        runCommandsInTerminal({
          name: 'Workspai Studio',
          cwd: executionPlan.cwd,
          commands: [buildCoreRapidkitShellCommand(executionPlan.executable, executionPlan.args)],
        });
        this._postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          action,
          actionId: payloadRecord.actionId,
          status: 'done',
          commandText: executionPlan.displayCommand,
        });
        return;
      }
      if (action === 'copy-command') {
        const commandText =
          typeof payloadRecord.commandText === 'string' &&
          payloadRecord.commandText.trim().length > 0
            ? payloadRecord.commandText.trim()
            : '';
        if (!commandText) {
          throw new Error('No command was provided to copy.');
        }
        await vscode.env.clipboard.writeText(commandText);
        this._postInlineCreate('sidebarStudioActionResult', {
          sessionId,
          action,
          actionId: payloadRecord.actionId,
          status: 'done',
        });
        return;
      }
      if (action === 'copy') {
        const task = typeof payloadRecord.task === 'string' ? payloadRecord.task.trim() : '';
        const answer = typeof payloadRecord.answer === 'string' ? payloadRecord.answer.trim() : '';
        if (!task && !answer) {
          throw new Error('No Studio brief is available to copy yet.');
        }
        const scope =
          payloadRecord.scope &&
          typeof payloadRecord.scope === 'object' &&
          !Array.isArray(payloadRecord.scope)
            ? payloadRecord.scope
            : undefined;
        const text = [
          '# Workspai Studio Brief',
          '',
          `Scope: ${JSON.stringify(scope ?? {})}`,
          task ? `Task: ${task}` : '',
          '',
          answer,
        ]
          .filter(Boolean)
          .join('\n');
        await vscode.env.clipboard.writeText(text);
        this._postInlineCreate('sidebarStudioActionResult', { sessionId, action, status: 'done' });
      }
    } catch (error) {
      console.warn('[Workspai] Studio action failed', error);
      this._postInlineCreate('sidebarStudioActionResult', {
        sessionId,
        action,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async _runSidebarAction(
    action: SidebarActionSurfaceMeta,
    invocationPayload?: unknown
  ): Promise<void> {
    try {
      this._trackSidebarAction(action);

      if (action.handler === 'external-url') {
        if (!action.externalUrl) {
          return;
        }
        const opened = await vscode.env.openExternal(vscode.Uri.parse(action.externalUrl));
        if (!opened) {
          void vscode.window.showWarningMessage(
            `Workspai could not open ${action.label}. Please try again from the Command Palette.`
          );
        }
        return;
      }

      if (action.vscodeCommand) {
        const payload = {
          ...(action.payloadDefaults ?? {}),
          ...(invocationPayload &&
          typeof invocationPayload === 'object' &&
          !Array.isArray(invocationPayload)
            ? (invocationPayload as Record<string, unknown>)
            : {}),
        };
        if (payload && Object.keys(payload).length > 0) {
          await vscode.commands.executeCommand(action.vscodeCommand, payload);
          return;
        }
        await vscode.commands.executeCommand(action.vscodeCommand);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Workspai] Sidebar action failed: ${action.id}`, error);
      void vscode.window.showErrorMessage(`Workspai action failed: ${action.label}. ${message}`);
    }
  }

  private _trackSidebarAction(action: SidebarActionSurfaceMeta): void {
    if (!action.trackActivity) {
      return;
    }

    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    void WorkspaceUsageTracker.getInstance().trackCommandEvent(
      `workspai.sidebar.${action.id}`,
      workspacePath,
      {
        surface: 'sidebar-actions-webview',
        variant: this._variant,
        actionId: action.id,
        scope: action.scope,
        handler: action.handler,
        vscodeCommand: action.vscodeCommand,
      }
    );
  }

  private _getHtmlContent(webview: vscode.Webview): string {
    // Both sidebar surfaces render the React `sidebar` bundle with `ws-*` tokens
    // (roadmap 2.11). The variant is injected so the React root mounts either the
    // activity-bar Quick Actions or the secondary-sidebar Create/Advisor/Studio
    // tabs. Host message handlers (`sidebar*`) are unchanged.
    const iconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'icons', 'workspai.svg')
    );
    return buildReactWebviewHtml({
      webview,
      extensionUri: this._extensionUri,
      bundleName: 'sidebar',
      title: this._variant === 'secondary-sidebar' ? 'Workspai' : 'Workspai Quick Actions',
      bootstrapGlobals: {
        WORKSPAI_SIDEBAR_VARIANT: this._variant,
        ICON_URI: iconUri.toString(),
      },
    });
  }

  dispose() {}
}

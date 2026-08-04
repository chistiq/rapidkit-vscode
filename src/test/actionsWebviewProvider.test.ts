import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { SIDEBAR_ACTION_SURFACE } from '../contracts/sidebarActionSurface';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function collectTsFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'test') {
        continue;
      }
      files.push(...collectTsFiles(fullPath));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('actionsWebviewProvider — React migration (roadmap 2.11)', () => {
  const source = read('src/ui/webviews/actionsWebviewProvider.ts');

  it('renders the React sidebar bundle for both variants instead of raw HTML', () => {
    expect(source).toContain('buildReactWebviewHtml');
    expect(source).toContain("bundleName: 'sidebar'");
    expect(source).toContain('WORKSPAI_SIDEBAR_VARIANT: this._variant');
    // The ~4.6k-line raw-HTML/inline-JS monolith must be gone.
    expect(source).not.toContain('qa-shell');
    expect(source).not.toContain('data-action="openWelcome"');
    expect(source).not.toContain('function renderPlan(plan)');
    expect(source).not.toContain("document.addEventListener('click'");
    expect(source).not.toContain('acquireVsCodeApi');
    expect(source).not.toContain('<style nonce=');
  });

  it('keeps the two webview view types and resilient webview options', () => {
    expect(source).toContain("public static readonly viewType = 'rapidkitActionsWebview'");
    expect(source).toContain(
      "public static readonly secondaryViewType = 'workspaiSecondarySidebar'"
    );
    expect(source).toContain('enableScripts: true');
    expect(source).toContain('localResourceRoots: [this._extensionUri]');
  });
});

describe('actionsWebviewProvider — sidebar protocol handlers', () => {
  const source = read('src/ui/webviews/actionsWebviewProvider.ts');
  const dispatcherSource = read('src/ui/webviews/actionsWebviewMessageDispatcher.ts');
  const studioActionHostSource = read('src/ui/webviews/actionsWebviewStudioActionHost.ts');

  it('handles every inbound sidebar command the React webview posts', () => {
    expect(source).toContain(
      'dispatchActionsWebviewMessage(this._actionsWebviewMessageDispatchHost()'
    );
    expect(source).not.toContain("message.command === 'sidebarAiCreatePlan'");
    expect(dispatcherSource).toContain('export type ActionsWebviewMessageDispatchHost');
    expect(dispatcherSource).toContain('listActionsWebviewMessageCommands');

    for (const command of [
      'sidebarAiCreatePlan',
      'sidebarAiCreateConfirm',
      'sidebarManualCreate',
      'sidebarImpactQuery',
      'sidebarAdvisorAction',
      'sidebarStudioQuery',
      'sidebarStudioAction',
      'sidebarFocusView',
      'sidebarOpenDashboard',
      'sidebarRefreshScope',
      'sidebarRefreshModels',
      'setPreferredModel',
    ]) {
      expect(dispatcherSource, command).toContain(`command: '${command}'`);
    }
  });

  it('keeps command surface audit documentation aligned with sidebar protocol', () => {
    const auditDoc = read('docs/COMMAND_SURFACE_AUDIT.md');

    expect(auditDoc).toContain('Workspai Command Surface Audit');
    expect(auditDoc).toContain(
      'Dashboard detects and routes; Agent diagnoses, plans, fixes, verifies, and'
    );
    expect(auditDoc).toContain('Sending a fail/warn card to Studio is repair intent.');
    for (const command of [
      'sidebarAiCreatePlan',
      'sidebarAiCreateConfirm',
      'sidebarManualCreate',
      'sidebarCreatedWorkspaceBootstrap',
      'sidebarStudioAction',
      'sidebarOpenDashboard',
      'sidebarRefreshScope',
    ]) {
      expect(auditDoc).toContain(command);
    }
  });

  it('emits the create/advisor/studio outbound messages via _postInlineCreate', () => {
    for (const command of [
      'sidebarActivateTab',
      'sidebarAiModelsList',
      'sidebarAiScope',
      'sidebarAiCreateThinking',
      'sidebarAiCreatePlan',
      'sidebarAiCreateProgress',
      'sidebarAiCreateDone',
      'sidebarAiCreateError',
      'sidebarManualCreateResult',
      'sidebarImpactScope',
      'sidebarImpactChunk',
      'sidebarImpactDone',
      'sidebarImpactError',
      'sidebarAdvisorActionResult',
      'sidebarStudioScope',
      'sidebarStudioChunk',
      'sidebarStudioDone',
      'sidebarStudioError',
      'sidebarStudioActionResult',
    ]) {
      expect(source, command).toContain(`this._postInlineCreate('${command}'`);
    }
  });

  it('keeps the reveal/secondary-tab bridge that extension commands depend on', () => {
    expect(source).toContain('public async revealSecondaryTab(');
    expect(source).toContain('this._postSecondaryTabActivation(tab, payload)');
    expect(source).toContain("this._postInlineCreate('sidebarActivateTab'");
    expect(source).toContain('public refreshScope(): void');
  });

  it('supports the studio action set the React command cards invoke', () => {
    expect(source).toContain("action === 'verify'");
    expect(source).toContain("action === 'verify-handoff'");
    expect(source).toContain("action === 'run-command'");
    expect(source).toContain("action === 'copy-command'");
    expect(source).toContain('gateIncidentStudioRapidkitCommand');
    expect(source).toContain("featureLabel: 'Studio command'");
    expect(source).toContain('resolveRapidkitExecutionPlan');
    expect(source).toContain('runCommandsInTerminal');
    expect(source).toContain('exitCode: execution.exitCode');
    expect(source).toContain('stderrTail: execution.stderrTail');
    expect(source).toContain(
      'topBlocker: execution.success ? undefined : (execution.error ?? handoff.blockers[0])'
    );
  });

  it('refreshes contract evidence immediately after a remediation step', () => {
    expect(source).toContain('if (ok && step.verifyCommand?.trim())');
    expect(source).toContain('actionId: `studio-session-remediation-verify-${step.id}`');
    expect(source).toContain('command: step.verifyCommand.trim()');
  });

  it('keeps RUN_ONCE Studio source commands project-scoped when a handoff has a project path', () => {
    const runOnceBranch = source.slice(
      source.indexOf("if (mode === 'RUN_ONCE')"),
      source.indexOf('if (execution.success && handoff.verifyCommand)')
    );

    expect(runOnceBranch).toContain('this._assertSidebarStudioMutationAllowed({');
    expect(runOnceBranch.indexOf('this._assertSidebarStudioMutationAllowed({')).toBeLessThan(
      runOnceBranch.indexOf('runIncidentInlineCommand({')
    );
    expect(runOnceBranch).toContain('command: handoff.sourceCommand');
    expect(runOnceBranch).toContain('workspacePath');
    expect(runOnceBranch).toContain('projectPath');
    expect(runOnceBranch).toContain('actionId: `run-once-${handoff.cardId}`');
  });

  it('keeps mutating Studio repair paths behind the enterprise mutation gate', () => {
    expect(source).toContain('private async _assertSidebarStudioMutationAllowed(');
    expect(source).toContain('resolveIncidentStudioTelemetry({');
    expect(source).toContain('resolveStudioMutationBlockReason(telemetry)');

    for (const label of [
      'Studio remediation evidence refresh',
      'Studio remediation plan refresh',
      'Studio remediation apply',
      'Studio internal remediation apply',
      'Studio remediation command',
      'Studio patch apply',
      'Studio command',
      'Studio run-once source command',
      'Studio auto-fix',
    ]) {
      expect(source, label).toContain(`actionLabel: '${label}'`);
    }
    expect(source).toContain("actionLabel: 'Studio Agent workspace patch'");
    expect(source).toContain('resolveGovernedStudioRepairMutationBlockReason({');
    expect(source).toContain('contractAuthorized: true');
    expect(source).toContain('reversible: true');
    expect(source).toContain('actionLabel: `Studio Agent ${request.commandId}`');
  });

  it('grants dynamic patch authority only after exact source inspection and SHA capture', () => {
    expect(source).toContain('const inspectedSource = new Map<string, string | null>();');
    expect(source).toContain('inspectedSource.set(observation.path, observation.sha256);');
    expect(source).toContain(
      'const staticTargets = new Set(repairEvidence.autonomousTargetPaths);'
    );
    expect(source).toContain('authorizeStudioWorkspacePatchTargets({');
    expect(source).toContain('repairEvidence.expectedBaseSha256[entry] = hash;');
    expect(source).not.toContain('repairEvidence.autonomousTargetPaths.push(observation.path)');
  });

  it('recovers stale dependency evidence through Doctor before returning control to the model', () => {
    expect(source).toContain('const refreshDependencyDoctorEvidence = async');
    expect(source).toContain("resolveDashboardCommandExecutionPlan('checkWorkspaceHealth')");
    expect(source).toContain("actionId: 'studio-session-dependency-doctor-refresh'");
    expect(source).toContain("nextAction: 'verify-blocker'");
  });

  it('routes Studio actions through a typed host facade', () => {
    expect(studioActionHostSource).toContain('export type ActionsWebviewStudioActionHost');
    expect(studioActionHostSource).toContain('resolveSidebarStudioActionPayload');
    expect(source).toContain('buildActionsWebviewStudioActionHost({');
    expect(source).toContain('private _actionsWebviewStudioActionHost()');
    expect(source).toContain('resolveSidebarStudioActionPayload(');

    for (const hostCall of [
      'studioHost.retryLastSidebarStudioAudit(',
      'studioHost.runSidebarAutoFix(',
      'studioHost.finalizeStudioPatchTransaction(',
      'studioHost.auditSidebarStudioFix(',
      'studioHost.refreshSidebarShipLoop(',
      'studioHost.finalizeStudioVerifyHandoff(',
      'studioHost.postInlineCreate(',
    ]) {
      expect(source, hostCall).toContain(hostCall);
    }
  });
});

describe('actionsWebviewProvider — contract-driven quick actions', () => {
  const source = read('src/ui/webviews/actionsWebviewProvider.ts');
  const dispatcherSource = read('src/ui/webviews/actionsWebviewMessageDispatcher.ts');

  it('routes unknown commands through the sidebar action surface contract', () => {
    expect(dispatcherSource).toContain('resolveSidebarActionSurface(message.command)');
    expect(source).toContain(
      'runSidebarAction: (action, data) => this._runSidebarAction(action, data)'
    );

    for (const meta of Object.values(SIDEBAR_ACTION_SURFACE)) {
      expect(meta.id).toBeTruthy();
      expect(meta.label).toBeTruthy();
      expect(meta.scope).toBeTruthy();
      expect(['external-url', 'vscode-command']).toContain(meta.handler);
      if (meta.handler === 'external-url') {
        expect(meta.externalUrl).toMatch(/^https:\/\//);
      }
      if (meta.handler === 'vscode-command') {
        expect(meta.vscodeCommand).toMatch(/^workspai\./);
      }
    }
  });

  it('routes sidebar actions through a resilient async executor', () => {
    expect(source).toContain('private async _runSidebarAction');
    expect(source).toContain('this._trackSidebarAction(action)');
    expect(source).toContain('await vscode.env.openExternal');
    expect(source).toContain(
      'resolveDashboardCommandContractByVscodeCommand(action.vscodeCommand)'
    );
    expect(source).toContain('await gateDashboardCommandCapability({');
    expect(source).toContain('await vscode.commands.executeCommand');
    expect(source).toContain('[Workspai] Sidebar action failed');
  });

  it('tracks contract-approved sidebar activity without polluting external docs clicks', () => {
    expect(source).toContain('if (!action.trackActivity)');
    expect(source).toContain('WorkspaceUsageTracker.getInstance().trackCommandEvent');
    expect(source).toContain('`workspai.sidebar.${action.id}`');
    expect(SIDEBAR_ACTION_SURFACE.openDocs.trackActivity).toBe(false);
    expect(SIDEBAR_ACTION_SURFACE.createProjectWithAI.trackActivity).toBe(true);
    expect(SIDEBAR_ACTION_SURFACE.createWithAI.vscodeCommand).toBe('workspai.openCreateWithAI');
    expect(SIDEBAR_ACTION_SURFACE.workspaceAdvisor.vscodeCommand).toBe(
      'workspai.openWorkspaceAdvisor'
    );
    expect(SIDEBAR_ACTION_SURFACE.incidentStudioNext.vscodeCommand).toBe(
      'workspai.openIncidentStudio'
    );
  });
});

describe('actionsWebviewProvider — manifest + command alignment', () => {
  it('keeps sidebar vscode commands contributed in the extension manifest', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      contributes?: { commands?: Array<{ command: string }> };
    };
    const contributedCommands = new Set(
      (packageJson.contributes?.commands ?? []).map((entry) => entry.command)
    );
    for (const meta of Object.values(SIDEBAR_ACTION_SURFACE)) {
      if (meta.handler !== 'vscode-command') {
        continue;
      }
      expect(contributedCommands, meta.vscodeCommand).toContain(meta.vscodeCommand);
    }
  });

  it('keeps sidebar vscode commands registered by extension source', () => {
    const allSource = collectTsFiles(path.join(repoRoot, 'src'))
      .map((file) => fs.readFileSync(file, 'utf8'))
      .join('\n');
    const registeredCommands = new Set(
      Array.from(allSource.matchAll(/registerCommand\(\s*['"]([^'"]+)['"]/g)).map(
        (match) => match[1]
      )
    );
    for (const meta of Object.values(SIDEBAR_ACTION_SURFACE)) {
      if (meta.handler !== 'vscode-command') {
        continue;
      }
      expect(registeredCommands, meta.vscodeCommand).toContain(meta.vscodeCommand);
    }
  });

  it('keeps the Marketplace README concise and aligned with the Workspai Assistant', () => {
    const readme = read('README.md');
    expect(readme).toContain(
      'Understand the workspace. Change it with evidence. Verify the result.'
    );
    expect(readme).toContain('Ask → inspect → change → test → verify');
    expect(readme).toContain('## One assistant, three ways to work');
    expect(readme).toContain('| **Ask**');
    expect(readme).toContain('| **Plan**');
    expect(readme).toContain('| **Agent**');
    expect(readme).toContain('does not need an incident card');
    expect(readme).toContain('## Bring your model');
    expect(readme).toContain('`Gemini`');
    expect(readme).toContain('`Kimi`');
    expect(readme).toContain('`Ollama`');
    expect(readme).toContain('https://www.workspai.dev/');
    expect(readme.split(/\r?\n/).length).toBeLessThanOrEqual(120);
    expect(readme).not.toContain('## Workspace operations');
    expect(readme).not.toContain('## Keyboard shortcuts');
    expect(readme).not.toContain('## Troubleshooting');
    expect(readme).not.toContain('Incident Studio VNext');
  });

  it('keeps media capture guidance aligned with one real Assistant story', () => {
    const mediaReadme = read('media/README.md');
    expect(mediaReadme).toContain('readme/assistant-loop.gif');
    expect(mediaReadme).toContain('Enter an ordinary code task in **Agent** mode');
    expect(mediaReadme).toContain('transaction-backed edit');
    expect(mediaReadme).toContain('successful verify');
    expect(mediaReadme).toContain('between 10 and 15 seconds');
    expect(mediaReadme).toContain('Do not show secrets, tokens, or local-only paths');
    expect(mediaReadme).not.toContain('Incident Studio VNext');
  });

  it('keeps manifest and host copy aligned with the Workspai surface', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      engines?: { vscode?: string };
      contributes?: {
        viewsContainers?: Record<string, Array<{ id?: string; title?: string }>>;
        views?: Record<string, Array<{ id?: string; name?: string; contextualTitle?: string }>>;
        commands?: Array<{ command: string; title: string }>;
        viewsWelcome?: Array<{ contents?: string }>;
      };
    };
    const extensionSource = read('src/extension.ts');
    const actionsSource = read('src/ui/webviews/actionsWebviewProvider.ts');
    const activityContainer = packageJson.contributes?.viewsContainers?.activitybar?.find(
      (container) => container.id === 'rapidkit-explorer'
    );
    const nativeSidebarContainer = packageJson.contributes?.viewsContainers?.secondarySidebar?.find(
      (container) => container.id === 'workspai-native-sidebar'
    );
    const duplicateActivityContainer = packageJson.contributes?.viewsContainers?.activitybar?.find(
      (container) => container.id === 'workspai-native-sidebar'
    );
    const sidebarView = packageJson.contributes?.views?.['rapidkit-explorer']?.find(
      (view) => view.id === 'rapidkitActionsWebview'
    );
    const nativeSidebarView = packageJson.contributes?.views?.['workspai-native-sidebar']?.find(
      (view) => view.id === 'workspaiSecondarySidebar'
    );

    expect(packageJson.engines?.vscode).toBe('^1.106.0');
    expect(activityContainer?.title).toBe('Workspai');
    expect(duplicateActivityContainer).toBeUndefined();
    expect(nativeSidebarContainer?.title).toBe('Workspai');
    expect(sidebarView?.name).toBe('Quick Actions');
    expect(sidebarView?.contextualTitle).toBe('Workspai Quick Actions');
    expect(nativeSidebarView?.name).toBe('Workspai');
    expect(nativeSidebarView?.contextualTitle).toBe('Workspai');
    expect(extensionSource).toContain('ActionsWebviewProvider.secondaryViewType');
    expect(extensionSource).toContain('secondaryActionsWebviewProvider');
    expect(actionsSource).toContain('public refreshScope(): void');
  });
});

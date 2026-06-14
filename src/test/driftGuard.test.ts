import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf-8');
}

const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.vscode-test',
  '.turbo',
]);

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.svg',
  '.ttf',
  '.woff',
  '.woff2',
  '.eot',
  '.zip',
  '.gz',
  '.tar',
  '.vsix',
  '.lockb',
  '.pdf',
  '.mp4',
  '.webm',
  '.mp3',
]);

function collectProjectFiles(root: string): string[] {
  const files: string[] = [];

  const walk = (dir: string): void => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(root, fullPath).split(path.sep).join('/');

      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        walk(fullPath);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) continue;

      files.push(relPath);
    }
  };

  walk(root);
  return files;
}

describe('contract drift guard', () => {
  it('keeps repository text content free of unenglish characters', () => {
    const filePaths = collectProjectFiles(repoRoot);
    const arabicScriptRegex = /[\u0600-\u06FF]/u;

    const violations: Array<{ file: string; line: number; snippet: string }> = [];

    for (const relPath of filePaths) {
      const absPath = path.join(repoRoot, relPath);
      let content: string;

      try {
        content = fs.readFileSync(absPath, 'utf-8');
      } catch {
        continue;
      }

      const lines = content.split('\n');
      for (let idx = 0; idx < lines.length; idx += 1) {
        const line = lines[idx];
        if (arabicScriptRegex.test(line)) {
          violations.push({
            file: relPath,
            line: idx + 1,
            snippet: line.trim(),
          });
          if (violations.length >= 20) break;
        }
      }

      if (violations.length >= 20) break;
    }

    if (violations.length > 0) {
      const details = violations.map((v) => `${v.file}:${v.line} -> ${v.snippet}`).join('\n');
      throw new Error(`Unenglish text guard failed:\n${details}`);
    }

    expect(violations).toHaveLength(0);
  });

  it('keeps workspace doctor command contract aligned with npm CLI', () => {
    const extensionSource = read('src/extension.ts');
    const workspaceOpsSource = read('src/commands/workspaceOperations.ts');
    const commandSource = `${extensionSource}\n${workspaceOpsSource}`;

    expect(commandSource).toContain("['doctor', 'workspace']");
    expect(commandSource).toContain("['doctor', 'workspace', '--fix']");
    expect(commandSource).not.toContain('doctor --workspace');
  });

  it('keeps profile enum values aligned across type, completion, hover, and wizard', () => {
    const expectedProfiles = [
      'minimal',
      'python-only',
      'node-only',
      'go-only',
      'java-only',
      'dotnet-only',
      'polyglot',
      'enterprise',
    ];

    const extensionSource = read('src/extension.ts');
    const workspaceOpsSource = read('src/commands/workspaceOperations.ts');
    const commandSource = `${extensionSource}\n${workspaceOpsSource}`;
    const typesSource = read('src/types/index.ts');
    const completionSource = read('src/providers/completionProvider.ts');
    const hoverSource = read('src/providers/hoverProvider.ts');
    const wizardSource = read('src/ui/wizards/workspaceWizard.ts');
    const welcomePanelSource = read('src/ui/panels/welcomePanel.ts');
    const webviewTypesSource = read('webview-ui/src/types.ts');
    const projectSchemaSource = read('schemas/rapidkit.schema.json');
    const workspaceSchemaSource = read('schemas/rapidkitrc.schema.json');

    for (const profile of expectedProfiles) {
      expect(commandSource).toContain(`'${profile}'`);
      expect(typesSource).toContain(`'${profile}'`);
      expect(completionSource).toContain(profile);
      expect(hoverSource).toContain(`\`${profile}\``);
      expect(wizardSource).toContain(`'${profile}'`);
      expect(welcomePanelSource).toContain(`'${profile}'`);
      expect(webviewTypesSource).toContain(`'${profile}'`);
      expect(projectSchemaSource).toContain(`"${profile}"`);
      expect(workspaceSchemaSource).toContain(`"${profile}"`);
    }

    expect(completionSource).not.toContain('standard');
    expect(hoverSource).not.toContain('`standard`');
    expect(projectSchemaSource).not.toContain('"standard"');
    expect(workspaceSchemaSource).not.toContain('"standard"');
  });

  it('keeps updater/setup commands pinned to stable npm install syntax and workspace doctor contract', () => {
    const updateCheckerSource = read('src/utils/updateChecker.ts');
    const setupPanelSource = read('src/ui/panels/setupExperiencePanel.ts');
    const extensionSource = read('src/extension.ts');
    const workspaceOpsSource = read('src/commands/workspaceOperations.ts');
    const commandSource = `${extensionSource}\n${workspaceOpsSource}`;

    expect(updateCheckerSource).not.toContain('rapidkit@latest');
    expect(setupPanelSource).not.toContain('rapidkit@latest');
    expect(extensionSource).not.toContain('rapidkit@latest');

    expect(commandSource).toContain("['doctor', 'workspace']");
    expect(commandSource).toContain("['doctor', 'workspace', '--fix']");

    expect(setupPanelSource).toContain('runCommandsInTerminal');
    expect(setupPanelSource).toContain("'python -m pipx upgrade rapidkit-core'");
    expect(setupPanelSource).toContain("'python -m pipx install --force rapidkit-core'");
    expect(setupPanelSource).toContain("'python -m pipx --version'");
    expect(setupPanelSource).toContain("'python3 -m pip --version'");
    expect(setupPanelSource).toContain("'python -m pip install --user pipx'");
    expect(setupPanelSource).toContain("'python -m pipx ensurepath'");
  });

  it('keeps dotnet workspace setup surfaced across command and setup experiences', () => {
    const workspaceOpsSource = read('src/commands/workspaceOperations.ts');
    const setupPanelSource = read('src/ui/panels/setupExperiencePanel.ts');
    const setupExperienceSource = read('webview-ui/src/components/SetupExperience.tsx');
    const commandCenterSource = read('src/commands/aiFreeFeatures.ts');

    expect(workspaceOpsSource).toContain("value: 'dotnet'");
    expect(workspaceOpsSource).toContain("value: 'dotnet-only'");
    expect(setupPanelSource).toContain("'dotnet'");
    expect(setupPanelSource).toContain("case 'verifyDotnet'");
    expect(setupPanelSource).toContain("case 'installDotnet'");
    expect(setupExperienceSource).toContain('dotnetInstalled?: boolean');
    expect(setupExperienceSource).toContain("verifyCommand: 'verifyDotnet'");
    expect(setupExperienceSource).toContain('ToolGroup title=".NET / ASP.NET Core"');
    expect(commandCenterSource).toContain('Python/Node/Go/Java/.NET');
  });

  it('keeps release stop automation wired to gate script and CI workflow', () => {
    const packageJsonSource = read('package.json');
    const workflowSource = read('.github/workflows/extension-smoke-matrix.yml');
    const gateScriptSource = read('scripts/release-stop-gate.mjs');

    expect(packageJsonSource).toContain(
      '"release:stop-gate": "node scripts/release-stop-gate.mjs"'
    );
    expect(packageJsonSource).toContain(
      '"release:open-issues-report": "node scripts/export-open-issues-report.mjs"'
    );
    expect(workflowSource).toContain('Release stop gate (contract/parity)');
    expect(workflowSource).toContain('Shared parity contract snapshot');
    expect(workflowSource).toContain('Open issue severity report');
    expect(workflowSource).toContain('npm run release:open-issues-report -- --repo');
    expect(workflowSource).toContain('npm run test:parity-contract');
    expect(workflowSource).toContain(
      'npm run release:stop-gate -- --marker releases/wave3-kpi-marker.json'
    );
    expect(workflowSource).toContain('--issue-report artifacts/open-issues-report.json');
    expect(workflowSource).toContain('--enforce-open-issues');
    expect(workflowSource).toContain('--block-severities p0,p1');
    expect(workflowSource).toContain('--marker-max-age-hours 720');
    expect(workflowSource).toContain('--release-readiness-validation-mode auto');
    expect(workflowSource).toContain('--predictive-calibration-mode production');
    expect(workflowSource).toContain('--marker releases/wave3-kpi-marker.json');
    expect(workflowSource).toContain('--claim-checklist releases/wave3-claim-checklist.md');
    expect(workflowSource).toContain('--enterprise-gate releases/wave3-enterprise-gate.json');
    expect(workflowSource).toContain('--release-notes releases/release-posture-label.md');
    expect(workflowSource).toContain('--enforce-claim-checklist');
    expect(workflowSource).toContain('--enforce-enterprise-freeze');
    expect(workflowSource).toContain('--enforce-release-posture-label');
    expect(workflowSource).toContain('--enforce-claim-safety');
    expect(gateScriptSource).toContain('src/test/driftGuard.test.ts');
    expect(gateScriptSource).toContain('src/test/importStackParity.snapshot.test.ts');
    expect(gateScriptSource).toContain('src/test/impactScoreScenarioMatrix.test.ts');
    expect(gateScriptSource).toContain('src/test/incidentStudioPayload.test.ts');
    expect(gateScriptSource).toContain('src/test/workspaceUsageTracker.test.ts');
    expect(gateScriptSource).toContain('--manifest');
    expect(gateScriptSource).toContain('--skip-contract-checks');
    expect(gateScriptSource).toContain('WORKSPAI_GATE_PREDICTIVE_PRECISION_MIN');
    expect(gateScriptSource).toContain('WORKSPAI_GATE_FALSE_ALARM_RATE_MAX');
  });

  it('keeps terminal execution centralized in approved files', () => {
    const sourceFiles = collectProjectFiles(path.join(repoRoot, 'src')).filter(
      (relPath) => relPath.endsWith('.ts') && !relPath.startsWith('test/')
    );

    const violations: string[] = [];

    for (const relPath of sourceFiles) {
      const content = read(`src/${relPath}`);
      const sendTextCount = (content.match(/\.sendText\(/g) || []).length;
      const createTerminalCount = (content.match(/createTerminal\(/g) || []).length;

      if (relPath === 'utils/terminalExecutor.ts') {
        expect(sendTextCount).toBe(2);
        expect(createTerminalCount).toBe(1);
        continue;
      }

      if (relPath === 'extension.ts') {
        expect(sendTextCount).toBe(0);
        expect(createTerminalCount).toBe(0);
        continue;
      }

      if (relPath === 'commands/projectLifecycle.ts') {
        expect(sendTextCount).toBe(0);
        expect(createTerminalCount).toBe(0);
        expect(content).toContain('openTerminal({');
        expect(content).toContain('interruptTerminal(existingTerminal)');
        continue;
      }

      if (sendTextCount > 0) {
        violations.push(`${relPath}: sendText(${sendTextCount})`);
      }
      if (createTerminalCount > 0) {
        violations.push(`${relPath}: createTerminal(${createTerminalCount})`);
      }
    }

    if (violations.length > 0) {
      throw new Error(`Terminal API drift detected:\n${violations.join('\n')}`);
    }

    expect(violations).toHaveLength(0);
  });

  it('keeps fail-closed unknown-scope mutation guard active for apply-patch route', () => {
    const welcomePanelSource = read('src/ui/panels/welcomePanel.ts');

    expect(welcomePanelSource).toContain('lastUnknownScopeMutationBlocked');
    expect(welcomePanelSource).toContain('lastScopeKnown');
    expect(welcomePanelSource).toContain(
      'if (conv?.lastUnknownScopeMutationBlocked || conv?.lastScopeKnown === false)'
    );
    expect(welcomePanelSource).toContain('SCOPE_UNKNOWN_MUTATION_BLOCKED');
    expect(welcomePanelSource).toContain('Patch apply blocked: impacted scope is unknown.');
  });

  it('keeps workspace memory policy profile contract exposed for local-processing mode', () => {
    const welcomePanelSource = read('src/ui/panels/welcomePanel.ts');
    const memoryServiceSource = read('src/core/workspaceMemoryService.ts');
    const aiFreeFeaturesSource = read('src/commands/aiFreeFeatures.ts');
    const payloadSource = read('webview-ui/src/lib/incidentStudioPayload.ts');
    const reproPackSource = read('webview-ui/src/lib/incidentStudioReproPack.ts');

    expect(memoryServiceSource).toContain('WorkspaceMemoryPolicyProfile');
    expect(memoryServiceSource).toContain('WorkspaceMemoryWriteAccessContract');
    expect(memoryServiceSource).toContain('validateWriteAccessContract');
    expect(memoryServiceSource).toContain('resolvePolicy(memory?: WorkspaceMemory)');
    expect(memoryServiceSource).toContain('Memory policy:');

    expect(welcomePanelSource).toContain('policyProfile: memoryPolicy.profile');
    expect(welcomePanelSource).toContain('sensitivity: memoryPolicy.sensitivity');
    expect(welcomePanelSource).toContain('localProcessingMode: memoryPolicy.localProcessingMode');
    expect(welcomePanelSource).toContain("operation: 'incident-replay-learning'");
    expect(welcomePanelSource).toContain("mode: 'system-enrichment'");

    expect(aiFreeFeaturesSource).toContain("operation: 'workspace-memory-wizard'");
    expect(aiFreeFeaturesSource).toContain("mode: 'user-initiated'");

    expect(payloadSource).toContain('asWorkspaceMemoryPolicyProfile');
    expect(payloadSource).toContain('deriveLocalProcessingMode');
    expect(payloadSource).toContain('policyProfile');
    expect(payloadSource).toContain('sensitivity');
    expect(payloadSource).toContain('localProcessingMode');
    expect(payloadSource).toContain('memoryInfluenceAuditTimeline');

    expect(welcomePanelSource).toContain('_buildMemoryInfluenceAuditTimeline');
    expect(welcomePanelSource).toContain('memoryInfluenceAuditTimeline');
    expect(welcomePanelSource).toContain('memoryEventId');

    expect(reproPackSource).toContain('MEMORY_INFLUENCE_TIMELINE_HEADING');
    expect(payloadSource).toContain('decisionArtifacts');
  });

  it('keeps workspace memory writes restricted to approved contract-gated routes', () => {
    const aiFreeFeaturesSource = read('src/commands/aiFreeFeatures.ts');
    const welcomePanelSource = read('src/ui/panels/welcomePanel.ts');
    const workspaceMemoryServiceSource = read('src/core/workspaceMemoryService.ts');
    const combinedSource = `${aiFreeFeaturesSource}\n${welcomePanelSource}`;

    const writeCallMatches = combinedSource.match(/memoryService\.write\(/g) || [];
    expect(writeCallMatches.length).toBe(2);

    expect(aiFreeFeaturesSource).toContain("operation: 'workspace-memory-wizard'");
    expect(aiFreeFeaturesSource).toContain("mode: 'user-initiated'");
    expect(aiFreeFeaturesSource).toContain('approvedByUser: true');

    expect(welcomePanelSource).toContain("operation: 'incident-replay-learning'");
    expect(welcomePanelSource).toContain("mode: 'system-enrichment'");
    expect(welcomePanelSource).toContain('approvedByUser: false');

    expect(workspaceMemoryServiceSource).toContain('missing access contract');
    expect(workspaceMemoryServiceSource).toContain('invalid access mode');
    expect(workspaceMemoryServiceSource).toContain('blocked by policy profile');
  });

  it('keeps project lifecycle command contracts cross-platform for fastapi/go/nestjs', () => {
    const extensionSource = read('src/extension.ts');
    const projectLifecycleSource = read('src/commands/projectLifecycle.ts');
    const lifecycleSource = `${extensionSource}\n${projectLifecycleSource}`;

    expect(lifecycleSource).toContain("registerCommand('workspai.projectInit'");
    expect(lifecycleSource).toContain("registerCommand('workspai.projectDev'");
    expect(lifecycleSource).toContain("registerCommand('workspai.projectTest'");
    expect(lifecycleSource).toContain("registerCommand('workspai.projectDoctor'");

    expect(lifecycleSource).toContain("commands: [['init']]");
    expect(lifecycleSource).toContain("commands: [['test']]");
    expect(lifecycleSource).toContain("commands: [['init'], ['dev']]");

    expect(lifecycleSource).toContain("commands: [['dev', '--allow-global-runtime']]");
    expect(lifecycleSource).toContain("commands: [['dev', '--port', String(port)]]");
    expect(lifecycleSource).toContain("commands: [['dev']]");

    expect(lifecycleSource).toContain("commands: ['npm run start:dev']");
    expect(lifecycleSource).toContain('PORT: String(port)');

    expect(lifecycleSource).not.toContain('PORT=${port} npm run start:dev');
    expect(lifecycleSource).not.toContain('PORT=${port} npx rapidkit dev');
    expect(lifecycleSource).not.toContain('PORT=$PORT npx rapidkit dev');
    expect(lifecycleSource).not.toContain('npx rapidkit init && npx rapidkit dev');
  });

  it('keeps workspace operations on command-array contracts', () => {
    const extensionSource = read('src/extension.ts');
    const workspaceOpsSource = read('src/commands/workspaceOperations.ts');
    const operationsSource = `${extensionSource}\n${workspaceOpsSource}`;

    expect(operationsSource).toContain("commands: [['bootstrap', '--profile'");
    expect(operationsSource).toContain("commands: [['setup', runtime.value]]");
    expect(operationsSource).toContain("commands: [['workspace', 'run', 'init']]");
    expect(operationsSource).toContain("commands: [['workspace', 'run', stage, ...flags]]");

    expect(operationsSource).toContain("commands: [['workspace', 'policy', 'show']]");
    expect(operationsSource).toContain(
      "['workspace', 'policy', 'set', policyKey.label, policyValue]"
    );
    expect(operationsSource).toContain("'autopilot',");
    expect(operationsSource).toContain("'release',");
    expect(operationsSource).toContain("'--mode',");
    expect(operationsSource).toContain("'--json',");
    expect(operationsSource).toContain("'--output',");

    expect(operationsSource).toContain("commands: [['cache', 'status']]");
    expect(operationsSource).toContain("commands: [['cache', 'clear']]");
    expect(operationsSource).toContain("commands: [['cache', 'prune']]");
    expect(operationsSource).toContain("commands: [['cache', 'repair']]");

    expect(operationsSource).toContain("commands: [['mirror', 'status']]");
    expect(operationsSource).toContain("commands: [['mirror', 'sync']]");
    expect(operationsSource).toContain("commands: [['mirror', 'verify']]");
    expect(operationsSource).toContain("commands: [['mirror', 'rotate']]");

    expect(operationsSource).toContain("commands: [['doctor', 'workspace']]");
    expect(operationsSource).toContain("commands: [['doctor', 'workspace', '--fix']]");

    expect(operationsSource).not.toContain('npx rapidkit cache status');
    expect(operationsSource).not.toContain('npx rapidkit mirror status');
    expect(operationsSource).not.toContain('npx rapidkit autopilot release');
    expect(operationsSource).not.toContain('npx workspai.doctor workspace');
    expect(operationsSource).not.toContain("commands: [['init']]");
    expect(operationsSource).not.toContain('RAPIDKIT_ENABLE_RUNTIME_ADAPTERS=1 npx rapidkit setup');
  });

  it('keeps setup panel language toolchain commands cross-platform and shell-safe', () => {
    const setupPanelSource = read('src/ui/panels/setupExperiencePanel.ts');

    expect(setupPanelSource).toContain('runCommandsInTerminal');

    expect(setupPanelSource).toContain("'python3 --version'");
    expect(setupPanelSource).toContain("'python --version'");
    expect(setupPanelSource).toContain("'python -m pip --version'");
    expect(setupPanelSource).toContain("'python3 -m pip --version'");
    expect(setupPanelSource).toContain('buildNpmCliVersionVerifyCommands');
    expect(setupPanelSource).toContain("'go version'");

    expect(setupPanelSource).toContain("'python -m pipx install --force rapidkit-core'");
    expect(setupPanelSource).toContain("'pipx install --force rapidkit-core'");

    expect(setupPanelSource).not.toContain('RAPIDKIT_ENABLE_RUNTIME_ADAPTERS=1');
    expect(setupPanelSource).not.toContain('PORT=');
  });

  it('keeps extension-host rapidkit npm calls on the pinned cross-platform wrapper', () => {
    const sourceFiles = [
      'src/core/rapidkitCLI.ts',
      'src/core/kitsService.ts',
      'src/core/aiService.ts',
      'src/utils/firstTimeSetup.ts',
      'src/utils/updateChecker.ts',
      'src/ui/panels/setupExperiencePanel.ts',
    ];

    for (const file of sourceFiles) {
      const source = read(file);
      if (source.includes("'npx'") || source.includes('"npx"')) {
        const usesPinnedNpxWrapper =
          source.includes('buildNpxRapidkitArgs') ||
          source.includes('buildNpxRapidkitVersionProbeArgs') ||
          source.includes('buildNpmCliVersionVerifyCommands');
        expect(usesPinnedNpxWrapper, file).toBe(true);
      }
    }

    const combined = sourceFiles.map((file) => read(file)).join('\n');
    expect(combined).not.toContain("['rapidkit', '--version']");
    expect(combined).not.toContain("['rapidkit', 'list', '--json']");
    expect(combined).not.toContain("['--package', 'rapidkit', 'rapidkit'");
  });

  it('keeps user-facing CLI snippets simple while execution helpers stay pinned', () => {
    const userFacingSources = [
      'README.md',
      'src/commands/chatParticipant.ts',
      'src/commands/createWorkspace.ts',
      'src/core/aiContextContract.ts',
      'src/core/aiContextResolver.ts',
      'src/core/aiSystemPromptBuilder.ts',
      'src/ui/panels/setupExperiencePanel.ts',
      'src/ui/panels/welcomePanel.ts',
      'src/ui/treeviews/doctorEvidenceProvider.ts',
      'src/utils/workspaceValidator.ts',
      'webview-ui/src/components/InstallModuleModal.tsx',
      'webview-ui/src/components/ModuleBrowser.tsx',
      'webview-ui/src/components/ModuleDetailsModal.tsx',
      'webview-ui/src/components/StudioRedesign/regions/ChatSurface.tsx',
      'webview-ui/src/components/StudioRedesign/regions/WorkspaceSidebar.tsx',
      'webview-ui/src/lib/commandCheatsheet.ts',
      'webview-ui/src/lib/incidentCliActionMatrix.ts',
    ];
    const combined = userFacingSources.map((file) => read(file)).join('\n');

    expect(combined).not.toContain('npx --yes --package rapidkit rapidkit');
    expect(read('src/utils/platformCapabilities.ts')).toContain(
      "['--yes', '--package', 'rapidkit', 'rapidkit', ...args]"
    );
    expect(read('src/ui/panels/incidentStudioInlineCommandBridge.ts')).toContain(
      'toPinnedRapidkitExecutionCommand(inlineCommand)'
    );
    expect(read('src/ui/panels/welcomePanel.ts')).toContain('dispatchIncidentStudioInlineCommand');
    expect(combined).not.toContain('rapidkit doctor --scope=workspace');
    expect(combined).not.toContain('rapidkit doctor verify --scope=');
  });

  it('keeps context assist stop-generation contract aligned across webview and panel', () => {
    const appSource = read('webview-ui/src/App.tsx');
    const assistPanelSource = read('webview-ui/src/components/ContextAssistPanel.tsx');
    const welcomePanelSource = read('src/ui/panels/welcomePanel.ts');

    expect(appSource).toContain(
      "vscode.postMessage('aiCancelQuery', { requestId: aiRequestIdRef.current });"
    );
    expect(appSource).toContain('context: ctx,');
    expect(appSource).toContain('requestId,');
    expect(appSource).toContain("case 'aiContextContract':");
    expect(appSource).toContain('contextContract={aiContextContract}');
    expect(appSource).toContain('history: historyForRequest,');
    expect(appSource).toContain('onCancel={handleAICancelQuery}');
    expect(appSource).toContain('<ContextAssistPanel');

    expect(assistPanelSource).toContain('ContextAssistContractSummary');
    expect(assistPanelSource).toContain('ws-assist-panel__contract');
    expect(assistPanelSource).toContain('Evidence {contextContract.evidence_confidence}');
    expect(assistPanelSource).toContain('onCancel: () => void;');
    expect(assistPanelSource).toContain('onClick={isStreaming ? onCancel : handleSubmit}');
    expect(assistPanelSource).toContain("{isStreaming ? 'Stop' : 'Send'}");

    expect(welcomePanelSource).toContain("case 'aiCancelQuery':");
    expect(welcomePanelSource).toContain('this._aiQueryTokenSource?.cancel();');
    expect(welcomePanelSource).toContain('requestId: queryRequestId');
    expect(welcomePanelSource).toContain(
      "this._panel.webview.postMessage({ command: 'aiStreamDone' });"
    );
  });

  it('keeps AI modal clarification gate ahead of model streaming', () => {
    const welcomePanelSource = read('src/ui/panels/welcomePanel.ts');

    expect(welcomePanelSource).toContain('prepared.validation.clarificationNeeded');
    expect(welcomePanelSource).toContain("trackAIModalOutcome('clarification-needed'");
    expect(welcomePanelSource).toContain("'workspai.aimodal.clarification_gate'");
    expect(welcomePanelSource).toContain("command: 'aiChunkUpdate'");
    expect(welcomePanelSource).toContain("command: 'aiStreamDone'");
    expect(welcomePanelSource).toContain("title: 'Next Safe Action'");
    expect(welcomePanelSource).toContain('Generate verification evidence');
    expect(welcomePanelSource).toContain('_getChatBrainPrimaryActionLabel');

    const clarificationIdx = welcomePanelSource.indexOf('prepared.validation.clarificationNeeded');
    const streamStageIdx = welcomePanelSource.indexOf("currentStage = 'stream';", clarificationIdx);
    const streamIdx = welcomePanelSource.indexOf('await streamAIResponse(', clarificationIdx);
    const returnIdx = welcomePanelSource.indexOf('return;', clarificationIdx);

    expect(clarificationIdx).toBeGreaterThan(-1);
    expect(streamStageIdx).toBeGreaterThan(-1);
    expect(streamIdx).toBeGreaterThan(-1);
    expect(returnIdx).toBeGreaterThan(clarificationIdx);
    expect(returnIdx).toBeLessThan(streamStageIdx);
    expect(returnIdx).toBeLessThan(streamIdx);
    expect(clarificationIdx).toBeLessThan(streamIdx);
  });

  it('keeps incident telemetry request fail-safe fallback to null payload', () => {
    const welcomePanelSource = read('src/ui/panels/welcomePanel.ts');
    const telemetryBridgeSource = read('src/ui/panels/incidentStudioTelemetryBridge.ts');

    expect(welcomePanelSource).toContain("case 'requestIncidentStudioTelemetry':");
    expect(welcomePanelSource).toContain('postIncidentStudioTelemetry');
    expect(telemetryBridgeSource).toContain(
      "console.warn('[IncidentStudio] telemetry refresh failed:'"
    );
    expect(telemetryBridgeSource).toContain("command: 'incidentStudioTelemetry'");
    expect(telemetryBridgeSource).toContain('data: null');
  });
});

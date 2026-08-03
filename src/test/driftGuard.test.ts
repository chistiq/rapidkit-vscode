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
    const recentWorkspacesSource = read('src/ui/panels/welcomePanelRecentWorkspaces.ts');
    const combinedWelcomePanelSource = `${welcomePanelSource}\n${recentWorkspacesSource}`;
    const webviewTypesSource = read('webview-ui/src/types.ts');
    const projectSchemaSource = read('schemas/rapidkit.schema.json');
    const workspaceSchemaSource = read('schemas/rapidkitrc.schema.json');

    for (const profile of expectedProfiles) {
      expect(commandSource).toContain(`'${profile}'`);
      expect(typesSource).toContain(`'${profile}'`);
      expect(completionSource).toContain(profile);
      expect(hoverSource).toContain(`\`${profile}\``);
      expect(wizardSource).toContain(`'${profile}'`);
      expect(combinedWelcomePanelSource).toContain(`'${profile}'`);
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
    expect(workflowSource).not.toContain('--marker-max-age-hours');
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
    const applyPatchSource = read('src/ui/panels/welcomePanelChatBrainApplyPatch.ts');
    const combinedApplyPatchSource = `${welcomePanelSource}\n${applyPatchSource}`;

    expect(combinedApplyPatchSource).toContain('lastUnknownScopeMutationBlocked');
    expect(combinedApplyPatchSource).toContain('lastScopeKnown');
    expect(combinedApplyPatchSource).toContain(
      'if (conv?.lastUnknownScopeMutationBlocked || conv?.lastScopeKnown === false)'
    );
    expect(combinedApplyPatchSource).toContain('SCOPE_UNKNOWN_MUTATION_BLOCKED');
    expect(combinedApplyPatchSource).toContain('Patch apply blocked: impacted scope is unknown.');
  });

  it('keeps workspace memory policy profile contract exposed for local-processing mode', () => {
    const welcomePanelSource = read('src/ui/panels/welcomePanel.ts');
    const chatBrainExecuteSource = read('src/ui/panels/welcomePanelChatBrainExecuteAction.ts');
    const incidentEvidenceSource = read('src/ui/panels/welcomePanelIncidentEvidence.ts');
    const combinedIncidentHostSource = `${welcomePanelSource}\n${chatBrainExecuteSource}\n${incidentEvidenceSource}`;
    const memoryServiceSource = read('src/core/workspaceMemoryService.ts');
    const aiFreeFeaturesSource = read('src/commands/aiFreeFeatures.ts');
    const payloadSource = read('webview-ui/src/lib/incidentStudioPayload.ts');
    const reproPackSource = read('webview-ui/src/lib/incidentStudioReproPack.ts');

    expect(memoryServiceSource).toContain('WorkspaceMemoryPolicyProfile');
    expect(memoryServiceSource).toContain('WorkspaceMemoryWriteAccessContract');
    expect(memoryServiceSource).toContain('validateWriteAccessContract');
    expect(memoryServiceSource).toContain('resolvePolicy(memory?: WorkspaceMemory)');
    expect(memoryServiceSource).toContain('Memory policy:');

    expect(aiFreeFeaturesSource).toContain("operation: 'workspace-memory-wizard'");
    expect(aiFreeFeaturesSource).toContain("mode: 'user-initiated'");

    expect(payloadSource).toContain('asWorkspaceMemoryPolicyProfile');
    expect(payloadSource).toContain('deriveLocalProcessingMode');
    expect(payloadSource).toContain('policyProfile');
    expect(payloadSource).toContain('sensitivity');
    expect(payloadSource).toContain('localProcessingMode');
    expect(payloadSource).toContain('memoryInfluenceAuditTimeline');

    expect(combinedIncidentHostSource).toContain('buildMemoryInfluenceAuditTimeline');
    expect(combinedIncidentHostSource).toContain('memoryInfluenceAuditTimeline');
    expect(incidentEvidenceSource).toContain('memoryEventId');
    expect(incidentEvidenceSource).toContain('policyProfile: memoryPolicy.policyProfile');
    expect(incidentEvidenceSource).toContain('sensitivity: memoryPolicy.sensitivity');
    expect(incidentEvidenceSource).toContain(
      'localProcessingMode: memoryPolicy.localProcessingMode'
    );

    expect(reproPackSource).toContain('MEMORY_INFLUENCE_TIMELINE_HEADING');
    expect(payloadSource).toContain('decisionArtifacts');
  });

  it('keeps workspace memory writes restricted to approved contract-gated routes', () => {
    const aiFreeFeaturesSource = read('src/commands/aiFreeFeatures.ts');
    const welcomePanelSource = read('src/ui/panels/welcomePanel.ts');
    const incidentMemoryBridgeSource = read('src/ui/panels/welcomePanelIncidentMemoryBridge.ts');
    const workspaceMemoryServiceSource = read('src/core/workspaceMemoryService.ts');
    const combinedSource = `${aiFreeFeaturesSource}\n${welcomePanelSource}\n${incidentMemoryBridgeSource}`;

    const writeCallMatches = combinedSource.match(/memoryService\.write\(/g) || [];
    expect(writeCallMatches.length).toBe(2);

    expect(aiFreeFeaturesSource).toContain("operation: 'workspace-memory-wizard'");
    expect(aiFreeFeaturesSource).toContain("mode: 'user-initiated'");
    expect(aiFreeFeaturesSource).toContain('approvedByUser: true');

    expect(incidentMemoryBridgeSource).toContain("operation: 'incident-replay-learning'");
    expect(incidentMemoryBridgeSource).toContain("mode: 'system-enrichment'");
    expect(incidentMemoryBridgeSource).toContain('approvedByUser: false');

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
    expect(lifecycleSource).toContain("['dev', '--port', String(input.port)]");
    expect(lifecycleSource).toContain(": [['dev']]");

    expect(lifecycleSource).toContain('isFrontendScaffoldFramework');
    expect(lifecycleSource).toContain('PORT: String(input.port)');

    expect(lifecycleSource).not.toContain("commands: ['npm run start:dev']");
    expect(lifecycleSource).not.toContain('PORT=${port} npm run start:dev');
    expect(lifecycleSource).not.toContain('PORT=${port} npx rapidkit dev');
    expect(lifecycleSource).not.toContain('PORT=$PORT npx rapidkit dev');
    expect(lifecycleSource).not.toContain('npx rapidkit init && npx rapidkit dev');
    expect(lifecycleSource).toContain('gateProjectLifecycleCommand');
    expect(read('src/core/projectCapabilityContext.ts')).toContain('workspai:projectSupportsInit');
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
    expect(operationsSource).toContain(
      "commands: appendWorkspaceCommandRefresh('cacheClear', [['cache', 'clear']])"
    );
    expect(operationsSource).toContain(
      "commands: appendWorkspaceCommandRefresh('cachePrune', [['cache', 'prune']])"
    );
    expect(operationsSource).toContain(
      "commands: appendWorkspaceCommandRefresh('cacheRepair', [['cache', 'repair']])"
    );

    expect(operationsSource).toContain("commands: [['mirror', 'status']]");
    expect(operationsSource).toContain(
      "commands: appendWorkspaceCommandRefresh('mirrorSync', [['mirror', 'sync']])"
    );
    expect(operationsSource).toContain(
      "commands: appendWorkspaceCommandRefresh('mirrorVerify', [['mirror', 'verify']])"
    );
    expect(operationsSource).toContain(
      "commands: appendWorkspaceCommandRefresh('mirrorRotate', [['mirror', 'rotate']])"
    );

    expect(operationsSource).toContain("commands: [['doctor', 'workspace']]");
    expect(operationsSource).toContain("commands: [['doctor', 'workspace', '--fix']]");
    expect(operationsSource).toContain("commands: [['readiness', '--json']]");

    // The Governance Gate (roadmap 2.6) runs `pipeline --json --strict` through the
    // streaming runner rather than a terminal, so its args contract lives here.
    const governanceGateSource = read('src/core/governanceGate.ts');
    expect(governanceGateSource).toContain("command: ['pipeline', '--json', '--strict']");

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
      'webview-ui/src/lib/commandCheatsheet.ts',
      'webview-ui/src/sidebar/SecondarySidebar.tsx',
    ];
    const combined = userFacingSources.map((file) => read(file)).join('\n');

    expect(combined).not.toContain('npx --yes --package rapidkit rapidkit');
    expect(read('src/utils/platformCapabilities.ts')).toContain('buildNpxRapidkitPrefix');
    expect(read('src/utils/platformCapabilities.ts')).toContain(
      "return ['--yes', '--package', packageSpecifier, WORKSPAI_NPM_BINARY]"
    );
    expect(read('src/core/incidentInlineCommandRunner.ts')).toContain(
      'toPinnedRapidkitExecutionCommand(commandBody)'
    );
    expect(read('src/ui/panels/welcomePanelIncidentStudioMessages.ts')).toContain(
      'dispatchIncidentStudioInlineCommand'
    );
    expect(combined).not.toContain('rapidkit doctor --scope=workspace');
    expect(combined).not.toContain('rapidkit doctor verify --scope=');
  });

  it('keeps context assist stop-generation contract dormant outside the dashboard shell', () => {
    const appSource = read('webview-ui/src/App.tsx');
    const welcomePanelSource = read('src/ui/panels/welcomePanel.ts');
    const webviewMessageDispatchSource = read(
      'src/ui/panels/welcomePanelWebviewMessageDispatch.ts'
    );
    const routingSource = `${welcomePanelSource}\n${webviewMessageDispatchSource}`;
    const aiModalQuerySource = read('src/ui/panels/welcomePanelAiModalQuery.ts');
    const aiModalMessagesSource = read('src/ui/panels/welcomePanelAiModalMessages.ts');
    const webviewMessagingSource = read('src/ui/panels/welcomePanelWebviewMessaging.ts');
    const aiModalSource = `${welcomePanelSource}\n${aiModalQuerySource}\n${aiModalMessagesSource}\n${webviewMessagingSource}`;

    expect(appSource).not.toContain("vscode.postMessage('aiCancelQuery'");
    expect(appSource).not.toContain("case 'aiContextContract':");
    expect(appSource).not.toContain("case 'aiChunkUpdate':");
    expect(appSource).not.toContain("case 'aiStreamDone':");
    expect(appSource).not.toContain('contextContract={aiContextContract}');
    expect(appSource).not.toContain('onCancel={handleAICancelQuery}');
    expect(appSource).not.toContain('<ContextAssistPanel');
    expect(appSource).not.toContain('import { ContextAssistPanel }');
    expect(
      fs.existsSync(path.join(repoRoot, 'webview-ui/src/components/ContextAssistPanel.tsx'))
    ).toBe(false);

    expect(routingSource).toContain('isAiModalWebviewCommand(');
    expect(aiModalMessagesSource).toContain("case 'aiCancelQuery':");
    expect(aiModalMessagesSource).toContain('getAiQueryTokenSource()');
    expect(aiModalMessagesSource).toContain('tokenSource?.cancel()');
    expect(aiModalSource).toContain('requestId: queryRequestId');
    expect(welcomePanelSource).toContain('postWelcomePanelAIStreamDoneOnce');
    expect(webviewMessagingSource).toContain("'aiStreamDone'");
  });

  it('keeps extension-host webview output routed through the shared protocol helper', () => {
    const sourceFiles = collectProjectFiles(repoRoot).filter(
      (file) => file.startsWith('src/') && file.endsWith('.ts') && !file.startsWith('src/test/')
    );

    const directObjectPosts: string[] = [];
    const directObjectPostRegex = /(?:\w+\.)?webview\.postMessage\(\s*{/;

    for (const relPath of sourceFiles) {
      const source = read(relPath);
      if (directObjectPostRegex.test(source)) {
        directObjectPosts.push(relPath);
      }
    }

    if (directObjectPosts.length > 0) {
      throw new Error(
        `Direct extension-host webview.postMessage object payloads must use createExtensionWebviewMessage/_postWebviewMessage:\n${directObjectPosts.join(
          '\n'
        )}`
      );
    }

    expect(read('src/ui/panels/welcomePanel.ts')).toContain('_postWebviewMessage');
    expect(read('src/contracts/webviewProtocol.ts')).toContain('createExtensionWebviewMessage');
  });

  it('keeps legacy inline webviews protocol enveloped and normalized', () => {
    // templatePreviewPanel is the only remaining raw-HTML inline webview. The
    // sidebar (actionsWebviewProvider) was migrated to the React stack (roadmap
    // 2.11) and is now covered by the React outbound-wrapper guard below.
    const source = read('src/ui/panels/templatePreviewPanel.ts');

    expect(source).toContain('normalizeWebviewMessage(rawMessage)');
    expect(source).not.toMatch(/\bvscode\.postMessage\(\s*{/);
    expect(source).toContain('command,');
    expect(source).toContain('data: {},');
    expect(source).toContain('version: 1');
    expect(source).toContain("source: 'template-preview-webview'");
  });

  it('keeps the React sidebar provider on the enveloped, normalized protocol', () => {
    const source = read('src/ui/webviews/actionsWebviewProvider.ts');
    const dispatcherSource = read('src/ui/webviews/actionsWebviewMessageDispatcher.ts');

    // Inbound messages are normalized; outbound goes through the shared envelope.
    expect(source).toContain('dispatchActionsWebviewMessage');
    expect(dispatcherSource).toContain('normalizeWebviewMessage(rawMessage)');
    expect(source).toContain('createExtensionWebviewMessage(command, data');
    expect(source).not.toMatch(/\bvscode\.postMessage\(\s*{/);
    expect(source).toContain("source: 'workspai-secondary-sidebar'");
  });

  it('keeps React webview outbound messages behind the shared vscode wrapper', () => {
    const sourceFiles = collectProjectFiles(path.join(repoRoot, 'webview-ui/src')).filter(
      (file) => (file.endsWith('.ts') || file.endsWith('.tsx')) && file !== 'vscode.ts'
    );

    const directApiUsers: string[] = [];
    const rawObjectPosts: string[] = [];
    const rawObjectPostRegex = /\bvscode\.postMessage\(\s*{/;

    for (const relPath of sourceFiles) {
      const repoRelPath = `webview-ui/src/${relPath}`;
      const source = read(repoRelPath);

      if (source.includes('acquireVsCodeApi')) {
        directApiUsers.push(repoRelPath);
      }

      if (rawObjectPostRegex.test(source)) {
        rawObjectPosts.push(repoRelPath);
      }
    }

    if (directApiUsers.length > 0 || rawObjectPosts.length > 0) {
      throw new Error(
        [
          'React webview outbound messages must use webview-ui/src/vscode.ts.',
          directApiUsers.length > 0
            ? `Direct acquireVsCodeApi users:\n${directApiUsers.join('\n')}`
            : '',
          rawObjectPosts.length > 0
            ? `Raw vscode.postMessage object payloads:\n${rawObjectPosts.join('\n')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n\n')
      );
    }

    const wrapperSource = read('webview-ui/src/vscode.ts');
    expect(wrapperSource).toContain('createWebviewMessage(command, data, meta)');
    expect(wrapperSource).toContain('postProtocolMessage(message: WebviewToExtensionMessage)');
  });

  it('keeps Studio action registry sourced from the shared contract', () => {
    const hostBridgeSource = read('src/core/studioActionCommands.ts');
    const webviewBridgeSource = read(
      'webview-ui/src/components/StudioRedesign/state/studioActions.ts'
    );
    const contractSource = read('src/contracts/studioActionSurface.ts');
    const contractJson = read('src/contracts/studio-action-surface.v1.json');

    expect(hostBridgeSource).toContain("from '../contracts/studioActionSurface'");
    expect(webviewBridgeSource).toContain(
      "from '../../../../../src/contracts/studioActionSurface'"
    );
    expect(hostBridgeSource).not.toContain('STUDIO_ACTION_REGISTRY: readonly');
    expect(webviewBridgeSource).not.toContain('STUDIO_ACTION_REGISTRY: readonly');
    expect(hostBridgeSource).not.toContain('Hydrate evidence, health, gates');
    expect(webviewBridgeSource).not.toContain('Hydrate evidence, health, gates');
    expect(contractSource).toContain(
      "import surfaceContract from './studio-action-surface.v1.json'"
    );
    expect(contractJson).toContain('"schemaVersion": "workspai-studio-action-surface-v1"');
  });

  it('keeps AI action operations sourced from the shared operation contract', () => {
    const aiActionContractSource = read('src/core/aiActionContract.ts');
    const aiActionCommandPolicySource = read('src/core/aiActionCommandPolicy.ts');
    const aiActionGateSource = read('webview-ui/src/lib/incidentStudioAIActionGate.ts');
    const welcomeSource = read('src/ui/panels/welcomePanel.ts');
    const dashboardStudioSource = read('src/ui/panels/welcomePanelDashboardStudio.ts');
    const combinedStudioHostSource = `${welcomeSource}\n${dashboardStudioSource}`;
    const operationContractSource = read('src/contracts/aiActionOperationSurface.ts');
    const operationContractJson = read('src/contracts/ai-action-operation-surface.v1.json');

    expect(aiActionContractSource).toContain(
      "import type { AIActionOperation } from '../contracts/aiActionOperationSurface'"
    );
    expect(aiActionCommandPolicySource).toContain(
      "import type { AIActionOperation as AIActionCommandOperation } from '../contracts/aiActionOperationSurface'"
    );
    expect(aiActionGateSource).toContain(
      "import type { AIActionOperation as StudioAIActionOperation } from '../../../src/contracts/aiActionOperationSurface'"
    );
    expect(aiActionContractSource).not.toContain(
      "export type AIActionOperation = 'apply' | 'verify' | 'rollback'"
    );
    expect(aiActionCommandPolicySource).not.toContain(
      "export type AIActionCommandOperation = 'apply' | 'verify' | 'rollback'"
    );
    expect(aiActionGateSource).not.toContain(
      "export type StudioAIActionOperation = 'apply' | 'verify' | 'rollback'"
    );
    expect(combinedStudioHostSource).toContain('normalizeAIActionCommandPayload(data)');
    expect(combinedStudioHostSource).not.toContain('data as any');
    expect(combinedStudioHostSource).not.toContain('(data as any)');
    expect(combinedStudioHostSource).toContain('const payload = asRecord(data) ?? {};');
    expect(combinedStudioHostSource).toContain("readStringField(payload, 'actionId')");
    expect(combinedStudioHostSource).toContain("readStringField(payload, 'message')");
    expect(operationContractSource).toContain('normalizeAIActionCommandPayload');
    expect(operationContractJson).toContain(
      '"schemaVersion": "workspai-ai-action-operation-surface-v1"'
    );
  });

  it('keeps AI action executions proof-backed', () => {
    const registrySource = read('src/core/aiActionRegistry.ts');
    const bridgeSource = read('src/ui/panels/incidentStudioAIActionBridge.ts');
    const payloadSource = read('webview-ui/src/lib/incidentStudioPayload.ts');

    expect(registrySource).toContain('workspai.ai-action-proof-summary.v1');
    expect(registrySource).toContain('buildAIActionExecutionProofSummary');
    expect(registrySource).toContain('execution.proof ||');
    expect(bridgeSource).toContain('buildAIActionExecutionProofSummary');
    expect(bridgeSource).toContain('proof: buildAIActionExecutionProofSummary');
    expect(bridgeSource).toContain('redactionApplied: true');
    expect(payloadSource).toContain('normalizeAIActionProofSummary(record.proof)');
    expect(payloadSource).toContain('normalizeStudioProofEvent(record.proofEvent)');
    expect(payloadSource).toContain("schemaVersion !== 'workspai.ai-action-proof-summary.v1'");
  });

  it('keeps AI modal clarification gate ahead of model streaming', () => {
    const welcomePanelSource = read('src/ui/panels/welcomePanel.ts');
    const webviewMessageDispatchSource = read(
      'src/ui/panels/welcomePanelWebviewMessageDispatch.ts'
    );
    const routingSource = `${welcomePanelSource}\n${webviewMessageDispatchSource}`;
    const aiModalQuerySource = read('src/ui/panels/welcomePanelAiModalQuery.ts');
    const aiModalMessagesSource = read('src/ui/panels/welcomePanelAiModalMessages.ts');
    const webviewMessagingSource = read('src/ui/panels/welcomePanelWebviewMessaging.ts');
    const chatBrainQuerySource = read('src/ui/panels/welcomePanelChatBrainQuery.ts');
    const aiModalSource = `${welcomePanelSource}\n${aiModalQuerySource}\n${aiModalMessagesSource}\n${webviewMessagingSource}`;

    expect(aiModalSource).toContain('prepared.validation.clarificationNeeded');
    expect(aiModalSource).toContain("trackAIModalOutcome('clarification-needed'");
    expect(aiModalSource).toContain("'workspai.aimodal.clarification_gate'");
    expect(aiModalSource).toContain("postWebviewMessage('aiChunkUpdate'");
    expect(welcomePanelSource).toContain('postWelcomePanelAIStreamDoneOnce');
    expect(webviewMessagingSource).toContain("'aiStreamDone'");
    expect(routingSource).toContain('tryDispatchAiModalWebviewMessage');

    const clarificationIdx = aiModalSource.indexOf('prepared.validation.clarificationNeeded');
    const streamStageIdx = aiModalSource.indexOf("currentStage = 'stream';", clarificationIdx);
    const streamIdx = aiModalSource.indexOf('await streamAIResponse(', clarificationIdx);
    const returnIdx = aiModalSource.indexOf('return;', clarificationIdx);

    expect(clarificationIdx).toBeGreaterThan(-1);
    expect(streamStageIdx).toBeGreaterThan(-1);
    expect(streamIdx).toBeGreaterThan(-1);
    expect(returnIdx).toBeGreaterThan(clarificationIdx);
    expect(returnIdx).toBeLessThan(streamStageIdx);
    expect(returnIdx).toBeLessThan(streamIdx);
    expect(clarificationIdx).toBeLessThan(streamIdx);

    const chatBrainSuggestedQuestionsSource = read(
      'src/ui/panels/welcomePanelChatBrainSuggestedQuestions.ts'
    );
    const chatBrainPanelSource = `${welcomePanelSource}\n${chatBrainSuggestedQuestionsSource}`;

    expect(chatBrainQuerySource).toContain('prepared.validation.clarificationNeeded');
    expect(chatBrainQuerySource).toContain("title: 'Next Safe Action'");
    expect(chatBrainQuerySource).toContain('Generate verification evidence');
    expect(chatBrainSuggestedQuestionsSource).toContain('getChatBrainPrimaryActionLabel');
    expect(chatBrainPanelSource).toContain('getChatBrainPrimaryActionLabel');
    expect(welcomePanelSource).toContain('handleAiChatQuery');

    const chatClarificationIdx = chatBrainQuerySource.indexOf(
      'prepared.validation.clarificationNeeded'
    );
    const chatStreamIdx = chatBrainQuerySource.indexOf(
      'await streamAIResponse(',
      chatClarificationIdx
    );
    const chatReturnIdx = chatBrainQuerySource.indexOf('return;', chatClarificationIdx);

    expect(chatClarificationIdx).toBeGreaterThan(-1);
    expect(chatStreamIdx).toBeGreaterThan(-1);
    expect(chatReturnIdx).toBeGreaterThan(chatClarificationIdx);
    expect(chatReturnIdx).toBeLessThan(chatStreamIdx);
  });

  it('keeps incident telemetry request fail-safe fallback to null payload', () => {
    const welcomePanelSource = read('src/ui/panels/welcomePanel.ts');
    const incidentStudioMessagesSource = read(
      'src/ui/panels/welcomePanelIncidentStudioMessages.ts'
    );
    const combinedIncidentStudioSource = `${welcomePanelSource}\n${incidentStudioMessagesSource}`;
    const telemetryBridgeSource = read('src/ui/panels/incidentStudioTelemetryBridge.ts');

    expect(welcomePanelSource).toContain('tryDispatchIncidentStudioWebviewMessage(');
    expect(combinedIncidentStudioSource).toContain("case 'requestIncidentStudioTelemetry':");
    expect(combinedIncidentStudioSource).toContain('postIncidentStudioTelemetry');
    expect(telemetryBridgeSource).toContain(
      "console.warn('[IncidentStudio] telemetry refresh failed:'"
    );
    expect(telemetryBridgeSource).toContain(
      "createExtensionWebviewMessage('incidentStudioTelemetry', null)"
    );
  });
});

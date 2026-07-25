import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Workspai design system drift', () => {
  const repoRoot = path.resolve(__dirname, '../..');

  function collectFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return collectFiles(entryPath);
      }
      return /\.(css|md|ts|tsx)$/.test(entry.name) ? [entryPath] : [];
    });
  }

  function countMatches(source: string, pattern: RegExp): number {
    return source.match(pattern)?.length ?? 0;
  }

  it('loads the shared token spine before product surfaces', () => {
    const indexSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/index.tsx'), 'utf8');
    const appSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/App.tsx'), 'utf8');
    const sidebarIndexSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/sidebar/index.tsx'),
      'utf8'
    );
    const sidebarAppSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/sidebar/SidebarApp.tsx'),
      'utf8'
    );
    const actionsProviderSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/webviews/actionsWebviewProvider.ts'),
      'utf8'
    );

    expect(indexSource).toContain("import '@/styles/workspai-tokens.css';");
    expect(indexSource.indexOf("import '@/styles/workspai-tokens.css';")).toBeLessThan(
      indexSource.indexOf("import '@/styles-tailwind.css';")
    );
    expect(indexSource.indexOf("import '@/styles-tailwind.css';")).toBeLessThan(
      indexSource.indexOf("import '@/styles/workspai-primitives.css';")
    );

    expect(appSource).toContain(
      "import { WorkspaiThemeProvider } from '@/components/WorkspaiThemeProvider';"
    );
    expect(appSource).toContain('<WorkspaiThemeProvider themeMode={themeMode}>');

    expect(sidebarIndexSource).toContain("import '@/styles/workspai-tokens.css';");
    expect(sidebarIndexSource).toContain("import '@/styles/workspai-primitives.css';");
    expect(sidebarAppSource).toContain(
      "import { WorkspaiThemeProvider } from '@/components/WorkspaiThemeProvider';"
    );
    expect(sidebarAppSource).toContain('<WorkspaiThemeProvider themeMode={themeMode}>');
    expect(sidebarAppSource).toContain("command === 'sidebarThemeSettings'");
    expect(sidebarAppSource).toContain('normalizeThemeMode(data.themeMode)');
    expect(actionsProviderSource).toContain("this._postInlineCreate('sidebarThemeSettings'");
    expect(actionsProviderSource).toContain('themeMode: settings.themeMode');
  });

  it('keeps theme detection centralized and VS Code sourced', () => {
    const providerSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/WorkspaiThemeProvider.tsx'),
      'utf8'
    );

    expect(providerSource).toContain('detectVSCodeThemeKind');
    expect(providerSource).toContain('data-workspai-theme-kind');
    expect(providerSource).toContain('data-workspai-theme-source');
    expect(providerSource).toContain("'vscode'");
    expect(providerSource).toContain("'override'");
    expect(providerSource).toContain('resolveWorkspaiThemeOverrideStyle');
    expect(providerSource).toContain('MutationObserver');
    expect(providerSource).toContain('document.documentElement');
    expect(providerSource).toContain('document.body');
  });

  it('keeps Studio sidebar UI on the shared theme provider without local override controls', () => {
    const sidebarSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/sidebar/SecondarySidebar.tsx'),
      'utf8'
    );
    const settingsSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/WorkspaiSettingsPanel.tsx'),
      'utf8'
    );

    expect(sidebarSource).not.toContain('saveThemePreference');
    expect(sidebarSource).not.toContain('onThemeModeChange');
    expect(sidebarSource).not.toContain('Force light theme');
    expect(sidebarSource).not.toContain('Force dark theme');
    expect(settingsSource).toContain('Appearance');
    expect(settingsSource).toContain('Auto — follow VS Code theme');
  });

  it('defines the minimum semantic token contract', () => {
    const tokenSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/styles/workspai-tokens.css'),
      'utf8'
    );
    const contractSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/styles/DESIGN_SYSTEM.md'),
      'utf8'
    );

    for (const token of [
      '--ws-surface',
      '--ws-surface-raised',
      '--ws-surface-input',
      '--ws-text',
      '--ws-text-muted',
      '--ws-border',
      '--ws-focus',
      '--ws-accent',
      '--ws-primary',
      '--ws-success',
      '--ws-warn',
      '--ws-error',
    ]) {
      expect(tokenSource).toContain(token);
      expect(contractSource).toContain(token);
    }

    expect(contractSource).toContain('Product UI follows the active VS Code theme automatically.');
    expect(contractSource).toContain(
      'New standalone webview entries must import `workspai-tokens.css`'
    );
  });

  it('documents the shipped secondary-sidebar Studio path instead of stale dashboard Studio', () => {
    const contractSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/styles/DESIGN_SYSTEM.md'),
      'utf8'
    );

    expect(contractSource).toContain('Workspai Studio (Secondary Sidebar)');
    expect(contractSource).toContain('SecondarySidebar');
    expect(contractSource).toContain('StudioBlockerChrome');
    expect(contractSource).toContain('StudioPatchReview');
    expect(contractSource).toContain('StudioShipLoopStepper');
    expect(contractSource).toContain('Historical Studio Assets');
    expect(contractSource).not.toContain('Production path: `IncidentStudioVNext`');
    expect(contractSource).not.toContain('ActionOutcomePanel` in `ChatSurface');
  });

  it('defines canonical ws-* primitives and legacy migration aliases', () => {
    const primitivesSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/styles/workspai-primitives.css'),
      'utf8'
    );
    const contractSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/styles/DESIGN_SYSTEM.md'),
      'utf8'
    );

    for (const selector of [
      '.ws-btn',
      '.ws-btn--primary',
      '.ws-card',
      '.ws-chip',
      '.ws-field',
      '.ws-empty',
      '.ws-kicker',
      '.ws-embedded-host',
      '.ws-setup-shell',
    ]) {
      expect(primitivesSource).toContain(selector);
      expect(contractSource).toContain(selector.replace('.', ''));
    }

    for (const alias of ['.spc-btn', '.spc-panel-card', '.modal-field', '.workspai-empty-state']) {
      expect(primitivesSource).toContain(alias);
    }

    expect(primitivesSource).toContain('var(--ws-accent)');
    expect(primitivesSource).not.toMatch(/linear-gradient\(\s*135deg,\s*#/);
  });

  it('keeps legacy dashboard-* and spc-* prefixes on a shrinking migration budget', () => {
    const webviewFiles = collectFiles(path.join(repoRoot, 'webview-ui/src'));
    const designSystem = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/styles/DESIGN_SYSTEM.md'),
      'utf8'
    );

    const budgets = [
      {
        label: 'legacy dashboard-*',
        pattern: /(?<!ws-)dashboard-/g,
        maxOccurrences: 104,
        maxFiles: 19,
      },
      { label: 'spc-*', pattern: /spc-/g, maxOccurrences: 294, maxFiles: 3 },
    ];

    for (const budget of budgets) {
      const productFiles = webviewFiles.filter(
        (filePath) => !filePath.endsWith('DESIGN_SYSTEM.md')
      );
      const matchingFiles = productFiles.filter(
        (filePath) => countMatches(fs.readFileSync(filePath, 'utf8'), budget.pattern) > 0
      );
      const occurrences = matchingFiles.reduce(
        (total, filePath) =>
          total + countMatches(fs.readFileSync(filePath, 'utf8'), budget.pattern),
        0
      );

      expect(occurrences, `${budget.label} occurrence budget`).toBeLessThanOrEqual(
        budget.maxOccurrences
      );
      expect(matchingFiles.length, `${budget.label} file budget`).toBeLessThanOrEqual(
        budget.maxFiles
      );
      expect(designSystem).toContain(
        `| ${budget.label.startsWith('legacy') ? `legacy \`dashboard-*\`` : `\`spc-*\``} | ${budget.maxOccurrences} occurrences across ${budget.maxFiles} product source files |`
      );
    }
  });

  it('uses the unified embedded host for setup and settings while Studio routes to Workspai', () => {
    const appSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/App.tsx'), 'utf8');

    expect(appSource).toContain('className="ws-embedded-host ws-embedded-host--full"');
    expect(appSource).toContain("vscode.postMessage('openStudioSidebarTab'");
    expect(appSource).not.toContain('setup-embedded-host');
    expect(appSource).not.toContain('studio-embedded-host');
  });

  it('migrates settings and dashboard chrome to ws-* primitives', () => {
    const settingsSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/WorkspaiSettingsPanel.tsx'),
      'utf8'
    );
    const railSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/DashboardNextStepRail.tsx'),
      'utf8'
    );
    const primitivesSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/styles/workspai-primitives.css'),
      'utf8'
    );

    expect(settingsSource).toContain('ws-settings-shell');
    expect(settingsSource).toContain('ws-card ws-settings-card');
    expect(settingsSource).toContain('ws-field');
    expect(settingsSource).toContain('ws-btn');
    expect(settingsSource).not.toContain('workspai-settings-card');
    expect(settingsSource).not.toContain('workspai-settings-secondary-btn');

    expect(railSource).toContain('ws-kicker ws-dashboard-next-step-rail__meta');
    expect(railSource).toContain('ws-chip ws-chip--muted');

    expect(primitivesSource).toContain('.ws-settings-shell');
    expect(primitivesSource).toContain('.ws-dashboard-next-step-rail');
  });

  it('migrates overview and evidence panels to ws-* primitives', () => {
    const overviewSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/WorkspaceOverview.tsx'),
      'utf8'
    );
    const evidenceSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/DashboardEvidenceSection.tsx'),
      'utf8'
    );
    const outcomeSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/EvidenceOutcomePanel.tsx'),
      'utf8'
    );
    const activitySource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/CommandActivityPanel.tsx'),
      'utf8'
    );
    const primitivesSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/styles/workspai-primitives.css'),
      'utf8'
    );

    expect(overviewSource).toContain('ws-overview-shell');
    expect(overviewSource).toContain('ws-metric');
    expect(overviewSource).toContain('workspace-metric--interactive');

    expect(evidenceSource).toContain('ws-btn ws-btn--primary');
    expect(evidenceSource).not.toContain('workspai-empty-state__action');

    expect(outcomeSource).toContain('ws-btn ws-btn--primary');
    expect(outcomeSource).toContain('ws-chip ws-chip--');
    expect(outcomeSource).not.toContain('evidence-outcome-panel__action--primary');
    expect(outcomeSource).not.toMatch(/className="evidence-outcome-panel__action"/);

    expect(activitySource).toContain('ws-btn ws-btn--ghost');
    expect(activitySource).toContain('ws-kicker');
    expect(activitySource).not.toContain('command-activity-panel__badge');

    expect(primitivesSource).toContain('.ws-onboarding-shell');
    expect(primitivesSource).toContain('.ws-overview-shell');
    expect(primitivesSource).toContain('.ws-metric');
    expect(primitivesSource).toContain('.command-activity-panel');
    expect(primitivesSource).toContain('.evidence-outcome-panel');
  });

  it('migrates operate, catalog, workspaces, and console surfaces to ws-* primitives', () => {
    const operateSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/DashboardOperateSection.tsx'),
      'utf8'
    );
    const opsChainSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/OpsChainBanner.tsx'),
      'utf8'
    );
    const moduleBrowserSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/ModuleBrowser.tsx'),
      'utf8'
    );
    const exampleSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/ExampleWorkspaces.tsx'),
      'utf8'
    );
    const recentSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/RecentWorkspaces.tsx'),
      'utf8'
    );
    const actionTileSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/ActionTile.tsx'),
      'utf8'
    );
    const flowSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/EnterpriseDashboardFlow.tsx'),
      'utf8'
    );
    const appSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/App.tsx'), 'utf8');
    const primitivesSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/styles/workspai-primitives.css'),
      'utf8'
    );

    expect(operateSource).toContain('ws-btn ws-btn--primary');
    expect(operateSource).not.toContain('workspai-empty-state__action');

    expect(opsChainSource).toContain('ws-btn ws-btn--ghost');
    expect(opsChainSource).toContain('ws-chip ws-chip--');
    expect(opsChainSource).not.toMatch(/className="ops-chain-banner__dismiss"/);

    expect(moduleBrowserSource).toContain('ws-btn ws-btn--primary module-install-btn');
    expect(moduleBrowserSource).toContain('ws-chip');
    expect(moduleBrowserSource).toContain("'is-active'");
    expect(moduleBrowserSource).not.toContain('workspai-empty-state__action');

    expect(exampleSource).toContain('ws-card example-card');
    expect(exampleSource).toContain('ws-btn--primary');
    expect(exampleSource).toContain("'is-active'");

    expect(recentSource).toContain('ws-btn ws-btn--ghost ws-btn--icon refresh-btn');
    expect(recentSource).toContain('ws-show-more-btn');

    expect(actionTileSource).toContain('ws-action-tile');
    expect(actionTileSource).toContain('ws-chip ws-chip--');

    expect(flowSource).toContain('ws-kicker enterprise-flow-kicker');
    expect(flowSource).toContain('dashboard-operate-quick');

    expect(appSource).toMatch(/dashboardSection === 'console'[\s\S]*ws-btn ws-btn--primary/);

    expect(primitivesSource).toContain('.ops-chain-banner');
    expect(primitivesSource).toContain('.ws-action-tile');
    expect(primitivesSource).toContain('.module-browser .module-card');
    expect(primitivesSource).toContain('.example-card.ws-card');
  });

  it('migrates create and module modal actions to ws-* primitives', () => {
    const modalSurfaces = [
      'webview-ui/src/components/CreateProjectModal.tsx',
      'webview-ui/src/components/CreateWorkspaceModal.tsx',
      'webview-ui/src/components/ImportAdoptOptionsModal.tsx',
      'webview-ui/src/components/InstallModuleModal.tsx',
      'webview-ui/src/components/ModuleDetailsModal.tsx',
      'webview-ui/src/components/WorkspaiBanner.tsx',
    ];

    for (const relativePath of modalSurfaces) {
      const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
      expect(source, relativePath).toContain('ws-');
      expect(source, relativePath).not.toContain('enterprise-button');
      expect(source, relativePath).not.toMatch(/className=(?:\{`|")modal-chip(?:\s|["`{])/);
    }

    const installModuleSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/InstallModuleModal.tsx'),
      'utf8'
    );
    const moduleDetailsSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/ModuleDetailsModal.tsx'),
      'utf8'
    );

    expect(installModuleSource).toContain('ws-btn ws-btn--primary');
    expect(installModuleSource).toContain('ws-chip ws-chip--warn');
    expect(moduleDetailsSource).toContain('ws-chip--muted');
    expect(moduleDetailsSource).toContain('ws-chip--warn');
  });

  it('guards compact dashboard and sidebar chrome against long evidence text', () => {
    const dashboardSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/styles-tailwind.css'),
      'utf8'
    );
    const sidebarSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/sidebar/sidebar.css'),
      'utf8'
    );

    for (const selector of [
      '.ws-dashboard-sub-nav__tab',
      '.ws-dashboard-sub-nav__tab-content',
      '.ws-dashboard-sub-nav__label-group',
      '.repair-flow__active-main',
      '.repair-flow__active-meta',
      '.evidence-attention-inbox__item',
      '.evidence-attention-inbox__main',
      '.evidence-attention-inbox__copy',
      '.home-create-handoff__action',
      '.home-next-actions__item > span',
    ]) {
      const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(dashboardSource, selector).toMatch(
        new RegExp(`${escapedSelector}\\s*\\{[\\s\\S]*?min-width:\\s*0;`)
      );
    }

    for (const selector of [
      '.repair-flow__active-main',
      '.repair-flow__blocker-list li',
      '.evidence-attention-inbox__copy',
      '.evidence-attention-inbox__next',
      '.home-next-actions__item > span',
    ]) {
      const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(dashboardSource, selector).toMatch(
        new RegExp(`${escapedSelector}\\s*\\{[\\s\\S]*?overflow-wrap:\\s*anywhere;`)
      );
    }

    for (const selector of [
      '.ws-sidebar--secondary .ws-sidebar__tab-label',
      '.ws-sidebar__studio-patch-list code',
      '.ws-sidebar__studio-rollback code',
    ]) {
      const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(sidebarSource, selector).toMatch(
        new RegExp(`${escapedSelector}\\s*\\{[\\s\\S]*?overflow`)
      );
    }

    expect(sidebarSource).toMatch(
      /\.ws-sidebar--secondary\s*\{[\s\S]*?background:[\s\S]*?var\(--vscode-charts-blue/
    );
    expect(sidebarSource).toContain('#root > .workspai-theme-root');
    expect(sidebarSource).toMatch(
      /html,\s*body,\s*#root,\s*#root > \.workspai-theme-root\s*\{[\s\S]*?margin:\s*0;/
    );
    expect(sidebarSource).toMatch(
      /html,\s*body,\s*#root,\s*#root > \.workspai-theme-root\s*\{[\s\S]*?padding:\s*0;/
    );
    expect(sidebarSource).toMatch(
      /html,\s*body,\s*#root,\s*#root > \.workspai-theme-root\s*\{[\s\S]*?overflow:\s*hidden;/
    );
    expect(sidebarSource).toMatch(
      /\.ws-sidebar--secondary\s*\{[\s\S]*?border-left:\s*1px solid var\(--vscode-panel-border\);/
    );
    expect(sidebarSource).toMatch(
      /\.ws-sidebar--secondary\s*\{[\s\S]*?--ws-sidebar-edge-inset:\s*8px;/
    );
    expect(sidebarSource).toMatch(
      /\.ws-sidebar--secondary \.ws-composer-dock\s*\{[\s\S]*?margin:\s*8px var\(--ws-sidebar-edge-inset\) 10px;/
    );
    expect(sidebarSource).toMatch(
      /\.ws-sidebar--secondary \.ws-composer__input\s*\{[\s\S]*?padding:\s*4px 3px;/
    );
    expect(sidebarSource).toMatch(
      /\.ws-sidebar--secondary \.ws-sidebar__tabs\s*\{[\s\S]*?padding:\s*4px var\(--ws-sidebar-edge-inset\) 0;/
    );
    expect(sidebarSource).toMatch(
      /\.ws-sidebar--secondary \.ws-sidebar__tabpanel--chat \.ws-sidebar__stream\s*\{[\s\S]*?padding:\s*8px var\(--ws-sidebar-edge-inset\) 6px;/
    );
    expect(sidebarSource).toMatch(
      /\.ws-sidebar--secondary \.ws-session-bar\s*\{[\s\S]*?padding:\s*8px var\(--ws-sidebar-edge-inset\) 0;/
    );
  });

  it('keeps legacy context inquire off the dashboard shell', () => {
    const aiCreateSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/AICreateModal.tsx'),
      'utf8'
    );
    const assistLibSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/lib/contextAssist.ts'),
      'utf8'
    );
    const appSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/App.tsx'), 'utf8');
    const enterpriseModalSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/EnterpriseModal.tsx'),
      'utf8'
    );
    const primitivesSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/styles/workspai-primitives.css'),
      'utf8'
    );

    expect(aiCreateSource).toContain('<EnterpriseModal');
    expect(aiCreateSource).not.toContain('ai-create-backdrop');
    expect(aiCreateSource).toContain('kicker="Assist"');

    expect(
      fs.existsSync(path.join(repoRoot, 'webview-ui/src/components/ContextAssistPanel.tsx'))
    ).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, 'webview-ui/src/components/AIModal.tsx'))).toBe(false);

    expect(assistLibSource).toContain('getContextAssistQuickPrompts');

    expect(appSource).not.toContain('ContextAssistPanel');
    expect(appSource).not.toContain('ws-dashboard-shell--assist-open');
    expect(appSource).not.toContain('<AIModal');

    expect(enterpriseModalSource).toContain('headerActions?: ReactNode');

    expect(primitivesSource).toContain('.ws-assist-panel');
  });

  it('bridges Incident Studio tokens and layout to the ws-* spine', () => {
    const tokenSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/styles/themeSystem.ts'),
      'utf8'
    );
    const studioSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/styles/workspai-studio.css'),
      'utf8'
    );
    const indexSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/index.tsx'), 'utf8');

    expect(tokenSource).toContain('ThemeMode');
    expect(tokenSource).toContain('normalizeThemeMode');

    expect(studioSource).toContain('.studio-workspace-grid');
    expect(studioSource).toContain('.studio-pane-chat');
    expect(studioSource).toContain('.studio-tone-ok');
    expect(studioSource).toContain('[data-studio-viewport=');

    expect(indexSource).toContain("import '@/styles/workspai-studio.css'");
  });

  it('uses a single webview entry that always mounts App', () => {
    const indexSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/index.tsx'), 'utf8');
    const appSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/App.tsx'), 'utf8');
    const setupPanelSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/setupExperiencePanel.ts'),
      'utf8'
    );

    expect(indexSource).toContain('<App />');
    expect(indexSource).not.toContain('SetupExperience');
    expect(indexSource).not.toContain("view === 'setup'");

    expect(appSource).toContain('resolveInitialActiveView');
    expect(appSource).toContain("window.WORKSPAI_VIEW === 'setup'");
    expect(appSource).toContain('<SetupExperience embedded />');

    expect(setupPanelSource).not.toContain("window.WORKSPAI_VIEW = 'setup'");
    expect(setupPanelSource).toContain('WelcomePanel.openSetupTab');
  });

  it('blocks hardcoded hex and rgba in token-ready React surfaces', () => {
    const hexOrRgbaPattern = /#[0-9a-fA-F]{3,8}\b|rgba\s*\(/;
    const tokenReadySurfaces = [
      'webview-ui/src/App.tsx',
      'webview-ui/src/components/EnterpriseModal.tsx',
      'webview-ui/src/components/WorkspaiSettingsPanel.tsx',
      'webview-ui/src/components/DashboardNextStepRail.tsx',
      'webview-ui/src/components/WorkspaceOverview.tsx',
      'webview-ui/src/components/DashboardEvidenceSection.tsx',
      'webview-ui/src/components/EvidenceOutcomePanel.tsx',
      'webview-ui/src/components/CommandActivityPanel.tsx',
      'webview-ui/src/components/DashboardOperateSection.tsx',
      'webview-ui/src/components/OpsChainBanner.tsx',
      'webview-ui/src/components/ModuleBrowser.tsx',
      'webview-ui/src/components/ExampleWorkspaces.tsx',
      'webview-ui/src/components/RecentWorkspaces.tsx',
      'webview-ui/src/components/ActionTile.tsx',
      'webview-ui/src/components/EnterpriseDashboardFlow.tsx',
      'webview-ui/src/components/AICreateModal.tsx',
      'webview-ui/src/components/SetupExperience.tsx',
      'webview-ui/src/components/ModuleDetailsModal.tsx',
      'webview-ui/src/components/AnalyzeReportViewer.tsx',
      'webview-ui/src/sidebar/SecondarySidebar.tsx',
      'webview-ui/src/sidebar/ChatTab.tsx',
    ];

    for (const relativePath of tokenReadySurfaces) {
      const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
      expect(source, relativePath).not.toMatch(hexOrRgbaPattern);
    }

    expect(
      fs.existsSync(path.join(repoRoot, 'webview-ui/src/components/AIIncidentStudio.tsx'))
    ).toBe(false);
    expect(
      fs.existsSync(path.join(repoRoot, 'webview-ui/src/components/_legacy/AIIncidentStudio.tsx'))
    ).toBe(false);
  });

  it('defines stack brand tokens and keeps setup/create surfaces hex-free', () => {
    const tokenSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/styles/workspai-tokens.css'),
      'utf8'
    );
    const brandLibSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/lib/workspaiBrandTokens.ts'),
      'utf8'
    );
    const setupSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/SetupExperience.tsx'),
      'utf8'
    );
    const aiCreateSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/AICreateModal.tsx'),
      'utf8'
    );
    const hexOrRgbaPattern = /#[0-9a-fA-F]{3,8}\b|rgba\s*\(/;

    for (const token of [
      '--ws-brand-python',
      '--ws-brand-core',
      '--ws-brand-cli',
      '--ws-brand-dotnet',
      '--ws-brand-go',
    ]) {
      expect(tokenSource).toContain(token);
    }

    expect(brandLibSource).toContain('brandMonogramStyle');
    expect(brandLibSource).toContain("python: 'var(--ws-brand-python)'");

    expect(setupSource).toContain('wsBrand.python');
    expect(setupSource).toContain('brandMonogramStyle');
    expect(setupSource).not.toMatch(hexOrRgbaPattern);

    expect(aiCreateSource).not.toMatch(hexOrRgbaPattern);
  });

  it('loads studio chrome from static CSS instead of injected GlobalStyles', () => {
    const indexSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/index.tsx'), 'utf8');
    const globalStylesSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/styles/globalStyles.tsx'),
      'utf8'
    );
    const chromeCss = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/styles/workspai-studio-chrome.css'),
      'utf8'
    );

    expect(indexSource).toContain("import '@/styles/workspai-studio-chrome.css'");
    expect(globalStylesSource).toContain('() => null');
    expect(chromeCss).toContain('.studio-sidebar');
    expect(chromeCss).toContain('var(--ws-accent)');
    expect(chromeCss).not.toMatch(/\$\{/);
  });

  it('migrates module details toward token utilities', () => {
    const moduleDetailsSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/ModuleDetailsModal.tsx'),
      'utf8'
    );
    const hexOrRgbaPattern = /#[0-9a-fA-F]{3,8}\b|rgba\s*\(/;

    expect(moduleDetailsSource).toContain('text-[var(--ws-primary)]');
    expect(moduleDetailsSource).not.toMatch(hexOrRgbaPattern);
  });

  it('migrates analyze report viewer to token-only CSS', () => {
    const indexSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/index.tsx'), 'utf8');
    const analyzeSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/AnalyzeReportViewer.tsx'),
      'utf8'
    );
    const analyzeCss = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/styles/workspai-analyze-report.css'),
      'utf8'
    );
    const hexOrRgbaPattern = /#[0-9a-fA-F]{3,8}\b|rgba\s*\(/;

    expect(analyzeSource).toContain('ws-analyze-root');
    expect(analyzeSource).toContain('ws-btn ws-btn--primary');
    expect(analyzeSource).not.toMatch(hexOrRgbaPattern);

    expect(indexSource).toContain("import '@/styles/workspai-analyze-report.css'");

    expect(analyzeCss).toContain('var(--ws-success)');
    expect(analyzeCss).toContain('var(--ws-error)');
    expect(analyzeCss).not.toMatch(hexOrRgbaPattern);
  });

  it('keeps presentation contracts in lib tests isolated from removed full Studio UI', () => {
    const contractsTestSource = fs.readFileSync(
      path.join(repoRoot, 'src/test/incidentStudioPresentationContracts.test.ts'),
      'utf8'
    );
    const legacyStudioArchiveSource = fs.readFileSync(
      path.join(repoRoot, 'src/test/legacyStudioArchive.test.ts'),
      'utf8'
    );
    const minimalUxSource = fs.readFileSync(
      path.join(repoRoot, 'src/test/incidentStudioMinimalUx.test.ts'),
      'utf8'
    );

    expect(contractsTestSource).toContain('presentation contracts (lib parity)');
    expect(contractsTestSource).not.toContain('AIIncidentStudio');
    expect(contractsTestSource).not.toContain('incidentStudioLiteMode');
    expect(contractsTestSource).not.toContain('incidentStudioGuidedActions');
    expect(legacyStudioArchiveSource).toContain('archive removal');
    expect(minimalUxSource).toContain('sidebar/SecondarySidebar.tsx');
    expect(minimalUxSource).toContain('sidebar/index.tsx');
  });

  it('keeps StudioRedesign barrel free of removed full UI exports', () => {
    const indexSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/index.ts'),
      'utf8'
    );

    expect(indexSource).not.toContain('./styles/designTokens');
    expect(indexSource).not.toContain('./regions/');
    expect(indexSource).not.toContain('IncidentStudioVNext');
    expect(indexSource).toContain('./state/studioActions');
  });

  it('verifies studio chrome CSS artifact via CI script', () => {
    const chromeCss = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/styles/workspai-studio-chrome.css'),
      'utf8'
    );
    const globalStyles = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/styles/globalStyles.tsx'),
      'utf8'
    );

    expect(chromeCss.length).toBeGreaterThanOrEqual(30_000);
    expect(chromeCss).not.toMatch(/\$\{/);
    expect(chromeCss).toContain('var(--ws-accent)');
    for (const selector of [
      '.studio-sidebar',
      '.studio-shell',
      '.studio-signal-row',
      '.studio-approval-card',
      '.studio-context-section',
    ]) {
      expect(chromeCss).toContain(selector);
    }
    expect(globalStyles).toContain('() => null');
  });
});

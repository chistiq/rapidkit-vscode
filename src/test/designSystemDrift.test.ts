import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Workspai design system drift', () => {
  const repoRoot = path.resolve(__dirname, '../..');

  it('loads the shared token spine before product surfaces', () => {
    const indexSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/index.tsx'), 'utf8');
    const incidentSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/incidentStudioNext.tsx'),
      'utf8'
    );

    expect(indexSource).toContain(
      "import { WorkspaiThemeProvider } from '@/components/WorkspaiThemeProvider';"
    );
    expect(indexSource).toContain("import '@/styles/workspai-tokens.css';");
    expect(indexSource.indexOf("import '@/styles/workspai-tokens.css';")).toBeLessThan(
      indexSource.indexOf("import '@/styles-tailwind.css';")
    );
    expect(indexSource.indexOf("import '@/styles-tailwind.css';")).toBeLessThan(
      indexSource.indexOf("import '@/styles/workspai-primitives.css';")
    );
    expect(indexSource).toContain('<WorkspaiThemeProvider>');

    expect(incidentSource).toContain(
      "import { WorkspaiThemeProvider } from '@/components/WorkspaiThemeProvider';"
    );
    expect(incidentSource).toContain("import '@/styles/workspai-tokens.css';");
    expect(incidentSource.indexOf("import '@/styles/workspai-tokens.css';")).toBeLessThan(
      incidentSource.indexOf("import '@/styles-tailwind.css';")
    );
    expect(incidentSource.indexOf("import '@/styles-tailwind.css';")).toBeLessThan(
      incidentSource.indexOf("import '@/styles/workspai-primitives.css';")
    );
    expect(incidentSource).toContain('<WorkspaiThemeProvider>');
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
    expect(providerSource).toContain('MutationObserver');
    expect(providerSource).toContain('document.documentElement');
    expect(providerSource).toContain('document.body');
  });

  it('keeps Studio product UI auto themed without local override controls', () => {
    const wrapperSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/IncidentStudioVNext.tsx'),
      'utf8'
    );
    const topbarSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/TopBar.tsx'),
      'utf8'
    );

    expect(wrapperSource).toContain("useState<ThemeMode>('auto')");
    expect(wrapperSource).not.toContain('loadThemePreference');
    expect(topbarSource).not.toContain('Theme mode');
    expect(topbarSource).not.toContain('Follow VS Code theme');
    expect(topbarSource).not.toContain('Force light theme');
    expect(topbarSource).not.toContain('Force dark theme');
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

  it('uses the unified embedded host for setup, settings, and studio tabs', () => {
    const appSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/App.tsx'), 'utf8');

    expect(appSource).toContain('className="ws-embedded-host"');
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

    expect(railSource).toContain('ws-kicker dashboard-next-step-rail__meta');
    expect(railSource).toContain('ws-chip ws-chip--muted');

    expect(primitivesSource).toContain('.ws-settings-shell');
    expect(primitivesSource).toContain('.dashboard-next-step-rail');
  });

  it('migrates overview, onboarding, and evidence panels to ws-* primitives', () => {
    const onboardingSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/FreshInstallOnboarding.tsx'),
      'utf8'
    );
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

    expect(onboardingSource).toContain('ws-onboarding-shell');
    expect(onboardingSource).toContain('ws-onboarding-card');
    expect(onboardingSource).toContain('ws-kicker');

    expect(overviewSource).toContain('ws-overview-shell');
    expect(overviewSource).toContain('ws-btn ws-btn--primary');
    expect(overviewSource).toContain('ws-metric');

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
    expect(flowSource).toContain('ws-btn ws-btn--ghost');

    expect(appSource).toMatch(/dashboardSection === 'console'[\s\S]*ws-btn ws-btn--primary/);

    expect(primitivesSource).toContain('.ops-chain-banner');
    expect(primitivesSource).toContain('.ws-action-tile');
    expect(primitivesSource).toContain('.module-browser .module-card');
    expect(primitivesSource).toContain('.example-card.ws-card');
  });

  it('unifies AI creation on EnterpriseModal and context inquire on side panel', () => {
    const aiCreateSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/AICreateModal.tsx'),
      'utf8'
    );
    const assistPanelSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/ContextAssistPanel.tsx'),
      'utf8'
    );
    const assistLibSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/lib/contextAssist.ts'),
      'utf8'
    );
    const appSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/App.tsx'), 'utf8');
    const aiModalSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/AIModal.tsx'),
      'utf8'
    );
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

    expect(assistPanelSource).toContain('ws-assist-panel');
    expect(assistPanelSource).not.toContain('EnterpriseModal');
    expect(assistPanelSource).not.toContain('ai-modal-backdrop');
    expect(assistPanelSource).toContain('Context assist');
    expect(assistPanelSource).toContain('Inquire');
    expect(assistPanelSource).toContain('Incident Studio');
    expect(assistPanelSource).not.toContain('Ask AI');

    expect(assistLibSource).toContain('getContextAssistQuickPrompts');

    expect(appSource).toContain('ContextAssistPanel');
    expect(appSource).toContain('ws-dashboard-shell--assist-open');
    expect(appSource).not.toContain('<AIModal');

    expect(aiModalSource).not.toContain('export function AIModal');

    expect(enterpriseModalSource).toContain('headerActions?: ReactNode');

    expect(primitivesSource).toContain('.ws-assist-panel');
    expect(primitivesSource).toContain('.ws-dashboard-shell--assist-open');
  });

  it('bridges Incident Studio tokens and layout to the ws-* spine', () => {
    const tokenSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/styles/designTokens.ts'),
      'utf8'
    );
    const studioSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/styles/workspai-studio.css'),
      'utf8'
    );
    const vnextSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/IncidentStudioVNext.tsx'),
      'utf8'
    );
    const incidentEntrySource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/incidentStudioNext.tsx'),
      'utf8'
    );
    const indexSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/index.tsx'), 'utf8');

    expect(tokenSource).toContain("'var(--ws-surface)'");
    expect(tokenSource).toContain("'var(--ws-accent)'");
    expect(tokenSource).not.toContain('#6c5ce7');
    expect(tokenSource).not.toContain('#00cfc1');

    expect(studioSource).toContain('.studio-workspace-grid');
    expect(studioSource).toContain('.studio-pane-chat');
    expect(studioSource).toContain('.studio-tone-ok');
    expect(studioSource).toContain('[data-studio-viewport=');

    expect(vnextSource).toContain('data-studio-viewport={viewportTier}');
    expect(vnextSource).toContain('studioClass.workspaceGrid');
    expect(vnextSource).not.toContain('100vh');

    expect(incidentEntrySource).toContain("import '@/styles/workspai-studio.css'");
    expect(incidentEntrySource).toContain('studio-banner studio-banner--warn');
    expect(incidentEntrySource).not.toMatch(/style=\{\{\s*background:/);

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
      'webview-ui/src/components/ContextAssistPanel.tsx',
      'webview-ui/src/components/EnterpriseModal.tsx',
      'webview-ui/src/components/WorkspaiSettingsPanel.tsx',
      'webview-ui/src/components/DashboardNextStepRail.tsx',
      'webview-ui/src/components/FreshInstallOnboarding.tsx',
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
      'webview-ui/src/components/StudioRedesign/regions/ContextPanel.tsx',
      'webview-ui/src/components/StudioRedesign/regions/ChatSurface.tsx',
      'webview-ui/src/components/StudioRedesign/IncidentStudioVNext.tsx',
      'webview-ui/src/components/StudioRedesign/regions/TopBar.tsx',
      'webview-ui/src/components/StudioRedesign/regions/CommandRibbon.tsx',
      'webview-ui/src/components/StudioRedesign/regions/PhaseStepper.tsx',
      'webview-ui/src/components/StudioRedesign/regions/MissionControlHeader.tsx',
      'webview-ui/src/components/StudioRedesign/regions/WorkspaceSidebar.tsx',
      'webview-ui/src/components/StudioRedesign/ErrorBoundary.tsx',
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
    const incidentSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/incidentStudioNext.tsx'),
      'utf8'
    );
    const globalStylesSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/styles/globalStyles.tsx'),
      'utf8'
    );
    const vnextSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/IncidentStudioVNext.tsx'),
      'utf8'
    );
    const chromeCss = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/styles/workspai-studio-chrome.css'),
      'utf8'
    );

    expect(indexSource).toContain("import '@/styles/workspai-studio-chrome.css'");
    expect(incidentSource).toContain("import '@/styles/workspai-studio-chrome.css'");
    expect(globalStylesSource).toContain('() => null');
    expect(vnextSource).not.toContain('<GlobalStyles');
    expect(chromeCss).toContain('.studio-sidebar');
    expect(chromeCss).toContain('var(--ws-accent)');
    expect(chromeCss).not.toMatch(/\$\{/);
  });

  it('keeps lite mode policy in shared lib with dedicated regression tests', () => {
    const liteLibSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/lib/incidentStudioLiteMode.ts'),
      'utf8'
    );
    const liteTestSource = fs.readFileSync(
      path.join(repoRoot, 'src/test/incidentStudioLiteMode.test.ts'),
      'utf8'
    );
    const stabilizationLibSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/lib/incidentStudioStabilizationClaim.ts'),
      'utf8'
    );

    expect(liteLibSource).toContain('export function deriveLiteReleaseState');
    expect(liteLibSource).toContain('export function deriveLitePrimaryActionPlan');
    expect(liteLibSource).toContain('export function getLiteProofButtonLabel');
    expect(liteTestSource).toContain("from '../../webview-ui/src/lib/incidentStudioLiteMode'");
    expect(liteTestSource).not.toContain('AIIncidentStudio');
    expect(stabilizationLibSource).toContain('export function buildStabilizationBlockers');
  });

  it('migrates module details and studio regions toward token utilities', () => {
    const moduleDetailsSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/ModuleDetailsModal.tsx'),
      'utf8'
    );
    const contextPanelSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/ContextPanel.tsx'),
      'utf8'
    );
    const chatSurfaceSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/ChatSurface.tsx'),
      'utf8'
    );
    const studioCss = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/styles/workspai-studio.css'),
      'utf8'
    );
    const hexOrRgbaPattern = /#[0-9a-fA-F]{3,8}\b|rgba\s*\(/;

    expect(moduleDetailsSource).toContain('text-[var(--ws-primary)]');
    expect(moduleDetailsSource).not.toMatch(hexOrRgbaPattern);

    expect(contextPanelSource).toContain('postureToneClass');
    expect(contextPanelSource).toContain('studioClass.postureCard');
    expect(contextPanelSource).toContain('studioClass.postureCardProof');
    expect(contextPanelSource).toContain('approvalToneClass');
    expect(contextPanelSource).toContain('policyGateStateClass');
    expect(contextPanelSource).not.toContain('colorTokens');

    expect(studioCss).toContain('.studio-approval-card__metric-grid');
    expect(studioCss).toContain('.studio-signal-row__value.studio-tone-ok');

    expect(chatSurfaceSource).toContain('studioClass.chatSurface');
    expect(chatSurfaceSource).toContain('studioClass.chevron');
    expect(chatSurfaceSource).toContain('studioClass.decisionDeckCard');
    expect(chatSurfaceSource).not.toContain('designTokens');
    expect(chatSurfaceSource).not.toMatch(/style=\{\{/);

    expect(studioCss).toContain('.studio-posture-card');
    expect(studioCss).toContain('.studio-chat-surface');
    expect(studioCss).toContain('.studio-decision-deck-card');
    expect(studioCss).toContain('.studio-chip--fade');

    const topBarSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/TopBar.tsx'),
      'utf8'
    );
    const commandRibbonSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/CommandRibbon.tsx'),
      'utf8'
    );
    const phaseStepperSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/PhaseStepper.tsx'),
      'utf8'
    );
    const missionControlSource = fs.readFileSync(
      path.join(
        repoRoot,
        'webview-ui/src/components/StudioRedesign/regions/MissionControlHeader.tsx'
      ),
      'utf8'
    );

    for (const [label, source] of [
      ['TopBar', topBarSource],
      ['CommandRibbon', commandRibbonSource],
      ['PhaseStepper', phaseStepperSource],
      ['MissionControlHeader', missionControlSource],
    ] as const) {
      expect(source, label).not.toContain('designTokens');
      expect(source, label).not.toMatch(/style=\{\{/);
    }

    expect(topBarSource).toContain('releasePostureToneClass');
    expect(commandRibbonSource).toContain('postureToneClass');
    expect(studioCss).toContain('.studio-mission-control:not(.is-embedded)');
    expect(studioCss).toContain('.studio-release-pill.studio-tone-ok');
    expect(studioCss).toContain('.studio-posture-chip.studio-tone-ok');

    const workspaceSidebarSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/WorkspaceSidebar.tsx'),
      'utf8'
    );
    const errorBoundarySource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/ErrorBoundary.tsx'),
      'utf8'
    );
    const vnextSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/IncidentStudioVNext.tsx'),
      'utf8'
    );

    expect(workspaceSidebarSource).toContain('auditOutcomeToneClass');
    expect(workspaceSidebarSource).not.toContain('designTokens');
    expect(workspaceSidebarSource).not.toMatch(/style=\{\{/);
    expect(errorBoundarySource).not.toContain('designTokens');
    expect(errorBoundarySource).not.toMatch(/style=\{\{/);
    expect(vnextSource).not.toContain('colorTokens');
    expect(vnextSource).not.toContain('Object.assign(colorTokens');
    expect(studioCss).toContain('.studio-error-boundary');
    expect(studioCss).toContain('.studio-nav-item__label');
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

  it('keeps presentation contracts in lib tests isolated from vNext production path', () => {
    const contractsTestSource = fs.readFileSync(
      path.join(repoRoot, 'src/test/incidentStudioPresentationContracts.test.ts'),
      'utf8'
    );
    const contextPanelInteractionSource = fs.readFileSync(
      path.join(repoRoot, 'src/test/contextPanel.interaction.test.ts'),
      'utf8'
    );
    const vnextTestSource = fs.readFileSync(
      path.join(repoRoot, 'src/test/incidentStudioVNext.presentation.test.ts'),
      'utf8'
    );
    const chatSurfaceTestSource = fs.readFileSync(
      path.join(repoRoot, 'src/test/chatSurface.presentation.test.ts'),
      'utf8'
    );
    const missionControlTestSource = fs.readFileSync(
      path.join(repoRoot, 'src/test/missionControlHeader.presentation.test.ts'),
      'utf8'
    );
    const legacyStudioArchiveSource = fs.readFileSync(
      path.join(repoRoot, 'src/test/legacyStudioArchive.test.ts'),
      'utf8'
    );
    const workspaceSidebarTestSource = fs.readFileSync(
      path.join(repoRoot, 'src/test/workspaceSidebar.presentation.test.ts'),
      'utf8'
    );
    const liteTestSource = fs.readFileSync(
      path.join(repoRoot, 'src/test/incidentStudioLiteMode.test.ts'),
      'utf8'
    );

    expect(contractsTestSource).toContain('presentation contracts (lib parity)');
    expect(contractsTestSource).not.toContain('AIIncidentStudio');
    expect(contextPanelInteractionSource).toContain('ContextPanel');
    expect(contextPanelInteractionSource).not.toContain('AIIncidentStudio');
    expect(vnextTestSource).toContain('IncidentStudioVNext');
    expect(vnextTestSource).not.toMatch(/from ['"].*AIIncidentStudio['"]/);
    expect(chatSurfaceTestSource).toContain('ChatSurface');
    expect(chatSurfaceTestSource).not.toContain('AIIncidentStudio');
    expect(missionControlTestSource).toContain('MissionControlHeader');
    expect(missionControlTestSource).not.toContain('AIIncidentStudio');
    expect(workspaceSidebarTestSource).toContain('WorkspaceSidebar');
    expect(workspaceSidebarTestSource).not.toContain('AIIncidentStudio');
    expect(legacyStudioArchiveSource).toContain('archive removal');
    expect(liteTestSource).toContain('incidentStudioLiteMode');
    expect(liteTestSource).not.toContain('AIIncidentStudio');
  });

  it('keeps StudioRedesign barrel free of runtime designTokens exports', () => {
    const indexSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/index.ts'),
      'utf8'
    );
    const studioUiSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/styles/studioUi.ts'),
      'utf8'
    );

    expect(indexSource).not.toContain('./styles/designTokens');
    expect(studioUiSource).not.toContain('colorTokens');
    expect(studioUiSource).not.toContain('statusPillStyle');
    expect(studioUiSource).not.toContain('cardStyle');
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

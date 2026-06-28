import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

describe('dashboard minimal UX guard', () => {
  it('keeps legacy next-step rail progressive but out of the Home decision path', () => {
    const source = read('webview-ui/src/components/DashboardNextStepRail.tsx');
    const app = read('webview-ui/src/App.tsx');

    expect(source).toContain('maxVisible = 3');
    expect(source).toContain('const visibleSteps = expanded ? steps : steps.slice(0, maxVisible)');
    expect(source).toContain("expanded ? 'Show less' : 'Show all'");
    expect(app).toContain("dashboardSection === 'overview' && isFreshInstall");
    expect(app).not.toContain('<DashboardNextStepRail');
    expect(app).not.toContain("navigationSource: 'next_step'");
  });

  it('keeps Artifacts archive-focused instead of duplicating the Repair guided path', () => {
    const source = read('webview-ui/src/components/DashboardEvidenceSection.tsx');

    expect(source).toContain("const showAttentionInbox = evidenceViewMode !== 'expanded'");
    expect(source).toContain("const showActivityPanel = evidenceViewMode === 'expanded'");
    expect(source).toContain("const showReleaseHub = evidenceViewMode === 'balanced'");
    expect(source).toContain('<EvidenceAttentionInbox');
    expect(source).toContain("maxItems={evidenceViewMode === 'guided' ? 3 : 5}");
    expect(source).toContain('onSelectCard={onAskStudioAboutCard}');
    expect(source).toContain("onShowAll={() => onEvidenceViewModeChange('balanced')}");
    expect(source).toContain('Repair flow');
    expect(source).not.toContain('<EvidenceGuidedPath');
    expect(source).toContain("onOpenRepairFlow={() => onNavigateSection('repair')}");
    expect(source).not.toContain('primaryActionLabel');
    expect(source).not.toContain('EvidenceOutcomePanel');
    expect(source).not.toContain('const showDetailedEvidence');
  });

  it('adds a separate repair flow tab before replacing legacy Evidence', () => {
    const sections = read('webview-ui/src/lib/dashboardSections.ts');
    const app = read('webview-ui/src/App.tsx');
    const repairFlow = read('webview-ui/src/components/DashboardRepairFlow.tsx');
    const quickNav = read('webview-ui/src/components/DashboardOverviewQuickNav.tsx');
    const prefsBridge = read('src/ui/panels/incidentStudioUiPreferencesBridge.ts');

    expect(sections).toContain("id: 'repair'");
    expect(sections).toContain("label: 'Repair'");
    expect(sections).toContain("scope: 'flow'");
    expect(sections.indexOf("id: 'operate'")).toBeLessThan(sections.indexOf("id: 'repair'"));
    expect(sections).toContain("label: 'Artifacts'");
    expect(sections).toContain("scope: 'history'");
    expect(app).toContain("dashboardSection === 'repair'");
    expect(app).toContain('<DashboardRepairFlow');
    expect(app).toContain('lastDashboardSectionChangeAtRef');
    expect(app).toContain('pendingDashboardSectionPreferenceRef');
    expect(app).toContain('hasAppliedInitialDashboardSectionPreferenceRef');
    expect(app).toContain('recentlyChangedDashboardSection');
    expect(quickNav).toContain("section: 'repair'");
    expect(quickNav).toContain('onNavigate(action.section)');
    expect(repairFlow).toContain('Repair Command Center');
    expect(repairFlow).toContain("type RepairMode = 'guided' | 'inspect' | 'audit'");
    expect(repairFlow).toContain('function RepairActiveCard');
    expect(repairFlow).toContain('function RepairMetricStrip');
    expect(repairFlow).toContain('function RepairActionContract');
    expect(repairFlow).toContain('function groupRepairCards');
    expect(repairFlow).toContain('repair-flow__active-main');
    expect(repairFlow).toContain('repair-flow__active-head-tools');
    expect(repairFlow).not.toContain('repair-flow__decision-actions');
    expect(repairFlow).toContain('function RepairPath');
    expect(repairFlow).toContain('function RepairStackCard');
    expect(repairFlow).toContain('repair-flow__path-head-trail');
    expect(repairFlow).toContain('fixPathContract');
    expect(repairFlow).not.toContain('repair-flow__path-focus');
    expect(repairFlow).not.toContain('Needs attention');
    expect(repairFlow.indexOf('<RepairPath')).toBeLessThan(
      repairFlow.indexOf('Repair Command Center')
    );
    expect(repairFlow).toContain("mode === 'guided'");
    expect(repairFlow).toContain("mode === 'inspect'");
    expect(repairFlow).toContain("mode === 'audit'");
    expect(repairFlow).toContain('actionableCards.slice(0, 3)');
    expect(repairFlow).toContain('actionableCards.slice(0, 8)');
    expect(repairFlow).toContain('CommandExecutionBadge');
    expect(repairFlow).toContain('executionChannel');
    expect(repairFlow).toContain('aria-label="Repair action contract"');
    expect(repairFlow).toContain('selectedCardId');
    expect(repairFlow).toContain('const queueCards = visibleCards.filter');
    expect(repairFlow).toContain('onSelect={() => setSelectedCardId(card.id)}');
    expect(repairFlow).toContain('Fix path');
    expect(repairFlow).toContain('repair-flow__path-track');
    expect(repairFlow).toContain('onSendToCopilot');
    expect(quickNav).toContain('Workspace next actions');
    expect(quickNav).toContain('Repair workspace');
    expect(quickNav).toContain('Run workspace');
    expect(quickNav).toContain('home-next-actions');
    expect(quickNav).toContain('home-create-handoff__action--primary');
    expect(quickNav).not.toContain('Select a project');
    expect(quickNav).not.toContain("section: 'console'");
    expect(quickNav).not.toContain('Library');
    expect(quickNav).not.toContain("onNavigate('catalog')");
    expect(read('webview-ui/src/lib/dashboardNextSteps.ts')).not.toContain("section: 'evidence'");
    expect(read('webview-ui/src/App.tsx')).toContain('Open Repair flow');
    expect(read('webview-ui/src/App.tsx')).toContain(
      "showProjectScope={dashboardSection === 'console' || dashboardSection === 'catalog'}"
    );
    expect(read('webview-ui/src/App.tsx')).toContain('Home, Run, Repair, Artifacts');
    expect(read('webview-ui/src/components/WorkspaceOverview.tsx')).toContain(
      "label: 'Workspace repair'"
    );
    expect(read('webview-ui/src/components/WorkspaceOverview.tsx')).not.toContain(
      "label: 'Project lifecycle'"
    );
    expect(read('webview-ui/src/components/WorkspaceOverview.tsx')).not.toContain(
      "label: 'Library'"
    );
    expect(prefsBridge).toContain("'overview' | 'repair' | 'evidence'");
    expect(prefsBridge).toContain("prefs?.dashboardSection === 'repair'");
  });

  it('keeps Home as the default overview while showing status summary before secondary navigation', () => {
    const app = read('webview-ui/src/App.tsx');
    const sections = read('webview-ui/src/lib/dashboardSections.ts');
    const overview = read('webview-ui/src/components/WorkspaceOverview.tsx');

    expect(sections).toContain("label: 'Home'");
    expect(sections).toContain('Workspace status, create/import handoffs, and next action summary');
    expect(overview).toContain('Workspace status summary');
    expect(app).toContain('const renderDashboardRepairFlow = () =>');
    expect(app).not.toContain("renderDashboardRepairFlow('status')");
    expect(app).toContain(
      "dashboardSection === 'overview' && (!hasActiveWorkspace || isFreshInstall)"
    );
    expect(app).toContain('{renderDashboardRepairFlow()}');
    expect(app.indexOf('<WorkspaceOverview')).toBeLessThan(
      app.indexOf('<DashboardOverviewQuickNav')
    );
  });

  it('keeps Dashboard and Studio status language aligned to enterprise posture labels', () => {
    const dashboardEvidence = read('webview-ui/src/lib/dashboardEvidence.ts');
    const repairFlow = read('webview-ui/src/components/DashboardRepairFlow.tsx');
    const scaffoldEvidence = read('webview-ui/src/lib/dashboardScaffoldEvidence.ts');
    const studioChrome = read('webview-ui/src/sidebar/StudioBlockerChrome.tsx');
    const shipLoop = read('webview-ui/src/sidebar/StudioShipLoopStepper.tsx');

    expect(dashboardEvidence).toContain("return 'Passed'");
    expect(dashboardEvidence).toContain("return 'Missing'");
    expect(dashboardEvidence).not.toContain("return 'Green'");
    expect(dashboardEvidence).not.toContain("return 'No evidence'");
    expect(scaffoldEvidence).toContain("return 'Expected before first project'");
    expect(repairFlow).toContain('RepairIncidentSummary');
    expect(repairFlow).toContain('aria-label="Incident summary"');
    expect(repairFlow).not.toContain('buildRepairIncidentSummary');
    expect(studioChrome).toContain("idle: 'Blocked'");
    expect(studioChrome).toContain("diagnosing: 'Running'");
    expect(studioChrome).toContain("'fix-applied': 'Awaiting verify'");
    expect(studioChrome).toContain('Incident summary');
    expect(studioChrome).toContain('incidentSummary');
    expect(shipLoop).toContain("pass: 'Passed'");
    expect(shipLoop).toContain('All core steps passed');
  });

  it('keeps dashboard section tabs sticky while scrolling long repair content', () => {
    const app = read('webview-ui/src/App.tsx');
    const styles = read('webview-ui/src/styles-tailwind.css');

    expect(app).toContain('dashboard-sticky-chrome');
    expect(app).toContain('workspaiViewTabs');
    expect(app).toContain('{workspaiViewTabs}');
    expect(app).toContain('<DashboardSubNav');
    expect(styles).toContain('.dashboard-sticky-chrome');
    expect(styles).toContain('.workspai-view-tabs-sticky');
    expect(styles).toContain('position: sticky');
  });

  it('keeps guided attention rows readable instead of disabled pseudo-actions', () => {
    const source = read('webview-ui/src/components/EvidenceAttentionInbox.tsx');
    const styles = read('webview-ui/src/styles-tailwind.css');

    expect(source).toContain('evidence-attention-inbox__main--static');
    expect(source).not.toContain('disabled={!onSelect}');
    expect(styles).toContain('.evidence-attention-inbox__main--static');
    expect(styles).toContain('cursor: default');
  });

  it('keeps attention rows wired to deterministic commands, artifacts, and agent handoffs', () => {
    const source = read('webview-ui/src/components/EvidenceAttentionInbox.tsx');
    const section = read('webview-ui/src/components/DashboardEvidenceSection.tsx');

    expect(source).toContain('Run: {commandAction.label}');
    expect(source).toContain('evidence-attention-inbox__trail');
    expect(source).toContain('buildDashboardEvidenceActionContract');
    expect(source).toContain('actionContract.studioLabel');
    expect(source).toContain('actionContract.copilotLabel');
    expect(source).toContain('onRunCommand(commandAction.command, commandAction.commandData)');
    expect(source).toContain('Open ${actionContract.artifactLabel}');
    expect(source).toContain('No artifact');
    expect(source).toContain('Ask Studio');
    expect(source).toContain('Copilot');
    expect(section).toContain('workspace={workspace}');
    expect(section).toContain('onRunCommand={onRunCommand}');
    expect(section).toContain('onRevealArtifact={onRevealArtifact}');
  });

  it('routes Studio and Copilot handoffs through the shared evidence payload contract', () => {
    const app = read('webview-ui/src/App.tsx');
    const contract = read('webview-ui/src/lib/dashboardActionContract.ts');

    expect(app).toContain('buildDashboardEvidenceActionContract');
    expect(app).toContain('const buildEvidenceActionContract = (card: DashboardEvidenceCard)');
    expect(app).toContain('...actionContract.studioPayload');
    expect(app).toContain(
      "vscode.postMessage('sendToCopilot', buildEvidenceActionContract(card).copilotPayload)"
    );
    expect(app).not.toContain('const serializeEvidenceCardForAgent =');
    expect(app).not.toContain('const buildEvidenceAgentPayload =');
    expect(contract).toContain('studioPayload: DashboardEvidenceAgentPayload');
    expect(contract).toContain('copilotPayload: DashboardEvidenceAgentPayload');
    expect(contract).toContain("source: 'dashboard-evidence'");
    expect(contract).toContain("const projectPath = card.scope === 'project'");
  });

  it('uses one evidence artifact action pattern across repair, archive, and guided paths', () => {
    const actions = read('webview-ui/src/components/EvidenceCardActions.tsx');
    const repair = read('webview-ui/src/components/DashboardRepairFlow.tsx');
    const guided = read('webview-ui/src/components/EvidenceGuidedPath.tsx');
    const outcome = read('webview-ui/src/components/EvidenceOutcomePanel.tsx');
    const activity = read('webview-ui/src/components/CommandActivityPanel.tsx');

    expect(actions).toContain('artifactLabel?: string');
    expect(actions).toContain('No evidence artifact exists yet');
    expect(actions).toContain('Evidence artifact is corrupt');
    expect(actions).toContain("artifactState === 'corrupt'");
    expect(actions).toContain('artifactState ===');
    expect(actions).toContain('primaryAction?: DashboardEvidencePrimaryAction');
    expect(actions).toContain('evidence-card-actions__overflow');
    expect(actions).toContain('evidence-card-actions__menu-item');
    expect(repair).toContain('artifactLabel={actionContract.artifactLabel}');
    expect(repair).toContain('primaryAction={actionContract.primaryAction}');
    expect(guided).toContain('artifactLabel={actionContract.artifactLabel}');
    expect(outcome).toContain('artifactLabel={actionContract.artifactLabel}');
    expect(activity).toContain('artifactLabel={actionContract.artifactLabel}');
    expect(repair).not.toContain('<FileSearch');
    expect(outcome).not.toContain('Open artifact');
  });

  it('uses the shared evidence action contract across guided paths and command history', () => {
    const guided = read('webview-ui/src/components/EvidenceGuidedPath.tsx');
    const activity = read('webview-ui/src/components/CommandActivityPanel.tsx');
    const repair = read('webview-ui/src/components/DashboardRepairFlow.tsx');
    const outcome = read('webview-ui/src/components/EvidenceOutcomePanel.tsx');
    const section = read('webview-ui/src/components/DashboardEvidenceSection.tsx');
    const styles = read('webview-ui/src/styles-tailwind.css');

    expect(guided).toContain('buildDashboardEvidenceActionContract');
    expect(guided).toContain('primaryContract?.commandLabel');
    expect(guided).toContain('evidence-guided-path__contract');
    expect(activity).toContain('buildDashboardEvidenceActionContract');
    expect(activity).toContain('command-activity-panel__card-contract');
    expect(activity).toContain('actionContract.studioLabel');
    expect(activity).toContain('actionContract.copilotLabel');
    expect(repair).toContain('buildDashboardEvidenceActionContract');
    expect(repair).toContain('RepairActionContract');
    expect(repair).toContain('activeContract?.commandAction');
    expect(outcome).toContain('buildDashboardEvidenceActionContract');
    expect(outcome).toContain('actionContract.commandAction');
    expect(section).toContain('buildDashboardEvidenceActionContract');
    expect(styles).toContain('.evidence-guided-path__contract');
    expect(styles).toContain('.command-activity-panel__card-contract');
    expect(styles).toContain('.repair-flow__group summary');
    expect(styles).toContain('.repair-flow__active-main');
    expect(styles).toContain('.repair-flow__blocker-list');
  });

  it('uses command action contracts for legacy rail, Run workspace, and Project lifecycle cards', () => {
    const nextSteps = read('webview-ui/src/components/DashboardNextStepRail.tsx');
    const enterpriseFlow = read('webview-ui/src/components/EnterpriseDashboardFlow.tsx');
    const intelligence = read('webview-ui/src/components/WorkspaceIntelligencePanel.tsx');
    const governance = read('webview-ui/src/components/WorkspaceGovernancePanel.tsx');
    const project = read('webview-ui/src/components/ProjectActions.tsx');
    const tile = read('webview-ui/src/components/ActionTile.tsx');
    const app = read('webview-ui/src/App.tsx');
    const styles = read('webview-ui/src/styles-tailwind.css');

    expect(nextSteps).toContain('buildDashboardCommandActionContract');
    expect(nextSteps).toContain('dashboard-next-step-rail__contract');
    expect(app).toContain('onOpenEvidence={() =>');
    expect(enterpriseFlow).toContain('buildDashboardCommandActionContract');
    expect(enterpriseFlow).toContain('workspacePipeline');
    expect(enterpriseFlow).toContain('workspaceRunInit');
    expect(enterpriseFlow).toContain('workspaceArchiveVerify');
    expect(intelligence).toContain('buildDashboardCommandActionContract');
    expect(intelligence).toContain('actionContract={commandContract(');
    expect(governance).toContain('buildDashboardCommandActionContract');
    expect(governance).toContain('workspaceBootstrap');
    expect(project).toContain('buildDashboardCommandActionContract');
    expect(project).toContain('actionContract={commandContract(dashboardCommand');
    expect(tile).toContain('actionContract?: DashboardCommandActionContract');
    expect(tile).toContain('workspai-action-tile__contract');
    expect(styles).toContain('.workspai-action-tile__contract');
    expect(styles).toContain('.dashboard-next-step-rail__contract');
  });

  it('keeps advanced operate sharing tools collapsed by default', () => {
    const source = read('webview-ui/src/components/EnterpriseDashboardFlow.tsx');

    expect(source).toContain('id="dashboard-operate-share"');
    expect(source).toContain('data-default-collapsed="true"');
    expect(source).not.toMatch(/id="dashboard-operate-share"[\s\S]{0,180}\sopen[\s>]/);
  });

  it('keeps the Run tab focused by collapsing secondary workspace commands', () => {
    const source = read('webview-ui/src/components/EnterpriseDashboardFlow.tsx');
    const operateSection = read('webview-ui/src/components/DashboardOperateSection.tsx');
    const operateSubNav = read('webview-ui/src/components/DashboardOperateSubNav.tsx');
    const operateZones = read('webview-ui/src/lib/dashboardOperateZones.ts');

    expect(operateSection).toContain('dashboard-operate-summary');
    expect(operateSection).toContain('Open Repair');
    expect(operateSection).not.toContain("onRunWorkspaceCommand?.('workspacePipeline')");
    expect(operateSection).toContain("onNavigateSection('repair')");
    expect(operateSection).toContain(
      "activeZone === 'quick' || activeZone === 'build' || activeZone === 'share'"
    );
    expect(operateSection).toContain('activeOperateZone={activeZone}');
    expect(operateSection).toContain("activeZone === 'intelligence'");
    expect(operateSection).toContain('onWorkspaceWhy={onWorkspaceWhy}');
    expect(operateSection).toContain('onWorkspaceTrace={onWorkspaceTrace}');
    expect(operateSection).toContain('onWorkspaceWatch={onWorkspaceWatch}');
    expect(operateSection).toContain('onWorkspaceMcp={onWorkspaceMcp}');
    expect(operateSection).toContain('onWorkspaceImpactLens={onWorkspaceImpactLens}');
    expect(operateSection).toContain('onRunImpactLensCli={onRunImpactLensCli}');
    expect(operateSection).toContain("activeZone === 'governance'");
    expect(operateSection).toContain("activeZone === 'cli'");
    expect(operateSubNav).toContain("zone.id !== 'build'");
    expect(operateSubNav).toContain('RUN_WORKSPACE_ZONES.map');
    expect(operateSubNav).not.toContain('scrollToDashboardOperateZone');
    expect(source).toContain('activeOperateZone?:');
    expect(source).toContain('activeOperateZone ===');
    expect(source).toContain('enterprise-flow-grid--single');
    expect(source).toContain('Archive and handoff');
    expect(source).toContain('title="Start here"');
    expect(source).toContain('More run commands');
    expect(source).toContain('enterprise-flow-secondary');
    expect(source).toContain('id="dashboard-operate-build"');
    expect(source).toContain('data-default-collapsed="true"');
    expect(source).not.toMatch(/id="dashboard-operate-build"[\s\S]{0,180}\sopen[\s>]/);
    expect(source).not.toContain('enterprise-flow-rail');
    expect(operateZones).toContain('target instanceof HTMLDetailsElement');
    expect(operateZones).toContain('target.open = true');
  });

  it('keeps Home responsible for create, import, and adopt entry points', () => {
    const handoff = read('webview-ui/src/components/HomeCreateHandoff.tsx');
    const importAdopt = read('webview-ui/src/components/HomeImportAdoptHandoff.tsx');
    const app = read('webview-ui/src/App.tsx');
    const welcome = read('src/ui/panels/welcomePanel.ts');
    const creationNavigation = read('src/ui/panels/welcomePanelCreationNavigationMessages.ts');
    const workspaceSelection = read('src/ui/panels/welcomePanelWorkspaceSelectionMessages.ts');
    const combinedWelcomeRoutingSource = `${welcome}\n${creationNavigation}\n${workspaceSelection}`;
    const styles = read('webview-ui/src/styles-tailwind.css');

    expect(handoff).toContain('Create with AI');
    expect(handoff).not.toContain('disabled={!hasWorkspace}');
    expect(handoff).toContain('Uses the default workspace');
    expect(importAdopt).toContain('Import &amp; Adopt');
    expect(importAdopt).not.toContain('ImportAdoptOptionsModal');
    expect(importAdopt).toContain('useDefaultWorkspace: true');
    expect(importAdopt).not.toContain('quickSwitchWorkspace');
    expect(importAdopt).toContain('dashboard-import-handoff');
    expect(importAdopt).toContain('dashboard-adopt-handoff');
    expect(importAdopt).not.toContain("source: 'local-folder'");
    expect(app).toContain('HomeCreateHandoff');
    expect(app).toContain('HomeImportAdoptHandoff');
    expect(app).toContain("from '@/lib/dashboardDispatch'");
    expect(app).toContain('buildDashboardDispatchMessages');
    expect(app).toContain('home-onboarding-handoffs');
    expect(styles).toContain('.home-onboarding-handoffs');
    expect(app).toContain('handleOpenAICreateWorkspace');
    expect(app).toContain('handleOpenAICreateProject');
    expect(app).toContain("trigger: 'dashboard-ai-create-handoff'");
    expect(app).toContain("trigger: 'dashboard-ai-create-project-handoff'");
    expect(app).toContain('useDefaultWorkspace: !hasWorkspace');
    expect(app).toContain('openCreateWithAITab');
    expect(combinedWelcomeRoutingSource).toContain(
      'useDefaultWorkspace: payload?.useDefaultWorkspace === true'
    );
    expect(read('src/extension.ts')).toContain(
      'Never bootstrap the managed default workspace before opening UI'
    );
    expect(app).toContain('dashboardSectionShowsScopePaths');
    expect(app).toContain('showScopePaths={dashboardSectionShowsScopePaths(dashboardSection)}');
    expect(app).toContain("vscode.postMessage('openWorkspaceInNewWindow'");
    expect(app).toContain("vscode.postMessage('revealWorkspaceFolder'");
    expect(combinedWelcomeRoutingSource).toContain("case 'openWorkspaceInNewWindow':");
    expect(combinedWelcomeRoutingSource).toContain("case 'revealWorkspaceFolder':");
  });

  it('keeps archive evidence cards readable instead of disabled pseudo-actions', () => {
    const source = read('webview-ui/src/components/CommandActivityPanel.tsx');
    const styles = read('webview-ui/src/styles-tailwind.css');

    expect(source).toContain('command-activity-panel--${viewMode}');
    expect(source).toContain('Artifact archive');
    expect(source).toContain('command-activity-panel__card-main--static');
    expect(source).not.toContain('disabled={!clickable}');
    expect(styles).toContain('.command-activity-panel__card-main--static');
    expect(styles).toContain('.command-activity-panel--expanded .command-activity-panel__evidence');
    expect(styles).toContain(".dashboard-evidence-layout[data-evidence-view='balanced']");
  });

  it('keeps evidence cards to one Studio handoff path per card', () => {
    const source = read('webview-ui/src/components/EvidenceOutcomePanel.tsx');

    expect(source).toContain('const needsAgentAttention = cardNeedsAgentAttention(card)');
    expect(source).toContain('showAgentActions={needsAgentAttention}');
    expect(source).toContain('studioTarget && !needsAgentAttention');
  });

  it('keeps deep Run sections scannable with responsive command grids', () => {
    const intelligenceSource = read('webview-ui/src/components/WorkspaceIntelligencePanel.tsx');
    const governanceSource = read('webview-ui/src/components/WorkspaceGovernancePanel.tsx');

    expect(intelligenceSource).toContain('<ActionTileGrid layout="auto">');
    expect(intelligenceSource).toContain('Advanced intelligence');
    expect(intelligenceSource).toContain('data-default-collapsed="true"');
    expect(governanceSource).toContain('<ActionTileGrid layout="auto">');
    expect(governanceSource).toContain('Advanced governance');
    expect(governanceSource).toContain('data-default-collapsed="true"');
  });

  it('keeps project lifecycle focused by collapsing advanced project tools', () => {
    const source = read('webview-ui/src/components/ProjectActions.tsx');

    expect(source).toContain('Project actions');
    expect(source).toContain('project-actions-summary');
    expect(source).toContain('scope: DashboardScopeDescriptor');
    expect(source).toContain('dashboardScopeLabel(scope)');
    expect(source).toContain('dashboardScopeDetail(scope)');
    expect(source).toContain('Selected project');
    expect(source).toContain('Capability unknown');
    expect(source).toContain('Advanced project actions');
    expect(source).toContain('data-default-collapsed="true"');
    expect(source).toContain("'projectDev'");
    expect(source).toContain('label="Doctor"');
    expect(source).toContain(
      'isDashboardLifecycleCommandSupported(capabilities, dashboardCommand)'
    );
    expect(source).toContain('disabled={!supported}');
    expect(source).toContain("disableReason || 'Not supported for this project'");
  });

  it('keeps Library scannable with a compact scope summary', () => {
    const source = read('webview-ui/src/components/ModuleBrowser.tsx');
    const styles = read('webview-ui/src/styles-tailwind.css');

    expect(source).toContain('module-browser-summary');
    expect(source).toContain('scope: DashboardScopeDescriptor');
    expect(source).toContain('dashboardScopeLabel(scope)');
    expect(source).toContain('dashboardScopeDetail(scope)');
    expect(source).toContain('Library summary');
    expect(source).toContain('RapidKit modules');
    expect(source).toContain('defaultVisibleModuleCount');
    expect(source).toContain('Ready to install');
    expect(source).toContain('Browse mode');
    expect(source).toContain('installBlockedReason ||');
    expect(source).toContain('filteredRows.slice(0, defaultVisibleModuleCount)');
    expect(source).toContain('Show ${hiddenModuleCount} more');
    expect(styles).toContain('.module-browser-summary');
    expect(styles).toContain('.module-browser-footer');
  });

  it('keeps context-bar workspace-first until project-scoped tabs need project scope', () => {
    const source = read('webview-ui/src/components/DashboardContextBar.tsx');
    const styles = read('webview-ui/src/styles/workspai-primitives.css');

    expect(source).toContain('dashboard-context-bar__trail');
    expect(source).toContain('Dashboard scope breadcrumb');
    expect(source).toContain('showProjectScope?: boolean');
    expect(source).toContain('showScopePaths?: boolean');
    expect(source).toContain('dashboard-context-bar--workspace-first');
    expect(source).toContain('dashboard-context-bar--dual');
    expect(source).toContain('No project selected');
    expect(source).toContain('dashboard-context-bar__separator');
    expect(source).toContain('scope: DashboardScopeDescriptor');
    expect(source).toContain('className="dashboard-context-bar__switch"');
    expect(source).toContain('Select a project from PROJECTS to unlock project-scoped actions');
    expect(source).not.toContain('Click to focus the PROJECTS panel');
    expect(styles).toContain('.dashboard-context-bar__trail');
    expect(styles).toContain('.dashboard-context-bar__scope--workspace');
    expect(styles).toContain('.dashboard-context-bar__scope--project');
    expect(styles).toContain('min-height: 58px');
  });

  it('shows governance chain banner only on Run workspace tab', () => {
    const app = read('webview-ui/src/App.tsx');
    expect(app).toContain("dashboardSection === 'operate' &&");
    expect(app).toContain('<OpsChainBanner');
    expect(app).not.toMatch(/visibleOpsChain[\s\S]{0,120}dashboardSection === 'overview'/);
  });

  it('activity-bar quick actions omit redundant branding and workspace name', () => {
    const sidebarApp = read('webview-ui/src/sidebar/SidebarApp.tsx');
    const grid = read('webview-ui/src/sidebar/QuickActionsGrid.tsx');
    expect(sidebarApp).not.toContain('ws-sidebar__brand');
    expect(grid).not.toContain('scope.workspaceName');
    expect(grid).not.toContain('ws-sidebar__scope');
  });

  it('positions fresh install onboarding around workspace intelligence value', () => {
    const source = read('webview-ui/src/components/FreshInstallOnboarding.tsx');
    const app = read('webview-ui/src/App.tsx');

    expect(source).toContain('Setup recovery');
    expect(source).toContain('Workspace Intelligence is not ready yet');
    expect(source).toContain('Open Setup Recovery');
    expect(source).toContain('Advanced start options');
    expect(source).toContain('install compatible CLI');
    expect(source).toContain('link local npm package');
    expect(source).toContain('select workspace');
    expect(source).toContain('run first model');
    expect(source).toContain('run doctor');
    expect(source).toContain('run agent-sync');
    expect(source).toContain('Create with AI');
    expect(app).toContain('onOpenSetup={openSetupInDashboard}');
    expect(app).toContain('onCreateWithAI={handleOpenAICreateWorkspace}');
  });

  it('keeps dashboard identity aligned with the Workspace Intelligence product promise', () => {
    const source = read('webview-ui/src/components/Header.tsx');

    expect(source).toContain('Workspace Intelligence for software systems.');
    expect(source).not.toContain('backend teams');
  });

  it('keeps dashboard navigation and empty project copy enterprise-oriented', () => {
    const sections = read('webview-ui/src/lib/dashboardSections.ts');
    const overview = read('webview-ui/src/components/WorkspaceOverview.tsx');
    const handoff = read('webview-ui/src/lib/dashboardStudioHandoff.ts');
    const statusBar = read('src/ui/statusBar.ts');

    expect(sections).toContain('primary, build, intelligence, governance');
    expect(sections).not.toContain('quick, build, intelligence, governance');
    expect(read('webview-ui/src/App.tsx')).toContain('buildDashboardScopeDescriptor');
    expect(read('webview-ui/src/App.tsx')).toContain('dashboardWorkspaceOnlyScope');
    expect(read('webview-ui/src/App.tsx')).toContain('scope={dashboardWorkspaceOnlyScope}');
    expect(read('webview-ui/src/App.tsx')).toContain('message.data.dashboardSection');
    expect(read('webview-ui/src/App.tsx')).toContain("navigationSource: 'host_message'");
    expect(read('webview-ui/src/App.tsx')).toContain('scope={dashboardScope}');
    expect(read('webview-ui/src/components/DashboardRepairFlow.tsx')).toContain(
      'scope: DashboardScopeDescriptor'
    );
    expect(read('webview-ui/src/components/DashboardEvidenceSection.tsx')).toContain(
      'scope: DashboardScopeDescriptor'
    );
    expect(read('webview-ui/src/components/DashboardOperateSection.tsx')).toContain(
      'scope: DashboardScopeDescriptor'
    );
    expect(overview).toContain('Workspace status summary');
    expect(overview).not.toContain('Select a project from PROJECTS to unlock lifecycle actions');
    expect(overview).not.toContain('Click Project in context bar');
    expect(handoff).toContain('Primary workspace commands and governance');
    expect(statusBar).toContain('$(rocket) Workspai');
    expect(statusBar).toContain('$(pulse) Ready');
    expect(statusBar).toContain('Open Workspai dashboard and workspace intelligence');
    expect(statusBar).not.toContain('🚀');
  });

  it('keeps guided path checklist informational instead of duplicating per-card agent actions', () => {
    const source = read('webview-ui/src/components/EvidenceGuidedPath.tsx');

    expect(source).toContain('Guided path');
    expect(source).toContain('Guided evidence path');
    expect(source).toContain('{activeStep.title}');
    expect(source).not.toContain('Your path');
    expect(source).not.toContain('Step by step evidence path');
    expect(source).not.toContain('cardNeedsAgentAttention');
    expect(source).not.toContain('onAskStudioAboutCard');
    expect(source).not.toContain('onSendEvidenceToCopilot');
    expect(source).toContain('artifactLabel={actionContract.artifactLabel}');
    expect(source).toContain('artifactLabel={primaryContract?.artifactLabel}');
  });

  it('keeps evidence view controls compact and scannable', () => {
    const source = read('webview-ui/src/lib/dashboardEvidenceViewMode.ts');

    expect(source).toContain("guided: 'Attention'");
    expect(source).toContain("balanced: 'Gates'");
    expect(source).toContain("expanded: 'Archive'");
    expect(source).toContain('Only blocked and warning artifacts.');
    expect(source).not.toContain("guided: 'Step by step'");
    expect(source).not.toContain("balanced: 'By workflow'");
    expect(source).not.toContain("expanded: 'All evidence'");
  });

  it('routes dashboard Studio handoffs to the secondary sidebar tab', () => {
    const app = read('webview-ui/src/App.tsx');
    const welcome = read('src/ui/panels/welcomePanel.ts');
    const creationNavigation = read('src/ui/panels/welcomePanelCreationNavigationMessages.ts');
    const combinedStudioRoutingSource = `${welcome}\n${creationNavigation}`;

    expect(app).toContain("vscode.postMessage('openStudioSidebarTab'");
    expect(app).toContain('openStudioInSidebar');
    expect(combinedStudioRoutingSource).toContain("case 'openStudioSidebarTab':");
    expect(welcome).toContain('_routeStudioToSecondarySidebar');
  });

  it('keeps Incident Studio out of the dashboard shell and routes through the sidebar', () => {
    const app = read('webview-ui/src/App.tsx');
    const redesign = read('webview-ui/src/components/StudioRedesign/index.ts');

    expect(app).not.toContain('IncidentStudioVNext');
    expect(app).not.toContain('AIIncidentStudio');
    expect(app).not.toContain('<ContextAssistPanel');
    expect(app).toContain('const openStudioInSidebar =');
    expect(app).toContain("vscode.postMessage('openStudioSidebarTab'");
    expect(app).toContain("trigger: 'dashboard-studio-handoff'");
    expect(redesign).not.toContain('IncidentStudioVNext');
  });

  it('bridges legacy openAIModal host messages to Workspace Advisor instead of an embedded modal', () => {
    const app = read('webview-ui/src/App.tsx');

    expect(app).toContain("case 'openAIModal':");
    expect(app).toContain("vscode.postMessage('openWorkspaceAdvisorTab'");
    expect(app).toContain("trigger: 'legacy-context-assist-handoff'");
    expect(app).not.toContain("vscode.postMessage('openAIModal'");
  });

  it('keeps Governance Gate as the primary Run workspace pipeline entry', () => {
    const flow = read('webview-ui/src/components/EnterpriseDashboardFlow.tsx');

    expect(flow).toContain('label="Governance Gate"');
    expect(flow).toContain("runWorkspaceAction('workspacePipeline')");
    expect(flow).toContain('title="rapidkit pipeline --json --strict"');
    expect(flow).toContain('variant="primary"');
    expect(flow.indexOf('label="Governance Gate"')).toBeLessThan(flow.indexOf('label="Doctor"'));
  });

  it('shows health and impact trends only outside guided evidence mode', () => {
    const section = read('webview-ui/src/components/DashboardEvidenceSection.tsx');
    const trend = read('webview-ui/src/components/DashboardTrendChart.tsx');
    const evidenceTypes = read('webview-ui/src/lib/dashboardEvidence.ts');

    expect(section).toContain("evidenceViewMode !== 'guided' ? <DashboardTrendChart");
    expect(trend).toContain('Health and impact trend');
    expect(trend).toContain('Governance Gate or Workspace Verify');
    expect(evidenceTypes).toContain('policyViolations: number');
    expect(evidenceTypes).toContain('gateHealth: number');
  });

  it('loads shared accessibility overrides on the dashboard webview bundle', () => {
    const index = read('webview-ui/src/index.tsx');

    expect(index).toContain("import '@/styles/workspai-a11y.css'");
    expect(index.indexOf("import '@/styles/workspai-a11y.css'")).toBeGreaterThan(
      index.indexOf("import '@/styles/responsive.css'")
    );
  });

  it('renders intelligence detail accordions as styled cards', () => {
    const panel = read('webview-ui/src/components/WorkspaceIntelligencePanel.tsx');
    const accordion = read('webview-ui/src/components/IntelligenceDetailAccordion.tsx');
    const styles = read('webview-ui/src/styles/workspai-primitives.css');

    expect(panel).toContain('IntelligenceDetailAccordion');
    expect(accordion).toContain('workspace-intelligence-detail-card');
    expect(styles).toContain('.workspace-intelligence-detail-card__section');
    expect(panel).not.toContain('workspace-intelligence-explain-sections');
  });

  it('renders explain/why/trace as a single explainability stack with artifact source context', () => {
    const panel = read('webview-ui/src/components/WorkspaceIntelligencePanel.tsx');
    const styles = read('webview-ui/src/styles/workspai-primitives.css');

    expect(panel).toContain('Explainability stack');
    expect(panel).toContain('What is the release posture?');
    expect(panel).toContain('Why is this the active blocker?');
    expect(panel).toContain('Where did the evidence come from?');
    expect(panel).toContain('explainabilitySource');
    expect(panel).toContain('resolveEvidenceFreshness');
    expect(styles).toContain('.workspace-explainability-stack');
    expect(styles).toContain('.workspace-explainability-stack__item--fail');
  });

  it('keeps agent sync under collapsed advanced intelligence commands', () => {
    const panel = read('webview-ui/src/components/WorkspaceIntelligencePanel.tsx');
    const zones = read('webview-ui/src/lib/dashboardOperateZones.ts');

    expect(panel).toContain("'workspaceAgentSync'");
    expect(panel).toContain('data-default-collapsed="true"');
    expect(panel).toContain('Advanced intelligence');
    expect(panel).toContain('workspace agent-sync --write --refresh-context');
    expect(zones).toContain("workspaceAgentSync: 'intelligence'");
  });

  it('uses evidence brief blocker posture instead of a separate policy panel', () => {
    const brief = read('webview-ui/src/lib/dashboardEvidenceBrief.ts');
    const section = read('webview-ui/src/components/DashboardEvidenceSection.tsx');

    expect(brief).toContain("posture: 'blocked'");
    expect(brief).toContain('cardCountsAsReleaseBlocker');
    expect(section).toContain('<EvidenceBrief');
    expect(section).toContain('buildDashboardEvidenceBrief');
    expect(section).not.toContain('PolicyViolation');
  });

  it('keeps sidebar fix-then-verify CTA without re-run command loop prompts', () => {
    const sidebar = read('webview-ui/src/sidebar/SecondarySidebar.tsx');
    const chrome = read('webview-ui/src/sidebar/StudioBlockerChrome.tsx');
    const fixPrompt = read('src/core/sidebarStudioFixPrompt.ts');
    const app = read('webview-ui/src/App.tsx');

    expect(sidebar).toContain("'verify-handoff'");
    expect(sidebar).toContain('sidebarStudioFixApplied');
    expect(chrome).toContain('awaiting-verify');
    expect(chrome).toContain('Run verify');
    expect(fixPrompt).toContain('Do NOT recommend re-running');
    expect(app).toContain('repair-flow-studio-handoff');
    expect(app).toContain('artifacts-inbox-studio-handoff');
  });
});

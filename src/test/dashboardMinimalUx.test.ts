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
    expect(app).toContain("dashboardSection === 'overview' ? (");
    expect(app).not.toContain('FreshInstallOnboarding');
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
    const attentionInbox = read('webview-ui/src/components/EvidenceAttentionInbox.tsx');
    const activityPanel = read('webview-ui/src/components/CommandActivityPanel.tsx');
    const detailPreview = read('webview-ui/src/components/EvidenceCardDetailPreview.tsx');
    const studioChrome = read('webview-ui/src/sidebar/StudioBlockerChrome.tsx');
    const quickNav = read('webview-ui/src/components/DashboardOverviewQuickNav.tsx');
    const prefsBridge = read('src/ui/panels/incidentStudioUiPreferencesBridge.ts');

    expect(sections).toContain("id: 'repair'");
    expect(sections).toContain("label: 'Repair'");
    expect(sections).toContain("scope: 'flow'");
    expect(sections.indexOf("id: 'operate'")).toBeLessThan(sections.indexOf("id: 'repair'"));
    expect(sections).toContain("label: 'Artifacts'");
    expect(sections).toContain("scope: 'history'");
    expect(app).toContain("dashboardSection === 'repair'");
    expect(app).toContain('<DashboardRepairPanel');
    expect(app).toContain('lastDashboardSectionChangeAtRef');
    expect(app).toContain('pendingDashboardSectionPreferenceRef');
    expect(app).toContain('hasAppliedInitialDashboardSectionPreferenceRef');
    expect(app).toContain('recentlyChangedDashboardSection');
    expect(app).toContain('resetDashboardSectionForWorkspaceSwitch');
    expect(app).toContain("const resetSection: DashboardSection = 'overview'");
    expect(app).toContain('pendingDashboardSectionPreferenceRef.current = resetSection');
    expect(app).toContain("key: 'dashboardSection'");
    expect(app).toContain('resetDashboardSectionForWorkspaceSwitch();');
    expect(app.indexOf('resetDashboardSectionForWorkspaceSwitch();')).toBeLessThan(
      app.indexOf('resetDashboardEvidenceSession(message.data.workspacePath);')
    );
    expect(quickNav).toContain("section: 'repair'");
    expect(quickNav).toContain('onNavigate(action.section)');
    expect(repairFlow).toContain('Workspace repair');
    expect(repairFlow).toContain("export type RepairMode = 'guided' | 'inspect' | 'audit'");
    expect(repairFlow).toContain('REPAIR_MODE_STORAGE_KEY');
    expect(repairFlow).toContain('useState<RepairMode>(initialRepairMode)');
    expect(repairFlow).toContain('persistRepairMode(nextMode)');
    expect(repairFlow).toContain('aria-label="Repair detail level"');
    expect(repairFlow).toContain("guided: 'Priority'");
    expect(repairFlow).toContain("inspect: 'All issues'");
    expect(repairFlow).toContain("audit: 'Diagnostics'");
    expect(repairFlow).toContain('aria-keyshortcuts="Enter"');
    expect(repairFlow).toContain('tabIndex={0}');
    expect(repairFlow).toContain('function isInteractiveKeyboardTarget');
    expect(repairFlow).toContain("event.key !== 'Enter'");
    expect(repairFlow).toContain('runPrimaryAction();');
    expect(repairFlow).toContain('function RepairActiveCard');
    expect(repairFlow).toContain('function RepairMetricStrip');
    expect(repairFlow).toContain('function groupRepairCards');
    expect(repairFlow).toContain('repair-flow__active-main');
    expect(repairFlow).toContain('repair-flow__decision-tools');
    expect(repairFlow).not.toContain('repair-flow__decision-actions');
    expect(repairFlow).not.toContain('function RepairPath');
    expect(repairFlow).toContain('function RepairStackCard');
    expect(repairFlow).not.toContain('repair-flow__path-rail');
    expect(repairFlow).toContain('buildDashboardRepairCardCopy');
    expect(repairFlow).toContain('repair-flow__active-issue');
    expect(repairFlow).toContain('repair-flow__active-guidance');
    expect(repairFlow).toContain('Technical details');
    expect(repairFlow).toContain("mode !== 'guided'");
    expect(repairFlow).not.toContain('Needs attention');
    expect(repairFlow).not.toContain('<RepairPath');
    expect(repairFlow).toContain("mode === 'guided'");
    expect(repairFlow).toContain("mode === 'inspect'");
    expect(repairFlow).toContain("mode === 'audit'");
    expect(repairFlow).toContain('selectRepairVisibleCards');
    expect(repairFlow).toContain('...blockedCards.map((card) => card.id)');
    expect(repairFlow).not.toContain('CommandExecutionBadge');
    expect(repairFlow).toContain('executionChannel');
    expect(repairFlow).toContain('buildDashboardIncidentCopy');
    expect(attentionInbox).toContain('buildDashboardRepairCardCopy');
    expect(attentionInbox).not.toContain('evidence-attention-inbox__trail');
    expect(activityPanel).toContain('buildDashboardIncidentCopy');
    expect(detailPreview).toContain('buildDashboardIncidentCopy');
    expect(activityPanel).toContain('incident.compactLabel');
    expect(activityPanel).toContain('ARCHIVE_CARD_PAGE_SIZE = 12');
    expect(activityPanel).toContain('expandedVisibleCardCount');
    expect(activityPanel).toContain('hiddenArchiveCardCount');
    expect(activityPanel).toContain(
      'Show {Math.min(ARCHIVE_CARD_PAGE_SIZE, hiddenArchiveCardCount)} more artifacts'
    );
    expect(detailPreview).toContain('evidence-card-detail-preview__incident');
    expect(studioChrome).toContain('Workspai Agent · {PHASE_LABEL[phase]}');
    expect(studioChrome).toContain('{loop}');
    expect(studioChrome).not.toContain('buildStudioIncidentCopy');
    expect(repairFlow).toContain('selectedCardId');
    expect(repairFlow).toContain('const queueCards = visibleCards.filter');
    expect(repairFlow).toContain('onSelect={() => setSelectedCardId(card.id)}');
    expect(repairFlow).toContain('onSendToCopilot');
    expect(quickNav).toContain('Workspace next actions');
    expect(quickNav).toContain('Repair workspace');
    expect(quickNav).toContain('Review blockers and run safe repair actions when needed');
    expect(quickNav).toContain('Run workspace');
    expect(quickNav).toContain('Generate or refresh health, intelligence, and release evidence');
    expect(quickNav).toContain('home-next-actions');
    expect(quickNav).toContain('home-create-handoff__action--primary');
    expect(quickNav).not.toContain('Top blockers');
    expect(quickNav).not.toContain('buildEvidenceAttentionInbox');
    expect(quickNav).not.toContain('First-value path');
    expect(quickNav).not.toContain('home-day0-funnel');
    expect(quickNav).not.toContain('Next recommended focus');
    expect(quickNav).not.toContain('firstArtifactStep');
    expect(quickNav).not.toContain('Select a project');
    expect(quickNav).not.toContain("section: 'console'");
    expect(quickNav).not.toContain('Library');
    expect(quickNav).not.toContain("onNavigate('catalog')");
    expect(read('webview-ui/src/lib/dashboardNextSteps.ts')).not.toContain("section: 'evidence'");
    expect(read('webview-ui/src/App.tsx')).toContain('Open Repair flow');
    expect(read('webview-ui/src/App.tsx')).toContain("dashboardSection !== 'catalog'");
    expect(read('webview-ui/src/App.tsx')).toContain(
      "showProjectScope={dashboardSection === 'console'}"
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

  it('keeps Home next actions quiet without blocker ranking or first-value progress', () => {
    const quickNav = read('webview-ui/src/components/DashboardOverviewQuickNav.tsx');
    const overviewSection = read('webview-ui/src/components/DashboardOverviewSection.tsx');
    const styles = read('webview-ui/src/styles-tailwind.css');

    expect(overviewSection).toContain('<DashboardOverviewQuickNav');
    expect(quickNav).toContain('Next actions');
    expect(quickNav).toContain('Repair workspace');
    expect(quickNav).toContain('Run workspace');
    expect(quickNav).not.toContain('Top blockers');
    expect(quickNav).not.toContain('aria-label="Top evidence blockers"');
    expect(quickNav).not.toContain('First-value path');
    expect(quickNav).not.toContain('First evidence ready');
    expect(quickNav).not.toContain('day0Funnel');
    expect(styles).not.toContain('.home-attention-rank');
    expect(styles).not.toContain('.home-first-artifact-celebration');
    expect(styles).not.toContain('.home-day0-funnel');
  });

  it('keeps Home as the default overview while showing status summary before secondary navigation', () => {
    const app = read('webview-ui/src/App.tsx');
    const sections = read('webview-ui/src/lib/dashboardSections.ts');
    const overview = read('webview-ui/src/components/WorkspaceOverview.tsx');
    const overviewSection = read('webview-ui/src/components/DashboardOverviewSection.tsx');
    const dashboardEvidence = read('webview-ui/src/lib/dashboardEvidence.ts');

    expect(sections).toContain("label: 'Home'");
    expect(sections).toContain('Workspace status, create/import handoffs, and next action summary');
    expect(sections).toContain(
      'Generate and refresh workspace evidence: health, intelligence, and release gates'
    );
    expect(sections).toContain(
      'Resolve blockers with evidence, Studio guidance, verification, and artifact refresh'
    );
    expect(overview).toContain('Workspace status summary');
    expect(app).not.toContain('const renderDashboardRepairFlow = () =>');
    expect(app).not.toContain("renderDashboardRepairFlow('status')");
    expect(app).toContain("dashboardSection === 'overview' ? (");
    expect(app).toContain(
      "const isEmptyWorkspaceHome = dashboardSection === 'overview' && !hasActiveWorkspace"
    );
    expect(app).toContain(
      "const showDashboardContextBar = dashboardSection !== 'catalog' && hasActiveWorkspace"
    );
    expect(app).toContain(
      "const showOverviewDiagnostics = dashboardSection === 'overview' && hasActiveWorkspace"
    );
    expect(app).toContain('{showDashboardContextBar ? (');
    expect(app).toContain('{showOverviewDiagnostics ? (');
    expect(app).toContain('<DashboardRepairPanel');
    expect(app).toContain('<DashboardOverviewSection');
    expect(overviewSection.indexOf('<WorkspaceOverview')).toBeLessThan(
      overviewSection.indexOf('<DashboardOverviewQuickNav')
    );
    expect(overviewSection).not.toContain('<DashboardRetentionSummary');
    expect(overviewSection).not.toContain('evidence?.onboarding.cohortSummary');
    expect(overviewSection).not.toContain('Progress');
    expect(dashboardEvidence).toContain('cohortSummary?: DashboardRetentionCohortSummary | null');
    expect(dashboardEvidence).toContain("schemaVersion: 'retention-cohort.v1'");
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
    expect(repairFlow).toContain('function activeRepairKicker');
    expect(repairFlow).toContain("return 'Active warning'");
    expect(repairFlow).toContain('{activeRepairKicker(card, workspaceProjectCount)}');
    expect(repairFlow).not.toContain('buildRepairIncidentSummary');
    expect(studioChrome).toContain("idle: 'Blocked'");
    expect(studioChrome).toContain("diagnosing: 'Running'");
    expect(studioChrome).toContain("'fix-applied': 'Awaiting verify'");
    expect(studioChrome).toContain('Workspai Agent · {PHASE_LABEL[phase]}');
    expect(studioChrome).toContain('`Repairing ${subject}`');
    expect(studioChrome).toContain('incidentSummary');
    expect(studioChrome).not.toContain('aria-label="Incident summary"');
    expect(shipLoop).toContain("pass: 'Passed'");
    expect(shipLoop).toContain('Release path');
    expect(shipLoop).toContain('context:');
    expect(shipLoop).toContain('All core steps passed');
  });

  it('keeps dashboard section tabs sticky while scrolling long repair content', () => {
    const app = read('webview-ui/src/App.tsx');
    const styles = read('webview-ui/src/styles-tailwind.css');

    expect(app).toContain('ws-dashboard-sticky-chrome');
    expect(app).toContain('workspaiViewTabs');
    expect(app).toContain('{workspaiViewTabs}');
    expect(app).toContain('<DashboardSubNav');
    expect(styles).toContain('.ws-dashboard-sticky-chrome');
    expect(styles).toContain('.workspai-view-tabs-sticky');
    expect(styles).not.toContain('.home-day0-funnel__focus');
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
    expect(source).toContain('buildDashboardRepairCardCopy');
    expect(source).toContain('copy.issue');
    expect(source).toContain('copy.guidance');
    expect(source).not.toContain('evidence-attention-inbox__trail');
    expect(source).toContain('import { EvidenceCardActions }');
    expect(source).toContain('buildDashboardEvidenceActionContract');
    expect(source).toContain('<EvidenceCardActions');
    expect(source).toContain('primaryAction={actionContract.primaryAction}');
    expect(source).toContain('onRunCommand(commandAction.command, commandAction.commandData)');
    expect(source).not.toContain('Open ${actionContract.artifactLabel}');
    expect(source).not.toContain('<Bot');
    expect(source).not.toContain('<Send');
    expect(section).toContain('workspace={workspace}');
    expect(section).toContain('onRunCommand={onRunCommand}');
    expect(section).toContain('onRevealArtifact={onRevealArtifact}');
    expect(section).toContain('onCopyEvidenceAgentHandoff={onCopyEvidenceAgentHandoff}');
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
    const attention = read('webview-ui/src/components/EvidenceAttentionInbox.tsx');

    expect(actions).toContain('artifactLabel?: string');
    expect(actions).toContain('No evidence artifact exists yet');
    expect(actions).toContain('Evidence artifact is corrupt');
    expect(actions).toContain("artifactState === 'corrupt'");
    expect(actions).toContain('artifactState ===');
    expect(actions).toContain('primaryAction?: DashboardEvidencePrimaryAction');
    expect(actions).toContain('resolveVisiblePrimaryEvidenceAction');
    expect(actions).toContain("input.primaryAction?.type === 'studio' && input.hasStudioHandler");
    expect(actions).toContain('input.canRun && input.hasRunHandler');
    expect(actions).toContain('evidence-card-actions__overflow');
    expect(actions).toContain('evidence-card-actions__menu-item');
    expect(actions).toContain("document.addEventListener('pointerdown', dismissOutside, true)");
    expect(actions).toContain("event.key === 'Escape'");
    expect(actions).toContain('!overflow.contains(event.target)');
    expect(actions).toContain("overflowRef.current?.removeAttribute('open')");
    expect(actions).toContain('Copy agent handoff');
    expect(repair).toContain('artifactLabel={actionContract.artifactLabel}');
    expect(repair).toContain('primaryAction={actionContract.primaryAction}');
    expect(guided).toContain('artifactLabel={actionContract.artifactLabel}');
    expect(outcome).toContain('artifactLabel={actionContract.artifactLabel}');
    expect(activity).toContain('artifactLabel={actionContract.artifactLabel}');
    expect(attention).toContain('<EvidenceCardActions');
    expect(attention).toContain('artifactLabel={actionContract.artifactLabel}');
    expect(attention).toContain('primaryAction={actionContract.primaryAction}');
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
    expect(activity).toContain('buildDashboardIncidentCopy');
    expect(activity).toContain('incident.compactLabel');
    expect(repair).toContain('buildDashboardEvidenceActionContract');
    expect(repair).toContain('buildDashboardRepairCardCopy');
    expect(repair).toContain('actionContract.commandAction');
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
    expect(nextSteps).toContain('ws-dashboard-next-step-rail__contract');
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
    expect(project).toContain('onDoctorFix');
    expect(project).toContain("doctorTone === 'fail'");
    expect(tile).toContain('actionContract?: DashboardCommandActionContract');
    expect(tile).toContain('workspai-action-tile__contract');
    expect(styles).toContain('.workspai-action-tile__contract');
    expect(styles).toContain('.ws-dashboard-next-step-rail__contract');
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
    expect(operateZones).toContain(
      "export const DEFAULT_DASHBOARD_OPERATE_ZONE: DashboardOperateZone = 'quick'"
    );
    expect(operateSection).toContain('DEFAULT_DASHBOARD_OPERATE_ZONE');
    expect(operateSubNav).toContain('DEFAULT_DASHBOARD_OPERATE_ZONE');
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
    expect(importAdopt).toContain('Import / Adopt Projects');
    expect(importAdopt).not.toContain('ImportAdoptOptionsModal');
    expect(importAdopt).toContain('useDefaultWorkspace: true');
    expect(importAdopt).not.toContain('quickSwitchWorkspace');
    expect(importAdopt).toContain('dashboard-import-handoff');
    expect(importAdopt).toContain('dashboard-adopt-handoff');
    expect(importAdopt).not.toContain("source: 'local-folder'");
    expect(app).toContain('HomeCreateHandoff');
    expect(app).toContain('HomeImportAdoptHandoff');
    expect(app).toContain("dashboardSection === 'overview' ? (");
    expect(app).not.toContain('FreshInstallOnboarding');
    expect(app).not.toContain('setupRecoveryNeeded');
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
    expect(styles).toContain(".ws-dashboard-evidence-layout[data-evidence-view='balanced']");
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
    expect(source).toContain('dashboardScopeDetail(scope, { showPaths: false })');
    expect(source).toContain('Selected project');
    expect(source).toContain('Capability unknown');
    expect(source).toContain('Advanced project actions');
    expect(source).toContain('data-default-collapsed="true"');
    expect(source).toContain("'projectDev'");
    expect(source).toContain('Project Doctor evidence');
    expect(source).toContain('project-doctor-card');
    expect(source).toContain('Run Project Doctor with auto-fix');
    expect(source).toContain('<Wrench size={12}');
    expect(source).toContain('onRevealArtifact');
    expect(source).toContain(
      'isDashboardLifecycleCommandSupported(capabilities, dashboardCommand)'
    );
    expect(source).toContain('disabled={!supported}');
    expect(source).toContain("disableReason || 'Not supported for this project'");

    const app = read('webview-ui/src/App.tsx');
    expect(app).toContain('{!hasDashboardProject ? (');
    expect(app).toContain("dispatchDashboardCommand('projectDoctor', { preferredAction: 'fix' })");
  });

  it('keeps Library scannable with a compact scope summary', () => {
    const source = read('webview-ui/src/components/ModuleBrowser.tsx');
    const styles = read('webview-ui/src/styles-tailwind.css');

    expect(source).toContain('module-browser-summary');
    expect(source).toContain('scope: DashboardScopeDescriptor');
    expect(source).toContain('dashboardScopeLabel(scope)');
    expect(source).toContain('dashboardScopeDetail(scope, { showPaths: false })');
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

    expect(source).toContain('ws-dashboard-context-bar__trail');
    expect(source).toContain('Dashboard scope breadcrumb');
    expect(source).toContain('showProjectScope?: boolean');
    expect(source).toContain('showScopePaths?: boolean');
    expect(source).toContain('compactStudioPathText(path, { keepSegments: 2 })');
    expect(source).toContain('ws-dashboard-context-bar--workspace-first');
    expect(source).toContain('ws-dashboard-context-bar--dual');
    expect(source).toContain('No project selected');
    expect(source).toContain('ws-dashboard-context-bar__separator');
    expect(source).toContain('scope: DashboardScopeDescriptor');
    expect(source).toContain('className="ws-dashboard-context-bar__switch"');
    expect(source).toContain('Select a project from PROJECTS to unlock project-scoped actions');
    expect(source).not.toContain('Click to focus the PROJECTS panel');
    expect(styles).toContain('.ws-dashboard-context-bar__trail');
    expect(styles).toContain('.ws-dashboard-context-bar__scope--workspace');
    expect(styles).toContain('.ws-dashboard-context-bar__scope--project');
    expect(styles).toContain('min-height: 58px');
  });

  it('shows governance chain banner only on Run workspace tab', () => {
    const app = read('webview-ui/src/App.tsx');
    expect(app).toContain("dashboardSection === 'operate' &&");
    expect(app).toContain('<OpsChainBanner');
    expect(app).toContain('opsChainBlockedCardIdByStep');
    expect(app).toContain('opsChainBlockedByRepairCard');
    expect(app).toContain('!opsChainBlockedByRepairCard');
    expect(app).toContain("bootstrap: 'bootstrap'");
    expect(app).toContain("doctor: 'doctor'");
    expect(app).toContain("analyze: 'analyze'");
    expect(app).toContain("readiness: 'readiness'");
    expect(app).not.toMatch(/visibleOpsChain[\s\S]{0,120}dashboardSection === 'overview'/);
  });

  it('activity-bar quick actions omit redundant branding and workspace name', () => {
    const sidebarApp = read('webview-ui/src/sidebar/SidebarApp.tsx');
    const grid = read('webview-ui/src/sidebar/QuickActionsGrid.tsx');
    expect(sidebarApp).not.toContain('ws-sidebar__brand');
    expect(grid).not.toContain('scope.workspaceName');
    expect(grid).not.toContain('ws-sidebar__scope');
  });

  it('keeps fresh installs on Home handoff cards instead of a banner', () => {
    const handoff = read('webview-ui/src/components/HomeCreateHandoff.tsx');
    const importAdopt = read('webview-ui/src/components/HomeImportAdoptHandoff.tsx');
    const app = read('webview-ui/src/App.tsx');

    expect(handoff).toContain('Create with AI');
    expect(handoff).toContain('Workspace');
    expect(handoff).toContain('Project');
    expect(importAdopt).toContain('Import / Adopt Projects');
    expect(importAdopt).toContain('Import');
    expect(importAdopt).toContain('Adopt');
    expect(app).toContain("dashboardSection === 'overview' ? (");
    expect(app).not.toContain('FreshInstallOnboarding');
    expect(app).not.toContain('fresh-install-onboarding');
    expect(app).toContain('onCreateAIWorkspace={handleOpenAICreateWorkspace}');
  });

  it('keeps fresh-install and first-evidence timing copy semantically separate', () => {
    const overview = read('webview-ui/src/components/WorkspaceOverview.tsx');
    const evidence = read('webview-ui/src/lib/dashboardEvidence.ts');
    const bridge = read('src/core/ttfvBridge.ts');
    const panel = read('src/ui/panels/welcomePanelDashboardEvidence.ts');

    expect(bridge).toContain('kept distinct from the dashboard');
    expect(panel).toContain(
      'const isFreshInstall = recentWorkspaceCount === 0 && !hasActiveWorkspace'
    );
    expect(evidence).toContain('isFreshInstall: boolean');
    expect(evidence).toContain('ttfvLabel?: string | null');
    expect(overview).toContain('formatWorkspaceOverviewTtfvCopy');
    expect(overview).toContain('First evidence generated in');
    expect(overview).toContain('aria-label="First evidence timing"');
    expect(overview).not.toContain('Time to first value:');
    expect(overview).not.toContain('aria-label="Time to first value"');
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

    expect(sections).toContain(
      'Generate and refresh workspace evidence: health, intelligence, and release gates'
    );
    expect(sections).toContain(
      'Resolve blockers with evidence, Studio guidance, verification, and artifact refresh'
    );
    expect(sections).not.toContain('primary, build, intelligence, governance');
    expect(sections).not.toContain('quick, build, intelligence, governance');
    expect(read('webview-ui/src/App.tsx')).toContain('buildDashboardScopeDescriptor');
    expect(read('webview-ui/src/App.tsx')).toContain('dashboardWorkspaceOnlyScope');
    expect(read('webview-ui/src/App.tsx')).toContain('scope={dashboardWorkspaceOnlyScope}');
    expect(read('webview-ui/src/App.tsx')).toContain('message.data.dashboardSection');
    expect(read('webview-ui/src/App.tsx')).toContain("navigationSource: 'host_message'");
    expect(read('webview-ui/src/App.tsx')).toContain('scope={dashboardScope}');
    expect(read('src/extension.ts')).toContain('refreshStatusBarAmbientTruth(selectedWorkspace)');
    expect(read('src/extension.ts')).toContain('refreshStatusBarAmbientTruth(initialWs)');
    expect(read('src/extension.ts')).toContain('resolveLinkedCliVersion(workspace.path)');
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
    expect(statusBar).toContain('updateAmbientTruth');
    expect(statusBar).toContain('Top blocker:');
    expect(statusBar).toContain('Workspai CLI:');
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

    expect(source).toContain("guided: 'Needs action'");
    expect(source).toContain("balanced: 'Release checks'");
    expect(source).toContain("expanded: 'All evidence'");
    expect(source).toContain('Only blocked and warning artifacts.');
    expect(source).not.toContain("guided: 'Step by step'");
    expect(source).not.toContain("balanced: 'By workflow'");
    const toggle = read('webview-ui/src/components/EvidenceViewModeToggle.tsx');
    expect(toggle).toContain('aria-label="Artifact detail level"');
    expect(toggle).toContain('<select');
    expect(toggle).not.toContain('aria-pressed');
  });

  it('keeps execution logs collapsed outside the archive view', () => {
    const panel = read('webview-ui/src/components/CommandActivityPanel.tsx');
    const drawer = read('webview-ui/src/components/EvidenceCardLogDrawer.tsx');

    expect(drawer).toContain('defaultExpanded = false');
    expect(panel).toContain("defaultExpanded={viewMode === 'expanded'}");
    expect(panel).toContain("viewMode === 'balanced'");
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

  it('locks Artifacts history until a workspace exists', () => {
    const section = read('webview-ui/src/components/DashboardEvidenceSection.tsx');
    const noWorkspaceGuard = section.slice(
      section.indexOf('if (!hasWorkspace)'),
      section.indexOf('const cards = evidence?.cards ?? []')
    );

    expect(noWorkspaceGuard).toContain('No workspace selected');
    expect(noWorkspaceGuard).toContain(
      'Artifacts unlock after you create, import, or switch to a workspace'
    );
    expect(noWorkspaceGuard).toContain("onNavigateSection('overview')");
    expect(noWorkspaceGuard).not.toContain('onRunCommand');
    expect(noWorkspaceGuard).not.toContain('Generate artifact');
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
    const provider = read('src/ui/webviews/actionsWebviewProvider.ts');
    const failure = read('webview-ui/src/lib/studioVerifyFailure.ts');

    expect(sidebar).toContain("'verify-handoff'");
    expect(sidebar).toContain('sidebarStudioFixApplied');
    expect(sidebar).toContain('buildSidebarStudioReturnState');
    expect(sidebar).toContain('buildSidebarStudioAuditReturnState');
    expect(sidebar).toContain('activeStudioReturnState.title');
    expect(sidebar).toContain('activeStudioReturnState.detail');
    expect(sidebar).toContain('data-state={activeStudioReturnState.status}');
    expect(chrome).toContain('awaiting-verify');
    expect(chrome).not.toContain('Run verify');
    expect(chrome).not.toContain('use final verify');
    expect(chrome).not.toContain('final verify');
    expect(chrome).not.toContain('ws-sidebar__studio-execution');
    expect(chrome).not.toContain('Command execution contract');
    expect(sidebar).not.toContain('activeStudioVerifyFailure.nextAction');
    expect(sidebar).not.toContain('studioAutonomousStepCountsRef');
    expect(failure).toContain('dashboardCommandId?: string');
    expect(failure).toContain('executionChannel?:');
    expect(failure).toContain('capabilityGate?: string');
    expect(failure).toContain('nextAction?: string');
    expect(provider).toContain('buildSidebarStudioActionFailurePayload');
    expect(provider).toContain('studioActionFailureNextAction');
    expect(fixPrompt).toContain('Do NOT recommend re-running');
    expect(app).toContain('repair-flow-studio-handoff');
    expect(app).toContain('artifacts-inbox-studio-handoff');
  });

  it('guards action hierarchy across Repair, Artifacts, and Studio', () => {
    const actions = read('webview-ui/src/components/EvidenceCardActions.tsx');
    const repair = read('webview-ui/src/components/DashboardRepairFlow.tsx');
    const artifacts = read('webview-ui/src/components/EvidenceAttentionInbox.tsx');
    const studio = read('webview-ui/src/sidebar/StudioBlockerChrome.tsx');

    expect(actions).toContain('const primaryType = resolvedPrimaryAction?.type');
    expect(actions).toContain('resolveVisiblePrimaryEvidenceAction');
    expect(actions).toContain('const hasRunSecondary = canRun && onRun && primaryType !==');
    expect(actions).toContain(
      'const hasStudioSecondary = showAgentActions && onAskStudio && primaryType !=='
    );
    expect(actions).toContain('evidence-card-actions__overflow');
    expect(repair).toContain('primaryAction={actionContract.primaryAction}');
    expect(artifacts).toContain('<EvidenceCardActions');
    expect(artifacts).toContain('primaryAction={actionContract.primaryAction}');
    expect(artifacts).not.toContain('<Bot');
    expect(artifacts).not.toContain('<Send');
    expect(studio).not.toContain('onVerify');
    expect(studio).toContain("phase === 'awaiting-verify'");
    expect(studio).toContain("phase === 'fix-applied'");
    expect(studio).toContain("handoff.studioMode === 'EXPLAIN'");
    expect(studio).not.toContain('const verifyLabel =');
  });

  it('keeps direct card refresh failures visible and clears pending refresh state', () => {
    const app = read('webview-ui/src/App.tsx');
    const lifecycle = read('src/ui/panels/welcomePanelDashboardLifecycleMessages.ts');
    const hostFactory = read('src/ui/panels/welcomePanelDashboardHostFactories.ts');

    expect(lifecycle).toContain('sendDashboardEvidenceOrPostFailure');
    expect(lifecycle).toContain('postDashboardEvidenceRefreshFailed?.');
    expect(hostFactory).toContain("command: 'dashboardEvidenceRefresh'");
    expect(app).toContain('setDashboardCommandFailures((current) =>');
    expect(app).toContain('setPendingEvidenceRefreshCardIds((current) =>');
    expect(app).toContain('current.filter((cardId) => !failedCardSet.has(cardId))');
  });

  it('keeps Studio action failure payloads complete for operator recovery', () => {
    const provider = read('src/ui/webviews/actionsWebviewProvider.ts');
    const sidebar = read('webview-ui/src/sidebar/SecondarySidebar.tsx');
    const failure = read('webview-ui/src/lib/studioVerifyFailure.ts');

    for (const action of [
      'auto-fix',
      'apply-patch',
      'ship-loop-step',
      'retry-audit',
      'verify-handoff',
      'run-command',
    ]) {
      expect(provider).toContain(`case '${action}'`);
    }
    expect(provider).toContain('type SidebarStudioActionFailurePayload');
    expect(provider).toContain('title: string');
    expect(provider).toContain('summary: string');
    expect(provider).toContain('commandText?: string');
    expect(provider).toContain('dashboardCommandId?: string');
    expect(provider).toContain('executionChannel?:');
    expect(provider).toContain('capabilityGate?: string');
    expect(provider).toContain('exitCode?: number | null');
    expect(provider).toContain('nextAction: string');
    expect(provider).toContain('buildSidebarStudioActionFailurePayload({');
    expect(provider).toContain('input.handoff?.dashboardCommandId');
    expect(provider).toContain('input.handoff?.executionChannel');
    expect(provider).toContain('input.handoff?.capabilityGate');
    expect(provider).toContain("studioActionFailureNextAction('verify-handoff')");
    expect(failure).toContain('commandText?: string');
    expect(failure).toContain('nextAction?: string');
    expect(sidebar).not.toContain('activeStudioVerifyFailure.nextAction');
  });

  it('surfaces feedback history failures through both audit state and Studio failure rail', () => {
    const provider = read('src/ui/webviews/actionsWebviewProvider.ts');
    const sidebar = read('webview-ui/src/sidebar/SecondarySidebar.tsx');
    const returnState = read('webview-ui/src/lib/sidebarStudioReturnState.ts');

    expect(provider).toContain("this._postInlineCreate('sidebarStudioAuditState'");
    expect(provider).toContain("action: 'retry-audit'");
    expect(provider).toContain('buildSidebarStudioActionFailurePayload({');
    expect(provider).toContain('sessionId: input.sessionId');
    expect(sidebar).toContain('buildSidebarStudioAuditReturnState');
    expect(sidebar).toContain("data.status === 'failed'");
    expect(returnState).toContain('Audit not saved');
    expect(returnState).toContain("feedbackRecorded ? 'saved' : 'not saved'");
  });

  it('gives Studio verify success a closure narrative and Dashboard return path', () => {
    const provider = read('src/ui/webviews/actionsWebviewProvider.ts');
    const dispatcher = read('src/ui/webviews/actionsWebviewMessageDispatcher.ts');
    const sidebar = read('webview-ui/src/sidebar/SecondarySidebar.tsx');
    const repairResult = read('webview-ui/src/sidebar/StudioRepairResult.tsx');
    const returnState = read('webview-ui/src/lib/sidebarStudioReturnState.ts');

    expect(returnState).toContain('Blocker resolved');
    expect(returnState).toContain('Return to Dashboard when you are ready');
    expect(repairResult).toContain('Back to Dashboard');
    expect(repairResult).toContain("returnState.status === 'verified-refreshed'");
    expect(sidebar).toContain("'sidebarOpenDashboard'");
    expect(sidebar).toContain("section: 'repair'");
    expect(dispatcher).toContain("command: 'sidebarOpenDashboard'");
    expect(dispatcher).toContain('openDashboardSection');
    expect(provider).toContain('_openDashboardSection');
    expect(provider).toContain('WelcomePanel.openDashboardSectionTab(this._context, section)');
  });

  it('keeps module catalog rendering extracted from the dashboard app shell', () => {
    const app = read('webview-ui/src/App.tsx');
    const moduleCatalogSurface = read(
      'webview-ui/src/components/DashboardModuleCatalogSurface.tsx'
    );

    expect(app).toContain('DashboardModuleCatalogSurface');
    expect(app).toContain('DashboardCatalogLoadingShell');
    expect(app).toContain('dashboardModuleCatalogSurfaceProps');
    expect(app).toContain('onInstall: (module: ModuleData) => handleOpenInstallModal(module)');
    expect(app).not.toContain('onInstall: handleOpenInstallModal');
    expect(app).not.toContain('const renderDashboardModuleBrowser');
    expect(app).not.toContain('const renderDashboardCatalogLoadingShell');
    expect(moduleCatalogSurface).toContain('export function DashboardModuleCatalogSurface');
    expect(moduleCatalogSurface).toContain('export function DashboardCatalogLoadingShell');
    expect(moduleCatalogSurface).toContain('surface: DashboardModuleCatalogSurfaceName');
    expect(moduleCatalogSurface).toContain(
      "type DashboardModuleCatalogSurfaceName = 'console' | 'catalog'"
    );
    expect(moduleCatalogSurface).toContain('includeProjectActions={false}');
    expect(moduleCatalogSurface).toContain("variant: 'templates' | 'modules'");
  });

  it('keeps Home overview rendering extracted from the dashboard app shell', () => {
    const app = read('webview-ui/src/App.tsx');
    const overviewSection = read('webview-ui/src/components/DashboardOverviewSection.tsx');

    expect(app).toContain('DashboardOverviewSection');
    expect(app).toContain('importedWorkspaceShare={importedWorkspaceShare}');
    expect(app).not.toContain('<WorkspaceOverview');
    expect(app).not.toContain('<DashboardOverviewQuickNav');
    expect(overviewSection).toContain('export function DashboardOverviewSection');
    expect(overviewSection).toContain('export type ImportedWorkspaceShareSummary');
    expect(overviewSection).toContain('Imported Share Bundle');
    expect(overviewSection).toContain('<WorkspaceOverview');
    expect(overviewSection).toContain('<DashboardOverviewQuickNav');
  });

  it('keeps Artifacts evidence rendering extracted from the dashboard app shell', () => {
    const app = read('webview-ui/src/App.tsx');
    const evidenceSection = read('webview-ui/src/components/DashboardEvidenceArtifactsSection.tsx');

    expect(app).toContain('DashboardEvidenceArtifactsSection');
    expect(app).toContain('onOpenStudioVerify={() =>');
    expect(app).toContain("openStudioTarget('release'");
    expect(app).not.toContain('<DashboardEvidenceSection');
    expect(evidenceSection).toContain('export function DashboardEvidenceArtifactsSection');
    expect(evidenceSection).toContain('id="dashboard-panel-evidence"');
    expect(evidenceSection).toContain(
      'className="ws-dashboard-panel ws-dashboard-panel--evidence"'
    );
    expect(evidenceSection).toContain('<DashboardEvidenceSection');
    expect(evidenceSection).toContain('onOpenStudioVerify={onOpenStudioVerify}');
    expect(evidenceSection).toContain('onOpenRunZone={onOpenRunZone}');
  });

  it('keeps Run operate rendering extracted from the dashboard app shell', () => {
    const app = read('webview-ui/src/App.tsx');
    const operatePanel = read('webview-ui/src/components/DashboardOperatePanel.tsx');
    const operateSection = read('webview-ui/src/components/DashboardOperateSection.tsx');

    expect(app).toContain('DashboardOperatePanel');
    expect(app).toContain("source: 'operate_sub_nav'");
    expect(app).not.toContain('<DashboardOperateSection');
    expect(operatePanel).toContain('export function DashboardOperatePanel');
    expect(operatePanel).toContain(
      'type DashboardOperatePanelProps = DashboardOperateSectionProps'
    );
    expect(operatePanel).toContain('id="dashboard-panel-operate"');
    expect(operatePanel).toContain('className="ws-dashboard-panel ws-dashboard-panel--operate"');
    expect(operatePanel).toContain('<DashboardOperateSection {...props} />');
    expect(operateSection).toContain('export interface DashboardOperateSectionProps');
  });

  it('keeps Repair rendering extracted from the dashboard app shell', () => {
    const app = read('webview-ui/src/App.tsx');
    const repairPanel = read('webview-ui/src/components/DashboardRepairPanel.tsx');
    const repairFlow = read('webview-ui/src/components/DashboardRepairFlow.tsx');

    expect(app).toContain('DashboardRepairPanel');
    expect(app).toContain("navigationSource: 'repair'");
    expect(app).not.toContain('<DashboardRepairFlow');
    expect(app).not.toContain('renderDashboardRepairFlow');
    expect(repairPanel).toContain('export function DashboardRepairPanel');
    expect(repairPanel).toContain('type DashboardRepairPanelProps = DashboardRepairFlowProps');
    expect(repairPanel).toContain('id="dashboard-panel-repair"');
    expect(repairPanel).toContain('className="ws-dashboard-panel ws-dashboard-panel--repair"');
    expect(repairPanel).toContain('<DashboardRepairFlow {...props} />');
    expect(repairFlow).toContain('export interface DashboardRepairFlowProps');
  });
});

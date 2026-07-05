import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

/**
 * Guards the React Studio-lite migration (roadmap 2.11f) and the final removal
 * of the raw-HTML sidebar.
 */
describe('React Studio tab ↔ host protocol parity (roadmap 2.11f)', () => {
  const secondary = read('webview-ui/src/sidebar/SecondarySidebar.tsx');
  const app = read('webview-ui/src/App.tsx');
  const provider = read('src/ui/webviews/actionsWebviewProvider.ts');
  const dispatcher = read('src/ui/webviews/actionsWebviewMessageDispatcher.ts');
  const creationNavigation = read('src/ui/panels/welcomePanelCreationNavigationMessages.ts');

  it('posts the studio outbound commands the host handles', () => {
    for (const command of ['sidebarStudioQuery', 'sidebarStudioAction']) {
      expect(secondary, `React should post "${command}"`).toContain(`'${command}'`);
      expect(dispatcher, `host should handle "${command}"`).toContain(`command: '${command}'`);
    }
  });

  it('handles every studio inbound command the host emits', () => {
    for (const command of [
      'sidebarStudioScope',
      'sidebarStudioChunk',
      'sidebarStudioDone',
      'sidebarStudioError',
    ]) {
      expect(secondary, `React should handle inbound "${command}"`).toContain(`case '${command}'`);
      expect(provider, `host should emit "${command}"`).toContain(`'${command}'`);
    }
  });

  it('wires the studio modes + command-card actions', () => {
    expect(secondary).toContain("'investigate'");
    expect(secondary).toContain("'verify'");
    expect(secondary).toContain("'prepare'");
    expect(secondary).toContain("action: 'run-command'");
    expect(secondary).toContain("action: 'run-remediation-command'");
    expect(secondary).toContain("action: 'refresh-remediation-plan'");
    expect(secondary).toContain("action: 'copy-command'");
    expect(secondary).toContain("action: 'auto-fix'");
    expect(secondary).toContain("action: 'apply-remediation-step'");
    expect(secondary).toContain("'verify-handoff'");
    expect(secondary).toContain("useChatSessions('workspaiStudio'");
    expect(secondary).toContain('StudioRepairPrelude');
    expect(secondary).toContain('StudioRemediationPlan');
    expect(secondary).toContain('StudioActionProgress');
    expect(secondary).toContain('hasActiveStudioRepairOutput');
    const remediationPlan = read('webview-ui/src/sidebar/StudioRemediationPlan.tsx');
    expect(remediationPlan).toContain('deriveStudioRepairCapability');
    expect(remediationPlan).toContain('Repair capability');
    expect(remediationPlan).toContain('Apply change');
    expect(remediationPlan).toContain('Run check');
    expect(remediationPlan).not.toContain('How I can help');
  });

  it('handles blocker handoff + fix-applied inbound commands', () => {
    for (const command of [
      'sidebarBlockerHandoff',
      'sidebarStudioFixApplied',
      'sidebarStudioCardRefreshed',
      'sidebarStudioPatchReview',
      'sidebarStudioRemediationPlan',
    ]) {
      expect(secondary, `React should handle inbound "${command}"`).toContain(`case '${command}'`);
      expect(provider, `host should emit "${command}"`).toContain(`'${command}'`);
    }
    expect(provider).toContain("action === 'auto-fix'");
    expect(provider).toContain("action === 'apply-remediation-step'");
    expect(provider).toContain("action === 'run-remediation-command'");
    expect(provider).toContain("action === 'refresh-remediation-plan'");
    expect(provider).toContain('refreshing-remediation-plan');
    expect(provider).toContain('workspace remediation-plan --ci --json --write --include-paths');
    expect(provider).toContain('ensureDoctorRemediationPlanRefreshCommand(sourceCommand)');
    expect(provider).toContain('--plan --json');
    expect(provider).toContain('verify-remediation-command');
    expect(provider).toContain('verify-remediation-step');
    expect(provider).toContain('verifying-remediation-step');
    expect(provider).toContain('isInternalDoctorRepairCommand(commandText)');
    expect(provider).toContain('doctor-remediation-token:${step.id}');
    expect(provider).toContain('Trusted remediation operation applied. Running verify now.');
    expect(provider).toContain('doctor-remediation-step:${step.id}');
    expect(provider).toContain('rollbackCommand');
    expect(provider).toContain('_postSidebarDoctorRemediationPlan');
    expect(provider).toContain("nextHandoff.cardStatus !== 'pass'");
    expect(provider).toContain("action === 'apply-patch'");
    expect(provider).toContain('executeSidebarApplyDebugPatch');
    expect(provider).toContain('verify-sidebar-patch');
    expect(provider).toContain('Patch applied. Running verify now.');
    expect(provider).toContain('Patch applied and verify completed.');
    expect(provider).toContain('result.responseText?.trim()');
    expect(provider).toContain("'sidebarStudioChunk'");
    expect(provider).toContain("'sidebarStudioDone'");
    expect(provider).toContain('extractPatchesFromAiResponse(answer');
    expect(provider).toContain('normalizePatchesForWorkspaceScope');
    expect(provider).toContain('projectPath: handoff.projectPath ?? aiContext.projectRootPath');
    expect(provider).toContain('sidebar-chat-fix-${handoff.cardId}');
    expect(provider).toContain(
      'Studio found ${chatPatches.length} file patch(es) in the repair answer.'
    );
    expect(provider).toContain('Patch review ready');
    expect(provider).toContain('AI repair needs a patch');
    expect(provider).toContain('Retry AI fix');
    expect(provider).toContain('projectPath: handoff.projectPath ?? scope.projectPath');
    expect(provider).toContain('dispatchSidebarShipLoopStep');
    expect(provider).toContain('sidebarStudioShipLoop');
    expect(provider).toContain("payload?.shipLoopIntent === 'release'");
    expect(provider).toContain("input.intent !== 'release'");
    expect(provider).toContain("shipLoopIntent: 'release'");
    expect(app).toContain("options?.shipLoopIntent === 'release'");
    expect(app).toContain("shipLoopIntent: 'release'");
    expect(creationNavigation).toContain("payload?.shipLoopIntent === 'release'");
    expect(provider).toContain('buildSidebarStudioPrompt');
    expect(provider).toContain('refreshDashboardAfterStudioVerify');
    expect(provider).toContain('cardId?: string');
    expect(provider).toContain('cardId: input.handoff?.cardId.trim()');
    expect(provider).toContain('cardId: handoff.cardId');
    expect(provider).toContain('hasRepairPlan');
    expect(provider).toContain(
      "nextActionLabel: planExecution.success && !hasRepairPlan ? 'Continue with fix' : undefined"
    );
    expect(provider).toContain('private async _runStudioVerifyContinuation');
    expect(provider).toContain("verifyActionId: 'verify-remediation-step'");
    expect(provider).toContain(
      'const verifyExecutionCommand = ensureDoctorRemediationPlanRefreshCommand(input.verifyCommand)'
    );
    expect(provider).toContain(
      'const effectiveProjectPath = input.projectPath ?? input.handoff.projectPath'
    );
    expect(provider).toContain('projectPath: effectiveProjectPath');
    expect(provider).toContain('resolveProjectPathFromRemediationStep');
    expect(provider).toContain('remediationStepPathCandidates');
    expect(provider).toContain("path.join(cursor, '.rapidkit', 'project.json')");
    expect(provider).toContain('handoffProjectPath: handoff.projectPath');
    expect(provider).toContain('scopeProjectPath: scope.projectPath');
    expect(provider).toContain(
      'const changedPaths = collectAppliedPatchPaths(applyResult.appliedFixes)'
    );
    expect(provider).toContain("entry.outcome === 'unchanged'");
    expect(provider).toContain('appliedCount: changedPaths.length');
    expect(provider).toContain('The fix was already in place. Running verify now.');
    expect(provider).toContain('failureSummary: verifyFailureSummary');
    expect(provider).toContain('nextAction: loopProgress.nextAction');
    expect(provider).toContain('nextActionLabel: loopProgress.nextActionLabel');
    expect(provider).toContain(
      'await this._postSidebarDoctorRemediationPlan({ handoff, workspacePath })'
    );
    expect(provider).toContain("verifyActionId: 'verify-doctor-fix'");
    expect(provider).toContain('Doctor fix completed. Running verify now.');
    expect(provider).toContain("verifyActionId: 'verify-run-once'");
    expect(provider).toContain('Source command completed. Running verify now.');
    expect(provider).toContain('verifyActionId: `verify-${fixAction}`');
    expect(provider).toContain(
      'Studio action ${fixAction} completed and verify refreshed the card.'
    );
    expect(provider).not.toContain('projectPath: step.projectPath || scope.projectPath');
    expect(provider).toContain('const actionSucceeded = actionResult?.gatePassed !== false');
    expect(provider).toContain("title: actionSucceeded ? undefined : 'Gate still blocked'");
    expect(provider).toContain("status: actionSucceeded ? 'done' : 'failed'");

    const patchBridge = read('src/core/sidebarStudioPatchBridge.ts');
    expect(patchBridge).toContain('buildSidebarCardRepairPatchPrompt');
    expect(patchBridge).toContain('normalizePatchesForWorkspaceScope');
    expect(patchBridge).toContain('projectPath: input.projectPath ?? input.handoff.projectPath');
    expect(patchBridge).toContain('Continue the active card repair session');
    expect(patchBridge).toContain(
      'Use the blocker handoff and evidence below as the source of truth'
    );
    expect(patchBridge).toContain('Analyze context (advisory, not a blocker)');
    expect(patchBridge).not.toContain("buildInlineQueryFromAction('apply-debug-patch'");
    expect(provider).toContain('function sidebarPatchReviewKey');
    expect(provider).toContain('sidebarPatchReviewKey(handoff.cardId, sessionId)');
    expect(provider).toContain('studioHost.getPendingPatches(handoff.cardId, sessionId)');
    expect(provider).toContain('studioHost.deletePendingPatches(handoff.cardId, sessionId)');

    expect(secondary).toContain('StudioPatchReview');
    expect(secondary).toContain('StudioRemediationPlan');
    expect(secondary).toContain('StudioBlockerChrome');
    expect(secondary).toContain('activeStudioFixPhase');
    expect(secondary).toContain('onAutoFix={studioAutoFix}');
    expect(secondary).toContain('onVerify={studioVerifyHandoff}');
    expect(secondary).toContain('StudioRepairPrelude');
    expect(secondary).toContain('StudioRepairResult');
    expect(secondary).toContain('StudioShipLoopStepper');
    expect(secondary).toContain('scopeFromHandoff');
    expect(secondary).toContain('!activeStudioSession?.incident');
    expect(secondary).toContain('!activeStudioSession?.editorIssue');
    expect(secondary).toContain('!activeStudioSession?.scope');
    expect(secondary).toContain("data.shipLoopIntent !== 'release'");
    expect(secondary).toContain("data.shipLoopIntent === 'release'");
    expect(secondary).toContain('shipLoopContext');
    expect(secondary).toContain('setShipLoopCards([])');
    expect(secondary).toContain('studioActionProgress');
    expect(secondary).toContain('StudioActionProgress');
    expect(secondary).toContain('streamChrome={');
    expect(secondary).toContain('activeBlockerHandoff ?');
    expect(secondary).not.toContain('studioAuditState ||\n          activeStudioActionProgress');
    const actionProgress = read('webview-ui/src/sidebar/StudioActionProgress.tsx');
    expect(actionProgress).toContain('ws-sidebar__studio-action-progress');
    expect(actionProgress).not.toContain('ws-sidebar__studio-action-timeline');
    expect(actionProgress).not.toContain("span data-active={phase === 'Run'");
    const sidebarCss = read('webview-ui/src/sidebar/sidebar.css');
    expect(sidebarCss).not.toContain('.ws-sidebar__studio-action-timeline');
    const repairPrelude = read('webview-ui/src/sidebar/StudioRepairPrelude.tsx');
    expect(repairPrelude).toContain('Reading this card');
    expect(repairPrelude).toContain('Preparing the safest next step');
    expect(repairPrelude).toContain('Refresh evidence');
    expect(repairPrelude).toContain('onRefreshEvidence');
    expect(repairPrelude).not.toContain('ws-sidebar__studio-action-timeline');
    const repairResult = read('webview-ui/src/sidebar/StudioRepairResult.tsx');
    expect(repairResult).toContain('Needs next step');
    expect(repairResult).toContain('Continue repair');
    expect(repairResult).toContain("returnState.status === 'still-blocked'");
    expect(repairResult).toContain('function failureCanContinueRepair');
    expect(repairResult).toContain("failure.action === 'apply-remediation-step'");
    expect(repairResult).toContain('failureCanContinueRepair(verifyFailure)');
    expect(repairResult).toContain('Rollback available');
    const patchReview = read('webview-ui/src/sidebar/StudioPatchReview.tsx');
    expect(patchReview).toContain('Approval needed');
    expect(patchReview).toContain('Studio found file changes');
    expect(patchReview).toContain('compactStudioPathText');
    expect(patchReview).toContain('Review files');
    expect(actionProgress).toContain('onNextAction');
    expect(actionProgress).toContain('progress.nextActionLabel');
    const progressParser = read('webview-ui/src/lib/sidebarStudioActionProgress.ts');
    expect(progressParser).toContain("record.nextAction === 'continue-remediation'");
    expect(progressParser).toContain("'verifying-handoff': 'Running the card verify command'");
    expect(progressParser).toContain(
      "'running-doctor-fix': 'Doctor fix is running against workspace evidence'"
    );
    expect(provider).toContain('const doctorFixHeartbeat = setInterval');
    expect(provider).toContain('clearInterval(doctorFixHeartbeat)');
    expect(secondary).toContain("action === 'continue-remediation'");
    expect(secondary).toContain(
      "onContinueRepair={() => handleStudioProgressNextAction('continue-remediation')}"
    );
    const remediationPlan = read('webview-ui/src/sidebar/StudioRemediationPlan.tsx');
    expect(remediationPlan).toContain('capability?.primaryLabel');
    expect(remediationPlan).toContain('capability?.secondaryLabel');
    expect(remediationPlan).toContain('data-fix-kind');
    expect(remediationPlan).toContain('function isRunnableStudioCommand');
    expect(remediationPlan).toContain('const canRunDiagnostic =');
    expect(remediationPlan).toContain('!recommendedStep.canApply &&');
    expect(remediationPlan).toContain('{canRunDiagnostic ? (');
    expect(remediationPlan).toContain("trimmed.startsWith('rapidkit:')");
    expect(remediationPlan).toContain(
      '{canRunDiagnostic ? <code>{displayOriginalCommand}</code> : null}'
    );
    expect(remediationPlan).toContain('Evidence changed');
    expect(remediationPlan).toContain('Refresh evidence');
    expect(remediationPlan).toContain('Refresh evidence first');
    expect(remediationPlan).toContain('stale ? onRefreshPlan() : onApplyStep(recommendedStep.id)');
    expect(remediationPlan).toContain('busy || stale');
    expect(remediationPlan).toContain('const supportingSteps = plan.visibleSteps');
    expect(remediationPlan).toContain('aria-label="Supporting repair steps"');
    expect(remediationPlan).toContain(
      'compactStudioPathText(step.diffSummary || step.previewSummary)'
    );
    expect(sidebarCss).toContain('border-left: 2px solid');
    expect(sidebarCss).toContain('background: transparent');
    expect(secondary).toContain(
      'const progressIncidentKey = resolveStudioIncidentKeyForEvent(data)'
    );
    expect(secondary).toContain("action: 'apply-patch'");
    expect(secondary).toContain("action: 'ship-loop-step'");
    expect(secondary).toContain('rollbackCommand');
    expect(provider).toContain("title: 'Evidence changed'");
    expect(provider).toContain('Refresh evidence, then apply the updated safe step.');
    const chatTab = read('webview-ui/src/sidebar/ChatTab.tsx');
    expect(chatTab.indexOf('{props.headerChrome}')).toBeLessThan(chatTab.indexOf('<ComposerShell'));
  });

  it('shares advisor session UX primitives with an isolated studio store', () => {
    const chatTab = read('webview-ui/src/sidebar/ChatTab.tsx');
    const sessions = read('webview-ui/src/sidebar/sidebarSessions.ts');

    expect(chatTab).toContain('ChatSessionBar');
    expect(chatTab).toContain('hasChromeContent');
    expect(chatTab).toContain('repairMode || hasChromeContent ? null');
    expect(chatTab).toContain('toolbar={repairMode ? undefined : props.toolbar}');
    expect(chatTab).toContain('footerActions={repairMode ? undefined : props.footerActions}');
    expect(chatTab).toContain('suggestions={repairMode ? [] : props.suggestions}');
    expect(secondary).toContain("useChatSessions('workspaiImpact'");
    expect(secondary).toContain("useChatSessions('workspaiStudio'");
    expect(secondary).toContain('openStudioIncidentSession');
    expect(secondary).toContain('studioIncidentHandoffs');
    expect(secondary).toContain('studioIncidentPlans');
    expect(secondary).toContain('studioIncidentProgress');
    expect(secondary).toContain('studioIncidentVerifyFailures');
    expect(secondary).toContain('studioIncidentReturnStates');
    expect(secondary).toContain('studioIncidentRollbackCommands');
    expect(secondary).toContain('studioIncidentPatchReviews');
    expect(secondary).toContain('loadStudioRepairPersistedState');
    expect(secondary).toContain('persistStudioRepairState');
    expect(secondary).toContain('workspaiStudioRepair');
    expect(secondary).toContain('persistedStudioRepairState.handoffs');
    expect(secondary).toContain('persistedStudioRepairState.plans');
    expect(secondary).toContain('persistedStudioRepairState.progress');
    expect(secondary).toContain('persistedStudioRepairState.patchReviews');
    expect(secondary).toContain('clearStudioPatchReviewForIncident');
    expect(secondary).toContain('delete next[incidentKey]');
    expect(secondary).toContain('clearStudioPatchReviewForIncident();');
    expect(secondary).toContain('startStudioActionProgress');
    expect(secondary).toContain("phase: 'applying-remediation-step'");
    expect(secondary).toContain("phase: 'running-remediation-command'");
    expect(secondary).toContain("phase: 'refreshing-remediation-plan'");
    expect(secondary).toContain("phase: 'verifying-handoff'");
    expect(secondary).toContain("phase: 'applying-patch'");
    expect(secondary).toContain('activeStudioIncidentKey');
    expect(secondary).toContain('visibleStudioIncidentKey');
    expect(secondary).toContain('pendingStudioIncidentSession');
    expect(secondary).toContain('resolveStudioIncidentKeyForCard');
    expect(secondary).toContain('resolveStudioIncidentKeyForEvent');
    expect(secondary).toContain('targetIncidentKey === visibleStudioIncidentKey');
    expect(secondary).toContain('activeBlockerHandoff');
    expect(secondary).toContain('activeStudioRemediationPlan');
    expect(secondary).toContain('activeStudioActionProgress');
    expect(secondary).toContain('activeStudioVerifyFailure');
    expect(secondary).toContain('activeStudioReturnState');
    expect(secondary).toContain('activeStudioRollbackCommand');
    expect(secondary).toContain('activeStudioPatchReview');
    expect(secondary).toContain('studio-incident');
    expect(secondary).toContain('blockerSignature');
    expect(secondary).toContain('sourceCommand');
    expect(secondary).toContain('artifactPath');
    expect(secondary).toContain('restoreStudioHandoffFromSession');
    expect(secondary).toContain("handoffSource: 'session-history'");
    expect(secondary).toContain('commandRunCount: incident.commandRunCount');
    expect(secondary).toContain('resolutionHints: incident.resolutionHints');
    expect(secondary).toContain('verifyArtifact: incident.verifyArtifact');
    expect(secondary).toContain('incidentSummary: incident.incidentSummary');
    expect(secondary).toContain('workspacePath: incident.workspacePath');
    expect(secondary).toContain('projectPath: incident.projectPath');
    expect(secondary).toContain('handleSubmitStudio');
    expect(secondary).toContain('forceNew: !editorIssue');
    expect(secondary).toContain('sessionScopeSnapshot');
    expect(sessions).toContain('workspaiImpact');
    expect(sessions).toContain('workspaiStudio');
    expect(sessions).toContain('ChatSessionIncident');
    expect(sessions).toContain('cardStatus');
    expect(sessions).toContain('blockers');
    expect(sessions).toContain('commandRunCount');
    expect(sessions).toContain('resolutionClass');
    expect(sessions).toContain('resolutionHints');
    expect(sessions).toContain('verifyArtifact');
    expect(sessions).toContain('incidentSummary');
    expect(sessions).toContain('studioMode');
    expect(sessions).toContain('repairStatus');
    expect(sessions).toContain('lastActionTitle');
    expect(sessions).toContain('lastActionSummary');
    const sessionHook = read('webview-ui/src/sidebar/useChatSessions.ts');
    expect(sessionHook).toContain('openIncidentSession');
    expect(sessionHook).toContain('updateIncidentByKey');
    expect(sessionHook).toContain('session.incident?.key');
    const drawer = read('webview-ui/src/sidebar/drawers/ChatToolsDrawer.tsx');
    expect(drawer).toContain('sessionMetaLabel');
    expect(drawer).toContain('session.incident.cardLabel');
    expect(drawer).toContain('session.incident.repairStatus');
    expect(drawer).toContain('props.suggestions.length > 0');
    expect(drawer).toContain("mainTab === 'questions' && props.footerActions");
    expect(drawer).toContain('sizing="compact"');
    const sidebarCss = read('webview-ui/src/sidebar/sidebar.css');
    expect(sidebarCss).toContain('.ws-drawer-session-list');
    expect(sidebarCss).toContain('overflow-y: auto');
  });

  it('confirms the raw-HTML sidebar monolith is fully removed', () => {
    expect(provider).not.toContain('qa-shell');
    expect(provider).not.toContain('_getHtmlContentLegacyRaw');
    expect(provider).not.toContain('acquireVsCodeApi');
    // React shell is the only HTML path.
    expect(provider).toContain('buildReactWebviewHtml');
  });
});

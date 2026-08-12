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

  it('wires live Agent steering and cancellation through the durable runtime', () => {
    const chatTab = read('webview-ui/src/sidebar/ChatTab.tsx');
    const composer = read('webview-ui/src/sidebar/composer/ComposerShell.tsx');
    const sessions = read('webview-ui/src/sidebar/useChatSessions.ts');
    expect(secondary).toContain("action: 'agent-steer'");
    expect(secondary).toContain("action: 'agent-cancel'");
    expect(provider).toContain("action === 'agent-steer'");
    expect(provider).toContain("action === 'agent-cancel'");
    expect(provider).toContain('_activeStudioAgentSessions');
    expect(provider).toContain('session.steer(message)');
    expect(provider).toContain('session.cancel()');
    expect(chatTab).toContain('props.onSteer(trimmed)');
    expect(composer).toContain("? 'Stop' : 'Send'");
    expect(sessions).toContain('steerSession');
  });

  it('routes repair decisions to the CLI transaction instead of prompting the model', () => {
    expect(secondary).toContain("action: 'repair-decision'");
    expect(provider).toContain("action === 'repair-decision'");
    expect(provider).toContain('readLatestCliOwnedRepair');
    expect(provider).toContain('decideCliOwnedRepair');
    expect(provider).toContain('vscode:explicit-user-decision');
    expect(secondary).not.toContain(
      'Review the unresolved dependency blocker and present the available compatible migration'
    );
  });

  it('keeps mutation, receipts, timeline truth, and native diff on the CLI transaction plane', () => {
    const cliClient = read('src/core/workspaceRepairCliClient.ts');
    const actionProgress = read('webview-ui/src/sidebar/StudioActionProgress.tsx');
    expect(provider).toContain('repairDependencySecurity: (request) =>');
    expect(provider).toContain('upgradeDependencySecurity: (request) =>');
    expect(provider).toContain('executeCliOwnedCanonicalRepair');
    expect(provider).toContain('executeCliOwnedPatchRepair');
    expect(provider).toContain('Studio cannot execute mutating workspace commands directly.');
    expect(provider).not.toContain('STUDIO_MUTATION_AUTHORITY');
    expect(provider).not.toContain('host.repairDependencySecurity =');
    expect(provider).not.toContain('host.upgradeDependencySecurity =');
    expect(provider).not.toContain('host.applyPatches =');
    expect(provider).not.toContain('host.deleteFiles =');
    expect(provider).not.toContain('applySidebarPendingPatches');
    expect(provider).not.toContain('deleteInspectedStudioWorkspaceFiles');
    expect(provider).not.toContain('buildStudioDependencyUpgradeCommand');
    expect(provider).not.toContain('dependencyRepairAttemptsForGeneration');
    expect(provider).not.toContain('rollbackAppliedPatches');
    expect(provider).toContain("decision: 'rollback'");
    expect(provider).toContain("approvedBy: 'vscode:explicit-user-undo'");
    expect(provider).toContain('readCliOwnedRepairFileComparison');
    expect(provider).toContain('await vscode.commands.executeCommand(');
    expect(provider).toContain("'vscode.diff'");
    expect(provider).toContain('buildStudioVerifiedRepairReceipt');
    expect(cliClient).toContain(
      'file.afterHash !== undefined && file.afterHash !== file.beforeHash'
    );
    expect(cliClient).toContain('Repair checkpoint integrity failed');
    expect(secondary).toContain("case 'sidebarStudioAgentEvent'");
    expect(provider).toContain("event.type !== 'session.created'");
    expect(provider).toContain("event.type !== 'session.status'");
    expect(provider).toContain('.slice(-120)');
    expect(secondary).toContain("eventType === 'model.message'");
    expect(secondary).toContain("eventType === 'model.checkpoint'");
    expect(secondary).toContain('canUndo: changedFiles && Boolean(transactionId)');
    expect(secondary).toContain('progress.transactionId === transactionId');
    expect(actionProgress).toContain('progress.canUndo && progress.transactionId && onUndo');
    expect(actionProgress).toContain('onUndo(progress.transactionId!)');
    expect(secondary).toContain("eventType === 'tool.completed' || eventType === 'tool.failed'");
    expect(secondary).toContain("action: 'cli-repair-engine'");
    expect(secondary).toContain('Repair transaction verified');
    expect(secondary).toContain(
      "status: policyRejected ? 'done' : eventType === 'tool.completed' ? 'done' : 'failed'"
    );
    expect(secondary).toContain("'Verification remains controller-owned'");
    expect(secondary).toContain("'sidebarOpenWorkspaceDiff'");
    expect(actionProgress).toContain('exactDiffAvailable');
    expect(actionProgress).toContain('file.failReason');
  });

  it('handles every studio inbound command the host emits', () => {
    for (const command of [
      'sidebarStudioScope',
      'sidebarStudioDone',
      'sidebarStudioError',
      'sidebarStudioSessionState',
    ]) {
      expect(secondary, `React should handle inbound "${command}"`).toContain(`case '${command}'`);
      expect(provider, `host should emit "${command}"`).toContain(`'${command}'`);
    }
    expect(secondary).toContain("case 'sidebarStudioChunk'");
    expect(provider).toContain("'sidebarStudioAgentEvent'");
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
    expect(secondary).not.toContain('studioAutoStartKeysRef');
    expect(secondary).toContain('onStop={stopStudioAgent}');
    expect(secondary).toContain('reviewRequired={activeStudioReviewRequired}');
    expect(secondary).toContain("action: 'agent-cancel'");
    const remediationPlan = read('webview-ui/src/sidebar/StudioRemediationPlan.tsx');
    expect(remediationPlan).toContain('deriveStudioRepairCapability');
    expect(remediationPlan).toContain('Repair capability');
    expect(remediationPlan).toContain('Apply change');
    expect(remediationPlan).toContain('Run check');
    expect(remediationPlan).not.toContain('How I can help');
  });

  it('hydrates a blocker incident without starting repair when the Studio tab opens', () => {
    const activationStart = secondary.indexOf("case 'sidebarActivateTab':");
    const activationEnd = secondary.indexOf("case 'sidebarAiScope':", activationStart);
    const activationHandler = secondary.slice(activationStart, activationEnd);

    expect(activationStart).toBeGreaterThanOrEqual(0);
    expect(activationEnd).toBeGreaterThan(activationStart);
    expect(activationHandler).toContain('openStudioIncidentSession');
    expect(activationHandler).toContain('setStudioAutoFixBusy(false)');
    expect(activationHandler).not.toContain("action: 'auto-fix'");
    expect(activationHandler).not.toContain('studioAutoFix()');
    expect(activationHandler).toContain("action: 'agent-status'");
    const sessions = read('webview-ui/src/sidebar/useChatSessions.ts');
    expect(sessions).toContain(
      'previousIncident?.blockerSignature === input.incident.blockerSignature'
    );
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
    expect(provider).toContain(
      "handoff.studioMode === 'EXPLAIN' || handoff.studioMode === 'VERIFY_ONLY'"
    );
    expect(provider).toContain("action === 'apply-remediation-step'");
    expect(provider).toContain("action === 'run-remediation-command'");
    expect(provider).toContain("action === 'refresh-remediation-plan'");
    expect(provider).toContain('refreshing-remediation-plan');
    expect(provider).toContain("resolveDashboardCommandExecutionPlan('workspaceRemediationPlan')");
    expect(provider).toContain('resolveArtifactRemediationPlanExecution');
    expect(provider).toContain('ensureDoctorRemediationPlanRefreshCommand(sourceCommand)');
    expect(provider).toContain(
      'const refreshSucceeded = evidenceExecution.success && planExecution.success'
    );
    expect(provider).toContain('--plan --json');
    expect(provider).toContain('publishCliOwnedRepairOutcome');
    expect(provider).toContain('executeCliOwnedCanonicalRepair');
    expect(provider).toContain('executeCliOwnedPatchRepair');
    expect(provider).toContain("phase: 'starting-cli-owned-repair'");
    expect(provider).toContain('CLI-owned Studio remediation step');
    expect(provider).toContain(
      'The CLI is compiling the selected contract action; the extension will not execute its command text directly.'
    );
    expect(provider).toContain('_postSidebarDoctorRemediationPlan');
    expect(provider).toContain('dashboardEvidenceCardIsBlocking(refresh.primaryCard)');
    expect(provider).toContain("action === 'apply-patch'");
    expect(provider).toContain('_runAutonomousStudioAgent');
    expect(provider).toContain('new StudioAgentSession');
    expect(provider).toContain('createStudioAgentWorkspaiToolRegistry');
    expect(provider).toContain("'sidebarStudioDone'");
    expect(provider).toContain('_runUnifiedAssistantSession');
    expect(provider).toContain("input.assistantMode === 'agent' && input.handoff");
    expect(provider).not.toContain('extractPatchesFromAiResponse(answer');
    expect(provider).toContain('normalizePatchesForWorkspaceScope');
    expect(provider).toContain('Inspect every target before editing');
    expect(provider).toContain('requiresVerifiedCompletion: mode.requiresVerifiedCompletion');
    expect(provider).toContain('projectPath: handoff.projectPath ?? scope.projectPath');
    expect(provider).toContain('dispatchSidebarShipLoopStep');
    expect(provider).toContain('sidebarStudioShipLoop');
    expect(provider).toContain("payload?.shipLoopIntent === 'release'");
    expect(provider).toContain("input.intent !== 'release'");
    expect(provider).toContain("shipLoopIntent: 'release'");
    expect(app).toContain("options?.shipLoopIntent === 'release'");
    expect(app).toContain("shipLoopIntent: 'release'");
    expect(creationNavigation).toContain("payload?.shipLoopIntent === 'release'");
    expect(provider).toContain('ContractStudioAgentModelAdapter');
    expect(provider).toContain('refreshDashboardAfterStudioVerify');
    expect(provider).toContain('cardId?: string');
    expect(provider).toContain('cardId: input.handoff?.cardId.trim()');
    expect(provider).toContain('cardId: handoff.cardId');
    expect(provider).toContain('hasRepairPlan');
    expect(provider).toContain("? 'continue-remediation'");
    expect(provider).toContain("? 'Apply next safe step'");
    expect(provider).toContain('resolveProjectPathFromRemediationStep');
    expect(provider).toContain('remediationStepPathCandidates');
    expect(provider).toContain("path.join(cursor, '.rapidkit', 'project.json')");
    expect(provider).toContain('handoffProjectPath: handoff.projectPath');
    expect(provider).toContain('scopeProjectPath: scope.projectPath');
    expect(provider).toContain('await this._postSidebarDoctorRemediationPlan({');
    expect(provider).not.toContain('private async _executeSidebarEvidenceRepair');
    expect(provider).toContain('resolveDashboardCommandExecutionPlan(request.commandId)');
    expect(provider).toContain('preserveAllAgentConsumersForStudioRefresh');
    expect(provider).toContain("args[targetIndex + 1] = 'all'");
    expect(provider).toContain('actionLabel: `Studio Agent ${request.commandId}`');
    expect(provider).toContain('_activeStudioAgentSessions');
    expect(provider).toContain('session.steer');
    expect(provider).toContain('session.cancel');
    expect(provider).toContain('sidebarStudioEvidencePulse');
    expect(provider).toContain("'.workspai/**/*'");
    expect(provider).toContain('evidenceGeneration: repairEvidence.evidenceFingerprint');
    expect(provider).toContain('_ensureStudioEvidenceWatcher(handoff, sessionId)');
    expect(provider).toContain('^\\.workspai\\/repair\\/inbox');
    expect(provider).toContain('^\\.workspai\\/repair\\/engine\\.lock');
    expect(provider).not.toContain('projectPath: step.projectPath || scope.projectPath');
    expect(provider).not.toContain('private async _runStudioVerifyContinuation');
    expect(provider).not.toContain('applyDoctorRemediationStep');

    const patchBridge = read('src/core/sidebarStudioPatchBridge.ts');
    expect(patchBridge).toContain('buildSidebarCardRepairPatchPrompt');
    expect(patchBridge).toContain('normalizePatchesForWorkspaceScope');
    expect(patchBridge).toContain('projectPath: input.projectPath ?? input.handoff.projectPath');
    expect(patchBridge).toContain('Continue the active card repair session');
    expect(patchBridge).toContain(
      'Use the blocker handoff and evidence below as the source of truth'
    );
    expect(patchBridge).toContain('Analyze context (advisory, not a blocker)');
    expect(patchBridge).toContain('workspai.studio-evidence-action.v1');
    expect(patchBridge).toContain('evidenceFingerprint');
    expect(patchBridge).toContain('Governed artifacts changed while the model was reasoning');
    expect(patchBridge).not.toContain("buildInlineQueryFromAction('apply-debug-patch'");
    expect(provider).toContain('function sidebarPatchReviewKey');
    expect(provider).toContain('studioHost.getPendingPatches(handoff.cardId, sessionId)');
    expect(provider).toContain('studioHost.deletePendingPatches(handoff.cardId, sessionId)');

    expect(secondary).toContain('StudioPatchReview');
    expect(secondary).toContain("case 'sidebarStudioEvidencePulse'");
    expect(secondary).toContain("action: 'live-evidence'");
    expect(secondary).toContain('StudioRemediationPlan');
    expect(secondary).toContain('StudioBlockerChrome');
    expect(secondary).toContain('activeStudioFixPhase');
    expect(secondary).not.toContain('studioAutoStartKeysRef');
    expect(secondary).not.toContain('studioAutonomousStepCountsRef');
    expect(secondary).toContain('studioAttemptedRemediationStepsRef');
    expect(secondary).toContain('studioMirroredHandoffKeysRef');
    expect(secondary).toContain('setStudioAutoFixBusy(false)');
    expect(secondary).not.toContain('selectAgentStudioRemediationStep');
    expect(secondary).toContain("action: 'auto-fix'");
    expect(secondary).not.toContain('canContinueStudioAutonomously(completedSteps)');
    expect(secondary).toContain('studioAutoFix();');
    expect(secondary).not.toContain('onVerify={studioVerifyHandoff}');
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
    expect(actionProgress).not.toContain('ws-sidebar__studio-action-contract');
    expect(actionProgress).not.toContain('Action command contract');
    expect(actionProgress).not.toContain('progress.dashboardCommandId');
    expect(actionProgress).not.toContain('progress.executionChannel');
    expect(actionProgress).not.toContain('progress.capabilityGate');
    expect(actionProgress).not.toContain('ws-sidebar__studio-action-timeline');
    expect(actionProgress).not.toContain("span data-active={phase === 'Run'");
    const sidebarCss = read('webview-ui/src/sidebar/sidebar.css');
    expect(sidebarCss).not.toContain('.ws-sidebar__studio-action-timeline');
    const repairPrelude = read('webview-ui/src/sidebar/StudioRepairPrelude.tsx');
    expect(repairPrelude).toContain('Working on the repair');
    expect(repairPrelude).toContain('Start repair');
    expect(repairPrelude).toContain('Resume repair');
    expect(repairPrelude).toContain('Stop session');
    expect(repairPrelude).toContain('Choose how to continue');
    expect(repairPrelude).toContain('ws-sidebar__repair-decision-options');
    expect(repairPrelude).toContain('onDecision(decision, transactionId)');
    expect(repairPrelude).toContain('explicit engineering decision');
    expect(repairPrelude).toContain('verification required');
    expect(repairPrelude).not.toContain('ws-sidebar__repair-avatar');
    expect(repairPrelude).not.toContain('Refresh evidence');
    expect(repairPrelude).not.toContain('ws-sidebar__studio-action-timeline');
    const repairResult = read('webview-ui/src/sidebar/StudioRepairResult.tsx');
    expect(repairResult).toContain('Still working');
    expect(repairResult).toContain('Verify still failing');
    expect(repairResult).toContain('Studio is continuing from the latest evidence.');
    expect(repairResult).toContain('Studio paused safely');
    expect(repairResult).toContain('repairHold');
    expect(repairResult).toContain("returnState.status === 'verified-refreshed'");
    expect(repairResult).not.toContain('function failureCanContinueRepair');
    expect(repairResult).not.toContain('failureCanContinueRepair(verifyFailure)');
    expect(repairResult).toContain('Rollback available');
    const patchReview = read('webview-ui/src/sidebar/StudioPatchReview.tsx');
    expect(patchReview).toContain('Approval needed');
    expect(patchReview).toContain('Studio found file changes');
    expect(patchReview).toContain('compactStudioPathText');
    expect(patchReview).toContain('Review files');
    expect(actionProgress).toContain('onNextAction');
    expect(actionProgress).toContain('progress.nextActionLabel');
    expect(actionProgress).toContain('showManualNextAction');
    expect(actionProgress).toContain('showAutomaticNextAction');
    expect(actionProgress).toContain('Studio will continue from this evidence automatically.');
    expect(actionProgress).toContain('!repairBubble');
    expect(secondary).not.toContain('Ready for the next repair step');
    expect(secondary).not.toContain('Continue fix');
    expect(secondary).toContain('activeStudioRepairRunning');
    expect(secondary).toContain('isStudioRepairActivelyOwned');
    expect(secondary).toContain('terminalizeStudioProgress');
    expect(secondary).toContain('settleStudioTimeline');
    expect(secondary).toContain("status: resolved ? 'done' : 'review'");
    expect(secondary).toContain("status: 'done',\n          phase: 'observing-evidence'");
    expect(secondary).toContain('visibleStudioVerifyFailureForResult');
    expect(secondary).toContain('visibleStudioReturnStateForResult');
    expect(secondary).toContain('visibleStudioRollbackCommandForResult');
    expect(secondary).toContain('returnState={visibleStudioReturnStateForResult}');
    expect(secondary).toContain('verifyFailure={visibleStudioVerifyFailureForResult}');
    expect(secondary).toContain('rollbackCommand={visibleStudioRollbackCommandForResult}');
    expect(secondary).toContain('studioIncidentRepairHolds');
    expect(secondary).toContain('repairHolds: studioIncidentRepairHolds');
    expect(secondary).toContain("repairStatus: 'review'");
    expect(secondary).toContain('eventData.requiresUserDecision === true');
    expect(provider).toContain("event.type === 'session.failed'");
    expect(provider).toContain('failureData?.requiresUserDecision === true');
    expect(provider).toContain("typeof failureData?.terminalReason === 'string'");
    expect(provider).toContain('terminalFailureData?.requiresUserDecision === true');
    expect(provider).toContain("typeof terminalFailureData?.terminalReason === 'string'");
    expect(secondary).toContain("case 'sidebarStudioSessionState':");
    expect(secondary).toContain('data.requiresUserDecision === true');
    expect(secondary).toContain('describeStudioTerminalFailure');
    expect(secondary).toContain('terminalizeStudioTimeline');
    expect(secondary).toContain("action: 'open-setup'");
    expect(secondary).not.toContain('Studio exhausted the bounded repair strategies');
    const progressParser = read('webview-ui/src/lib/sidebarStudioActionProgress.ts');
    expect(progressParser).toContain("record.nextAction === 'continue-remediation'");
    expect(progressParser).toContain("'verifying-handoff': 'Running the card verify command'");
    expect(progressParser).toContain(
      "'running-doctor-fix': 'Doctor fix is running against workspace evidence'"
    );
    expect(secondary).toContain("action === 'continue-remediation'");
    expect(secondary).not.toContain('selectNextStudioFileRemediationStep');
    expect(secondary).not.toContain('studioAutonomousStepCountsRef');
    expect(provider).toContain(
      'Resolve the active ${handoff.cardLabel ?? handoff.cardId} blocker completely through the CLI Repair Engine.'
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
    expect(secondary.indexOf('resolveStudioIncidentKeyForSession(data.sessionId)')).toBeLessThan(
      secondary.indexOf('resolveStudioIncidentKeyForCard(data.cardId)')
    );
    expect(provider).toContain('sessionId: input.sessionId');
    expect(provider).toContain('agentOwned: input.agentOwned === true');
    expect(secondary).toContain("? 'running'");
    expect(secondary).toContain('Evidence refreshed; repair continues');
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
    expect(chatTab).toContain('allowNewSession={!repairMode}');
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
    expect(drawer).toContain('chatSessionWorkspaceKey');
    expect(drawer).toContain('groupSessionsByWorkspace');
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

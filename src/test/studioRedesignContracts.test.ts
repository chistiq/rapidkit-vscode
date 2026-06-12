import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  isStudioActionCommand,
  parseStudioActionCommand,
  STUDIO_ACTION_COMMANDS,
  STUDIO_ACTION_COMMAND_SET,
} from '../../webview-ui/src/components/StudioRedesign/state/studioActions';
import { buildStudioPosture } from '../../webview-ui/src/components/StudioRedesign/state/studioPosture';
import { buildStudioActionAuditTimeline } from '../../webview-ui/src/components/StudioRedesign/state/studioActionAudit';
import { buildStudioActionApprovalGate } from '../../webview-ui/src/components/StudioRedesign/state/studioActionApproval';
import {
  isStudioActionId,
  parseStudioActionCommand as parseHostStudioActionCommand,
  STUDIO_ACTION_COMMANDS as HOST_STUDIO_ACTION_COMMANDS,
} from '../core/studioActionCommands';

describe('StudioRedesign contracts', () => {
  const repoRoot = path.resolve(__dirname, '../..');

  it('keeps vNext studio action commands centralized and type-guarded', () => {
    expect(Object.values(STUDIO_ACTION_COMMANDS)).toEqual([
      'studio-action:run-analyze',
      'studio-action:terminal-bridge',
      'studio-action:fix-lens',
      'studio-action:impact-lens',
      'studio-action:verify-gates',
    ]);
    expect(STUDIO_ACTION_COMMAND_SET.size).toBe(5);
    expect(isStudioActionCommand(STUDIO_ACTION_COMMANDS.verifyGates)).toBe(true);
    expect(isStudioActionCommand('studio-action:unknown')).toBe(false);
    expect(parseStudioActionCommand(STUDIO_ACTION_COMMANDS.impactLens)).toBe('impact-lens');
    expect(parseStudioActionCommand('studio-action:unknown')).toBeNull();
  });

  it('keeps host and webview studio action contracts in parity', () => {
    expect(HOST_STUDIO_ACTION_COMMANDS).toEqual(STUDIO_ACTION_COMMANDS);
    expect(parseHostStudioActionCommand(HOST_STUDIO_ACTION_COMMANDS.fixLens)).toBe('fix-lens');
    expect(parseHostStudioActionCommand('studio-action:unknown')).toBeNull();
    expect(isStudioActionId('verify-gates')).toBe(true);
    expect(isStudioActionId('unknown')).toBe(false);
  });

  it('routes the main dashboard Incident Studio path to vNext instead of the legacy studio', () => {
    const appSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/App.tsx'), 'utf8');
    const welcomeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/welcomePanel.ts'),
      'utf8'
    );

    expect(appSource).toContain(
      "import { IncidentStudioVNext } from '@/components/StudioRedesign';"
    );
    expect(appSource).not.toContain(
      "import { AIIncidentStudio } from '@/components/AIIncidentStudio';"
    );
    expect(appSource).toContain('<IncidentStudioVNext');
    expect(appSource).not.toContain('<AIIncidentStudio');
    expect(appSource).toContain('handleStudioVNextMessage');
    expect(appSource).toContain('loadAIActionRegistry');
    expect(welcomeSource).toContain("case 'runStudioAction':");
    expect(welcomeSource).toContain("case 'studioMessage':");
    expect(welcomeSource).toContain("case 'runAIActionContractCommand':");
    expect(welcomeSource).toContain('_handleDashboardStudioAction');
    expect(welcomeSource).toContain('_handleDashboardStudioMessage');
    expect(welcomeSource).toContain('_handleDashboardAIActionContractCommand');
    expect(welcomeSource).toContain('_postDashboardStudioActionStatus');
    expect(welcomeSource).toContain('_buildDashboardStudioActionResult');
    expect(welcomeSource).toContain('result?: Record<string, unknown>');
    expect(welcomeSource).toContain('getAnalyzeReportPath(params.workspacePath)');
    expect(welcomeSource).toContain('_postDashboardAIActionRegistry');
    expect(welcomeSource).toContain('_runningDashboardAIActionOperation');
    expect(welcomeSource).toContain('Another AI action operation is already running');
    expect(welcomeSource).toContain('A Studio action is already running');
    expect(welcomeSource).toContain(
      "this._postDashboardStudioActionStatus(`ai-action-${operation}`, 'started')"
    );
    expect(welcomeSource).toContain('`ai-action-${operation}`');
    expect(welcomeSource).toContain("'completed'");
    expect(welcomeSource).toContain('this._runningDashboardAIActionOperation = null;');
    expect(welcomeSource).toContain('recordAIActionContract');
    expect(welcomeSource).toContain('runAIActionContractOperation');
    expect(welcomeSource).toContain('_writeDashboardAIActionEvidence');
    expect(welcomeSource).toContain('_syncDashboardLatestAIAction');
  });

  it('keeps vNext host action bridge validated and refresh-backed', () => {
    const panelSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioPanel.ts'),
      'utf8'
    );

    expect(panelSource).toContain('isStudioActionId(actionId)');
    expect(panelSource).toContain('Unknown Studio action blocked');
    expect(panelSource).toContain('_runningStudioActionId');
    expect(panelSource).toContain('Another Studio action is already running');
    expect(panelSource).toContain("_postStudioActionStatus(actionId, 'started')");
    expect(panelSource).toContain('_postStudioActionStatus(');
    expect(panelSource).toContain("'completed'");
    expect(panelSource).toContain('_postStudioActionStatus(');
    expect(panelSource).toContain('_buildStudioActionResult');
    expect(panelSource).toContain('result?: Record<string, unknown>');
    expect(panelSource).toContain('getAnalyzeReportPath(this._workspaceContext.workspacePath)');
    expect(panelSource).toContain(
      "this._postStudioActionStatus(`ai-action-${operation}`, 'started')"
    );
    expect(panelSource).toContain('`ai-action-${operation}`');
    expect(panelSource).toContain('studio-action-bridge');
    expect(panelSource).toContain("command: 'studioActionStatus'");
    expect(panelSource).toContain("await this._refreshStudioState('analyze')");
    for (const actionId of [
      'run-analyze',
      'verify-gates',
      'terminal-bridge',
      'fix-lens',
      'impact-lens',
    ]) {
      expect(panelSource).toContain(`await this._refreshStudioState(actionId);`);
      expect(panelSource).toContain(`case '${actionId}':`);
    }
  });

  it('keeps vNext structured action status wired from host to ribbon', () => {
    const appSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/incidentStudioNext.tsx'),
      'utf8'
    );
    const wrapperSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/IncidentStudioVNext.tsx'),
      'utf8'
    );
    const ribbonSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/CommandRibbon.tsx'),
      'utf8'
    );
    const sidebarSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/WorkspaceSidebar.tsx'),
      'utf8'
    );

    expect(appSource).toContain("case 'studioActionStatus':");
    expect(appSource).toContain('setIncomingActionStatus');
    expect(wrapperSource).toContain('incomingActionStatus?: StudioActionStatus | null;');
    expect(wrapperSource).toContain('studioActionStatus: incomingActionStatus');
    expect(wrapperSource).toContain('studioActionStatus={state.studioActionStatus}');
    expect(wrapperSource).toContain('approvalAuditEvents={approvalAuditEvents}');
    expect(wrapperSource).toContain('onApprovalAuditEvent={handleApprovalAuditEvent}');
    expect(wrapperSource).toContain('onRevealEvidence={onRevealEvidence}');
    expect(ribbonSource).toContain('studioActionStatus?: StudioActionStatus | null;');
    expect(ribbonSource).toContain('studioActionStatus.actionId');
    expect(ribbonSource).toContain(
      "const actionRunning = studioActionStatus?.status === 'started';"
    );
    expect(ribbonSource).toContain('disabled={actionRunning}');
    expect(sidebarSource).toContain('studioActionStatus?: StudioActionStatus | null;');
    expect(sidebarSource).toContain(
      "const actionRunning = studioActionStatus?.status === 'started';"
    );
    expect(sidebarSource).toContain('disabled={runDisabled}');
    expect(sidebarSource).toContain('buildStudioActionAuditTimeline');
    expect(sidebarSource).toContain('Action Audit');
    expect(sidebarSource).toContain("onRevealEvidence?.(event.evidencePath || '')");
    expect(sidebarSource).toContain('selectedAuditEventId');
    expect(sidebarSource).toContain('ActionAuditInspector');
    expect(sidebarSource).toContain('Reveal evidence');
    expect(sidebarSource).toContain('Failed commands');
    expect(sidebarSource).toContain('approvalAuditEvents?: StudioApprovalAuditEvent[];');
  });

  it('binds Studio action results into status, Mission Control proof, and audit evidence', () => {
    const stateSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/state/studioState.ts'),
      'utf8'
    );
    const auditSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/state/studioActionAudit.ts'),
      'utf8'
    );
    const ribbonSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/CommandRibbon.tsx'),
      'utf8'
    );
    const appSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/App.tsx'), 'utf8');
    const standaloneSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/incidentStudioNext.tsx'),
      'utf8'
    );

    expect(stateSource).toContain('export interface StudioActionResult');
    expect(stateSource).toContain('result?: StudioActionResult;');
    expect(appSource).toContain('message.data?.result');
    expect(standaloneSource).toContain('message.data?.result');
    expect(auditSource).toContain('const result = status.result;');
    expect(auditSource).toContain('evidencePath: result?.evidencePath');
    expect(auditSource).toContain('evidenceSha256: result?.evidenceSha256');
    expect(auditSource).toContain('commandCount: result?.commandCount');
    expect(auditSource).toContain('canRevealEvidence: Boolean(result?.evidencePath)');
    expect(ribbonSource).toContain('const actionResult = studioActionStatus?.result;');
    expect(ribbonSource).toContain('actionResult?.evidenceSha256');
    expect(ribbonSource).toContain('score ${actionResult.score}');
  });

  it('keeps vNext visible controls backed by real host actions or clipboard/action-item handlers', () => {
    const wrapperSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/IncidentStudioVNext.tsx'),
      'utf8'
    );
    const activitySource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/ActivityBar.tsx'),
      'utf8'
    );
    const chatSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/ChatSurface.tsx'),
      'utf8'
    );
    const appSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/App.tsx'), 'utf8');
    const standaloneSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/incidentStudioNext.tsx'),
      'utf8'
    );

    expect(activitySource).toContain('command: StudioActionCommand;');
    expect(activitySource).toContain('onExecuteAction?: (command: StudioActionCommand) => void;');
    expect(activitySource).toContain('onExecute?.(tool.command);');
    expect(activitySource).not.toContain("id: 'settings'");
    expect(activitySource).not.toContain("id: 'help'");
    for (const commandName of [
      'terminalBridge',
      'runAnalyze',
      'impactLens',
      'fixLens',
      'verifyGates',
    ]) {
      expect(activitySource).toContain(`STUDIO_ACTION_COMMANDS.${commandName}`);
    }

    expect(wrapperSource).toContain('onCopyText?: (text: string) => void;');
    expect(wrapperSource).toContain('onExecuteAction={handleSendMessage}');
    expect(wrapperSource).toContain('onCopyText={handleCopyText}');
    expect(chatSource).toContain('onCopyText?: (text: string) => void;');
    expect(chatSource).toContain('onCopyText?.(message.content)');
    expect(chatSource).toContain('onAddActionItem?.(actionText)');
    expect(chatSource).toContain(
      "onAddActionItem?.('Draft postmortem from current Studio audit trail, evidence, and approval events.')"
    );
    expect(chatSource).toContain('onExecute(STUDIO_ACTION_COMMANDS.verifyGates)');
    expect(chatSource).not.toContain('export-postmortem');
    expect(chatSource).not.toContain('archive-evidence');
    expect(appSource).toContain("onCopyText={(text) => vscode.postMessage('copyText', { text })}");
    expect(standaloneSource).toContain('onCopyText={handleCopyCommand}');
  });

  it('keeps vNext side rails data-backed instead of decorative', () => {
    const wrapperSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/IncidentStudioVNext.tsx'),
      'utf8'
    );
    const sidebarSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/WorkspaceSidebar.tsx'),
      'utf8'
    );
    const contextSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/ContextPanel.tsx'),
      'utf8'
    );

    expect(wrapperSource).toContain("id: 'evidence-proof'");
    expect(wrapperSource).not.toContain('Evidence Export');
    expect(sidebarSource).toContain('command?: StudioActionCommand;');
    expect(sidebarSource).toContain('description?: string;');
    expect(sidebarSource).toContain('onExecuteAction?.(item.command);');
    expect(sidebarSource).toContain('disabled={!onToggle}');

    for (const command of [
      "'studio-action:run-analyze'",
      "'studio-action:impact-lens'",
      "'studio-action:verify-gates'",
    ]) {
      expect(wrapperSource).toContain(`command: ${command}`);
    }

    expect(contextSource).toContain('const latestActionEntry = aiActionRegistry?.entries[0];');
    expect(contextSource).toContain(
      'const latestActionExecution = latestActionEntry?.executions[0];'
    );
    expect(contextSource).toContain('evidenceCoverageLabel');
    expect(contextSource).toContain('confidenceLabel');
    expect(contextSource).toContain('drillDownLabel');
    expect(contextSource).toContain('proofReadinessLabel');
    expect(contextSource).not.toContain('High fidelity');
    expect(contextSource).not.toContain('Export readiness');
    expect(contextSource).not.toContain('Drill-down" value="Enabled');
  });

  it('builds an evidence-bound Studio action audit timeline from live status and registry executions', () => {
    const timeline = buildStudioActionAuditTimeline({
      nowMs: new Date('2026-06-11T20:15:00.000Z').getTime(),
      status: {
        actionId: 'verify-gates',
        status: 'started',
        updatedAt: '2026-06-11T20:14:30.000Z',
      },
      registry: {
        updatedAt: '2026-06-11T20:12:00.000Z',
        entries: [
          {
            id: 'action-verify-1',
            createdAt: '2026-06-11T20:10:00.000Z',
            provider: 'studio-action-bridge',
            summary: 'Verify release gates',
            actionType: 'verify',
            riskLevel: 'low',
            validationStatus: 'valid',
            lifecycleStatus: 'verified',
            executions: [
              {
                operation: 'verify',
                ok: true,
                summary: 'Gate report verified',
                evidencePath: '/workspace/.workspai/evidence/verify.json',
                evidenceSha256: 'abcdef1234567890',
                evidenceSizeBytes: 2048,
                commandCount: 2,
                failedCommandCount: 0,
                completedAt: '2026-06-11T20:12:00.000Z',
              },
            ],
          },
        ],
      },
    });

    expect(timeline[0]).toMatchObject({
      actionId: 'verify-gates',
      outcome: 'running',
      phase: 'plan',
      canRevealEvidence: false,
    });
    expect(timeline[1]).toMatchObject({
      actionId: 'action-verify-1',
      outcome: 'verified',
      phase: 'verify',
      evidencePath: '/workspace/.workspai/evidence/verify.json',
      evidenceSha256: 'abcdef1234567890',
      evidenceSizeBytes: 2048,
      commandCount: 2,
      canRevealEvidence: true,
    });
  });

  it('builds Studio action audit timeline entries for approval decisions and operation requests', () => {
    const timeline = buildStudioActionAuditTimeline({
      nowMs: new Date('2026-06-11T20:20:00.000Z').getTime(),
      approvalEvents: [
        {
          id: 'approval-1',
          actionId: 'fix-1',
          operation: 'approval-confirmed',
          title: 'Approval confirmed',
          summary: 'Fix auth gate',
          riskLevel: 'high',
          detail: 'User reviewed action contract.',
          happenedAt: '2026-06-11T20:19:00.000Z',
        },
        {
          id: 'approval-2',
          actionId: 'fix-1',
          operation: 'apply-requested',
          title: 'apply requested',
          summary: 'Fix auth gate',
          riskLevel: 'high',
          happenedAt: '2026-06-11T20:19:30.000Z',
        },
      ],
    });

    expect(timeline[0]).toMatchObject({
      actionId: 'fix-1',
      outcome: 'requested',
      phase: 'plan',
      scope: 'approval · high risk',
      commandCount: 1,
    });
    expect(timeline[1]).toMatchObject({
      actionId: 'fix-1',
      outcome: 'approved',
      phase: 'plan',
      detail: 'User reviewed action contract.',
    });
  });

  it('keeps vNext AI action approval gated by risk, rollback, verification, and explicit confirmation', () => {
    const contextSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/regions/ContextPanel.tsx'),
      'utf8'
    );

    expect(contextSource).toContain('buildStudioActionApprovalGate');
    expect(contextSource).toContain('Risk & Approval Gate');
    expect(contextSource).toContain('actionApprovalConfirmed');
    expect(contextSource).toContain('setActionApprovalConfirmed(false)');
    expect(contextSource).toContain('onApprovalAuditEvent?:');
    expect(contextSource).toContain('postApprovalAuditEvent');
    expect(contextSource).toContain('approval-confirmed');
    expect(contextSource).toContain('approval-revoked');
    expect(contextSource).toContain('`${operation}-requested`');
    expect(contextSource).toContain(
      '!actionApprovalGate.canApplyAfterApproval || !actionApprovalConfirmed'
    );
    expect(contextSource).toContain(
      '!actionApprovalGate.canRollbackAfterApproval || !actionApprovalConfirmed'
    );
    expect(contextSource).toContain(
      'I reviewed risk, affected files, commands, verification, and rollback posture.'
    );

    const gate = buildStudioActionApprovalGate({
      actionId: 'fix-1',
      provider: 'test-provider',
      receivedAt: '2026-06-11T20:15:00.000Z',
      contract: {
        schemaVersion: 'workspai.ai-action.v1',
        actionType: 'fix',
        summary: 'Fix auth gate',
        riskLevel: 'high',
        affectedFiles: ['src/auth.ts'],
        proposedCommands: ['npm test'],
        proposedPatches: [{ relativePath: 'src/auth.ts', summary: 'Tighten auth gate' }],
        verificationCommands: ['npm run test:auth'],
        rollbackPlan: ['git checkout -- src/auth.ts'],
        confidence: 0.82,
        requiresApproval: true,
      },
      validation: {
        status: 'valid',
        issues: [],
        canApply: true,
        canVerify: true,
        canRollback: true,
      },
    });

    expect(gate).toMatchObject({
      label: 'Needs review',
      tone: 'warning',
      riskLabel: 'high risk · 82% confidence',
      hardBlocked: false,
      mutationSensitive: true,
      canApplyAfterApproval: true,
      canVerify: true,
      canRollbackAfterApproval: true,
    });
  });

  it('blocks AI action approval when rollback or verification proof is missing', () => {
    const gate = buildStudioActionApprovalGate({
      receivedAt: '2026-06-11T20:15:00.000Z',
      contract: {
        schemaVersion: 'workspai.ai-action.v1',
        actionType: 'fix',
        summary: 'Unsafe fix',
        riskLevel: 'medium',
        affectedFiles: ['src/app.ts'],
        proposedCommands: [],
        proposedPatches: [],
        verificationCommands: [],
        rollbackPlan: [],
        confidence: 0.7,
        requiresApproval: true,
      },
      validation: {
        status: 'valid',
        issues: [],
        canApply: true,
        canVerify: true,
        canRollback: true,
      },
    });

    expect(gate.label).toBe('Blocked');
    expect(gate.hardBlocked).toBe(true);
    expect(gate.canApplyAfterApproval).toBe(false);
    expect(gate.canVerify).toBe(false);
    expect(gate.canRollbackAfterApproval).toBe(false);
    expect(gate.holds.map((hold) => hold.code)).toEqual(
      expect.arrayContaining(['missing-rollback', 'missing-verification'])
    );
  });

  it('marks posture blocked when evidence or action lifecycle has a hard hold', () => {
    const posture = buildStudioPosture({
      releasePosture: 'pending',
      policyGates: {
        flowState: 'warning',
        telemetryState: 'complete',
        releasePosture: 'pending',
      },
      studioEvidence: {
        generatedAt: '2026-06-11T20:00:00.000Z',
        verdict: 'blocked',
        findings: { fail: 1, warn: 0, info: 2 },
        topFindings: [],
      },
      aiActionRegistry: {
        updatedAt: '2026-06-11T20:01:00.000Z',
        entries: [
          {
            id: 'action-1',
            createdAt: '2026-06-11T20:00:30.000Z',
            summary: 'Fix auth gate',
            actionType: 'fix',
            riskLevel: 'high',
            validationStatus: 'valid',
            lifecycleStatus: 'applied-failed-verify',
            executions: [
              {
                operation: 'verify',
                ok: false,
                summary: 'Verification failed',
                completedAt: '2026-06-11T20:01:00.000Z',
                failedCommandCount: 1,
              },
            ],
          },
        ],
      },
    });

    expect(posture.label).toBe('Blocked');
    expect(posture.tone).toBe('error');
    expect(posture.summary).toContain('Hold release');
    expect(posture.metrics.find((metric) => metric.label === 'Health')).toMatchObject({
      value: '1 err / 0 warn',
      tone: 'error',
    });
    expect(posture.metrics.find((metric) => metric.label === 'AI action')).toMatchObject({
      value: 'applied-failed-verify',
      tone: 'error',
    });
  });

  it('marks posture needs review for pending gates without blockers', () => {
    const posture = buildStudioPosture({
      releasePosture: 'pending',
      policyGates: {
        flowState: 'passing',
        telemetryState: 'partial',
        releasePosture: 'pending',
      },
      studioEvidence: {
        generatedAt: '2026-06-11T20:00:00.000Z',
        verdict: 'needs-attention',
        findings: { fail: 0, warn: 2, info: 3 },
        topFindings: [],
      },
    });

    expect(posture.label).toBe('Needs Review');
    expect(posture.tone).toBe('warning');
    expect(posture.nextProof).toContain('verify gates');
    expect(posture.proof).toBe('0 fail / 2 warn');
  });

  it('marks posture ready when gates, evidence, and action history are clean', () => {
    const posture = buildStudioPosture({
      releasePosture: 'go',
      policyGates: {
        flowState: 'passing',
        telemetryState: 'complete',
        releasePosture: 'go',
      },
      studioEvidence: {
        generatedAt: '2026-06-11T20:00:00.000Z',
        verdict: 'ready',
        findings: { fail: 0, warn: 0, info: 5 },
        topFindings: [],
      },
      aiActionRegistry: {
        updatedAt: '2026-06-11T20:02:00.000Z',
        entries: [
          {
            id: 'action-2',
            createdAt: '2026-06-11T20:01:00.000Z',
            summary: 'Verify gates',
            actionType: 'verify',
            riskLevel: 'low',
            validationStatus: 'valid',
            lifecycleStatus: 'verified',
            executions: [
              {
                operation: 'verify',
                ok: true,
                summary: 'Verification passed',
                evidenceSha256: '1234567890abcdef',
                completedAt: '2026-06-11T20:02:00.000Z',
              },
            ],
          },
        ],
      },
    });

    expect(posture.label).toBe('Ready');
    expect(posture.tone).toBe('ok');
    expect(posture.proof).toBe('sha256:1234567890ab');
    expect(posture.action).toBe('verify/verified');
  });
});

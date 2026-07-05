import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  isStudioActionCommand,
  parseStudioActionCommand,
  getStudioActionRegistryEntry,
  STUDIO_ACTION_COMMANDS,
  STUDIO_ACTION_COMMAND_SET,
  STUDIO_ACTION_REGISTRY,
} from '../../webview-ui/src/components/StudioRedesign/state/studioActions';
import { buildStudioPosture } from '../../webview-ui/src/components/StudioRedesign/state/studioPosture';
import { buildStudioActionAuditTimeline } from '../../webview-ui/src/components/StudioRedesign/state/studioActionAudit';
import { buildStudioActionApprovalGate } from '../../webview-ui/src/components/StudioRedesign/state/studioActionApproval';
import {
  getStudioActionRegistryEntryById as getHostStudioActionRegistryEntryById,
  isStudioActionId,
  parseStudioActionCommand as parseHostStudioActionCommand,
  STUDIO_ACTION_COMMANDS as HOST_STUDIO_ACTION_COMMANDS,
  STUDIO_ACTION_REGISTRY as HOST_STUDIO_ACTION_REGISTRY,
} from '../core/studioActionCommands';

describe('StudioRedesign contracts', () => {
  const repoRoot = path.resolve(__dirname, '../..');

  it('keeps vNext studio action commands centralized and type-guarded', () => {
    expect(Object.values(STUDIO_ACTION_COMMANDS)).toEqual([
      'studio-action:run-analyze',
      'studio-action:terminal-bridge',
      'studio-action:fix-lens',
      'studio-action:install-module',
      'studio-action:impact-lens',
      'studio-action:verify-gates',
    ]);
    expect(STUDIO_ACTION_COMMAND_SET.size).toBe(6);
    expect(isStudioActionCommand(STUDIO_ACTION_COMMANDS.verifyGates)).toBe(true);
    expect(isStudioActionCommand('studio-action:unknown')).toBe(false);
    expect(parseStudioActionCommand(STUDIO_ACTION_COMMANDS.impactLens)).toBe('impact-lens');
    expect(parseStudioActionCommand('studio-action:unknown')).toBeNull();
  });

  it('keeps host and webview studio action contracts in parity', () => {
    expect(HOST_STUDIO_ACTION_COMMANDS).toEqual(STUDIO_ACTION_COMMANDS);
    expect(HOST_STUDIO_ACTION_REGISTRY).toEqual(STUDIO_ACTION_REGISTRY);
    expect(parseHostStudioActionCommand(HOST_STUDIO_ACTION_COMMANDS.fixLens)).toBe('fix-lens');
    expect(parseHostStudioActionCommand('studio-action:unknown')).toBeNull();
    expect(isStudioActionId('verify-gates')).toBe(true);
    expect(isStudioActionId('unknown')).toBe(false);
    expect(getHostStudioActionRegistryEntryById('fix-lens').actionType).toBe('fix');
    expect(getHostStudioActionRegistryEntryById('impact-lens').actionType).toBe('impact');
  });

  it('keeps Studio action metadata centralized in the shared registry', () => {
    const commands = Object.values(STUDIO_ACTION_COMMANDS);
    expect(new Set(STUDIO_ACTION_REGISTRY.map((entry) => entry.command))).toEqual(
      new Set(commands)
    );
    expect(STUDIO_ACTION_REGISTRY).toHaveLength(commands.length);
    for (const command of commands) {
      const entry = getStudioActionRegistryEntry(command);
      expect(entry.command).toBe(command);
      expect(entry.title).toBeTruthy();
      expect(entry.shortLabel).toBeTruthy();
      expect(entry.summary).toBeTruthy();
      expect(entry.description).toBeTruthy();
    }
  });

  it('does not build a standalone incident-studio-next webview entry', () => {
    const esbuildSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/esbuild.js'), 'utf8');
    expect(esbuildSource).not.toContain('incident-studio-next');
    expect(esbuildSource).toContain("sidebar: 'src/sidebar/index.tsx'");
    expect(fs.existsSync(path.join(repoRoot, 'webview-ui/src/incidentStudioNext.tsx'))).toBe(false);
    expect(
      fs.existsSync(
        path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/IncidentStudioVNext.tsx')
      )
    ).toBe(false);
  });

  it('routes the main dashboard Studio path to the Workspai sidebar instead of embedding Studio', () => {
    const appSource = fs.readFileSync(path.join(repoRoot, 'webview-ui/src/App.tsx'), 'utf8');
    const welcomeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/welcomePanel.ts'),
      'utf8'
    );
    const creationNavigationMessagesSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/welcomePanelCreationNavigationMessages.ts'),
      'utf8'
    );
    const combinedCreationNavigationHostSource = `${welcomeSource}\n${creationNavigationMessagesSource}`;
    const incidentStudioMessagesSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/welcomePanelIncidentStudioMessages.ts'),
      'utf8'
    );
    const combinedIncidentStudioHostSource = `${welcomeSource}\n${incidentStudioMessagesSource}`;
    const dashboardStudioSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/welcomePanelDashboardStudio.ts'),
      'utf8'
    );
    const combinedStudioHostSource = `${welcomeSource}\n${dashboardStudioSource}\n${incidentStudioMessagesSource}`;
    const redesignIndexSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/index.ts'),
      'utf8'
    );

    expect(appSource).not.toContain(
      "import { IncidentStudioVNext } from '@/components/StudioRedesign';"
    );
    expect(appSource).not.toContain(
      "import { AIIncidentStudio } from '@/components/AIIncidentStudio';"
    );
    expect(appSource).not.toContain('<IncidentStudioVNext');
    expect(appSource).not.toContain('<AIIncidentStudio');
    expect(appSource).toContain("vscode.postMessage('openStudioSidebarTab'");
    expect(appSource).not.toContain("vscode.postMessage('openIncidentStudioTab'");
    expect(appSource).not.toContain("type WorkspaiActiveView = 'dashboard' | 'incident-studio'");
    expect(appSource).not.toContain("case 'openIncidentStudio'");
    expect(appSource).toContain("vscode.postMessage('openCreateWithAITab'");
    expect(appSource).toContain("vscode.postMessage('openWorkspaceAdvisorTab'");
    expect(appSource).toContain("trigger: 'legacy-context-assist-handoff'");
    expect(appSource).toContain('initialQuestion: message.data?.prefillQuestion');
    expect(combinedCreationNavigationHostSource).toContain("case 'openCreateWithAITab':");
    expect(combinedCreationNavigationHostSource).toContain("case 'openWorkspaceAdvisorTab':");
    expect(combinedCreationNavigationHostSource).toContain("case 'openStudioSidebarTab':");
    expect(combinedCreationNavigationHostSource).toContain("workspai.openWorkspaceAdvisor'");
    expect(welcomeSource).toContain('_routeStudioToSecondarySidebar');
    expect(welcomeSource).not.toContain('_incidentPanel');
    expect(welcomeSource).not.toContain('_pendingIncidentStudioOpen');
    expect(welcomeSource).not.toContain('openIncidentStudioInNewTab');
    expect(welcomeSource).not.toContain("_postWebviewMessage('openIncidentStudio'");
    expect(welcomeSource).toContain("source: 'legacy-ai-modal-bridge'");
    expect(combinedCreationNavigationHostSource).toContain(
      'initialQuestion: payload?.initialQuestion || payload?.prefillQuestion'
    );
    expect(combinedCreationNavigationHostSource).toContain(
      'initialTask: payload?.initialTask || payload?.initialQuery'
    );
    expect(welcomeSource).not.toContain("_postWebviewMessage('openAIModal'");
    expect(welcomeSource).toContain('tryDispatchIncidentStudioWebviewMessage(');
    expect(combinedIncidentStudioHostSource).toContain("case 'runStudioAction':");
    expect(combinedIncidentStudioHostSource).toContain("case 'studioMessage':");
    expect(combinedIncidentStudioHostSource).toContain("case 'runAIActionContractCommand':");
    expect(combinedIncidentStudioHostSource).toContain('isDashboardStudioSidebarOnly');
    expect(welcomeSource).not.toContain("case 'runStudioAction':");
    expect(welcomeSource).not.toContain("case 'studioMessage':");
    expect(welcomeSource).toContain("get<boolean>('studio.sidebarOnly', true)");
    expect(combinedStudioHostSource).toContain('_handleDashboardStudioAction');
    expect(combinedStudioHostSource).toContain('_handleDashboardStudioMessage');
    expect(combinedStudioHostSource).toContain('_handleDashboardAIActionContractCommand');
    expect(combinedStudioHostSource).toContain('postDashboardStudioActionStatus');
    expect(combinedStudioHostSource).toContain('buildDashboardStudioActionResult');
    expect(combinedStudioHostSource).toContain('buildStudioAIActionResult');
    expect(combinedStudioHostSource).toContain('_postDashboardAIActionRegistry');
    expect(combinedStudioHostSource).toContain('_runningDashboardAIActionOperation');
    expect(combinedStudioHostSource).toContain('Another AI action operation is already running');
    expect(combinedStudioHostSource).toContain('A Studio action is already running');
    expect(combinedStudioHostSource).toContain('executeGovernedAIActionOperation');
    expect(combinedStudioHostSource).toContain('publishStudioAIActionContractFromText');
    expect(combinedStudioHostSource).toContain("'completed'");
    expect(combinedStudioHostSource).toContain('setRunning: (nextOperation) =>');
    expect(combinedStudioHostSource).toContain('_syncDashboardLatestAIAction');
    expect(redesignIndexSource).toContain('Studio lives in the secondary sidebar');
    expect(redesignIndexSource).not.toContain('./regions/');
  });

  it('keeps host studio action bridge validated and refresh-backed', () => {
    const aiActionBridgeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioAIActionBridge.ts'),
      'utf8'
    );
    const actionBridgeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/incidentStudioActionBridge.ts'),
      'utf8'
    );
    const welcomeSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/welcomePanel.ts'),
      'utf8'
    );
    const incidentStudioMessagesSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/welcomePanelIncidentStudioMessages.ts'),
      'utf8'
    );
    const combinedIncidentStudioHostSource = `${welcomeSource}\n${incidentStudioMessagesSource}`;
    const dashboardStudioSource = fs.readFileSync(
      path.join(repoRoot, 'src/ui/panels/welcomePanelDashboardStudio.ts'),
      'utf8'
    );
    const combinedStudioHostSource = `${welcomeSource}\n${dashboardStudioSource}\n${incidentStudioMessagesSource}`;
    const studioStateSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/state/studioState.ts'),
      'utf8'
    );
    const actionAuditSource = fs.readFileSync(
      path.join(repoRoot, 'webview-ui/src/components/StudioRedesign/state/studioActionAudit.ts'),
      'utf8'
    );

    expect(combinedStudioHostSource).toContain('isStudioActionId(actionId)');
    expect(combinedStudioHostSource).toContain('getStudioActionRegistryEntryById(studioActionId)');
    expect(combinedStudioHostSource).toContain('actionDefinition.actionType');
    expect(combinedStudioHostSource).toContain('actionTitle: actionDefinition?.title');
    expect(combinedStudioHostSource).toContain('actionSummary: actionDefinition?.summary');
    expect(combinedStudioHostSource).not.toContain("actionId === 'fix-lens'");
    expect(combinedStudioHostSource).not.toContain("actionId === 'impact-lens'");
    expect(combinedStudioHostSource).toContain('Unknown Studio action blocked');
    expect(combinedStudioHostSource).toContain('_runningStudioActionId');
    expect(combinedStudioHostSource).toContain('Another Studio action is already running');
    expect(combinedStudioHostSource).toContain("postWebviewMessage('studioActionStatus'");
    expect(combinedStudioHostSource).toContain("'completed'");
    expect(combinedStudioHostSource).toContain('result?: Record<string, unknown>');
    expect(combinedStudioHostSource).toContain('executeGovernedAIActionOperation');
    expect(combinedStudioHostSource).toContain('_runningDashboardAIActionOperation');
    expect(aiActionBridgeSource).toContain('`ai-action-${operation}`');
    expect(actionBridgeSource).toContain('import type { StudioActionId }');
    expect(actionBridgeSource).toContain('actionId: StudioActionId');
    expect(studioStateSource).toContain('actionTitle?: string;');
    expect(studioStateSource).toContain('export interface StudioProofEvent');
    expect(studioStateSource).toContain("schemaVersion: 'workspai.studio.proof-event.v1'");
    expect(actionAuditSource).toContain('const proofEvent = result?.proofEvent;');
    expect(combinedStudioHostSource).toContain('studio-action-bridge');
    expect(combinedStudioHostSource).toContain('executeStudioActionById');
    expect(welcomeSource).toContain('tryDispatchIncidentStudioWebviewMessage(');
    expect(combinedIncidentStudioHostSource).toContain("case 'requestIncidentStudioTelemetry':");
    expect(welcomeSource).not.toContain(
      "case 'verify-gates':\n          await runWorkspaceAnalyze"
    );
    for (const actionId of [
      'run-analyze',
      'verify-gates',
      'terminal-bridge',
      'fix-lens',
      'install-module',
      'impact-lens',
    ]) {
      expect(actionBridgeSource).toContain(actionId);
    }
  });

  it('builds an evidence-bound Studio action audit timeline from live status and registry executions', () => {
    const timeline = buildStudioActionAuditTimeline({
      nowMs: new Date('2026-06-11T20:15:00.000Z').getTime(),
      status: {
        actionId: 'verify-gates',
        status: 'started',
        updatedAt: '2026-06-11T20:14:30.000Z',
        result: {
          summary: 'Verify gates running',
          proofEvent: {
            schemaVersion: 'workspai.studio.proof-event.v1',
            actionId: 'verify-gates',
            status: 'started',
            summary: 'Verify gates running',
            generatedAt: '2026-06-11T20:14:30.000Z',
            source: 'studio-action',
            executionTranscriptId: 'transcript-verify-1',
            durationMs: 1200,
          },
          executionTranscript: {
            schemaVersion: 'workspai.studio.execution-transcript.v1',
            id: 'transcript-verify-1',
            actionId: 'verify-gates',
            source: 'studio-action',
            title: 'Verify gates',
            status: 'completed',
            startedAt: '2026-06-11T20:14:28.800Z',
            completedAt: '2026-06-11T20:14:30.000Z',
            durationMs: 1200,
            commandCount: 1,
            failedCommandCount: 0,
            steps: [
              {
                id: 'transcript-verify-1-step-1',
                command: 'npx rapidkit doctor workspace',
                status: 'passed',
                exitCode: 0,
              },
            ],
          },
        },
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
                proof: {
                  schemaVersion: 'workspai.ai-action-proof-summary.v1',
                  evidenceRequired: true,
                  evidencePresent: true,
                  evidenceSha256Present: true,
                  transcriptRequired: true,
                  transcriptCommandCount: 2,
                  failedCommandCount: 0,
                  rollbackProofRequired: true,
                  rollbackPlanPresent: true,
                  complete: true,
                  issues: [],
                },
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
      transcriptId: 'transcript-verify-1',
      durationMs: 1200,
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
      proofComplete: true,
      rollbackProofRequired: true,
      rollbackPlanPresent: true,
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

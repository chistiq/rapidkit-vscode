import * as path from 'node:path';
import fs from 'fs-extra';
import * as vscode from 'vscode';

import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';
import type { AIConversationHistoryEntry } from './aiService.js';
import { askConfiguredAIProviderForToolAction } from './aiProviderService.js';
import { normalizePatchesForWorkspaceScope, type FilePatch } from './patchApplyEngine.js';
import { collectSidebarStudioRepairEvidence } from './sidebarStudioPatchBridge.js';
import { inspectStudioAgentFiles } from './sidebarStudioAgentRuntime.js';
import { StudioAgentSession } from './studioAgentSession.js';
import { ContractStudioAgentModelAdapter } from './studioAgentModelProtocol.js';
import type { StudioAgentToolApprovalGrant } from './studioAgentToolRegistry.js';
import { VSCodeStudioAgentSessionStore } from './studioAgentSessionStore.js';
import {
  createStudioAgentWorkspaiToolRegistry,
  type StudioAgentWorkspaiToolHost,
} from './studioAgentWorkspaiTools.js';
import { studioHostLanguageModelToolAdapters } from './studioHostLanguageModelTools.js';
import { renderNativeStudioAgentEvent } from './nativeChatToolEventRenderer.js';
import { buildStudioIncidentGraph } from './studioIncidentGraph.js';
import {
  resolveStudioRepairGoalScope,
  resolveStudioRepairProjectTarget,
} from './studioRepairProjectTarget.js';
import {
  discoverStudioWorkspaceFiles,
  inspectStudioWorkspaceChanges,
  inspectStudioWorkspaceDiagnostics,
  searchStudioWorkspaceSource,
} from './studioWorkspaceInspection.js';
import { runRapidkitStreaming } from './streamingRapidkitRunner.js';
import { buildWorkspaceGraphSearchCommand } from './workspaceGraphSearchCommand.js';
import {
  resolveStudioWorkspaceCommandPlan,
  type StudioWorkspaceCommandRequest,
} from './studioWorkspaceCommand.js';
import { executeStudioWorkspaceCommandTransaction } from './studioWorkspaceCommandTransaction.js';
import {
  studioProofEffectClassesForCommand,
  StudioProofCarryingChangeSession,
} from './studioProofCarryingChange.js';
import {
  requestVSCodeProofCarryingChangeResume,
  requestVSCodeStudioToolApproval,
} from './studioToolApproval.js';
import { runStudioCodeIntelligenceTool } from './studioCodeIntelligence.js';
import {
  authorizeStudioWorkspacePatchTargets,
  compileInspectedStudioDeletePatches,
  compileInspectedStudioTextEdits,
} from './studioWorkspaceFileTransactions.js';
import {
  executeCliOwnedCanonicalRepair,
  executeCliOwnedPatchRepair,
  type WorkspaceRepairDecision,
  type WorkspaceRepairProgress,
} from './workspaceRepairCliClient.js';
import { buildDashboardEvidenceBundle } from './dashboardEvidenceBridge.js';
import { buildStudioBlockerHandoff } from './studioBlockerHandoffBuilder.js';
import { resolveStudioCausalProducerRoute } from './studioCausalProducerRouter.js';
import { buildStudioCausalRecoveryBriefing } from './studioCausalRecoveryBriefing.js';
import {
  isExpectedDiagnosticFindingExit,
  runIncidentInlineCommand,
} from '../ui/panels/incidentStudioInlineCommandBridge.js';
import {
  clearDoctorRemediationPlanCache,
  readDoctorRemediationPlanForStudio,
} from './doctorRemediationPlanReader.js';
import {
  ensureStudioRemediationRecovery,
  selectStudioRemediationEnvironmentPrerequisite,
  selectStudioRemediationRecoveryStep,
} from './studioRemediationRecovery.js';
import {
  applyStudioGovernedCommandReuse,
  bindStudioGovernedCommandScope,
  preserveAllAgentConsumersForStudioRefresh,
  resolveDashboardCommandExecutionPlan,
} from './dashboardCommandExecutionPlan.js';
import {
  STUDIO_CANONICAL_INTELLIGENCE_ARGS,
  STUDIO_CANONICAL_INTELLIGENCE_COMMAND,
} from './studioCanonicalIntelligenceRepair.js';
import {
  resolveWorkspaceIntelligenceRunPreflight,
  resolveWorkspaceIntelligenceRunStage,
  resolveWorkspaceIntelligenceStreamProgress,
} from './workspaceIntelligenceChainContract.js';
import type { StudioEvidenceRefreshCommandId } from './sidebarStudioAgentRuntime.js';
import {
  buildStudioDependencySecurityCommand,
  parseStudioDependencyUpgradeCandidates,
  resolveStudioDependencySecurityTarget,
} from './studioDependencySecurity.js';
import { buildRapidkitCommand } from '../utils/platformCapabilities.js';
import {
  buildStudioVerifiedRepairReceipt,
  presentStudioCliOwnedRepairObservation,
  selectStudioPostCliSourceCandidates,
} from './studioRepairReceipt.js';
import { renderNativeRepairDecisionButtons } from './nativeChatRepairDecisionActions.js';
import {
  requireStudioCardRepairCapability,
  studioCardSupportsGovernedSourceMutation,
} from '../contracts/studioCardRepairCapabilities.js';
import {
  bootstrapProjectAgent,
  requireReadyProjectAgentBootstrap,
} from './projectAgentBootstrap.js';
import { prepareGovernedGoalSession } from './governedGoalSession.js';

type NativeAgentStream = Pick<vscode.ChatResponseStream, 'button' | 'markdown' | 'progress'>;

const REPAIR_DECISIONS = new Set<WorkspaceRepairDecision>([
  'approve-guarded',
  'approve-invasive',
  'allow-breaking',
  'allow-force',
  'manual-repair',
  'rollback',
  'cancel',
]);

function toolOutputRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : { canonicalVerification: value };
}

export async function runNativeChatStudioAgent(input: {
  extensionContext: vscode.ExtensionContext;
  workspacePath: string;
  projectPath?: string;
  handoff: StudioBlockerHandoff;
  task: string;
  stream: NativeAgentStream;
  token: vscode.CancellationToken;
  requestedModelId?: string;
  initialSourceRepairDirective?: Record<string, unknown>;
  initialConversation?: AIConversationHistoryEntry[];
}): Promise<{
  status: string;
  sessionId: string;
  transactionIds: string[];
  changedPaths: string[];
}> {
  const projectBootstrap = await bootstrapProjectAgent({
    projectPath: input.projectPath,
    workspacePath: input.workspacePath,
    consumer: 'generic',
  });
  requireReadyProjectAgentBootstrap(projectBootstrap);

  let activeHandoff = input.handoff;
  const initialEvidenceBundle = await buildDashboardEvidenceBundle({
    workspacePath: input.workspacePath,
    projectPath: input.projectPath,
  });
  const currentCard = initialEvidenceBundle.cards.find((card) => card.id === input.handoff.cardId);
  if (currentCard) {
    activeHandoff = await buildStudioBlockerHandoff({
      card: currentCard,
      workspacePath: input.workspacePath,
      projectPath: input.projectPath,
      handoffSource: 'dashboard',
      extensionContext: input.extensionContext,
    });
  }
  let repairEvidence = await collectSidebarStudioRepairEvidence({
    workspacePath: input.workspacePath,
    projectPath: input.projectPath,
    handoff: activeHandoff,
  });
  const cardRepairCapability = requireStudioCardRepairCapability(activeHandoff.cardId);
  const inspectedSource = new Map<string, string | null>();
  const commandGenerations = new Map<StudioEvidenceRefreshCommandId, string>();
  const commandAttempts = new Map<
    StudioEvidenceRefreshCommandId,
    { blockerSignature?: string; evidenceGeneration: string; count: number }
  >();
  let activeBlockerSignature = activeHandoff.blockerSignature;
  const projectName = resolveStudioRepairProjectTarget({
    affectedProjectNames: activeHandoff.affectedProjectNames,
    projectPath: input.projectPath,
  });
  const governedChangeGoal = await prepareGovernedGoalSession({
    workspacePath: input.workspacePath,
    objective: [
      input.task,
      `Resolve ${activeHandoff.cardLabel ?? activeHandoff.cardId}.`,
      ...activeHandoff.blockers.slice(0, 3),
    ].join(' '),
    scope: resolveStudioRepairGoalScope({
      handoffScope: activeHandoff.scope,
      affectedProjectNames: activeHandoff.affectedProjectNames,
      projectPath: input.projectPath,
    }),
    selectScope: async () => ({ kind: 'workspace' }),
    onPhase: (label) => input.stream.progress(label),
  });
  const proofCarryingChange = new StudioProofCarryingChangeSession({
    workspacePath: input.workspacePath,
    goalId: governedChangeGoal.goalPackId,
    actorId: 'vscode:native-chat-agent',
    requestResume: requestVSCodeProofCarryingChangeResume,
  });
  const receiptedRepairTransactions = new Set<string>();
  const reportProgress = (callback?: (data: Record<string, unknown>) => Promise<void>) =>
    callback ? (progress: WorkspaceRepairProgress) => callback({ repair: progress }) : undefined;

  const refreshDependencyDoctorEvidence = async (workspacePath: string) => {
    const plan = resolveDashboardCommandExecutionPlan('checkWorkspaceHealth');
    if (plan.cliArgs.length === 0) {
      throw new Error('Doctor evidence producer is unavailable.');
    }
    const command = buildRapidkitCommand(plan.cliArgs);
    const execution = await runIncidentInlineCommand({
      command,
      workspacePath,
      actionId: 'native-chat-dependency-doctor-refresh',
    });
    if (![0, 1, 2].includes(execution.exitCode ?? -1)) {
      throw new Error(execution.error ?? execution.stderrTail ?? 'Doctor evidence refresh failed.');
    }
    repairEvidence = await collectSidebarStudioRepairEvidence({
      workspacePath,
      projectPath: input.projectPath,
      handoff: activeHandoff,
    });
    return execution;
  };

  const presentCliRepairResult = async (
    result: Awaited<ReturnType<typeof executeCliOwnedCanonicalRepair>>
  ) => {
    repairEvidence = await collectSidebarStudioRepairEvidence({
      workspacePath: input.workspacePath,
      projectPath: input.projectPath,
      handoff: activeHandoff,
    });
    const observation = presentStudioCliOwnedRepairObservation({
      result,
      sourceCandidates: selectStudioPostCliSourceCandidates({
        autonomousTargetPaths: repairEvidence.autonomousTargetPaths,
        checkpointFiles: result.transaction.checkpoint.files,
      }),
      authorizedEvidencePaths: repairEvidence.authorizedEvidencePaths,
      evidenceGeneration: repairEvidence.evidenceFingerprint,
      proposalRejectedInstruction:
        'Do not retry the rejected content. Inspect the exact producer evidence, map its blocking finding to a causal source target, inspect that source, and submit a materially different bounded proposal.',
    });
    const terminalRepairState = ['closed', 'failed', 'rolled-back', 'cancelled'].includes(
      result.transaction.state
    );
    if (terminalRepairState && !receiptedRepairTransactions.has(result.transaction.transactionId)) {
      observation.output.proofCarryingChange = await proofCarryingChange.recordRepairEffect({
        result,
        projectPath: input.projectPath,
      });
      receiptedRepairTransactions.add(result.transaction.transactionId);
    } else if (proofCarryingChange.activeChangeId) {
      observation.output.proofCarryingChange = await proofCarryingChange.status();
    }
    return observation;
  };

  const runCanonicalRepair = async (request: {
    workspacePath: string;
    projectPath?: string;
    projectName?: string;
    actionId?: string;
    approval?: StudioAgentToolApprovalGrant;
    reportProgress?: (data: Record<string, unknown>) => Promise<void>;
  }) => {
    const approvedBy = request.approval?.approvedBy ?? 'policy:vscode:native-chat-agent';
    await proofCarryingChange.authorize(['command'], approvedBy);
    const result = await executeCliOwnedCanonicalRepair({
      workspacePath: request.workspacePath,
      cardId: activeHandoff.cardId,
      projectName: request.projectName ?? projectName,
      ...(request.actionId ? { actionId: request.actionId } : {}),
      approvedBy,
      reportProgress: reportProgress(request.reportProgress),
    });
    return presentCliRepairResult(result);
  };

  const host: StudioAgentWorkspaiToolHost = {
    ...studioHostLanguageModelToolAdapters(input.token),
    recoverActiveBlocker: async (request) => {
      const producerRoute = resolveStudioCausalProducerRoute(activeHandoff);
      const recovery = await ensureStudioRemediationRecovery({
        workspacePath: request.workspacePath,
        handoff: {
          ...activeHandoff,
          ...(request.projectPath ? { projectPath: request.projectPath } : {}),
        },
        projectPath: request.projectPath,
        maxSteps: 64,
        actionId: 'native-chat-repair-plan-preflight',
      });
      const step = selectStudioRemediationRecoveryStep(recovery.plan, activeHandoff);
      const environmentPrerequisite = selectStudioRemediationEnvironmentPrerequisite(recovery.plan);
      return buildStudioCausalRecoveryBriefing({
        blockers: activeHandoff.blockers,
        sourceCandidates: repairEvidence.autonomousTargetPaths,
        evidenceGeneration: repairEvidence.evidenceFingerprint,
        ...(producerRoute ? { producerRoute } : {}),
        ...(environmentPrerequisite
          ? {
              environmentPrerequisite: {
                id: environmentPrerequisite.id,
                summary:
                  environmentPrerequisite.blockedReason ??
                  environmentPrerequisite.previewSummary ??
                  'A required runtime or executable is unavailable.',
                requirements: environmentPrerequisite.requirements,
                retryPolicy: environmentPrerequisite.retryPolicy,
              },
            }
          : {}),
        ...(step
          ? {
              remediationStep: {
                id: step.id,
                ...(step.actionId ? { actionId: step.actionId } : {}),
                ...(step.projectName ? { projectName: step.projectName } : {}),
                ...(step.projectPath ? { projectPath: step.projectPath } : {}),
                risk: step.risk,
                canApply: step.canApply,
                executable: step.executable,
                executionKind: step.executionKind,
                executionReady: step.executionReady,
                requiresApproval: step.requiresApproval,
                files: step.files,
                ...(step.verifyCommand ? { verifyCommand: step.verifyCommand } : {}),
              },
            }
          : {}),
        remediationPlanRefreshed: recovery.refreshed,
        ...(recovery.refreshError ? { remediationPlanError: recovery.refreshError } : {}),
      });
    },
    discover: async (request) => ({
      ok: true,
      output: { files: await discoverStudioWorkspaceFiles(request) },
      evidenceGeneration: repairEvidence.evidenceFingerprint,
    }),
    inspect: async (request) => {
      const observations = await inspectStudioAgentFiles({
        workspacePath: request.workspacePath,
        projectPath: request.projectPath,
        paths: request.paths,
        kind: request.kind,
        ...(request.lineStart !== undefined ? { lineStart: request.lineStart } : {}),
        ...(request.lineEnd !== undefined ? { lineEnd: request.lineEnd } : {}),
        authorizedEvidencePaths: repairEvidence.authorizedEvidencePaths,
      });
      if (request.kind === 'source') {
        observations.forEach((entry) => {
          inspectedSource.set(entry.path, entry.sha256);
          repairEvidence.expectedBaseSha256[entry.path] = entry.sha256;
          if (request.projectPath) {
            const workspaceRelative = path
              .relative(request.workspacePath, path.resolve(request.projectPath, entry.path))
              .replace(/\\/g, '/');
            if (workspaceRelative) {
              inspectedSource.set(workspaceRelative, entry.sha256);
              repairEvidence.expectedBaseSha256[workspaceRelative] = entry.sha256;
            }
          }
        });
      }
      return {
        ok: true,
        output: observations,
        evidenceGeneration: repairEvidence.evidenceFingerprint,
      };
    },
    search: async (request) => ({ ok: true, output: await searchStudioWorkspaceSource(request) }),
    graphSearch: async (request) => {
      const limit = Math.min(Math.max(Math.trunc(request.limit ?? 12), 1), 50);
      const execution = await runRapidkitStreaming<unknown>({
        command: buildWorkspaceGraphSearchCommand({
          query: request.query,
          limit,
          ...(request.projectPath
            ? { scope: `project:${path.basename(request.projectPath)}` }
            : {}),
        }),
        cwd: request.workspacePath,
        featureLabel: 'Workspace graph retrieval',
        timeoutMs: 2 * 60_000,
      });
      const ok = execution.failed === false && execution.exitCode === 0;
      return {
        ok,
        output: { query: request.query, limit, result: execution.result },
        ...(ok
          ? {}
          : {
              error:
                execution.stderr ||
                execution.stdout ||
                `Workspace graph search exited with ${execution.exitCode}.`,
            }),
      };
    },
    diagnostics: async (request) => ({
      ok: true,
      output: { diagnostics: inspectStudioWorkspaceDiagnostics(request) },
    }),
    codeIntelligence: runStudioCodeIntelligenceTool,
    inspectChanges: async (request) => ({
      ok: true,
      output: await inspectStudioWorkspaceChanges(request),
    }),
    applyPatches: async (request) => {
      if (!studioCardSupportsGovernedSourceMutation(cardRepairCapability.cardId)) {
        return {
          ok: false,
          error:
            'This card is producer-owned. Refresh its canonical producer; source patches are not authorized.',
        };
      }
      const normalized = normalizePatchesForWorkspaceScope({
        workspacePath: request.workspacePath,
        projectPath: request.projectPath,
        patches: request.patches,
      });
      const unauthorized = await authorizeStudioWorkspacePatchTargets({
        workspacePath: request.workspacePath,
        projectPath: request.projectPath,
        patches: normalized,
        inspectedSource,
      });
      if (unauthorized.length > 0) {
        return {
          ok: false,
          error: `Inspect every target before editing: ${unauthorized.map((entry) => entry.relativePath).join(', ')}`,
        };
      }
      await proofCarryingChange.authorize(['filesystem'], 'vscode:native-chat-agent');
      const result = await executeCliOwnedPatchRepair({
        workspacePath: request.workspacePath,
        projectPath: request.projectPath,
        projectName,
        cardId: activeHandoff.cardId,
        goalId: governedChangeGoal.goalPackId,
        blockerSignature: activeBlockerSignature,
        approvedBy: 'vscode:native-chat-agent',
        patches: normalized.map((patch) => ({
          relativePath: patch.relativePath,
          operation: patch.operation,
          baseSha256:
            patch.baseSha256 ??
            inspectedSource.get(patch.relativePath) ??
            repairEvidence.expectedBaseSha256[patch.relativePath],
          patchedContent: patch.patchedContent,
        })),
        reportProgress: reportProgress(request.reportProgress),
      });
      return presentCliRepairResult(result);
    },
    applyTextEdits: async (request) => {
      let patches: FilePatch[];
      try {
        patches = await compileInspectedStudioTextEdits({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          edits: request.edits,
          inspectedSource,
        });
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
      return host.applyPatches({
        patches,
        transactionId: request.transactionId,
        workspacePath: request.workspacePath,
        ...(request.projectPath ? { projectPath: request.projectPath } : {}),
        ...(request.reportProgress ? { reportProgress: request.reportProgress } : {}),
      });
    },
    deleteFiles: async (request) => {
      let patches: FilePatch[];
      try {
        patches = await compileInspectedStudioDeletePatches({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          paths: request.paths,
          inspectedSource,
        });
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
      return host.applyPatches({ ...request, patches });
    },
    runWorkspaceCommand: async (request: {
      request: StudioWorkspaceCommandRequest;
      workspacePath: string;
      projectPath?: string;
      approval?: StudioAgentToolApprovalGrant;
      signal?: AbortSignal;
      reportProgress?: (data: Record<string, unknown>) => Promise<void>;
    }) => {
      try {
        const commandPlan = resolveStudioWorkspaceCommandPlan({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          request: request.request,
        });
        const proofEffects = studioProofEffectClassesForCommand(commandPlan);
        if (proofEffects.length > 0) {
          await proofCarryingChange.authorize(
            proofEffects,
            request.approval?.approvedBy ?? 'policy:vscode:native-chat-agent'
          );
        }
        const execution = await executeStudioWorkspaceCommandTransaction({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          request: request.request,
          approval: request.approval,
          evidenceGeneration: repairEvidence.evidenceFingerprint,
          signal: request.signal,
          reportProcessEvent: request.reportProgress
            ? (event) => request.reportProgress!({ process: event })
            : undefined,
          isExpectedDiagnosticFindingExit,
        });
        const commandOutput = execution.output;
        const observedEffect = Boolean(
          commandOutput &&
          !commandOutput.rollback &&
          (commandOutput.effects.source ||
            commandOutput.effects.repositoryMetadata ||
            commandOutput.effects.externalSystem)
        );
        const proof =
          commandOutput && observedEffect
            ? await proofCarryingChange.recordCommandEffect({
                transactionId: commandOutput.transactionId,
                projectPath: request.projectPath,
                command: [request.request.executable, ...request.request.args],
                changedPaths: commandOutput.changedPaths,
                succeeded: execution.ok,
                effectClass: proofEffects[0],
                summary: execution.ok
                  ? `Native Chat command completed: ${request.request.executable}.`
                  : `Native Chat command failed: ${request.request.executable}.`,
              })
            : proofCarryingChange.activeChangeId
              ? await proofCarryingChange.status()
              : undefined;
        return {
          ...execution,
          output: commandOutput
            ? { ...commandOutput, ...(proof ? { proofCarryingChange: proof } : {}) }
            : proof
              ? { proofCarryingChange: proof }
              : undefined,
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    runGovernedCommand: async (request) => {
      const reuse = applyStudioGovernedCommandReuse({
        commandId: request.commandId,
        evidenceGeneration: repairEvidence.evidenceFingerprint,
        blockerSignature: activeBlockerSignature,
        attempts: commandAttempts,
        generations: commandGenerations,
      });
      if (!reuse.allow) {
        return {
          ok: false,
          evidenceGeneration: reuse.evidenceGeneration,
          ...(reuse.blockerSignature ? { blockerSignature: reuse.blockerSignature } : {}),
          error: reuse.error,
        };
      }
      const plan = resolveDashboardCommandExecutionPlan(request.commandId);
      if (request.commandId !== 'workspaceIntelligenceChain' && plan.cliArgs.length === 0) {
        return { ok: false, error: `No governed command exists for ${request.commandId}.` };
      }
      const baseCliArgs =
        request.commandId === 'workspaceAgentSync'
          ? preserveAllAgentConsumersForStudioRefresh(plan.cliArgs)
          : plan.cliArgs;
      const cliArgs = bindStudioGovernedCommandScope({
        commandId: request.commandId,
        cliArgs: baseCliArgs,
        projectName: activeHandoff.selectedTarget?.projectName ?? projectName,
        requireProjectScope: true,
      });
      const command =
        request.commandId === 'workspaceIntelligenceChain'
          ? STUDIO_CANONICAL_INTELLIGENCE_COMMAND
          : buildRapidkitCommand(cliArgs);
      const execution =
        request.commandId === 'workspaceIntelligenceChain'
          ? await (async () => {
              let progressWrites = Promise.resolve();
              const streamed = await runRapidkitStreaming({
                command: [...STUDIO_CANONICAL_INTELLIGENCE_ARGS],
                cwd: request.workspacePath,
                featureLabel: 'Workspace Intelligence',
                timeoutMs: 10 * 60_000,
                onEvent: (event) => {
                  const progress = resolveWorkspaceIntelligenceStreamProgress(event);
                  if (
                    !progress ||
                    progress.kind !== 'stage' ||
                    progress.status !== 'started' ||
                    !request.reportProgress
                  ) {
                    return;
                  }
                  progressWrites = progressWrites.then(() =>
                    request.reportProgress!({
                      intelligencePhase: progress.id,
                      intelligenceMilestoneKind: progress.kind,
                      intelligenceMilestoneStatus: progress.status,
                      message: progress.message,
                    })
                  );
                },
              });
              await progressWrites;
              const producerCompleted = streamed.exitCode === 0 || streamed.exitCode === 2;
              const lifecycleMessage = streamed.lastLifecycleEvent?.message?.trim();
              const stderrTail = streamed.stderr.trim().split('\n').filter(Boolean).pop();
              return {
                command,
                success: producerCompleted,
                exitCode: streamed.exitCode,
                output: streamed.result
                  ? JSON.stringify(streamed.result).slice(0, 12_000)
                  : undefined,
                stderrTail: producerCompleted ? undefined : stderrTail,
                ...(producerCompleted
                  ? {}
                  : {
                      error:
                        lifecycleMessage ||
                        stderrTail ||
                        `Workspace Intelligence exited with code ${streamed.exitCode}.`,
                    }),
              };
            })()
          : await runIncidentInlineCommand({
              command,
              workspacePath: request.workspacePath,
              projectPath: request.projectPath,
              actionId: `native-chat-${request.commandId}`,
            });
      const refreshedBundle = await buildDashboardEvidenceBundle({
        workspacePath: request.workspacePath,
        projectPath: request.projectPath,
      });
      const refreshedCard = refreshedBundle.cards.find((card) => card.id === activeHandoff.cardId);
      if (refreshedCard) {
        activeHandoff = await buildStudioBlockerHandoff({
          card: refreshedCard,
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          handoffSource: 'dashboard',
          extensionContext: input.extensionContext,
        });
        activeBlockerSignature = activeHandoff.blockerSignature;
      }
      repairEvidence = await collectSidebarStudioRepairEvidence({
        workspacePath: request.workspacePath,
        projectPath: request.projectPath,
        handoff: activeHandoff,
      });
      const producerCompleted = execution.exitCode === 0 || execution.exitCode === 2;
      const intelligenceRun =
        request.commandId === 'workspaceIntelligenceChain'
          ? await fs
              .readJson(
                path.join(
                  request.workspacePath,
                  '.workspai',
                  'reports',
                  'workspace-intelligence-run-last-run.json'
                )
              )
              .catch(() => undefined)
          : undefined;
      const intelligencePhase = resolveWorkspaceIntelligenceRunStage(intelligenceRun);
      const intelligencePreflight = resolveWorkspaceIntelligenceRunPreflight(intelligenceRun);
      return {
        ok: producerCompleted,
        changed: false,
        ...(intelligencePhase ? { intelligencePhase } : {}),
        evidenceGeneration: repairEvidence.evidenceFingerprint,
        output: {
          ...execution,
          ...(intelligencePhase ? { intelligencePhase } : {}),
          ...(intelligencePreflight ? { intelligencePreflight } : {}),
        },
        ...(producerCompleted
          ? {}
          : { error: execution.error ?? execution.stderrTail ?? 'Governed command failed.' }),
      };
    },
    inspectRemediationPlan: async (request) => {
      clearDoctorRemediationPlanCache();
      const plan = await readDoctorRemediationPlanForStudio({
        workspacePath: request.workspacePath,
        handoff: {
          ...activeHandoff,
          ...(request.projectPath ? { projectPath: request.projectPath } : {}),
        },
        maxSteps: 64,
      });
      if (!plan) {
        return {
          ok: false,
          evidenceGeneration: repairEvidence.evidenceFingerprint,
          error:
            'No contract-authored remediation plan is available. Run the workspaceRemediationPlan governed producer first.',
        };
      }
      return {
        ok: plan.freshness.verdict !== 'stale',
        evidenceGeneration: repairEvidence.evidenceFingerprint,
        output: {
          schemaVersion: plan.schemaVersion,
          sourcePath: plan.sourcePath,
          generatedAt: plan.generatedAt,
          scope: plan.scope,
          freshness: plan.freshness,
          execution: plan.execution,
          hiddenStepCount: plan.hiddenStepCount,
          steps: plan.visibleSteps.map((step) => ({
            id: step.id,
            dependsOn: step.dependsOn,
            order: step.order,
            phase: step.phase,
            projectName: step.projectName,
            projectPath: step.projectPath,
            risk: step.risk,
            executable: step.executable,
            studioState: step.studioState,
            canApply: step.canApply,
            executionReady: step.executionReady,
            invocation: step.invocation,
            requirements: step.requirements,
            retryPolicy: step.retryPolicy,
            blockedReason: step.blockedReason,
            title: step.previewTitle,
            summary: step.previewSummary,
          })),
        },
        ...(plan.freshness.verdict === 'stale'
          ? {
              error:
                plan.freshness.reason ??
                'The remediation plan is stale. Refresh its governed source evidence first.',
            }
          : {}),
      };
    },
    executeRemediationStep: async (request) =>
      runCanonicalRepair({
        workspacePath: request.workspacePath,
        projectPath: request.projectPath,
        actionId: request.stepId,
        approval: request.approval,
        reportProgress: request.reportProgress,
      }),
    inspectDependencySecurity: async (request) => {
      try {
        const resolveTarget = () =>
          resolveStudioDependencySecurityTarget({
            workspacePath: request.workspacePath,
            ...(request.projectName ? { projectName: request.projectName } : {}),
          });
        let target: Awaited<ReturnType<typeof resolveStudioDependencySecurityTarget>>;
        try {
          target = await resolveTarget();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!message.includes('No fresh dependency-security blocker exists')) {
            throw error;
          }
          const doctorRefresh = await refreshDependencyDoctorEvidence(request.workspacePath);
          try {
            target = await resolveTarget();
          } catch (refreshError) {
            const refreshedMessage =
              refreshError instanceof Error ? refreshError.message : String(refreshError);
            if (refreshedMessage.includes('No fresh dependency-security blocker exists')) {
              repairEvidence = await collectSidebarStudioRepairEvidence({
                workspacePath: request.workspacePath,
                projectPath: request.projectPath,
                handoff: activeHandoff,
              });
              return {
                ok: true,
                changed: false,
                evidenceGeneration: repairEvidence.evidenceFingerprint,
                output: {
                  dependencyBlockerPresent: false,
                  doctorRefresh,
                  nextAction: 'verify-blocker',
                },
              };
            }
            throw refreshError;
          }
        }
        const command = buildStudioDependencySecurityCommand(target, 'inspect');
        const execution = await runIncidentInlineCommand({
          command,
          workspacePath: request.workspacePath,
          projectPath: target.projectPath,
          actionId: `native-chat-security-inspect-${target.projectName}`,
          captureStdout: true,
        });
        const auditCompleted = execution.exitCode === 0 || execution.exitCode === 1;
        const parsedResolutionCandidates = execution.capturedStdout
          ? await parseStudioDependencyUpgradeCandidates({
              target,
              auditJson: execution.capturedStdout,
            }).catch(() => [])
          : [];
        const resolutionCandidates =
          parsedResolutionCandidates.length > 0 || target.repairCommand
            ? parsedResolutionCandidates
            : [
                {
                  packageName: `${target.packageManager}-dependency-graph`,
                  relationship: 'unknown' as const,
                  ownerPackages: [],
                  resolutionStrategies: [
                    'constraint-update' as const,
                    'replacement' as const,
                    'policy-exception' as const,
                    'upstream-wait' as const,
                  ],
                  disposition: 'no-exact-fix' as const,
                  autoExecutable: false,
                },
              ];
        const upgradeCandidates = resolutionCandidates.filter(
          (candidate) => candidate.autoExecutable
        );
        const blockedCandidates = resolutionCandidates.filter(
          (candidate) => !candidate.autoExecutable
        );
        return {
          ok: auditCompleted,
          changed: false,
          evidenceGeneration: repairEvidence.evidenceFingerprint,
          output: {
            target,
            command,
            auditExitCode: execution.exitCode,
            auditSummary: execution.output ?? execution.error ?? execution.stderrTail,
            upgradeCandidates,
            resolutionCandidates,
            blockedCandidates,
            ...(blockedCandidates.length > 0
              ? {
                  fallbackCapability: 'general-source-repair',
                  recommendedTools: [
                    'inspect-source',
                    'run-workspace-command',
                    'apply-workspace-patch',
                    'inspect-workspace-changes',
                  ],
                  exhaustedTools: [
                    'inspect-dependency-security',
                    'repair-dependency-security',
                    'upgrade-dependency-security',
                  ],
                }
              : {}),
            nextAction:
              upgradeCandidates.length > 0
                ? 'upgrade-dependency-security'
                : blockedCandidates.length > 0
                  ? 'general-source-repair'
                  : 'inspect-remediation-plan',
          },
          ...(!auditCompleted
            ? { error: execution.error ?? execution.stderrTail ?? 'Dependency inspection failed.' }
            : {}),
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    repairDependencySecurity: async (request) =>
      runCanonicalRepair({
        workspacePath: request.workspacePath,
        projectPath: request.projectPath,
        projectName: request.projectName ?? projectName,
        reportProgress: request.reportProgress,
      }),
    upgradeDependencySecurity: async (request) =>
      runCanonicalRepair({
        workspacePath: request.workspacePath,
        projectPath: request.projectPath,
        projectName: request.projectName ?? projectName,
        reportProgress: request.reportProgress,
      }),
    completeDependencyTransaction: async (request) =>
      runCanonicalRepair({
        workspacePath: request.workspacePath,
        projectPath: request.projectPath,
        reportProgress: request.reportProgress,
      }),
    verify: async (request) => {
      const execution = await runIncidentInlineCommand({
        command: activeHandoff.verifyCommand ?? activeHandoff.sourceCommand,
        workspacePath: request.workspacePath,
        projectPath: request.projectPath,
        actionId: 'native-chat-agent-verify',
      });
      const bundle = await buildDashboardEvidenceBundle({
        workspacePath: request.workspacePath,
        projectPath: request.projectPath,
        projectName,
      });
      const card = bundle.cards.find((entry) => entry.id === activeHandoff.cardId);
      const cardBlocking = card ? (card.blocking ?? card.status === 'fail') : true;
      const previousBlockerSignature = activeBlockerSignature;
      if (card) {
        activeHandoff = await buildStudioBlockerHandoff({
          card,
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          handoffSource: 'dashboard',
          extensionContext: input.extensionContext,
        });
        activeBlockerSignature = activeHandoff.blockerSignature;
        repairEvidence = await collectSidebarStudioRepairEvidence({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
          handoff: activeHandoff,
        });
      }
      const incident = buildStudioIncidentGraph({
        primaryCardId: activeHandoff.cardId,
        cards: bundle.cards,
      });
      const evidenceProduced = execution.exitCode === 0 || execution.exitCode === 2;
      return {
        ok: evidenceProduced && !cardBlocking,
        cardBlocking,
        blockerSignature: activeBlockerSignature,
        evidenceGeneration: repairEvidence.evidenceFingerprint,
        output: {
          execution,
          previousBlockerSignature,
          nextAction: cardBlocking ? 'next-causal-target' : 'complete',
          cardVerification: { cardId: activeHandoff.cardId, resolved: !cardBlocking },
          workspaceVerification: {
            resolved: incident.resolved,
            blockingCards: incident.blockingCards,
          },
        },
        ...(evidenceProduced && !cardBlocking
          ? {}
          : {
              error:
                execution.error ?? card?.blockers?.[0] ?? 'Canonical verification remains blocked.',
            }),
      };
    },
  };

  const canonicalVerify = host.verify.bind(host);
  host.verify = async (request) => {
    const verification = await canonicalVerify(request);
    if (!verification.ok || !proofCarryingChange.activeChangeId) {
      return verification;
    }
    try {
      const proof = await proofCarryingChange.verifyIfStarted(true);
      const sealed = proof?.capsule.status === 'sealed';
      return {
        ...verification,
        ok: verification.ok && sealed,
        cardBlocking: verification.cardBlocking === true || !sealed,
        output: { ...toolOutputRecord(verification.output), proofCarryingChange: proof },
        ...(sealed
          ? {}
          : {
              error:
                proof?.capsule.remainingUncertainty[0] ??
                'Native Chat verification passed, but the change capsule is not sealed.',
            }),
      };
    } catch (error) {
      return {
        ...verification,
        ok: false,
        cardBlocking: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const objective = [
    input.task,
    `Card: ${activeHandoff.cardLabel ?? activeHandoff.cardId}`,
    `Blockers: ${activeHandoff.blockers.join('; ')}`,
    `Verify command: ${activeHandoff.verifyCommand}`,
    repairEvidence.promptSection,
    'Inspect causal project source before editing. Canonical .workspai/.rapidkit state and evidence are never source targets. Use apply-workspace-patch for semantic file edits. A repository-native transformation may use run-workspace-command only when its exact structured invocation is the causal operation; Studio will require explicit fingerprint-bound approval when that command may mutate source. The CLI remains the authority for patch checkpoint, validation, verification, closure, and rollback.',
    'JSON files (.json) must contain strictly valid JSON. Never include comments, trailing commas, or non-standard syntax in .json file content.',
  ].join('\n\n');
  const registry = createStudioAgentWorkspaiToolRegistry({
    host,
    cardId: activeHandoff.cardId,
    blockerSignature: activeHandoff.blockerSignature,
    assistantMode: 'agent',
    goalId: governedChangeGoal.goalPackId,
    goalCompletionMode: governedChangeGoal.governedGoal.completionMode,
  });
  const model = new ContractStudioAgentModelAdapter(
    objective,
    async (_prompt, request) => {
      const response = await askConfiguredAIProviderForToolAction(
        input.extensionContext,
        request.messages,
        request.tools,
        input.token,
        input.requestedModelId,
        [
          { path: input.projectPath, token: '$PROJECT' },
          { path: input.workspacePath, token: '$WORKSPACE' },
        ]
      );
      const resolution = {
        provider: response.provider,
        modelId: response.modelId,
        ...(response.requestedModelId ? { requestedModelId: response.requestedModelId } : {}),
        fallback: response.fallback,
        attempts: response.attempts,
        ...(response.inputTokens !== undefined ? { inputTokens: response.inputTokens } : {}),
        ...(response.outputTokens !== undefined ? { outputTokens: response.outputTokens } : {}),
        ...(response.tokenUsageSource ? { tokenUsageSource: response.tokenUsageSource } : {}),
      };
      return response.type === 'tool'
        ? {
            callId: response.callId,
            toolName: response.toolName,
            input: response.input,
            resolution,
          }
        : { type: 'text' as const, text: response.text, resolution };
    },
    undefined,
    input.initialConversation
  );
  const session = new StudioAgentSession(
    {
      workspacePath: input.workspacePath,
      ...(input.projectPath ? { projectPath: input.projectPath } : {}),
      cardId: activeHandoff.cardId,
      assistantMode: 'agent',
      ...(input.requestedModelId ? { selectedModelId: input.requestedModelId } : {}),
      blockerSignature: activeHandoff.blockerSignature,
      repairPolicy: cardRepairCapability.repairPolicy,
      ...(input.initialSourceRepairDirective
        ? { initialSourceRepairDirective: input.initialSourceRepairDirective }
        : {}),
      permissionLevel: 'autopilot',
      workspaceTrusted: vscode.workspace.isTrusted,
      requestToolApproval: (request) =>
        requestVSCodeStudioToolApproval(request, input.extensionContext.workspaceState),
      requiresVerifiedCompletion: true,
      governedGoal: governedChangeGoal.governedGoal,
      ...(governedChangeGoal.verifiedGoal ? { goal: governedChangeGoal.verifiedGoal } : {}),
      goalMaxAttempts: governedChangeGoal.maxAttempts,
      goalAttemptsUsed: governedChangeGoal.attemptsUsed,
    },
    model,
    registry,
    new VSCodeStudioAgentSessionStore(input.extensionContext)
  );
  session.onEvent((event) => renderNativeStudioAgentEvent(input.stream, event));
  const cancellation = input.token.onCancellationRequested(() => session.cancel());
  if (input.token.isCancellationRequested) {
    session.cancel();
  }
  const completed = await session.run(objective).finally(() => cancellation.dispose());
  const receipt = buildStudioVerifiedRepairReceipt(completed);
  if (completed.status === 'completed') {
    input.stream.markdown(`### Source repair verified\n\n${receipt.answer}`);
  } else if (completed.status === 'cancelled') {
    input.stream.markdown(
      '### Source repair cancelled\n\nThe agent stopped at the native Chat cancellation boundary. No unverified success was recorded.'
    );
  } else {
    const failure = [...completed.events]
      .reverse()
      .find((event) => event.type === 'session.failed');
    const data =
      failure?.data && typeof failure.data === 'object' && !Array.isArray(failure.data)
        ? (failure.data as Record<string, unknown>)
        : {};
    const transactionId = typeof data.transactionId === 'string' ? data.transactionId.trim() : '';
    const decisionOptions = Array.isArray(data.decisionOptions)
      ? data.decisionOptions.filter(
          (entry): entry is WorkspaceRepairDecision =>
            typeof entry === 'string' && REPAIR_DECISIONS.has(entry as WorkspaceRepairDecision)
        )
      : [];
    if (data.terminalReason === 'repair-toolchain-unavailable') {
      input.stream.markdown(
        '### Toolchain setup required\n\nA required runtime tool could not be launched. Repair the local toolchain, then resume this durable session; no unverified source change was accepted.'
      );
      input.stream.button({
        command: 'workspai.openSetup',
        title: 'Open Workspai Setup',
        tooltip: 'Open setup and runtime diagnostics',
      });
      if (transactionId && decisionOptions.includes('cancel')) {
        renderNativeRepairDecisionButtons(input.stream, transactionId, ['cancel']);
      }
    } else if (data.requiresUserDecision === true && transactionId && decisionOptions.length > 0) {
      input.stream.markdown(
        '### Decision required\n\nThe source repair paused at an explicit CLI policy boundary. Choose an option for this exact transaction.'
      );
      renderNativeRepairDecisionButtons(input.stream, transactionId, decisionOptions);
    } else {
      input.stream.markdown(
        '### Source repair paused\n\nThe model-driven loop did not obtain a closed CLI verification receipt. The canonical blocker remains open and the durable session can be resumed.'
      );
    }
  }
  return {
    status: completed.status,
    sessionId: completed.id,
    transactionIds: receipt.transactionIds,
    changedPaths: receipt.changedPaths,
  };
}

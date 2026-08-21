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
import { VSCodeStudioAgentSessionStore } from './studioAgentSessionStore.js';
import {
  createStudioAgentWorkspaiToolRegistry,
  type StudioAgentWorkspaiToolHost,
} from './studioAgentWorkspaiTools.js';
import { renderNativeStudioAgentEvent } from './nativeChatToolEventRenderer.js';
import { buildStudioIncidentGraph } from './studioIncidentGraph.js';
import { resolveStudioRepairProjectTarget } from './studioRepairProjectTarget.js';
import {
  discoverStudioWorkspaceFiles,
  fingerprintStudioWorkspaceSourceState,
  inspectStudioWorkspaceChanges,
  inspectStudioWorkspaceDiagnostics,
  searchStudioWorkspaceSource,
} from './studioWorkspaceInspection.js';
import { runRapidkitStreaming } from './streamingRapidkitRunner.js';
import {
  describeStudioWorkspaceCommandFailure,
  resolveStudioWorkspaceCommandPlan,
  runStudioWorkspaceCommand,
  type StudioWorkspaceCommandRequest,
} from './studioWorkspaceCommand.js';
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
import {
  isExpectedDiagnosticFindingExit,
  runIncidentInlineCommand,
} from '../ui/panels/incidentStudioInlineCommandBridge.js';
import {
  clearDoctorRemediationPlanCache,
  readDoctorRemediationPlanForStudio,
} from './doctorRemediationPlanReader.js';
import {
  applyStudioGovernedCommandReuse,
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

  let repairEvidence = await collectSidebarStudioRepairEvidence({
    workspacePath: input.workspacePath,
    projectPath: input.projectPath,
    handoff: input.handoff,
  });
  const cardRepairCapability = requireStudioCardRepairCapability(input.handoff.cardId);
  const inspectedSource = new Map<string, string | null>();
  const commandGenerations = new Map<StudioEvidenceRefreshCommandId, string>();
  const commandAttempts = new Map<
    StudioEvidenceRefreshCommandId,
    { blockerSignature?: string; evidenceGeneration: string; count: number }
  >();
  const activeBlockerSignature = input.handoff.blockerSignature;
  const projectName = resolveStudioRepairProjectTarget({
    affectedProjectNames: input.handoff.affectedProjectNames,
    projectPath: input.projectPath,
  });
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
      handoff: input.handoff,
    });
    return execution;
  };

  const presentCliRepairResult = async (
    result: Awaited<ReturnType<typeof executeCliOwnedCanonicalRepair>>
  ) => {
    repairEvidence = await collectSidebarStudioRepairEvidence({
      workspacePath: input.workspacePath,
      projectPath: input.projectPath,
      handoff: input.handoff,
    });
    return presentStudioCliOwnedRepairObservation({
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
  };

  const runCanonicalRepair = async (request: {
    workspacePath: string;
    projectPath?: string;
    projectName?: string;
    actionId?: string;
    reportProgress?: (data: Record<string, unknown>) => Promise<void>;
  }) => {
    const result = await executeCliOwnedCanonicalRepair({
      workspacePath: request.workspacePath,
      cardId: input.handoff.cardId,
      projectName: request.projectName ?? projectName,
      ...(request.actionId ? { actionId: request.actionId } : {}),
      approvedBy: 'vscode:native-chat-agent',
      reportProgress: reportProgress(request.reportProgress),
    });
    return presentCliRepairResult(result);
  };

  const host: StudioAgentWorkspaiToolHost = {
    recoverActiveBlocker: async (request) => {
      clearDoctorRemediationPlanCache();
      const plan = await readDoctorRemediationPlanForStudio({
        workspacePath: request.workspacePath,
        handoff: {
          ...input.handoff,
          ...(request.projectPath ? { projectPath: request.projectPath } : {}),
        },
        maxSteps: 8,
      });
      const step = plan?.visibleSteps.find(
        (candidate) =>
          candidate.risk !== 'invasive' &&
          (candidate.studioState === 'ready' || candidate.studioState === 'review-required') &&
          (candidate.canApply || candidate.executable)
      );
      if (!step) {
        return {
          ok: false,
          changed: false,
          evidenceGeneration: repairEvidence.evidenceFingerprint,
          output: {
            recoveryPath: 'general-source-repair',
            nextAction: 'general-source-repair',
            sourceCandidates: repairEvidence.autonomousTargetPaths,
            recommendedTools: [
              'inspect-source',
              'search-workspace',
              'inspect-workspace-diagnostics',
              'run-workspace-command',
              'apply-workspace-patch',
            ],
          },
          error:
            'No exact executable action matches the active blocker. Continue with inspected source repair; do not create a card-wide transaction.',
        };
      }
      return runCanonicalRepair({
        workspacePath: request.workspacePath,
        projectPath: request.projectPath || step.projectPath,
        projectName: step.projectName ?? projectName,
        actionId: step.actionId ?? step.id,
        reportProgress: request.reportProgress,
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
        command: [
          'workspace',
          'graph',
          'search',
          request.query,
          '--limit',
          String(limit),
          '--json',
        ],
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
      const result = await executeCliOwnedPatchRepair({
        workspacePath: request.workspacePath,
        projectPath: request.projectPath,
        projectName,
        cardId: input.handoff.cardId,
        blockerSignature: input.handoff.blockerSignature,
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
    }) => {
      try {
        const plan = resolveStudioWorkspaceCommandPlan({
          workspacePath: request.workspacePath,
          request: request.request,
        });
        if (plan.mutatesSource) {
          return {
            ok: false,
            error: 'Mutating commands must be expressed as a CLI-owned patch transaction.',
          };
        }
        const before = await fingerprintStudioWorkspaceSourceState({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
        });
        if (!before) {
          return {
            ok: false,
            error: 'Native Chat could not establish a Git-backed source fingerprint.',
          };
        }
        const execution = await runStudioWorkspaceCommand(plan);
        const after = await fingerprintStudioWorkspaceSourceState({
          workspacePath: request.workspacePath,
          projectPath: request.projectPath,
        });
        if (!after || after.fingerprint !== before.fingerprint) {
          return {
            ok: false,
            changed: true,
            evidenceGeneration: repairEvidence.evidenceFingerprint,
            requiresUserDecision: true,
            terminalReason: 'workspace-command-source-mutation-detected',
            error:
              'The workspace command changed source state and cannot be accepted outside a CLI-owned repair transaction.',
            output: {
              ...execution,
              observedSourceChange: true,
              nextAction: 'review-required',
              requiresUserDecision: true,
            },
          };
        }
        const diagnosticFindings = isExpectedDiagnosticFindingExit({
          command: plan.displayCommand,
          exitCode: execution.exitCode,
          stdout: execution.stdout,
          stderr: execution.stderr,
        });
        const commandObserved = execution.exitCode === 0 || diagnosticFindings;
        return {
          ok: commandObserved,
          changed: false,
          evidenceGeneration: repairEvidence.evidenceFingerprint,
          output: {
            ...execution,
            ...(commandObserved
              ? { diagnosticOutcome: diagnosticFindings ? 'findings' : 'clean' }
              : {}),
            changedPaths: [],
            observedSourceChange: false,
            sourceFingerprint: after.fingerprint,
          },
          ...(commandObserved
            ? {}
            : {
                error: describeStudioWorkspaceCommandFailure(execution),
              }),
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
      const cliArgs =
        request.commandId === 'workspaceAgentSync'
          ? preserveAllAgentConsumersForStudioRefresh(plan.cliArgs)
          : plan.cliArgs;
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
      repairEvidence = await collectSidebarStudioRepairEvidence({
        workspacePath: request.workspacePath,
        projectPath: request.projectPath,
        handoff: input.handoff,
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
          ...input.handoff,
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
                handoff: input.handoff,
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
        command: input.handoff.verifyCommand ?? input.handoff.sourceCommand,
        workspacePath: request.workspacePath,
        projectPath: request.projectPath,
        actionId: 'native-chat-agent-verify',
      });
      const bundle = await buildDashboardEvidenceBundle({
        workspacePath: request.workspacePath,
        projectPath: request.projectPath,
        projectName,
      });
      const card = bundle.cards.find((entry) => entry.id === input.handoff.cardId);
      const cardBlocking = card ? (card.blocking ?? card.status === 'fail') : true;
      const incident = buildStudioIncidentGraph({
        primaryCardId: input.handoff.cardId,
        cards: bundle.cards,
      });
      const evidenceProduced = execution.exitCode === 0 || execution.exitCode === 2;
      return {
        ok: evidenceProduced && !cardBlocking,
        cardBlocking,
        output: {
          execution,
          cardVerification: { cardId: input.handoff.cardId, resolved: !cardBlocking },
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

  const objective = [
    input.task,
    `Card: ${input.handoff.cardLabel ?? input.handoff.cardId}`,
    `Blockers: ${input.handoff.blockers.join('; ')}`,
    `Verify command: ${input.handoff.verifyCommand}`,
    repairEvidence.promptSection,
    'Inspect causal project source before editing. Canonical .workspai/.rapidkit state and evidence are never source targets. Use apply-workspace-patch for every source mutation. The CLI owns checkpoint, validation, verification, closure, and rollback.',
    'JSON files (.json) must contain strictly valid JSON. Never include comments, trailing commas, or non-standard syntax in .json file content.',
  ].join('\n\n');
  const registry = createStudioAgentWorkspaiToolRegistry({
    host,
    cardId: input.handoff.cardId,
    blockerSignature: input.handoff.blockerSignature,
    assistantMode: 'agent',
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
      return response.type === 'tool'
        ? {
            callId: response.callId,
            toolName: response.toolName,
            input: response.input,
          }
        : response.text;
    },
    undefined,
    input.initialConversation
  );
  const session = new StudioAgentSession(
    {
      workspacePath: input.workspacePath,
      ...(input.projectPath ? { projectPath: input.projectPath } : {}),
      cardId: input.handoff.cardId,
      assistantMode: 'agent',
      ...(input.requestedModelId ? { selectedModelId: input.requestedModelId } : {}),
      blockerSignature: input.handoff.blockerSignature,
      repairPolicy: cardRepairCapability.repairPolicy,
      ...(input.initialSourceRepairDirective
        ? { initialSourceRepairDirective: input.initialSourceRepairDirective }
        : {}),
      permissionLevel: 'autopilot',
      workspaceTrusted: vscode.workspace.isTrusted,
      requiresVerifiedCompletion: true,
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

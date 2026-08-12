import * as path from 'node:path';
import * as vscode from 'vscode';

import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';
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
  inspectStudioWorkspaceChanges,
  inspectStudioWorkspaceDiagnostics,
} from './studioWorkspaceInspection.js';
import {
  resolveStudioWorkspaceCommandPlan,
  runStudioWorkspaceCommand,
  type StudioWorkspaceCommandRequest,
} from './studioWorkspaceCommand.js';
import { authorizeStudioWorkspacePatchTargets } from './studioWorkspaceFileTransactions.js';
import {
  executeCliOwnedCanonicalRepair,
  executeCliOwnedPatchRepair,
  type WorkspaceRepairDecision,
  type WorkspaceRepairProgress,
} from './workspaceRepairCliClient.js';
import { buildDashboardEvidenceBundle } from './dashboardEvidenceBridge.js';
import { runIncidentInlineCommand } from '../ui/panels/incidentStudioInlineCommandBridge.js';
import { buildStudioVerifiedRepairReceipt } from './studioRepairReceipt.js';
import { renderNativeRepairDecisionButtons } from './nativeChatRepairDecisionActions.js';

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

async function searchWorkspace(input: {
  query: string;
  paths?: string[];
  workspacePath: string;
}): Promise<Array<{ path: string; line: number; preview: string }>> {
  const include = input.paths?.length ? `{${input.paths.join(',')}}` : '**/*';
  const uris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(input.workspacePath, include),
    '{**/.git/**,**/node_modules/**,**/dist/**,**/build/**,**/.workspai/cache/**}',
    120
  );
  const matches: Array<{ path: string; line: number; preview: string }> = [];
  for (const uri of uris) {
    if (matches.length >= 80) {
      break;
    }
    try {
      const lines = Buffer.from(await vscode.workspace.fs.readFile(uri))
        .toString('utf8')
        .split(/\r?\n/);
      lines.forEach((line, index) => {
        if (matches.length < 80 && line.includes(input.query)) {
          matches.push({
            path: path.relative(input.workspacePath, uri.fsPath).replace(/\\/g, '/'),
            line: index + 1,
            preview: line.trim().slice(0, 240),
          });
        }
      });
    } catch {
      // Binary and transient files are not source observations.
    }
  }
  return matches;
}

function unsupported(capability: string) {
  return async () => ({
    ok: false,
    error: `${capability} is not available in this source-repair phase. Inspect source and use a CLI-owned patch transaction.`,
  });
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
}): Promise<{
  status: string;
  sessionId: string;
  transactionIds: string[];
  changedPaths: string[];
}> {
  const repairEvidence = await collectSidebarStudioRepairEvidence({
    workspacePath: input.workspacePath,
    projectPath: input.projectPath,
    handoff: input.handoff,
  });
  const inspectedSource = new Map<string, string | null>();
  const projectName = resolveStudioRepairProjectTarget({
    affectedProjectNames: input.handoff.affectedProjectNames,
    projectPath: input.projectPath,
  });
  const reportProgress = (callback?: (data: Record<string, unknown>) => Promise<void>) =>
    callback ? (progress: WorkspaceRepairProgress) => callback({ repair: progress }) : undefined;

  const host: StudioAgentWorkspaiToolHost = {
    discover: async (request) => ({
      ok: true,
      output: { files: await discoverStudioWorkspaceFiles(request) },
      evidenceGeneration: repairEvidence.evidenceFingerprint,
    }),
    inspect: async (request) => {
      const observations = await inspectStudioAgentFiles({
        workspacePath: request.workspacePath,
        paths: request.paths,
        kind: request.kind,
        authorizedEvidencePaths: repairEvidence.authorizedEvidencePaths,
      });
      if (request.kind === 'source') {
        observations.forEach((entry) => inspectedSource.set(entry.path, entry.sha256));
      }
      return {
        ok: true,
        output: observations,
        evidenceGeneration: repairEvidence.evidenceFingerprint,
      };
    },
    search: async (request) => ({ ok: true, output: await searchWorkspace(request) }),
    diagnostics: async (request) => ({
      ok: true,
      output: { diagnostics: inspectStudioWorkspaceDiagnostics(request) },
    }),
    inspectChanges: async (request) => ({
      ok: true,
      output: await inspectStudioWorkspaceChanges(request),
    }),
    applyPatches: async (request) => {
      const normalized = normalizePatchesForWorkspaceScope({
        workspacePath: request.workspacePath,
        projectPath: request.projectPath,
        patches: request.patches,
      });
      const unauthorized = await authorizeStudioWorkspacePatchTargets({
        workspacePath: request.workspacePath,
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
          baseSha256: patch.baseSha256 ?? inspectedSource.get(patch.relativePath),
          patchedContent: patch.patchedContent,
        })),
        reportProgress: reportProgress(request.reportProgress),
      });
      const closed = result.transaction.state === 'closed';
      return {
        ok: closed,
        changed: closed && result.changedPaths.length > 0,
        output: {
          transaction: result.transaction,
          changedPaths: result.changedPaths,
          fileChanges: result.fileChanges,
        },
        ...(closed
          ? {}
          : {
              error:
                result.transaction.decision?.reason ??
                `CLI repair ended in ${result.transaction.state}.`,
            }),
      };
    },
    deleteFiles: async (request) => {
      const patches: FilePatch[] = request.paths.map((relativePath) => ({
        relativePath,
        operation: 'delete',
        isNewFile: false,
        patchedContent: '',
        hunks: [],
        status: 'pending',
        baseSha256: inspectedSource.get(relativePath),
      }));
      return host.applyPatches({ ...request, patches });
    },
    runWorkspaceCommand: async (request: {
      request: StudioWorkspaceCommandRequest;
      workspacePath: string;
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
        const execution = await runStudioWorkspaceCommand(plan);
        return {
          ok: execution.exitCode === 0,
          changed: false,
          output: { ...execution, changedPaths: [], observedSourceChange: false },
          ...(execution.exitCode === 0
            ? {}
            : {
                error:
                  execution.stderr || execution.stdout || `Command exited ${execution.exitCode}.`,
              }),
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    runGovernedCommand: unsupported('Governed evidence refresh'),
    inspectRemediationPlan: unsupported('Remediation-plan inspection'),
    executeRemediationStep: unsupported('Deterministic remediation'),
    inspectDependencySecurity: unsupported('Dependency security inspection'),
    repairDependencySecurity: unsupported('Dependency security repair'),
    upgradeDependencySecurity: unsupported('Dependency upgrade'),
    completeDependencyTransaction: async (request) => {
      const result = await executeCliOwnedCanonicalRepair({
        workspacePath: request.workspacePath,
        cardId: input.handoff.cardId,
        projectName,
        approvedBy: 'vscode:native-chat-agent',
        reportProgress: reportProgress(request.reportProgress),
      });
      const closed = result.transaction.state === 'closed';
      return {
        ok: closed,
        changed: closed && result.changedPaths.length > 0,
        output: {
          transaction: result.transaction,
          changedPaths: result.changedPaths,
          fileChanges: result.fileChanges,
        },
        ...(closed
          ? {}
          : {
              error:
                result.transaction.decision?.reason ??
                `CLI repair ended in ${result.transaction.state}.`,
            }),
      };
    },
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
    'Inspect source before editing. Use apply-workspace-patch for every source mutation. The CLI owns checkpoint, validation, verification, closure, and rollback.',
  ].join('\n\n');
  const registry = createStudioAgentWorkspaiToolRegistry({
    host,
    cardId: input.handoff.cardId,
    blockerSignature: input.handoff.blockerSignature,
    assistantMode: 'agent',
  });
  const model = new ContractStudioAgentModelAdapter(objective, async (_prompt, request) => {
    const response = await askConfiguredAIProviderForToolAction(
      input.extensionContext,
      request.messages,
      request.tools,
      input.token,
      input.requestedModelId
    );
    return response.type === 'tool'
      ? {
          callId: response.callId,
          toolName: response.toolName,
          input: response.input,
        }
      : response.text;
  });
  const session = new StudioAgentSession(
    {
      workspacePath: input.workspacePath,
      ...(input.projectPath ? { projectPath: input.projectPath } : {}),
      cardId: input.handoff.cardId,
      assistantMode: 'agent',
      ...(input.requestedModelId ? { selectedModelId: input.requestedModelId } : {}),
      blockerSignature: input.handoff.blockerSignature,
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
    if (data.requiresUserDecision === true && transactionId && decisionOptions.length > 0) {
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

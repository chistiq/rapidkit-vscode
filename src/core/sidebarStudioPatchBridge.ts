import * as vscode from 'vscode';
import path from 'node:path';

import { askConfiguredAIProvider } from './aiProviderService.js';
import { prepareAIConversation } from './aiService.js';
import {
  applyPatches,
  extractPatchesFromAiResponse,
  type FilePatch,
  type MultiFilePatchResult,
} from './patchApplyEngine.js';
import { loadAnalyzeReport } from '../ui/panels/incidentStudioAnalyze.js';
import { classifyIncidentActionPolicy } from '../ui/panels/incidentStudioPromptPolicy.js';
import { buildInlineQueryFromAction } from '../ui/panels/welcomePanelChatBrainInlineQuery.js';
import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';

export type SidebarPatchBridgeResult = {
  status: 'applied' | 'review' | 'blocked' | 'failed';
  summary: string;
  responseText?: string;
  patchResult?: MultiFilePatchResult;
  pendingPatches?: FilePatch[];
  appliedFixes?: Array<{ path: string; action: string; outcome: string }>;
};

function buildHandoffIssuePayload(handoff: StudioBlockerHandoff): Record<string, unknown> {
  return {
    issueSummary: [
      handoff.cardLabel
        ? `Evidence card: ${handoff.cardLabel}`
        : `Evidence card: ${handoff.cardId}`,
      ...handoff.blockers.slice(0, 6),
    ].join('\n'),
    logContext: handoff.resolutionHints?.[0]?.fixHints?.[0]?.detail,
  };
}

export async function executeSidebarApplyDebugPatch(input: {
  context: vscode.ExtensionContext;
  workspacePath: string;
  handoff: StudioBlockerHandoff;
  projectPath?: string;
}): Promise<SidebarPatchBridgeResult> {
  const { report, error } = loadAnalyzeReport({
    workspacePath: input.workspacePath,
    workspaceName:
      input.handoff.cardLabel ?? input.handoff.cardId ?? path.basename(input.workspacePath),
  });

  if (!report) {
    return {
      status: 'blocked',
      summary:
        error || 'Analyze report is missing. Run workspace analyze before apply-debug-patch.',
    };
  }

  if (report.summary.verdict === 'blocked') {
    return {
      status: 'blocked',
      summary:
        'Analyze evidence is blocked — resolve analyze blockers before governed code changes.',
    };
  }

  const actionPolicy = classifyIncidentActionPolicy('apply-debug-patch');
  const inlineQuery = await buildInlineQueryFromAction(
    'apply-debug-patch',
    buildHandoffIssuePayload(input.handoff),
    input.handoff.scope === 'project' ? 'project' : 'workspace'
  );

  try {
    const prepared = await prepareAIConversation('ask', inlineQuery, {
      workspaceRootPath: input.workspacePath,
      projectRootPath: input.projectPath,
      name: input.handoff.cardLabel ?? 'Studio',
      type: input.handoff.scope === 'project' ? 'project' : 'workspace',
    });
    const response = await askConfiguredAIProvider(input.context, prepared.messages);
    const responseText = response.text.trim();
    if (!responseText) {
      return { status: 'failed', summary: 'Patch generation returned an empty response.' };
    }

    const actionId = `sidebar-fix-${input.handoff.cardId}`;
    const rawPatches = extractPatchesFromAiResponse(responseText, {
      actionId,
      workspacePath: input.workspacePath,
    });

    if (rawPatches.length === 0) {
      return {
        status: 'failed',
        summary: 'No file patches were found in the Studio response.',
        responseText,
      };
    }

    const shouldAutoApply = actionPolicy.riskClass !== 'high-risk-mutating';

    if (!shouldAutoApply) {
      return {
        status: 'review',
        summary: 'Patch review required before apply (elevated risk).',
        responseText,
        pendingPatches: rawPatches.map((patch) => ({ ...patch, status: 'pending' as const })),
      };
    }

    const patchResult = await applyPatches({
      actionId,
      workspacePath: input.workspacePath,
      patches: rawPatches,
      branchSafeApply: true,
      verificationPassed: report.summary.verdict === 'ready',
    });

    const appliedFixes = patchResult.patches
      .filter((patch) => patch.status === 'applied')
      .map((patch) => ({
        path: patch.relativePath,
        action: 'apply-debug-patch',
        outcome: 'applied',
      }));

    if (patchResult.appliedCount === 0) {
      return {
        status: 'review',
        summary: 'Patch apply did not succeed — review pending changes.',
        responseText,
        patchResult,
        pendingPatches: patchResult.patches.filter((patch) => patch.status !== 'applied'),
      };
    }

    return {
      status: 'applied',
      summary: `Applied ${patchResult.appliedCount} patch(es). Run verify to refresh the card.`,
      responseText,
      patchResult,
      appliedFixes,
    };
  } catch (error) {
    return {
      status: 'failed',
      summary: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function applySidebarPendingPatches(input: {
  workspacePath: string;
  handoff: StudioBlockerHandoff;
  patches: FilePatch[];
  acceptedPaths?: string[];
}): Promise<SidebarPatchBridgeResult> {
  const actionId = `sidebar-fix-${input.handoff.cardId}`;
  const patchResult = await applyPatches({
    actionId,
    workspacePath: input.workspacePath,
    patches: input.patches,
    branchSafeApply: true,
    acceptedPaths: input.acceptedPaths,
  });

  const appliedFixes = patchResult.patches
    .filter((patch) => patch.status === 'applied')
    .map((patch) => ({
      path: patch.relativePath,
      action: 'apply-debug-patch',
      outcome: 'applied',
    }));

  return {
    status: patchResult.appliedCount > 0 ? 'applied' : 'failed',
    summary:
      patchResult.appliedCount > 0
        ? `Applied ${patchResult.appliedCount} selected patch(es). Run verify to refresh the card.`
        : 'No patches were applied.',
    patchResult,
    appliedFixes,
  };
}

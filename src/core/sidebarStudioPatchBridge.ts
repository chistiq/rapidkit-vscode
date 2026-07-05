import * as vscode from 'vscode';
import path from 'node:path';

import { askConfiguredAIProvider } from './aiProviderService.js';
import { prepareAIConversation } from './aiService.js';
import {
  applyPatches,
  extractPatchesFromAiResponse,
  normalizePatchesForWorkspaceScope,
  type FilePatch,
  type MultiFilePatchResult,
} from './patchApplyEngine.js';
import { loadAnalyzeReport } from '../ui/panels/incidentStudioAnalyze.js';
import { classifyIncidentActionPolicy } from '../ui/panels/incidentStudioPromptPolicy.js';
import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';

export type SidebarPatchBridgeResult = {
  status: 'applied' | 'review' | 'blocked' | 'failed';
  summary: string;
  responseText?: string;
  patchResult?: MultiFilePatchResult;
  pendingPatches?: FilePatch[];
  appliedFixes?: Array<{ path: string; action: string; outcome: string }>;
};

function buildSidebarCardRepairPatchPrompt(input: {
  handoff: StudioBlockerHandoff;
  analyzeContext?: string;
}): string {
  const { handoff } = input;
  const primaryHint = handoff.resolutionHints?.[0];
  const fixHints = primaryHint?.fixHints ?? [];
  const lines = [
    'You are Workspai Studio running inside VS Code.',
    'Continue the active card repair session. Do not ask the user to restate the issue.',
    'Use the blocker handoff and evidence below as the source of truth.',
    '',
    '## Active card',
    `- Card: ${handoff.cardLabel ?? handoff.cardId}`,
    `- Status: ${handoff.cardStatus}`,
    `- Scope: ${handoff.scope}`,
    `- Workspace: ${handoff.workspacePath ?? 'unknown'}`,
    ...(handoff.projectPath ? [`- Project: ${handoff.projectPath}`] : []),
    ...(handoff.artifactPath ? [`- Artifact: ${handoff.artifactPath}`] : []),
    ...(handoff.verifyCommand ? [`- Verify after patch: ${handoff.verifyCommand}`] : []),
    ...(handoff.blockers.length > 0
      ? ['', '## Blockers', ...handoff.blockers.slice(0, 8).map((blocker) => `- ${blocker}`)]
      : []),
    ...(primaryHint
      ? [
          '',
          '## Resolution hint',
          `- Class: ${primaryHint.resolutionClass ?? handoff.resolutionClass ?? 'unknown'}`,
          ...(primaryHint.commandRetryHint
            ? [`- Retry hint: ${primaryHint.commandRetryHint}`]
            : []),
        ]
      : []),
    ...(fixHints.length > 0
      ? [
          '',
          '## Fix hints',
          ...fixHints
            .slice(0, 5)
            .map((hint, index) =>
              [
                `- Hint ${index + 1}: ${hint.actionKind}`,
                ...(hint.detail ? [`  - Detail: ${hint.detail}`] : []),
                ...(hint.targetPath ? [`  - Target: ${hint.targetPath}`] : []),
              ].join('\n')
            ),
        ]
      : []),
    ...(input.analyzeContext
      ? ['', '## Analyze context (advisory, not a blocker)', input.analyzeContext]
      : []),
    '',
    '## Required output',
    '- Produce the smallest source/config patch that addresses the active blocker.',
    '- Only edit files needed for this blocker; do not scaffold unrelated frameworks or broad architecture.',
    '- For every file you create or modify, output a fenced code block in exactly this format:',
    '```<language> path: <relative/path/to/file>',
    '// full patched file content or minimal replacement content',
    '```',
    '- After patches, include a short verify command and rollback note.',
    '- Do not claim the patch was applied; Studio will apply it after extracting the patch blocks.',
  ];
  return lines.join('\n');
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

  const actionPolicy = classifyIncidentActionPolicy('apply-debug-patch');
  const analyzeContext = report
    ? [
        `Analyze verdict: ${report.summary.verdict}`,
        `Analyze score: ${report.summary.score}`,
        `Findings: ${report.summary.findings.fail} fail, ${report.summary.findings.warn} warn, ${report.summary.findings.info} info`,
      ].join('\n')
    : error
      ? `Analyze report unavailable: ${error}`
      : undefined;
  const inlineQuery = buildSidebarCardRepairPatchPrompt({
    handoff: input.handoff,
    analyzeContext,
  });

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
    const rawPatches = normalizePatchesForWorkspaceScope({
      workspacePath: input.workspacePath,
      projectPath: input.projectPath ?? input.handoff.projectPath,
      patches: extractPatchesFromAiResponse(responseText, {
        actionId,
        workspacePath: input.workspacePath,
      }),
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
      verificationPassed: report?.summary.verdict === 'ready',
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

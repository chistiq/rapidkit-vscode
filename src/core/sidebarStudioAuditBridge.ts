import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';
import { normalizeAIActionContract, validateAIActionContract } from './aiActionContract.js';
import { recordAIActionContract, recordAIActionExecution } from './aiActionRegistry.js';
import { runRapidkitStreaming } from './streamingRapidkitRunner.js';
import {
  buildAgentActionOutcomeFromAudit,
  recordWorkspaceFeedbackViaCli,
} from './sidebarStudioFeedbackBridge.js';

export type SidebarStudioAuditKind =
  | 'auto-fix'
  | 'apply-patch'
  | 'verify-handoff'
  | 'ship-loop-step';

export type SidebarStudioPatchAuditMetadata = {
  patchId?: string;
  sourceAction?: 'auto-fix' | 'apply-patch';
  reviewRequired?: boolean;
  branchCreated?: string;
  appliedCount: number;
  rejectedCount: number;
  failedCount: number;
  affectedFiles: string[];
  rollbackCommand?: string;
};

export type RecordSidebarStudioFixAuditInput = {
  workspacePath: string;
  handoff?: StudioBlockerHandoff;
  kind: SidebarStudioAuditKind;
  actionId: string;
  summary: string;
  ok: boolean;
  appliedFixes?: Array<{ path: string; action: string; outcome: string }>;
  rollbackCommand?: string;
  patchMetadata?: SidebarStudioPatchAuditMetadata;
  evidenceArtifactPath?: string;
};

export type SidebarStudioAuditResult = {
  ok: boolean;
  actionId: string;
  registryRecorded: boolean;
  feedbackRecorded: boolean;
  stale: boolean;
  error?: string;
  retryable?: boolean;
};

async function hashEvidenceFile(
  absolutePath: string
): Promise<{ sha256: string; sizeBytes: number } | null> {
  try {
    const buffer = await fs.readFile(absolutePath);
    return {
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      sizeBytes: buffer.length,
    };
  } catch {
    return null;
  }
}

function resolveEvidenceAbsolutePath(
  workspacePath: string,
  artifactPath?: string
): string | undefined {
  if (!artifactPath?.trim()) {
    return undefined;
  }
  return path.isAbsolute(artifactPath) ? artifactPath : path.join(workspacePath, artifactPath);
}

export async function recordSidebarStudioFixAudit(
  input: RecordSidebarStudioFixAuditInput
): Promise<SidebarStudioAuditResult> {
  const affectedFiles = (input.appliedFixes ?? [])
    .filter((entry) => entry.outcome === 'applied')
    .map((entry) => entry.path.trim())
    .filter(Boolean);

  const absoluteEvidence = resolveEvidenceAbsolutePath(
    input.workspacePath,
    input.evidenceArtifactPath ?? input.handoff?.artifactPath
  );
  const evidenceHash = absoluteEvidence ? await hashEvidenceFile(absoluteEvidence) : null;

  const contract = normalizeAIActionContract({
    actionType: input.kind === 'verify-handoff' ? 'verify' : 'fix',
    summary: `[sidebar-studio:${input.kind}] ${input.summary}`,
    affectedFiles,
    proposedCommands: input.handoff?.verifyCommand ? [input.handoff.verifyCommand] : [],
    verificationCommands: input.handoff?.verifyCommand ? [input.handoff.verifyCommand] : [],
    rollbackPlan: input.rollbackCommand ? [input.rollbackCommand] : [],
    confidence: input.ok ? 0.9 : 0.5,
    requiresApproval: true,
  });
  if (!contract) {
    return {
      ok: false,
      actionId: input.actionId,
      registryRecorded: false,
      feedbackRecorded: false,
      stale: true,
      error: 'Could not build an audit contract for this Studio action.',
      retryable: false,
    };
  }

  const validation = validateAIActionContract(contract, {
    workspacePath: input.workspacePath,
    strict: false,
  });

  const entry = await recordAIActionContract(input.workspacePath, {
    contract,
    validation,
    provider: 'workspai-sidebar-studio',
    rawJson: JSON.stringify({
      kind: input.kind,
      actionId: input.actionId,
      cardId: input.handoff?.cardId,
      handoffSource: input.handoff?.handoffSource,
      blockerSignature: input.handoff?.blockerSignature,
      patchMetadata: input.patchMetadata,
    }),
  });

  await recordAIActionExecution(input.workspacePath, entry.id, {
    operation: input.kind === 'verify-handoff' ? 'verify' : 'apply',
    ok: input.ok,
    summary: input.summary,
    evidencePath: absoluteEvidence ?? null,
    evidenceSha256: evidenceHash?.sha256 ?? null,
    evidenceSizeBytes: evidenceHash?.sizeBytes ?? null,
    commandCount: 1,
    failedCommandCount: input.ok ? 0 : 1,
    failedCommands: input.ok ? [] : [input.actionId],
  });

  const feedbackPayload = buildAgentActionOutcomeFromAudit(input, {
    sha256: evidenceHash?.sha256 ?? null,
    path: absoluteEvidence ?? null,
  });
  const feedbackResult = await recordWorkspaceFeedbackViaCli({
    workspacePath: input.workspacePath,
    payload: feedbackPayload,
    runCommand: async ({ command, cwd, stdin }) => {
      const result = await runRapidkitStreaming({
        command,
        cwd,
        featureLabel: 'Studio audit feedback',
        stdin,
        timeoutMs: 30_000,
      });
      return {
        failed: result.failed,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    },
  });
  const feedbackRecorded = feedbackResult.ok || feedbackResult.skipped === true;
  return {
    ok: feedbackRecorded,
    actionId: input.actionId,
    registryRecorded: true,
    feedbackRecorded,
    stale: !feedbackRecorded,
    error: feedbackRecorded
      ? undefined
      : feedbackResult.error ||
        `Workspace feedback record failed for ${input.actionId}. History may be stale.`,
    retryable: feedbackResult.retryable ?? !feedbackRecorded,
  };
}

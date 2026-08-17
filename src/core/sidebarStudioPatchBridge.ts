import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';

import { askConfiguredAIProvider } from './aiProviderService.js';
import { prepareAIConversation } from './aiService.js';
import {
  applyPatches,
  extractPatchesFromAiResponse,
  normalizePatchesForWorkspaceScope,
  preparePatchesForReview,
  type FilePatch,
} from './patchApplyEngine.js';
import { loadAnalyzeReport } from '../ui/panels/incidentStudioAnalyze.js';
import { classifyIncidentActionPolicy } from '../ui/panels/incidentStudioPromptPolicy.js';
import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';
import { buildEvidenceAgentContextBundle } from './evidenceAgentContextBundle.js';
import {
  inspectStudioAgentFiles,
  parseStudioAgentAction,
  StudioAgentSession,
  STUDIO_EVIDENCE_REFRESH_COMMAND_IDS,
  STUDIO_AGENT_MAX_TURNS,
  type StudioAgentFileObservation,
  type StudioEvidenceRefreshCommandId,
} from './sidebarStudioAgentRuntime.js';
import { isStudioModelOwnedSourcePath } from './studioWorkspacePathPolicy.js';

export { STUDIO_EVIDENCE_REFRESH_COMMAND_IDS } from './sidebarStudioAgentRuntime.js';
export type { StudioEvidenceRefreshCommandId } from './sidebarStudioAgentRuntime.js';
import type {
  StudioEvidenceRefreshRequest,
  StudioPatchTransactionProgress,
  StudioPatchTransactionResult,
} from './studioPatchTransaction.js';

/** @deprecated Import StudioPatchTransactionResult from studioPatchTransaction. */
export type SidebarPatchBridgeResult = StudioPatchTransactionResult;
/** @deprecated Import StudioPatchTransactionProgress from studioPatchTransaction. */
export type SidebarPatchBridgeProgress = StudioPatchTransactionProgress;

export function validateSidebarStudioRepairResponse(responseText: string): {
  valid: boolean;
  mode: 'patch' | 'refresh-evidence' | 'invalid';
  reason?: string;
} {
  const refresh = parseStudioEvidenceRefreshRequest(responseText);
  const containsControlContract = responseText.includes('workspai.studio-evidence-action.v1');
  const patches = extractPatchesFromAiResponse(responseText, {
    actionId: 'response-validation',
    workspacePath: path.parse(process.cwd()).root,
  });
  if (refresh && patches.length > 0) {
    return {
      valid: false,
      mode: 'invalid',
      reason: 'Response mixed a refresh action with file patches.',
    };
  }
  if (containsControlContract && !refresh) {
    return {
      valid: false,
      mode: 'invalid',
      reason: 'Evidence control contract is malformed or not allowlisted.',
    };
  }
  if (refresh) {
    return { valid: true, mode: 'refresh-evidence' };
  }
  if (patches.length > 0) {
    return { valid: true, mode: 'patch' };
  }
  return {
    valid: false,
    mode: 'invalid',
    reason: 'Response contained neither a valid refresh contract nor path-scoped patches.',
  };
}

const MAX_AUTONOMOUS_PATCH_FILES = 3;
const MAX_AUTONOMOUS_PATCH_BYTES = 256 * 1024;
const MAX_REPAIR_EVIDENCE_BYTES = 64 * 1024;
const MAX_REPAIR_EVIDENCE_FILE_BYTES = 16 * 1024;
const MAX_CONTRACT_TARGET_CANDIDATES = 12;
const MAX_CONTRACT_TARGET_SOURCE_BYTES = 2 * 1024 * 1024;
const SENSITIVE_PATCH_PATH =
  /(?:^|\/)(?:\.env(?:\.|$)|\.npmrc$|\.pypirc$|id_[^/]+$|[^/]*(?:secret|credential)[^/]*$)/i;
const GENERATED_OR_VENDOR_TARGET =
  /(?:^|\/)(?:\.git|node_modules|dist|build|coverage)(?:\/|$)|^\.workspai\/(?:reports|cache|snapshots)(?:\/|$)/i;

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

function isPathInside(parentPath: string, candidatePath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveRepairTargetRelativePath(input: {
  workspacePath: string;
  projectPath?: string;
  scope: StudioBlockerHandoff['scope'];
  targetPath: string;
}): string | null {
  const rawTarget = input.targetPath.trim();
  if (!rawTarget) {
    return null;
  }
  const workspacePath = path.resolve(input.workspacePath);
  const projectPath = input.projectPath?.trim() ? path.resolve(input.projectPath) : undefined;
  const sourceRoot = projectPath ?? workspacePath;
  const absoluteTarget = path.isAbsolute(rawTarget)
    ? path.resolve(rawTarget)
    : path.resolve(sourceRoot, rawTarget);
  if (!isPathInside(sourceRoot, absoluteTarget)) {
    return null;
  }
  return normalizeRelativePath(path.relative(sourceRoot, absoluteTarget));
}

export type SidebarStudioRepairEvidence = {
  promptSection: string;
  exactTargetPaths: string[];
  autonomousTargetPaths: string[];
  expectedBaseSha256: Record<string, string | null>;
  missingRequired: string[];
  evidenceFingerprint: string;
  authorizedEvidencePaths: string[];
};

function isStudioEvidenceRefreshCommandId(value: unknown): value is StudioEvidenceRefreshCommandId {
  return (
    typeof value === 'string' &&
    (STUDIO_EVIDENCE_REFRESH_COMMAND_IDS as readonly string[]).includes(value)
  );
}

export function parseStudioEvidenceRefreshRequest(
  responseText: string
): StudioEvidenceRefreshRequest | null {
  const candidates = [
    ...responseText.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi),
    ...responseText.matchAll(/<workspai-evidence-action>([\s\S]*?)<\/workspai-evidence-action>/gi),
  ];
  for (const match of candidates) {
    try {
      const payload = JSON.parse(match[1].trim()) as Record<string, unknown>;
      if (
        payload.schemaVersion !== 'workspai.studio-evidence-action.v1' ||
        payload.action !== 'refresh-evidence' ||
        !isStudioEvidenceRefreshCommandId(payload.commandId)
      ) {
        continue;
      }
      const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
      return {
        schemaVersion: 'workspai.studio-evidence-action.v1',
        action: 'refresh-evidence',
        commandId: payload.commandId,
        reason: reason || 'The model needs fresh governed evidence before continuing repair.',
      };
    } catch {
      // Ignore prose and malformed JSON; patch extraction remains the fallback.
    }
  }
  return null;
}

async function readBoundedUtf8(absolutePath: string): Promise<string | null> {
  try {
    const buffer = await fs.readFile(absolutePath);
    return buffer.subarray(0, MAX_REPAIR_EVIDENCE_FILE_BYTES).toString('utf8');
  } catch {
    return null;
  }
}

function collectContractAuthoredPathValues(value: unknown, key = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectContractAuthoredPathValues(entry, key));
  }
  if (!value || typeof value !== 'object') {
    if (
      typeof value === 'string' &&
      (key === 'contractPath' || key === 'targetPath' || key === 'files')
    ) {
      return [value];
    }
    return [];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([childKey, childValue]) =>
    collectContractAuthoredPathValues(childValue, childKey)
  );
}

async function discoverContractAuthoredRepairTargets(input: {
  workspacePath: string;
  attachments: Awaited<ReturnType<typeof buildEvidenceAgentContextBundle>>['attachments'];
}): Promise<string[]> {
  const targets = new Set<string>();
  for (const attachment of input.attachments) {
    if (
      targets.size >= MAX_CONTRACT_TARGET_CANDIDATES ||
      !attachment.exists ||
      attachment.validity !== 'valid' ||
      !attachment.relativePath.endsWith('.json')
    ) {
      continue;
    }
    const artifactPath = path.resolve(input.workspacePath, attachment.relativePath);
    if (!isPathInside(input.workspacePath, artifactPath)) {
      continue;
    }
    try {
      const stats = await fs.stat(artifactPath);
      if (stats.size > MAX_CONTRACT_TARGET_SOURCE_BYTES) {
        continue;
      }
      const payload = JSON.parse(await fs.readFile(artifactPath, 'utf8')) as unknown;
      for (const rawTarget of collectContractAuthoredPathValues(payload)) {
        const relativePath = resolveRepairTargetRelativePath({
          workspacePath: input.workspacePath,
          scope: 'workspace',
          targetPath: rawTarget,
        });
        if (
          !relativePath ||
          relativePath === attachment.relativePath ||
          GENERATED_OR_VENDOR_TARGET.test(relativePath) ||
          !isStudioModelOwnedSourcePath(relativePath)
        ) {
          continue;
        }
        targets.add(relativePath);
        if (targets.size >= MAX_CONTRACT_TARGET_CANDIDATES) {
          break;
        }
      }
    } catch {
      // Contract validity and bounded parsing are defensive inputs. A broken
      // optional report remains diagnostic evidence, never a write authority.
    }
  }
  return [...targets];
}

/**
 * Materialize the CLI-authored intelligence bundle for Studio. Unlike the
 * Copilot handoff, the internal model cannot resolve #file references, so the
 * governed artifact excerpts and exact target sources are embedded directly.
 */
export async function collectSidebarStudioRepairEvidence(input: {
  workspacePath: string;
  projectPath?: string;
  handoff: StudioBlockerHandoff;
}): Promise<SidebarStudioRepairEvidence> {
  const bundle = await buildEvidenceAgentContextBundle({
    workspacePath: input.workspacePath,
    workspaceName: path.basename(input.workspacePath),
    projectPath: input.projectPath,
    projectName: input.projectPath ? path.basename(input.projectPath) : undefined,
    card: {
      id: input.handoff.cardId,
      label: input.handoff.cardLabel ?? input.handoff.cardId,
      status: input.handoff.cardStatus,
      summary: input.handoff.blockers[0] ?? 'Studio remediation requested.',
      scope: input.handoff.scope,
      artifactPath: input.handoff.artifactPath,
      blockers: input.handoff.blockers,
      metrics: {
        ...(input.handoff.stderrTail ? { stderrTail: input.handoff.stderrTail } : {}),
        ...(input.handoff.exitCode !== undefined && input.handoff.exitCode !== null
          ? { exitCode: input.handoff.exitCode }
          : {}),
      },
    },
    blockerHandoff: input.handoff,
  });

  const hintedTargetPaths = Array.from(
    new Set(
      (input.handoff.resolutionHints ?? [])
        .flatMap((hint) => hint.fixHints ?? [])
        .map((hint) => hint.targetPath ?? '')
        .map((targetPath) =>
          resolveRepairTargetRelativePath({
            workspacePath: input.workspacePath,
            projectPath: input.projectPath ?? input.handoff.projectPath,
            scope: input.handoff.scope,
            targetPath,
          })
        )
        .filter((targetPath): targetPath is string => Boolean(targetPath))
        .filter((targetPath) => isStudioModelOwnedSourcePath(targetPath))
    )
  );
  const repairProjectPath = input.projectPath ?? input.handoff.projectPath;
  const contractTargetPaths = repairProjectPath
    ? []
    : await discoverContractAuthoredRepairTargets({
        workspacePath: input.workspacePath,
        attachments: bundle.attachments,
      });
  const exactTargetPaths = Array.from(new Set([...hintedTargetPaths, ...contractTargetPaths]));

  const expectedBaseSha256: Record<string, string | null> = {};
  const autonomousTargetPaths: string[] = [];
  const sections: string[] = [
    '## Governed CLI intelligence bundle',
    ...bundle.summaryLines.map((line) => `- ${line}`),
  ];
  if (bundle.missingRequired.length > 0) {
    sections.push(`- Missing required evidence: ${bundle.missingRequired.join(', ')}`);
  }
  if (contractTargetPaths.length > 0) {
    sections.push(
      `- Contract-authored source targets: ${contractTargetPaths.join(', ')}`,
      '- These targets came from valid CLI artifacts and are authorized source candidates, not generated reports.'
    );
  }

  // Exact target source must precede optional artifact excerpts so it can
  // never be clipped by the bounded prompt budget.
  sections.push('', '## Exact repair target sources');
  const sourceRoot = repairProjectPath ?? input.workspacePath;
  for (const relativePath of exactTargetPaths) {
    const absolutePath = path.resolve(sourceRoot, relativePath);
    let fullContent: string | null = null;
    try {
      fullContent = await fs.readFile(absolutePath, 'utf8');
    } catch {
      fullContent = null;
    }
    const content = fullContent?.slice(0, MAX_REPAIR_EVIDENCE_FILE_BYTES) ?? null;
    expectedBaseSha256[relativePath] =
      fullContent === null
        ? null
        : crypto.createHash('sha256').update(fullContent, 'utf8').digest('hex');
    if (
      fullContent === null ||
      Buffer.byteLength(fullContent, 'utf8') <= MAX_REPAIR_EVIDENCE_FILE_BYTES
    ) {
      autonomousTargetPaths.push(relativePath);
    }
    sections.push(
      '',
      `<repair-target path="${relativePath}" base-sha256="${expectedBaseSha256[relativePath] ?? 'absent'}">`,
      content ?? '[file does not exist]',
      '</repair-target>'
    );
  }

  let totalBytes = Buffer.byteLength(sections.join('\n'), 'utf8');
  const orderedAttachments = [...bundle.attachments].sort((left, right) => {
    const leftIsCard = left.relativePath === normalizeRelativePath(input.handoff.artifactPath);
    const rightIsCard = right.relativePath === normalizeRelativePath(input.handoff.artifactPath);
    return (
      Number(rightIsCard) - Number(leftIsCard) || Number(right.required) - Number(left.required)
    );
  });
  for (const attachment of orderedAttachments) {
    if (!attachment.exists || totalBytes >= MAX_REPAIR_EVIDENCE_BYTES) {
      continue;
    }
    const absolutePath = path.resolve(input.workspacePath, attachment.relativePath);
    if (!isPathInside(input.workspacePath, absolutePath)) {
      continue;
    }
    const content = await readBoundedUtf8(absolutePath);
    if (content === null) {
      continue;
    }
    const block = [
      '',
      `<governed-evidence path="${normalizeRelativePath(attachment.relativePath)}" label="${attachment.label}" validity="${attachment.validity ?? 'unknown'}">`,
      content,
      '</governed-evidence>',
    ].join('\n');
    const remaining = MAX_REPAIR_EVIDENCE_BYTES - totalBytes;
    const boundedBlock =
      Buffer.byteLength(block, 'utf8') <= remaining ? block : block.slice(0, remaining);
    sections.push(boundedBlock);
    totalBytes += Buffer.byteLength(boundedBlock, 'utf8');
  }

  const attachmentValidity = new Map(
    bundle.attachments.map((attachment) => [attachment.relativePath, attachment.validity])
  );
  const observedEvidencePaths = [
    ...new Set([
      ...bundle.attachments.map((attachment) => attachment.relativePath),
      ...exactTargetPaths,
    ]),
  ].sort();
  const evidenceFingerprint = crypto
    .createHash('sha256')
    .update(
      JSON.stringify(
        await Promise.all(
          observedEvidencePaths.map(async (relativePath) => {
            const absolutePath = path.resolve(
              exactTargetPaths.includes(relativePath) ? sourceRoot : input.workspacePath,
              relativePath
            );
            try {
              const stat = await fs.stat(absolutePath);
              const contentHash =
                stat.isFile() && stat.size <= MAX_CONTRACT_TARGET_SOURCE_BYTES
                  ? crypto
                      .createHash('sha256')
                      .update(await fs.readFile(absolutePath))
                      .digest('hex')
                  : null;
              return [
                relativePath,
                attachmentValidity.get(relativePath) ?? 'repair-target',
                stat.size,
                contentHash ?? stat.mtimeMs,
              ];
            } catch {
              return [
                relativePath,
                attachmentValidity.get(relativePath) ?? 'repair-target',
                null,
                null,
              ];
            }
          })
        )
      )
    )
    .digest('hex');

  return {
    promptSection: sections.join('\n'),
    exactTargetPaths,
    autonomousTargetPaths,
    expectedBaseSha256,
    missingRequired: bundle.missingRequired,
    evidenceFingerprint,
    authorizedEvidencePaths: bundle.attachments
      .filter((attachment) => attachment.exists)
      .map((attachment) => normalizeRelativePath(attachment.relativePath)),
  };
}

/**
 * AI-generated writes are automatic only when the CLI handoff names every
 * target exactly and provides a verify path. Otherwise Studio pauses once for
 * patch review while preserving the generated proposal.
 */
export function canAutonomouslyApplySidebarPatches(input: {
  handoff: StudioBlockerHandoff;
  patches: FilePatch[];
  exactTargetPaths?: string[];
}): boolean {
  if (
    !input.handoff.verifyCommand?.trim() ||
    input.handoff.safetyRisk === 'destructive' ||
    input.patches.length === 0 ||
    input.patches.length > MAX_AUTONOMOUS_PATCH_FILES
  ) {
    return false;
  }
  const exactTargets = new Set(
    input.exactTargetPaths?.length
      ? input.exactTargetPaths.map(normalizeRelativePath)
      : (input.handoff.resolutionHints ?? [])
          .flatMap((hint) => hint.fixHints ?? [])
          .map((hint) => hint.targetPath?.trim() ?? '')
          .filter(Boolean)
          .map(normalizeRelativePath)
  );
  if (exactTargets.size === 0) {
    return false;
  }
  const totalPatchBytes = input.patches.reduce(
    (total, patch) => total + Buffer.byteLength(patch.patchedContent, 'utf8'),
    0
  );
  if (totalPatchBytes > MAX_AUTONOMOUS_PATCH_BYTES) {
    return false;
  }
  return input.patches.every((patch) => {
    const relativePath = normalizeRelativePath(patch.relativePath);
    return (
      exactTargets.has(relativePath) &&
      !SENSITIVE_PATCH_PATH.test(relativePath) &&
      Buffer.byteLength(patch.patchedContent, 'utf8') <= MAX_AUTONOMOUS_PATCH_BYTES
    );
  });
}

function buildSidebarCardRepairPatchPrompt(input: {
  handoff: StudioBlockerHandoff;
  analyzeContext?: string;
  evidenceContext: string;
}): string {
  const { handoff } = input;
  const primaryHint = handoff.resolutionHints?.[0];
  const fixHints = primaryHint?.fixHints ?? [];
  const lines = [
    'You are Workspai Studio running inside VS Code.',
    'Continue the active card repair session. Do not ask the user to restate the issue.',
    'Use the blocker handoff and evidence below as the source of truth.',
    'Treat only evidence marked validity="valid" as authoritative; invalid, uncontracted, or unknown entries are diagnostic context only.',
    'Do not invent write targets. A source/config patch must stay inside the exact repair-target paths supplied by the CLI hints.',
    '',
    '## Active card',
    `- Card: ${handoff.cardLabel ?? handoff.cardId}`,
    `- Status: ${handoff.cardStatus}`,
    `- Scope: ${handoff.scope}`,
    `- Workspace: ${handoff.workspacePath ? '$WORKSPACE' : 'unknown'}`,
    ...(handoff.projectPath ? ['- Project: $PROJECT'] : []),
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
    input.evidenceContext,
    '',
    '## Required output',
    '- Produce the smallest source/config patch that addresses the active blocker.',
    '- You may use one host tool per turn before producing a patch. Return only one raw JSON object (no prose):',
    '{"schemaVersion":"workspai.studio-agent-action.v1","action":"inspect-files","paths":["relative/path"],"reason":"why"}',
    '{"schemaVersion":"workspai.studio-agent-action.v1","action":"read-evidence","paths":[".workspai/reports/report.json"],"reason":"why"}',
    '{"schemaVersion":"workspai.studio-agent-action.v1","action":"run-command","commandId":"workspaceVerify","reason":"why"}',
    '- Never provide shell text as a tool request. Commands are selected only by allowlisted commandId.',
    '- If the current evidence is insufficient or stale, do not guess and do not emit a patch. Return only this versioned JSON contract:',
    '```json',
    '{"schemaVersion":"workspai.studio-evidence-action.v1","action":"refresh-evidence","commandId":"workspaceVerify","reason":"why this evidence is needed"}',
    '```',
    `- commandId must be one of: ${STUDIO_EVIDENCE_REFRESH_COMMAND_IDS.join(', ')}. Studio will policy-check and run it, then return the new artifacts to you in this same session.`,
    '- Only edit files needed for this blocker; do not scaffold unrelated frameworks or broad architecture.',
    '- For every file you create or modify, output a fenced code block in exactly this format:',
    '```<language> path: <relative/path/to/file>',
    '// complete final file content (never a fragment or placeholder)',
    '```',
    '- After patches, include a short verify command and rollback note.',
    '- Do not claim the patch was applied; Studio will validate, apply, and verify it after extracting the patch blocks.',
  ];
  return lines.join('\n');
}

export async function executeSidebarApplyDebugPatch(input: {
  context: vscode.ExtensionContext;
  workspacePath: string;
  handoff: StudioBlockerHandoff;
  projectPath?: string;
  requestedModelId?: string;
  onProgress?: (progress: SidebarPatchBridgeProgress) => void;
  onModelChunk?: (text: string) => void;
  onRunAgentCommand?: (
    commandId: StudioEvidenceRefreshCommandId,
    reason: string
  ) => Promise<{ success: boolean; summary: string }>;
}): Promise<SidebarPatchBridgeResult> {
  input.onProgress?.({
    phase: 'reading-ai-evidence',
    summary: 'Reading the blocker, governed artifacts, exact paths, and latest analyze evidence.',
  });
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
  try {
    let repairEvidence = await collectSidebarStudioRepairEvidence({
      workspacePath: input.workspacePath,
      projectPath: input.projectPath ?? input.handoff.projectPath,
      handoff: input.handoff,
    });
    if (repairEvidence.missingRequired.length > 0) {
      return {
        status: 'blocked',
        summary: `Required CLI intelligence is missing: ${repairEvidence.missingRequired.join(', ')}. Refresh workspace context before AI repair.`,
        missingRequired: repairEvidence.missingRequired,
      };
    }
    const groundedQuery = buildSidebarCardRepairPatchPrompt({
      handoff: input.handoff,
      analyzeContext,
      evidenceContext: repairEvidence.promptSection,
    });
    input.onProgress?.({
      phase: 'requesting-ai-repair',
      summary: 'The configured AI model is diagnosing the source issue from the card evidence.',
    });
    let prepared = await prepareAIConversation('ask', groundedQuery, {
      path: input.projectPath ?? input.handoff.projectPath ?? input.workspacePath,
      workspaceRootPath: input.workspacePath,
      projectRootPath: input.projectPath ?? input.handoff.projectPath,
      questionMaxChars: 96 * 1024,
      name: input.handoff.cardLabel ?? 'Studio',
      type: input.handoff.scope === 'project' ? 'project' : 'workspace',
    });
    let response = await askConfiguredAIProvider(
      input.context,
      prepared.messages,
      undefined,
      undefined,
      input.requestedModelId
    );
    let responseText = response.text.trim();
    if (!responseText) {
      return { status: 'failed', summary: 'Patch generation returned an empty response.' };
    }

    const latestEvidence = await collectSidebarStudioRepairEvidence({
      workspacePath: input.workspacePath,
      projectPath: input.projectPath ?? input.handoff.projectPath,
      handoff: input.handoff,
    });
    if (latestEvidence.evidenceFingerprint !== repairEvidence.evidenceFingerprint) {
      input.onProgress?.({
        phase: 'evidence-changed',
        summary:
          'Governed artifacts changed while the model was reasoning. Discarding the stale answer and grounding the model on the new generation.',
      });
      const refreshedQuery = buildSidebarCardRepairPatchPrompt({
        handoff: input.handoff,
        analyzeContext,
        evidenceContext: latestEvidence.promptSection,
      });
      const refreshedPrepared = await prepareAIConversation('ask', refreshedQuery, {
        path: input.projectPath ?? input.handoff.projectPath ?? input.workspacePath,
        workspaceRootPath: input.workspacePath,
        projectRootPath: input.projectPath ?? input.handoff.projectPath,
        questionMaxChars: 96 * 1024,
        name: input.handoff.cardLabel ?? 'Studio',
        type: input.handoff.scope === 'project' ? 'project' : 'workspace',
      });
      response = await askConfiguredAIProvider(
        input.context,
        refreshedPrepared.messages,
        undefined,
        undefined,
        input.requestedModelId
      );
      responseText = response.text.trim();
      if (!responseText) {
        return { status: 'failed', summary: 'Fresh-evidence repair returned an empty response.' };
      }
      repairEvidence = latestEvidence;
      prepared = refreshedPrepared;
    }

    const agentMessages = [...prepared.messages];
    const agentSession = new StudioAgentSession(
      `studio-${input.handoff.cardId}-${Date.now().toString(36)}`,
      input.handoff.blockerSignature
    );
    const inspectedPaths = new Set<string>();
    const requestedCommandIds = new Set<StudioEvidenceRefreshCommandId>();
    for (let toolTurn = 1; toolTurn <= STUDIO_AGENT_MAX_TURNS; toolTurn += 1) {
      const action = parseStudioAgentAction(responseText);
      if (!action) {
        break;
      }
      if (action.type === 'stop') {
        return { status: 'blocked', summary: action.reason };
      }
      let observation: Record<string, unknown>;
      if (action.type === 'inspect-files' || action.type === 'read-evidence') {
        const freshPaths = action.paths.filter((entry) => !inspectedPaths.has(entry));
        const inspectionDecision = agentSession.authorizeInspection(action.paths);
        if (!inspectionDecision.allowed && inspectionDecision.reason === 'already-observed') {
          observation = {
            schemaVersion: 'workspai.studio-agent-observation.v1',
            tool: action.type,
            ok: false,
            reason: 'already-inspected',
            guidance: 'Use the existing observation and choose a different action.',
            paths: action.paths,
          };
          agentMessages.push(
            { role: 'assistant', content: responseText },
            { role: 'user', content: JSON.stringify(observation) }
          );
          response = await askConfiguredAIProvider(
            input.context,
            [...agentMessages],
            undefined,
            undefined,
            input.requestedModelId
          );
          responseText = response.text.trim();
          continue;
        }
        if (!inspectionDecision.allowed) {
          return {
            status: 'failed',
            summary: 'Studio agent exceeded the workspace-scoped inspection safety boundary.',
          };
        }
        freshPaths.forEach((entry) => inspectedPaths.add(entry));
        input.onProgress?.({
          phase:
            action.type === 'inspect-files' ? 'inspecting-agent-files' : 'reading-agent-evidence',
          summary: `${action.reason} Reviewing ${freshPaths.length} file(s): ${freshPaths
            .map((entry) => path.basename(entry))
            .join(', ')}.`,
        });
        let files: StudioAgentFileObservation[];
        try {
          files = await inspectStudioAgentFiles({
            workspacePath: input.workspacePath,
            paths: freshPaths,
            kind: action.type === 'inspect-files' ? 'source' : 'evidence',
            authorizedEvidencePaths: repairEvidence.authorizedEvidencePaths,
          });
        } catch (toolError) {
          return {
            status: 'failed',
            summary: toolError instanceof Error ? toolError.message : String(toolError),
          };
        }
        if (action.type === 'inspect-files') {
          for (const file of files) {
            repairEvidence.expectedBaseSha256[file.path] = file.sha256;
          }
        }
        observation = {
          schemaVersion: 'workspai.studio-agent-observation.v1',
          tool: action.type,
          ok: true,
          evidenceGeneration: repairEvidence.evidenceFingerprint,
          files,
        };
      } else {
        if (!input.onRunAgentCommand) {
          return { status: 'failed', summary: 'Studio agent command host is unavailable.' };
        }
        const commandDecision = agentSession.authorizeCommand(
          action.commandId,
          repairEvidence.evidenceFingerprint
        );
        if (!commandDecision.allowed && commandDecision.reason === 'unchanged-generation') {
          observation = {
            schemaVersion: 'workspai.studio-agent-observation.v1',
            tool: 'run-command',
            commandId: action.commandId,
            ok: false,
            reason: 'unchanged-evidence-command-repeat-denied',
            guidance:
              'The command already ran for this evidence generation. Diagnose the result and choose another tool or produce the source fix.',
          };
          agentMessages.push(
            { role: 'assistant', content: responseText },
            { role: 'user', content: JSON.stringify(observation) }
          );
          response = await askConfiguredAIProvider(
            input.context,
            [...agentMessages],
            undefined,
            undefined,
            input.requestedModelId
          );
          responseText = response.text.trim();
          continue;
        }
        if (!commandDecision.allowed) {
          return {
            status: 'failed',
            summary: 'Studio agent exceeded the governed command safety boundary.',
          };
        }
        requestedCommandIds.add(action.commandId);
        input.onProgress?.({
          phase: 'running-agent-command',
          summary: `${action.reason} Running governed ${action.commandId}.`,
        });
        const commandResult = await input.onRunAgentCommand(action.commandId, action.reason);
        const nextEvidence = await collectSidebarStudioRepairEvidence({
          workspacePath: input.workspacePath,
          projectPath: input.projectPath ?? input.handoff.projectPath,
          handoff: input.handoff,
        });
        observation = {
          schemaVersion: 'workspai.studio-agent-observation.v1',
          tool: 'run-command',
          commandId: action.commandId,
          ok: commandResult.success,
          summary: commandResult.summary,
          evidenceGenerationBefore: repairEvidence.evidenceFingerprint,
          evidenceGenerationAfter: nextEvidence.evidenceFingerprint,
          updatedEvidence: nextEvidence.promptSection.slice(0, 48 * 1024),
        };
        repairEvidence = nextEvidence;
      }
      agentMessages.push(
        { role: 'assistant', content: responseText },
        { role: 'user', content: JSON.stringify(observation) }
      );
      response = await askConfiguredAIProvider(
        input.context,
        [...agentMessages],
        undefined,
        undefined,
        input.requestedModelId
      );
      responseText = response.text.trim();
      if (!responseText) {
        return { status: 'failed', summary: 'Studio agent returned an empty tool-loop response.' };
      }
      if (toolTurn === STUDIO_AGENT_MAX_TURNS && parseStudioAgentAction(responseText)) {
        input.onProgress?.({
          phase: 'agent-budget-exhausted',
          summary:
            'Studio compacted the completed tool observations and requested the smallest grounded source action.',
        });
        agentMessages.push({
          role: 'user',
          content: JSON.stringify({
            schemaVersion: 'workspai.studio-agent-checkpoint.v1',
            instruction:
              'Do not repeat a completed tool call. From the accumulated observations, return the smallest complete path-scoped patch now. If a new tool is essential, return exactly one tool action and explain why it is different.',
            inspectedPaths: [...inspectedPaths],
            commandsRun: [...requestedCommandIds],
            evidenceGeneration: repairEvidence.evidenceFingerprint,
            session: agentSession.snapshot(),
          }),
        });
        response = await askConfiguredAIProvider(
          input.context,
          [...agentMessages],
          undefined,
          undefined,
          input.requestedModelId
        );
        responseText = response.text.trim();
      }
    }
    prepared = { ...prepared, messages: agentMessages };

    let responseValidation = validateSidebarStudioRepairResponse(responseText);
    const refreshRequest = parseStudioEvidenceRefreshRequest(responseText);
    if (refreshRequest) {
      return {
        status: 'refresh-requested',
        summary: refreshRequest.reason,
        evidenceRefreshRequest: refreshRequest,
        responseText,
        responseStreamed: false,
      };
    }

    input.onProgress?.({
      phase: 'extracting-ai-patch',
      summary: 'AI diagnosis returned. Extracting complete file patches and their target paths.',
    });
    const actionId = `sidebar-fix-${input.handoff.cardId}`;
    const extractGroundedPatches = (text: string): FilePatch[] =>
      normalizePatchesForWorkspaceScope({
        workspacePath: input.workspacePath,
        projectPath: input.projectPath ?? input.handoff.projectPath,
        patches: extractPatchesFromAiResponse(text, {
          actionId,
          workspacePath: input.workspacePath,
        }),
      }).map((patch) => ({
        ...patch,
        baseSha256: Object.prototype.hasOwnProperty.call(
          repairEvidence.expectedBaseSha256,
          normalizeRelativePath(patch.relativePath)
        )
          ? repairEvidence.expectedBaseSha256[normalizeRelativePath(patch.relativePath)]
          : undefined,
      }));
    let rawPatches = extractGroundedPatches(responseText);

    if (!responseValidation.valid || rawPatches.length === 0) {
      input.onProgress?.({
        phase: 'requesting-ai-repair',
        summary:
          'The first diagnosis lacked a machine-applicable patch. Returning schema feedback to the model once.',
      });
      response = await askConfiguredAIProvider(
        input.context,
        [
          ...prepared.messages,
          { role: 'assistant', content: responseText.slice(0, 12_000) },
          {
            role: 'user',
            content: `OUTPUT VALIDATION FAILED: ${responseValidation.reason ?? 'no complete path-scoped file patch was found'} Return only the smallest complete patch using fenced blocks in the required path-scoped format. Do not mix control JSON and patches.`,
          },
        ],
        undefined,
        undefined,
        input.requestedModelId
      );
      responseText = response.text.trim();
      responseValidation = validateSidebarStudioRepairResponse(responseText);
      rawPatches = extractGroundedPatches(responseText);
      const evidenceAfterCorrection = await collectSidebarStudioRepairEvidence({
        workspacePath: input.workspacePath,
        projectPath: input.projectPath ?? input.handoff.projectPath,
        handoff: input.handoff,
      });
      if (evidenceAfterCorrection.evidenceFingerprint !== repairEvidence.evidenceFingerprint) {
        return {
          status: 'blocked',
          summary:
            'Evidence changed during response correction. Start a fresh grounded repair attempt.',
        };
      }
    }

    if (!responseValidation.valid || rawPatches.length === 0) {
      return {
        status: 'failed',
        summary: 'No file patches were found in the Studio response.',
        responseText,
        responseStreamed: false,
      };
    }

    input.onProgress?.({
      phase: 'evaluating-ai-patch',
      summary: 'Checking patch scope, sensitive paths, size limits, verify command, and CLI hints.',
    });
    const shouldAutoApply =
      actionPolicy.riskClass !== 'high-risk-mutating' &&
      canAutonomouslyApplySidebarPatches({
        handoff: input.handoff,
        patches: rawPatches,
        exactTargetPaths: repairEvidence.autonomousTargetPaths,
      });

    if (!shouldAutoApply) {
      const preparedPatches = await preparePatchesForReview({
        workspacePath: input.workspacePath,
        patches: rawPatches,
        expectedBaseSha256: repairEvidence.expectedBaseSha256,
      });
      return {
        status: 'review',
        summary:
          'Patch review required: the proposed write is not fully covered by exact CLI target hints and a safe verify path.',
        responseText: `I inspected the governed evidence and prepared ${preparedPatches.length} file change(s) for review.`,
        responseStreamed: false,
        pendingPatches: preparedPatches,
      };
    }

    input.onProgress?.({
      phase: 'applying-ai-patch',
      summary:
        'The patch passed the autonomous safety boundary. Applying it with rollback metadata.',
    });
    const patchResult = await applyPatches({
      actionId,
      workspacePath: input.workspacePath,
      patches: rawPatches,
      branchSafeApply: true,
      expectedBaseSha256: repairEvidence.expectedBaseSha256,
    });

    const appliedFixes = patchResult.patches
      .filter((patch) => patch.status === 'applied')
      .map((patch) => ({
        path: patch.relativePath,
        action: 'apply-debug-patch',
        outcome: 'applied',
      }));

    if (patchResult.appliedCount === 0) {
      const preparedPatches = await preparePatchesForReview({
        workspacePath: input.workspacePath,
        patches: rawPatches,
        expectedBaseSha256: repairEvidence.expectedBaseSha256,
      });
      return {
        status: 'review',
        summary: 'Patch apply did not succeed — review pending changes.',
        responseText: `I prepared ${preparedPatches.length} file change(s), but the autonomous apply boundary stopped the write.`,
        responseStreamed: false,
        patchResult,
        pendingPatches: preparedPatches,
      };
    }

    return {
      status: 'applied',
      summary: `Applied ${patchResult.appliedCount} patch(es). Run verify to refresh the card.`,
      responseText: `I applied ${patchResult.appliedCount} evidence-grounded file change(s). Running verification next.`,
      responseStreamed: false,
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
    // User approval plus the durable preimage stored by the host is the
    // explicit snapshot fallback for non-Git workspaces.
    branchSafeApply: false,
    acceptedPaths: input.acceptedPaths,
    expectedBaseSha256: Object.fromEntries(
      input.patches
        .filter((patch) => patch.baseSha256 !== undefined)
        .map((patch) => [patch.relativePath, patch.baseSha256 ?? null])
    ),
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

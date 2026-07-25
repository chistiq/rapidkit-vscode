import type { FilePatch, MultiFilePatchResult } from './patchApplyEngine.js';
import type { StudioEvidenceRefreshCommandId } from './sidebarStudioAgentRuntime.js';

/** Neutral result contract shared by patch review, apply, verify, and rollback. */
export type StudioPatchTransactionResult = {
  status: 'applied' | 'review' | 'blocked' | 'failed' | 'refresh-requested';
  summary: string;
  responseText?: string;
  patchResult?: MultiFilePatchResult;
  pendingPatches?: FilePatch[];
  appliedFixes?: Array<{ path: string; action: string; outcome: string }>;
  responseStreamed?: boolean;
  missingRequired?: string[];
  evidenceRefreshRequest?: StudioEvidenceRefreshRequest;
};

export type StudioEvidenceRefreshRequest = {
  schemaVersion: 'workspai.studio-evidence-action.v1';
  action: 'refresh-evidence';
  commandId: StudioEvidenceRefreshCommandId;
  reason: string;
};

export type StudioPatchTransactionProgress = {
  phase:
    | 'reading-ai-evidence'
    | 'evidence-changed'
    | 'refreshing-agent-evidence'
    | 'requesting-ai-repair'
    | 'inspecting-agent-files'
    | 'reading-agent-evidence'
    | 'running-agent-command'
    | 'agent-budget-exhausted'
    | 'extracting-ai-patch'
    | 'evaluating-ai-patch'
    | 'applying-ai-patch';
  summary: string;
};

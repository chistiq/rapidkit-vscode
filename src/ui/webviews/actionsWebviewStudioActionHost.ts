import type * as vscode from 'vscode';

import type { StudioBlockerHandoff } from '../../contracts/studio-blocker-handoff-contract.js';
import type { FilePatch } from '../../core/patchApplyEngine.js';
import type { SidebarStudioPatchAuditMetadata } from '../../core/sidebarStudioAuditBridge.js';
import type { StudioSidebarDashboardRefreshResult } from '../../core/studioSidebarDashboardRefresh.js';

export type ActionsWebviewStudioActionHost = {
  context?: vscode.ExtensionContext;
  getActiveBlockerHandoff: () => StudioBlockerHandoff | undefined;
  setActiveBlockerHandoff: (handoff: StudioBlockerHandoff) => void;
  getPendingPatches: (cardId: string, sessionId?: string) => FilePatch[] | undefined;
  deletePendingPatches: (cardId: string, sessionId?: string) => void;
  postInlineCreate: (command: string, data?: Record<string, unknown>) => void;
  retryLastSidebarStudioAudit: (sessionId?: string) => Promise<void>;
  runSidebarAutoFix: (
    handoff: StudioBlockerHandoff,
    sessionId?: string,
    payloadScope?: unknown,
    requestedModelId?: string
  ) => Promise<void>;
  auditSidebarStudioFix: (input: {
    sessionId?: string;
    workspacePath: string;
    handoff?: StudioBlockerHandoff;
    kind: 'auto-fix' | 'apply-patch' | 'verify-handoff' | 'ship-loop-step';
    actionId: string;
    summary: string;
    ok: boolean;
    appliedFixes?: Array<{ path: string; action: string; outcome: string }>;
    rollbackCommand?: string;
    patchMetadata?: SidebarStudioPatchAuditMetadata;
  }) => Promise<void>;
  refreshSidebarShipLoop: (input: {
    workspacePath?: string;
    projectPath?: string;
    projectName?: string;
    intent?: 'release';
  }) => Promise<void>;
  finalizeStudioVerifyHandoff: (input: {
    handoff: StudioBlockerHandoff;
    workspacePath: string;
    projectPath?: string;
    sessionId?: string;
    verifySucceeded: boolean;
    verifyExitCode?: number | null;
    verifyError?: string;
  }) => Promise<StudioSidebarDashboardRefreshResult>;
};

export type SidebarStudioActionPayload = {
  payloadRecord: Record<string, unknown>;
  action: string;
  sessionId?: string;
  handoff?: StudioBlockerHandoff;
};

export function buildActionsWebviewStudioActionHost(
  host: ActionsWebviewStudioActionHost
): ActionsWebviewStudioActionHost {
  return host;
}

export function resolveSidebarStudioActionPayload(
  payload: unknown,
  activeHandoff?: StudioBlockerHandoff,
  parseHandoff?: (value: unknown) => StudioBlockerHandoff | undefined
): SidebarStudioActionPayload {
  const payloadRecord =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const action = typeof payloadRecord.action === 'string' ? payloadRecord.action : '';
  const sessionId =
    typeof payloadRecord.sessionId === 'string' ? payloadRecord.sessionId : undefined;
  const handoff = parseHandoff?.(payloadRecord.blockerHandoff) ?? activeHandoff;

  return { payloadRecord, action, sessionId, handoff };
}

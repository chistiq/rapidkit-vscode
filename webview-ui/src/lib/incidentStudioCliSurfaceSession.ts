import { useCallback, useRef, useState } from 'react';

import type { IncidentProjectSelection } from '@/lib/incidentStudioPayload';
import type { IncidentStudioTelemetryGateSlice } from '@/lib/incidentStudioPolicyGateMapper';
import {
  canDispatchIncidentCliSurface,
  resolveIncidentCliSurfaceBlockReason,
} from '@/lib/incidentStudioCliSurfaceGate';
import type { IncidentUserMode } from '@/lib/incidentStudioPreferences';

export type IncidentCliSurfaceResult = {
  command: string;
  success: boolean;
  output?: string;
  error?: string;
};

export type IncidentCliSurfaceHostMessage = {
  command: string;
  data?: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

type UseIncidentStudioCliSurfaceOptions = {
  workspacePath: string;
  workspaceName?: string;
  projectSelection?: IncidentProjectSelection | null;
  userMode?: IncidentUserMode;
  telemetry?: IncidentStudioTelemetryGateSlice | null;
  postMessage: (command: string, data?: unknown) => void;
  onResult?: (result: IncidentCliSurfaceResult) => void;
};

function createRequestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isIncidentCliSurfaceHostCommand(command: string): boolean {
  return command === 'runIncidentInlineCommandDone';
}

export function useIncidentStudioCliSurface({
  workspacePath,
  workspaceName,
  projectSelection,
  userMode = 'guided',
  telemetry,
  postMessage,
  onResult,
}: UseIncidentStudioCliSurfaceOptions) {
  const [executingCommand, setExecutingCommand] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<IncidentCliSurfaceResult | null>(null);
  const [lastBlockReason, setLastBlockReason] = useState<string | null>(null);
  const pendingRequestIdRef = useRef<string | null>(null);

  const submitInlineCommand = useCallback(
    (command: string, options?: { cliActionId?: string }) => {
      const trimmed = command.trim();
      const blockReason = resolveIncidentCliSurfaceBlockReason({
        command: trimmed,
        cliActionId: options?.cliActionId,
        workspacePath,
        hasProjectSelected: !!projectSelection?.path,
        userMode,
        telemetry,
      });

      if (blockReason) {
        const blockedResult: IncidentCliSurfaceResult = {
          command: trimmed,
          success: false,
          error: blockReason,
        };
        setLastBlockReason(blockReason);
        setLastResult(blockedResult);
        onResult?.(blockedResult);
        return false;
      }

      const requestId = createRequestId('cli');
      pendingRequestIdRef.current = requestId;
      setLastBlockReason(null);
      setExecutingCommand(trimmed);
      postMessage('runIncidentInlineCommand', {
        command: trimmed,
        workspacePath,
        workspaceName,
        projectPath: projectSelection?.path,
        cliActionId: options?.cliActionId,
        requestId,
      });
      return true;
    },
    [postMessage, projectSelection?.path, telemetry, userMode, workspaceName, workspacePath]
  );

  const handleHostMessage = useCallback(
    (message: IncidentCliSurfaceHostMessage) => {
      if (message.command !== 'runIncidentInlineCommandDone') {
        return false;
      }

      const requestId =
        typeof message.meta?.requestId === 'string' ? message.meta.requestId : undefined;
      if (pendingRequestIdRef.current && requestId && pendingRequestIdRef.current !== requestId) {
        return false;
      }

      pendingRequestIdRef.current = null;
      setExecutingCommand(null);

      const result: IncidentCliSurfaceResult = {
        command: typeof message.data?.command === 'string' ? message.data.command : '',
        success: message.data?.success === true,
        output: typeof message.data?.output === 'string' ? message.data.output : undefined,
        error: typeof message.data?.error === 'string' ? message.data.error : undefined,
      };
      setLastResult(result);
      onResult?.(result);
      return true;
    },
    [onResult]
  );

  return {
    executingCommand,
    lastResult,
    lastBlockReason,
    submitInlineCommand,
    handleHostMessage,
    canDispatch: (command: string, options?: { cliActionId?: string }) =>
      canDispatchIncidentCliSurface({
        command,
        cliActionId: options?.cliActionId,
        workspacePath,
        hasProjectSelected: !!projectSelection?.path,
        userMode,
        telemetry,
      }),
  };
}

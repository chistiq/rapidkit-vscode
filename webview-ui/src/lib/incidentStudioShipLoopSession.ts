import { useCallback, useRef, useState } from 'react';

import type {
  StudioExecutionTranscript,
  PolicyGateState,
  ReleaseGatePosture,
} from '@/components/StudioRedesign/state/studioState';
import type { IncidentStudioTelemetryGateSlice } from '@/lib/incidentStudioPolicyGateMapper';
import {
  canDispatchShipLoopStep,
  resolveShipLoopDispatchBlockReason,
} from '@/lib/incidentStudioShipLoopGate';
import type {
  ShipLoopEvidenceCard,
  ShipLoopStepId,
  ShipLoopStudioEvidenceSlice,
} from '@/lib/incidentStudioShipLoop';

export type IncidentStudioShipEvidencePayload = {
  workspacePath?: string;
  cards: ShipLoopEvidenceCard[];
};

export type ShipLoopStepResult = {
  stepId: ShipLoopStepId | string;
  success: boolean;
  summary?: string;
  error?: string;
  proofEvent?: {
    schemaVersion: 'workspai.studio.proof-event.v1';
    actionId: string;
    status: 'completed' | 'failed';
    summary: string;
    generatedAt: string;
    evidencePath?: string | null;
    evidenceSha256?: string | null;
    gatePassed?: boolean;
    executionTranscriptId?: string;
    durationMs?: number;
    source: 'ship-loop';
  };
  executionTranscript?: StudioExecutionTranscript;
};

type UseIncidentStudioShipLoopOptions = {
  workspacePath: string;
  projectPath?: string;
  studioEvidence?: ShipLoopStudioEvidenceSlice | null;
  telemetry?: IncidentStudioTelemetryGateSlice | null;
  policyGates?: PolicyGateState;
  releasePosture?: ReleaseGatePosture;
  verifyGateBlockedReasons?: string[];
  postMessage: (command: string, data?: unknown) => void;
  onStepResult?: (result: ShipLoopStepResult) => void;
};

function createRequestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isIncidentStudioShipLoopHostCommand(command: string): boolean {
  return command === 'incidentStudioShipEvidence' || command === 'runShipLoopStepDone';
}

export function useIncidentStudioShipLoop({
  workspacePath,
  projectPath,
  studioEvidence,
  telemetry,
  policyGates,
  releasePosture,
  verifyGateBlockedReasons,
  postMessage,
  onStepResult,
}: UseIncidentStudioShipLoopOptions) {
  const [shipEvidence, setShipEvidence] = useState<IncidentStudioShipEvidencePayload | null>(null);
  const [executingStepId, setExecutingStepId] = useState<ShipLoopStepId | null>(null);
  const [lastResult, setLastResult] = useState<ShipLoopStepResult | null>(null);
  const [lastBlockReason, setLastBlockReason] = useState<string | null>(null);
  const pendingRequestIdRef = useRef<string | null>(null);

  const requestShipEvidence = useCallback(() => {
    postMessage('requestIncidentStudioShipEvidence', {
      workspacePath,
      projectPath,
      requestId: createRequestId('ship-evidence'),
    });
  }, [postMessage, projectPath, workspacePath]);

  const runShipLoopStep = useCallback(
    (stepId: ShipLoopStepId) => {
      const blockReason = resolveShipLoopDispatchBlockReason({
        stepId,
        shipEvidence,
        studioEvidence,
        telemetry,
        policyGates,
        releasePosture,
        verifyGateBlockedReasons,
      });

      if (blockReason) {
        setLastBlockReason(blockReason);
        setLastResult({
          stepId,
          success: false,
          error: blockReason,
        });
        return false;
      }

      const requestId = createRequestId('ship-loop');
      pendingRequestIdRef.current = requestId;
      setLastBlockReason(null);
      setExecutingStepId(stepId);
      postMessage('runShipLoopStep', {
        stepId,
        workspacePath,
        projectPath,
        requestId,
      });
      return true;
    },
    [
      policyGates,
      postMessage,
      projectPath,
      releasePosture,
      shipEvidence,
      studioEvidence,
      telemetry,
      verifyGateBlockedReasons,
      workspacePath,
    ]
  );

  const handleHostMessage = useCallback(
    (command: string, data?: unknown, meta?: Record<string, unknown>) => {
      if (command === 'incidentStudioShipEvidence') {
        const payload =
          data && typeof data === 'object'
            ? (data as IncidentStudioShipEvidencePayload)
            : { cards: [] };
        setShipEvidence(payload);
        return true;
      }

      if (command === 'runShipLoopStepDone') {
        const requestId = typeof meta?.requestId === 'string' ? meta.requestId : undefined;
        if (requestId && pendingRequestIdRef.current && requestId !== pendingRequestIdRef.current) {
          return false;
        }

        pendingRequestIdRef.current = null;
        setExecutingStepId(null);
        const result =
          data && typeof data === 'object'
            ? (data as ShipLoopStepResult)
            : { stepId: 'unknown', success: false, error: 'Ship loop step failed.' };
        setLastResult(result);
        onStepResult?.(result);
        if (!result.success) {
          setLastBlockReason(result.error ?? 'Ship loop step failed.');
        } else {
          setLastBlockReason(null);
          requestShipEvidence();
        }
        return true;
      }

      if (command === 'shipLoopPatchReverifyHint') {
        requestShipEvidence();
        postMessage('requestIncidentStudioTelemetry', {
          workspacePath,
          projectPath,
          forceRefresh: true,
        });
        return true;
      }

      return false;
    },
    [onStepResult, postMessage, projectPath, requestShipEvidence, workspacePath]
  );

  const canRunStep = useCallback(
    (stepId: ShipLoopStepId) =>
      canDispatchShipLoopStep({
        stepId,
        shipEvidence,
        studioEvidence,
        telemetry,
        policyGates,
        releasePosture,
        verifyGateBlockedReasons,
      }),
    [policyGates, releasePosture, shipEvidence, studioEvidence, telemetry, verifyGateBlockedReasons]
  );

  return {
    shipEvidence,
    executingStepId,
    lastResult,
    lastBlockReason,
    requestShipEvidence,
    runShipLoopStep,
    handleHostMessage,
    canRunStep,
  };
}

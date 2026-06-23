export type ArchitectureReasoningRuntimeEventsInput = {
  conversationId: string;
  actionId: string;
  actionType: string;
  workspacePath: string;
  framework?: string;
  wave2Contracts: {
    impactAssessment: {
      confidence: number;
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
    };
    releaseGateEvidence: {
      scopeKnown: boolean;
      verifyPathPresent: boolean;
      rollbackPathPresent: boolean;
      blockedReasons: string[];
    };
    architectureTelemetry: {
      warningCount: number;
      warnings: string[];
      unknownScopeBlocked: boolean;
    };
  };
  verifySuccess: boolean;
};

export type ArchitectureReasoningTelemetryHost = {
  trackStudioEvent: (
    command: string,
    workspacePath?: string,
    properties?: Record<string, unknown>
  ) => void;
};

export function emitArchitectureReasoningRuntimeEvents(
  host: ArchitectureReasoningTelemetryHost,
  input: ArchitectureReasoningRuntimeEventsInput
): void {
  const { wave2Contracts } = input;
  const warningCount = wave2Contracts.architectureTelemetry.warningCount;
  const unknownScopeBlocked = wave2Contracts.architectureTelemetry.unknownScopeBlocked;

  if (warningCount <= 0 && !unknownScopeBlocked) {
    return;
  }

  const commonProps = {
    conversationId: input.conversationId,
    actionId: input.actionId,
    actionType: input.actionType,
    framework: input.framework ?? 'unknown',
    riskLevel: wave2Contracts.impactAssessment.riskLevel,
    confidence: wave2Contracts.impactAssessment.confidence,
    warningCount,
    scopeKnown: wave2Contracts.releaseGateEvidence.scopeKnown,
    verifyPathPresent: wave2Contracts.releaseGateEvidence.verifyPathPresent,
    rollbackPathPresent: wave2Contracts.releaseGateEvidence.rollbackPathPresent,
    blockedReasonCount: wave2Contracts.releaseGateEvidence.blockedReasons.length,
  };

  if (warningCount > 0) {
    const warningSample = wave2Contracts.architectureTelemetry.warnings.slice(0, 2).join(' | ');

    host.trackStudioEvent('workspai.studio.architecture_warning_shown', input.workspacePath, {
      ...commonProps,
      warnings: warningSample,
    });

    host.trackStudioEvent('workspai.studio.architecture_warning_accepted', input.workspacePath, {
      ...commonProps,
      warnings: warningSample,
    });

    host.trackStudioEvent(
      input.verifySuccess
        ? 'workspai.studio.architecture_warning_falsified'
        : 'workspai.studio.architecture_breakage_prevented',
      input.workspacePath,
      {
        ...commonProps,
        warnings: warningSample,
        verifySuccess: input.verifySuccess,
      }
    );
  }

  if (unknownScopeBlocked) {
    const blockedReasonSample = wave2Contracts.releaseGateEvidence.blockedReasons
      .filter((reason) => /scope is unknown/i.test(reason))
      .slice(0, 2)
      .join(' | ');

    host.trackStudioEvent(
      'workspai.studio.architecture_unknown_scope_blocked',
      input.workspacePath,
      {
        ...commonProps,
        blockedReasons: blockedReasonSample,
      }
    );
  }
}

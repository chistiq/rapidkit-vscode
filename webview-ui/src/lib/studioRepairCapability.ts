import type {
  DoctorRemediationPlanStepView,
  DoctorRemediationPlanView,
} from '@/lib/doctorRemediationPlan';
import type { StudioBlockerHandoffView } from '@/lib/studioBlockerHandoff';

export type StudioRepairCapabilityFixKind =
  | 'workspace-edit'
  | 'doctor-fix'
  | 'patch-review'
  | 'run-command'
  | 'verify-only'
  | 'manual';

export type StudioRepairCapability = {
  cardId: string;
  blockerSignature: string;
  diagnosticCommand?: string;
  fixKind: StudioRepairCapabilityFixKind;
  canEditFiles: boolean;
  files: string[];
  requiresApproval: boolean;
  requiresReview: boolean;
  verifyCommand?: string;
  refreshCardIds: string[];
  reason: string;
  primaryLabel: string;
  secondaryLabel: string;
  statusLabel: string;
};

function classifyFixKind(
  step: DoctorRemediationPlanStepView | null,
  handoff: StudioBlockerHandoffView | null
): StudioRepairCapabilityFixKind {
  if (step?.canApply) {
    if (step.studioState === 'review-required') {
      return 'patch-review';
    }
    return step.kind === 'doctor-fix' ? 'doctor-fix' : 'workspace-edit';
  }
  if (step?.executable && step.originalCommand) {
    return 'run-command';
  }
  if (handoff?.verifyCommand) {
    return 'verify-only';
  }
  return 'manual';
}

function statusLabel(kind: StudioRepairCapabilityFixKind): string {
  switch (kind) {
    case 'workspace-edit':
      return 'Ready to edit';
    case 'doctor-fix':
      return 'Doctor fix available';
    case 'patch-review':
      return 'Approval needed';
    case 'run-command':
      return 'Check available';
    case 'verify-only':
      return 'Verify only';
    case 'manual':
      return 'Guidance only';
  }
}

function primaryLabel(
  kind: StudioRepairCapabilityFixKind,
  step: DoctorRemediationPlanStepView | null
): string {
  switch (kind) {
    case 'workspace-edit':
      switch (step?.operation?.type) {
        case 'file-create':
          return 'Create file';
        case 'file-append':
          return 'Append lines';
        case 'file-copy':
          return 'Copy file';
        case 'package-json-script':
          return 'Update script';
        case 'json-edit':
          return 'Update JSON';
        case 'env-key-add':
          return 'Add env keys';
        case 'makefile-target':
          return 'Add target';
        default:
          return 'Apply change';
      }
    case 'doctor-fix':
      return 'Apply change';
    case 'patch-review':
      return 'Review changes';
    case 'run-command':
      return 'Run check';
    case 'verify-only':
      return 'Run verify';
    case 'manual':
      return 'Review details';
  }
}

function reasonForCapability(input: {
  kind: StudioRepairCapabilityFixKind;
  step: DoctorRemediationPlanStepView | null;
  handoff: StudioBlockerHandoffView | null;
}): string {
  const { kind, step, handoff } = input;
  if (step?.studioReason) {
    return step.studioReason;
  }
  if (step?.previewSummary) {
    return step.previewSummary;
  }
  if (handoff?.blockers?.[0]) {
    return handoff.blockers[0];
  }
  if (kind === 'manual') {
    return 'No deterministic repair capability is attached to this evidence yet.';
  }
  return 'Studio selected the smallest evidence-backed action for this card.';
}

export function deriveStudioRepairCapability(input: {
  plan: DoctorRemediationPlanView | null;
  step: DoctorRemediationPlanStepView | null;
  handoff?: StudioBlockerHandoffView | null;
}): StudioRepairCapability | null {
  const handoff = input.handoff ?? null;
  const step = input.step;
  if (!handoff && !step) {
    return null;
  }

  const kind = classifyFixKind(step, handoff);
  const diagnosticCommand = step?.originalCommand || handoff?.sourceCommand || undefined;
  const verifyCommand = step?.verifyCommand || handoff?.verifyCommand || undefined;
  const files = step?.files ?? [];
  const canEditFiles =
    kind === 'workspace-edit' || kind === 'doctor-fix' || kind === 'patch-review';

  return {
    cardId: handoff?.cardId ?? 'unknown-card',
    blockerSignature: handoff?.blockerSignature ?? step?.id ?? 'unknown-blocker',
    diagnosticCommand,
    fixKind: kind,
    canEditFiles,
    files,
    requiresApproval: step?.requiresApproval ?? canEditFiles,
    requiresReview: kind === 'patch-review',
    verifyCommand,
    refreshCardIds: [handoff?.cardId, ...(step?.refreshCommands ?? [])].filter(
      (entry): entry is string => Boolean(entry)
    ),
    reason: reasonForCapability({ kind, step, handoff }),
    primaryLabel: primaryLabel(kind, step),
    secondaryLabel: diagnosticCommand ? 'Run check' : 'Refresh evidence',
    statusLabel: statusLabel(kind),
  };
}

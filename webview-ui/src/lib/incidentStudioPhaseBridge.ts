import type { IncidentPhase } from '@/components/StudioRedesign/state/studioState';
import type { StudioEvidenceSummary } from '@/components/StudioRedesign/state/studioState';
import {
  getPhaseNextAction,
  type IncidentPhaseContext,
  type IncidentStudioPhase,
} from './incidentStudioVerifyPolicy';
import {
  STUDIO_ACTION_COMMANDS,
  type StudioActionCommand,
} from '@/components/StudioRedesign/state/studioActions';
import type { IncidentStudioCompletenessAssessment } from './incidentStudioCompleteness';

const HOST_PHASES = new Set<IncidentPhase>(['detect', 'diagnose', 'plan', 'verify', 'learn']);

function normalizeStudioPhase(value: unknown): IncidentPhase {
  return normalizeHostConversationPhase(value) ?? 'detect';
}

export function normalizeHostConversationPhase(value: unknown): IncidentPhase | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase() as IncidentPhase;
  return HOST_PHASES.has(normalized) ? normalized : undefined;
}

export function resolveIncidentPhaseContext(input: {
  workspaceReady?: boolean;
  diagnosisReady?: boolean;
  planReady?: boolean;
  verifyReady?: boolean;
  priorResolutionAvailable?: boolean;
  studioEvidence?: StudioEvidenceSummary | null;
  completeness?: IncidentStudioCompletenessAssessment | null;
}): IncidentPhaseContext {
  const findings = input.studioEvidence?.findings ?? { fail: 0, warn: 0, info: 0 };
  const evidenceReady =
    Boolean(input.studioEvidence?.generatedAt) ||
    findings.fail + findings.warn + findings.info > 0 ||
    typeof input.studioEvidence?.score === 'number';

  return {
    workspaceReady: input.workspaceReady !== false,
    diagnosisReady:
      input.diagnosisReady === true ||
      evidenceReady ||
      (input.completeness?.present.includes('doctor') ?? false),
    planReady:
      input.planReady === true ||
      (evidenceReady &&
        (findings.fail > 0 ||
          findings.warn > 0 ||
          input.completeness?.present.includes('workspaceImpact') === true)),
    verifyReady:
      input.verifyReady === true ||
      Boolean(input.studioEvidence?.releaseGateCommand) ||
      (input.completeness?.present.includes('workspaceVerify') ?? false),
    priorResolutionAvailable: input.priorResolutionAvailable === true,
  };
}

export function deriveUiPhaseFromSignals(input: {
  hostPhase?: IncidentPhase;
  analyzeFindings?: { fail: number; warn: number; info: number };
  hasActionContract?: boolean;
  canVerify?: boolean;
  actionCompleted?: boolean;
  completenessLevel?: IncidentStudioCompletenessAssessment['level'];
}): IncidentPhase {
  if (input.hostPhase) {
    return input.hostPhase;
  }
  if (input.actionCompleted) {
    return 'learn';
  }
  if (input.canVerify || input.hasActionContract) {
    return 'verify';
  }
  const failCount = input.analyzeFindings?.fail ?? 0;
  const warnCount = input.analyzeFindings?.warn ?? 0;
  if (failCount > 0 || warnCount > 0) {
    return input.hasActionContract ? 'plan' : 'diagnose';
  }
  if (input.completenessLevel === 'enterprise-ready' || input.completenessLevel === 'operational') {
    return 'verify';
  }
  if (input.completenessLevel === 'partial') {
    return 'diagnose';
  }
  return 'detect';
}

export function mapPhaseToStudioCommand(
  phase: IncidentPhase,
  context: IncidentPhaseContext
): StudioActionCommand {
  const normalizedPhase = normalizeStudioPhase(phase);
  switch (normalizedPhase) {
    case 'detect':
      return STUDIO_ACTION_COMMANDS.runAnalyze;
    case 'diagnose':
      return STUDIO_ACTION_COMMANDS.impactLens;
    case 'plan':
      return STUDIO_ACTION_COMMANDS.fixLens;
    case 'verify':
      return STUDIO_ACTION_COMMANDS.verifyGates;
    case 'learn':
      return STUDIO_ACTION_COMMANDS.runAnalyze;
  }

  const next = getPhaseNextAction(normalizedPhase as IncidentStudioPhase, context);
  const action = next.primaryAction.toLowerCase();

  if (/impact|blast|radius|model-backed/i.test(action)) {
    return STUDIO_ACTION_COMMANDS.impactLens;
  }
  if (/verify|gate|proof|checklist/i.test(action)) {
    return STUDIO_ACTION_COMMANDS.verifyGates;
  }
  if (/fix|patch|governed|module|install/i.test(action)) {
    return STUDIO_ACTION_COMMANDS.fixLens;
  }
  if (/analyze|health|detect|sync workspace/i.test(action)) {
    return STUDIO_ACTION_COMMANDS.runAnalyze;
  }
  if (/memory|learn|save|archive/i.test(action)) {
    return STUDIO_ACTION_COMMANDS.runAnalyze;
  }

  return STUDIO_ACTION_COMMANDS.runAnalyze;
}

export function buildPhaseGuidance(input: {
  phase: IncidentPhase;
  context: IncidentPhaseContext;
}): {
  primaryAction: string;
  rationale: string;
  downgraded: boolean;
  command: StudioActionCommand;
} {
  const phase = normalizeStudioPhase(input.phase);
  const next = getPhaseNextAction(phase as IncidentStudioPhase, input.context);
  return {
    primaryAction: next.primaryAction,
    rationale: next.rationale,
    downgraded: next.downgraded,
    command: mapPhaseToStudioCommand(phase, input.context),
  };
}

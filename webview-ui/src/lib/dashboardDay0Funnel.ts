import type { WorkspaceStatus } from '@/types';
import type { DashboardEvidencePayload } from './dashboardEvidence';

export type DashboardDay0FunnelStepId =
  | 'workspace_selected'
  | 'first_artifact_generated'
  | 'first_blocker_selected'
  | 'studio_opened'
  | 'verify_passed';

export type DashboardDay0FunnelState = 'complete' | 'current' | 'pending';

export type DashboardDay0MilestoneSnapshot = {
  firstArtifactGenerated?: boolean;
  firstBlockerFixed?: boolean;
  verifyPassAfterStudioFix?: boolean;
  returnToDashboardAfterVerify?: boolean;
  studioOpened?: boolean;
};

export type DashboardDay0FunnelStep = {
  id: DashboardDay0FunnelStepId;
  label: string;
  cta: string;
  surface: 'home' | 'run' | 'repair' | 'studio';
  state: DashboardDay0FunnelState;
};

export type DashboardDay0Funnel = {
  steps: DashboardDay0FunnelStep[];
  completed: number;
  total: number;
  current: DashboardDay0FunnelStep;
  summary: string;
  recommendedFocus: DashboardRecommendedFocus;
};

export type DashboardRecommendedFocus = {
  title: string;
  detail: string;
  cta: string;
  section: 'overview' | 'operate' | 'repair';
  reason:
    | 'select-workspace'
    | 'generate-evidence'
    | 'repair-blocker'
    | 'verify-fix'
    | 'return-to-dashboard'
    | 'release-readiness';
};

export const DASHBOARD_DAY0_FUNNEL_CONTRACT: Array<
  Pick<DashboardDay0FunnelStep, 'id' | 'label' | 'cta' | 'surface'>
> = [
  {
    id: 'workspace_selected',
    label: 'Workspace selected',
    cta: 'Create or import workspace',
    surface: 'home',
  },
  {
    id: 'first_artifact_generated',
    label: 'First evidence',
    cta: 'Generate first evidence',
    surface: 'run',
  },
  {
    id: 'first_blocker_selected',
    label: 'Repair target',
    cta: 'Open Repair',
    surface: 'repair',
  },
  {
    id: 'studio_opened',
    label: 'Studio handoff',
    cta: 'Fix by Workspai',
    surface: 'studio',
  },
  {
    id: 'verify_passed',
    label: 'Verify passed',
    cta: 'Run verify',
    surface: 'repair',
  },
];

function contractStep(id: DashboardDay0FunnelStepId) {
  return DASHBOARD_DAY0_FUNNEL_CONTRACT.find((step) => step.id === id)!;
}

function hasWorkspaceSelected(workspaceStatus: WorkspaceStatus): boolean {
  return Boolean(workspaceStatus.hasWorkspace && workspaceStatus.workspacePath);
}

function hasGeneratedArtifact(evidence?: DashboardEvidencePayload | null): boolean {
  if (!evidence) {
    return false;
  }
  if (evidence.onboarding?.milestones?.firstArtifactGenerated === true) {
    return true;
  }
  if (
    typeof evidence.onboarding?.ttfvLabel === 'string' &&
    evidence.onboarding.ttfvLabel.length > 0
  ) {
    return true;
  }
  return evidence.cards.some(
    (card) =>
      card.status !== 'missing' &&
      (typeof card.artifactPath === 'string' ||
        typeof card.generatedAt === 'string' ||
        card.status === 'pass' ||
        card.status === 'warn' ||
        card.status === 'fail')
  );
}

function hasActionableBlocker(evidence?: DashboardEvidencePayload | null): boolean {
  return Boolean(
    evidence?.cards.some(
      (card) =>
        (card.status === 'fail' || card.status === 'warn') &&
        (card.incidentStudioTarget || (card.blockers?.length ?? 0) > 0)
    )
  );
}

function hasVerifyPassed(evidence?: DashboardEvidencePayload | null): boolean {
  if (evidence?.onboarding?.milestones?.verifyPassAfterStudioFix === true) {
    return true;
  }
  return Boolean(
    evidence?.cards.some(
      (card) =>
        (card.id === 'workspaceVerify' ||
          card.id === 'readiness' ||
          card.id === 'pipeline' ||
          card.id === 'autopilot') &&
        card.status === 'pass'
    )
  );
}

function buildRecommendedFocus(input: {
  workspaceSelected: boolean;
  firstArtifactGenerated: boolean;
  blockerReady: boolean;
  firstBlockerFixed: boolean;
  verifyPassed: boolean;
  returnToDashboardAfterVerify: boolean;
}): DashboardRecommendedFocus {
  if (!input.workspaceSelected) {
    return {
      title: 'Start with a workspace',
      detail: 'Create or import a workspace before running intelligence, repair, or release gates.',
      cta: 'Create or import',
      section: 'overview',
      reason: 'select-workspace',
    };
  }

  if (!input.firstArtifactGenerated) {
    return {
      title: 'Generate first evidence',
      detail:
        'Run workspace health or intelligence so Workspai can show real blockers and artifacts.',
      cta: 'Open Run',
      section: 'operate',
      reason: 'generate-evidence',
    };
  }

  if (!input.firstBlockerFixed && input.blockerReady) {
    return {
      title: 'Repair the first blocker',
      detail:
        'Use Repair to pick the active blocker, open Studio context, and keep the fix path evidence-backed.',
      cta: 'Open Repair',
      section: 'repair',
      reason: 'repair-blocker',
    };
  }

  if (!input.firstBlockerFixed && !input.blockerReady) {
    return {
      title: 'Refresh release readiness',
      detail:
        'No actionable blocker is attached yet. Refresh readiness so Workspai can confirm the next gate.',
      cta: 'Open Run',
      section: 'operate',
      reason: 'release-readiness',
    };
  }

  if (!input.verifyPassed) {
    return {
      title: 'Verify the fix',
      detail: 'Run the attached verify path before treating the workspace as ready.',
      cta: 'Verify in Repair',
      section: 'repair',
      reason: 'verify-fix',
    };
  }

  if (!input.returnToDashboardAfterVerify) {
    return {
      title: 'Refresh release readiness',
      detail:
        'Return to the dashboard, refresh artifacts, and confirm readiness after the passing verify run.',
      cta: 'Open Run',
      section: 'operate',
      reason: 'return-to-dashboard',
    };
  }

  return {
    title: 'Prepare release readiness',
    detail:
      'Your first repair loop is complete. Keep evidence fresh and run the release gate before shipping.',
    cta: 'Open Run',
    section: 'operate',
    reason: 'release-readiness',
  };
}

function resolveState(done: boolean, current: boolean): DashboardDay0FunnelState {
  if (done) {
    return 'complete';
  }
  return current ? 'current' : 'pending';
}

export function buildDashboardDay0Funnel(input: {
  workspaceStatus: WorkspaceStatus;
  evidence?: DashboardEvidencePayload | null;
}): DashboardDay0Funnel {
  const { workspaceStatus, evidence } = input;
  const milestones = evidence?.onboarding?.milestones;
  const workspaceSelected = hasWorkspaceSelected(workspaceStatus);
  const firstArtifactGenerated = hasGeneratedArtifact(evidence);
  const firstBlockerFixed = milestones?.firstBlockerFixed === true;
  const blockerReady = hasActionableBlocker(evidence);
  const studioOpened =
    milestones?.studioOpened === true ||
    milestones?.verifyPassAfterStudioFix === true ||
    milestones?.returnToDashboardAfterVerify === true;
  const repairTargetSelected = firstBlockerFixed || studioOpened;
  const verifyPassed = hasVerifyPassed(evidence);
  const returnToDashboardAfterVerify = milestones?.returnToDashboardAfterVerify === true;

  const steps: DashboardDay0FunnelStep[] = [
    {
      ...contractStep('workspace_selected'),
      state: resolveState(workspaceSelected, !workspaceSelected),
    },
    {
      ...contractStep('first_artifact_generated'),
      state: resolveState(firstArtifactGenerated, workspaceSelected && !firstArtifactGenerated),
    },
    {
      ...contractStep('first_blocker_selected'),
      state: resolveState(
        repairTargetSelected,
        firstArtifactGenerated && !repairTargetSelected && blockerReady
      ),
    },
    {
      ...contractStep('studio_opened'),
      state: resolveState(studioOpened, repairTargetSelected && blockerReady && !studioOpened),
    },
    {
      ...contractStep('verify_passed'),
      state: resolveState(verifyPassed, studioOpened && !verifyPassed),
    },
  ];

  const completed = steps.filter((step) => step.state === 'complete').length;
  const current =
    steps.find((step) => step.state === 'current') ??
    steps.find((step) => step.state === 'pending') ??
    steps[steps.length - 1];

  return {
    steps,
    completed,
    total: steps.length,
    current,
    summary: `${completed}/${steps.length} complete`,
    recommendedFocus: buildRecommendedFocus({
      workspaceSelected,
      firstArtifactGenerated,
      blockerReady,
      firstBlockerFixed,
      verifyPassed,
      returnToDashboardAfterVerify,
    }),
  };
}

export type DashboardEvidenceRawStatus = 'pass' | 'warn' | 'fail' | 'missing';

/**
 * User-facing posture is intentionally smaller than producer status.
 *
 * `status` describes the artifact outcome. `blocking` describes whether the
 * outcome currently prevents a governed transition. A failed or high-risk
 * diagnostic can therefore require attention without becoming a release
 * blocker.
 */
export type DashboardEvidencePosture = 'healthy' | 'attention' | 'blocked';

export type DashboardEvidencePostureInput = {
  status: DashboardEvidenceRawStatus;
  blocking?: boolean;
  stale?: boolean;
  pending?: boolean;
};

export function resolveDashboardEvidencePosture(
  input: DashboardEvidencePostureInput
): DashboardEvidencePosture {
  if (input.blocking === true) {
    return 'blocked';
  }
  if (input.pending || input.stale || input.status !== 'pass') {
    return 'attention';
  }
  return 'healthy';
}

export function dashboardEvidencePostureLabel(posture: DashboardEvidencePosture): string {
  switch (posture) {
    case 'blocked':
      return 'Blocked';
    case 'attention':
      return 'Needs attention';
    case 'healthy':
      return 'Healthy';
  }
}

export function dashboardEvidencePostureTone(
  posture: DashboardEvidencePosture
): 'danger' | 'warn' | 'good' {
  switch (posture) {
    case 'blocked':
      return 'danger';
    case 'attention':
      return 'warn';
    case 'healthy':
      return 'good';
  }
}

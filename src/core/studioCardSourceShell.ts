import { DASHBOARD_EVIDENCE_CARD_IDS } from '../contracts/dashboardEvidenceCards.js';
import type { DashboardCommandExecutionPlan } from './dashboardCommandExecutionPlan.js';
import { resolveDashboardCommandExecutionPlan } from './dashboardCommandExecutionPlan.js';
import { resolveDashboardCommandForEvidenceCard } from './dashboardReportRegistry.js';
import {
  WORKSPACE_MODEL_DIFF_REPORT_PATH,
  WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH,
} from './workspaceIntelligencePaths.js';

const DEFAULT_VERIFY_COMMAND = 'npx workspai workspace verify --json';

/** Intelligence-chain `--from` paths not expressed in generic dashboard cliArgs. */
const CARD_SOURCE_SHELL_OVERRIDES: Record<string, string> = {
  bootstrap: 'npx workspai bootstrap --ci --json',
  workspaceDiff: `npx workspai workspace diff --from ${WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH} --json`,
  workspaceImpact: `npx workspai workspace impact --from ${WORKSPACE_MODEL_DIFF_REPORT_PATH} --json`,
  share: 'npx workspai workspace share --output .workspai/reports/share-bundle.json --json',
  archive: 'npx workspai workspace export --output team-workspace.rapidkit-archive.zip --json',
};

function appendJsonFlag(cliArgs: string[]): string[] {
  if (cliArgs.includes('--json')) {
    return cliArgs;
  }
  return [...cliArgs, '--json'];
}

function buildShellFromCliArgs(cliArgs: string[]): string {
  return `npx workspai ${appendJsonFlag(cliArgs).join(' ')}`;
}

function buildShellFromExecutionPlan(plan: DashboardCommandExecutionPlan): string | undefined {
  if (plan.cliArgs.length > 0) {
    return buildShellFromCliArgs(plan.cliArgs);
  }
  return undefined;
}

export function buildStudioSourceCommandForCard(cardId: string): string {
  const override = CARD_SOURCE_SHELL_OVERRIDES[cardId];
  if (override) {
    return override;
  }

  const dashboardCommandId = resolveDashboardCommandForEvidenceCard(cardId);
  if (!dashboardCommandId) {
    return 'npx workspai doctor workspace --json';
  }

  const fromContract = buildShellFromExecutionPlan(
    resolveDashboardCommandExecutionPlan(dashboardCommandId)
  );
  if (fromContract) {
    return fromContract;
  }

  return 'npx workspai doctor workspace --json';
}

/** Executable Workspai CLI snippet per evidence card — derived from dashboard command contracts. */
export const CARD_SOURCE_SHELL: Record<string, string> = Object.fromEntries(
  DASHBOARD_EVIDENCE_CARD_IDS.map((cardId) => [cardId, buildStudioSourceCommandForCard(cardId)])
);

export { DEFAULT_VERIFY_COMMAND };

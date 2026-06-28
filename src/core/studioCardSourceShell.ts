import { DASHBOARD_EVIDENCE_CARD_IDS } from '../contracts/dashboardEvidenceCards.js';
import {
  resolveDashboardCommandContract,
  type DashboardCommandContract,
} from './dashboardCommandContracts.js';
import { resolveDashboardCommandForEvidenceCard } from './dashboardReportRegistry.js';
import {
  WORKSPACE_MODEL_DIFF_REPORT_PATH,
  WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH,
} from './workspaceIntelligencePaths.js';

const DEFAULT_VERIFY_COMMAND =
  'npx rapidkit workspace verify --from-impact .rapidkit/reports/workspace-impact-last-run.json --json';

/** Intelligence-chain `--from` paths not expressed in generic dashboard cliArgs. */
const CARD_SOURCE_SHELL_OVERRIDES: Record<string, string> = {
  workspaceDiff: `npx rapidkit workspace diff --from ${WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH} --json`,
  workspaceImpact: `npx rapidkit workspace impact --from ${WORKSPACE_MODEL_DIFF_REPORT_PATH} --json`,
  share: 'npx rapidkit workspace share',
  archive: 'npx rapidkit workspace export --json',
};

function appendJsonFlag(cliArgs: string[]): string[] {
  if (cliArgs.includes('--json')) {
    return cliArgs;
  }
  return [...cliArgs, '--json'];
}

function buildShellFromCliArgs(cliArgs: string[]): string {
  return `npx rapidkit ${appendJsonFlag(cliArgs).join(' ')}`;
}

function buildShellFromContract(contract: DashboardCommandContract): string | undefined {
  if (Array.isArray(contract.cliArgs) && contract.cliArgs.length > 0) {
    return buildShellFromCliArgs(contract.cliArgs);
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
    return 'npx rapidkit doctor workspace --json';
  }

  const contract = resolveDashboardCommandContract(dashboardCommandId);
  const fromContract = contract ? buildShellFromContract(contract) : undefined;
  if (fromContract) {
    return fromContract;
  }

  return 'npx rapidkit doctor workspace --json';
}

/** Executable RapidKit CLI snippet per evidence card — derived from dashboard command contracts. */
export const CARD_SOURCE_SHELL: Record<string, string> = Object.fromEntries(
  DASHBOARD_EVIDENCE_CARD_IDS.map((cardId) => [cardId, buildStudioSourceCommandForCard(cardId)])
);

export { DEFAULT_VERIFY_COMMAND };

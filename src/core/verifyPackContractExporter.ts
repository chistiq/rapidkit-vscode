/**
 * Verify-Pack Contract Exporter
 *
 * Runs the verify-pack simulation for a project and persists the resulting
 * VerifyPackOutputContract to the workspace's `.workspai/reports/` directory.
 *
 * This closes the workspace-readiness blocker:
 *   `npx --yes --package rapidkit rapidkit readiness` requires `*verify-pack-contract*.json` to exist in
 *   `.workspai/reports/`. The extension generates this artifact via the sandbox
 *   simulation engine and writes it to the canonical location so the CLI gate
 *   can evaluate it.
 */

import * as fs from 'fs-extra';
import * as path from 'path';

import { runSandboxSimulation, type SandboxSimulationDeps } from './sandboxSimulation';
import { buildVerifyPackPlan, type VerifyPackPlanInput } from './verifyPackProfiles';
import type { VerifyPackOutputContract } from './verifyPackContract';

// ── Public types ──────────────────────────────────────────────────────────────

export interface VerifyPackContractExportInput {
  /** Absolute path to the workspace root (contains `.workspai/`). */
  workspacePath: string;
  /**
   * Absolute path to the project directory where verify commands run.
   * Typically `{workspacePath}/{projectName}`.
   */
  projectPath: string;
  /** Inputs used to choose the verify-pack profile (node, python, java, …). */
  planInput: VerifyPackPlanInput;
  /**
   * Per-command timeout in milliseconds.
   * Capped to [5 000, 120 000].  Defaults to 60 000 ms.
   */
  commandTimeoutMs?: number;
  /**
   * Maximum total wall-clock time for the full simulation run.
   * Defaults to 300 000 ms (5 min).
   */
  maxTotalDurationMs?: number;
  /** Injectable deps for testing (command runner, clock, telemetry). */
  deps?: SandboxSimulationDeps;
}

export interface VerifyPackContractExportResult {
  /** Absolute path to the written JSON file. */
  contractPath: string;
  /** The contract that was written. */
  contract: VerifyPackOutputContract;
  /** Action ID used as the file-name prefix. */
  actionId: string;
  /** Aggregate simulation outcome. */
  status: 'passed' | 'failed' | 'skipped';
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_COMMAND_TIMEOUT_MS = 5_000;
const MAX_COMMAND_TIMEOUT_MS = 120_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TOTAL_DURATION_MS = 300_000;
const CONTRACT_FILE_SUFFIX = '-verify-pack-contract.json';

// ── Implementation ────────────────────────────────────────────────────────────

function clampCommandTimeout(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_COMMAND_TIMEOUT_MS;
  }
  return Math.max(MIN_COMMAND_TIMEOUT_MS, Math.min(MAX_COMMAND_TIMEOUT_MS, Math.round(value)));
}

function buildActionId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `vp-${ts}-${rand}`;
}

/**
 * Run the verify-pack simulation for a project and write the resulting contract
 * to `{workspacePath}/.workspai/reports/{actionId}-verify-pack-contract.json`.
 *
 * The function is pure side-effectful (creates a directory + writes a file) and
 * is designed to be testable via the `deps.commandRunner` injection point.
 */
export async function exportVerifyPackContractToWorkspace(
  input: VerifyPackContractExportInput
): Promise<VerifyPackContractExportResult> {
  const commandTimeoutMs = clampCommandTimeout(input.commandTimeoutMs);
  const maxTotalDurationMs =
    typeof input.maxTotalDurationMs === 'number' && Number.isFinite(input.maxTotalDurationMs)
      ? Math.max(DEFAULT_COMMAND_TIMEOUT_MS, Math.round(input.maxTotalDurationMs))
      : DEFAULT_MAX_TOTAL_DURATION_MS;

  const plan = buildVerifyPackPlan(input.planInput);
  const actionId = buildActionId();

  const evidence = await runSandboxSimulation(
    {
      workspacePath: input.projectPath,
      actionId,
      riskClass: 'non-mutating-executable',
      verifyCommands: plan.commands.map((cmd) => ({
        command: cmd.command,
        args: cmd.args,
        label: cmd.label,
        timeoutMs: commandTimeoutMs,
      })),
      defaultTimeoutMs: commandTimeoutMs,
      maxTotalDurationMs,
      stopOnFirstFailure: false,
    },
    input.deps
  );

  // Ensure the reports directory exists (idempotent, safe even on first run).
  const reportsDir = path.join(input.workspacePath, '.workspai', 'reports');
  await fs.ensureDir(reportsDir);

  const contractFileName = `${actionId}${CONTRACT_FILE_SUFFIX}`;
  const contractPath = path.join(reportsDir, contractFileName);
  await fs.writeJSON(contractPath, evidence.verifyPackContract, { spaces: 2 });

  return {
    contractPath,
    contract: evidence.verifyPackContract,
    actionId,
    status: evidence.status,
  };
}

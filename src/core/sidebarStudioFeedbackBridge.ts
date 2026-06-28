import * as fs from 'fs/promises';
import * as path from 'path';

import type { RecordSidebarStudioFixAuditInput } from './sidebarStudioAuditBridge.js';
import type { SidebarStudioPatchAuditMetadata } from './sidebarStudioAuditBridge.js';

export type AgentActionOutcomePayload = {
  schemaVersion: 'agent-action-outcome.v1';
  generatedAt: string;
  actionId: string;
  scope: string;
  summary: string;
  outcome: 'ok' | 'failed';
  affectedFiles?: string[];
  commandsRun?: string[];
  verifyAfter?: string;
  evidenceSha256?: string;
  evidencePath?: string;
  patchMetadata?: SidebarStudioPatchAuditMetadata;
};

export function buildAgentActionOutcomeFromAudit(
  input: RecordSidebarStudioFixAuditInput,
  evidence?: { sha256?: string | null; path?: string | null }
): AgentActionOutcomePayload {
  const affectedFiles = (input.appliedFixes ?? [])
    .filter((entry) => entry.outcome === 'applied')
    .map((entry) => entry.path.trim())
    .filter(Boolean);
  return {
    schemaVersion: 'agent-action-outcome.v1',
    generatedAt: new Date().toISOString(),
    actionId: input.actionId,
    scope: input.handoff?.scope ?? 'workspace',
    summary: input.summary,
    outcome: input.ok ? 'ok' : 'failed',
    ...(affectedFiles.length > 0 ? { affectedFiles } : {}),
    ...(input.handoff?.verifyCommand ? { commandsRun: [input.handoff.verifyCommand] } : {}),
    ...(input.handoff?.verifyCommand ? { verifyAfter: input.handoff.verifyCommand } : {}),
    ...(evidence?.sha256 ? { evidenceSha256: evidence.sha256 } : {}),
    ...(evidence?.path ? { evidencePath: evidence.path } : {}),
    ...(input.patchMetadata ? { patchMetadata: input.patchMetadata } : {}),
  };
}

export async function recordWorkspaceFeedbackViaCli(input: {
  workspacePath: string;
  payload: AgentActionOutcomePayload;
  runCommand: (options: {
    command: string[];
    cwd: string;
    stdin?: string;
  }) => Promise<{ failed: boolean; exitCode?: number; stdout?: string; stderr?: string }>;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string; retryable?: boolean }> {
  try {
    const result = await input.runCommand({
      command: ['workspace', 'feedback', 'record', '--json'],
      cwd: input.workspacePath,
      stdin: `${JSON.stringify(input.payload)}\n`,
    });
    if (result.failed) {
      const stderr = result.stderr?.trim();
      const exitLabel =
        typeof result.exitCode === 'number' ? `Exit ${result.exitCode}` : 'CLI failed';
      return {
        ok: false,
        error: stderr ? `${exitLabel}: ${stderr.split('\n').slice(-3).join('\n')}` : exitLabel,
        retryable: true,
      };
    }
    if (result.stdout?.trim()) {
      try {
        JSON.parse(result.stdout.trim());
      } catch {
        return {
          ok: false,
          error: 'Workspace feedback record returned malformed JSON.',
          retryable: true,
        };
      }
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      retryable: true,
    };
  }
}

export async function readFeedbackHistoryEntryCount(workspacePath: string): Promise<number> {
  const historyPath = path.join(
    workspacePath,
    '.rapidkit/reports/workspace-intelligence-history.json'
  );
  try {
    const raw = JSON.parse(await fs.readFile(historyPath, 'utf8')) as { entries?: unknown[] };
    return Array.isArray(raw.entries) ? raw.entries.length : 0;
  } catch {
    return 0;
  }
}

import fs from 'fs-extra';
import path from 'path';

import agentCustomizationPackContract from '../contracts/agent-customization-pack.v1.json';

export const AGENT_CUSTOMIZATION_PACK_SCHEMA = 'rapidkit-agent-customization-pack.v1';

/** Canonical section order from `agent-customization-pack.v1` — keep handoff prompts aligned with CLI. */
export const AGENT_STANDARD_ANSWER_CONTRACT: readonly string[] =
  agentCustomizationPackContract.standardAnswerContract;

export const AGENT_CUSTOMIZATION_PACK_REPORT_PATH =
  '.rapidkit/reports/agent-customization-pack.json';

export const RAPIDKIT_MCP_DESIGN_REPORT_PATH = '.rapidkit/reports/rapidkit-mcp-design.json';

export type AgentCustomizationPackPreset = 'minimal' | 'enterprise';

export type AgentCustomizationPackOutput = {
  path: string;
  kind: string;
  status: 'written' | 'planned' | 'skipped';
  required?: boolean;
};

export type AgentCustomizationPackReport = {
  schemaVersion: typeof AGENT_CUSTOMIZATION_PACK_SCHEMA;
  generatedAt?: string;
  preset?: AgentCustomizationPackPreset;
  targets?: string[];
  outputInventory?: AgentCustomizationPackOutput[];
  drift?: {
    missingRequired?: string[];
    staleReports?: string[];
    strictViolations?: string[];
  };
  answerContract?: string[];
  experimental?: {
    hooksEnabled?: boolean;
    mcpReady?: boolean;
  };
};

export type AgentCustomizationPackSummary = {
  preset: AgentCustomizationPackPreset | 'unknown';
  targets: string[];
  writtenOutputs: number;
  totalOutputs: number;
  hooksEnabled: boolean;
  mcpReady: boolean;
  blockers: string[];
  generatedAt?: string;
};

export function parseAgentCustomizationPack(raw: unknown): AgentCustomizationPackReport | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (record.schemaVersion !== AGENT_CUSTOMIZATION_PACK_SCHEMA) {
    return null;
  }
  return raw as AgentCustomizationPackReport;
}

export function summarizeAgentCustomizationPack(
  pack: AgentCustomizationPackReport
): AgentCustomizationPackSummary {
  const inventory = Array.isArray(pack.outputInventory) ? pack.outputInventory : [];
  const writtenOutputs = inventory.filter((entry) => entry.status === 'written').length;
  const drift = pack.drift ?? {};
  const blockers = [
    ...(drift.missingRequired ?? []).map((entry) => `Missing required output: ${entry}`),
    ...(drift.staleReports ?? []).map((entry) => `Stale report: ${entry}`),
    ...(drift.strictViolations ?? []),
  ];

  return {
    preset: pack.preset ?? 'unknown',
    targets: Array.isArray(pack.targets)
      ? pack.targets.filter((entry) => typeof entry === 'string')
      : [],
    writtenOutputs,
    totalOutputs: inventory.length,
    hooksEnabled: pack.experimental?.hooksEnabled === true,
    mcpReady: pack.experimental?.mcpReady === true,
    blockers,
    generatedAt: typeof pack.generatedAt === 'string' ? pack.generatedAt : undefined,
  };
}

export function evaluateAgentCustomizationPackSynced(
  pack: AgentCustomizationPackReport | null,
  fallback: { hasIndex: boolean; hasAgentsMd: boolean }
): boolean {
  if (pack) {
    const summary = summarizeAgentCustomizationPack(pack);
    return summary.blockers.length === 0 && summary.writtenOutputs > 0;
  }
  return fallback.hasIndex && fallback.hasAgentsMd;
}

export function agentCustomizationPackStatus(
  pack: AgentCustomizationPackReport | null,
  summary: AgentCustomizationPackSummary | null,
  supportBlockers: string[]
): 'pass' | 'warn' | 'fail' {
  if (supportBlockers.length > 0) {
    return 'fail';
  }
  if (!pack || !summary) {
    return 'warn';
  }
  if (summary.blockers.length > 0) {
    return summary.blockers.some((entry) => entry.startsWith('Missing required')) ? 'fail' : 'warn';
  }
  return 'pass';
}

export async function readAgentCustomizationPackReport(
  workspacePath: string
): Promise<AgentCustomizationPackReport | null> {
  const absolutePath = path.join(workspacePath, AGENT_CUSTOMIZATION_PACK_REPORT_PATH);
  if (!(await fs.pathExists(absolutePath))) {
    return null;
  }
  try {
    return parseAgentCustomizationPack(await fs.readJson(absolutePath));
  } catch {
    return null;
  }
}

export function buildStandardAnswerContractPromptLines(): string[] {
  const numbered = AGENT_STANDARD_ANSWER_CONTRACT.map(
    (section, index) => `${index + 1}. ${section}`
  ).join('\n');
  return [
    '## Standard answer contract',
    'Structure every answer using these sections in order:',
    numbered,
    '- Do not claim pass, ready, or healthy without cited evidence from the attached pack and reports.',
    '- Distinguish display guidance from commands the operator should run.',
  ];
}

export function buildAgentPackHandoffSummaryLines(
  pack: AgentCustomizationPackReport | null,
  summary: AgentCustomizationPackSummary | null
): string[] {
  if (!pack || !summary) {
    return [
      'Agent customization pack: missing — run Agent Grounding Sync (`rapidkit workspace agent-sync --preset enterprise --target vscode --write`).',
    ];
  }

  const lines = [
    `Agent pack preset: ${summary.preset}`,
    summary.targets.length > 0 ? `Agent pack targets: ${summary.targets.join(', ')}` : undefined,
    summary.generatedAt ? `Agent pack generated: ${summary.generatedAt}` : undefined,
    `Agent pack outputs: ${summary.writtenOutputs}/${summary.totalOutputs} written`,
    summary.hooksEnabled ? 'Experimental agent hooks: enabled' : undefined,
    summary.mcpReady ? 'MCP design artifact: present' : undefined,
  ].filter((line): line is string => Boolean(line));

  if (summary.blockers.length > 0) {
    lines.push(`Agent pack drift: ${summary.blockers.join('; ')}`);
  } else {
    lines.push('Agent pack drift: none');
  }

  if (Array.isArray(pack.answerContract) && pack.answerContract.length > 0) {
    lines.push(`Pack answer contract: ${pack.answerContract.join(' → ')}`);
  }

  return lines;
}

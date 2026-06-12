import { getGitDiffStat } from './aiProjectContextUtils';
import { readAIActionRegistry } from './aiActionRegistry';
import { AnalyzeReport } from '../ui/panels/incidentStudioAnalyze';

export interface IncidentStudioEvidenceContext {
  workspace: {
    name: string;
    path: string;
  };
  analyzeReport: {
    available: boolean;
    generatedAt?: string;
    score?: number;
    verdict?: string;
    findings?: {
      fail: number;
      warn: number;
      info: number;
    };
    topFindings: Array<{
      severity: string;
      target: string;
      title: string;
      remediation: string;
    }>;
    ciGateCommand?: string;
    releaseGateCommand?: string;
  };
  git: {
    diffStat: string;
  };
  aiActions: {
    total: number;
    latest: Array<{
      summary: string;
      actionType: string;
      riskLevel: string;
      validationStatus: string;
      lastExecution?: string;
    }>;
  };
}

const SECRET_PATTERNS: RegExp[] = [
  /\b(sk-[a-zA-Z0-9_-]{8,})\b/g,
  /\b(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"'\s,}]+/gi,
  /\bBearer\s+[a-zA-Z0-9._-]+/g,
];

function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce((next, pattern) => next.replace(pattern, '[redacted]'), value);
}

function clip(value: string, maxLength: number): string {
  const redacted = redactSecrets(value);
  if (redacted.length <= maxLength) {
    return redacted;
  }
  return `${redacted.slice(0, maxLength)}\n[truncated]`;
}

export async function buildIncidentStudioEvidenceContext(input: {
  workspacePath: string;
  workspaceName: string;
  analyzeReport?: AnalyzeReport | null;
  gitDiffTimeoutMs?: number;
}): Promise<IncidentStudioEvidenceContext> {
  const report = input.analyzeReport || null;
  const registry = await readAIActionRegistry(input.workspacePath);
  const diffStat = await getGitDiffStat(input.workspacePath, input.gitDiffTimeoutMs ?? 1500);

  return {
    workspace: {
      name: input.workspaceName,
      path: input.workspacePath,
    },
    analyzeReport: {
      available: Boolean(report),
      generatedAt: report?.generatedAt,
      score: report?.summary?.score,
      verdict: report?.summary?.verdict,
      findings: report?.summary?.findings,
      topFindings: (report?.findings || []).slice(0, 8).map((finding) => ({
        severity: finding.severity,
        target: clip(finding.target, 180),
        title: clip(finding.title, 220),
        remediation: clip(finding.remediation, 260),
      })),
      ciGateCommand: report?.enterpriseControls?.ciGateCommand
        ? clip(report.enterpriseControls.ciGateCommand, 240)
        : undefined,
      releaseGateCommand: report?.enterpriseControls?.releaseGateCommand
        ? clip(report.enterpriseControls.releaseGateCommand, 240)
        : undefined,
    },
    git: {
      diffStat: clip(diffStat || 'Git context unavailable.', 1200),
    },
    aiActions: {
      total: registry.entries.length,
      latest: registry.entries.slice(0, 5).map((entry) => {
        const lastExecution = entry.executions[0];
        return {
          summary: clip(entry.contract.summary, 180),
          actionType: entry.contract.actionType,
          riskLevel: entry.contract.riskLevel,
          validationStatus: entry.validation.status,
          lastExecution: lastExecution
            ? `${lastExecution.operation}:${lastExecution.ok ? 'pass' : 'fail'}`
            : undefined,
        };
      }),
    },
  };
}

export function renderIncidentStudioEvidencePrompt(context: IncidentStudioEvidenceContext): string {
  return [
    'Workspace evidence context:',
    JSON.stringify(context, null, 2),
    '',
    'Use this evidence as the source of truth. If evidence is missing, say what is missing and prefer a verify action over a fix.',
  ].join('\n');
}

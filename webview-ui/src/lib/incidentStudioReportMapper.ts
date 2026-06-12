import type {
  ChatMessage,
  IncidentStudioState,
  PolicyGateState,
  RelatedFile,
  ReleaseGatePosture,
  StudioEvidenceSummary,
} from '@/components/StudioRedesign/state/studioState';

export interface AnalyzeReportForStudio {
  generatedAt?: string;
  workspacePath?: string;
  summary?: {
    score?: number;
    verdict?: 'ready' | 'needs-attention' | 'blocked';
    projectCount?: number;
    runtimeCount?: number;
    findings?: {
      fail?: number;
      warn?: number;
      info?: number;
    };
  };
  findings?: Array<{
    id?: string;
    severity?: 'fail' | 'warn' | 'info';
    target?: string;
    title?: string;
    detail?: string;
    remediation?: string;
  }>;
  enterpriseControls?: {
    evidencePath?: string;
    ciGateCommand?: string;
    releaseGateCommand?: string;
  };
}

function mapVerdictToReleasePosture(verdict?: string): ReleaseGatePosture {
  if (verdict === 'ready') {
    return 'go';
  }
  if (verdict === 'blocked') {
    return 'no-go';
  }
  return 'pending';
}

function mapVerdictToFlowState(verdict?: string): PolicyGateState['flowState'] {
  if (verdict === 'ready') {
    return 'passing';
  }
  if (verdict === 'blocked') {
    return 'blocking';
  }
  if (verdict === 'needs-attention') {
    return 'warning';
  }
  return 'pending';
}

function mapFindingHealth(severity?: string): RelatedFile['health'] {
  if (severity === 'fail') {
    return 'error';
  }
  if (severity === 'warn') {
    return 'warning';
  }
  return 'ok';
}

function buildRelatedFiles(report: AnalyzeReportForStudio): RelatedFile[] {
  const findings = Array.isArray(report.findings) ? report.findings : [];
  return findings.slice(0, 8).map((finding, index) => ({
    path: finding.target?.trim() || finding.id?.trim() || `finding-${index + 1}`,
    health: mapFindingHealth(finding.severity),
    freshness: report.generatedAt ? 'from analyze report' : undefined,
  }));
}

function buildInitialMessages(report: AnalyzeReportForStudio): ChatMessage[] {
  const verdict = report.summary?.verdict ?? 'needs-attention';
  const score = typeof report.summary?.score === 'number' ? `${report.summary.score}` : 'unknown';
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const topFindings = findings
    .slice(0, 3)
    .map((finding) => {
      const severity = finding.severity?.toUpperCase() ?? 'INFO';
      const title = finding.title?.trim() || finding.id?.trim() || 'Workspace finding';
      const remediation = finding.remediation?.trim();
      return remediation
        ? `- ${severity}: ${title}. Next: ${remediation}`
        : `- ${severity}: ${title}`;
    })
    .join('\n');

  const content = [
    `Analyze report loaded. Verdict: ${verdict}. Score: ${score}.`,
    topFindings ||
      'No blocking findings were reported. Use the verify phase before applying changes.',
  ].join('\n\n');

  return [
    {
      id: `analyze-report-${report.generatedAt || Date.now()}`,
      role: 'assistant',
      content,
      timestamp: report.generatedAt || new Date().toISOString(),
      phase: 'detect',
      confidence: verdict === 'ready' ? 0.88 : verdict === 'blocked' ? 0.72 : 0.78,
      sources: [
        {
          type: 'analysis',
          label: 'rapidkit analyze',
          freshness: report.generatedAt || 'latest local report',
          confidence: 0.9,
        },
      ],
    },
  ];
}

function buildStudioEvidence(report: AnalyzeReportForStudio): StudioEvidenceSummary {
  const findings = Array.isArray(report.findings) ? report.findings : [];
  return {
    generatedAt: report.generatedAt,
    score: report.summary?.score,
    verdict: report.summary?.verdict,
    projectCount: report.summary?.projectCount,
    runtimeCount: report.summary?.runtimeCount,
    findings: {
      fail: Math.max(0, report.summary?.findings?.fail ?? 0),
      warn: Math.max(0, report.summary?.findings?.warn ?? 0),
      info: Math.max(0, report.summary?.findings?.info ?? 0),
    },
    topFindings: findings.slice(0, 5).map((finding) => ({
      severity: finding.severity || 'info',
      target: finding.target?.trim() || finding.id?.trim() || 'workspace',
      title: finding.title?.trim() || finding.id?.trim() || 'Workspace finding',
      remediation: finding.remediation?.trim() || undefined,
    })),
    ciGateCommand: report.enterpriseControls?.ciGateCommand,
    releaseGateCommand: report.enterpriseControls?.releaseGateCommand,
    evidencePath: report.enterpriseControls?.evidencePath,
  };
}

export function mapAnalyzeReportToStudioState(
  report: AnalyzeReportForStudio,
  workspaceName: string
): Partial<IncidentStudioState> {
  const summary = report.summary ?? {};
  const counts = summary.findings ?? {};
  const fail = Math.max(0, counts.fail ?? 0);
  const warn = Math.max(0, counts.warn ?? 0);
  const info = Math.max(0, counts.info ?? 0);
  const totalSignals = Math.max(
    fail + warn + info,
    summary.projectCount ?? 0,
    summary.runtimeCount ?? 0
  );
  const ok = Math.max(0, totalSignals - fail - warn);
  const releasePosture = mapVerdictToReleasePosture(summary.verdict);

  return {
    workspaceName,
    currentPhase: fail > 0 ? 'diagnose' : 'detect',
    releasePosture,
    studioEvidence: buildStudioEvidence(report),
    health: {
      modulesOk: ok,
      modulesWarning: warn,
      modulesError: fail,
      systemLastCheck: report.generatedAt || 'latest local report',
    },
    relatedFiles: buildRelatedFiles(report),
    policyGates: {
      flowState: mapVerdictToFlowState(summary.verdict),
      telemetryState: report.generatedAt ? 'complete' : 'partial',
      releasePosture,
      artifactId: report.enterpriseControls?.evidencePath || report.workspacePath,
      freshness: report.generatedAt,
    },
    messages: buildInitialMessages(report),
  };
}

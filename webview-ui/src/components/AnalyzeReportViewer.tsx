import React, { useMemo, type CSSProperties } from 'react';

interface Finding {
  id: string;
  severity: 'fail' | 'warn' | 'info';
  target: string;
  title: string;
  detail: string;
  remediation: string;
}

interface AnalyzeReport {
  schemaVersion: string;
  generatedAt: string;
  workspacePath: string;
  summary: {
    score: number;
    verdict: 'ready' | 'needs-attention' | 'blocked';
    projectCount: number;
    runtimeCount: number;
    findings: {
      fail: number;
      warn: number;
      info: number;
    };
  };
  findings: Finding[];
  nextActions?: string[];
  enterpriseControls?: {
    ciGateCommand: string;
    releaseGateCommand: string;
    evidencePath?: string;
  };
}

interface Props {
  report: AnalyzeReport | null | undefined;
  isLoading?: boolean;
  error?: string | null;
  embedded?: boolean;
  onRunAnalyze?: () => void;
  onCopyCommand?: (text: string) => void;
  onRevealEvidence?: (path: string) => void;
}

const severityLabel = {
  fail: 'Failed',
  warn: 'Warning',
  info: 'Info',
} as const;

const verdictLabel = {
  ready: '✓ Ready',
  'needs-attention': '⚠ Needs attention',
  blocked: '✕ Blocked',
} as const;

const FindingCard: React.FC<{ finding: Finding; index: number }> = ({ finding, index }) => (
  <div className={`ws-analyze-finding ws-analyze-finding--${finding.severity}`}>
    <div className="ws-analyze-finding__row">
      <div className="ws-analyze-finding__index">{index + 1}</div>
      <div className="ws-analyze-finding__body">
        <div className="ws-analyze-finding__head">
          <span className="ws-analyze-finding__severity">{severityLabel[finding.severity]}</span>
          <code className="ws-analyze-finding__target">{finding.target}</code>
        </div>
        <div>
          <div className="ws-analyze-finding__title">{finding.title}</div>
          <div className="ws-analyze-finding__detail">{finding.detail}</div>
        </div>
        <div className="ws-analyze-finding__remediation">
          <strong className="ws-analyze-finding__remediation-label">💡 Remediation:</strong>
          {finding.remediation}
        </div>
      </div>
    </div>
  </div>
);

export const AnalyzeReportViewer: React.FC<Props> = ({
  report,
  isLoading,
  error,
  embedded = false,
  onRunAnalyze,
  onCopyCommand,
  onRevealEvidence,
}) => {
  const rootClass = embedded ? 'ws-analyze-root ws-analyze-root--embedded' : 'ws-analyze-root';

  const sortedFindings = useMemo(() => {
    if (!report?.findings) return [];
    return [...report.findings].sort((a, b) => {
      const severityOrder = { fail: 0, warn: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }, [report]);

  if (error) {
    return (
      <div className={`${rootClass} ws-analyze-state`}>
        <div className="ws-analyze-error-panel">
          <div className="ws-analyze-error-panel__title">
            {embedded ? 'Analyze unavailable' : `✕ ${error}`}
          </div>
          {embedded ? <p className="ws-analyze-error-panel__body">{error}</p> : null}
          {onRunAnalyze ? (
            <button type="button" className="ws-btn ws-btn--primary" onClick={onRunAnalyze}>
              Run Analyze
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`${rootClass} ws-analyze-state`}>
        <div className="ws-analyze-state__inner">
          <div className="ws-analyze-state__icon">⏳</div>
          Loading workspace analysis...
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className={`${rootClass} ws-analyze-state ws-analyze-state--empty`}>
        No report available
      </div>
    );
  }

  const recommendedActions = report.nextActions?.slice(0, 4) ?? [];
  const evidencePath = report.enterpriseControls?.evidencePath;
  const isEnterpriseReady = report.summary.verdict === 'ready';
  const enterpriseMessage = isEnterpriseReady
    ? 'This workspace is ready for enterprise release review, with policy gates and evidence aligned to the latest analysis.'
    : 'The workspace requires targeted remediation before enterprise rollout. Use the findings and gates below to drive the next incident review cycle.';
  const scoreRingStyle = {
    '--ws-analyze-score-deg': (report.summary.score / 100) * 360,
  } as CSSProperties;

  return (
    <div className={rootClass}>
      <div className="ws-analyze-header">
        <div className="ws-analyze-header__row">
          <div>
            <h2 className="ws-analyze-header__title">Workspace Health Analysis</h2>
            <div className="ws-analyze-header__meta">
              Generated: {new Date(report.generatedAt).toLocaleString()}
            </div>
          </div>

          <div className="ws-analyze-header__stats">
            <div className="ws-analyze-score">
              <div className="ws-analyze-score__ring" style={scoreRingStyle}>
                <div className="ws-analyze-score__inner">{report.summary.score}</div>
              </div>
              <div className="ws-analyze-score__label">Health Score</div>
            </div>

            <div className={`ws-analyze-verdict ws-analyze-verdict--${report.summary.verdict}`}>
              <div className="ws-analyze-verdict__label">{verdictLabel[report.summary.verdict]}</div>
              <div className="ws-analyze-verdict__meta">
                {report.summary.findings.fail} Errors · {report.summary.findings.warn} Warnings
              </div>
            </div>

            <div className="ws-analyze-metrics">
              <div>
                <div className="ws-analyze-metrics__label">Projects</div>
                <div className="ws-analyze-metrics__value">{report.summary.projectCount}</div>
              </div>
              <div>
                <div className="ws-analyze-metrics__label">Runtimes</div>
                <div className="ws-analyze-metrics__value">{report.summary.runtimeCount}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="ws-analyze-enterprise">
        <div>
          <div className="ws-analyze-enterprise__kicker">Enterprise Readiness Review</div>
          <div className="ws-analyze-enterprise__copy">{enterpriseMessage}</div>
          {recommendedActions.length > 0 && (
            <div>
              <div className="ws-analyze-actions-title">Recommended next actions</div>
              <ol className="ws-analyze-actions-list">
                {recommendedActions.map((action, index) => (
                  <li key={index}>{action}</li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {report.enterpriseControls && (
          <div className="ws-analyze-gates-card">
            <div className="ws-analyze-gates-card__title">Enterprise Gates</div>
            <div className="ws-analyze-gates-card__field">
              <div className="ws-analyze-gates-card__field-label">CI Gate</div>
              <code className="ws-analyze-code-block">{report.enterpriseControls.ciGateCommand}</code>
            </div>
            <div className="ws-analyze-gates-card__field">
              <div className="ws-analyze-gates-card__field-label">Release Gate</div>
              <code className="ws-analyze-code-block">{report.enterpriseControls.releaseGateCommand}</code>
            </div>
            {report.enterpriseControls.evidencePath && (
              <div className="ws-analyze-gates-card__field">
                <div className="ws-analyze-gates-card__field-label">Evidence file</div>
                <div className="ws-analyze-evidence-path">{report.enterpriseControls.evidencePath}</div>
              </div>
            )}
            <div className="ws-analyze-gates-actions">
              {onCopyCommand && (
                <button
                  type="button"
                  className="ws-btn ws-btn--primary"
                  onClick={() => onCopyCommand(report.enterpriseControls!.ciGateCommand)}
                >
                  Copy CI Gate
                </button>
              )}
              {onCopyCommand && (
                <button
                  type="button"
                  className="ws-btn ws-btn--ghost"
                  onClick={() => onCopyCommand(report.enterpriseControls!.releaseGateCommand)}
                >
                  Copy Release Gate
                </button>
              )}
              {onRevealEvidence && evidencePath && (
                <button
                  type="button"
                  className="ws-btn ws-btn--ghost"
                  onClick={() => onRevealEvidence(evidencePath)}
                >
                  Reveal Evidence
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="ws-analyze-findings">
        {sortedFindings.length === 0 ? (
          <div className="ws-analyze-findings__empty">✓ All checks passed! No findings.</div>
        ) : (
          <div>
            <h3 className="ws-analyze-findings__title">Findings ({sortedFindings.length})</h3>
            {sortedFindings.map((finding, idx) => (
              <FindingCard key={finding.id} finding={finding} index={idx} />
            ))}
          </div>
        )}
      </div>

      {report.enterpriseControls && (
        <div className="ws-analyze-footer">
          <div className="ws-analyze-footer__title">CI/Release Gates</div>
          <div className="ws-analyze-footer__grid">
            <code className="ws-analyze-footer__code">{report.enterpriseControls.ciGateCommand}</code>
            <code className="ws-analyze-footer__code">{report.enterpriseControls.releaseGateCommand}</code>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyzeReportViewer;

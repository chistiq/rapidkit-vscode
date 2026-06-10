import React, { useMemo } from 'react';

/**
 * AnalyzeReportViewer
 * Professional component for displaying RapidKit analyze report
 * Shows findings, scores, and enterprise controls
 */

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

const severityConfig = {
  fail: {
    label: 'Failed',
    color: '#f14c4c',
    bg: 'rgba(241, 76, 76, 0.1)',
    border: '1px solid rgba(241, 76, 76, 0.3)',
  },
  warn: {
    label: 'Warning',
    color: '#dba617',
    bg: 'rgba(219, 166, 23, 0.1)',
    border: '1px solid rgba(219, 166, 23, 0.3)',
  },
  info: {
    label: 'Info',
    color: '#3b8eea',
    bg: 'rgba(59, 142, 234, 0.1)',
    border: '1px solid rgba(59, 142, 234, 0.3)',
  },
};

const verdictConfig = {
  ready: { label: '✓ Ready', color: '#13c659' },
  'needs-attention': { label: '⚠ Needs attention', color: '#dba617' },
  blocked: { label: '✕ Blocked', color: '#f14c4c' },
};

const FindingCard: React.FC<{ finding: Finding; index: number }> = ({ finding, index }) => {
  const config = severityConfig[finding.severity];

  return (
    <div
      key={finding.id}
      style={{
        background: config.bg,
        border: config.border,
        borderRadius: '6px',
        padding: '12px 16px',
        marginBottom: '10px',
        fontSize: '13px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '20px',
            height: '20px',
            borderRadius: '3px',
            background: config.color,
            color: '#fff',
            fontSize: '11px',
            fontWeight: 'bold',
            flexShrink: 0,
          }}
        >
          {index + 1}
        </div>

        <div style={{ flex: 1 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '6px',
            }}
          >
            <span
              style={{
                color: config.color,
                fontWeight: 600,
                fontSize: '12px',
              }}
            >
              {config.label}
            </span>
            <code
              style={{
                background: 'rgba(0, 0, 0, 0.2)',
                padding: '2px 6px',
                borderRadius: '3px',
                fontSize: '11px',
                color: 'var(--vscode-foreground)',
              }}
            >
              {finding.target}
            </code>
          </div>

          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontWeight: 500, marginBottom: '4px' }}>{finding.title}</div>
            <div style={{ fontSize: '12px', opacity: 0.8, lineHeight: '1.4' }}>
              {finding.detail}
            </div>
          </div>

          <div
            style={{
              background: 'rgba(0, 0, 0, 0.3)',
              padding: '8px',
              borderRadius: '4px',
              fontSize: '12px',
              fontFamily: 'monospace',
              lineHeight: '1.5',
            }}
          >
            <strong style={{ fontSize: '11px', display: 'block', marginBottom: '4px' }}>
              💡 Remediation:
            </strong>
            {finding.remediation}
          </div>
        </div>
      </div>
    </div>
  );
};

export const AnalyzeReportViewer: React.FC<Props> = ({
  report,
  isLoading,
  error,
  embedded = false,
  onRunAnalyze,
  onCopyCommand,
  onRevealEvidence,
}) => {
  const containerHeight = embedded ? 'auto' : '100vh';
  const containerMinHeight = embedded ? '0' : '100vh';
  const sortedFindings = useMemo(() => {
    if (!report?.findings) return [];
    return [...report.findings].sort((a, b) => {
      const severityOrder = { fail: 0, warn: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }, [report]);

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: containerHeight,
          minHeight: embedded ? '120px' : containerMinHeight,
          fontSize: '14px',
          color: 'var(--vscode-foreground)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '20px', marginBottom: '12px' }}>⏳</div>
          Loading workspace analysis...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: containerHeight,
          minHeight: embedded ? '120px' : containerMinHeight,
          padding: embedded ? '12px' : '20px',
        }}
      >
        <div
          style={{
            maxWidth: '500px',
            background: 'rgba(241, 76, 76, 0.1)',
            border: '1px solid rgba(241, 76, 76, 0.3)',
            borderRadius: '6px',
            padding: '20px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '14px', marginBottom: '12px', color: '#f14c4c' }}>
            ✕ {error}
          </div>
          {onRunAnalyze && (
            <button
              onClick={onRunAnalyze}
              style={{
                background: 'var(--vscode-button-background, #0078d4)',
                color: 'var(--vscode-button-foreground, #fff)',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Run Analyze
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: containerHeight,
          minHeight: embedded ? '80px' : containerMinHeight,
          fontSize: '14px',
          color: 'var(--vscode-foreground)',
        }}
      >
        No report available
      </div>
    );
  }

  const verdictInfo = verdictConfig[report.summary.verdict];
  const recommendedActions = report.nextActions?.slice(0, 4) ?? [];
  const evidencePath = report.enterpriseControls?.evidencePath;
  const isEnterpriseReady = report.summary.verdict === 'ready';
  const enterpriseMessage = isEnterpriseReady
    ? 'This workspace is ready for enterprise release review, with policy gates and evidence aligned to the latest analysis.'
    : 'The workspace requires targeted remediation before enterprise rollout. Use the findings and gates below to drive the next incident review cycle.';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: containerHeight,
        minHeight: embedded ? '0' : containerMinHeight,
        maxHeight: embedded ? '420px' : undefined,
        overflow: embedded ? 'auto' : 'hidden',
        background: 'var(--vscode-editor-background)',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'var(--vscode-editor-background)',
          borderBottom: '1px solid var(--vscode-panel-border)',
          padding: '16px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>
              Workspace Health Analysis
            </h2>
            <div style={{ fontSize: '12px', opacity: 0.7 }}>
              Generated: {new Date(report.generatedAt).toLocaleString()}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            }}
          >
            {/* Score Visualization */}
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: `conic-gradient(#13c659 0deg, #13c659 ${
                    (report.summary.score / 100) * 360
                  }deg, rgba(19, 198, 89, 0.2) ${(report.summary.score / 100) * 360}deg)`,
                  border: '2px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                <div
                  style={{
                    width: '72px',
                    height: '72px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--vscode-editor-background)',
                    fontSize: '20px',
                    fontWeight: 700,
                  }}
                >
                  {report.summary.score}
                </div>
              </div>
              <div style={{ fontSize: '11px', marginTop: '8px', opacity: 0.7 }}>Health Score</div>
            </div>

            {/* Verdict Badge */}
            <div
              style={{
                background: `${verdictInfo.color}20`,
                border: `2px solid ${verdictInfo.color}`,
                borderRadius: '6px',
                padding: '12px 16px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  color: verdictInfo.color,
                  fontWeight: 600,
                  fontSize: '14px',
                  marginBottom: '4px',
                }}
              >
                {verdictInfo.label}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.8 }}>
                {report.summary.findings.fail} Errors · {report.summary.findings.warn} Warnings
              </div>
            </div>

            {/* Metrics */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '8px',
                fontSize: '12px',
              }}
            >
              <div>
                <div style={{ opacity: 0.7, marginBottom: '2px' }}>Projects</div>
                <div style={{ fontSize: '18px', fontWeight: 600 }}>
                  {report.summary.projectCount}
                </div>
              </div>
              <div>
                <div style={{ opacity: 0.7, marginBottom: '2px' }}>Runtimes</div>
                <div style={{ fontSize: '18px', fontWeight: 600 }}>
                  {report.summary.runtimeCount}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Enterprise Readiness Summary */}
      <div
        style={{
          padding: '16px',
          borderTop: '1px solid var(--vscode-panel-border)',
          borderBottom: '1px solid var(--vscode-panel-border)',
          background: 'var(--vscode-editor-background)',
          display: 'grid',
          gridTemplateColumns: '1fr 280px',
          gap: '16px',
          alignItems: 'start',
        }}
      >
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '10px',
              color: 'var(--vscode-foreground)',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            Enterprise Readiness Review
          </div>
          <div style={{ color: 'var(--vscode-foreground)', opacity: 0.84, fontSize: '13px', lineHeight: 1.6 }}>
            {enterpriseMessage}
          </div>
          {recommendedActions.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ marginBottom: '8px', fontWeight: 600, fontSize: '12px' }}>
                Recommended next actions
              </div>
              <ol style={{ paddingLeft: '20px', fontSize: '12px', color: 'var(--vscode-foreground)', lineHeight: 1.6 }}>
                {recommendedActions.map((action, index) => (
                  <li key={index} style={{ marginBottom: '8px' }}>
                    {action}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {report.enterpriseControls && (
          <div
            style={{
              background: 'var(--vscode-panel-background)',
              border: '1px solid var(--vscode-panel-border)',
              borderRadius: '10px',
              padding: '14px',
              fontSize: '12px',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '12px' }}>Enterprise Gates</div>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ opacity: 0.7, marginBottom: '4px' }}>CI Gate</div>
              <code
                style={{
                  display: 'block',
                  background: 'rgba(0, 0, 0, 0.2)',
                  borderRadius: '6px',
                  padding: '10px',
                  wordBreak: 'break-word',
                  fontSize: '11px',
                  lineHeight: 1.5,
                }}
              >
                {report.enterpriseControls.ciGateCommand}
              </code>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ opacity: 0.7, marginBottom: '4px' }}>Release Gate</div>
              <code
                style={{
                  display: 'block',
                  background: 'rgba(0, 0, 0, 0.2)',
                  borderRadius: '6px',
                  padding: '10px',
                  wordBreak: 'break-word',
                  fontSize: '11px',
                  lineHeight: 1.5,
                }}
              >
                {report.enterpriseControls.releaseGateCommand}
              </code>
            </div>
            {report.enterpriseControls.evidencePath && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ opacity: 0.7, marginBottom: '4px' }}>Evidence file</div>
                <div
                  style={{
                    color: 'var(--vscode-editor-foreground)',
                    background: 'rgba(0, 0, 0, 0.12)',
                    padding: '10px',
                    borderRadius: '6px',
                    wordBreak: 'break-word',
                    fontSize: '11px',
                    lineHeight: 1.5,
                  }}
                >
                  {report.enterpriseControls.evidencePath}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {onCopyCommand && report.enterpriseControls && (
                <button
                  type="button"
                  onClick={() => onCopyCommand(report.enterpriseControls!.ciGateCommand)}
                  style={{
                    background: 'var(--vscode-button-background, #0078d4)',
                    color: 'var(--vscode-button-foreground, #fff)',
                    border: 'none',
                    padding: '8px 10px',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  Copy CI Gate
                </button>
              )}
              {onCopyCommand && report.enterpriseControls && (
                <button
                  type="button"
                  onClick={() => onCopyCommand(report.enterpriseControls!.releaseGateCommand)}
                  style={{
                    background: 'rgba(0, 0, 0, 0.25)',
                    color: 'var(--vscode-foreground)',
                    border: 'none',
                    padding: '8px 10px',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  Copy Release Gate
                </button>
              )}
              {onRevealEvidence && evidencePath && (
                <button
                  type="button"
                  onClick={() => onRevealEvidence(evidencePath)}
                  style={{
                    background: 'rgba(63, 141, 255, 0.12)',
                    color: 'var(--vscode-foreground)',
                    border: '1px solid rgba(63, 141, 255, 0.35)',
                    padding: '8px 10px',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  Reveal Evidence
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Findings List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
        }}
      >
        {sortedFindings.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '200px',
              color: 'var(--vscode-foreground)',
              opacity: 0.7,
            }}
          >
            ✓ All checks passed! No findings.
          </div>
        ) : (
          <div>
            <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>
              Findings ({sortedFindings.length})
            </h3>
            {sortedFindings.map((finding, idx) => (
              <FindingCard key={finding.id} finding={finding} index={idx} />
            ))}
          </div>
        )}
      </div>

      {/* Enterprise Controls Footer */}
      {report.enterpriseControls && (
        <div
          style={{
            background: 'var(--vscode-panel-background)',
            borderTop: '1px solid var(--vscode-panel-border)',
            padding: '12px 16px',
            fontSize: '12px',
            flexShrink: 0,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '8px' }}>CI/Release Gates</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
            }}
          >
            <div>
              <code
                style={{
                  background: 'rgba(0, 0, 0, 0.2)',
                  padding: '4px 8px',
                  borderRadius: '3px',
                  fontSize: '11px',
                  display: 'block',
                  wordBreak: 'break-all',
                  opacity: 0.8,
                }}
              >
                {report.enterpriseControls.ciGateCommand}
              </code>
            </div>
            <div>
              <code
                style={{
                  background: 'rgba(0, 0, 0, 0.2)',
                  padding: '4px 8px',
                  borderRadius: '3px',
                  fontSize: '11px',
                  display: 'block',
                  wordBreak: 'break-all',
                  opacity: 0.8,
                }}
              >
                {report.enterpriseControls.releaseGateCommand}
              </code>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyzeReportViewer;

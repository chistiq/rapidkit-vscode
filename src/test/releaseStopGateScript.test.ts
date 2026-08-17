import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..');
import {
  buildKpiGateStatus,
  buildOpenIssueReportFreshnessStatus,
  buildOpenIssueSeverityStatus,
  buildReleaseClaimSafetyStatus,
} from '../../scripts/release-stop-gate.mjs';

function buildRecentEvent(
  command: string,
  at: string,
  props?: Record<string, string | number | boolean>
) {
  return {
    command,
    at,
    ...(props ? { props } : {}),
  };
}

function buildBaseRecentEvents(projectPath = '/workspace/app') {
  const now = Date.now();
  const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();

  return [
    buildRecentEvent('workspai.studio.loop_started', iso(0), { projectPath }),
    buildRecentEvent('workspai.studio.action_executed', iso(10), {
      actionId: 'act-1',
      actionType: 'apply-debug-patch',
      projectPath,
    }),
    buildRecentEvent('workspai.studio.verify_passed', iso(20), {
      actionId: 'act-1',
      actionType: 'apply-debug-patch',
      verifyReady: true,
      verifyRequired: true,
      verifyPathPresent: true,
      projectPath,
    }),
    buildRecentEvent('workspai.studio.verify_failed', iso(30), {
      actionId: 'act-2',
      actionType: 'apply-debug-patch',
      verifyReady: false,
      verifyRequired: true,
      verifyPathPresent: false,
      projectPath,
    }),
    buildRecentEvent('workspai.studio.prediction_shown', iso(40), { projectPath }),
    buildRecentEvent('workspai.studio.prediction_verified', iso(50), { projectPath }),
    buildRecentEvent('workspai.studio.incident_repro_pack_captured', iso(60), { projectPath }),
    buildRecentEvent('workspai.studio.incident_repro_pack_exported', iso(70), { projectPath }),
    buildRecentEvent('workspai.studio.incident_repro_pack_imported', iso(80), { projectPath }),
    buildRecentEvent('workspai.studio.incident_replay_memory_enriched', iso(90), {
      projectPath,
    }),
    buildRecentEvent('workspai.studio.rollback_attempted', iso(100), { projectPath }),
    buildRecentEvent('workspai.studio.rollback_succeeded', iso(110), { projectPath }),
    buildRecentEvent('workspai.studio.release_readiness_artifact_exported', iso(120), {
      artifactId: 'rrc-1',
      decision: 'go',
      blockingReasonCount: 0,
    }),
    buildRecentEvent('workspai.studio.release_readiness_go_decision_exported', iso(130), {
      artifactId: 'rrc-1',
      decision: 'go',
    }),
    buildRecentEvent('workspai.studio.release_readiness_decision_validated', iso(140), {
      artifactId: 'rrc-1',
      originalDecision: 'GO',
      validationOutcome: 'correct',
    }),
    buildRecentEvent('workspai.studio.release_readiness_decision_correct', iso(150), {
      artifactId: 'rrc-1',
      originalDecision: 'GO',
      validationOutcome: 'correct',
    }),
    buildRecentEvent('workspai.studio.release_readiness_no_go_decision_validated', iso(160), {
      artifactId: 'rrc-2',
      originalDecision: 'NO-GO',
      validationOutcome: 'prevented_regression',
    }),
    buildRecentEvent('workspai.studio.release_readiness_no_go_prevented_incident', iso(170), {
      artifactId: 'rrc-2',
      originalDecision: 'NO-GO',
      validationOutcome: 'prevented_regression',
    }),
  ];
}

function buildMarkerPayload(recentEvents: unknown[]) {
  return {
    metadata: {
      custom: {
        workspaiTelemetry: {
          recentEvents,
          outcomeRecords: [
            {
              timeToFirstConfidentActionMs: 1000,
              firstActionSucceeded: true,
              reopenedAfterSuggestedFix: false,
              recommendationOverridden: false,
              mutatingActionReachedVerify: true,
              rollbackAttemptResult: true,
            },
          ],
        },
      },
    },
  };
}

describe('release-stop-gate open-issue freshness hardening', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-release-gate-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('passes enforce-open-issues when report is fresh and has no blocking severities', () => {
    const issueReportPath = path.join(tempRoot, 'open-issues-fresh.json');
    fs.writeFileSync(
      issueReportPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          issues: [
            {
              id: 12,
              title: 'Non-blocking issue',
              state: 'open',
              labels: [{ name: 'p2' }],
            },
          ],
        },
        null,
        2
      )
    );

    const freshness = buildOpenIssueReportFreshnessStatus(issueReportPath, 24);
    const severity = buildOpenIssueSeverityStatus(issueReportPath, ['p0', 'p1']);

    expect(freshness.ok).toBe(true);
    expect(freshness.message).toContain('freshness gate passed');
    expect(severity.ok).toBe(true);
    expect(severity.message).toContain('No blocking open issues');
  });

  it('blocks enforce-open-issues when report generatedAt is missing', () => {
    const issueReportPath = path.join(tempRoot, 'open-issues-missing-generated-at.json');
    fs.writeFileSync(
      issueReportPath,
      JSON.stringify(
        {
          issues: [],
        },
        null,
        2
      )
    );

    const result = buildOpenIssueReportFreshnessStatus(issueReportPath, 24);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('generatedAt is missing or invalid');
  });

  it('blocks enforce-open-issues when report is stale beyond max age', () => {
    const issueReportPath = path.join(tempRoot, 'open-issues-stale.json');
    const staleDate = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

    fs.writeFileSync(
      issueReportPath,
      JSON.stringify(
        {
          generatedAt: staleDate,
          issues: [],
        },
        null,
        2
      )
    );

    const result = buildOpenIssueReportFreshnessStatus(issueReportPath, 2);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('report age');
    expect(result.message).toContain('exceeds max 2h');
  });
});

describe('release-stop-gate local toolchain hardening', () => {
  it('runs contract checks through Node and the portable Vitest entrypoint', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'scripts/release-stop-gate.mjs'), 'utf8');

    expect(source).toContain('path.resolve(');
    expect(source).toContain("'node_modules'");
    expect(source).toContain("'vitest.mjs'");
    expect(source).toContain("command = hasLocalVitest ? process.execPath : 'npx'");
    expect(source).toContain("shell: !hasLocalVitest && process.platform === 'win32'");
    expect(source).not.toContain("process.platform === 'win32' ? 'vitest.cmd' : 'vitest'");
    expect(source).not.toContain("'node_modules',\n    '.bin'");
    expect(source).not.toContain("'npx vitest run'");
  });
});

describe('extension package build contract', () => {
  it('builds webview assets in production mode before VSIX packaging', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const scripts = packageJson.scripts ?? {};

    expect(scripts['vscode:prepublish']).toBe(
      'corepack npm run check:english-text && corepack npm run check:local-paths && corepack npm run build'
    );
    expect(scripts['check:english-text']).toBe('node scripts/english-text-guard.mjs --all');
    expect(scripts['check:english-text:staged']).toBe(
      'node scripts/english-text-guard.mjs --staged'
    );
    expect(scripts.prepackage).toBe('corepack npm run build');
    expect(scripts.build).toContain('corepack npm run esbuild-base -- --production');
    expect(scripts.build).toContain('corepack npm run webview:build:production');
    expect(scripts['webview:build:production']).toContain('corepack npm run build -- --production');
    expect(scripts.build).not.toContain('cd webview-ui && corepack npm run build"');
  });
});

describe('extension marketplace metadata contract', () => {
  it('keeps public positioning aligned with Workspace Intelligence', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

    expect(packageJson.displayName).toBe('Workspai – Workspace Intelligence');
    expect(packageJson.description).toContain('Workspace Intelligence for VS Code.');
    expect(packageJson.description).toContain('developers, CI, and AI agents');
    expect(packageJson.description).not.toContain('Workspace intelligence for VS Code.');
  });
});

describe('release-stop-gate telemetry integrity hardening', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-release-gate-telemetry-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  function writeMarker(fileName: string, recentEvents: unknown[]) {
    const markerPath = path.join(tempRoot, fileName);
    fs.writeFileSync(markerPath, JSON.stringify(buildMarkerPayload(recentEvents), null, 2));
    return markerPath;
  }

  function buildGateStatusForMarker(markerPath: string) {
    return buildKpiGateStatus(
      markerPath,
      {
        verifyPhaseReachMin: 0,
        bridgeRouteCompletionMin: 0,
        predictivePrecisionMin: 0,
        falseAlarmRateMax: 100,
        preventedIncidentRateMin: 0,
        reproPackShareRateMin: 0,
        replayToResolutionRateMin: 0,
        verifyAutoRollbackSuccessRateMin: 0,
        falseConfidenceRateMax: 100,
        maxTimeToFirstConfidentActionP50Ms: Number.POSITIVE_INFINITY,
        minFirstActionSuccessRate: 0,
        maxReopenRateAfterSuggestedFix: 100,
        maxOverrideRateOnRecommendations: 100,
        minVerifyPathCompletionRate: 0,
        minRollbackRecoverySuccessRate: 0,
        verifyPackAutopilotReadinessRateMin: 0,
        firstChunkLatencyP95MaxMs: Number.POSITIVE_INFINITY,
        syncLatencyP95MaxMs: Number.POSITIVE_INFINITY,
        boardRenderLatencyP95MaxMs: Number.POSITIVE_INFINITY,
      },
      {
        predictiveCalibrationMode: 'off',
        verifyPackAutopilotReadinessMode: 'off',
        releaseReadinessValidationMode: 'off',
      }
    );
  }

  it('passes when verify/release telemetry required fields are present and scope is consistent', () => {
    const markerPath = writeMarker('kpi-pass.json', buildBaseRecentEvents('/workspace/app'));

    const result = buildGateStatusForMarker(markerPath);

    expect(result.gates.telemetryRequiredFieldsPass).toBe(true);
    expect(result.gates.telemetrySchemaDriftPass).toBe(true);
    expect(result.gates.telemetryScopeMismatchPass).toBe(true);
  });

  it('blocks when verify/release telemetry required fields are missing', () => {
    const events = buildBaseRecentEvents('/workspace/app');
    const verifyFailedEvent = events.find(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        (entry as { command?: string }).command === 'workspai.studio.verify_failed'
    ) as { props?: Record<string, unknown> } | undefined;

    if (verifyFailedEvent?.props) {
      delete verifyFailedEvent.props.actionId;
    }

    const markerPath = writeMarker('kpi-missing-required-field.json', events);
    const result = buildGateStatusForMarker(markerPath);

    expect(result.gates.telemetryRequiredFieldsPass).toBe(false);
    expect(result.gates.overallPass).toBe(false);
  });

  it('blocks when telemetry scope mismatch is detected across critical events', () => {
    const events = buildBaseRecentEvents('/workspace/app');
    const verifyFailedEvent = events.find(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        (entry as { command?: string }).command === 'workspai.studio.verify_failed'
    ) as { props?: Record<string, unknown> } | undefined;

    if (verifyFailedEvent?.props) {
      verifyFailedEvent.props.projectPath = '/workspace/other-project';
    }

    const markerPath = writeMarker('kpi-scope-mismatch.json', events);
    const result = buildGateStatusForMarker(markerPath);

    expect(result.gates.telemetryScopeMismatchPass).toBe(false);
    expect(result.telemetryIntegrity.scopeMismatchAlerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'multiple_project_paths_observed' }),
      ])
    );
    expect(result.gates.overallPass).toBe(false);
  });
});

describe('release-stop-gate release notes claim safety', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-release-gate-claims-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('passes enforce-claim-safety when release notes avoid high-risk over-claims', () => {
    const releaseNotesPath = path.join(tempRoot, 'release-notes-safe.md');
    fs.writeFileSync(
      releaseNotesPath,
      [
        '# Release Notes',
        '',
        'Posture: stabilization-only',
        '- Added deterministic verify-path checks for mutating actions.',
        '- Expanded telemetry integrity validation for release gates.',
      ].join('\n')
    );

    const result = buildReleaseClaimSafetyStatus(releaseNotesPath);

    expect(result.ok).toBe(true);
  });

  it('blocks enforce-claim-safety when release notes imply autonomous code mutation', () => {
    const releaseNotesPath = path.join(tempRoot, 'release-notes-unsafe.md');
    fs.writeFileSync(
      releaseNotesPath,
      [
        '# Release Notes',
        '',
        'Posture: stabilization-only',
        '- The assistant autonomously applies code patches across the workspace.',
      ].join('\n')
    );

    const result = buildReleaseClaimSafetyStatus(releaseNotesPath);

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleId: 'autonomous_mutation_claim' })])
    );
    expect(result.message).toContain('Release notes claim-safety failed');
  });
});

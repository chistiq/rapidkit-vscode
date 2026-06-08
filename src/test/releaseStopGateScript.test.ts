import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..');
const releaseStopGateScriptPath = path.join(repoRoot, 'scripts', 'release-stop-gate.mjs');

function releaseStopGateEnv() {
  const env = { ...process.env };

  // Keep the child process isolated from Vitest/coverage worker hooks so these
  // script-level tests exercise the release gate as a normal Node CLI.
  delete env.NODE_OPTIONS;
  delete env.VITEST;
  delete env.VITEST_POOL_ID;
  delete env.VITEST_WORKER_ID;
  delete env.VITEST_TEST_NAME;

  return env;
}

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

  function runReleaseStopGate(extraArgs: string[]) {
    return spawnSync(
      process.execPath,
      [releaseStopGateScriptPath, '--skip-contract-checks', '--skip-kpi', ...extraArgs],
      {
        cwd: repoRoot,
        encoding: 'utf-8',
        env: releaseStopGateEnv(),
      }
    );
  }

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

    const result = runReleaseStopGate([
      '--issue-report',
      issueReportPath,
      '--enforce-open-issues',
      '--issue-report-max-age-hours',
      '24',
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Open-issue report freshness result');
    expect(result.stdout).toContain('Open-issue severity result');
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

    const result = runReleaseStopGate([
      '--issue-report',
      issueReportPath,
      '--enforce-open-issues',
      '--issue-report-max-age-hours',
      '24',
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('generatedAt is missing or invalid');
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

    const result = runReleaseStopGate([
      '--issue-report',
      issueReportPath,
      '--enforce-open-issues',
      '--issue-report-max-age-hours',
      '2',
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('report age');
    expect(result.stderr).toContain('exceeds max 2h');
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

  function runReleaseStopGateForMarker(markerPath: string) {
    return spawnSync(
      process.execPath,
      [
        releaseStopGateScriptPath,
        '--skip-contract-checks',
        '--marker',
        markerPath,
        '--verify-min',
        '0',
        '--bridge-min',
        '0',
        '--predictive-precision-min',
        '0',
        '--false-alarm-max',
        '100',
        '--prevented-rate-min',
        '0',
        '--repro-pack-share-min',
        '0',
        '--replay-resolution-min',
        '0',
        '--rollback-success-min',
        '0',
        '--false-confidence-max',
        '100',
        '--release-readiness-validation-mode',
        'off',
      ],
      {
        cwd: repoRoot,
        encoding: 'utf-8',
        env: releaseStopGateEnv(),
      }
    );
  }

  it('passes when verify/release telemetry required fields are present and scope is consistent', () => {
    const markerPath = writeMarker('kpi-pass.json', buildBaseRecentEvents('/workspace/app'));

    const result = runReleaseStopGateForMarker(markerPath);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"telemetryRequiredFieldsPass": true');
    expect(result.stdout).toContain('"telemetrySchemaDriftPass": true');
    expect(result.stdout).toContain('"telemetryScopeMismatchPass": true');
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
    const result = runReleaseStopGateForMarker(markerPath);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('"telemetryRequiredFieldsPass": false');
    expect(result.stderr).toContain('Release blocked: KPI hard-gate failed');
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
    const result = runReleaseStopGateForMarker(markerPath);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('"telemetryScopeMismatchPass": false');
    expect(result.stdout).toContain('multiple_project_paths_observed');
    expect(result.stderr).toContain('Release blocked: KPI hard-gate failed');
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

  function runReleaseStopGate(extraArgs: string[]) {
    return spawnSync(
      process.execPath,
      [releaseStopGateScriptPath, '--skip-contract-checks', '--skip-kpi', ...extraArgs],
      {
        cwd: repoRoot,
        encoding: 'utf-8',
        env: releaseStopGateEnv(),
      }
    );
  }

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

    const result = runReleaseStopGate([
      '--release-notes',
      releaseNotesPath,
      '--enforce-claim-safety',
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Release notes claim-safety result');
    expect(result.stdout).toContain('"ok": true');
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

    const result = runReleaseStopGate([
      '--release-notes',
      releaseNotesPath,
      '--enforce-claim-safety',
    ]);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Release notes claim-safety result');
    expect(result.stdout).toContain('autonomous_mutation_claim');
    expect(result.stderr).toContain('Release blocked: Release notes claim-safety failed');
  });
});

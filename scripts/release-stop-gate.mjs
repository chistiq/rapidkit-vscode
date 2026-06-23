#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'url';

const DEFAULT_TEST_FILES = [
  'src/test/driftGuard.test.ts',
  'src/test/importStackParity.snapshot.test.ts',
  'src/test/impactScoreScenarioMatrix.test.ts',
  'src/test/incidentStudioPayload.test.ts',
  'src/test/incidentStudioPromptPolicy.test.ts',
  'src/test/workspaceUsageTracker.test.ts',
  'src/test/incidentStudioLifecycle.test.ts',
  'src/test/incidentStudioStressGate.test.ts',
];

function parseEnvNumber(envKeys, fallback) {
  for (const envKey of envKeys) {
    const raw = process.env[envKey];
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      continue;
    }

    const value = Number(raw);
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return fallback;
}

function parseEnvBoolean(envKeys, fallback = false) {
  for (const envKey of envKeys) {
    const raw = process.env[envKey];
    if (typeof raw !== 'string') {
      continue;
    }

    const normalized = raw.trim().toLowerCase();
    if (!normalized) {
      continue;
    }

    if (
      normalized === '1' ||
      normalized === 'true' ||
      normalized === 'yes' ||
      normalized === 'on'
    ) {
      return true;
    }
    if (
      normalized === '0' ||
      normalized === 'false' ||
      normalized === 'no' ||
      normalized === 'off'
    ) {
      return false;
    }
  }

  return fallback;
}

function parseEnvString(envKeys, fallback = '') {
  for (const envKey of envKeys) {
    const raw = process.env[envKey];
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return raw.trim();
    }
  }
  return fallback;
}

function parseSeverityList(raw, fallback = ['p0', 'p1']) {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return fallback;
  }

  const values = raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return values.length > 0 ? values : fallback;
}

function parseArgs(argv) {
  const options = {
    skipKpi: false,
    skipContractChecks: false,
    manifest: '',
    claimChecklistPath:
      process.env.WORKSPAI_CLAIM_CHECKLIST_PATH ||
      path.resolve(
        process.cwd(),
        '..',
        'Docs',
        'workspai',
        'Final',
        'WORKSPAI_UNIFIED_FINAL_FEATURE_CHECKLIST.md'
      ),
    enforceClaimChecklist: false,
    issueReportPath: parseEnvString(
      ['WORKSPAI_OPEN_ISSUE_REPORT_PATH', 'WORKSPAI_ISSUE_REPORT_PATH'],
      ''
    ),
    enforceOpenIssues: parseEnvBoolean(
      ['WORKSPAI_GATE_ENFORCE_OPEN_ISSUES', 'WORKSPAI_ENFORCE_OPEN_ISSUES'],
      false
    ),
    blockedSeverities: parseSeverityList(process.env.WORKSPAI_GATE_BLOCK_SEVERITIES || 'p0,p1'),
    issueReportMaxAgeHours: parseEnvNumber(
      ['WORKSPAI_GATE_ISSUE_REPORT_MAX_AGE_HOURS', 'WORKSPAI_ISSUE_REPORT_MAX_AGE_HOURS'],
      24
    ),
    enterpriseGatePath:
      process.env.WORKSPAI_ENTERPRISE_GATE_PATH ||
      process.env.WORKSPAI_ENTERPRISE_STABILIZATION_GATE_PATH ||
      '',
    enforceEnterpriseFreeze: parseEnvBoolean(
      ['WORKSPAI_GATE_ENFORCE_ENTERPRISE_FREEZE', 'WORKSPAI_ENFORCE_ENTERPRISE_FREEZE'],
      false
    ),
    releaseNotesPath:
      process.env.WORKSPAI_RELEASE_NOTES_PATH || process.env.WORKSPAI_RELEASE_NOTES_FILE || '',
    enforceReleasePostureLabel: parseEnvBoolean(
      ['WORKSPAI_GATE_ENFORCE_RELEASE_POSTURE_LABEL', 'WORKSPAI_ENFORCE_RELEASE_POSTURE_LABEL'],
      false
    ),
    enforceClaimSafety: parseEnvBoolean(
      ['WORKSPAI_GATE_ENFORCE_CLAIM_SAFETY', 'WORKSPAI_ENFORCE_CLAIM_SAFETY'],
      false
    ),
    verifyPackContract:
      process.env.WORKSPAI_VERIFY_PACK_CONTRACT ||
      process.env.WORKSPAI_VERIFY_PACK_CONTRACT_PATH ||
      '',
    releaseReadinessCommander:
      process.env.WORKSPAI_RELEASE_READINESS_COMMANDER ||
      process.env.WORKSPAI_RELEASE_READINESS_COMMANDER_PATH ||
      '',
    marker: process.env.WORKSPAI_GATE_MARKER || process.env.WORKSPAI_GATE_MARKER_PATH || '',
    markerMaxAgeHours: parseEnvNumber(['WORKSPAI_GATE_MARKER_MAX_AGE_HOURS'], 0),
    verifyPhaseReachMin: parseEnvNumber(
      ['WORKSPAI_GATE_VERIFY_MIN', 'WORKSPAI_GATE_VERIFY_PHASE_REACH_MIN'],
      80
    ),
    bridgeRouteCompletionMin: parseEnvNumber(
      ['WORKSPAI_GATE_BRIDGE_MIN', 'WORKSPAI_GATE_BRIDGE_ROUTE_COMPLETION_MIN'],
      95
    ),
    predictivePrecisionMin: parseEnvNumber(['WORKSPAI_GATE_PREDICTIVE_PRECISION_MIN'], 65),
    falseAlarmRateMax: parseEnvNumber(['WORKSPAI_GATE_FALSE_ALARM_RATE_MAX'], 35),
    preventedIncidentRateMin: parseEnvNumber(['WORKSPAI_GATE_PREVENTED_INCIDENT_RATE_MIN'], 20),
    reproPackShareRateMin: parseEnvNumber(['WORKSPAI_GATE_REPRO_PACK_SHARE_RATE_MIN'], 20),
    replayToResolutionRateMin: parseEnvNumber(['WORKSPAI_GATE_REPLAY_TO_RESOLUTION_RATE_MIN'], 60),
    verifyAutoRollbackSuccessRateMin: parseEnvNumber(
      ['WORKSPAI_GATE_ROLLBACK_SUCCESS_RATE_MIN'],
      60
    ),
    falseConfidenceRateMax: parseEnvNumber(['WORKSPAI_GATE_FALSE_CONFIDENCE_RATE_MAX'], 40),
    maxTimeToFirstConfidentActionP50Ms: parseEnvNumber(
      ['WORKSPAI_GATE_OUTCOME_MAX_TTFCA_P50_MS'],
      30000
    ),
    minFirstActionSuccessRate: parseEnvNumber(
      ['WORKSPAI_GATE_OUTCOME_MIN_FIRST_ACTION_SUCCESS_RATE'],
      0.6
    ),
    maxReopenRateAfterSuggestedFix: parseEnvNumber(
      ['WORKSPAI_GATE_OUTCOME_MAX_REOPEN_RATE_AFTER_SUGGESTED_FIX'],
      0.25
    ),
    maxOverrideRateOnRecommendations: parseEnvNumber(
      ['WORKSPAI_GATE_OUTCOME_MAX_OVERRIDE_RATE_ON_RECOMMENDATIONS'],
      0.35
    ),
    minVerifyPathCompletionRate: parseEnvNumber(
      ['WORKSPAI_GATE_OUTCOME_MIN_VERIFY_PATH_COMPLETION_RATE'],
      0.8
    ),
    minRollbackRecoverySuccessRate: parseEnvNumber(
      ['WORKSPAI_GATE_OUTCOME_MIN_ROLLBACK_RECOVERY_SUCCESS_RATE'],
      0.7
    ),
    verifyPackAutopilotReadinessRateMin: parseEnvNumber(
      ['WORKSPAI_GATE_VERIFY_PACK_AUTOPILOT_READINESS_RATE_MIN'],
      0
    ),
    verifyPackAutopilotReadinessMode: String(
      process.env.WORKSPAI_GATE_VERIFY_PACK_AUTOPILOT_READINESS_MODE || 'enforce'
    ).toLowerCase(),
    verifyPackAutopilotGeneratedMinForEnforcement: parseEnvNumber(
      ['WORKSPAI_GATE_VERIFY_PACK_AUTOPILOT_GENERATED_MIN_FOR_ENFORCEMENT'],
      20
    ),
    releaseReadinessValidationMode: String(
      process.env.WORKSPAI_GATE_RELEASE_READINESS_VALIDATION_MODE || 'warn'
    ).toLowerCase(),
    releaseReadinessArtifactsMinForEnforcement: parseEnvNumber(
      ['WORKSPAI_GATE_RELEASE_READINESS_ARTIFACTS_MIN_FOR_ENFORCEMENT'],
      10
    ),
    releaseReadinessDecisionsMinForEnforcement: parseEnvNumber(
      ['WORKSPAI_GATE_RELEASE_READINESS_DECISIONS_MIN_FOR_ENFORCEMENT'],
      5
    ),
    releaseReadinessDecisionAccuracyMin: parseEnvNumber(
      ['WORKSPAI_GATE_RELEASE_READINESS_DECISION_ACCURACY_MIN'],
      80
    ),
    releaseReadinessNoGoPreventedIncidentRateMin: parseEnvNumber(
      ['WORKSPAI_GATE_RELEASE_READINESS_NO_GO_PREVENTED_INCIDENT_RATE_MIN'],
      70
    ),
    predictiveCalibrationMode: String(
      process.env.WORKSPAI_GATE_PREDICTIVE_CALIBRATION_MODE || 'off'
    ).toLowerCase(),
    productionWindows: parseEnvNumber(['WORKSPAI_GATE_PROD_WINDOWS'], 0),
    productionWindowsMinForTightening: parseEnvNumber(['WORKSPAI_GATE_PROD_WINDOWS_MIN'], 3),
    predictionShownMinForTightening: parseEnvNumber(
      ['WORKSPAI_GATE_PREDICTION_SHOWN_MIN_FOR_TIGHTENING'],
      50
    ),
    predictionOutcomesMinForTightening: parseEnvNumber(
      ['WORKSPAI_GATE_PREDICTION_OUTCOMES_MIN_FOR_TIGHTENING'],
      30
    ),
    predictivePrecisionTightenedMin: parseEnvNumber(
      ['WORKSPAI_GATE_PREDICTIVE_PRECISION_TIGHTENED_MIN'],
      70
    ),
    falseAlarmRateTightenedMax: parseEnvNumber(
      ['WORKSPAI_GATE_FALSE_ALARM_RATE_TIGHTENED_MAX'],
      30
    ),
    preventedIncidentRateTightenedMin: parseEnvNumber(
      ['WORKSPAI_GATE_PREVENTED_INCIDENT_RATE_TIGHTENED_MIN'],
      30
    ),
    firstChunkLatencyP95MaxMs: parseEnvNumber(
      ['WORKSPAI_GATE_FIRST_CHUNK_LATENCY_P95_MAX_MS'],
      3000
    ),
    syncLatencyP95MaxMs: parseEnvNumber(['WORKSPAI_GATE_SYNC_LATENCY_P95_MAX_MS'], 2000),
    boardRenderLatencyP95MaxMs: parseEnvNumber(
      ['WORKSPAI_GATE_BOARD_RENDER_LATENCY_P95_MAX_MS'],
      500
    ),
    allowOverride: false,
    overrideOwner: process.env.WORKSPAI_GATE_OVERRIDE_OWNER || '',
    overrideReason: process.env.WORKSPAI_GATE_OVERRIDE_REASON || '',
    overrideTicket: process.env.WORKSPAI_GATE_OVERRIDE_TICKET || '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--skip-kpi') {
      options.skipKpi = true;
      continue;
    }

    if (arg === '--skip-contract-checks') {
      options.skipContractChecks = true;
      continue;
    }

    if (arg === '--manifest') {
      options.manifest = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (arg === '--marker') {
      options.marker = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (arg === '--marker-max-age-hours') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.markerMaxAgeHours = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--verify-pack-contract') {
      options.verifyPackContract = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (arg === '--release-readiness-commander') {
      options.releaseReadinessCommander = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (arg === '--claim-checklist') {
      options.claimChecklistPath = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (arg === '--enforce-claim-checklist') {
      options.enforceClaimChecklist = true;
      continue;
    }

    if (arg === '--issue-report') {
      options.issueReportPath = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (arg === '--enforce-open-issues') {
      options.enforceOpenIssues = true;
      continue;
    }

    if (arg === '--block-severities') {
      options.blockedSeverities = parseSeverityList(argv[i + 1], ['p0', 'p1']);
      i += 1;
      continue;
    }

    if (arg === '--issue-report-max-age-hours') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.issueReportMaxAgeHours = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--enterprise-gate') {
      options.enterpriseGatePath = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (arg === '--enforce-enterprise-freeze') {
      options.enforceEnterpriseFreeze = true;
      continue;
    }

    if (arg === '--release-notes') {
      options.releaseNotesPath = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (arg === '--enforce-release-posture-label') {
      options.enforceReleasePostureLabel = true;
      continue;
    }

    if (arg === '--enforce-claim-safety') {
      options.enforceClaimSafety = true;
      continue;
    }

    if (arg === '--verify-min') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.verifyPhaseReachMin = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--bridge-min') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.bridgeRouteCompletionMin = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--predictive-precision-min') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.predictivePrecisionMin = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--false-alarm-max') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.falseAlarmRateMax = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--prevented-rate-min') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.preventedIncidentRateMin = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--repro-pack-share-min') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.reproPackShareRateMin = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--replay-resolution-min') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.replayToResolutionRateMin = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--rollback-success-min') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.verifyAutoRollbackSuccessRateMin = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--false-confidence-max') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.falseConfidenceRateMax = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--verify-pack-readiness-min') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.verifyPackAutopilotReadinessRateMin = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--verify-pack-readiness-mode') {
      options.verifyPackAutopilotReadinessMode = String(argv[i + 1] || 'enforce').toLowerCase();
      i += 1;
      continue;
    }

    if (arg === '--verify-pack-generated-min') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.verifyPackAutopilotGeneratedMinForEnforcement = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--release-readiness-validation-mode') {
      options.releaseReadinessValidationMode = String(argv[i + 1] || 'warn').toLowerCase();
      i += 1;
      continue;
    }

    if (arg === '--release-readiness-artifacts-min') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.releaseReadinessArtifactsMinForEnforcement = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--release-readiness-decisions-min') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.releaseReadinessDecisionsMinForEnforcement = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--release-readiness-decision-accuracy-min') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.releaseReadinessDecisionAccuracyMin = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--release-readiness-no-go-prevented-min') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.releaseReadinessNoGoPreventedIncidentRateMin = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--allow-override') {
      options.allowOverride = true;
      continue;
    }

    if (arg === '--override-owner') {
      options.overrideOwner = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (arg === '--override-reason') {
      options.overrideReason = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (arg === '--override-ticket') {
      options.overrideTicket = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (arg === '--predictive-calibration-mode') {
      options.predictiveCalibrationMode = String(argv[i + 1] || 'off').toLowerCase();
      i += 1;
      continue;
    }

    if (arg === '--prod-windows') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.productionWindows = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--prod-windows-min') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.productionWindowsMinForTightening = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--prediction-shown-min') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.predictionShownMinForTightening = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--prediction-outcomes-min') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.predictionOutcomesMinForTightening = value;
      }
      i += 1;
      continue;
    }
  }

  return options;
}

function uniqueStrings(values) {
  return Array.from(
    new Set(values.filter((value) => typeof value === 'string' && value.trim().length > 0))
  );
}

function runContractAndParityChecks(testFiles = DEFAULT_TEST_FILES) {
  const localVitest = path.resolve(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'vitest.cmd' : 'vitest'
  );
  const command = fs.existsSync(localVitest) ? localVitest : 'npx';
  const args = fs.existsSync(localVitest)
    ? ['run', ...uniqueStrings(testFiles)]
    : ['vitest', 'run', ...uniqueStrings(testFiles)];

  execFileSync(command, args, { stdio: 'inherit' });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function buildVerifyPackContractStatus(contractPath) {
  const resolvedPath = path.resolve(contractPath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      ok: false,
      contractPath: resolvedPath,
      message: `Verify-pack contract not found: ${resolvedPath}`,
    };
  }

  const payload = readJson(resolvedPath);
  const hasV1Schema = payload?.schemaVersion === 'v1';
  const overallStatus = payload?.overallStatus;
  const isOverallStatusValid =
    overallStatus === 'passed' || overallStatus === 'failed' || overallStatus === 'skipped';
  const commands = Array.isArray(payload?.commands) ? payload.commands : null;
  const summary = payload?.summary;
  const hasSummary =
    summary &&
    typeof summary.totalCommands === 'number' &&
    typeof summary.passedCommands === 'number' &&
    typeof summary.failedCommands === 'number' &&
    typeof summary.totalDurationMs === 'number';

  if (!hasV1Schema || !isOverallStatusValid || !commands || !hasSummary) {
    return {
      ok: false,
      contractPath: resolvedPath,
      message: 'Verify-pack contract payload is malformed or not schema v1.',
    };
  }

  return {
    ok: overallStatus === 'passed',
    contractPath: resolvedPath,
    overallStatus,
    summary,
    message:
      overallStatus === 'passed'
        ? 'Verify-pack contract passed.'
        : `Verify-pack contract status is ${overallStatus}.`,
  };
}

function buildReleaseReadinessCommanderStatus(artifactPath) {
  const resolvedPath = path.resolve(artifactPath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      ok: false,
      artifactPath: resolvedPath,
      message: `Release readiness commander artifact not found: ${resolvedPath}`,
    };
  }

  const payload = readJson(resolvedPath);
  const artifact = payload?.release_readiness_commander;
  const decision = artifact?.decision;
  const schemaVersion = artifact?.schemaVersion;
  const confidence = artifact?.confidence;
  const evidence = artifact?.evidence;
  const hasEvidence =
    evidence &&
    typeof evidence === 'object' &&
    typeof evidence.scopeKnown === 'boolean' &&
    typeof evidence.verifyPathPresent === 'boolean' &&
    typeof evidence.rollbackPathPresent === 'boolean';
  const blockingReasons = Array.isArray(artifact?.blockingReasons)
    ? artifact.blockingReasons.filter((item) => typeof item === 'string')
    : [];

  if (
    schemaVersion !== 'v1' ||
    (decision !== 'go' && decision !== 'no-go') ||
    !Number.isFinite(confidence) ||
    !hasEvidence
  ) {
    return {
      ok: false,
      artifactPath: resolvedPath,
      message: 'Release readiness commander artifact is malformed or unsupported.',
    };
  }

  const failedReleaseGates = [];
  if (!evidence.scopeKnown) {
    failedReleaseGates.push('scopeKnown=false');
  }
  if (!evidence.verifyPathPresent) {
    failedReleaseGates.push('verifyPathPresent=false');
  }
  if (!evidence.rollbackPathPresent) {
    failedReleaseGates.push('rollbackPathPresent=false');
  }
  if (decision === 'go' && blockingReasons.length > 0) {
    failedReleaseGates.push('blockingReasons_present');
  }

  if (decision === 'go' && failedReleaseGates.length > 0) {
    return {
      ok: false,
      artifactPath: resolvedPath,
      decision,
      confidence,
      blockingReasonCount: blockingReasons.length,
      failedReleaseGates,
      message: `Release readiness commander GO artifact failed mandatory release gates: ${failedReleaseGates.join(', ')}.`,
    };
  }

  return {
    ok: decision === 'go',
    artifactPath: resolvedPath,
    decision,
    confidence,
    blockingReasonCount: blockingReasons.length,
    message:
      decision === 'go'
        ? 'Release readiness commander decision is GO.'
        : 'Release readiness commander decision is NO-GO.',
  };
}

function listUncheckedCheckboxes(markdown, sectionTitle) {
  const lines = markdown.split(/\r?\n/);
  const sectionIndex = lines.findIndex((line) => line.trim() === sectionTitle.trim());
  if (sectionIndex < 0) {
    return [];
  }

  const unchecked = [];
  for (let i = sectionIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^##\s+/.test(line) || /^###\s+/.test(line)) {
      break;
    }

    const match = line.match(/^\s*- \[ \] (.+)$/);
    if (match) {
      unchecked.push(match[1].trim());
    }
  }

  return unchecked;
}

function buildClaimChecklistStatus(checklistPath) {
  const resolvedPath = path.resolve(checklistPath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      ok: false,
      checklistPath: resolvedPath,
      finalMaturityUnchecked: [],
      wave1ExitUnchecked: [],
      message: `Claim checklist not found: ${resolvedPath}`,
    };
  }

  const markdown = fs.readFileSync(resolvedPath, 'utf-8');
  const finalMaturityUnchecked = listUncheckedCheckboxes(
    markdown,
    '## 4) Final Maturity Definition (Cross-Platform + IR/BYOP)'
  );
  const wave1ExitUnchecked = listUncheckedCheckboxes(markdown, '### Wave 1 Exit Package');
  const allUnchecked = [...finalMaturityUnchecked, ...wave1ExitUnchecked];

  return {
    ok: allUnchecked.length === 0,
    checklistPath: resolvedPath,
    finalMaturityUnchecked,
    wave1ExitUnchecked,
    message:
      allUnchecked.length === 0
        ? 'Claim checklist gates are fully checked.'
        : `Claim checklist has ${allUnchecked.length} unchecked gate(s).`,
  };
}

function normalizeSeverityCandidate(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (!raw) {
    return null;
  }

  const strippedPrefix = raw
    .replace(/^severity\s*[:=-]?\s*/i, '')
    .replace(/^priority\s*[:=-]?\s*/i, '')
    .replace(/^sev\s*/i, 'sev');

  const tokens = strippedPrefix
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.includes('critical') || tokens.includes('p0') || tokens.includes('sev0')) {
    return 'p0';
  }
  if (tokens.includes('high') || tokens.includes('p1') || tokens.includes('sev1')) {
    return 'p1';
  }

  const normalized = strippedPrefix.replace(/[^a-z0-9]+/g, '');

  if (normalized === 'critical' || normalized === 'sev0') {
    return 'p0';
  }
  if (normalized === 'high' || normalized === 'sev1') {
    return 'p1';
  }

  if (normalized === 'p0' || normalized === 'priorityp0' || normalized === 'severityp0') {
    return 'p0';
  }
  if (normalized === 'p1' || normalized === 'priorityp1' || normalized === 'severityp1') {
    return 'p1';
  }

  if (normalized.includes('critical') || normalized.includes('sev0') || normalized.includes('p0')) {
    return 'p0';
  }
  if (normalized.includes('high') || normalized.includes('sev1') || normalized.includes('p1')) {
    return 'p1';
  }

  return raw;
}

function extractIssueSeverity(issue) {
  if (!issue || typeof issue !== 'object') {
    return null;
  }

  const directCandidates = [
    issue.severity,
    issue.priority,
    issue.level,
    issue?.metadata?.severity,
    issue?.metadata?.priority,
  ];

  for (const candidate of directCandidates) {
    const normalized = normalizeSeverityCandidate(candidate);
    if (normalized) {
      return normalized;
    }
  }

  const labels = Array.isArray(issue.labels) ? issue.labels : [];
  for (const label of labels) {
    const labelName = typeof label === 'string' ? label : label?.name;
    const normalized = normalizeSeverityCandidate(labelName);
    if (normalized === 'p0' || normalized === 'p1') {
      return normalized;
    }
  }

  return null;
}

function isIssueOpen(issue) {
  if (!issue || typeof issue !== 'object') {
    return false;
  }

  if (issue.pull_request) {
    return false;
  }

  if (typeof issue.isOpen === 'boolean') {
    return issue.isOpen;
  }

  const stateCandidate = String(issue.state || issue.status || '')
    .trim()
    .toLowerCase();
  if (stateCandidate) {
    return !(
      stateCandidate === 'closed' ||
      stateCandidate === 'resolved' ||
      stateCandidate === 'done'
    );
  }

  if (issue.closedAt || issue.closed_at || issue.resolvedAt || issue.resolved_at) {
    return false;
  }

  return true;
}

function buildOpenIssueSeverityStatus(issueReportPath, blockedSeverities = ['p0', 'p1']) {
  const resolvedPath = path.resolve(issueReportPath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      ok: false,
      issueReportPath: resolvedPath,
      blockedSeverities,
      blockingOpenIssues: [],
      openIssueCount: 0,
      message: `Open-issue report not found: ${resolvedPath}`,
    };
  }

  const payload = readJson(resolvedPath);
  const issues = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.issues)
      ? payload.issues
      : [];

  const normalizedBlocked = blockedSeverities.map((item) => String(item).toLowerCase());

  const blockingOpenIssues = issues
    .filter((issue) => issue && typeof issue === 'object')
    .filter((issue) => isIssueOpen(issue))
    .map((issue) => {
      const severity = extractIssueSeverity(issue);
      const id =
        issue.id || issue.number || issue.key || issue.issueId || issue.title || 'unknown-issue-id';
      return {
        id,
        severity,
        title: typeof issue.title === 'string' ? issue.title : null,
        state: issue.state || issue.status || null,
      };
    })
    .filter(
      (issue) => issue.severity && normalizedBlocked.includes(String(issue.severity).toLowerCase())
    );

  const openIssueCount = issues.filter((issue) => isIssueOpen(issue)).length;

  return {
    ok: blockingOpenIssues.length === 0,
    issueReportPath: resolvedPath,
    blockedSeverities: normalizedBlocked,
    openIssueCount,
    blockingOpenIssues,
    message:
      blockingOpenIssues.length === 0
        ? 'No blocking open issues found for configured severities.'
        : `Found ${blockingOpenIssues.length} blocking open issue(s) in severities: ${normalizedBlocked.join(', ')}.`,
  };
}

function buildOpenIssueReportFreshnessStatus(issueReportPath, maxAgeHoursRaw) {
  const resolvedPath = path.resolve(issueReportPath);
  const maxAgeHours = Number.isFinite(maxAgeHoursRaw) ? Number(maxAgeHoursRaw) : 0;
  const normalizedMaxAgeHours = maxAgeHours > 0 ? maxAgeHours : 0;

  if (!fs.existsSync(resolvedPath)) {
    return {
      ok: false,
      issueReportPath: resolvedPath,
      maxAgeHours: normalizedMaxAgeHours,
      message: `Open-issue report not found: ${resolvedPath}`,
    };
  }

  if (normalizedMaxAgeHours === 0) {
    return {
      ok: true,
      issueReportPath: resolvedPath,
      maxAgeHours: 0,
      message: 'Open-issue report freshness gate disabled.',
    };
  }

  const payload = readJson(resolvedPath);
  const generatedAtRaw = typeof payload?.generatedAt === 'string' ? payload.generatedAt : '';
  const generatedAtMs = Date.parse(generatedAtRaw);

  if (!Number.isFinite(generatedAtMs)) {
    return {
      ok: false,
      issueReportPath: resolvedPath,
      maxAgeHours: normalizedMaxAgeHours,
      message: 'Open-issue report freshness gate failed: generatedAt is missing or invalid.',
    };
  }

  const ageHours = (Date.now() - generatedAtMs) / (1000 * 60 * 60);
  const ok = ageHours <= normalizedMaxAgeHours;

  return {
    ok,
    issueReportPath: resolvedPath,
    maxAgeHours: normalizedMaxAgeHours,
    generatedAt: new Date(generatedAtMs).toISOString(),
    ageHours: Number(ageHours.toFixed(2)),
    message: ok
      ? 'Open-issue report freshness gate passed.'
      : `Open-issue report freshness gate failed: report age ${ageHours.toFixed(2)}h exceeds max ${normalizedMaxAgeHours}h.`,
  };
}

function buildEnterpriseStabilizationGateStatus(gatePath) {
  const resolvedPath = path.resolve(gatePath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      ok: false,
      gatePath: resolvedPath,
      message: `Enterprise stabilization gate file not found: ${resolvedPath}`,
    };
  }

  const payload = readJson(resolvedPath);
  const gate =
    payload &&
    typeof payload === 'object' &&
    payload.enterpriseStabilizationGateStatus &&
    typeof payload.enterpriseStabilizationGateStatus === 'object'
      ? payload.enterpriseStabilizationGateStatus
      : payload;

  const consecutiveWindowsPass = Number(gate?.consecutiveWindowsPass);
  const expansionFrozen = gate?.expansionFrozen === true;
  const last7dOverallPass = gate?.last7d?.overallPass === true;
  const last30dOverallPass = gate?.last30d?.overallPass === true;
  const freezeReason =
    typeof gate?.freezeReason === 'string' && gate.freezeReason.trim().length > 0
      ? gate.freezeReason.trim()
      : null;

  const hasShape =
    Number.isFinite(consecutiveWindowsPass) &&
    typeof gate?.expansionFrozen === 'boolean' &&
    (gate?.last7d === null || typeof gate?.last7d === 'object') &&
    (gate?.last30d === null || typeof gate?.last30d === 'object');

  if (!hasShape) {
    return {
      ok: false,
      gatePath: resolvedPath,
      message: 'Enterprise stabilization gate payload is malformed or unsupported.',
    };
  }

  const ok =
    consecutiveWindowsPass >= 2 &&
    expansionFrozen === false &&
    last7dOverallPass &&
    last30dOverallPass;

  return {
    ok,
    gatePath: resolvedPath,
    consecutiveWindowsPass,
    expansionFrozen,
    last7dOverallPass,
    last30dOverallPass,
    freezeReason,
    message: ok
      ? 'Enterprise stabilization freeze rule is satisfied (2 consecutive windows).'
      : 'Enterprise stabilization freeze rule failed (requires 2 consecutive passing windows and expansionFrozen=false).',
  };
}

function buildReleasePostureLabelStatus(releaseNotesPath) {
  const resolvedPath = path.resolve(releaseNotesPath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      ok: false,
      releaseNotesPath: resolvedPath,
      postureLabel: null,
      message: `Release notes file not found: ${resolvedPath}`,
    };
  }

  const markdown = fs.readFileSync(resolvedPath, 'utf-8');
  const match = markdown.match(/\b(stabilization-only|expansion-eligible)\b/i);
  const postureLabel = match ? match[1].toLowerCase() : null;

  return {
    ok: Boolean(postureLabel),
    releaseNotesPath: resolvedPath,
    postureLabel,
    message: postureLabel
      ? `Release notes posture label detected: ${postureLabel}.`
      : 'Release notes are missing mandatory posture label (stabilization-only | expansion-eligible).',
  };
}

const CLAIM_SAFETY_PATTERNS = [
  {
    id: 'autonomous_mutation_claim',
    regex:
      /\b(autonomous|autonomously|self[-\s]?driven)\b.{0,80}\b(apply|applies|patch|patches|modify|modifies|mutate|mutates|code changes?)\b/i,
    message: 'Release notes imply autonomous code mutation behavior.',
  },
  {
    id: 'guaranteed_outcome_claim',
    regex:
      /\b(guaranteed?|zero[-\s]?risk|zero[-\s]?failure|100%\s*(success|accuracy|reliability|safe))\b/i,
    message: 'Release notes contain unconditional or guaranteed outcome claims.',
  },
  {
    id: 'roadmap_as_shipped_claim',
    regex:
      /\b(roadmap|planned|coming\s+soon|future)\b.{0,80}\b(available\s+now|now\s+available|shipped|generally\s+available|ga)\b/i,
    message: 'Release notes present roadmap/future scope as shipped.',
  },
];

function buildReleaseClaimSafetyStatus(releaseNotesPath) {
  const resolvedPath = path.resolve(releaseNotesPath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      ok: false,
      releaseNotesPath: resolvedPath,
      findings: [],
      message: `Release notes file not found: ${resolvedPath}`,
    };
  }

  const markdown = fs.readFileSync(resolvedPath, 'utf-8');
  const lines = markdown.split(/\r?\n/);
  const findings = [];
  let insideCodeFence = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      insideCodeFence = !insideCodeFence;
      continue;
    }

    if (!trimmed || insideCodeFence) {
      continue;
    }

    for (const pattern of CLAIM_SAFETY_PATTERNS) {
      if (!pattern.regex.test(line)) {
        continue;
      }

      findings.push({
        ruleId: pattern.id,
        line: lineIndex + 1,
        message: pattern.message,
        text: trimmed.slice(0, 220),
      });
    }
  }

  return {
    ok: findings.length === 0,
    releaseNotesPath: resolvedPath,
    findings,
    message:
      findings.length === 0
        ? 'Release notes claim-safety checks passed.'
        : `Release notes claim-safety failed with ${findings.length} finding(s).`,
  };
}

function percent(numerator, denominator) {
  return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(2)) : null;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;
}

const CRITICAL_TELEMETRY_REQUIRED_FIELDS = {
  'workspai.studio.verify_passed': {
    actionId: 'non-empty-string',
    actionType: 'non-empty-string',
    verifyReady: 'boolean',
    verifyRequired: 'boolean',
    verifyPathPresent: 'boolean',
  },
  'workspai.studio.verify_failed': {
    actionId: 'non-empty-string',
    actionType: 'non-empty-string',
    verifyReady: 'boolean',
    verifyRequired: 'boolean',
    verifyPathPresent: 'boolean',
  },
  'workspai.studio.release_readiness_artifact_exported': {
    artifactId: 'non-empty-string',
    decision: 'release-decision',
    blockingReasonCount: 'finite-number',
  },
  'workspai.studio.release_readiness_go_decision_exported': {
    artifactId: 'non-empty-string',
    decision: 'release-decision',
  },
  'workspai.studio.release_readiness_no_go_decision_exported': {
    artifactId: 'non-empty-string',
    decision: 'release-decision',
  },
  'workspai.studio.release_readiness_decision_validated': {
    artifactId: 'non-empty-string',
    originalDecision: 'validation-decision',
    validationOutcome: 'non-empty-string',
  },
  'workspai.studio.release_readiness_decision_correct': {
    artifactId: 'non-empty-string',
    originalDecision: 'validation-decision',
    validationOutcome: 'non-empty-string',
  },
  'workspai.studio.release_readiness_no_go_decision_validated': {
    artifactId: 'non-empty-string',
    originalDecision: 'validation-decision',
    validationOutcome: 'non-empty-string',
  },
  'workspai.studio.release_readiness_no_go_prevented_incident': {
    artifactId: 'non-empty-string',
    originalDecision: 'validation-decision',
    validationOutcome: 'non-empty-string',
  },
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeProjectPathForTelemetry(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/\\/g, '/').toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function resolveTelemetryValueType(value) {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

function validateTelemetryField(value, rule) {
  if (rule === 'non-empty-string') {
    return typeof value === 'string' && value.trim().length > 0;
  }

  if (rule === 'boolean') {
    return typeof value === 'boolean';
  }

  if (rule === 'finite-number') {
    return typeof value === 'number' && Number.isFinite(value);
  }

  if (rule === 'release-decision') {
    return value === 'go' || value === 'no-go';
  }

  if (rule === 'validation-decision') {
    return value === 'GO' || value === 'NO-GO';
  }

  return false;
}

function buildTelemetryIntegrityStatus(recentEvents) {
  const requiredFieldViolations = [];
  const schemaDriftAlerts = [];
  const scopeMismatchAlerts = [];
  const observedProjectPaths = new Set();
  let inspectedCriticalEvents = 0;

  for (let index = 0; index < recentEvents.length; index += 1) {
    const entry = recentEvents[index];
    if (!isPlainObject(entry)) {
      continue;
    }

    const command = typeof entry.command === 'string' ? entry.command.trim() : '';
    const requiredFields = CRITICAL_TELEMETRY_REQUIRED_FIELDS[command];
    if (!requiredFields) {
      continue;
    }

    inspectedCriticalEvents += 1;

    if (!isPlainObject(entry.props)) {
      schemaDriftAlerts.push({
        index,
        command,
        reason: 'props_missing_or_invalid',
      });
      continue;
    }

    const props = entry.props;
    const normalizedProjectPath = normalizeProjectPathForTelemetry(props.projectPath);
    if (normalizedProjectPath) {
      observedProjectPaths.add(normalizedProjectPath);
    }

    for (const [field, rule] of Object.entries(requiredFields)) {
      const value = props[field];
      if (validateTelemetryField(value, rule)) {
        continue;
      }

      requiredFieldViolations.push({
        index,
        command,
        field,
        expected: rule,
        actualType: resolveTelemetryValueType(value),
      });
    }
  }

  if (observedProjectPaths.size > 1) {
    scopeMismatchAlerts.push({
      reason: 'multiple_project_paths_observed',
      observedProjectPaths: Array.from(observedProjectPaths),
    });
  }

  return {
    inspectedCriticalEvents,
    requiredFieldViolations,
    schemaDriftAlerts,
    scopeMismatchAlerts,
    observedProjectPaths: Array.from(observedProjectPaths),
    telemetryRequiredFieldsPass: requiredFieldViolations.length === 0,
    telemetrySchemaDriftPass: schemaDriftAlerts.length === 0,
    telemetryScopeMismatchPass: scopeMismatchAlerts.length === 0,
  };
}

function buildPredictionAggregation({ predictionShown, predictionVerified, predictionFalsified }) {
  const predictionOutcomes = predictionVerified + predictionFalsified;

  return {
    prevented_incident_rate: {
      key: 'prevented_incident_rate',
      numerator: predictionVerified,
      denominator: predictionShown,
      value: percent(predictionVerified, predictionShown),
      unit: 'percent',
      eventCommands: ['workspai.studio.prediction_verified', 'workspai.studio.prediction_shown'],
    },
    predictive_precision: {
      key: 'predictive_precision',
      numerator: predictionVerified,
      denominator: predictionOutcomes,
      value: percent(predictionVerified, predictionOutcomes),
      unit: 'percent',
      eventCommands: [
        'workspai.studio.prediction_verified',
        'workspai.studio.prediction_falsified',
      ],
    },
    false_alarm_rate: {
      key: 'false_alarm_rate',
      numerator: predictionFalsified,
      denominator: predictionOutcomes,
      value: percent(predictionFalsified, predictionOutcomes),
      unit: 'percent',
      eventCommands: [
        'workspai.studio.prediction_falsified',
        'workspai.studio.prediction_verified',
      ],
    },
  };
}

function resolvePredictiveCalibration({ baseThresholds, calibrationOptions, counts }) {
  const mode = String(calibrationOptions.predictiveCalibrationMode || 'off').toLowerCase();
  const productionWindows = Math.max(
    0,
    Number.isFinite(calibrationOptions.productionWindows)
      ? Math.round(calibrationOptions.productionWindows)
      : 0
  );
  const productionWindowsMinForTightening = Math.max(
    1,
    Number.isFinite(calibrationOptions.productionWindowsMinForTightening)
      ? Math.round(calibrationOptions.productionWindowsMinForTightening)
      : 3
  );
  const predictionShownMinForTightening = Math.max(
    1,
    Number.isFinite(calibrationOptions.predictionShownMinForTightening)
      ? Math.round(calibrationOptions.predictionShownMinForTightening)
      : 50
  );
  const predictionOutcomesMinForTightening = Math.max(
    1,
    Number.isFinite(calibrationOptions.predictionOutcomesMinForTightening)
      ? Math.round(calibrationOptions.predictionOutcomesMinForTightening)
      : 30
  );

  const canTightenByWindows = productionWindows >= productionWindowsMinForTightening;
  const canTightenByEvidence =
    counts.predictionShown >= predictionShownMinForTightening &&
    counts.predictionOutcomes >= predictionOutcomesMinForTightening;
  const tightenedActive = mode === 'production' && canTightenByWindows && canTightenByEvidence;

  const effectiveThresholds = {
    ...baseThresholds,
    predictivePrecisionMin: tightenedActive
      ? calibrationOptions.predictivePrecisionTightenedMin
      : baseThresholds.predictivePrecisionMin,
    falseAlarmRateMax: tightenedActive
      ? calibrationOptions.falseAlarmRateTightenedMax
      : baseThresholds.falseAlarmRateMax,
    preventedIncidentRateMin: tightenedActive
      ? calibrationOptions.preventedIncidentRateTightenedMin
      : baseThresholds.preventedIncidentRateMin,
  };

  return {
    effectiveThresholds,
    calibration: {
      mode,
      tightenedActive,
      productionWindows,
      productionWindowsMinForTightening,
      predictionShown: counts.predictionShown,
      predictionShownMinForTightening,
      predictionOutcomes: counts.predictionOutcomes,
      predictionOutcomesMinForTightening,
      reasons: {
        canTightenByWindows,
        canTightenByEvidence,
      },
      baseThresholds: {
        predictivePrecisionMin: baseThresholds.predictivePrecisionMin,
        falseAlarmRateMax: baseThresholds.falseAlarmRateMax,
        preventedIncidentRateMin: baseThresholds.preventedIncidentRateMin,
      },
      tightenedThresholds: {
        predictivePrecisionMin: calibrationOptions.predictivePrecisionTightenedMin,
        falseAlarmRateMax: calibrationOptions.falseAlarmRateTightenedMax,
        preventedIncidentRateMin: calibrationOptions.preventedIncidentRateTightenedMin,
      },
      appliedThresholds: {
        predictivePrecisionMin: effectiveThresholds.predictivePrecisionMin,
        falseAlarmRateMax: effectiveThresholds.falseAlarmRateMax,
        preventedIncidentRateMin: effectiveThresholds.preventedIncidentRateMin,
      },
    },
  };
}

function toIsoNow() {
  return new Date().toISOString();
}

function buildMarkerFreshnessStatus(markerPath, maxAgeHoursRaw) {
  const maxAgeHours = Number.isFinite(maxAgeHoursRaw) ? Number(maxAgeHoursRaw) : 0;
  const normalizedMaxAgeHours = maxAgeHours > 0 ? maxAgeHours : 0;

  if (normalizedMaxAgeHours === 0) {
    return {
      ok: true,
      enabled: false,
      markerPath,
      maxAgeHours: 0,
      message: 'Marker freshness gate disabled.',
    };
  }

  const marker = readJson(markerPath);
  const createdAtRaw = typeof marker?.createdAt === 'string' ? marker.createdAt : '';
  const createdAtMs = Date.parse(createdAtRaw);
  if (!Number.isFinite(createdAtMs)) {
    return {
      ok: false,
      enabled: true,
      markerPath,
      maxAgeHours: normalizedMaxAgeHours,
      message: 'Marker freshness gate failed: marker.createdAt is missing or invalid.',
    };
  }

  const ageHours = (Date.now() - createdAtMs) / (1000 * 60 * 60);
  const ok = ageHours <= normalizedMaxAgeHours;
  return {
    ok,
    enabled: true,
    markerPath,
    maxAgeHours: normalizedMaxAgeHours,
    createdAt: new Date(createdAtMs).toISOString(),
    ageHours: Number(ageHours.toFixed(2)),
    message: ok
      ? 'Marker freshness gate passed.'
      : `Marker freshness gate failed: marker age ${ageHours.toFixed(2)}h exceeds max ${normalizedMaxAgeHours}h.`,
  };
}

function appendOverrideLog(record) {
  const targetPath = path.resolve(
    process.env.WORKSPAI_GATE_OVERRIDE_LOG ||
      path.join(process.cwd(), '.rapidkit', 'reports', 'release-gate-overrides.jsonl')
  );

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.appendFileSync(targetPath, `${JSON.stringify(record)}\n`, 'utf-8');

  return targetPath;
}

function validateManifestEntry(entry) {
  return (
    entry &&
    typeof entry === 'object' &&
    typeof entry.path === 'string' &&
    typeof entry.contains === 'string'
  );
}

function buildManifestStatus(manifestPath) {
  const resolvedManifestPath = path.resolve(manifestPath);
  if (!fs.existsSync(resolvedManifestPath)) {
    return {
      ok: false,
      manifestPath: resolvedManifestPath,
      missingFiles: [resolvedManifestPath],
      missingContents: [],
      requiredVitestTests: [],
    };
  }

  const manifest = readJson(resolvedManifestPath);
  const requiredFiles = Array.isArray(manifest?.requiredFiles) ? manifest.requiredFiles : [];
  const requiredVitestTests = Array.isArray(manifest?.requiredVitestTests)
    ? manifest.requiredVitestTests
    : [];
  const requiredContents = Array.isArray(manifest?.requiredContents)
    ? manifest.requiredContents
    : [];

  const missingFiles = uniqueStrings([...requiredFiles, ...requiredVitestTests]).filter(
    (relativePath) => !fs.existsSync(path.resolve(process.cwd(), relativePath))
  );

  const missingContents = requiredContents
    .filter(validateManifestEntry)
    .filter((entry) => {
      const targetPath = path.resolve(process.cwd(), entry.path);
      if (!fs.existsSync(targetPath)) {
        return true;
      }

      const source = fs.readFileSync(targetPath, 'utf-8');
      return !source.includes(entry.contains);
    })
    .map((entry) => ({ path: entry.path, contains: entry.contains }));

  const malformedContentEntries = requiredContents.filter((entry) => !validateManifestEntry(entry));

  return {
    ok:
      missingFiles.length === 0 &&
      missingContents.length === 0 &&
      malformedContentEntries.length === 0,
    manifestPath: resolvedManifestPath,
    name: typeof manifest?.name === 'string' ? manifest.name : path.basename(resolvedManifestPath),
    missingFiles,
    missingContents,
    malformedContentEntries,
    requiredVitestTests: uniqueStrings(requiredVitestTests),
  };
}

function printManifestFailure(status) {
  console.error(`[release-stop-gate] Manifest validation failed: ${status.manifestPath}`);

  if (status.missingFiles.length > 0) {
    console.error('[release-stop-gate] Missing required files:');
    for (const filePath of status.missingFiles) {
      console.error(`- ${filePath}`);
    }
  }

  if (status.missingContents.length > 0) {
    console.error('[release-stop-gate] Missing required content snippets:');
    for (const entry of status.missingContents) {
      console.error(`- ${entry.path}: ${entry.contains}`);
    }
  }

  if (Array.isArray(status.malformedContentEntries) && status.malformedContentEntries.length > 0) {
    console.error('[release-stop-gate] Manifest contains malformed requiredContents entries.');
  }
}

function validateOverrideInput(options) {
  if (!options.allowOverride) {
    return null;
  }

  const owner = String(options.overrideOwner || '').trim();
  const reason = String(options.overrideReason || '').trim();
  const ticket = String(options.overrideTicket || '').trim();

  if (!owner || !reason || !ticket) {
    return {
      ok: false,
      message:
        'Override requires --override-owner, --override-reason, and --override-ticket when --allow-override is used.',
    };
  }

  if (reason.length < 10) {
    return {
      ok: false,
      message: 'Override reason must be at least 10 characters.',
    };
  }

  return {
    ok: true,
    owner,
    reason,
    ticket,
  };
}

function buildKpiGateStatus(markerPath, thresholds, calibrationOptions) {
  const marker = readJson(markerPath);
  const telemetry = marker?.metadata?.custom?.workspaiTelemetry;
  const recentEvents = Array.isArray(telemetry?.recentEvents) ? telemetry.recentEvents : [];
  const telemetryIntegrity = buildTelemetryIntegrityStatus(recentEvents);

  let loopStarted = 0;
  let nextActionClicked = 0;
  let actionExecuted = 0;
  let verifyPassed = 0;
  let verifyFailed = 0;
  let predictionShown = 0;
  let predictionAccepted = 0;
  let predictionVerified = 0;
  let predictionFalsified = 0;
  let reproPackCaptured = 0;
  let reproPackExported = 0;
  let reproPackImported = 0;
  let incidentReplayReady = 0;
  let incidentReplayMemoryEnriched = 0;
  let rollbackAttempted = 0;
  let rollbackSucceeded = 0;
  let verifyPackAutopilotGenerated = 0;
  let verifyPackAutopilotReady = 0;
  let releaseReadinessArtifactsExported = 0;
  let goDecisionsExported = 0;
  let noGoDecisionsExported = 0;
  let decisionsValidated = 0;
  let decisionsCorrect = 0;
  let noGoDecisionsValidated = 0;
  let noGoPreventedIncident = 0;

  for (const entry of recentEvents) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const command = typeof entry.command === 'string' ? entry.command : '';
    if (command === 'workspai.studio.loop_started') {
      loopStarted += 1;
    } else if (command === 'workspai.studio.next_action_clicked') {
      nextActionClicked += 1;
    } else if (command === 'workspai.studio.action_executed') {
      actionExecuted += 1;
    } else if (command === 'workspai.studio.verify_passed') {
      verifyPassed += 1;
    } else if (command === 'workspai.studio.verify_failed') {
      verifyFailed += 1;
    } else if (command === 'workspai.studio.prediction_shown') {
      predictionShown += 1;
    } else if (command === 'workspai.studio.prediction_accepted') {
      predictionAccepted += 1;
    } else if (command === 'workspai.studio.prediction_verified') {
      predictionVerified += 1;
    } else if (command === 'workspai.studio.prediction_falsified') {
      predictionFalsified += 1;
    } else if (command === 'workspai.studio.incident_repro_pack_captured') {
      reproPackCaptured += 1;
    } else if (command === 'workspai.studio.incident_repro_pack_exported') {
      reproPackExported += 1;
    } else if (command === 'workspai.studio.incident_repro_pack_imported') {
      reproPackImported += 1;
    } else if (command === 'workspai.studio.incident_replay_ready') {
      incidentReplayReady += 1;
    } else if (command === 'workspai.studio.incident_replay_memory_enriched') {
      incidentReplayMemoryEnriched += 1;
    } else if (command === 'workspai.studio.rollback_attempted') {
      rollbackAttempted += 1;
    } else if (command === 'workspai.studio.rollback_succeeded') {
      rollbackSucceeded += 1;
    } else if (command === 'workspai.studio.verify_pack_autopilot_generated') {
      verifyPackAutopilotGenerated += 1;
    } else if (command === 'workspai.studio.verify_pack_autopilot_ready') {
      verifyPackAutopilotReady += 1;
    } else if (command === 'workspai.studio.release_readiness_artifact_exported') {
      releaseReadinessArtifactsExported += 1;
    } else if (command === 'workspai.studio.release_readiness_go_decision_exported') {
      goDecisionsExported += 1;
    } else if (command === 'workspai.studio.release_readiness_no_go_decision_exported') {
      noGoDecisionsExported += 1;
    } else if (command === 'workspai.studio.release_readiness_decision_validated') {
      decisionsValidated += 1;
    } else if (command === 'workspai.studio.release_readiness_decision_correct') {
      decisionsCorrect += 1;
    } else if (command === 'workspai.studio.release_readiness_no_go_decision_validated') {
      noGoDecisionsValidated += 1;
    } else if (command === 'workspai.studio.release_readiness_no_go_prevented_incident') {
      noGoPreventedIncident += 1;
    }
  }

  const verifyPackAutopilotReadinessRate =
    verifyPackAutopilotGenerated > 0
      ? Number(((verifyPackAutopilotReady / verifyPackAutopilotGenerated) * 100).toFixed(2))
      : null;

  const verifyOutcomes = verifyPassed + verifyFailed;
  const verifyPhaseReach =
    actionExecuted > 0 ? Number(((verifyOutcomes / actionExecuted) * 100).toFixed(2)) : null;
  const verifyAutoRollbackSuccessRate =
    rollbackAttempted > 0
      ? Number(((rollbackSucceeded / rollbackAttempted) * 100).toFixed(2))
      : null;
  const falseConfidenceRate =
    verifyFailed > 0
      ? Number(Math.max(0, ((verifyFailed - rollbackSucceeded) / verifyFailed) * 100).toFixed(2))
      : null;
  const bridgeRouteCompletionRate =
    loopStarted > 0 ? Number(((actionExecuted / loopStarted) * 100).toFixed(2)) : null;
  const predictionIgnored = Math.max(0, predictionShown - predictionAccepted);
  const predictionOutcomes = predictionVerified + predictionFalsified;
  const predictionAggregation = buildPredictionAggregation({
    predictionShown,
    predictionVerified,
    predictionFalsified,
  });
  const markerProductionWindows = Number(telemetry?.productionWindows);
  const effectiveProductionWindows =
    Number.isFinite(calibrationOptions.productionWindows) &&
    calibrationOptions.productionWindows > 0
      ? calibrationOptions.productionWindows
      : Number.isFinite(markerProductionWindows)
        ? markerProductionWindows
        : 0;
  const predictiveCalibration = resolvePredictiveCalibration({
    baseThresholds: thresholds,
    calibrationOptions: {
      ...calibrationOptions,
      productionWindows: effectiveProductionWindows,
    },
    counts: {
      predictionShown,
      predictionOutcomes,
    },
  });
  const effectiveThresholds = predictiveCalibration.effectiveThresholds;
  const predictivePrecision = predictionAggregation.predictive_precision.value;
  const falseAlarmRate = predictionAggregation.false_alarm_rate.value;
  const preventedIncidentRate = predictionAggregation.prevented_incident_rate.value;
  const acceptanceRate =
    predictionShown > 0 ? Number(((predictionAccepted / predictionShown) * 100).toFixed(2)) : null;
  const verificationCoverage =
    predictionAccepted > 0
      ? Number(((predictionOutcomes / predictionAccepted) * 100).toFixed(2))
      : null;

  const reproPackShareRate = percent(reproPackExported, reproPackCaptured);
  const replayToResolutionRate = percent(incidentReplayMemoryEnriched, reproPackImported);
  const releaseReadinessDecisionAccuracy = percent(decisionsCorrect, decisionsValidated);
  const noGoPreventedIncidentRate = percent(noGoPreventedIncident, noGoDecisionsValidated);

  const outcomeRecordsRaw = Array.isArray(telemetry?.outcomeRecords)
    ? telemetry.outcomeRecords
    : [];
  const outcomeRecords = outcomeRecordsRaw
    .filter((record) => record && typeof record === 'object')
    .map((record) => ({
      timeToFirstConfidentActionMs:
        typeof record.timeToFirstConfidentActionMs === 'number' &&
        Number.isFinite(record.timeToFirstConfidentActionMs) &&
        record.timeToFirstConfidentActionMs >= 0
          ? record.timeToFirstConfidentActionMs
          : null,
      firstActionSucceeded: record.firstActionSucceeded === true,
      reopenedAfterSuggestedFix: record.reopenedAfterSuggestedFix === true,
      recommendationOverridden: record.recommendationOverridden === true,
      mutatingActionReachedVerify:
        typeof record.mutatingActionReachedVerify === 'boolean'
          ? record.mutatingActionReachedVerify
          : null,
      rollbackAttemptResult:
        typeof record.rollbackAttemptResult === 'boolean' ? record.rollbackAttemptResult : null,
    }));

  const timeToFirstConfidentActionSamples = outcomeRecords
    .map((record) => record.timeToFirstConfidentActionMs)
    .filter((value) => typeof value === 'number');
  const sortedTimeToFirstConfidentActionSamples = [...timeToFirstConfidentActionSamples].sort(
    (left, right) => left - right
  );
  const timeToFirstConfidentActionP50Ms =
    sortedTimeToFirstConfidentActionSamples.length === 0
      ? null
      : sortedTimeToFirstConfidentActionSamples.length % 2 === 1
        ? sortedTimeToFirstConfidentActionSamples[
            Math.floor(sortedTimeToFirstConfidentActionSamples.length / 2)
          ]
        : Math.round(
            (sortedTimeToFirstConfidentActionSamples[
              sortedTimeToFirstConfidentActionSamples.length / 2 - 1
            ] +
              sortedTimeToFirstConfidentActionSamples[
                sortedTimeToFirstConfidentActionSamples.length / 2
              ]) /
              2
          );

  const firstActionSuccessRate = ratio(
    outcomeRecords.filter((record) => record.firstActionSucceeded).length,
    outcomeRecords.length
  );
  const reopenRateAfterSuggestedFix = ratio(
    outcomeRecords.filter((record) => record.reopenedAfterSuggestedFix).length,
    outcomeRecords.length
  );
  const overrideRateOnRecommendations = ratio(
    outcomeRecords.filter((record) => record.recommendationOverridden).length,
    outcomeRecords.length
  );

  const mutatingOutcomeRecords = outcomeRecords.filter(
    (record) => record.mutatingActionReachedVerify !== null
  );
  const verifyPathCompletionRate = ratio(
    mutatingOutcomeRecords.filter((record) => record.mutatingActionReachedVerify === true).length,
    mutatingOutcomeRecords.length
  );

  const rollbackOutcomeRecords = outcomeRecords.filter(
    (record) => record.rollbackAttemptResult !== null
  );
  const rollbackRecoverySuccessRate = ratio(
    rollbackOutcomeRecords.filter((record) => record.rollbackAttemptResult === true).length,
    rollbackOutcomeRecords.length
  );

  const outcomeTelemetryEvidencePass = outcomeRecords.length > 0;
  const timeToFirstConfidentActionP50Pass =
    timeToFirstConfidentActionP50Ms !== null &&
    timeToFirstConfidentActionP50Ms <= effectiveThresholds.maxTimeToFirstConfidentActionP50Ms;
  const firstActionSuccessRatePass =
    firstActionSuccessRate !== null &&
    firstActionSuccessRate >= effectiveThresholds.minFirstActionSuccessRate;
  const reopenRateAfterSuggestedFixPass =
    reopenRateAfterSuggestedFix !== null &&
    reopenRateAfterSuggestedFix <= effectiveThresholds.maxReopenRateAfterSuggestedFix;
  const overrideRateOnRecommendationsPass =
    overrideRateOnRecommendations !== null &&
    overrideRateOnRecommendations <= effectiveThresholds.maxOverrideRateOnRecommendations;
  const verifyPathCompletionRatePass =
    verifyPathCompletionRate !== null &&
    verifyPathCompletionRate >= effectiveThresholds.minVerifyPathCompletionRate;
  const rollbackRecoverySuccessRatePass =
    rollbackRecoverySuccessRate !== null &&
    rollbackRecoverySuccessRate >= effectiveThresholds.minRollbackRecoverySuccessRate;

  const rollbackTelemetryEvidencePass = rollbackAttempted > 0;
  const verifyAutoRollbackSuccessRatePass =
    verifyAutoRollbackSuccessRate !== null &&
    verifyAutoRollbackSuccessRate >= effectiveThresholds.verifyAutoRollbackSuccessRateMin;
  const falseConfidenceRatePass =
    falseConfidenceRate !== null &&
    falseConfidenceRate <= effectiveThresholds.falseConfidenceRateMax;
  const reproPackShareRatePass =
    reproPackShareRate !== null && reproPackShareRate >= effectiveThresholds.reproPackShareRateMin;
  const replayToResolutionRatePass =
    replayToResolutionRate !== null &&
    replayToResolutionRate >= effectiveThresholds.replayToResolutionRateMin;
  const verifyPackReadinessModeRaw = String(
    calibrationOptions.verifyPackAutopilotReadinessMode || 'enforce'
  ).toLowerCase();
  const verifyPackReadinessMode =
    verifyPackReadinessModeRaw === 'off' ||
    verifyPackReadinessModeRaw === 'warn' ||
    verifyPackReadinessModeRaw === 'enforce' ||
    verifyPackReadinessModeRaw === 'auto'
      ? verifyPackReadinessModeRaw
      : 'enforce';
  const verifyPackGeneratedMinForEnforcement = Math.max(
    1,
    Number.isFinite(calibrationOptions.verifyPackAutopilotGeneratedMinForEnforcement)
      ? Math.round(calibrationOptions.verifyPackAutopilotGeneratedMinForEnforcement)
      : 20
  );
  const verifyPackReadinessThresholdEnabled =
    effectiveThresholds.verifyPackAutopilotReadinessRateMin > 0;
  const verifyPackReadinessEvidenceEnough =
    verifyPackAutopilotGenerated >= verifyPackGeneratedMinForEnforcement;
  const verifyPackReadinessWouldPass =
    verifyPackAutopilotReadinessRate !== null &&
    verifyPackAutopilotReadinessRate >= effectiveThresholds.verifyPackAutopilotReadinessRateMin;
  const verifyPackReadinessEnforced =
    verifyPackReadinessThresholdEnabled &&
    (verifyPackReadinessMode === 'enforce' ||
      (verifyPackReadinessMode === 'auto' && verifyPackReadinessEvidenceEnough));
  const verifyPackAutopilotReadinessRatePass =
    !verifyPackReadinessThresholdEnabled ||
    verifyPackReadinessMode === 'off' ||
    verifyPackReadinessMode === 'warn' ||
    (verifyPackReadinessEnforced && verifyPackReadinessWouldPass);

  const releaseReadinessValidationModeRaw = String(
    calibrationOptions.releaseReadinessValidationMode || 'warn'
  ).toLowerCase();
  const releaseReadinessValidationMode =
    releaseReadinessValidationModeRaw === 'off' ||
    releaseReadinessValidationModeRaw === 'warn' ||
    releaseReadinessValidationModeRaw === 'enforce' ||
    releaseReadinessValidationModeRaw === 'auto'
      ? releaseReadinessValidationModeRaw
      : 'warn';
  const releaseReadinessArtifactsMinForEnforcement = Math.max(
    1,
    Number.isFinite(calibrationOptions.releaseReadinessArtifactsMinForEnforcement)
      ? Math.round(calibrationOptions.releaseReadinessArtifactsMinForEnforcement)
      : 10
  );
  const releaseReadinessDecisionsMinForEnforcement = Math.max(
    1,
    Number.isFinite(calibrationOptions.releaseReadinessDecisionsMinForEnforcement)
      ? Math.round(calibrationOptions.releaseReadinessDecisionsMinForEnforcement)
      : 5
  );
  const releaseReadinessDecisionAccuracyMin = Number.isFinite(
    calibrationOptions.releaseReadinessDecisionAccuracyMin
  )
    ? calibrationOptions.releaseReadinessDecisionAccuracyMin
    : 80;
  const releaseReadinessNoGoPreventedIncidentRateMin = Number.isFinite(
    calibrationOptions.releaseReadinessNoGoPreventedIncidentRateMin
  )
    ? calibrationOptions.releaseReadinessNoGoPreventedIncidentRateMin
    : 70;
  const releaseReadinessEvidenceEnoughForEnforcement =
    releaseReadinessArtifactsExported >= releaseReadinessArtifactsMinForEnforcement &&
    decisionsValidated >= releaseReadinessDecisionsMinForEnforcement;
  const releaseReadinessValidationEnforced =
    releaseReadinessValidationMode === 'enforce' ||
    (releaseReadinessValidationMode === 'auto' && releaseReadinessEvidenceEnoughForEnforcement);
  const releaseReadinessValidationWouldPass =
    (releaseReadinessArtifactsExported > 0 ||
      decisionsValidated > 0 ||
      noGoDecisionsExported > 0) &&
    decisionsValidated > 0 &&
    noGoDecisionsValidated > 0 &&
    releaseReadinessDecisionAccuracy !== null &&
    releaseReadinessDecisionAccuracy >= releaseReadinessDecisionAccuracyMin &&
    noGoPreventedIncidentRate !== null &&
    noGoPreventedIncidentRate >= releaseReadinessNoGoPreventedIncidentRateMin;
  const releaseReadinessValidationPass =
    releaseReadinessValidationMode === 'off' ||
    releaseReadinessValidationMode === 'warn' ||
    (releaseReadinessValidationMode === 'auto' &&
      (!releaseReadinessValidationEnforced || releaseReadinessValidationWouldPass)) ||
    (releaseReadinessValidationMode === 'enforce' && releaseReadinessValidationWouldPass);

  // D04: performance SLO — compute P95 from latency samples stored in the marker
  const latencySamplesRaw = Array.isArray(telemetry?.latencySamples)
    ? telemetry.latencySamples
    : [];
  const latencySamples = latencySamplesRaw.filter(
    (s) => s && typeof s === 'object' && typeof s.event === 'string' && typeof s.ms === 'number'
  );
  const computeP95 = (values) => {
    if (values.length === 0) {
      return null;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.ceil(sorted.length * 0.95) - 1;
    return sorted[Math.max(0, idx)];
  };
  const firstChunkMs = latencySamples
    .filter((s) => s.event === 'workspai.perf.first_chunk_latency')
    .map((s) => s.ms);
  const syncMs = latencySamples
    .filter((s) => s.event === 'workspai.perf.sync_latency')
    .map((s) => s.ms);
  const boardRenderMs = latencySamples
    .filter((s) => s.event === 'workspai.perf.board_render_latency')
    .map((s) => s.ms);
  const firstChunkP95 = computeP95(firstChunkMs);
  const syncP95 = computeP95(syncMs);
  const boardRenderP95 = computeP95(boardRenderMs);
  const firstChunkLatencyPass =
    firstChunkP95 === null || firstChunkP95 <= effectiveThresholds.firstChunkLatencyP95MaxMs;
  const syncLatencyPass = syncP95 === null || syncP95 <= effectiveThresholds.syncLatencyP95MaxMs;
  const boardRenderLatencyPass =
    boardRenderP95 === null || boardRenderP95 <= effectiveThresholds.boardRenderLatencyP95MaxMs;

  const gates = {
    verifyPhaseReachPass:
      verifyPhaseReach !== null && verifyPhaseReach >= effectiveThresholds.verifyPhaseReachMin,
    bridgeRouteCompletionPass:
      bridgeRouteCompletionRate !== null &&
      bridgeRouteCompletionRate >= effectiveThresholds.bridgeRouteCompletionMin,
    telemetryEvidencePass: loopStarted > 0,
    predictivePrecisionPass:
      predictivePrecision !== null &&
      predictivePrecision >= effectiveThresholds.predictivePrecisionMin,
    falseAlarmRatePass:
      falseAlarmRate !== null && falseAlarmRate <= effectiveThresholds.falseAlarmRateMax,
    preventedIncidentRatePass:
      preventedIncidentRate !== null &&
      preventedIncidentRate >= effectiveThresholds.preventedIncidentRateMin,
    outcomeTelemetryEvidencePass,
    timeToFirstConfidentActionP50Pass,
    firstActionSuccessRatePass,
    reopenRateAfterSuggestedFixPass,
    overrideRateOnRecommendationsPass,
    verifyPathCompletionRatePass,
    rollbackRecoverySuccessRatePass,
    reproPackShareRatePass,
    replayToResolutionRatePass,
    verifyPackAutopilotReadinessRatePass,
    releaseReadinessValidationPass,
    rollbackTelemetryEvidencePass,
    verifyAutoRollbackSuccessRatePass,
    falseConfidenceRatePass,
    firstChunkLatencyPass,
    syncLatencyPass,
    boardRenderLatencyPass,
    telemetryRequiredFieldsPass: telemetryIntegrity.telemetryRequiredFieldsPass,
    telemetrySchemaDriftPass: telemetryIntegrity.telemetrySchemaDriftPass,
    telemetryScopeMismatchPass: telemetryIntegrity.telemetryScopeMismatchPass,
  };

  return {
    markerPath,
    evaluatedAt: toIsoNow(),
    thresholds: effectiveThresholds,
    verifyPackReadinessRollout: {
      mode: verifyPackReadinessMode,
      thresholdEnabled: verifyPackReadinessThresholdEnabled,
      generatedMinForEnforcement: verifyPackGeneratedMinForEnforcement,
      evidenceEnoughForEnforcement: verifyPackReadinessEvidenceEnough,
      enforced: verifyPackReadinessEnforced,
      wouldPass: verifyPackReadinessWouldPass,
    },
    releaseReadinessValidationRollout: {
      mode: releaseReadinessValidationMode,
      decisionAccuracyMin: releaseReadinessDecisionAccuracyMin,
      noGoPreventedIncidentRateMin: releaseReadinessNoGoPreventedIncidentRateMin,
      artifactsMinForEnforcement: releaseReadinessArtifactsMinForEnforcement,
      decisionsMinForEnforcement: releaseReadinessDecisionsMinForEnforcement,
      evidenceEnoughForEnforcement: releaseReadinessEvidenceEnoughForEnforcement,
      enforced: releaseReadinessValidationEnforced,
      wouldPass: releaseReadinessValidationWouldPass,
    },
    releaseReadinessValidation: {
      telemetryEvidencePass:
        releaseReadinessArtifactsExported > 0 ||
        decisionsValidated > 0 ||
        noGoDecisionsExported > 0,
      releaseReadinessDecisionAccuracyAvailable: decisionsValidated > 0,
      noGoPreventedIncidentRateAvailable: noGoDecisionsValidated > 0,
    },
    telemetryIntegrity,
    predictiveCalibration: predictiveCalibration.calibration,
    aggregation: predictionAggregation,
    metrics: {
      loopStarted,
      nextActionClicked,
      actionExecuted,
      verifyOutcomes,
      verifyPassed,
      verifyFailed,
      verifyPhaseReach,
      bridgeRouteCompletionRate,
      predictionShown,
      predictionAccepted,
      predictionVerified,
      predictionFalsified,
      predictionIgnored,
      predictivePrecision,
      falseAlarmRate,
      preventedIncidentRate,
      reproPackCaptured,
      reproPackExported,
      reproPackImported,
      incidentReplayReady,
      incidentReplayMemoryEnriched,
      reproPackShareRate,
      replayToResolutionRate,
      acceptanceRate,
      verificationCoverage,
      rollbackAttempted,
      rollbackSucceeded,
      verifyAutoRollbackSuccessRate,
      falseConfidenceRate,
      verifyPackAutopilotGenerated,
      verifyPackAutopilotReady,
      verifyPackAutopilotReadinessRate,
      releaseReadinessArtifactsExported,
      goDecisionsExported,
      noGoDecisionsExported,
      decisionsValidated,
      decisionsCorrect,
      noGoDecisionsValidated,
      noGoPreventedIncident,
      releaseReadinessDecisionAccuracy,
      noGoPreventedIncidentRate,
      outcomeSampleCount: outcomeRecords.length,
      timeToFirstConfidentActionP50Ms,
      firstActionSuccessRate,
      reopenRateAfterSuggestedFix,
      overrideRateOnRecommendations,
      verifyPathCompletionRate,
      rollbackRecoverySuccessRate,
      firstChunkP95,
      syncP95,
      boardRenderP95,
      firstChunkSampleCount: firstChunkMs.length,
      syncSampleCount: syncMs.length,
      boardRenderSampleCount: boardRenderMs.length,
    },
    gates: {
      ...gates,
      overallPass:
        gates.verifyPhaseReachPass &&
        gates.bridgeRouteCompletionPass &&
        gates.telemetryEvidencePass &&
        gates.predictivePrecisionPass &&
        gates.falseAlarmRatePass &&
        gates.preventedIncidentRatePass &&
        gates.outcomeTelemetryEvidencePass &&
        gates.timeToFirstConfidentActionP50Pass &&
        gates.firstActionSuccessRatePass &&
        gates.reopenRateAfterSuggestedFixPass &&
        gates.overrideRateOnRecommendationsPass &&
        gates.verifyPathCompletionRatePass &&
        gates.rollbackRecoverySuccessRatePass &&
        gates.reproPackShareRatePass &&
        gates.replayToResolutionRatePass &&
        gates.verifyPackAutopilotReadinessRatePass &&
        gates.releaseReadinessValidationPass &&
        gates.rollbackTelemetryEvidencePass &&
        gates.verifyAutoRollbackSuccessRatePass &&
        gates.falseConfidenceRatePass &&
        gates.firstChunkLatencyPass &&
        gates.syncLatencyPass &&
        gates.boardRenderLatencyPass &&
        gates.telemetryRequiredFieldsPass &&
        gates.telemetrySchemaDriftPass &&
        gates.telemetryScopeMismatchPass,
    },
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  const manifestStatus = options.manifest ? buildManifestStatus(options.manifest) : null;
  if (manifestStatus && !manifestStatus.ok) {
    printManifestFailure(manifestStatus);
    process.exit(1);
  }

  if (manifestStatus) {
    console.log(`[release-stop-gate] Manifest checks passed: ${manifestStatus.name}`);
  }

  const testFiles = uniqueStrings([
    ...DEFAULT_TEST_FILES,
    ...(manifestStatus?.requiredVitestTests || []),
  ]);

  if (options.skipContractChecks) {
    console.log('[release-stop-gate] Contract/parity checks skipped by --skip-contract-checks.');
  } else {
    console.log('[release-stop-gate] Running contract/parity checks...');
    runContractAndParityChecks(testFiles);
  }

  if (options.verifyPackContract) {
    const verifyPackContractStatus = buildVerifyPackContractStatus(options.verifyPackContract);
    console.log('[release-stop-gate] Verify-pack contract result:');
    console.log(JSON.stringify(verifyPackContractStatus, null, 2));

    if (!verifyPackContractStatus.ok) {
      console.error(`[release-stop-gate] Release blocked: ${verifyPackContractStatus.message}`);
      process.exit(1);
    }
  }

  if (options.releaseReadinessCommander) {
    const commanderStatus = buildReleaseReadinessCommanderStatus(options.releaseReadinessCommander);
    console.log('[release-stop-gate] Release readiness commander result:');
    console.log(JSON.stringify(commanderStatus, null, 2));

    if (!commanderStatus.ok) {
      console.error(`[release-stop-gate] Release blocked: ${commanderStatus.message}`);
      process.exit(1);
    }
  }

  if (options.claimChecklistPath) {
    const claimChecklistStatus = buildClaimChecklistStatus(options.claimChecklistPath);
    console.log('[release-stop-gate] Claim checklist result:');
    console.log(JSON.stringify(claimChecklistStatus, null, 2));

    if (options.enforceClaimChecklist && !claimChecklistStatus.ok) {
      console.error(`[release-stop-gate] Release blocked: ${claimChecklistStatus.message}`);
      process.exit(1);
    }
  }

  if (options.issueReportPath) {
    const issueFreshnessStatus = buildOpenIssueReportFreshnessStatus(
      options.issueReportPath,
      options.issueReportMaxAgeHours
    );
    console.log('[release-stop-gate] Open-issue report freshness result:');
    console.log(JSON.stringify(issueFreshnessStatus, null, 2));

    if (options.enforceOpenIssues && !issueFreshnessStatus.ok) {
      console.error(`[release-stop-gate] Release blocked: ${issueFreshnessStatus.message}`);
      process.exit(1);
    }

    const openIssueStatus = buildOpenIssueSeverityStatus(
      options.issueReportPath,
      options.blockedSeverities
    );
    console.log('[release-stop-gate] Open-issue severity result:');
    console.log(JSON.stringify(openIssueStatus, null, 2));

    if (options.enforceOpenIssues && !openIssueStatus.ok) {
      console.error(`[release-stop-gate] Release blocked: ${openIssueStatus.message}`);
      process.exit(1);
    }
  } else if (options.enforceOpenIssues) {
    console.error(
      '[release-stop-gate] Release blocked: --enforce-open-issues requires --issue-report <path> or WORKSPAI_OPEN_ISSUE_REPORT_PATH.'
    );
    process.exit(1);
  }

  if (options.enterpriseGatePath) {
    const enterpriseGateStatus = buildEnterpriseStabilizationGateStatus(options.enterpriseGatePath);
    console.log('[release-stop-gate] Enterprise stabilization gate result:');
    console.log(JSON.stringify(enterpriseGateStatus, null, 2));

    if (options.enforceEnterpriseFreeze && !enterpriseGateStatus.ok) {
      console.error(`[release-stop-gate] Release blocked: ${enterpriseGateStatus.message}`);
      process.exit(1);
    }
  } else if (options.enforceEnterpriseFreeze) {
    console.error(
      '[release-stop-gate] Release blocked: --enforce-enterprise-freeze requires --enterprise-gate <path> or WORKSPAI_ENTERPRISE_GATE_PATH.'
    );
    process.exit(1);
  }

  if (options.releaseNotesPath) {
    const releasePostureStatus = buildReleasePostureLabelStatus(options.releaseNotesPath);
    console.log('[release-stop-gate] Release notes posture result:');
    console.log(JSON.stringify(releasePostureStatus, null, 2));

    if (options.enforceReleasePostureLabel && !releasePostureStatus.ok) {
      console.error(`[release-stop-gate] Release blocked: ${releasePostureStatus.message}`);
      process.exit(1);
    }

    const releaseClaimSafetyStatus = buildReleaseClaimSafetyStatus(options.releaseNotesPath);
    console.log('[release-stop-gate] Release notes claim-safety result:');
    console.log(JSON.stringify(releaseClaimSafetyStatus, null, 2));

    if (options.enforceClaimSafety && !releaseClaimSafetyStatus.ok) {
      console.error(`[release-stop-gate] Release blocked: ${releaseClaimSafetyStatus.message}`);
      process.exit(1);
    }
  } else if (options.enforceReleasePostureLabel) {
    console.error(
      '[release-stop-gate] Release blocked: --enforce-release-posture-label requires --release-notes <path> or WORKSPAI_RELEASE_NOTES_PATH.'
    );
    process.exit(1);
  } else if (options.enforceClaimSafety) {
    console.error(
      '[release-stop-gate] Release blocked: --enforce-claim-safety requires --release-notes <path> or WORKSPAI_RELEASE_NOTES_PATH.'
    );
    process.exit(1);
  }

  if (options.skipKpi) {
    console.log('[release-stop-gate] KPI check skipped by --skip-kpi.');
    return;
  }

  if (!options.marker) {
    console.error(
      '[release-stop-gate] KPI gate requires --marker <path> or WORKSPAI_GATE_MARKER_PATH env var.'
    );
    process.exit(1);
  }

  const markerPath = path.resolve(options.marker);
  if (!fs.existsSync(markerPath)) {
    console.error(`[release-stop-gate] Marker not found: ${markerPath}`);
    process.exit(1);
  }

  const markerFreshness = buildMarkerFreshnessStatus(markerPath, options.markerMaxAgeHours);
  if (markerFreshness.enabled) {
    console.log('[release-stop-gate] Marker freshness result:');
    console.log(JSON.stringify(markerFreshness, null, 2));
  }
  if (!markerFreshness.ok) {
    console.error(`[release-stop-gate] Release blocked: ${markerFreshness.message}`);
    process.exit(1);
  }

  const gateStatus = buildKpiGateStatus(
    markerPath,
    {
      verifyPhaseReachMin: options.verifyPhaseReachMin,
      bridgeRouteCompletionMin: options.bridgeRouteCompletionMin,
      predictivePrecisionMin: options.predictivePrecisionMin,
      falseAlarmRateMax: options.falseAlarmRateMax,
      preventedIncidentRateMin: options.preventedIncidentRateMin,
      reproPackShareRateMin: options.reproPackShareRateMin,
      replayToResolutionRateMin: options.replayToResolutionRateMin,
      verifyAutoRollbackSuccessRateMin: options.verifyAutoRollbackSuccessRateMin,
      falseConfidenceRateMax: options.falseConfidenceRateMax,
      maxTimeToFirstConfidentActionP50Ms: options.maxTimeToFirstConfidentActionP50Ms,
      minFirstActionSuccessRate: options.minFirstActionSuccessRate,
      maxReopenRateAfterSuggestedFix: options.maxReopenRateAfterSuggestedFix,
      maxOverrideRateOnRecommendations: options.maxOverrideRateOnRecommendations,
      minVerifyPathCompletionRate: options.minVerifyPathCompletionRate,
      minRollbackRecoverySuccessRate: options.minRollbackRecoverySuccessRate,
      verifyPackAutopilotReadinessRateMin: options.verifyPackAutopilotReadinessRateMin,
      firstChunkLatencyP95MaxMs: options.firstChunkLatencyP95MaxMs,
      syncLatencyP95MaxMs: options.syncLatencyP95MaxMs,
      boardRenderLatencyP95MaxMs: options.boardRenderLatencyP95MaxMs,
    },
    {
      predictiveCalibrationMode: options.predictiveCalibrationMode,
      productionWindows: options.productionWindows,
      productionWindowsMinForTightening: options.productionWindowsMinForTightening,
      predictionShownMinForTightening: options.predictionShownMinForTightening,
      predictionOutcomesMinForTightening: options.predictionOutcomesMinForTightening,
      predictivePrecisionTightenedMin: options.predictivePrecisionTightenedMin,
      falseAlarmRateTightenedMax: options.falseAlarmRateTightenedMax,
      preventedIncidentRateTightenedMin: options.preventedIncidentRateTightenedMin,
      verifyPackAutopilotReadinessMode: options.verifyPackAutopilotReadinessMode,
      verifyPackAutopilotGeneratedMinForEnforcement:
        options.verifyPackAutopilotGeneratedMinForEnforcement,
      releaseReadinessValidationMode: options.releaseReadinessValidationMode,
      releaseReadinessArtifactsMinForEnforcement:
        options.releaseReadinessArtifactsMinForEnforcement,
      releaseReadinessDecisionsMinForEnforcement:
        options.releaseReadinessDecisionsMinForEnforcement,
      releaseReadinessDecisionAccuracyMin: options.releaseReadinessDecisionAccuracyMin,
      releaseReadinessNoGoPreventedIncidentRateMin:
        options.releaseReadinessNoGoPreventedIncidentRateMin,
    }
  );

  console.log('[release-stop-gate] KPI gate result:');
  console.log(JSON.stringify(gateStatus, null, 2));

  const verifyPackRollout = gateStatus.verifyPackReadinessRollout;
  if (
    verifyPackRollout &&
    verifyPackRollout.thresholdEnabled &&
    verifyPackRollout.wouldPass === false &&
    verifyPackRollout.enforced === false
  ) {
    console.warn(
      `[release-stop-gate] Verify-pack readiness below threshold but not enforced (mode=${verifyPackRollout.mode}, evidenceEnough=${verifyPackRollout.evidenceEnoughForEnforcement}).`
    );
  }

  const releaseReadinessRollout = gateStatus.releaseReadinessValidationRollout;
  if (
    releaseReadinessRollout &&
    releaseReadinessRollout.wouldPass === false &&
    releaseReadinessRollout.enforced === false &&
    releaseReadinessRollout.mode !== 'off' &&
    releaseReadinessRollout.mode !== 'warn'
  ) {
    console.warn(
      `[release-stop-gate] Release-readiness validation below threshold but not enforced (mode=${releaseReadinessRollout.mode}, evidenceEnough=${releaseReadinessRollout.evidenceEnoughForEnforcement}).`
    );
  }

  if (!gateStatus.gates.overallPass) {
    const override = validateOverrideInput(options);
    if (override?.ok) {
      const logPath = appendOverrideLog({
        kind: 'release_gate_override',
        at: toIsoNow(),
        owner: override.owner,
        ticket: override.ticket,
        reason: override.reason,
        gateStatus,
      });

      console.warn(
        `[release-stop-gate] KPI hard-gate override accepted for ticket ${override.ticket} by ${override.owner}.`
      );
      console.warn(`[release-stop-gate] Override logged at: ${logPath}`);
      return;
    }

    if (override && !override.ok) {
      console.error(`[release-stop-gate] ${override.message}`);
    }
    console.error('[release-stop-gate] Release blocked: KPI hard-gate failed.');
    process.exit(1);
  }

  console.log('[release-stop-gate] All release stop conditions passed.');
}

export {
  buildKpiGateStatus,
  buildOpenIssueReportFreshnessStatus,
  buildOpenIssueSeverityStatus,
  buildReleaseClaimSafetyStatus,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

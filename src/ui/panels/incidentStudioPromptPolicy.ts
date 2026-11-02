export type IncidentActionRiskClass =
  | 'informational'
  | 'non-mutating-executable'
  | 'guarded-mutating'
  | 'high-risk-mutating';

export type IncidentActionRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type IncidentActionRiskPolicy = {
  actionType: string;
  riskClass: IncidentActionRiskClass;
  riskLevel: IncidentActionRiskLevel;
  requiresImpactReview: boolean;
  requiresVerifyPath: boolean;
  allowCompletionClaimWithoutVerify: boolean;
};

const INCIDENT_ACTION_ALLOWLIST = new Set<string>([
  'change-impact-lite',
  'terminal-bridge',
  'fix-preview-lite',
  'workspace-memory-wizard',
  'doctor-fix',
  'recipe-pack',
  'verify-pack-autopilot',
  'inline-command',
  // KF5: capture a reproducible incident pack + replay payload
  'incident-repro-pack',
  // A02: multi-file module generation + apply workflow
  'apply-module-gen',
  // A03: debug patch generation + policy-gated apply workflow
  'apply-debug-patch',
  // KF9: release readiness decision artifact (go/no-go)
  'release-readiness-commander',
  // VSC-1119: browser-driven UI smoke test using VS Code browser agent tools
  'browser-smoke-test',
]);

export function isIncidentActionAllowlisted(actionType: string): boolean {
  const normalized = String(actionType || '')
    .trim()
    .toLowerCase();
  return INCIDENT_ACTION_ALLOWLIST.has(normalized);
}

export function classifyIncidentActionPolicy(actionType: string): IncidentActionRiskPolicy {
  const normalized = String(actionType || '')
    .trim()
    .toLowerCase();

  switch (normalized) {
    case 'change-impact-lite':
      return {
        actionType: normalized,
        riskClass: 'informational',
        riskLevel: 'medium',
        requiresImpactReview: false,
        requiresVerifyPath: false,
        allowCompletionClaimWithoutVerify: true,
      };
    case 'terminal-bridge':
    case 'fix-preview-lite':
    case 'workspace-memory-wizard':
    case 'doctor-fix':
    case 'recipe-pack':
    case 'verify-pack-autopilot':
    case 'incident-repro-pack':
    case 'release-readiness-commander':
    case 'browser-smoke-test':
      return {
        actionType: normalized,
        riskClass: 'non-mutating-executable',
        riskLevel:
          normalized === 'doctor-fix' ||
          normalized === 'verify-pack-autopilot' ||
          normalized === 'incident-repro-pack' ||
          normalized === 'release-readiness-commander'
            ? 'medium'
            : 'low',
        requiresImpactReview: false,
        requiresVerifyPath:
          normalized === 'doctor-fix' ||
          normalized === 'verify-pack-autopilot' ||
          normalized === 'incident-repro-pack' ||
          normalized === 'release-readiness-commander' ||
          normalized === 'browser-smoke-test',
        allowCompletionClaimWithoutVerify:
          normalized !== 'doctor-fix' &&
          normalized !== 'verify-pack-autopilot' &&
          normalized !== 'incident-repro-pack' &&
          normalized !== 'release-readiness-commander' &&
          normalized !== 'browser-smoke-test',
      };
    case 'inline-command':
      return {
        actionType: normalized,
        riskClass: 'guarded-mutating',
        riskLevel: 'high',
        requiresImpactReview: true,
        requiresVerifyPath: true,
        allowCompletionClaimWithoutVerify: false,
      };
    case 'apply-module-gen':
      return {
        actionType: normalized,
        riskClass: 'guarded-mutating',
        riskLevel: 'medium',
        requiresImpactReview: true,
        requiresVerifyPath: true,
        allowCompletionClaimWithoutVerify: false,
      };
    case 'apply-debug-patch':
      return {
        actionType: normalized,
        riskClass: 'guarded-mutating',
        riskLevel: 'high',
        requiresImpactReview: true,
        requiresVerifyPath: true,
        allowCompletionClaimWithoutVerify: false,
      };
    default:
      return {
        actionType: normalized || 'unknown',
        riskClass: 'high-risk-mutating',
        riskLevel: 'critical',
        requiresImpactReview: true,
        requiresVerifyPath: true,
        allowCompletionClaimWithoutVerify: false,
      };
  }
}

export function buildIncidentFirstResponseRules(input: {
  projectScoped: boolean;
  hasDoctorEvidence: boolean;
  framework?: string;
}): string[] {
  if (!input.projectScoped) {
    return [];
  }

  const rules: string[] = [
    'FIRST RESPONSE POLICY: Assume the user may be non-technical and needs a launch roadmap, not abstract architecture commentary.',
    'In `What happened`, begin with plain-language stage text: `Stage: <blocked|setup|ready-to-run>` and one sentence explaining current state.',
    'In `Why`, avoid jargon. If a technical term is necessary, explain it in simple words in the same line.',
    'In `Next command`, output one practical command that advances the user exactly one step toward a running service.',
    'Use this sequence explicitly when relevant: install dependencies -> init -> dev -> verify.',
    'If the project is blocked, name the blocker first, then the exact command or setup action to remove it.',
  ];

  if (!input.hasDoctorEvidence) {
    rules.push(
      'No doctor evidence exists yet. Do not default to generic workspace advice; infer launch readiness from selected project files and framework blockers.'
    );
  }

  if (input.framework === 'springboot') {
    rules.push(
      'For Spring Boot, prioritize wrapper/build-tool readiness and never recommend `rapidkit dev` before Maven/Gradle prerequisites are satisfied.'
    );
  }

  if (
    input.framework === 'agent' ||
    input.framework === 'microsoft-agent-framework' ||
    input.framework === 'openai-agents' ||
    input.framework === 'google-adk'
  ) {
    rules.push(
      'For a governed agent project, treat Workspai context sync and offline adapter verification as prerequisites. Do not recommend a provider call until both pass and explicit network access is granted.'
    );
  }

  return rules;
}

// ---------------------------------------------------------------------------
// Confidence labeling — maps architecture scope assessment to a human label
// ---------------------------------------------------------------------------

export type IncidentDiagnosisConfidenceLabel = 'high' | 'medium' | 'low' | 'unknown';

export function labelDiagnosisConfidence(
  scopeCoverage: 'known' | 'partial' | 'unknown' | undefined,
  scopeConfidenceScore: number | undefined
): IncidentDiagnosisConfidenceLabel {
  if (scopeCoverage === undefined || scopeConfidenceScore === undefined) {
    return 'unknown';
  }
  if (scopeCoverage === 'unknown') {
    return scopeConfidenceScore >= 0.45 ? 'low' : 'unknown';
  }
  if (scopeCoverage === 'known' && scopeConfidenceScore >= 0.75) {
    return 'high';
  }
  if (scopeConfidenceScore >= 0.45) {
    return 'medium';
  }
  return 'low';
}

// ---------------------------------------------------------------------------
// Verify completeness — flags verify-required actions missing a checklist
// ---------------------------------------------------------------------------

export type VerifyCompletenessAssessment = {
  adequate: boolean;
  reason: string | null;
};

function isActionableVerifyStep(step: string): boolean {
  const normalized = step.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const nonActionablePatterns = [
    /^no blocking verify checks detected/i,
    /^scope is uncertain\./i,
    /^review workspai contract warnings:/i,
  ];
  if (nonActionablePatterns.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  return /\b(run|npm|pnpm|yarn|pytest|jest|vitest|go test|mvn|gradle|rapidkit|python|poetry|cargo)\b/i.test(
    normalized
  );
}

export function assessVerifyCompleteness(
  policy: Pick<IncidentActionRiskPolicy, 'requiresVerifyPath'>,
  verifyChecklist: string[]
): VerifyCompletenessAssessment {
  if (!policy.requiresVerifyPath) {
    return { adequate: true, reason: null };
  }
  const nonEmpty = verifyChecklist.filter((item) => item.trim().length > 0);
  if (nonEmpty.length === 0) {
    return {
      adequate: false,
      reason:
        'Verify checklist is missing: mutating actions require at least one explicit verify step before completion can be claimed.',
    };
  }

  const actionableSteps = nonEmpty.filter((item) => isActionableVerifyStep(item));
  if (actionableSteps.length === 0) {
    return {
      adequate: false,
      reason:
        'Verify checklist is incomplete: include at least one executable verify command (for example: pnpm test, pytest, rapidkit doctor) before completion can be claimed.',
    };
  }

  return { adequate: true, reason: null };
}

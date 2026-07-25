export type AIOutputScenario =
  | 'ask'
  | 'debug'
  | 'incident-project'
  | 'incident-workspace'
  | 'release-project'
  | 'release-workspace'
  | 'command-failure';

export interface AIOutputQualityViolation {
  rule: string;
  severity: 'error' | 'warning';
  detail: string;
}

export interface AIOutputQualityResult {
  isAcceptable: boolean;
  violations: AIOutputQualityViolation[];
}

const PREMATURE_CLAIM_PATTERN =
  /\b(fixed|resolved|complete|completed|done|production[- ]ready|ship(?:ped|pable)?|safe to ship|ready to deploy)\b/i;

const EVIDENCE_PATTERN =
  /\b(evidence|doctor|verified|verify|test|log|trace|file|path|diff|report|artifact|assumption)\b/i;

const VERIFY_PATTERN = /\b(verify|verification|test|doctor|smoke|check)\b/i;

const ROLLBACK_PATTERN = /\b(rollback|revert|undo|restore|back out)\b/i;

const EXECUTION_CONTEXT_PATTERN =
  /\b(run from|execution directory|working directory|workspace root|project root|cd\s+[`"']?[^`"'\n]+)\b/i;

const NEXT_SAFE_STEP_PATTERN =
  /\b(next safe step|recommended next safe step|next command|next action)\b/i;

const GO_NO_GO_PATTERN = /\b(GO|NO-GO|NO GO)\b/i;

type ScenarioRuleSet = {
  requiredPatterns: Array<{ rule: string; pattern: RegExp; detail: string }>;
  mutating: boolean;
  release?: boolean;
};

const SCENARIO_RULES: Record<AIOutputScenario, ScenarioRuleSet> = {
  ask: {
    mutating: false,
    requiredPatterns: [
      {
        rule: 'MISSING_ANSWER',
        pattern: /\b(answer|recommendation)\b/i,
        detail: 'Answer section is missing.',
      },
      {
        rule: 'MISSING_EVIDENCE',
        pattern: EVIDENCE_PATTERN,
        detail: 'Evidence or assumptions are missing.',
      },
      {
        rule: 'MISSING_NEXT_SAFE_STEP',
        pattern: NEXT_SAFE_STEP_PATTERN,
        detail: 'Next safe step is missing.',
      },
      {
        rule: 'MISSING_VERIFICATION',
        pattern: VERIFY_PATTERN,
        detail: 'Verification path is missing.',
      },
    ],
  },
  debug: {
    mutating: true,
    requiredPatterns: [
      {
        rule: 'MISSING_DIAGNOSIS',
        pattern: /\b(diagnosis|root cause|what failed)\b/i,
        detail: 'Diagnosis is missing.',
      },
      { rule: 'MISSING_EVIDENCE', pattern: EVIDENCE_PATTERN, detail: 'Debug evidence is missing.' },
      {
        rule: 'MISSING_FIX_PLAN',
        pattern: /\b(fix plan|minimal safe change|patch)\b/i,
        detail: 'Fix plan is missing.',
      },
      { rule: 'MISSING_VERIFICATION', pattern: VERIFY_PATTERN, detail: 'Verify step is missing.' },
    ],
  },
  'incident-project': {
    mutating: true,
    requiredPatterns: [
      {
        rule: 'MISSING_WHAT_HAPPENED',
        pattern: /what happened:/i,
        detail: 'Incident summary is missing.',
      },
      { rule: 'MISSING_WHY', pattern: /why:/i, detail: 'Incident reasoning is missing.' },
      {
        rule: 'MISSING_NEXT_COMMAND',
        pattern: /next command:/i,
        detail: 'Next command is missing.',
      },
      {
        rule: 'MISSING_VERIFY_COMMAND',
        pattern: /verify command:/i,
        detail: 'Verify command is missing.',
      },
      { rule: 'MISSING_ASSUMPTIONS', pattern: /assumptions:/i, detail: 'Assumptions are missing.' },
    ],
  },
  'incident-workspace': {
    mutating: true,
    requiredPatterns: [
      {
        rule: 'MISSING_WORKSPACE_STATUS',
        pattern: /workspace status:/i,
        detail: 'Workspace status is missing.',
      },
      {
        rule: 'MISSING_PRIORITY_ISSUES',
        pattern: /priority issues:/i,
        detail: 'Priority issues are missing.',
      },
      {
        rule: 'MISSING_RECOMMENDED_ACTION',
        pattern: /recommended action:/i,
        detail: 'Recommended action is missing.',
      },
      {
        rule: 'MISSING_VERIFICATION',
        pattern: /verification:/i,
        detail: 'Verification is missing.',
      },
      { rule: 'MISSING_ASSUMPTIONS', pattern: /assumptions:/i, detail: 'Assumptions are missing.' },
    ],
  },
  'release-project': {
    mutating: true,
    release: true,
    requiredPatterns: [
      {
        rule: 'MISSING_DECISION',
        pattern: GO_NO_GO_PATTERN,
        detail: 'GO / NO-GO decision is missing.',
      },
      {
        rule: 'MISSING_BLOCKERS',
        pattern: /blocking reasons?:/i,
        detail: 'Blocking reasons are missing.',
      },
      {
        rule: 'MISSING_EVIDENCE',
        pattern: /evidence summary:/i,
        detail: 'Evidence summary is missing.',
      },
      {
        rule: 'MISSING_NEXT_SAFE_STEP',
        pattern: /recommended next safe step:/i,
        detail: 'Recommended next safe step is missing.',
      },
    ],
  },
  'release-workspace': {
    mutating: true,
    release: true,
    requiredPatterns: [
      {
        rule: 'MISSING_DECISION',
        pattern: GO_NO_GO_PATTERN,
        detail: 'Workspace GO / NO-GO decision is missing.',
      },
      {
        rule: 'MISSING_PER_PROJECT_STATUS',
        pattern: /per-project status:/i,
        detail: 'Per-project status is missing.',
      },
      {
        rule: 'MISSING_CROSS_PROJECT_BLOCKERS',
        pattern: /cross-project blockers:/i,
        detail: 'Cross-project blockers are missing.',
      },
      {
        rule: 'MISSING_EVIDENCE',
        pattern: /evidence summary:/i,
        detail: 'Evidence summary is missing.',
      },
      {
        rule: 'MISSING_NEXT_SAFE_STEP',
        pattern: /recommended next safe step:/i,
        detail: 'Recommended next safe step is missing.',
      },
    ],
  },
  'command-failure': {
    mutating: true,
    requiredPatterns: [
      {
        rule: 'MISSING_FAILURE',
        pattern: /\b(failing command|command failed|exit code|stderr)\b/i,
        detail: 'Failing command is missing.',
      },
      {
        rule: 'MISSING_EVIDENCE',
        pattern: EVIDENCE_PATTERN,
        detail: 'Command evidence is missing.',
      },
      {
        rule: 'MISSING_EXECUTION_CONTEXT',
        pattern: EXECUTION_CONTEXT_PATTERN,
        detail: 'Execution directory is missing.',
      },
      {
        rule: 'MISSING_NEXT_SAFE_STEP',
        pattern: NEXT_SAFE_STEP_PATTERN,
        detail: 'Next safe step is missing.',
      },
      {
        rule: 'MISSING_VERIFICATION',
        pattern: VERIFY_PATTERN,
        detail: 'Verification command is missing.',
      },
    ],
  },
};

export function getAIOutputQualityContract(mode: 'ask' | 'debug', kitLabel: string): string {
  const commonRules = [
    'OUTPUT QUALITY CONTRACT:',
    '- Lead with the answer, then the evidence. Do not bury the recommendation.',
    '- Separate verified facts from assumptions. Mark assumptions explicitly.',
    '- Every command must include the correct execution directory: workspace root or project root.',
    '- Do not claim fixed, shipped, production-ready, or complete unless verification evidence is already present.',
    '- For mutating advice, include the safest next step, a deterministic verify command, and rollback note.',
    '- If the context is insufficient, ask for the missing evidence instead of guessing.',
    '- DOMAIN feature module questions → scaffold like src/examples/; CATALOG module questions → npx workspai add module <slug>. Never mix.',
    '- Do not recommend /api routes for NestJS unless setGlobalPrefix or existing controllers use that prefix.',
    '- Do not recommend Docker/K8s/uvicorn deploy when analyze shows no Dockerfile and no src/main entrypoint.',
  ];

  if (mode === 'debug') {
    return [
      ...commonRules,
      '',
      'Use this structure:',
      '## Diagnosis',
      '- What failed, where, and why this is the most likely cause.',
      '## Evidence',
      '- File paths, doctor evidence, runtime signals, or clearly marked assumptions.',
      '## Fix Plan',
      '- Minimal safe change first. Include code only when it is directly useful.',
      '## Verify',
      '- One deterministic command or file check to prove the fix.',
      '## Rollback',
      '- How to undo the change or return to the previous safe state.',
    ].join('\n');
  }

  return [
    ...commonRules,
    '',
    'Use this structure:',
    '## Answer',
    `- Direct answer for this ${kitLabel} context.`,
    '## Evidence',
    '- What the current project/workspace evidence shows.',
    '## Next Safe Step',
    '- The next action with exact command/location when applicable.',
    '## Verification',
    '- How the user proves the recommendation is correct.',
    '## Assumptions',
    '- Only list assumptions that remain unresolved.',
  ].join('\n');
}

export function validateAIOutputQuality(
  response: string,
  scenario: AIOutputScenario
): AIOutputQualityResult {
  const text = response.trim();
  const violations: AIOutputQualityViolation[] = [];
  const ruleSet = SCENARIO_RULES[scenario];

  if (!text) {
    return {
      isAcceptable: false,
      violations: [
        {
          rule: 'EMPTY_OUTPUT',
          severity: 'error',
          detail: 'AI output is empty.',
        },
      ],
    };
  }

  for (const requirement of ruleSet.requiredPatterns) {
    if (!requirement.pattern.test(text)) {
      violations.push({
        rule: requirement.rule,
        severity: 'error',
        detail: requirement.detail,
      });
    }
  }

  if (ruleSet.mutating && !ROLLBACK_PATTERN.test(text)) {
    violations.push({
      rule: 'MISSING_ROLLBACK_PATH',
      severity: 'error',
      detail: 'Mutating guidance must include rollback, revert, undo, or restore instructions.',
    });
  }

  if (ruleSet.mutating && !EXECUTION_CONTEXT_PATTERN.test(text)) {
    violations.push({
      rule: 'MISSING_EXECUTION_CONTEXT',
      severity: 'error',
      detail: 'Mutating guidance must state workspace root or project root execution context.',
    });
  }

  if (PREMATURE_CLAIM_PATTERN.test(text) && !hasVerificationEvidence(text)) {
    violations.push({
      rule: 'PREMATURE_SUCCESS_CLAIM',
      severity: 'error',
      detail: 'Success, release, or completion claims require verification evidence.',
    });
  }

  if (
    ruleSet.release &&
    hasPositiveGoDecision(text) &&
    /\b(unavailable|unknown|missing|unresolved|failed)\b/i.test(text)
  ) {
    violations.push({
      rule: 'GO_DECISION_WITH_UNRESOLVED_EVIDENCE',
      severity: 'error',
      detail:
        'GO decisions cannot include unresolved, failed, unknown, missing, or unavailable evidence.',
    });
  }

  return {
    isAcceptable: !violations.some((violation) => violation.severity === 'error'),
    violations,
  };
}

function hasVerificationEvidence(text: string): boolean {
  return (
    /\b(verified by|verification passed|tests passed|doctor passed|smoke passed|evidence:|artifact:)\b/i.test(
      text
    ) && VERIFY_PATTERN.test(text)
  );
}

function hasPositiveGoDecision(text: string): boolean {
  const decisionLine = text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /\b(workspace decision|decision)\b/i.test(line));

  if (!decisionLine) {
    return false;
  }

  return /\bGO\b/i.test(decisionLine) && !/\bNO[- ]?GO\b/i.test(decisionLine);
}

export const VERIFIED_GOAL_KINDS = [
  'release-readiness',
  'dependency-security',
  'test-coverage',
] as const;

export type VerifiedGoalKind = (typeof VERIFIED_GOAL_KINDS)[number];

export type VerifiedGoalIntent = {
  kind: VerifiedGoalKind;
  scope: 'workspace' | 'project';
  target?: number;
  constraints: {
    allowBreakingChanges: false;
    allowForce: false;
    requireBuild: true;
    requireTests: true;
  };
  confidence: 'high' | 'medium';
};

export type VerifiedGoalContractPayload = {
  schemaVersion: 'workspai.verified-goal.v1';
  id: string;
  fingerprint: string;
  createdAt: string;
  updatedAt: string;
  workspace: {
    name: string;
    path: string;
  };
  kind: VerifiedGoalKind;
  summary: string;
  scope: {
    kind: 'workspace' | 'project' | 'project-set';
    projectName?: string;
    projectPath?: string;
    projects?: Array<{ projectName: string; projectPath: string }>;
  };
  constraints: {
    allowBreakingChanges: boolean;
    allowForce: boolean;
    requireBuild: boolean;
    requireTests: boolean;
  };
  criteria: Record<string, unknown>;
  baseline: {
    measuredAt: string;
    value: number | null;
    target: number | null;
    unit: 'percent' | 'blocking-vulnerabilities' | 'gates' | 'unknown';
    status: 'satisfied' | 'unsatisfied' | 'unavailable';
    evidencePaths: string[];
    message: string;
  };
  dependencySafetyBaseline?: {
    manifests: Array<{
      path: string;
      ecosystem: string;
      sha256: string;
      dependencies?: Record<string, string>;
    }>;
  };
  artifactPaths: {
    goal: string;
    status: string;
    latestReport: string;
  };
};

const RELEASE_PATTERN =
  /\b(?:release|ship|production[- ]ready|readiness)\b|(?:\u{622}\u{645}\u{627}\u{62f}\u{647}|\u{645}\u{647}\u{6cc}\u{627}).{0,24}(?:\u{627}\u{646}\u{62a}\u{634}\u{627}\u{631}|\u{631}\u{6cc}\u{644}\u{6cc}\u{632})|(?:\u{627}\u{646}\u{62a}\u{634}\u{627}\u{631}|\u{631}\u{6cc}\u{644}\u{6cc}\u{632}).{0,24}(?:\u{622}\u{645}\u{627}\u{62f}\u{647}|\u{645}\u{647}\u{6cc}\u{627})/iu;
const SECURITY_PATTERN =
  /\b(?:vulnerabilit(?:y|ies)|dependency security|security findings?|npm audit|dependency audit)\b|\u{622}\u{633}\u{6cc}\u{628}[\s\u{200c}-]*\u{67e}\u{630}\u{6cc}\u{631}|\u{627}\u{645}\u{646}\u{6cc}\u{62a}.{0,20}(?:\u{648}\u{627}\u{628}\u{633}\u{62a}\u{6af}\u{6cc}|\u{67e}\u{6a9}\u{6cc}\u{62c})|\u{648}\u{627}\u{628}\u{633}\u{62a}\u{6af}\u{6cc}.{0,20}(?:\u{627}\u{645}\u{646}\u{6cc}\u{62a}|\u{622}\u{633}\u{6cc}\u{628})/iu;
const REPAIR_PATTERN =
  /\b(?:fix|repair|resolve|remove|reduce|upgrade|remediate)\b|\u{631}\u{641}\u{639}|\u{628}\u{631}\u{637}\u{631}\u{641}|\u{627}\u{635}\u{644}\u{627}\u{62d}|\u{62d}\u{644}|\u{622}\u{67e}\u{62f}\u{6cc}\u{62a}|\u{627}\u{631}\u{62a}\u{642}\u{627}/iu;
const COVERAGE_PATTERN =
  /\b(?:test )?coverage\b|(?:\u{62f}\u{631}\u{635}\u{62f} )?\u{67e}\u{648}\u{634}\u{634}(?: \u{62a}\u{633}\u{62a})?|\u{6a9}\u{627}\u{648}\u{631}\u{62c}/iu;

function coverageTarget(task: string): number | null {
  const normalizedDigits = task.replace(/[\u{6f0}-\u{6f9}\u{660}-\u{669}]/gu, (digit) => {
    const persian =
      '\u{6f0}\u{6f1}\u{6f2}\u{6f3}\u{6f4}\u{6f5}\u{6f6}\u{6f7}\u{6f8}\u{6f9}'.indexOf(digit);
    if (persian >= 0) {
      return String(persian);
    }
    return String(
      '\u{660}\u{661}\u{662}\u{663}\u{664}\u{665}\u{666}\u{667}\u{668}\u{669}'.indexOf(digit)
    );
  });
  const explicit = normalizedDigits.match(
    /(?:coverage|\u{6a9}\u{627}\u{648}\u{631}\u{62c}|\u{67e}\u{648}\u{634}\u{634}(?: \u{62a}\u{633}\u{62a})?)\D{0,24}(\d{1,3})(?:\s*%|\u{66a}|percent|\u{62f}\u{631}\u{635}\u{62f})?/iu
  );
  const reversed = normalizedDigits.match(
    /(\d{1,3})(?:\s*%|\u{66a}|percent|\u{62f}\u{631}\u{635}\u{62f}).{0,24}(?:coverage|\u{6a9}\u{627}\u{648}\u{631}\u{62c}|\u{67e}\u{648}\u{634}\u{634}(?: \u{62a}\u{633}\u{62a})?)/iu
  );
  const raw = explicit?.[1] ?? reversed?.[1];
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

/**
 * Deterministic intent recognition is intentionally narrow. A vague coding
 * request stays a normal Assistant task; only requests with an explicit,
 * measurable engineering outcome become durable verified goals.
 */
export function inferVerifiedGoalIntent(input: {
  task: string;
  hasProjectScope: boolean;
}): VerifiedGoalIntent | null {
  const task = input.task.trim();
  if (!task) {
    return null;
  }
  const constraints = {
    allowBreakingChanges: false,
    allowForce: false,
    requireBuild: true,
    requireTests: true,
  } as const;
  const target = coverageTarget(task);
  if (COVERAGE_PATTERN.test(task) && target !== null) {
    return {
      kind: 'test-coverage',
      scope: input.hasProjectScope ? 'project' : 'workspace',
      target,
      constraints,
      confidence: 'high',
    };
  }
  if (SECURITY_PATTERN.test(task) && REPAIR_PATTERN.test(task)) {
    return {
      kind: 'dependency-security',
      scope: input.hasProjectScope ? 'project' : 'workspace',
      constraints,
      confidence: 'high',
    };
  }
  if (RELEASE_PATTERN.test(task)) {
    return {
      kind: 'release-readiness',
      scope: 'workspace',
      constraints,
      confidence: 'high',
    };
  }
  return null;
}

export function verifiedGoalPlanArgs(input: {
  intent: VerifiedGoalIntent;
  projectName?: string;
}): string[] {
  const args = ['workspace', 'goal', 'plan', input.intent.kind];
  if (input.intent.scope === 'project' && input.projectName) {
    args.push('--scope', `project:${input.projectName}`);
  }
  if (input.intent.target !== undefined) {
    args.push('--target', String(input.intent.target));
  }
  args.push('--json');
  return args;
}

export function verifiedGoalVerifyArgs(goalId: string): string[] {
  if (!/^goal-[a-z0-9._-]+$/i.test(goalId)) {
    throw new Error('Verified goal id is invalid.');
  }
  return ['workspace', 'goal', 'verify', goalId, '--reuse-intelligence', '--json'];
}

export function parseVerifiedGoalPlanResult(value: unknown): {
  goal: VerifiedGoalContractPayload;
  status: {
    goalId: string;
    state: string;
    progress?: { message?: string };
    blockingReasons?: string[];
  };
  resumed: boolean;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Workspai CLI did not return a verified goal plan.');
  }
  const record = value as Record<string, unknown>;
  const goal = parseVerifiedGoalContract(record.goal);
  const status = record.status as Record<string, unknown> | undefined;
  if (!goal || !status || status.goalId !== goal.id || typeof status.state !== 'string') {
    throw new Error('Workspai CLI returned an incompatible verified goal contract.');
  }
  return {
    goal,
    status: status as {
      goalId: string;
      state: string;
      progress?: { message?: string };
      blockingReasons?: string[];
    },
    resumed: record.resumed === true,
  };
}

export function parseVerifiedGoalContract(value: unknown): VerifiedGoalContractPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const goal = value as Record<string, unknown>;
  const workspace = goal.workspace as Record<string, unknown> | undefined;
  const scope = goal.scope as Record<string, unknown> | undefined;
  const constraints = goal.constraints as Record<string, unknown> | undefined;
  const baseline = goal.baseline as Record<string, unknown> | undefined;
  const artifactPaths = goal.artifactPaths as Record<string, unknown> | undefined;
  if (
    goal.schemaVersion !== 'workspai.verified-goal.v1' ||
    typeof goal.id !== 'string' ||
    !/^goal-[a-z0-9._-]+$/i.test(goal.id) ||
    typeof goal.fingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/.test(goal.fingerprint) ||
    typeof goal.createdAt !== 'string' ||
    Number.isNaN(Date.parse(goal.createdAt)) ||
    typeof goal.updatedAt !== 'string' ||
    Number.isNaN(Date.parse(goal.updatedAt)) ||
    !workspace ||
    typeof workspace.name !== 'string' ||
    typeof workspace.path !== 'string' ||
    !VERIFIED_GOAL_KINDS.includes(goal.kind as VerifiedGoalKind) ||
    typeof goal.summary !== 'string' ||
    !scope ||
    !['workspace', 'project', 'project-set'].includes(String(scope.kind)) ||
    (scope.kind === 'project' &&
      (typeof scope.projectName !== 'string' ||
        !scope.projectName.trim() ||
        typeof scope.projectPath !== 'string' ||
        !scope.projectPath.trim())) ||
    (scope.kind === 'project-set' &&
      (!Array.isArray(scope.projects) ||
        scope.projects.length < 2 ||
        scope.projects.some(
          (entry) =>
            !entry ||
            typeof entry !== 'object' ||
            Array.isArray(entry) ||
            typeof (entry as Record<string, unknown>).projectName !== 'string' ||
            typeof (entry as Record<string, unknown>).projectPath !== 'string'
        ) ||
        new Set(scope.projects.map((entry) => (entry as Record<string, unknown>).projectName))
          .size !== scope.projects.length ||
        new Set(scope.projects.map((entry) => (entry as Record<string, unknown>).projectPath))
          .size !== scope.projects.length)) ||
    !constraints ||
    typeof constraints.allowBreakingChanges !== 'boolean' ||
    typeof constraints.allowForce !== 'boolean' ||
    typeof constraints.requireBuild !== 'boolean' ||
    typeof constraints.requireTests !== 'boolean' ||
    !goal.criteria ||
    typeof goal.criteria !== 'object' ||
    !baseline ||
    typeof baseline.measuredAt !== 'string' ||
    !['percent', 'blocking-vulnerabilities', 'gates', 'unknown'].includes(String(baseline.unit)) ||
    !['satisfied', 'unsatisfied', 'unavailable'].includes(String(baseline.status)) ||
    !Array.isArray(baseline.evidencePaths) ||
    !baseline.evidencePaths.every((entry) => typeof entry === 'string') ||
    typeof baseline.message !== 'string' ||
    !artifactPaths ||
    typeof artifactPaths.goal !== 'string' ||
    typeof artifactPaths.status !== 'string' ||
    typeof artifactPaths.latestReport !== 'string'
  ) {
    return null;
  }
  return goal as unknown as VerifiedGoalContractPayload;
}

export type VerifiedGoalStatusPayload = {
  schemaVersion?: string;
  goalId: string;
  state: string;
  attempt?: number;
  progress?: { message?: string };
  blockingReasons?: string[];
  checks?: unknown[];
  artifactPath?: string;
};

export function parseVerifiedGoalVerifyResult(value: unknown): {
  goal?: VerifiedGoalContractPayload;
  status: VerifiedGoalStatusPayload;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Workspai CLI did not return verified goal status.');
  }
  const record = value as Record<string, unknown>;
  const status =
    record.status && typeof record.status === 'object' && !Array.isArray(record.status)
      ? (record.status as Record<string, unknown>)
      : record;
  if (typeof status.goalId !== 'string' || typeof status.state !== 'string') {
    throw new Error('Workspai CLI returned incompatible verified goal status.');
  }
  const goal =
    record.goal && typeof record.goal === 'object' && !Array.isArray(record.goal)
      ? parseVerifiedGoalContract(record.goal)
      : undefined;
  return {
    ...(goal ? { goal } : {}),
    status: status as unknown as VerifiedGoalStatusPayload,
  };
}

export function assertVerifiedGoalCommandSafety(input: {
  goal: VerifiedGoalContractPayload;
  executable: string;
  args: readonly string[];
}): void {
  if (
    !input.goal.constraints.allowForce &&
    input.args.some((argument) =>
      ['--force', '-f', '--legacy-peer-deps', '--ignore-platform-reqs'].includes(
        argument.toLowerCase()
      )
    )
  ) {
    throw new Error('The verified goal contract forbids force-based dependency repair.');
  }
  if (
    input.goal.kind === 'dependency-security' &&
    !input.goal.constraints.allowBreakingChanges &&
    input.args.some((argument) => /(?:@latest\b|--latest\b|--major\b)/i.test(argument))
  ) {
    throw new Error(
      'The verified goal contract forbids unbounded latest/major dependency upgrades.'
    );
  }
}

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

function dependencyMap(
  manifest: Record<string, unknown>,
  field: (typeof DEPENDENCY_FIELDS)[number]
): Record<string, string> {
  const value = manifest[field];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  );
}

function dependencyMajor(range: string): number | null {
  const normalized = range.replace(/^(?:workspace:|npm:[^@]+@)/, '');
  const match = normalized.match(/(?:^|[^\d])(\d+)(?:\.\d+)?(?:\.\d+)?/);
  return match ? Number(match[1]) : null;
}

export function assertVerifiedGoalPackageManifestSafety(input: {
  goal: VerifiedGoalContractPayload;
  relativePath: string;
  originalContent: string;
  patchedContent: string;
}): void {
  if (
    input.goal.kind !== 'dependency-security' ||
    input.goal.constraints.allowBreakingChanges ||
    !/(?:^|\/)package\.json$/i.test(input.relativePath)
  ) {
    return;
  }
  let original: Record<string, unknown>;
  let patched: Record<string, unknown>;
  try {
    original = JSON.parse(input.originalContent) as Record<string, unknown>;
    patched = JSON.parse(input.patchedContent) as Record<string, unknown>;
  } catch {
    throw new Error('Dependency goal package.json changes must remain valid JSON.');
  }
  for (const field of DEPENDENCY_FIELDS) {
    const before = dependencyMap(original, field);
    const after = dependencyMap(patched, field);
    for (const [packageName, previousRange] of Object.entries(before)) {
      const nextRange = after[packageName];
      if (nextRange === undefined) {
        throw new Error(
          `The verified goal forbids removing ${packageName} from ${field} without breaking-change authorization.`
        );
      }
      if (nextRange === previousRange) {
        continue;
      }
      const previousMajor = dependencyMajor(previousRange);
      const nextMajor = dependencyMajor(nextRange);
      if (
        previousMajor === null ||
        nextMajor === null ||
        previousMajor !== nextMajor ||
        /(?:latest|\*)/i.test(nextRange)
      ) {
        throw new Error(
          `The verified goal rejected an unproven breaking dependency change for ${packageName}: ${previousRange} → ${nextRange}.`
        );
      }
    }
  }
}

function isTestOwnedSourcePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
  const segments = normalized.toLowerCase().split('/');
  const fileName = segments.at(-1) ?? '';
  const testOwnedDirectory = segments
    .slice(0, -1)
    .some((segment) =>
      /^(?:__tests__|__mocks__|test|tests|testing|spec|specs|fixtures?|snapshots?|testdata|test-data|test_data)$/.test(
        segment
      )
    );
  return (
    testOwnedDirectory ||
    /(?:^test[_-].+|[_-]tests?|[.]tests?|[.]spec|[_-]spec)[.][^/]+$/i.test(fileName) ||
    /(?:Tests?|Spec)[.](?:java|kt|kts|cs|fs|vb|php|scala|groovy)$/i.test(fileName) ||
    /[.]snap$/i.test(fileName)
  );
}

/**
 * A deterministic Goal must not be satisfied by shrinking or redefining the
 * measured surface. Coverage Goals therefore operate on test-owned source
 * only. General Goal Packs use the broader inspected source transaction plane.
 */
export function assertVerifiedGoalSourceMutationSafety(input: {
  goal: VerifiedGoalContractPayload;
  mutations: ReadonlyArray<{ relativePath: string; operation?: 'write' | 'delete' }>;
}): void {
  if (input.mutations.some((mutation) => mutation.operation === 'delete')) {
    throw new Error(
      'This deterministic Goal contract does not delete source files. Use a general Goal or Agent task with an independently reviewed, rollback-protected deletion.'
    );
  }
  if (input.goal.kind !== 'test-coverage') {
    return;
  }
  const outsideTestSurface = input.mutations
    .map((mutation) => mutation.relativePath)
    .filter((relativePath) => !isTestOwnedSourcePath(relativePath));
  if (outsideTestSurface.length > 0) {
    throw new Error(
      `The test-coverage Goal may change only test-owned source, fixtures, or snapshots. Rejected: ${outsideTestSurface.join(', ')}`
    );
  }
}

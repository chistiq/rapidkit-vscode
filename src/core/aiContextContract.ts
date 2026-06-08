/**
 * Context Contract v1 — extension host side
 *
 * Provides a deterministic, evidence-driven contract that captures what is
 * KNOWN about the current workspace/project before the AI prompt is assembled.
 * The contract enforces evidence-first behavior: if required evidence is missing
 * the validator signals a clarification is needed instead of letting the AI guess.
 *
 * Anatomy:
 *   schema   — AIContextContractV1 interface
 *   builder  — buildContextContractFromEvidence()
 *   validator— validateContextContract()
 *   persona  — PersonaLevel + detectPersonaFromEvidence()
 *   adapter  — buildPersonaAdapterBlock()  (prompt-ready string)
 *   telemetry— extractContractTelemetry()
 */

import * as path from 'path';
import type { AIModalContext, ScannedProjectContext } from './aiService';

// ─── Persona ─────────────────────────────────────────────────────────────────

/** User experience/expertise level. Drives AI verbosity and safety posture. */
export type PersonaLevel = 'amateur' | 'midlevel' | 'senior';

// ─── Schema ──────────────────────────────────────────────────────────────────

export interface AIContextContractV1 {
  /** Contract schema version. Increment on breaking changes. */
  contract_version: 1;

  /** Persona detected from evidence. Drives prompt adapter. */
  persona: PersonaLevel;

  /**
   * Evidence confidence.
   * strong  — project scanned, doctor ran, kit detected.
   * partial — some data missing but enough to proceed.
   * none    — no reliable evidence; clarification needed.
   */
  evidence_confidence: 'strong' | 'partial' | 'none';

  /** Workspace evidence (may be partial) */
  workspace: {
    path: string | undefined;
    name: string | undefined;
    /** ISO-8601 timestamp of the last doctor run. undefined if never ran. */
    doctorLastRunAt: string | undefined;
    healthPercent: number | undefined;
    projectCount: number | undefined;
    knownProjects: Array<{
      name: string;
      framework: string | undefined;
      path: string;
      issues: number;
      depsInstalled: boolean | undefined;
    }>;
  };

  /** Project-level evidence (undefined when context is workspace-scoped) */
  project:
    | {
        name: string;
        path: string;
        framework: string | undefined;
        /** RapidKit kit type e.g. 'fastapi.ddd', 'nestjs.standard' */
        kit: string | undefined;
        installedModules: Array<{ slug: string; version: string }>;
        /** Whether this kit/framework has module_support in RapidKit. */
        moduleSupported: boolean;
        runtime: string | undefined;
        pythonVersion: string | undefined;
        rapidkitVersion: string | undefined;
        hasDocker: boolean;
        hasAlembic: boolean;
      }
    | undefined;

  /** Operator command scope (workspace vs project). Used to constrain CLI advice. */
  commandScope: 'workspace' | 'project' | 'unknown';

  /**
   * Safety flags set by the validator.
   * The AI prompt adapter reads these to tighten or relax its posture.
   */
  safetyFlags: {
    /** AI should not suggest creating a new project — one already exists. */
    projectAlreadyExists: boolean;
    /** Module commands are off-limits because the kit does not support them. */
    moduleSupportDisabled: boolean;
    /** Doctor evidence is stale (>24 h). AI should note this as a caveat. */
    doctorEvidenceStale: boolean;
    /** Persona is amateur — AI must use safe-action-only advice. */
    safeActionsOnly: boolean;
  };
}

// ─── Doctor evidence snapshot shape (minimal — only what we need) ────────────

export interface DoctorEvidenceSnapshot {
  workspaceName?: string;
  generatedAt?: string;
  health: {
    total: number;
    passed: number;
    warnings: number;
    errors: number;
    percent: number;
  };
  projectCount: number;
  projects: Array<{
    name: string;
    framework?: string;
    issues: number;
    depsInstalled?: boolean;
  }>;
  fixCommands: string[];
}

// ─── Framework → module_support map ─────────────────────────────────────────
// Mirrors the npm-native generators that set module_support: false.
const MODULE_SUPPORT_DISABLED_FRAMEWORKS = new Set([
  'go',
  'gofiber',
  'gogin',
  'gofiber.standard',
  'gogin.standard',
  'springboot',
  'springboot.standard',
  'dotnet',
  'dotnet.webapi.clean',
]);

function frameworkSupportsModules(framework: string | undefined, kit: string | undefined): boolean {
  const check = kit ?? framework ?? '';
  // If any known no-module framework appears in the kit/framework string → false
  for (const noMod of MODULE_SUPPORT_DISABLED_FRAMEWORKS) {
    if (check.toLowerCase().startsWith(noMod.toLowerCase())) {
      return false;
    }
  }
  return true;
}

// ─── Persona detection ───────────────────────────────────────────────────────

/**
 * Detect persona from available evidence signals.
 *
 * Heuristics (ordered by weight):
 * 1. Explicit user preference from VS Code settings.
 * 2. Installed module count → senior has many modules.
 * 3. Evidence confidence → none → treat conservatively (amateur).
 * 4. DDD kit → senior signal.
 * 5. Default: midlevel.
 */
export function detectPersonaFromEvidence(
  _ctx: AIModalContext,
  scanned?: ScannedProjectContext,
  doctor?: DoctorEvidenceSnapshot
): PersonaLevel {
  // Allow explicit override via VS Code setting (opt-in)
  // We import lazily so this module stays usable in tests without vscode shim.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vscode = require('vscode') as typeof import('vscode');
    const explicit = vscode.workspace
      .getConfiguration('workspai')
      .get<string>('aiPersonaLevel', '');
    if (explicit === 'amateur' || explicit === 'midlevel' || explicit === 'senior') {
      return explicit as PersonaLevel;
    }
  } catch {
    // vscode not available (e.g. unit test environment) — continue
  }

  // DDD kit is a strong senior signal
  if (scanned?.kit === 'fastapi.ddd') {
    return 'senior';
  }

  // Many installed modules → experienced user
  const moduleCount = scanned?.installedModules?.length ?? 0;
  if (moduleCount >= 5) {
    return 'senior';
  }
  if (moduleCount >= 2) {
    return 'midlevel';
  }

  // Go/Spring/.NET projects with many production deps → experienced user
  // (these kits have no module marketplace so dep count is the signal)
  const kit = scanned?.kit ?? '';
  const isNonModuleKit =
    kit === 'gofiber.standard' ||
    kit === 'gogin.standard' ||
    kit === 'springboot.standard' ||
    kit === 'dotnet.webapi.clean';
  if (isNonModuleKit) {
    const depCount = scanned?.productionDeps?.length ?? 0;
    if (depCount >= 10) {
      return 'senior';
    }
    if (depCount >= 4) {
      return 'midlevel';
    }
  }

  // Healthy workspace with multiple projects → at least midlevel
  const projectCount = doctor?.projectCount ?? 0;
  if (projectCount >= 3) {
    return 'midlevel';
  }

  // No evidence at all → conservative
  if (!scanned && !doctor) {
    return 'amateur';
  }

  return 'midlevel';
}

// ─── Evidence confidence ─────────────────────────────────────────────────────

function resolveEvidenceConfidence(
  ctx: AIModalContext,
  scanned: ScannedProjectContext | undefined,
  doctor: DoctorEvidenceSnapshot | undefined
): AIContextContractV1['evidence_confidence'] {
  // 'strong' detection means the Python bridge confirmed the project root and kit.
  // 'weak' detection means the extension guessed from file markers — not authoritative.
  const hasScannedStrong =
    Boolean(scanned) && scanned!.detectionConfidence === 'strong' && scanned!.kit !== 'unknown';
  const hasScannedWeak =
    Boolean(scanned) && scanned!.detectionConfidence === 'weak' && scanned!.kit !== 'unknown';
  const hasDoctor = Boolean(doctor);
  const hasContextPath = Boolean(ctx.path || ctx.projectRootPath || ctx.workspaceRootPath);

  // Strong: authoritative scan + doctor, or weak scan corroborated by doctor evidence.
  if ((hasScannedStrong && hasDoctor) || (hasScannedWeak && hasDoctor)) {
    return 'strong';
  }
  // Any single source (scan or doctor) still means partial confidence.
  if (hasScannedStrong || hasScannedWeak || hasDoctor) {
    return 'partial';
  }
  if (hasContextPath) {
    return 'partial';
  }
  return 'none';
}

// ─── Builder ─────────────────────────────────────────────────────────────────

/**
 * Assemble a Context Contract v1 from all available evidence sources.
 * Non-throwing — missing data becomes undefined fields rather than errors.
 */
export function buildContextContractFromEvidence(
  ctx: AIModalContext,
  scanned?: ScannedProjectContext,
  doctor?: DoctorEvidenceSnapshot
): AIContextContractV1 {
  const persona = detectPersonaFromEvidence(ctx, scanned, doctor);

  // ── Workspace ────────────────────────────────────────────────────────────
  const workspacePath = ctx.workspaceRootPath ?? ctx.path;
  const workspaceName =
    ctx.name || (workspacePath ? path.basename(workspacePath) : undefined) || doctor?.workspaceName;

  const knownProjects: AIContextContractV1['workspace']['knownProjects'] = [];
  if (doctor?.projects && doctor.projects.length > 0) {
    for (const p of doctor.projects) {
      const projectPath = workspacePath ? path.join(workspacePath, p.name) : p.name;
      knownProjects.push({
        name: p.name,
        framework: p.framework,
        path: projectPath,
        issues: p.issues,
        depsInstalled: p.depsInstalled,
      });
    }
  }

  // Doctor evidence staleness check (>24 h is considered stale)
  let doctorEvidenceStale = false;
  if (doctor?.generatedAt) {
    try {
      const ageMs = Date.now() - new Date(doctor.generatedAt).getTime();
      doctorEvidenceStale = ageMs > 24 * 60 * 60 * 1000;
    } catch {
      doctorEvidenceStale = false;
    }
  } else if (!doctor) {
    // No doctor data at all — treat as stale to prompt the user to run it
    doctorEvidenceStale = true;
  }

  // ── Project ──────────────────────────────────────────────────────────────
  let project: AIContextContractV1['project'] = undefined;
  if (ctx.type === 'project' || scanned) {
    const framework = scanned?.runtime ?? scanned?.engine ?? ctx.framework;
    const kit = scanned?.kit !== 'unknown' ? scanned?.kit : ctx.framework;
    const moduleSupported = frameworkSupportsModules(framework, kit);

    project = {
      name: scanned?.projectName ?? ctx.name ?? (ctx.path ? path.basename(ctx.path) : 'unknown'),
      path: scanned?.projectRoot ?? ctx.projectRootPath ?? ctx.path ?? '',
      framework,
      kit,
      installedModules: (scanned?.installedModules ?? []).map((m) => ({
        slug: m.slug,
        version: m.version,
      })),
      moduleSupported,
      runtime: scanned?.runtime ?? undefined,
      pythonVersion: scanned?.pythonVersion ?? undefined,
      rapidkitVersion: scanned?.rapidkitCoreVersion ?? undefined,
      hasDocker: scanned?.hasDocker ?? false,
      hasAlembic: scanned?.hasAlembic ?? false,
    };
  }

  // ── Command scope ────────────────────────────────────────────────────────
  let commandScope: AIContextContractV1['commandScope'] = 'unknown';
  if (ctx.type === 'project') {
    commandScope = 'project';
  } else if (ctx.type === 'workspace') {
    commandScope = 'workspace';
  }

  // ── Safety flags ─────────────────────────────────────────────────────────
  const projectAlreadyExists = (doctor?.projectCount ?? 0) > 0 || knownProjects.length > 0;
  const moduleSupportDisabled = project ? !project.moduleSupported : false;

  const safetyFlags: AIContextContractV1['safetyFlags'] = {
    projectAlreadyExists,
    moduleSupportDisabled,
    doctorEvidenceStale,
    safeActionsOnly: persona === 'amateur',
  };

  const evidenceConfidence = resolveEvidenceConfidence(ctx, scanned, doctor);

  return {
    contract_version: 1,
    persona,
    evidence_confidence: evidenceConfidence,
    workspace: {
      path: workspacePath,
      name: workspaceName,
      doctorLastRunAt: doctor?.generatedAt,
      healthPercent: doctor?.health?.percent,
      projectCount: doctor?.projectCount,
      knownProjects,
    },
    project,
    commandScope,
    safetyFlags,
  };
}

// ─── Validator ───────────────────────────────────────────────────────────────

export interface ContextContractValidationResult {
  valid: boolean;
  /** Field paths that are missing or invalid. */
  missing: string[];
  /** When true, the AI should ask the user a clarifying question first. */
  clarificationNeeded: boolean;
  /** Human-readable reason when clarification is needed. */
  clarificationReason?: string;
}

/**
 * Validate a Context Contract v1.
 * Returns whether the contract is usable as-is or needs clarification.
 */
export function validateContextContract(
  contract: AIContextContractV1
): ContextContractValidationResult {
  const missing: string[] = [];

  if (!contract.workspace.path && !contract.workspace.name) {
    missing.push('workspace.path');
  }

  // If context is project-scoped but no project evidence exists
  if (contract.commandScope === 'project' && !contract.project) {
    missing.push('project (context is project-scoped but no project evidence found)');
  }

  // evidence_confidence: none is always a clarification signal
  if (contract.evidence_confidence === 'none') {
    return {
      valid: false,
      missing,
      clarificationNeeded: true,
      clarificationReason:
        'No workspace or project evidence is available. ' +
        'Please select a workspace and run `npx --yes --package rapidkit rapidkit doctor workspace` to generate evidence.',
    };
  }

  // missing required fields but partial evidence → can proceed but note gaps
  if (missing.length > 0) {
    return {
      valid: false,
      missing,
      clarificationNeeded: false,
    };
  }

  return { valid: true, missing: [], clarificationNeeded: false };
}

// ─── Prompt Adapter ──────────────────────────────────────────────────────────

/**
 * Build a persona-aware prompt prefix block to inject at the top of the
 * system prompt. Adjusts AI verbosity and safety posture based on persona
 * and safety flags from the contract.
 *
 * Returns an empty string if no adaptation is needed.
 */
export function buildPersonaAdapterBlock(contract: AIContextContractV1): string {
  const { persona, safetyFlags, evidence_confidence, project, workspace } = contract;

  const lines: string[] = ['CONTEXT CONTRACT v1 — PERSONA & SAFETY POLICY:'];

  // ── Evidence confidence caveat ────────────────────────────────────────────
  if (evidence_confidence === 'none') {
    lines.push(
      '⚠ Evidence confidence: NONE. No workspace or project data available. ' +
        'Ask the user to select a workspace before diagnosing.'
    );
  } else if (evidence_confidence === 'partial') {
    lines.push(
      '⚠ Evidence confidence: PARTIAL. Some context is missing — be explicit about assumptions.'
    );
  } else {
    lines.push('✓ Evidence confidence: STRONG. Proceed with full diagnostic authority.');
  }

  // ── Persona posture ───────────────────────────────────────────────────────
  if (persona === 'amateur') {
    lines.push(
      'USER PERSONA: Amateur. Apply safe-action-only mode:',
      '  • Explain every step before suggesting it.',
      '  • Prefer read-only commands (doctor, list, status) over write commands.',
      '  • Never suggest irreversible actions without a rollback option.',
      '  • Use plain language, avoid jargon without definition.',
      '  • Maximum response verbosity.'
    );
  } else if (persona === 'midlevel') {
    lines.push(
      'USER PERSONA: Mid-level. Apply balanced mode:',
      '  • Show tradeoffs for significant decisions.',
      '  • Include risk/confidence level for each suggestion.',
      '  • Commands first, then explanation.',
      '  • Moderate response verbosity.'
    );
  } else {
    lines.push(
      'USER PERSONA: Senior. Apply expert mode:',
      '  • Concise diagnosis. Command-first. Skip obvious explanations.',
      '  • Include confidence level and root cause in one sentence.',
      '  • Reference file paths directly — no hand-holding.',
      '  • Minimal response verbosity.'
    );
  }

  // ── Safety flags ──────────────────────────────────────────────────────────
  if (safetyFlags.projectAlreadyExists && workspace.knownProjects.length > 0) {
    const projectList = workspace.knownProjects
      .map((p) => `${p.name} (${p.framework ?? 'unknown'})`)
      .join(', ');
    lines.push(
      `SAFETY GATE — PROJECT EXISTS: The workspace already contains: ${projectList}. ` +
        'Do NOT suggest creating a new project unless the user explicitly asks.'
    );
  }

  if (safetyFlags.moduleSupportDisabled && project) {
    lines.push(
      `SAFETY GATE — NO MODULE SUPPORT: ${project.framework ?? project.kit ?? 'This framework'} ` +
        'does not support RapidKit modules. Do NOT suggest "rapidkit add module" commands.'
    );
  }

  if (safetyFlags.doctorEvidenceStale) {
    lines.push(
      'NOTE — STALE EVIDENCE: Doctor evidence is missing or >24 h old. ' +
        'Mention this caveat and recommend running `npx --yes --package rapidkit rapidkit doctor workspace` for fresh data.'
    );
  }

  if (safetyFlags.safeActionsOnly) {
    lines.push(
      'SAFETY GATE — SAFE ACTIONS ONLY: User is in amateur mode. ' +
        'Do not suggest any command that modifies files, schema, or dependencies without explicit user confirmation.'
    );
  }

  // ── Project context summary ───────────────────────────────────────────────
  if (project) {
    const moduleText =
      project.installedModules.length > 0
        ? project.installedModules.map((m) => m.slug).join(', ')
        : 'none';
    lines.push(
      `ACTIVE PROJECT: ${project.name} | framework: ${project.framework ?? 'unknown'} | ` +
        `kit: ${project.kit ?? 'unknown'} | modules: ${moduleText}`
    );
  }

  return lines.join('\n');
}

// ─── Telemetry extraction ────────────────────────────────────────────────────

/**
 * Extract flat telemetry fields from a contract.
 * Safe to spread into any telemetry payload.
 */
export function extractContractTelemetry(contract: AIContextContractV1): Record<string, unknown> {
  return {
    context_contract_version: contract.contract_version,
    persona_level: contract.persona,
    evidence_confidence: contract.evidence_confidence,
    module_support_disabled: contract.safetyFlags.moduleSupportDisabled,
    doctor_evidence_stale: contract.safetyFlags.doctorEvidenceStale,
    project_already_exists: contract.safetyFlags.projectAlreadyExists,
    safe_actions_only: contract.safetyFlags.safeActionsOnly,
    command_scope: contract.commandScope,
    project_framework: contract.project?.framework ?? null,
    project_kit: contract.project?.kit ?? null,
    installed_module_count: contract.project?.installedModules?.length ?? 0,
    workspace_project_count: contract.workspace?.projectCount ?? 0,
    workspace_health_percent: contract.workspace?.healthPercent ?? null,
  };
}

/**
 * WorkspaceMemoryService
 * Reads and writes project-level memory stored in .workspai/workspace-memory.json.
 * The legacy .rapidkit path remains a read-only compatibility fallback.
 * The memory is injected into every AI system prompt so the model has persistent
 * context about conventions, decisions, and the project overview.
 */

import * as fs from 'fs';
import * as path from 'path';
import { sanitizePromptText } from '../utils/promptSecurity';

const fsp = fs.promises;

export type WorkspaceMemoryPolicyProfile = 'strict' | 'balanced' | 'permissive';
export type WorkspaceMemorySensitivity = 'normal' | 'sensitive';

export type WorkspaceMemoryPolicy = {
  profile: WorkspaceMemoryPolicyProfile;
  sensitivity: WorkspaceMemorySensitivity;
  localProcessingMode: boolean;
};

export type WorkspaceMemoryWriteOperation =
  | 'workspace-memory-wizard'
  | 'incident-replay-learning'
  | 'create-template'
  | 'system-repair';

export type WorkspaceMemoryWriteMode = 'user-initiated' | 'system-enrichment';

export type WorkspaceMemoryWriteAccessContract = {
  actor: string;
  operation: WorkspaceMemoryWriteOperation;
  mode: WorkspaceMemoryWriteMode;
  reason: string;
  approvedByUser?: boolean;
};

const DEFAULT_POLICY_PROFILE: WorkspaceMemoryPolicyProfile = 'balanced';
const DEFAULT_SENSITIVITY: WorkspaceMemorySensitivity = 'normal';

export interface WorkspaceMemory {
  /** One-line project overview shown at the top of every AI prompt. */
  context: string;
  /** Team coding conventions (e.g. "All services use Repository Pattern"). */
  conventions: string[];
  /** Architecture decisions with optional date (e.g. "Chose Redis — April 2026"). */
  decisions: string[];
  /** Policy profile used to control privacy strictness for memory-enabled flows. */
  policyProfile?: WorkspaceMemoryPolicyProfile;
  /** Sensitivity marker for workspace memory handling. */
  sensitivity?: WorkspaceMemorySensitivity;
  /** Local-processing mode strips high-detail symbols in sensitive repositories. */
  localProcessingMode?: boolean;
  lastUpdated: string;
}

const DEFAULT_MEMORY: WorkspaceMemory = {
  context: '',
  conventions: [],
  decisions: [],
  policyProfile: DEFAULT_POLICY_PROFILE,
  sensitivity: DEFAULT_SENSITIVITY,
  localProcessingMode: false,
  lastUpdated: '',
};

/**
 * Example workspace-memory.json written when the user runs "Edit Memory" for
 * the first time on an empty workspace.
 */
const TEMPLATE_MEMORY: WorkspaceMemory = {
  context:
    'Describe your project in one sentence (e.g. B2B SaaS backend — auth, billing, notifications)',
  conventions: [
    'All async functions use async/await (no raw .then() chains)',
    'Domain models are pure dataclasses — no ORM mixins in domain layer',
  ],
  decisions: ['Chose PostgreSQL over MongoDB — relational data model fits our queries'],
  policyProfile: DEFAULT_POLICY_PROFILE,
  sensitivity: DEFAULT_SENSITIVITY,
  localProcessingMode: false,
  lastUpdated: '',
};

export class WorkspaceMemoryService {
  private static _instance: WorkspaceMemoryService;

  private constructor() {}

  static getInstance(): WorkspaceMemoryService {
    if (!WorkspaceMemoryService._instance) {
      WorkspaceMemoryService._instance = new WorkspaceMemoryService();
    }
    return WorkspaceMemoryService._instance;
  }

  canonicalMemoryPath(workspacePath: string): string {
    return path.join(workspacePath, '.workspai', 'workspace-memory.json');
  }

  private memoryPathCandidates(workspacePath: string): string[] {
    return [
      this.canonicalMemoryPath(workspacePath),
      path.join(workspacePath, '.rapidkit', 'workspace-memory.json'),
    ];
  }

  async resolveMemoryPath(workspacePath: string): Promise<string> {
    for (const candidate of this.memoryPathCandidates(workspacePath)) {
      if (await this.pathExists(candidate)) {
        return candidate;
      }
    }
    return this.canonicalMemoryPath(workspacePath);
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await fsp.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  private isValidIsoTimestamp(value: string): boolean {
    return !Number.isNaN(Date.parse(value));
  }

  private sanitizeStringList(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => sanitizePromptText(item, 2000))
      .filter(Boolean);
  }

  private sanitizePolicyProfile(value: unknown): WorkspaceMemoryPolicyProfile {
    if (value === 'strict' || value === 'balanced' || value === 'permissive') {
      return value;
    }
    return DEFAULT_POLICY_PROFILE;
  }

  private sanitizeSensitivity(value: unknown): WorkspaceMemorySensitivity {
    return value === 'sensitive' ? 'sensitive' : DEFAULT_SENSITIVITY;
  }

  private deriveLocalProcessingMode(input: {
    localProcessingMode: unknown;
    policyProfile: WorkspaceMemoryPolicyProfile;
    sensitivity: WorkspaceMemorySensitivity;
  }): boolean {
    // Fail-closed boundary: strict/sensitive workspaces must remain local-processing.
    if (input.policyProfile === 'strict' || input.sensitivity === 'sensitive') {
      return true;
    }

    if (typeof input.localProcessingMode === 'boolean') {
      return input.localProcessingMode;
    }
    return false;
  }

  resolvePolicy(memory?: WorkspaceMemory): WorkspaceMemoryPolicy {
    const profile = this.sanitizePolicyProfile(memory?.policyProfile);
    const sensitivity = this.sanitizeSensitivity(memory?.sensitivity);
    const localProcessingMode = this.deriveLocalProcessingMode({
      localProcessingMode: memory?.localProcessingMode,
      policyProfile: profile,
      sensitivity,
    });

    return {
      profile,
      sensitivity,
      localProcessingMode,
    };
  }

  private validateWriteAccessContract(
    memory: WorkspaceMemory,
    contract?: WorkspaceMemoryWriteAccessContract
  ): WorkspaceMemoryWriteAccessContract {
    if (!contract) {
      throw new Error('Workspace memory write blocked: missing access contract.');
    }

    const actor = sanitizePromptText(contract.actor, 120).trim();
    const reason = sanitizePromptText(contract.reason, 240).trim();

    if (!actor) {
      throw new Error('Workspace memory write blocked: actor is required.');
    }
    if (!reason) {
      throw new Error('Workspace memory write blocked: reason is required.');
    }

    const mode = contract.mode;
    if (mode !== 'user-initiated' && mode !== 'system-enrichment') {
      throw new Error('Workspace memory write blocked: invalid access mode.');
    }

    const operation = contract.operation;
    if (
      operation !== 'workspace-memory-wizard' &&
      operation !== 'incident-replay-learning' &&
      operation !== 'create-template' &&
      operation !== 'system-repair'
    ) {
      throw new Error('Workspace memory write blocked: invalid operation.');
    }

    const policy = this.resolvePolicy(memory);
    if (
      mode === 'system-enrichment' &&
      !contract.approvedByUser &&
      (policy.profile === 'strict' || policy.sensitivity === 'sensitive')
    ) {
      throw new Error(
        `Workspace memory write blocked by policy profile ${policy.profile} (${policy.sensitivity}).`
      );
    }

    return {
      actor,
      operation,
      mode,
      reason,
      approvedByUser: contract.approvedByUser === true,
    };
  }

  private sanitizeMemory(input: unknown): { memory: WorkspaceMemory; changed: boolean } {
    const source = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};

    const contextRaw = typeof source.context === 'string' ? source.context : '';
    const context = sanitizePromptText(contextRaw, 4000);

    const conventions = this.sanitizeStringList(source.conventions);
    const decisions = this.sanitizeStringList(source.decisions);
    const policyProfile = this.sanitizePolicyProfile(source.policyProfile);
    const sensitivity = this.sanitizeSensitivity(source.sensitivity);
    const localProcessingMode = this.deriveLocalProcessingMode({
      localProcessingMode: source.localProcessingMode,
      policyProfile,
      sensitivity,
    });

    const lastUpdatedRaw = typeof source.lastUpdated === 'string' ? source.lastUpdated.trim() : '';
    const lastUpdated =
      lastUpdatedRaw && this.isValidIsoTimestamp(lastUpdatedRaw) ? lastUpdatedRaw : '';

    const memory: WorkspaceMemory = {
      context,
      conventions,
      decisions,
      policyProfile,
      sensitivity,
      localProcessingMode,
      lastUpdated,
    };

    const changed =
      context !== contextRaw ||
      JSON.stringify(conventions) !== JSON.stringify(source.conventions ?? []) ||
      JSON.stringify(decisions) !== JSON.stringify(source.decisions ?? []) ||
      policyProfile !== source.policyProfile ||
      sensitivity !== source.sensitivity ||
      localProcessingMode !== source.localProcessingMode ||
      lastUpdated !== (typeof source.lastUpdated === 'string' ? source.lastUpdated : '');

    return { memory, changed };
  }

  private async writeAtPath(
    filePath: string,
    memory: WorkspaceMemory,
    touchTimestamp: boolean
  ): Promise<void> {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    const data: WorkspaceMemory = {
      ...memory,
      lastUpdated: touchTimestamp ? new Date().toISOString() : memory.lastUpdated,
    };
    await fsp.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  private async readFromPath(filePath: string, selfHeal: boolean): Promise<WorkspaceMemory> {
    let raw: string;
    try {
      raw = await fsp.readFile(filePath, 'utf8');
    } catch {
      return { ...DEFAULT_MEMORY };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      if (selfHeal) {
        const backupPath = path.join(
          path.dirname(filePath),
          `workspace-memory.corrupt-${Date.now()}.json`
        );
        await fsp.writeFile(backupPath, raw, 'utf8').catch(() => undefined);
        await this.writeAtPath(filePath, { ...DEFAULT_MEMORY }, true).catch(() => undefined);
      }
      return { ...DEFAULT_MEMORY };
    }

    const { memory, changed } = this.sanitizeMemory(parsed);
    if (selfHeal && changed) {
      await this.writeAtPath(filePath, memory, true).catch(() => undefined);
    }
    return memory;
  }

  /**
   * Resolve the closest workspace-memory.json from startPath upward.
   * Useful when AI is invoked at project/module scope but memory is stored at workspace root.
   */
  async resolveNearestMemoryPath(startPath: string): Promise<string | null> {
    if (!startPath) {
      return null;
    }

    let currentPath = path.resolve(startPath);
    try {
      const stat = await fsp.stat(currentPath);
      if (!stat.isDirectory()) {
        currentPath = path.dirname(currentPath);
      }
    } catch {
      return null;
    }

    let keepSearching = true;
    while (keepSearching) {
      for (const candidate of this.memoryPathCandidates(currentPath)) {
        if (await this.pathExists(candidate)) {
          return candidate;
        }
      }
      const parent = path.dirname(currentPath);
      if (parent === currentPath) {
        keepSearching = false;
      } else {
        currentPath = parent;
      }
    }

    return null;
  }

  /** Returns true when a memory file exists for the workspace. */
  async hasMemory(workspacePath: string): Promise<boolean> {
    return (await this.resolveMemoryPath(workspacePath)) !== this.canonicalMemoryPath(workspacePath)
      ? true
      : this.pathExists(this.canonicalMemoryPath(workspacePath));
  }

  /**
   * Read the workspace memory file.
   * Returns DEFAULT_MEMORY (all empty) when the file does not exist or is unreadable.
   */
  async read(workspacePath: string): Promise<WorkspaceMemory> {
    return this.readFromPath(await this.resolveMemoryPath(workspacePath), true);
  }

  /**
   * Read memory by walking up parent directories from startPath.
   * Returns DEFAULT_MEMORY when no workspace memory file is found.
   */
  async readNearest(startPath: string): Promise<WorkspaceMemory> {
    const resolvedPath = await this.resolveNearestMemoryPath(startPath);
    if (!resolvedPath) {
      return { ...DEFAULT_MEMORY };
    }
    return this.readFromPath(resolvedPath, true);
  }

  /**
   * Persist workspace memory to disk.
   * Creates the canonical .workspai/ directory if it doesn't already exist.
   */
  async write(
    workspacePath: string,
    memory: WorkspaceMemory,
    accessContract: WorkspaceMemoryWriteAccessContract
  ): Promise<void> {
    const sanitized = this.sanitizeMemory(memory).memory;
    this.validateWriteAccessContract(sanitized, accessContract);
    const filePath = this.canonicalMemoryPath(workspacePath);
    await this.writeAtPath(filePath, sanitized, true);
  }

  /**
   * Write the template memory file (called on first "Edit Memory" for a workspace
   * that has no memory yet).
   */
  async writeTemplate(workspacePath: string): Promise<void> {
    await this.write(workspacePath, TEMPLATE_MEMORY, {
      actor: 'workspai.editWorkspaceMemory',
      operation: 'create-template',
      mode: 'user-initiated',
      reason: 'Seed workspace memory file before manual editing.',
      approvedByUser: true,
    });
  }

  /**
   * Format workspace memory as a string block suitable for injection into an AI
   * system prompt.  Returns an empty string when there is nothing to inject.
   */
  formatForPrompt(memory: WorkspaceMemory): string {
    const parts: string[] = [];
    const policy = this.resolvePolicy(memory);

    if (memory.context && memory.context.trim()) {
      parts.push(`Project overview: ${sanitizePromptText(memory.context, 4000)}`);
    }
    if (memory.conventions && memory.conventions.length > 0) {
      const lines = memory.conventions
        .map((c) => c.trim())
        .filter(Boolean)
        .map((c) => `  - ${c}`);
      if (lines.length > 0) {
        parts.push(`Conventions:\n${lines.join('\n')}`);
      }
    }
    if (memory.decisions && memory.decisions.length > 0) {
      const lines = memory.decisions
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => `  - ${d}`);
      if (lines.length > 0) {
        parts.push(`Architecture decisions:\n${lines.join('\n')}`);
      }
    }

    parts.push(
      `Memory policy: ${policy.profile} (sensitivity: ${policy.sensitivity}, local processing: ${policy.localProcessingMode ? 'enabled' : 'disabled'})`
    );

    return parts.join('\n');
  }
}

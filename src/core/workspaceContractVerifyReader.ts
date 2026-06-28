import * as path from 'path';

import {
  incompatibleJsonArtifact,
  isJsonArtifactReadFailure,
  readJsonArtifact,
  type JsonArtifactReadResult,
} from './jsonArtifactReader.js';
import { WORKSPACE_CONTRACT_VERIFY_REPORT_PATH } from './workspaceIntelligencePaths.js';

export const WORKSPACE_CONTRACT_VERIFY_SCHEMA_VERSION = 'workspace-contract-verify.v1' as const;

export type WorkspaceContractVerifyEvidence = {
  schemaVersion?: string;
  generatedAt?: string;
  status?: string;
  contractPath?: string;
  projectCount?: number;
  violations?: string[];
  checks?: Array<{ id: string; status: string; message: string }>;
};

export type WorkspaceContractVerifyEvidenceReadResult =
  | { kind: 'missing'; artifactPath: string }
  | { kind: 'valid'; artifactPath: string; evidence: WorkspaceContractVerifyEvidence }
  | { kind: 'corrupt'; artifactPath: string; error: string }
  | { kind: 'incompatible'; artifactPath: string; error: string };

export function isWorkspaceContractVerifyEvidence(
  value: unknown
): value is WorkspaceContractVerifyEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === WORKSPACE_CONTRACT_VERIFY_SCHEMA_VERSION &&
    typeof record.status === 'string' &&
    typeof record.generatedAt === 'string' &&
    typeof record.contractPath === 'string' &&
    Array.isArray(record.checks) &&
    Array.isArray(record.violations)
  );
}

export async function readWorkspaceContractVerifyEvidence(
  workspacePath: string
): Promise<WorkspaceContractVerifyEvidence | null> {
  const result = await readWorkspaceContractVerifyEvidenceArtifact(workspacePath);
  return result.kind === 'valid' ? result.evidence : null;
}

export async function readWorkspaceContractVerifyEvidenceArtifact(
  workspacePath: string
): Promise<WorkspaceContractVerifyEvidenceReadResult> {
  const absolutePath = path.join(workspacePath, WORKSPACE_CONTRACT_VERIFY_REPORT_PATH);
  const result: JsonArtifactReadResult = await readJsonArtifact(absolutePath);
  if (isJsonArtifactReadFailure(result)) {
    return result;
  }
  if (!isWorkspaceContractVerifyEvidence(result.raw)) {
    return incompatibleJsonArtifact({
      artifactPath: result.artifactPath,
      expectedSchemaVersion: WORKSPACE_CONTRACT_VERIFY_SCHEMA_VERSION,
      actualSchemaVersion: result.raw.schemaVersion,
      reason:
        'Contract verify artifact must include generatedAt, status, contractPath, checks[], and violations[].',
    });
  }
  return { kind: 'valid', artifactPath: result.artifactPath, evidence: result.raw };
}

export function summarizeWorkspaceContractVerify(
  evidence: WorkspaceContractVerifyEvidence | null,
  projectCount: number
): { status: 'pass' | 'warn' | 'fail' | 'missing'; summary: string; blockers?: string[] } {
  if (!evidence) {
    return {
      status: 'warn',
      summary: `${projectCount} project(s) in manifest; run workspace contract verify for gate evidence.`,
      blockers: ['Run workspace contract verify to publish verify evidence.'],
    };
  }
  const normalized = evidence.status?.toLowerCase() ?? '';
  const violations = evidence.violations ?? [];
  if (normalized === 'failed' || normalized === 'fail') {
    return {
      status: 'fail',
      summary: `Contract verify failed (${violations.length} violation(s)).`,
      blockers: violations.slice(0, 8),
    };
  }
  if (normalized === 'passed' || normalized === 'pass') {
    return {
      status: 'pass',
      summary: `Contract verify passed for ${evidence.projectCount ?? projectCount} project(s).`,
    };
  }
  return {
    status: 'warn',
    summary: `Contract verify status is ${evidence.status ?? 'unknown'}.`,
  };
}

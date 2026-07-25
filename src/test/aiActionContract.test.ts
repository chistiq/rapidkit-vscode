import { describe, expect, it } from 'vitest';

import {
  normalizeAIActionContract,
  parseAIActionContractFromText,
  validateAIActionContract,
} from '../core/aiActionContract';

describe('aiActionContract', () => {
  it('accepts a valid fix contract with verify and rollback gates', () => {
    const contract = normalizeAIActionContract({
      actionType: 'fix',
      summary: 'Patch auth guard',
      riskLevel: 'medium',
      affectedFiles: ['src/auth/guard.ts'],
      proposedCommands: ['npm run test --if-present'],
      proposedPatches: [{ relativePath: 'src/auth/guard.ts', summary: 'Guard null tenant' }],
      verificationCommands: ['npm run test --if-present'],
      rollbackPlan: ['git checkout -- src/auth/guard.ts'],
      confidence: 0.91,
      requiresApproval: true,
    });

    const result = validateAIActionContract(contract, {
      workspacePath: '/tmp/workspace',
      strict: true,
    });

    expect(result.status).toBe('valid');
    expect(result.canApply).toBe(true);
    expect(result.canVerify).toBe(true);
    expect(result.canRollback).toBe(true);
  });

  it('blocks path traversal outside the workspace', () => {
    const contract = normalizeAIActionContract({
      actionType: 'fix',
      affectedFiles: ['../secrets.env'],
      proposedPatches: [{ relativePath: '../secrets.env' }],
      verificationCommands: ['npm test'],
      rollbackPlan: ['git checkout -- ../secrets.env'],
      confidence: 0.9,
      requiresApproval: true,
    });

    const result = validateAIActionContract(contract, {
      workspacePath: '/tmp/workspace',
      strict: true,
    });

    expect(result.status).toBe('blocked');
    expect(result.canApply).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('path-outside-workspace');
  });

  it('blocks dangerous commands', () => {
    const contract = normalizeAIActionContract({
      actionType: 'fix',
      affectedFiles: ['src/app.ts'],
      proposedCommands: ['rm -rf /'],
      verificationCommands: ['npm test'],
      rollbackPlan: ['git checkout -- src/app.ts'],
      confidence: 0.9,
      requiresApproval: true,
    });

    const result = validateAIActionContract(contract, {
      workspacePath: '/tmp/workspace',
      strict: true,
    });

    expect(result.status).toBe('blocked');
    expect(result.issues.map((issue) => issue.code)).toContain('unsafe-command');
  });

  it('surfaces command policy violations during validation', () => {
    const contract = normalizeAIActionContract({
      actionType: 'fix',
      affectedFiles: ['src/app.ts'],
      proposedCommands: ['npm install left-pad'],
      verificationCommands: ['npm test'],
      rollbackPlan: ['git checkout -- src/app.ts'],
      confidence: 0.9,
      requiresApproval: true,
    });

    const result = validateAIActionContract(contract, {
      workspacePath: '/tmp/workspace',
      strict: true,
    });

    expect(result.status).toBe('blocked');
    expect(result.canApply).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('command-policy-violation');
  });

  it('accepts deterministic RapidKit bootstrap compliance handoffs from Studio', () => {
    const contract = normalizeAIActionContract({
      actionType: 'fix',
      riskLevel: 'medium',
      affectedFiles: ['.rapidkit/compatibility-matrix.json', '.rapidkit/mirror-config.json'],
      proposedCommands: ['npx rapidkit bootstrap --ci --json'],
      verificationCommands: ['npx rapidkit bootstrap --ci --json'],
      rollbackPlan: [
        'git checkout -- ".rapidkit/compatibility-matrix.json" ".rapidkit/mirror-config.json"',
      ],
      confidence: 0.9,
      requiresApproval: true,
    });

    const result = validateAIActionContract(contract, {
      workspacePath: '/tmp/workspace',
      strict: true,
    });

    expect(result.status).toBe('valid');
    expect(result.canApply).toBe(true);
    expect(result.canVerify).toBe(true);
    expect(result.canRollback).toBe(true);
  });

  it('blocks fix actions without verification in strict mode', () => {
    const contract = normalizeAIActionContract({
      actionType: 'fix',
      affectedFiles: ['src/app.ts'],
      proposedPatches: [{ relativePath: 'src/app.ts' }],
      rollbackPlan: ['git checkout -- src/app.ts'],
      confidence: 0.9,
      requiresApproval: true,
    });

    const result = validateAIActionContract(contract, {
      workspacePath: '/tmp/workspace',
      strict: true,
    });

    expect(result.status).toBe('blocked');
    expect(result.issues.map((issue) => issue.code)).toContain('missing-verification');
  });

  it('keeps low-confidence actions in review instead of apply-ready outside strict mode', () => {
    const contract = normalizeAIActionContract({
      actionType: 'impact',
      affectedFiles: ['src/app.ts'],
      verificationCommands: ['npm test'],
      rollbackPlan: [],
      confidence: 0.3,
      requiresApproval: true,
    });

    const result = validateAIActionContract(contract, {
      workspacePath: '/tmp/workspace',
      strict: false,
    });

    expect(result.status).toBe('needs-review');
    expect(result.canApply).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('low-confidence');
  });

  it('parses a fenced json action contract from provider output', () => {
    const parsed = parseAIActionContractFromText(`
Here is the proposed action.

\`\`\`json
{
  "schemaVersion": "workspai.ai-action.v1",
  "actionType": "impact",
  "summary": "Review auth impact",
  "riskLevel": "medium",
  "affectedFiles": ["src/auth.ts"],
  "proposedCommands": [],
  "proposedPatches": [],
  "verificationCommands": ["npm test -- auth"],
  "rollbackPlan": [],
  "confidence": 0.82,
  "requiresApproval": true
}
\`\`\`
`);

    expect(parsed.parseError).toBeUndefined();
    expect(parsed.contract?.summary).toBe('Review auth impact');
    expect(parsed.rawJson).toContain('"schemaVersion"');
  });

  it('returns parse errors without throwing', () => {
    const parsed = parseAIActionContractFromText('```json\n{ "schemaVersion": \n```');

    expect(parsed.contract).toBeNull();
    expect(parsed.rawJson).toContain('"schemaVersion"');
    expect(parsed.parseError).toBeTruthy();
  });
});

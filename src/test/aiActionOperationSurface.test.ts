import { describe, expect, it } from 'vitest';
import {
  AI_ACTION_OPERATION_SURFACE,
  AI_ACTION_OPERATIONS,
  isAIActionOperation,
  normalizeAIActionCommandPayload,
  resolveAIActionOperationMeta,
} from '../contracts/aiActionOperationSurface';

describe('AI action operation surface', () => {
  it('defines governed operation metadata for apply, verify, and rollback', () => {
    expect(AI_ACTION_OPERATIONS).toEqual(['apply', 'verify', 'rollback']);
    expect(AI_ACTION_OPERATION_SURFACE.apply).toMatchObject({
      label: 'Apply',
      mutatesWorkspace: true,
      requiresApproval: true,
    });
    expect(AI_ACTION_OPERATION_SURFACE.verify).toMatchObject({
      label: 'Verify',
      mutatesWorkspace: false,
      requiresApproval: false,
    });
    expect(AI_ACTION_OPERATION_SURFACE.rollback).toMatchObject({
      label: 'Rollback',
      mutatesWorkspace: true,
      requiresApproval: true,
    });
  });

  it('resolves and guards known operations', () => {
    expect(isAIActionOperation('apply')).toBe(true);
    expect(isAIActionOperation('verify')).toBe(true);
    expect(isAIActionOperation('rollback')).toBe(true);
    expect(isAIActionOperation('delete')).toBe(false);
    expect(resolveAIActionOperationMeta('verify')?.statusActionPrefix).toBe('ai-action-verify');
    expect(resolveAIActionOperationMeta('missing')).toBeUndefined();
  });

  it('normalizes dashboard AI action command payloads before execution', () => {
    expect(
      normalizeAIActionCommandPayload({
        operation: 'apply',
        workspacePath: ' /tmp/workspace ',
        workspaceName: ' Demo ',
        actionId: ' action-1 ',
        summary: ' Fix issue ',
        riskLevel: 'medium',
        confidence: 0.72,
      })
    ).toEqual({
      operation: 'apply',
      workspacePath: '/tmp/workspace',
      workspaceName: 'Demo',
      actionId: 'action-1',
      summary: 'Fix issue',
      riskLevel: 'medium',
      confidence: 0.72,
    });

    expect(
      normalizeAIActionCommandPayload({
        operation: 'verify',
        workspacePath: '/tmp/workspace',
      })
    ).toMatchObject({
      operation: 'verify',
      workspacePath: '/tmp/workspace',
      workspaceName: 'Current Workspace',
    });
  });

  it('blocks malformed operation payloads', () => {
    expect(normalizeAIActionCommandPayload(null)).toBeNull();
    expect(
      normalizeAIActionCommandPayload({ operation: 'delete', workspacePath: '/tmp/ws' })
    ).toBeNull();
    expect(normalizeAIActionCommandPayload({ operation: 'apply' })).toBeNull();
  });
});

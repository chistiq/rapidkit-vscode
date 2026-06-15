import { describe, expect, it } from 'vitest';
import {
  buildStudioEvidenceIssueContext,
  buildStudioModuleInstallContext,
  isStudioCodeChangeActionId,
  resolveStudioActionChatBrainExecution,
} from '../../webview-ui/src/lib/incidentStudioCodeChangeActions';

describe('incidentStudioCodeChangeActions', () => {
  it('maps fix-lens to apply-debug-patch with analyze evidence context', () => {
    const resolution = resolveStudioActionChatBrainExecution(
      'fix-lens',
      {
        generatedAt: '2026-06-10T12:00:00.000Z',
        score: 72,
        verdict: 'needs-attention',
        findings: { fail: 1, warn: 2, info: 0 },
        topFindings: [
          {
            severity: 'fail',
            target: 'auth-service',
            title: 'Missing env var',
            remediation: 'Set AUTH_SECRET in .env',
          },
        ],
      },
      {
        path: '/tmp/ws/auth-service',
        name: 'auth-service',
        type: 'python',
      }
    );

    expect(resolution?.actionType).toBe('apply-debug-patch');
    expect(resolution?.payload?.issueSummary).toContain('auth-service');
    expect(resolution?.payload?.issueSummary).toContain('Missing env var');
    expect(resolution?.payload?.logContext).toContain('Analyze score: 72');
  });

  it('maps install-module to apply-module-gen for selected project', () => {
    const resolution = resolveStudioActionChatBrainExecution('install-module', null, {
      path: '/tmp/ws/api',
      name: 'api',
      type: 'python',
    });

    expect(resolution?.actionType).toBe('apply-module-gen');
    expect(resolution?.payload?.featureIntent).toContain('catalog module');
    expect(resolution?.payload?.targetPath).toBe('/tmp/ws/api');
  });

  it('identifies code-change studio actions', () => {
    expect(isStudioCodeChangeActionId('fix-lens')).toBe(true);
    expect(isStudioCodeChangeActionId('install-module')).toBe(true);
    expect(isStudioCodeChangeActionId('impact-lens')).toBe(false);
  });

  it('builds fallback issue context when evidence is missing', () => {
    const payload = buildStudioEvidenceIssueContext(null, {
      path: '/tmp/ws/api',
      name: 'api',
      type: 'python',
    });

    expect(payload.issueSummary).toContain('api');
  });

  it('builds module install context with project path', () => {
    const payload = buildStudioModuleInstallContext({
      path: '/tmp/ws/api',
      name: 'api',
      type: 'python',
    });

    expect(payload.targetPath).toBe('/tmp/ws/api');
    expect(payload.featureIntent).toContain('api');
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assessVerifyCompleteness,
  buildIncidentFirstResponseRules,
  classifyIncidentActionPolicy,
  isIncidentActionAllowlisted,
  labelDiagnosisConfidence,
} from '../ui/panels/incidentStudioPromptPolicy';

function readWelcomePanelSource(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const panelPaths = [
    '../ui/panels/welcomePanel.ts',
    '../ui/panels/welcomePanelProjectDiscoveryBindings.ts',
  ];
  return panelPaths
    .map((relativePath) => readFileSync(path.resolve(currentDir, relativePath), 'utf8'))
    .join('\n');
}

function readChatBrainInlineQuerySource(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const inlineQueryPath = path.resolve(
    currentDir,
    '../ui/panels/welcomePanelChatBrainInlineQuery.ts'
  );
  return readFileSync(inlineQueryPath, 'utf8');
}

function readIncidentWave2Source(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const wave2Path = path.resolve(currentDir, '../ui/panels/welcomePanelIncidentWave2.ts');
  return readFileSync(wave2Path, 'utf8');
}

function readIncidentRoutingSource(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const routingPath = path.resolve(currentDir, '../ui/panels/incidentRouting.ts');
  return readFileSync(routingPath, 'utf8');
}

describe('incidentStudioPromptPolicy', () => {
  it('returns no extra rules for workspace-scoped mode', () => {
    expect(
      buildIncidentFirstResponseRules({
        projectScoped: false,
        hasDoctorEvidence: true,
      })
    ).toEqual([]);
  });

  it('injects non-technical launch-roadmap guidance for project-scoped first response', () => {
    const rules = buildIncidentFirstResponseRules({
      projectScoped: true,
      hasDoctorEvidence: false,
      framework: 'fastapi',
    });

    expect(rules.some((line) => line.includes('non-technical'))).toBe(true);
    expect(rules.some((line) => line.includes('Stage: <blocked|setup|ready-to-run>'))).toBe(true);
    expect(
      rules.some((line) => line.includes('install dependencies -> init -> dev -> verify'))
    ).toBe(true);
    expect(rules.some((line) => line.includes('No doctor evidence exists yet'))).toBe(true);
  });

  it('adds spring-specific blocker rule in project-scoped mode', () => {
    const rules = buildIncidentFirstResponseRules({
      projectScoped: true,
      hasDoctorEvidence: true,
      framework: 'springboot',
    });

    expect(rules.some((line) => line.includes('Spring Boot'))).toBe(true);
    expect(rules.some((line) => line.includes('never recommend `rapidkit dev`'))).toBe(true);
  });

  it('classifies known low-risk and informational actions', () => {
    const terminal = classifyIncidentActionPolicy('terminal-bridge');
    const impact = classifyIncidentActionPolicy('change-impact-lite');

    expect(terminal.riskClass).toBe('non-mutating-executable');
    expect(terminal.riskLevel).toBe('low');
    expect(terminal.requiresVerifyPath).toBe(false);

    expect(impact.riskClass).toBe('informational');
    expect(impact.riskLevel).toBe('medium');
    expect(impact.allowCompletionClaimWithoutVerify).toBe(true);
  });

  it('classifies risky and unknown actions as verify-first required', () => {
    const inlineCommand = classifyIncidentActionPolicy('inline-command');
    const unknown = classifyIncidentActionPolicy('custom-mutate-action');

    expect(inlineCommand.riskClass).toBe('guarded-mutating');
    expect(inlineCommand.requiresImpactReview).toBe(true);
    expect(inlineCommand.requiresVerifyPath).toBe(true);
    expect(inlineCommand.allowCompletionClaimWithoutVerify).toBe(false);

    expect(unknown.riskClass).toBe('high-risk-mutating');
    expect(unknown.riskLevel).toBe('critical');
    expect(unknown.requiresVerifyPath).toBe(true);
  });

  it('enforces action allowlist for incident execution paths', () => {
    expect(isIncidentActionAllowlisted('doctor-fix')).toBe(true);
    expect(isIncidentActionAllowlisted('inline-command')).toBe(true);
    expect(isIncidentActionAllowlisted('  recipe-pack  ')).toBe(true);
    expect(isIncidentActionAllowlisted('verify-pack-autopilot')).toBe(true);
    expect(isIncidentActionAllowlisted('incident-repro-pack')).toBe(true);
    expect(isIncidentActionAllowlisted('release-readiness-commander')).toBe(true);

    expect(isIncidentActionAllowlisted('shell-exec-root')).toBe(false);
    expect(isIncidentActionAllowlisted('custom-mutate-action')).toBe(false);
    expect(isIncidentActionAllowlisted('')).toBe(false);
  });

  it('keeps verify-first requirements aligned across all supported action classes', () => {
    const actionTypes = [
      'change-impact-lite',
      'terminal-bridge',
      'fix-preview-lite',
      'workspace-memory-wizard',
      'doctor-fix',
      'recipe-pack',
      'verify-pack-autopilot',
      'incident-repro-pack',
      'release-readiness-commander',
      'inline-command',
      'custom-mutate-action',
    ];

    for (const actionType of actionTypes) {
      const policy = classifyIncidentActionPolicy(actionType);

      expect(policy.allowCompletionClaimWithoutVerify).toBe(!policy.requiresVerifyPath);

      if (policy.riskClass === 'guarded-mutating' || policy.riskClass === 'high-risk-mutating') {
        expect(policy.requiresVerifyPath).toBe(true);
        expect(policy.requiresImpactReview).toBe(true);
      }
    }
  });

  it('requires verify evidence before completion claims for artifact-producing killer features', () => {
    for (const actionType of [
      'verify-pack-autopilot',
      'incident-repro-pack',
      'release-readiness-commander',
      'browser-smoke-test',
    ]) {
      const policy = classifyIncidentActionPolicy(actionType);

      expect(policy.requiresVerifyPath).toBe(true);
      expect(policy.allowCompletionClaimWithoutVerify).toBe(false);
    }
  });

  it('keeps inline-command prompt contract sections stable', () => {
    const source = readChatBrainInlineQuerySource();

    expect(source).toContain("if (actionType === 'inline-command')");
    expect(source).toContain('Decision Clarity Contract');
    expect(source).toContain("'1) Situation'");
    expect(source).toContain("'2) Why'");
    expect(source).toContain("'3) Impact scope (exact files/modules)'");
    expect(source).toContain("'4) Risk (confidence + mutating/non-mutating)'");
    expect(source).toContain("'5) Next safe step'");
    expect(source).toContain("'6) Verify plan (required commands)'");
    expect(source).toContain("'7) Rollback plan'");
  });

  it('keeps apply patch/module prompt contract sections stable', () => {
    const source = readChatBrainInlineQuerySource();

    expect(source).toContain("if (actionType === 'apply-module-gen')");
    expect(source).toContain("if (actionType === 'apply-debug-patch')");

    const decisionContractOccurrences = source.match(/Decision Clarity Contract \(required\):/g);
    expect(decisionContractOccurrences?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('route precision: doctor-fix and recipe-pack routes are reachable', () => {
    const source = readIncidentRoutingSource();
    expect(source).toContain("actionType: 'doctor-fix'");
    expect(source).toContain("actionType: 'recipe-pack'");
  });

  it('route precision: terminal-bridge requires explicit terminal signal, not bare error keyword', () => {
    const source = readIncidentRoutingSource();
    // Bare 'error' alone should NOT immediately route to terminal-bridge in the primary check
    expect(source).toContain("normalized.includes('traceback')");
    expect(source).toContain("normalized.includes('stack trace')");
    expect(source).toContain("normalized.includes('exception')");
    // The router must also have a secondary fallback that catches bare 'error'
    expect(source).toContain("normalized.includes('error') ||");
  });

  it('route precision: fix-preview-lite requires patch context, not bare fix keyword', () => {
    const source = readIncidentRoutingSource();
    // fix-preview-lite branch must require additional context beyond bare 'fix'
    expect(source).toContain("normalized.includes('preview')");
    expect(source).toContain("normalized.includes('patch')");
    // Bare 'fix' alone should be paired with code context keywords
    expect(source).toContain("normalized.includes('fix') &&");
  });

  it('workspace candidate block includes marker + evidence-source transparency', () => {
    const source = readWelcomePanelSource();

    expect(source).toContain('./welcomePanelProjectDiscovery');
    expect(source).toContain('buildWorkspaceProjectCandidatesBlock(');
    expect(source).toContain('WelcomePanel._workspaceExplorer');
  });

  it('scope resolver uses doctor evidence + recursive rapidkit project discovery signals', () => {
    const source = readWelcomePanelSource();

    expect(source).toContain('./welcomePanelProjectDiscovery');
    expect(source).toContain('resolveScopedProjectForWorkspace(');
  });

  it('release gate verify path uses actionable verify completeness (not checklist length only)', () => {
    const source = readIncidentWave2Source();

    expect(source).toContain('const verifyCompletenessCheck = assessVerifyCompleteness');
    expect(source).toContain('const verifyPathPresent = verifyCompletenessCheck.adequate;');
    expect(source).toContain('verifyCompletenessCheck.reason');
  });

  it('inline-command verify telemetry includes action identity and verify readiness fields', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const bridgeSource = readFileSync(
      path.join(currentDir, '../ui/panels/incidentStudioInlineCommandBridge.ts'),
      'utf8'
    );

    expect(bridgeSource).toContain('actionId: inlineActionId');
    expect(bridgeSource).toContain('verifyReady: verificationPassed');
    expect(bridgeSource).toContain("? 'diagnostic_findings'");
    expect(bridgeSource).toContain('verifyReady: false');
  });

  describe('labelDiagnosisConfidence', () => {
    it('returns high when scope is known and confidence score >= 0.75', () => {
      expect(labelDiagnosisConfidence('known', 0.75)).toBe('high');
      expect(labelDiagnosisConfidence('known', 0.99)).toBe('high');
    });

    it('returns medium when scope is known/partial and confidence score >= 0.45', () => {
      expect(labelDiagnosisConfidence('known', 0.6)).toBe('medium');
      expect(labelDiagnosisConfidence('partial', 0.5)).toBe('medium');
      expect(labelDiagnosisConfidence('partial', 0.45)).toBe('medium');
    });

    it('returns low when confidence score is below 0.45 and scope is not fully unknown', () => {
      expect(labelDiagnosisConfidence('known', 0.3)).toBe('low');
      expect(labelDiagnosisConfidence('partial', 0.2)).toBe('low');
    });

    it('returns unknown when scope is undefined or confidence score is missing', () => {
      expect(labelDiagnosisConfidence(undefined, undefined)).toBe('unknown');
      expect(labelDiagnosisConfidence(undefined, 0.9)).toBe('unknown');
      expect(labelDiagnosisConfidence('known', undefined)).toBe('unknown');
    });

    it('returns low or unknown when scope is unknown based on confidence score', () => {
      expect(labelDiagnosisConfidence('unknown', 0.5)).toBe('low');
      expect(labelDiagnosisConfidence('unknown', 0.2)).toBe('unknown');
    });
  });

  describe('assessVerifyCompleteness', () => {
    it('returns adequate when action does not require verify path', () => {
      const policy = classifyIncidentActionPolicy('terminal-bridge');
      const result = assessVerifyCompleteness(policy, []);
      expect(result.adequate).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('returns adequate when verify-required action has a non-empty checklist', () => {
      const policy = classifyIncidentActionPolicy('inline-command');
      const result = assessVerifyCompleteness(policy, ['pnpm test --filter orders-api']);
      expect(result.adequate).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('returns inadequate when verify-required action has empty checklist', () => {
      const policy = classifyIncidentActionPolicy('apply-debug-patch');
      const result = assessVerifyCompleteness(policy, []);
      expect(result.adequate).toBe(false);
      expect(result.reason).toContain('mutating actions require at least one explicit verify step');
    });

    it('ignores whitespace-only checklist items as empty', () => {
      const policy = classifyIncidentActionPolicy('apply-module-gen');
      const result = assessVerifyCompleteness(policy, ['   ', '\t']);
      expect(result.adequate).toBe(false);
    });

    it('returns inadequate when checklist only contains non-actionable placeholder text', () => {
      const policy = classifyIncidentActionPolicy('inline-command');
      const result = assessVerifyCompleteness(policy, [
        'No blocking verify checks detected for this action class.',
      ]);
      expect(result.adequate).toBe(false);
      expect(result.reason).toContain('include at least one executable verify command');
    });

    it('returns inadequate when checklist has advisory text without executable command', () => {
      const policy = classifyIncidentActionPolicy('apply-debug-patch');
      const result = assessVerifyCompleteness(policy, [
        'Review Workspai contract warnings: check architecture config',
      ]);
      expect(result.adequate).toBe(false);
    });

    it('accepts actionable verify commands even when mixed with advisory lines', () => {
      const policy = classifyIncidentActionPolicy('apply-debug-patch');
      const result = assessVerifyCompleteness(policy, [
        'Scope is uncertain. Ask for clarification before mutation recommendation.',
        'Run pnpm test --filter orders-api',
      ]);
      expect(result.adequate).toBe(true);
      expect(result.reason).toBeNull();
    });
  });
});

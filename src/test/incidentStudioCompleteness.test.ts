import { describe, expect, it } from 'vitest';

import {
  assessIncidentStudioCompleteness,
  mapCompletenessLevelToGraphFlag,
} from '../core/incidentStudioCompleteness';

describe('incidentStudioCompleteness', () => {
  it('marks enterprise-ready when core intelligence artifacts are present', () => {
    const assessment = assessIncidentStudioCompleteness({
      hasDoctorEvidence: true,
      hasGitDiff: true,
      hasAnalyze: true,
      hasWorkspaceModel: true,
      hasWorkspaceDiff: true,
      hasWorkspaceImpact: true,
      hasWorkspaceVerify: true,
      hasAgentContext: true,
      doctorGeneratedAt: new Date().toISOString(),
      analyzeGeneratedAt: new Date().toISOString(),
      modelGeneratedAt: new Date().toISOString(),
      impactGeneratedAt: new Date().toISOString(),
      verifyGeneratedAt: new Date().toISOString(),
    });

    expect(assessment.level).toBe('enterprise-ready');
    expect(assessment.score).toBeGreaterThanOrEqual(88);
    expect(mapCompletenessLevelToGraphFlag(assessment.level)).toBe('fresh');
  });

  it('recommends doctor when evidence chain is degraded', () => {
    const assessment = assessIncidentStudioCompleteness({
      hasDoctorEvidence: false,
      hasGitDiff: false,
      hasAnalyze: false,
    });

    expect(assessment.level).toBe('degraded');
    expect(assessment.recommendedNextCommand).toContain('doctor workspace');
  });

  it('recommends the full agent grounding sync when agent context is missing', () => {
    const generatedAt = new Date().toISOString();
    const assessment = assessIncidentStudioCompleteness({
      hasDoctorEvidence: true,
      hasGitDiff: true,
      hasAnalyze: true,
      hasWorkspaceModel: true,
      hasWorkspaceDiff: true,
      hasWorkspaceImpact: true,
      hasWorkspaceVerify: true,
      hasAgentContext: false,
      doctorGeneratedAt: generatedAt,
      analyzeGeneratedAt: generatedAt,
      modelGeneratedAt: generatedAt,
      impactGeneratedAt: generatedAt,
      verifyGeneratedAt: generatedAt,
    });

    expect(assessment.missing).toContain('workspaceContextAgent');
    expect(assessment.recommendedNextCommand).toBe(
      'npx workspai workspace agent-sync --write --refresh-context --preset enterprise --target vscode --json'
    );
  });
});

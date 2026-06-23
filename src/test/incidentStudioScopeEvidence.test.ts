import { describe, expect, it } from 'vitest';

import {
  boostConfidenceForResolvedScope,
  filterScopeBlockedReasons,
  resolveIncidentScopeEvidence,
  resolveScopeSeedFilePaths,
} from '../core/incidentStudioScopeEvidence';

describe('incidentStudioScopeEvidence', () => {
  it('accepts explicit patch paths as known scope for project-scoped mutations', () => {
    const result = resolveIncidentScopeEvidence({
      requiresImpactReview: true,
      graphScopeKnown: false,
      c07ScopeBlocked: false,
      affectedFiles: ['/tmp/atlas-api'],
      affectedModules: [],
      affectedTests: [],
      explicitScopeFilePaths: ['src/routing/health.py'],
      selectedProjectPath: '/tmp/atlas-api',
      workspaceImpactReport: null,
      actionType: 'apply-debug-patch',
    });

    expect(result.scopeKnown).toBe(true);
    expect(result.scopeSource).toBe('explicit-paths');
    expect(result.supplementalAffectedFiles).toEqual(['/tmp/atlas-api/src/routing/health.py']);
  });

  it('accepts npm workspace impact artifact when no project is in blast radius', () => {
    const result = resolveIncidentScopeEvidence({
      requiresImpactReview: true,
      graphScopeKnown: false,
      c07ScopeBlocked: false,
      affectedFiles: ['/tmp/atlas-api'],
      affectedModules: [],
      affectedTests: [],
      explicitScopeFilePaths: [],
      selectedProjectPath: '/tmp/atlas-api',
      workspaceImpactReport: {
        summary: {
          risk: 'high',
          affectedProjects: 0,
          workspaceItems: 1169,
        },
        workspaceImpact: [{ target: 'AGENTS.md', summary: 'git untracked' }],
      },
      actionType: 'apply-debug-patch',
    });

    expect(result.scopeKnown).toBe(true);
    expect(result.scopeSource).toBe('npm-impact');
    expect(result.useNpmImpactReview).toBe(true);
  });

  it('filters unknown-scope blocked reasons after scope is resolved', () => {
    const scopeEvidence = resolveIncidentScopeEvidence({
      requiresImpactReview: true,
      graphScopeKnown: false,
      c07ScopeBlocked: false,
      affectedFiles: ['/tmp/atlas-api'],
      affectedModules: [],
      affectedTests: [],
      explicitScopeFilePaths: ['src/routing/health.py'],
      selectedProjectPath: '/tmp/atlas-api',
      workspaceImpactReport: null,
      actionType: 'apply-debug-patch',
    });

    expect(
      filterScopeBlockedReasons(
        [
          'Affected scope is unknown while impact review is required.',
          'Scope is unknown for an impact-reviewed action.',
          'Verification evidence is missing for a verify-first action.',
        ],
        scopeEvidence
      )
    ).toEqual(['Verification evidence is missing for a verify-first action.']);
  });

  it('boosts confidence floor when scope is resolved outside the graph', () => {
    const scopeEvidence = resolveIncidentScopeEvidence({
      requiresImpactReview: true,
      graphScopeKnown: false,
      c07ScopeBlocked: false,
      affectedFiles: ['/tmp/atlas-api'],
      affectedModules: [],
      affectedTests: [],
      explicitScopeFilePaths: ['src/routing/health.py'],
      selectedProjectPath: '/tmp/atlas-api',
      workspaceImpactReport: null,
      actionType: 'apply-debug-patch',
    });

    expect(boostConfidenceForResolvedScope(42, scopeEvidence, true)).toBe(68);
  });

  it('resolves relative patch paths into project seed paths', () => {
    expect(
      resolveScopeSeedFilePaths({
        selectedProjectPath: '/tmp/atlas-api',
        explicitScopeFilePaths: ['src/routing/health.py', 'HEALTH.md'],
      })
    ).toEqual(['/tmp/atlas-api/src/routing/health.py', '/tmp/atlas-api/HEALTH.md']);
  });
});

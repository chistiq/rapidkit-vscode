import { describe, expect, it } from 'vitest';

import {
  defaultProfileForStackLane,
  profileRequiresPythonInstallMethod,
  recommendedProfilesForStackLane,
  resolveDefaultWorkspaceName,
  resolveManualWorkspaceNamePlaceholder,
  stackLaneGuidance,
} from '@/lib/creationPresets';

describe('creationPresets manual workspace helpers', () => {
  it('maps stack lanes to default bootstrap profiles', () => {
    expect(defaultProfileForStackLane('frontend')).toBe('node-only');
    expect(defaultProfileForStackLane('polyglot')).toBe('polyglot');
    expect(defaultProfileForStackLane('enterprise')).toBe('enterprise');
    expect(defaultProfileForStackLane('balanced')).toBe('minimal');
  });

  it('recommends runtime-specific profiles for backend lane', () => {
    expect(recommendedProfilesForStackLane('backend')).toEqual([
      'python-only',
      'node-only',
      'go-only',
      'java-only',
      'dotnet-only',
    ]);
  });

  it('provides lane-specific guidance and name placeholders', () => {
    expect(stackLaneGuidance('frontend')).toContain('frontend generators');
    expect(resolveManualWorkspaceNamePlaceholder('frontend')).toBe('web-platform-wsp');
    expect(resolveManualWorkspaceNamePlaceholder('enterprise')).toBe('enterprise-platform-wsp');
  });

  it('generates default workspace names from stack lane and profile', () => {
    expect(resolveDefaultWorkspaceName('frontend', 'node-only')).toBe('web-platform-wsp');
    expect(resolveDefaultWorkspaceName('backend', 'python-only')).toBe('python-api-wsp');
    expect(resolveDefaultWorkspaceName('backend', 'go-only')).toBe('go-service-wsp');
    expect(resolveDefaultWorkspaceName('enterprise', 'enterprise')).toBe('enterprise-platform-wsp');
    expect(resolveDefaultWorkspaceName('balanced', 'minimal')).toBe('my-workspace-wsp');
  });

  it('hides install method for python-free bootstrap profiles', () => {
    expect(profileRequiresPythonInstallMethod('node-only')).toBe(false);
    expect(profileRequiresPythonInstallMethod('minimal')).toBe(false);
    expect(profileRequiresPythonInstallMethod('polyglot')).toBe(true);
    expect(profileRequiresPythonInstallMethod('enterprise')).toBe(true);
  });
});

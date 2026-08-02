import { describe, expect, it } from 'vitest';

import { PROJECT_REFRESH_WATCH_PATTERNS } from '../core/projectRefreshContract';

describe('primary sidebar project refresh contract', () => {
  it('watches canonical ownership artifacts before compatibility markers', () => {
    expect(PROJECT_REFRESH_WATCH_PATTERNS.slice(0, 5)).toEqual([
      '**/.workspai/project.json',
      '**/.workspai/context.json',
      '**/.workspai/registry.json',
      '**/.workspai/imported-projects.json',
      '**/.workspai/workspace-registry.v1.json',
    ]);
    expect(PROJECT_REFRESH_WATCH_PATTERNS).toContain('**/.rapidkit/project.json');
  });

  it('refreshes when supported runtime manifests change', () => {
    expect(PROJECT_REFRESH_WATCH_PATTERNS).toEqual(
      expect.arrayContaining([
        '**/pyproject.toml',
        '**/package.json',
        '**/go.mod',
        '**/pom.xml',
        '**/build.gradle.kts',
        '**/Cargo.toml',
        '**/composer.json',
        '**/mix.exs',
        '**/Gemfile',
      ])
    );
  });
});

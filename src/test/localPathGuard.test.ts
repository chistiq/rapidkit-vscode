import { describe, expect, it } from 'vitest';

import { findLocalPathViolations, looksBinary } from '../../scripts/local-path-guard.mjs';

describe('local path publication guard', () => {
  it('blocks repository roots, developer homes, and private workspace layouts', () => {
    const privateHome = ['', 'home', 'private-owner'].join('/');
    const privateLayout = ['Documents', 'WO' + 'SP', 'Rapid', 'Front'].join('/');
    const content = [`root=${privateHome}/repo`, `layout=${privateLayout}`].join('\n');

    const violations = findLocalPathViolations(content, 'README.md', {
      repositoryRoot: `${privateHome}/repo`,
      homeDirectory: privateHome,
    });

    expect(violations.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining(['repository-root', 'home-directory', 'private-workspace-layout'])
    );
  });

  it('allows logical tokens and deliberately neutral test fixtures', () => {
    const content = 'Use $WORKSPACE, $PROJECT, $HOME, or /opt/fixtures/external/grpc.';
    expect(
      findLocalPathViolations(content, 'src/test/example.test.ts', {
        repositoryRoot: '/opt/repository',
        homeDirectory: '/opt/home',
      })
    ).toEqual([]);
  });

  it('allows synthetic home paths only inside tests', () => {
    const synthetic = ['', 'home', 'user', 'project'].join('/');
    const options = { repositoryRoot: '/opt/repository', homeDirectory: '/opt/home' };
    expect(findLocalPathViolations(synthetic, 'src/test/example.test.ts', options)).toEqual([]);
    expect(findLocalPathViolations(synthetic, 'README.md', options)).toHaveLength(1);
  });

  it('does not inspect binary payloads', () => {
    expect(looksBinary(Buffer.from([0x50, 0x4e, 0x47, 0x00, 0xff]))).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import { parseSafeCommand, validateAIActionCommandPolicy } from '../core/aiActionCommandPolicy';

describe('aiActionExecutor', () => {
  it('tokenizes allowlisted commands without using a shell', () => {
    expect(parseSafeCommand('npm run test -- --watch=false')).toEqual([
      'npm',
      'run',
      'test',
      '--',
      '--watch=false',
    ]);
  });

  it('supports quoted arguments', () => {
    expect(parseSafeCommand('make "release gate"')).toEqual(['make', 'release gate']);
  });

  it('blocks shell metacharacters', () => {
    expect(() => parseSafeCommand('npm test && rm -rf /')).toThrow(/Unsafe shell syntax/);
  });

  it('blocks dangerous commands even when the binary is allowlisted', () => {
    expect(() => parseSafeCommand('git reset --hard HEAD')).toThrow(/Dangerous command/);
  });

  it('blocks non-allowlisted binaries', () => {
    expect(() => parseSafeCommand('bash script.sh')).toThrow(/not allowlisted/);
  });

  it('allows deterministic verification commands', () => {
    expect(validateAIActionCommandPolicy('npm run test -- --watch=false', 'verify')).toEqual({
      allowed: true,
    });
    expect(validateAIActionCommandPolicy('make release-gate', 'verify')).toEqual({
      allowed: true,
    });
  });

  it('blocks package installation even through allowlisted binaries', () => {
    expect(validateAIActionCommandPolicy('npm install left-pad', 'apply')).toMatchObject({
      allowed: false,
    });
    expect(validateAIActionCommandPolicy('poetry add requests', 'apply')).toMatchObject({
      allowed: false,
    });
  });

  it('blocks non-deterministic verification commands', () => {
    expect(validateAIActionCommandPolicy('node scripts/open-dashboard.js', 'verify')).toMatchObject(
      {
        allowed: false,
      }
    );
  });

  it('requires explicit rollback command shape', () => {
    expect(validateAIActionCommandPolicy('git checkout -- src/app.ts', 'rollback')).toEqual({
      allowed: true,
    });
    expect(validateAIActionCommandPolicy('git checkout main', 'rollback')).toMatchObject({
      allowed: false,
    });
  });
});

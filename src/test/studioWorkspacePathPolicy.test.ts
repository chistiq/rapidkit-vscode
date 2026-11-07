import { describe, expect, it } from 'vitest';
import { studioSourcePathDenialReason } from '../core/studioWorkspacePathPolicy.js';

describe('Shared source boundary', () => {
  it.each([
    '.env',
    '.env.local',
    '.env.production',
    'api/.env.test',
    'api/.env/keys.ts',
    '.npmrc',
    'sub/.pypirc',
    'dist/index.js',
    '.workspai/workspace.contract.json',
  ])('blocks sensitive and generated material: %s', (file) =>
    expect(studioSourcePathDenialReason(file)).toBeTruthy()
  );
  it.each(['src/environment.ts', '.env-example', 'config/example.env', 'src/main.ts'])(
    'retains ordinary source access: %s',
    (file) => expect(studioSourcePathDenialReason(file)).toBeUndefined()
  );
});

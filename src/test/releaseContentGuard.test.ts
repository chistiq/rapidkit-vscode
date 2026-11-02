import { describe, expect, it } from 'vitest';
import {
  findReleaseContentViolations,
  isPrivateReleaseFile,
} from '../../scripts/release-content-guard.mjs';

describe('release content protection', () => {
  it('rejects private configuration and development assets, including nested credentials', () => {
    for (const name of [
      'extension/media/README.md',
      'extension/media/screenshots/archive/old.png',
      'extension/.workspai-cli-local.json',
      'extension/review-artifacts/audit.md',
      'extension/.codex/config.json',
      'extension/dist/.env.production',
      'extension/dist/credentials.json',
      'extension/dist/private.pem',
      'extension/dist/id_ed25519',
      'extension/dist/.npmrc',
      'extension/previous.vsix',
    ])
      expect(isPrivateReleaseFile(name), name).toBe(true);
    for (const name of [
      'extension/README.md',
      'extension/CHANGELOG.md',
      'extension/RELEASE_NOTES.md',
      'extension/contracts/official-cli-closure.v1.json',
      'extension/dist/extension.js',
      'extension/dist/workspai-runtime/templates/env.j2',
      'extension/media/readme/incident-studio.gif',
      'extension/walkthroughs/open-dashboard.md',
    ])
      expect(isPrivateReleaseFile(name), name).toBe(false);
  });

  it('detects credentials without exposing their values in reports', () => {
    const samples = [
      ['private-key', ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' ')],
      ['aws-access-key', 'AKIA' + 'A'.repeat(16)],
      ['github-token', 'ghp_' + 'a'.repeat(36)],
      ['github-token', 'github_pat_' + 'a'.repeat(60)],
      ['npm-token', 'npm_' + 'a'.repeat(36)],
      ['slack-token', 'xoxb-' + 'a'.repeat(30)],
      ['provider-token', 'sk-proj-' + 'a'.repeat(60)],
      ['credentialed-url', 'https://' + 'account:secret@example.invalid'],
    ];
    for (const [kind, secret] of samples) {
      const result = findReleaseContentViolations('heading\n' + secret, 'artifact.txt');
      expect(result).toContainEqual({ file: 'artifact.txt', line: 2, kind });
      expect(JSON.stringify(result)).not.toContain(secret);
    }
  });

  it('allows public metadata, logical paths, and ordinary credential instructions', () => {
    const content =
      'Set OPENAI_API_KEY in Secret Storage. Use $WORKSPACE or ~/.workspai. ' +
      'sha512-example https://registry.npmjs.org/workspai sk-example <your-api-key>';
    expect(findReleaseContentViolations(content, 'README.md')).toEqual([]);
  });
});

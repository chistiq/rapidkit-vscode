import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import { afterEach, describe, expect, it } from 'vitest';

import {
  findMessageId,
  markerFor,
  validateWebhookUrl,
} from '../../scripts/discord-release-announcement.mjs';
import { readReleaseDocument } from '../../scripts/release-document.mjs';

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(REPOSITORY_ROOT, 'scripts', 'discord-release-announcement.mjs');
const PACKAGE_VERSION = JSON.parse(
  await fs.readFile(path.join(REPOSITORY_ROOT, 'package.json'), 'utf8')
).version as string;
const RELEASE_TAG = `v${PACKAGE_VERSION}`;
const RELEASE_PATH = path.join(REPOSITORY_ROOT, 'releases', `RELEASE_NOTES_v${PACKAGE_VERSION}.md`);
const WORKFLOW_PATH = path.join(
  REPOSITORY_ROOT,
  '.github',
  'workflows',
  'discord-release-announcement.yml'
);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { force: true, recursive: true }))
  );
});

describe('Workspai VS Code Discord release contract', () => {
  it('renders a bounded product-specific announcement from release metadata', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-vscode-discord-'));
    temporaryDirectories.push(directory);
    const jsonPath = path.join(directory, 'announcement.json');
    const markdownPath = path.join(directory, 'announcement.md');

    await execa(process.execPath, [
      SCRIPT_PATH,
      '--product',
      'workspai-vscode',
      '--tag',
      RELEASE_TAG,
      '--check',
      '--output',
      jsonPath,
      '--markdown-output',
      markdownPath,
    ]);

    const payload = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
    const markdown = await fs.readFile(markdownPath, 'utf8');
    const releaseDocument = await readReleaseDocument(RELEASE_PATH);
    const firstHighlight = releaseDocument.metadata.announcement.highlights[0];
    const embed = payload.embeds[0];

    expect(embed.title).toBe(`🚀 Workspai VS Code v${PACKAGE_VERSION} is here`);
    expect(embed.url).toBe(
      `https://github.com/chistiq/rapidkit-vscode/releases/tag/${RELEASE_TAG}`
    );
    expect(embed.fields[0].value).toContain(`${firstHighlight.icon} ${firstHighlight.text}`);
    expect(embed.fields[1].value).toBe(
      '`code --install-extension rapidkit.rapidkit-vscode --force`'
    );
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(markdown).toContain(`# 🚀 Workspai VS Code v${PACKAGE_VERSION} is here`);
  });

  it('publishes on release and supports a safe manual preview', async () => {
    const workflow = await fs.readFile(WORKFLOW_PATH, 'utf8');
    expect(workflow).toContain('types: [published]');
    expect(workflow).toContain('ANNOUNCEMENTS_WEBHOOK_URL');
    expect(workflow).toContain("github.event_name == 'release' || inputs.send == true");
    expect(workflow).toContain('--markdown-output "$RUNNER_TEMP/discord-announcement.md"');
  });

  it('fails closed for an unknown product or tag/version drift', async () => {
    await expect(
      execa(process.execPath, [SCRIPT_PATH, '--product', 'unknown', '--check'])
    ).rejects.toMatchObject({ exitCode: 1 });
    await expect(
      execa(process.execPath, [
        SCRIPT_PATH,
        '--product',
        'workspai-vscode',
        '--tag',
        'v0.0.0',
        '--check',
      ])
    ).rejects.toMatchObject({ exitCode: 1 });
  });

  it('round-trips the idempotency marker and rejects foreign webhook hosts', () => {
    const release = { productId: 'workspai-vscode', tag: RELEASE_TAG };
    const marker = markerFor(release, '123456789012345678');
    expect(findMessageId(`Release body\n\n${marker}\n`, release)).toBe('123456789012345678');
    expect(validateWebhookUrl('https://discord.com/api/webhooks/123/token').toString()).toContain(
      'discord.com/api/webhooks/123/token'
    );
    expect(() => validateWebhookUrl('https://example.com/api/webhooks/123/token')).toThrow(
      /not a supported Discord webhook URL/u
    );
  });
});

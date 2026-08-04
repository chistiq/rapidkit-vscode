#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readReleaseDocument } from './release-document.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, '..');
const PRODUCT_CATALOG_PATH = path.join(REPOSITORY_ROOT, 'releases', 'release-products.v1.json');
const DISCORD_EMBED_COLOR = 0x00bfb3;
const MAX_HIGHLIGHTS = 5;

function parseArguments(argv) {
  const options = {
    check: false,
    markdownOutput: undefined,
    output: undefined,
    productId: undefined,
    send: false,
    tag: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--check') options.check = true;
    else if (argument === '--send') options.send = true;
    else if (argument === '--markdown-output') options.markdownOutput = argv[++index];
    else if (argument === '--output') options.output = argv[++index];
    else if (argument === '--product') options.productId = argv[++index];
    else if (argument === '--tag') options.tag = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function assertString(value, label, maximumLength) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  if (maximumLength && value.trim().length > maximumLength) {
    throw new Error(`${label} must not exceed ${maximumLength} characters`);
  }
  return value.trim();
}

function assertReleaseTag(tag) {
  if (typeof tag !== 'string' || !/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(tag)) {
    throw new Error(`Invalid release tag: ${tag}`);
  }
}

function interpolate(template, version) {
  return template.replaceAll('{version}', version);
}

function repositoryPath(relativePath, label) {
  const absolutePath = path.resolve(REPOSITORY_ROOT, assertString(relativePath, label, 240));
  if (
    absolutePath !== REPOSITORY_ROOT &&
    !absolutePath.startsWith(`${REPOSITORY_ROOT}${path.sep}`)
  ) {
    throw new Error(`${label} must remain inside the repository`);
  }
  return absolutePath;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function resolveRelease(options) {
  const catalog = await readJson(PRODUCT_CATALOG_PATH);
  if (catalog.schemaVersion !== 1 || !catalog.products || typeof catalog.products !== 'object') {
    throw new Error('Release product catalog must use schemaVersion 1 and define products');
  }
  const productId =
    options.productId && options.productId !== 'auto'
      ? options.productId
      : assertString(catalog.defaultProductId, 'defaultProductId', 80);
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/u.test(productId)) {
    throw new Error(`Invalid release product id: ${productId}`);
  }
  const product = catalog.products[productId];
  if (!product) throw new Error(`Unknown release product: ${productId}`);

  const displayName = assertString(product.displayName, 'Product displayName', 80);
  const repository = assertString(product.repository, 'Product repository', 160);
  if (!/^[0-9A-Za-z_.-]+\/[0-9A-Za-z_.-]+$/u.test(repository)) {
    throw new Error('Product repository must use owner/name format');
  }
  const packageJson = await readJson(repositoryPath(product.packagePath, 'packagePath'));
  const version = assertString(packageJson.version, 'Package version', 64);
  const tagTemplate = assertString(product.tagTemplate, 'tagTemplate', 100);
  const notesPattern = assertString(product.releaseNotesPattern, 'releaseNotesPattern', 240);
  const upgradeTemplate = assertString(product.upgradeCommand, 'upgradeCommand', 240);
  if (!tagTemplate.includes('{version}') || !notesPattern.includes('{version}')) {
    throw new Error('Tag and release-note templates must include {version}');
  }

  const expectedTag = interpolate(tagTemplate, version);
  const tag = options.tag ?? expectedTag;
  assertReleaseTag(tag);
  if (tag !== expectedTag) {
    throw new Error(`Package version ${version} requires tag ${expectedTag}, received ${tag}`);
  }

  const releaseNotesPath = repositoryPath(
    interpolate(notesPattern, version),
    'releaseNotesPattern'
  );
  const releaseDocument = await readReleaseDocument(releaseNotesPath);
  const announcement = releaseDocument.metadata.announcement;
  if (!announcement || typeof announcement !== 'object' || Array.isArray(announcement)) {
    throw new Error(`${notesPattern} must define announcement metadata`);
  }
  if (announcement.productId !== productId) {
    throw new Error(`Announcement productId must equal ${productId}`);
  }
  const headline = assertString(announcement.headline, 'Announcement headline', 160);
  const summary = assertString(announcement.summary, 'Announcement summary', 500);
  if (
    !Array.isArray(announcement.highlights) ||
    announcement.highlights.length < 2 ||
    announcement.highlights.length > MAX_HIGHLIGHTS
  ) {
    throw new Error(`Announcement must define between 2 and ${MAX_HIGHLIGHTS} highlights`);
  }
  const highlights = announcement.highlights.map((highlight, index) => ({
    icon: assertString(highlight?.icon, `Highlight ${index + 1} icon`, 16),
    text: assertString(highlight?.text, `Highlight ${index + 1} text`, 120),
  }));

  return {
    displayName,
    headline,
    highlights,
    productId,
    releaseNotesPath,
    releaseUrl: `https://github.com/${repository}/releases/tag/${encodeURIComponent(tag)}`,
    repository,
    summary,
    tag,
    upgradeCommand: upgradeTemplate.includes('{version}')
      ? interpolate(upgradeTemplate, version)
      : upgradeTemplate,
    version,
  };
}

export function buildDiscordAnnouncement(release) {
  const title = `🚀 ${release.displayName} v${release.version} is here`;
  const highlights = release.highlights
    .map((highlight) => `${highlight.icon} ${highlight.text}`)
    .join('\n');
  const markdown = [
    `# ${title}`,
    '',
    `**${release.headline}**`,
    '',
    release.summary,
    '',
    '## What changed',
    '',
    highlights,
    '',
    '## Upgrade',
    '',
    `\`${release.upgradeCommand}\``,
    '',
    `[Read the full release notes](${release.releaseUrl})`,
    '',
  ].join('\n');
  const payload = {
    allowed_mentions: { parse: [] },
    embeds: [
      {
        color: DISCORD_EMBED_COLOR,
        description: `**${release.headline}**\n\n${release.summary}`,
        fields: [
          { name: 'What changed', value: highlights },
          { name: 'Upgrade', value: `\`${release.upgradeCommand}\`` },
        ],
        footer: { text: 'Workspai · Workspace Intelligence' },
        title,
        url: release.releaseUrl,
      },
    ],
    username: 'Workspai Releases',
  };
  const characterCount = JSON.stringify(payload.embeds).length;
  if (characterCount > 6000) {
    throw new Error(`Discord embed content exceeds its 6000-character limit (${characterCount})`);
  }
  return { markdown, payload, title };
}

export function validateWebhookUrl(value) {
  const webhookUrl = new URL(value);
  const supportedHost =
    webhookUrl.hostname === 'discord.com' || webhookUrl.hostname === 'discordapp.com';
  if (!supportedHost || !/^\/api\/webhooks\/[^/]+\/[^/]+\/?$/u.test(webhookUrl.pathname)) {
    throw new Error('ANNOUNCEMENTS_WEBHOOK_URL is not a supported Discord webhook URL');
  }
  webhookUrl.search = '';
  webhookUrl.hash = '';
  return webhookUrl;
}

export function markerFor(release, messageId) {
  return `<!-- workspai-discord-announcement product=${release.productId} tag=${release.tag} message=${messageId} -->`;
}

export function findMessageId(releaseBody, release) {
  const product = release.productId.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const tag = release.tag.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return releaseBody.match(
    new RegExp(
      `<!-- workspai-discord-announcement product=${product} tag=${tag} message=(\\d+) -->`,
      'u'
    )
  )?.[1];
}

async function requestJson(url, options, label) {
  const response = await fetch(url, options);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}: ${body.slice(0, 500)}`);
  }
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${label} returned a non-JSON response`);
  }
}

async function publishAnnouncement(release, payload) {
  if (!process.env.ANNOUNCEMENTS_WEBHOOK_URL) {
    throw new Error('ANNOUNCEMENTS_WEBHOOK_URL is required for --send');
  }
  if (!process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is required for --send');
  if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY !== release.repository) {
    throw new Error(
      `Workflow repository (${process.env.GITHUB_REPOSITORY}) does not match ${release.repository}`
    );
  }

  const githubHeaders = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const releaseApiUrl = `https://api.github.com/repos/${release.repository}/releases/tags/${release.tag}`;
  const githubRelease = await requestJson(
    releaseApiUrl,
    { headers: githubHeaders },
    'GitHub release lookup'
  );
  const webhookUrl = validateWebhookUrl(process.env.ANNOUNCEMENTS_WEBHOOK_URL);
  const existingMessageId = findMessageId(githubRelease.body ?? '', release);
  let discordMessage;
  let operation;

  if (existingMessageId) {
    const editUrl = new URL(
      `${webhookUrl.toString().replace(/\/$/u, '')}/messages/${existingMessageId}`
    );
    editUrl.searchParams.set('wait', 'true');
    discordMessage = await requestJson(
      editUrl,
      {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      },
      'Discord announcement update'
    );
    operation = 'updated';
  } else {
    webhookUrl.searchParams.set('wait', 'true');
    discordMessage = await requestJson(
      webhookUrl,
      {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
      'Discord announcement publish'
    );
    const messageId = assertString(discordMessage.id, 'Discord message id', 32);
    const marker = markerFor(release, messageId);
    await requestJson(
      `https://api.github.com/repos/${release.repository}/releases/${githubRelease.id}`,
      {
        body: JSON.stringify({
          body: `${(githubRelease.body ?? '').trimEnd()}\n\n${marker}\n`,
        }),
        headers: githubHeaders,
        method: 'PATCH',
      },
      'GitHub release announcement marker update'
    );
    operation = 'published';
  }
  return { messageId: discordMessage.id, operation };
}

async function writeOutput(filePath, contents) {
  const outputPath = path.resolve(filePath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, contents, 'utf8');
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const release = await resolveRelease(options);
  const announcement = buildDiscordAnnouncement(release);
  if (options.output) {
    await writeOutput(options.output, `${JSON.stringify(announcement.payload, null, 2)}\n`);
  }
  if (options.markdownOutput) await writeOutput(options.markdownOutput, announcement.markdown);
  if (options.send) {
    const result = await publishAnnouncement(release, announcement.payload);
    console.log(
      `✅ Discord announcement ${result.operation}: ${announcement.title} (${result.messageId})`
    );
    return;
  }
  if (options.check || (!options.output && !options.markdownOutput)) {
    console.log(`✅ Discord announcement contract passed for ${release.tag}`);
    console.log(`   Product: ${release.displayName} (${release.productId})`);
    console.log(`   Source: ${path.relative(REPOSITORY_ROOT, release.releaseNotesPath)}`);
    console.log(`   Title: ${announcement.title}`);
  }
}

const isEntryPoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isEntryPoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

#!/usr/bin/env node

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

const FIXTURE_IDENTITIES = new Set([
  'alice',
  'dev',
  'example',
  'public',
  'rapid',
  'test',
  'test-user',
  'user',
]);

function normalizedVariants(value) {
  if (!value || value === path.parse(value).root) {
    return [];
  }
  return [...new Set([value, value.replace(/\\/g, '/')])];
}

function isTestFixture(file, identity) {
  return (
    /^(?:src|webview-ui\/src)\/test\//.test(file.replace(/\\/g, '/')) &&
    FIXTURE_IDENTITIES.has(identity.toLowerCase())
  );
}

function lineNumberAt(content, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (content.charCodeAt(cursor) === 10) {
      line += 1;
    }
  }
  return line;
}

export function looksBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8_192));
  return sample.includes(0);
}

export function findLocalPathViolations(
  content,
  file,
  options = { repositoryRoot: process.cwd(), homeDirectory: os.homedir() }
) {
  const violations = [];
  const seen = new Set();
  const add = (index, kind) => {
    const key = `${index}:${kind}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    violations.push({ file, line: lineNumberAt(content, index), kind });
  };

  for (const localRoot of [options.repositoryRoot, options.homeDirectory]) {
    for (const variant of normalizedVariants(localRoot)) {
      let index = content.indexOf(variant);
      while (index >= 0) {
        add(index, localRoot === options.repositoryRoot ? 'repository-root' : 'home-directory');
        index = content.indexOf(variant, index + variant.length);
      }
    }
  }

  for (const pattern of [/Documents[\\/]WOSP[\\/]/gi, /WOSP[\\/]Rapid/gi]) {
    for (const match of content.matchAll(pattern)) {
      add(match.index ?? 0, 'private-workspace-layout');
    }
  }

  const homePatterns = [
    { regex: /\/(?:home|Users)\/([A-Za-z0-9._-]+)(?:[\\/][^\s"'`]*)?/g, kind: 'user-home' },
    {
      regex: /\b[A-Za-z]:[\\/]Users[\\/]([A-Za-z0-9._-]+)(?:[\\/][^\s"'`]*)?/g,
      kind: 'windows-user-home',
    },
  ];
  for (const { regex, kind } of homePatterns) {
    for (const match of content.matchAll(regex)) {
      const identity = match[1] ?? '';
      if (identity === '...' || isTestFixture(file, identity)) {
        continue;
      }
      add(match.index ?? 0, kind);
    }
  }

  return violations;
}

function gitFileList(mode) {
  const args =
    mode === 'staged'
      ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']
      : ['ls-files', '--cached', '--others', '--exclude-standard', '-z'];
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`Unable to index repository files: ${result.stderr || result.error || 'git failed'}`);
  }
  return result.stdout.split('\0').filter(Boolean);
}

function readCandidate(file, mode) {
  try {
    if (mode !== 'staged') {
      return fs.readFileSync(file);
    }
    const result = spawnSync('git', ['show', `:${file}`], {
      encoding: 'buffer',
      maxBuffer: 64 * 1024 * 1024,
    });
    return result.status === 0 ? result.stdout : null;
  } catch {
    return null;
  }
}

export function scanRepository(options = {}) {
  const mode = options.mode === 'staged' ? 'staged' : 'all';
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const homeDirectory = path.resolve(options.homeDirectory ?? os.homedir());
  const violations = [];

  for (const file of gitFileList(mode)) {
    const buffer = readCandidate(file, mode);
    if (!buffer || looksBinary(buffer)) {
      continue;
    }
    violations.push(
      ...findLocalPathViolations(buffer.toString('utf8'), file, {
        repositoryRoot,
        homeDirectory,
      })
    );
  }
  return { mode, violations };
}

function main() {
  const mode = process.argv.includes('--staged') ? 'staged' : 'all';
  const result = scanRepository({ mode });
  if (result.violations.length > 0) {
    console.error(`\nLocal path guard blocked ${result.violations.length} finding(s):`);
    for (const violation of result.violations.slice(0, 50)) {
      console.error(`- ${violation.file}:${violation.line} [${violation.kind}]`);
    }
    if (result.violations.length > 50) {
      console.error(`- ...and ${result.violations.length - 50} more`);
    }
    console.error(
      '\nReplace machine-specific paths with logical tokens such as $WORKSPACE, $PROJECT, $HOME, or neutral /opt/fixtures test data.'
    );
    process.exitCode = 1;
    return;
  }
  console.log(`Local path guard passed (${result.mode} repository content).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}

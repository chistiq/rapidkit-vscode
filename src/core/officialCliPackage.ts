import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

import releasePolicy from '../../contracts/extension-cli-release-policy.v1.json';
import officialClosure from '../../contracts/official-cli-closure.v1.json';
import {
  BundledCliRuntimeError,
  rememberAcquiredCliRuntime,
  rememberAcquiredCliRuntimeFailure,
  type BundledCliRuntime,
} from './bundledCliRuntime';

const CLOSURE_SCHEMA = 'workspai-vscode-official-cli-closure.v1';
const INSTALL_SCHEMA = 'workspai-vscode-official-cli-install.v1';
const MAX_TARBALL_BYTES = 64 * 1024 * 1024;
const DOWNLOAD_CONCURRENCY = 4;
const BLOCK_SIZE = 512;

export type OfficialCliPackageRecord = {
  path: string;
  name: string;
  version: string;
  resolved: string;
  integrity: string;
  optional?: boolean;
};

export type OfficialCliClosure = {
  schemaVersion: typeof CLOSURE_SCHEMA;
  cli: { name: 'workspai'; version: string };
  registry: 'https://registry.npmjs.org';
  packages: OfficialCliPackageRecord[];
};

type PackageFetch = (input: string, init?: RequestInit) => Promise<FetchResponse>;

type AcquireOptions = {
  storageRoot: string;
  closure?: OfficialCliClosure;
  fetchImpl?: PackageFetch;
  onProgress?: (message: string) => void;
};

type FetchResponse = {
  ok: boolean;
  status: number;
  url: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

function fail(code: 'runtime-missing' | 'runtime-corrupt', message: string): never {
  throw new BundledCliRuntimeError(code, message);
}

function closureDigest(closure: OfficialCliClosure): string {
  return crypto.createHash('sha256').update(JSON.stringify(closure)).digest('hex');
}

function assertClosure(closure: OfficialCliClosure): OfficialCliPackageRecord {
  if (
    closure.schemaVersion !== CLOSURE_SCHEMA ||
    closure.registry !== 'https://registry.npmjs.org' ||
    closure.cli?.name !== 'workspai' ||
    closure.cli.version !== releasePolicy.verifiedCliVersion ||
    !Array.isArray(closure.packages) ||
    closure.packages.length === 0
  ) {
    fail(
      'runtime-corrupt',
      `The extension does not have a verified Workspai CLI ${releasePolicy.verifiedCliVersion} download pin.`
    );
  }
  const workspai = closure.packages.find((entry) => entry.path === 'node_modules/workspai');
  if (
    !workspai ||
    workspai.name !== 'workspai' ||
    workspai.version !== closure.cli.version ||
    !workspai.resolved.includes(`/workspai-${closure.cli.version}.tgz`) ||
    !workspai.integrity.startsWith('sha512-')
  ) {
    fail(
      'runtime-corrupt',
      `The verified Workspai CLI ${closure.cli.version} package is missing from the download pin.`
    );
  }
  for (const entry of closure.packages) {
    assertRegistryUrl(entry.resolved);
    if (!entry.integrity.startsWith('sha512-') || !entry.path.startsWith('node_modules/')) {
      fail('runtime-corrupt', `The download pin has an unsafe package entry for ${entry.name}.`);
    }
  }
  return workspai;
}

function assertRegistryUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail('runtime-corrupt', 'The Workspai CLI download pin contains an invalid package URL.');
  }
  if (url.protocol !== 'https:' || url.hostname !== 'registry.npmjs.org') {
    fail('runtime-corrupt', 'Workspai CLI packages can only be downloaded from the npm registry.');
  }
}

function integrityMatches(bytes: Buffer, integrity: string): boolean {
  const token = integrity.trim().split(/\s+/)[0] ?? '';
  const match = /^(sha512)-([A-Za-z0-9+/]+={0,2})$/.exec(token);
  if (!match) {
    return false;
  }
  const actual = Buffer.from(crypto.createHash(match[1]).update(bytes).digest('base64'));
  const expected = Buffer.from(match[2]);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function readTarString(header: Buffer, start: number, length: number): string {
  return header
    .subarray(start, start + length)
    .toString('utf8')
    .replace(/\0.*$/s, '')
    .trim();
}

function readTarOctal(header: Buffer, start: number, length: number): number {
  const text = readTarString(header, start, length).replace(/\s/g, '');
  if (!text) {
    return 0;
  }
  const value = Number.parseInt(text, 8);
  if (!Number.isFinite(value) || value < 0) {
    fail('runtime-corrupt', 'The Workspai CLI package archive has an invalid file size.');
  }
  return value;
}

function tarChecksum(header: Buffer): number {
  let sum = 0;
  for (let index = 0; index < BLOCK_SIZE; index += 1) {
    sum += index >= 148 && index < 156 ? 32 : header[index];
  }
  return sum;
}

function parsePax(body: Buffer): Record<string, string> {
  const text = body.toString('utf8');
  const values: Record<string, string> = {};
  let offset = 0;
  while (offset < text.length) {
    const space = text.indexOf(' ', offset);
    const length = Number.parseInt(text.slice(offset, space), 10);
    if (!Number.isFinite(length) || length <= 0 || space < 0) {
      break;
    }
    const record = text.slice(offset, offset + length);
    const separator = record.indexOf('=');
    if (separator > 0) {
      values[record.slice(record.indexOf(' ') + 1, separator)] = record
        .slice(separator + 1)
        .replace(/\n$/, '');
    }
    offset += length;
  }
  return values;
}

function packageRelativePath(entryName: string): string {
  const normalized = entryName.replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (!normalized.startsWith('package/') && normalized !== 'package') {
    fail('runtime-corrupt', 'The Workspai CLI package archive contains an unexpected root.');
  }
  const relative = normalized === 'package' ? '' : normalized.slice('package/'.length);
  const parts = relative.split('/').filter((part) => part.length > 0 && part !== '.');
  if (parts.some((part) => part === '..')) {
    fail('runtime-corrupt', 'The Workspai CLI package archive contains an unsafe path.');
  }
  return parts.join('/');
}

export function extractNpmPackageTarball(bytes: Buffer, destination: string): void {
  const archive =
    bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b ? zlib.gunzipSync(bytes) : bytes;
  fs.mkdirSync(destination, { recursive: true, mode: 0o755 });
  let offset = 0;
  let pendingPax: Record<string, string> | undefined;
  let extracted = 0;

  while (offset + BLOCK_SIZE <= archive.length) {
    const header = archive.subarray(offset, offset + BLOCK_SIZE);
    offset += BLOCK_SIZE;
    if (header.every((byte) => byte === 0)) {
      break;
    }
    const storedChecksum = readTarOctal(header, 148, 8);
    if (storedChecksum !== tarChecksum(header)) {
      fail('runtime-corrupt', 'The Workspai CLI package archive failed its checksum.');
    }
    const size = readTarOctal(header, 124, 12);
    const dataEnd = offset + size;
    if (dataEnd > archive.length) {
      fail('runtime-corrupt', 'The Workspai CLI package archive is truncated.');
    }
    const body = archive.subarray(offset, dataEnd);
    offset += Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
    const type = header[156];
    if (type === 120 || type === 103) {
      pendingPax = type === 120 ? parsePax(body) : undefined;
      continue;
    }
    const rawName = pendingPax?.path || readTarString(header, 0, 100);
    const prefix = pendingPax?.path ? '' : readTarString(header, 345, 155);
    pendingPax = undefined;
    const entryName = prefix ? `${prefix}/${rawName}` : rawName;
    if (!entryName) {
      continue;
    }
    const relative = packageRelativePath(entryName);
    if (!relative) {
      continue;
    }
    const target = path.resolve(destination, relative);
    const contained = path.relative(destination, target);
    if (!contained || contained.startsWith('..') || path.isAbsolute(contained)) {
      fail('runtime-corrupt', 'The Workspai CLI package archive contains an unsafe path.');
    }
    if (type === 53) {
      fs.mkdirSync(target, { recursive: true, mode: 0o755 });
      continue;
    }
    if (type === 50 || type === 49 || type === 76 || type === 75) {
      fail('runtime-corrupt', 'The Workspai CLI package archive contains an unsupported link.');
    }
    if (type !== 48 && type !== 0) {
      fail('runtime-corrupt', 'The Workspai CLI package archive contains an unsupported entry.');
    }
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o755 });
    fs.writeFileSync(target, body);
    extracted += 1;
  }

  if (extracted === 0) {
    fail('runtime-corrupt', 'The Workspai CLI package archive did not contain any files.');
  }
}

function cacheFile(storageRoot: string, integrity: string): string {
  const name = `${crypto.createHash('sha256').update(integrity).digest('hex')}.tgz`;
  return path.join(storageRoot, 'official-cli', 'tarballs', name);
}

async function readVerifiedTarball(
  entry: OfficialCliPackageRecord,
  storageRoot: string,
  fetchImpl: PackageFetch
): Promise<Buffer> {
  const cached = cacheFile(storageRoot, entry.integrity);
  if (fs.existsSync(cached)) {
    const bytes = fs.readFileSync(cached);
    if (integrityMatches(bytes, entry.integrity)) {
      return bytes;
    }
    fs.rmSync(cached, { force: true });
  }

  let response: FetchResponse;
  try {
    response = (await fetchImpl(entry.resolved, {
      redirect: 'follow',
      signal: AbortSignal.timeout(60_000),
      headers: { 'user-agent': 'workspai-vscode' },
    })) as FetchResponse;
  } catch {
    fail(
      'runtime-missing',
      `Workspai CLI ${releasePolicy.verifiedCliVersion} is not cached and could not be downloaded. Connect to the network and retry.`
    );
  }
  if (!response.ok) {
    fail(
      'runtime-missing',
      `Workspai CLI ${releasePolicy.verifiedCliVersion} is not cached and could not be downloaded. Connect to the network and retry.`
    );
  }
  let finalUrl: URL;
  try {
    finalUrl = new URL(response.url);
  } catch {
    fail('runtime-corrupt', 'The Workspai CLI download returned an invalid address.');
  }
  if (finalUrl.protocol !== 'https:') {
    fail('runtime-corrupt', 'The Workspai CLI download did not stay on HTTPS.');
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_TARBALL_BYTES) {
    fail('runtime-corrupt', `The download for ${entry.name} has an unexpected size.`);
  }
  if (!integrityMatches(bytes, entry.integrity)) {
    fail(
      'runtime-corrupt',
      `The download for ${entry.name}@${entry.version} failed integrity verification.`
    );
  }
  fs.mkdirSync(path.dirname(cached), { recursive: true, mode: 0o700 });
  const temporary = `${cached}.${process.pid}.partial`;
  fs.writeFileSync(temporary, bytes, { mode: 0o600 });
  fs.renameSync(temporary, cached);
  return bytes;
}

function writeLauncher(installRoot: string): string {
  const launcherPath = path.join(installRoot, 'launcher.cjs');
  fs.writeFileSync(
    launcherPath,
    `'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
if (process.versions.electron && !process.defaultApp) {
  Object.defineProperty(process, 'defaultApp', { value: true, configurable: true });
}
const entry = path.join(__dirname, 'node_modules', 'workspai', 'dist', 'index.js');
process.argv[1] = entry;
import(pathToFileURL(entry).href).catch((error) => {
  process.stderr.write(
    'Workspai CLI runtime failed: ' + (error instanceof Error ? error.message : String(error)) + '\\n'
  );
  process.exitCode = 1;
});
`,
    'utf8'
  );
  return launcherPath;
}

function writeTerminalBin(installRoot: string): string {
  const bin = path.join(installRoot, 'terminal-bin');
  fs.mkdirSync(bin, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(bin, 'workspai'),
    `#!/bin/sh
set -eu
if [ -z "\${WORKSPAI_EXTENSION_NODE:-}" ]; then
  echo "Workspai terminal runtime is unavailable. Reload the extension window and retry." >&2
  exit 1
fi
if [ -z "\${WORKSPAI_EXTENSION_CLI_ENTRY:-}" ]; then
  echo "Workspai terminal entry is unavailable. Reload the extension window and retry." >&2
  exit 1
fi
ELECTRON_RUN_AS_NODE=1 WORKSPAI_EXTENSION_RUNTIME=1 WORKSPAI_CLI_RUNTIME_CHANNEL=release \\
  exec "$WORKSPAI_EXTENSION_NODE" "$WORKSPAI_EXTENSION_CLI_ENTRY" "$@"
`,
    { encoding: 'utf8', mode: 0o755 }
  );
  fs.writeFileSync(
    path.join(bin, 'workspai.cmd'),
    `@echo off\r
setlocal\r
if not defined WORKSPAI_EXTENSION_NODE (\r
  echo Workspai terminal runtime is unavailable. Reload the extension window and retry. 1>&2\r
  exit /b 1\r
)\r
if not defined WORKSPAI_EXTENSION_CLI_ENTRY (\r
  echo Workspai terminal entry is unavailable. Reload the extension window and retry. 1>&2\r
  exit /b 1\r
)\r
set "ELECTRON_RUN_AS_NODE=1"\r
set "WORKSPAI_EXTENSION_RUNTIME=1"\r
set "WORKSPAI_CLI_RUNTIME_CHANNEL=release"\r
"%WORKSPAI_EXTENSION_NODE%" "%WORKSPAI_EXTENSION_CLI_ENTRY%" %*\r
exit /b %ERRORLEVEL%\r
`,
    'utf8'
  );
  return bin;
}

function runtimeFromInstall(installRoot: string, version: string): BundledCliRuntime {
  const packageManifest = path.join(installRoot, 'node_modules', 'workspai', 'package.json');
  const packageEntry = path.join(installRoot, 'node_modules', 'workspai', 'dist', 'index.js');
  if (!fs.existsSync(packageManifest) || !fs.existsSync(packageEntry)) {
    fail('runtime-corrupt', 'The cached Workspai CLI is missing its executable entry.');
  }
  const manifest = JSON.parse(fs.readFileSync(packageManifest, 'utf8')) as {
    name?: string;
    version?: string;
  };
  if (manifest.name !== 'workspai' || manifest.version !== version) {
    fail(
      'runtime-corrupt',
      `The cached Workspai CLI is ${String(manifest.name)}@${String(manifest.version)}.`
    );
  }
  return {
    root: installRoot,
    entry: writeLauncher(installRoot),
    version,
    channel: 'release',
    distribution: 'release',
    command: process.execPath,
    argsPrefix: [path.join(installRoot, 'launcher.cjs')],
    terminalBin: writeTerminalBin(installRoot),
    terminalCommand: 'workspai',
    env: {
      ELECTRON_RUN_AS_NODE: '1',
      WORKSPAI_EXTENSION_RUNTIME: '1',
      WORKSPAI_CLI_RUNTIME_CHANNEL: 'release',
    },
  };
}

function installIsComplete(installRoot: string, version: string, digest: string): boolean {
  const markerPath = path.join(installRoot, 'install.json');
  if (!fs.existsSync(markerPath)) {
    return false;
  }
  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8')) as {
      schemaVersion?: string;
      version?: string;
      closureSha256?: string;
    };
    return (
      marker.schemaVersion === INSTALL_SCHEMA &&
      marker.version === version &&
      marker.closureSha256 === digest &&
      fs.existsSync(path.join(installRoot, 'node_modules', 'workspai', 'dist', 'index.js'))
    );
  } catch {
    return false;
  }
}

async function mapPool<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

/**
 * Download the pinned official Workspai CLI and its production dependencies
 * into extension storage, verify each tarball, and return the runtime that
 * executes that copy. A later call with the same pin reuses the cache offline.
 */
export async function acquireOfficialCliRuntime(
  options: AcquireOptions
): Promise<BundledCliRuntime> {
  const closure = options.closure ?? (officialClosure as OfficialCliClosure);
  const workspai = assertClosure(closure);
  const digest = closureDigest(closure);
  const installRoot = path.join(
    path.resolve(options.storageRoot),
    'official-cli',
    workspai.version
  );
  if (installIsComplete(installRoot, workspai.version, digest)) {
    return runtimeFromInstall(installRoot, workspai.version);
  }

  fs.rmSync(installRoot, { recursive: true, force: true });
  fs.mkdirSync(installRoot, { recursive: true, mode: 0o700 });
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const payloads = new Array<Buffer>(closure.packages.length);
  let completed = 0;
  try {
    await mapPool(closure.packages, DOWNLOAD_CONCURRENCY, async (entry, index) => {
      payloads[index] = await readVerifiedTarball(entry, options.storageRoot, fetchImpl);
      completed += 1;
      options.onProgress?.(`Checked ${completed} of ${closure.packages.length} official packages`);
    });
    closure.packages.forEach((entry, index) => {
      extractNpmPackageTarball(payloads[index], path.join(installRoot, ...entry.path.split('/')));
    });
    const runtime = runtimeFromInstall(installRoot, workspai.version);
    const markerPath = path.join(installRoot, 'install.json');
    const temporary = `${markerPath}.partial`;
    fs.writeFileSync(
      temporary,
      `${JSON.stringify(
        {
          schemaVersion: INSTALL_SCHEMA,
          version: workspai.version,
          closureSha256: digest,
          packageCount: closure.packages.length,
        },
        null,
        2
      )}\n`,
      { mode: 0o600 }
    );
    fs.renameSync(temporary, markerPath);
    return runtime;
  } catch (error) {
    fs.rmSync(installRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function ensureOfficialCliRuntime(
  storageRoot: string,
  options: Omit<AcquireOptions, 'storageRoot'> = {}
): Promise<BundledCliRuntime> {
  try {
    const runtime = await acquireOfficialCliRuntime({ ...options, storageRoot });
    rememberAcquiredCliRuntime(runtime);
    return runtime;
  } catch (error) {
    const failure =
      error instanceof BundledCliRuntimeError
        ? error
        : new BundledCliRuntimeError(
            'runtime-missing',
            `Workspai CLI ${releasePolicy.verifiedCliVersion} is not cached and could not be downloaded. Connect to the network and retry.`
          );
    rememberAcquiredCliRuntimeFailure(failure);
    throw failure;
  }
}

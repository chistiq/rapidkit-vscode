import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { afterEach, describe, expect, it } from 'vitest';

import releasePolicy from '../../contracts/extension-cli-release-policy.v1.json';
import officialClosure from '../../contracts/official-cli-closure.v1.json';
import lockfile from '../../package-lock.json';
import {
  BundledCliRuntimeError,
  resetBundledCliRuntimeForTests,
  resolveBundledCliRuntime,
} from '../core/bundledCliRuntime';
import {
  acquireOfficialCliRuntime,
  ensureOfficialCliRuntime,
  extractNpmPackageTarball,
  type OfficialCliClosure,
} from '../core/officialCliPackage';

const createdRoots: string[] = [];

function temporaryDirectory(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-official-cli-'));
  createdRoots.push(root);
  return root;
}

function tarHeader(name: string, size: number, typeByte: number): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, Math.min(name.length, 100), 'utf8');
  header.write('0000644\0', 100, 'ascii');
  header.write('0001750\0', 108, 'ascii');
  header.write('0001750\0', 116, 'ascii');
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 'ascii');
  header.write('00000000000\0', 136, 'ascii');
  header[156] = typeByte;
  header.write('ustar\0', 257, 'ascii');
  header.write('00', 263, 'ascii');
  let sum = 0;
  for (let index = 0; index < header.length; index += 1) {
    sum += index >= 148 && index < 156 ? 32 : header[index];
  }
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'ascii');
  return header;
}

function npmTarball(files: Array<{ name: string; content: string }>): Buffer {
  const parts: Buffer[] = [];
  for (const file of files) {
    const content = Buffer.from(file.content);
    parts.push(tarHeader(`package/${file.name}`, content.length, 48));
    parts.push(content);
    const padding = (512 - (content.length % 512)) % 512;
    if (padding > 0) {
      parts.push(Buffer.alloc(padding));
    }
  }
  parts.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(parts));
}

function sha512(bytes: Buffer): string {
  return `sha512-${crypto.createHash('sha512').update(bytes).digest('base64')}`;
}

function fixtureClosure(): { closure: OfficialCliClosure; bodies: Record<string, Buffer> } {
  const version = releasePolicy.verifiedCliVersion;
  const workspai = npmTarball([
    {
      name: 'package.json',
      content: `${JSON.stringify({ name: 'workspai', version })}\n`,
    },
    { name: 'dist/index.js', content: 'export const runtime = true;\n' },
  ]);
  const dependency = npmTarball([
    {
      name: 'package.json',
      content: `${JSON.stringify({ name: 'example-dep', version: '1.0.0' })}\n`,
    },
    { name: 'index.js', content: 'export const dependency = true;\n' },
  ]);
  const workspaiUrl = `https://registry.npmjs.org/workspai/-/workspai-${version}.tgz`;
  const dependencyUrl = 'https://registry.npmjs.org/example-dep/-/example-dep-1.0.0.tgz';
  return {
    bodies: { [workspaiUrl]: workspai, [dependencyUrl]: dependency },
    closure: {
      schemaVersion: 'workspai-vscode-official-cli-closure.v1',
      cli: { name: 'workspai', version },
      registry: 'https://registry.npmjs.org',
      packages: [
        {
          path: 'node_modules/example-dep',
          name: 'example-dep',
          version: '1.0.0',
          resolved: dependencyUrl,
          integrity: sha512(dependency),
        },
        {
          path: 'node_modules/workspai',
          name: 'workspai',
          version,
          resolved: workspaiUrl,
          integrity: sha512(workspai),
        },
      ],
    },
  };
}

function fetchFrom(bodies: Record<string, Buffer>, calls: { count: number }) {
  return async (input: string) => {
    calls.count += 1;
    const body = bodies[input];
    if (!body) {
      return { ok: false, status: 404, url: input, arrayBuffer: async () => new ArrayBuffer(0) };
    }
    return {
      ok: true,
      status: 200,
      url: input,
      arrayBuffer: async () =>
        body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
    };
  };
}

afterEach(() => {
  resetBundledCliRuntimeForTests();
  for (const root of createdRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('official CLI package acquisition', () => {
  it('pins the committed closure to the verified CLI tarball', () => {
    const locked = (
      lockfile as {
        packages?: Record<string, { version?: string; integrity?: string; resolved?: string }>;
      }
    ).packages?.['node_modules/workspai'];
    const closure = officialClosure as OfficialCliClosure;
    const workspai = closure.packages.find((entry) => entry.path === 'node_modules/workspai');
    expect(closure.cli.version).toBe(releasePolicy.verifiedCliVersion);
    expect(workspai).toMatchObject({
      name: 'workspai',
      version: releasePolicy.verifiedCliVersion,
      integrity: locked?.integrity,
      resolved: locked?.resolved,
    });
    expect(
      closure.packages.every((entry) => entry.resolved.startsWith('https://registry.npmjs.org/'))
    ).toBe(true);
  });

  it('downloads the pinned package once, then runs the cached copy offline', async () => {
    const storage = temporaryDirectory();
    const fixture = fixtureClosure();
    const calls = { count: 0 };
    const runtime = await ensureOfficialCliRuntime(storage, {
      closure: fixture.closure,
      fetchImpl: fetchFrom(fixture.bodies, calls),
    });

    expect(runtime).toMatchObject({
      version: releasePolicy.verifiedCliVersion,
      channel: 'release',
      distribution: 'release',
      command: process.execPath,
      terminalCommand: 'workspai',
    });
    expect(
      fs.existsSync(path.join(runtime.root, 'node_modules', 'workspai', 'dist', 'index.js'))
    ).toBe(true);
    expect(fs.existsSync(path.join(runtime.root, 'node_modules', 'example-dep', 'index.js'))).toBe(
      true
    );
    expect(resolveBundledCliRuntime()?.entry).toBe(runtime.entry);
    expect(calls.count).toBe(2);

    const cached = await acquireOfficialCliRuntime({
      storageRoot: storage,
      closure: fixture.closure,
      fetchImpl: async () => {
        throw new Error('offline');
      },
    });
    expect(cached.version).toBe(runtime.version);
    expect(calls.count).toBe(2);
  });

  it('fails closed when the first run has no network and no cache', async () => {
    const storage = temporaryDirectory();
    const fixture = fixtureClosure();
    await expect(
      acquireOfficialCliRuntime({
        storageRoot: storage,
        closure: fixture.closure,
        fetchImpl: async () => {
          throw new Error('offline');
        },
      })
    ).rejects.toThrow(/could not be downloaded/);
    expect(
      fs.existsSync(path.join(storage, 'official-cli', releasePolicy.verifiedCliVersion))
    ).toBe(false);
  });

  it('rejects a tarball whose bytes do not match the pinned integrity', async () => {
    const storage = temporaryDirectory();
    const fixture = fixtureClosure();
    fixture.closure.packages[1].integrity = `sha512-${'A'.repeat(88)}`;
    await expect(
      acquireOfficialCliRuntime({
        storageRoot: storage,
        closure: fixture.closure,
        fetchImpl: fetchFrom(fixture.bodies, { count: 0 }),
      })
    ).rejects.toBeInstanceOf(BundledCliRuntimeError);
    expect(
      fs.existsSync(
        path.join(storage, 'official-cli', releasePolicy.verifiedCliVersion, 'install.json')
      )
    ).toBe(false);
  });

  it.skipIf(process.env.WORKSPAI_LIVE_CLI_ACQUIRE !== '1')(
    'installs the published closure and executes that CLI',
    async () => {
      const storage = temporaryDirectory();
      const runtime = await acquireOfficialCliRuntime({ storageRoot: storage });
      const output = execFileSync(process.execPath, [...runtime.argsPrefix, '--version'], {
        encoding: 'utf8',
        env: { ...process.env, ...runtime.env },
      });
      expect(output).toContain(releasePolicy.verifiedCliVersion);
    },
    180_000
  );

  it('rejects package archives that try to escape the install directory', () => {
    const destination = temporaryDirectory();
    const outside = path.join(path.dirname(destination), 'official-cli-escaped.txt');
    const archive = npmTarball([{ name: '../../official-cli-escaped.txt', content: 'escaped' }]);
    expect(() => extractNpmPackageTarball(archive, destination)).toThrow(BundledCliRuntimeError);
    expect(fs.existsSync(outside)).toBe(false);
  });
});

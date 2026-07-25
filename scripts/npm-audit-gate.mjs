#!/usr/bin/env node

import { spawnSync } from 'child_process';

const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'];

function parseArgs(argv) {
  const options = {
    level: 'high',
    packageManager: 'npm',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--level') {
      options.level = argv[index + 1] ?? options.level;
      index += 1;
      continue;
    }
    if (arg === '--package-manager') {
      options.packageManager = argv[index + 1] ?? options.packageManager;
      index += 1;
    }
  }
  return options;
}

function normalizeLevel(level) {
  return SEVERITIES.includes(level) ? level : 'high';
}

function emptyCounts() {
  return Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]));
}

export function auditCountsFromReport(report) {
  const counts = emptyCounts();
  const metadataCounts = report?.metadata?.vulnerabilities;
  if (metadataCounts && typeof metadataCounts === 'object') {
    for (const severity of SEVERITIES) {
      const value = metadataCounts[severity];
      counts[severity] = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    }
    return counts;
  }

  const vulnerabilities = report?.vulnerabilities;
  if (vulnerabilities && typeof vulnerabilities === 'object') {
    for (const vulnerability of Object.values(vulnerabilities)) {
      const severity = vulnerability?.severity;
      if (typeof severity === 'string' && severity in counts) {
        counts[severity] += 1;
      }
    }
  }
  return counts;
}

export function auditGateVerdict(report, options = {}) {
  const level = normalizeLevel(options.level ?? 'high');
  const counts = auditCountsFromReport(report);
  const thresholdIndex = SEVERITIES.indexOf(level);
  const blockingSeverities = SEVERITIES.slice(thresholdIndex);
  const blockingCount = blockingSeverities.reduce((sum, severity) => sum + counts[severity], 0);
  return {
    ok: blockingCount === 0,
    level,
    counts,
    blockingSeverities,
    blockingCount,
  };
}

export function resolvePackageManagerInvocation(options = {}) {
  const packageManager = options.packageManager ?? 'npm';
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  if (packageManager !== 'npm') {
    return { command: packageManager, prefixArgs: [] };
  }
  if (typeof env.npm_execpath === 'string' && env.npm_execpath.trim()) {
    return {
      command: env.npm_node_execpath || process.execPath,
      prefixArgs: [env.npm_execpath],
    };
  }
  return {
    command: platform === 'win32' ? 'corepack.cmd' : 'corepack',
    prefixArgs: ['npm'],
  };
}

function parseAuditJson(stdout, stderr) {
  const combined = `${stdout ?? ''}\n${stderr ?? ''}`;
  const firstBrace = combined.indexOf('{');
  const lastBrace = combined.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('npm audit did not return parseable JSON.');
  }
  return JSON.parse(combined.slice(firstBrace, lastBrace + 1));
}

export function runNpmAuditGate(options = {}) {
  const level = normalizeLevel(options.level ?? 'high');
  const packageManager = options.packageManager ?? 'npm';
  const invocation = resolvePackageManagerInvocation({
    packageManager,
    env: options.env ?? process.env,
    platform: options.platform ?? process.platform,
  });
  const result = spawnSync(
    invocation.command,
    [...invocation.prefixArgs, 'audit', '--json', `--audit-level=${level}`],
    {
      cwd: options.cwd ?? process.cwd(),
      encoding: 'utf8',
      shell: (options.platform ?? process.platform) === 'win32',
      env: {
        ...process.env,
        npm_config_fund: 'false',
        npm_config_audit: 'true',
      },
    }
  );

  if (result.error) {
    throw result.error;
  }

  const report = parseAuditJson(result.stdout, result.stderr);
  const verdict = auditGateVerdict(report, { level });
  return {
    ...verdict,
    exitCode: result.status ?? 0,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  try {
    const verdict = runNpmAuditGate(options);
    const summary = JSON.stringify({
      level: verdict.level,
      blockingSeverities: verdict.blockingSeverities,
      blockingCount: verdict.blockingCount,
      counts: verdict.counts,
    });
    if (!verdict.ok) {
      console.error(`npm audit gate failed: ${summary}`);
      process.exitCode = 1;
      return;
    }
    console.log(`npm audit gate passed: ${summary}`);
  } catch (error) {
    console.error(
      `npm audit gate failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

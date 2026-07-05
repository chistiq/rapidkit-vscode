#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const reportPath = path.join(repoRoot, '.rapidkit', 'reports', 'studio-reload-soak-last-run.json');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function checkSourceContains(checks, relativePath, patterns) {
  const source = read(relativePath);
  for (const pattern of patterns) {
    checks.push({
      id: `${relativePath}:${pattern}`,
      file: relativePath,
      pattern,
      passed: source.includes(pattern),
    });
  }
}

const checks = [];

checkSourceContains(checks, 'webview-ui/src/sidebar/SecondarySidebar.tsx', [
  'vscode.getState',
  'vscode.setState',
  'persistedStudioRepairState',
  'studioIncidentHandoffs',
  'studioIncidentPlans',
  'studioIncidentProgress',
  'restoreStudioHandoffFromSession',
  'commandRunCount',
  'resolutionHints',
  'blockerSignature',
  'studio.selectSession',
]);

checkSourceContains(checks, 'webview-ui/src/sidebar/sidebarSessions.ts', [
  'vscode.getState/setState',
  'commandRunCount',
  'resolutionHints',
  'blockerSignature',
]);

checkSourceContains(checks, 'webview-ui/src/sidebar/useChatSessions.ts', ['vscode.getState']);

checkSourceContains(checks, 'webview-ui/src/sidebar/SecondarySidebar.tsx', [
  'StudioActionProgress',
  'StudioRepairResult',
  'StudioRemediationPlan',
]);

checkSourceContains(checks, 'src/test/sidebarSessionContract.test.ts', [
  'routes card and editor sessions with their own context',
  'input.handoff',
]);

checkSourceContains(checks, 'src/test/sidebarStudioReturnState.test.ts', [
  'buildSidebarStudioReturnState',
  'still-blocked',
]);

const failed = checks.filter((check) => !check.passed);
const report = {
  schemaVersion: 'workspai.studio-reload-soak.v1',
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? 'pass' : 'fail',
  summary: {
    passed: checks.length - failed.length,
    failed: failed.length,
    total: checks.length,
  },
  scope: {
    product: 'Workspai VS Code extension',
    surface: 'secondary-sidebar studio',
    scenario: 'reload mid-fix',
  },
  assertions: checks,
  manualSoakPath: [
    'Open a blocker card with Fix by Workspai.',
    'Confirm the Studio session contains the card title, workspace/project label, blocker summary, and first repair action.',
    'Reload the VS Code window before clicking Apply or Verify.',
    'Open Workspai again and confirm the same Studio session is selected.',
    'Confirm the repair plan, blocker signature, commandRunCount, and verify command are still present.',
    'Run Apply or Run check and confirm the next visible state is progress, result, blocked, or done.',
  ],
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (failed.length > 0) {
  console.error(`Studio reload soak failed: ${failed.length}/${checks.length} assertion(s) failed.`);
  for (const check of failed) {
    console.error(`- ${check.file}: missing ${check.pattern}`);
  }
  console.error(`Report: ${reportPath}`);
  process.exit(1);
}

console.log(`Studio reload soak passed: ${checks.length}/${checks.length} assertions.`);
console.log(`Report: ${reportPath}`);

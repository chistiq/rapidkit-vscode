const assert = require('node:assert/strict');
const vscode = require('vscode');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCommand(command, args) {
  try {
    await vscode.commands.executeCommand(command, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${command} failed during VSIX Electron smoke: ${message}`);
  }
}

exports.run = async function run() {
  const extensionId = process.env.WORKSPAI_SMOKE_EXTENSION_ID || 'rapidkit.rapidkit-vscode';
  const extension = vscode.extensions.getExtension(extensionId);
  assert.ok(extension, `Expected packaged extension to be discoverable: ${extensionId}`);

  await extension.activate();
  assert.equal(extension.isActive, true, `Expected packaged extension to activate: ${extensionId}`);

  const commands = await vscode.commands.getCommands(true);
  for (const command of [
    'workspai.openDashboardSection',
    'workspai.openIncidentStudio',
    'workspai.workspaceModel',
    'workspai.workspaceExplain',
    'workspai.workspaceWhy',
    'workspai.workspaceTrace',
  ]) {
    assert.ok(commands.includes(command), `Expected packaged command to be registered: ${command}`);
  }

  await runCommand('workspai.openDashboardSection', {
    section: 'overview',
    source: 'vsix-electron-smoke',
    trigger: 'open-dashboard-overview',
  });
  await wait(500);

  await runCommand('workspai.openDashboardSection', {
    section: 'repair',
    source: 'vsix-electron-smoke',
    trigger: 'open-dashboard-repair',
  });
  await wait(500);

  await runCommand('workspai.openDashboardSection', {
    section: 'operate',
    operateZone: 'intelligence',
    source: 'vsix-electron-smoke',
    trigger: 'open-dashboard-intelligence',
  });
  await wait(700);

  await runCommand('workspai.openDashboardSection', {
    section: 'evidence',
    source: 'vsix-electron-smoke',
    trigger: 'open-dashboard-artifacts',
  });
  await wait(500);

  await runCommand('workspai.openIncidentStudio', {
    initialQuery: 'VSIX Electron smoke: verify Studio can open without runtime crash.',
    source: 'vsix-electron-smoke',
    trigger: 'open-studio',
  });
  await wait(500);
};

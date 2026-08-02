import path from 'node:path';
import * as fs from 'fs-extra';

import { buildShellCommand, isWindowsPlatform } from '../utils/platformCapabilities';

export type CoreUpgradePlan = {
  kind: 'workspace' | 'workspace-repair' | 'workspace-install';
  commands: string[];
  backupPath?: string;
};

function workspacePythonCandidates(workspacePath: string, platform: NodeJS.Platform): string[] {
  return isWindowsPlatform(platform)
    ? [path.join(workspacePath, '.venv', 'Scripts', 'python.exe')]
    : [
        path.join(workspacePath, '.venv', 'bin', 'python'),
        path.join(workspacePath, '.venv', 'bin', 'python3'),
      ];
}

/**
 * Keep RapidKit Core ownership with the selected workspace whenever it has a
 * local Python environment. A broken local environment must be repaired in
 * place; silently upgrading a different pipx installation leaves the
 * workspace unchanged and gives the operator a false success signal.
 */
export async function resolveCoreUpgradePlan(
  workspacePath: string,
  platform: NodeJS.Platform = process.platform
): Promise<CoreUpgradePlan> {
  const venvPath = path.join(workspacePath, '.venv');
  if (await fs.pathExists(venvPath)) {
    const candidates = workspacePythonCandidates(workspacePath, platform);
    for (const python of candidates) {
      if (await fs.pathExists(python)) {
        return {
          kind: 'workspace',
          commands: [
            buildShellCommand(
              python,
              ['-m', 'pip', 'install', '--upgrade', 'rapidkit-core'],
              platform
            ),
          ],
        };
      }
    }

    let backupPath = `${venvPath}.broken`;
    let backupIndex = 2;
    while (await fs.pathExists(backupPath)) {
      backupPath = `${venvPath}.broken-${backupIndex}`;
      backupIndex += 1;
    }
    const bootstrapCommand = isWindowsPlatform(platform) ? 'py' : 'python3';
    const bootstrapArgs = isWindowsPlatform(platform)
      ? ['-3', '-m', 'venv', venvPath]
      : ['-m', 'venv', venvPath];
    const workspacePython = candidates[0];
    return {
      kind: 'workspace-repair',
      backupPath,
      commands: [
        buildShellCommand(
          isWindowsPlatform(platform) ? 'move' : 'mv',
          [venvPath, backupPath],
          platform
        ),
        buildShellCommand(bootstrapCommand, bootstrapArgs, platform),
        buildShellCommand(
          workspacePython,
          ['-m', 'pip', 'install', '--upgrade', 'rapidkit-core'],
          platform
        ),
      ],
    };
  }

  return {
    kind: 'workspace-install',
    commands: [
      buildShellCommand(
        isWindowsPlatform(platform) ? 'py' : 'python3',
        isWindowsPlatform(platform) ? ['-3', '-m', 'venv', venvPath] : ['-m', 'venv', venvPath],
        platform
      ),
      buildShellCommand(
        workspacePythonCandidates(workspacePath, platform)[0],
        ['-m', 'pip', 'install', '--upgrade', 'rapidkit-core'],
        platform
      ),
    ],
  };
}

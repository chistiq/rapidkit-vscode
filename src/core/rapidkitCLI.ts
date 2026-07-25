/**
 * Workspai CLI wrapper with an explicit RapidKit Core compatibility path.
 * Wraps the rapidkit NPM package for use in VS Code extension.
 *
 * Execution uses unpinned `npx --yes workspai ...` (see platformCapabilities).
 * Frontend generators: `create frontend <id>`; backend kits: `create project <kit>`.
 */

import {
  isFrontendScaffoldKit,
  resolveFrontendKitDefinition,
  SCAFFOLD_KIT_IDS,
} from './scaffoldKits';

import { Logger } from '../utils/logger';
import { run } from '../utils/exec';
import { normalizeRapidkitNpmVersion } from '../utils/cliOutputSanitizer';
import {
  buildNpxRapidkitArgs,
  buildRapidkitDisplayCommand,
  getWorkspaceVenvRapidkitCandidates,
} from '../utils/platformCapabilities';
import * as path from 'path';

type ExecaReturnValue = any;

export interface CreateWorkspaceOptions {
  name: string;
  parentPath: string;
  skipGit?: boolean;
  dryRun?: boolean;
  /** Skip optional rapidkit-core/Python engine files during workspace bootstrap. */
  skipPythonEngine?: boolean;
  /** Preferred install backend. Passed as --install-method to npm CLI. */
  installMethod?: 'poetry' | 'venv' | 'pipx';
  /** Bootstrap profile written into .rapidkit/workspace.json. Passed as --profile to npm CLI. */
  profile?:
    | 'minimal'
    | 'python-only'
    | 'node-only'
    | 'go-only'
    | 'java-only'
    | 'dotnet-only'
    | 'polyglot'
    | 'enterprise';
}

export interface CreateProjectOptions {
  name: string;
  kit: (typeof SCAFFOLD_KIT_IDS)[number] | string;
  parentPath: string;
  skipGit?: boolean;
  skipInstall?: boolean;
  dryRun?: boolean;
}

export interface CreateProjectInWorkspaceOptions {
  name: string;
  kit: (typeof SCAFFOLD_KIT_IDS)[number] | string;
  workspacePath: string;
  outputParentPath?: string;
  skipGit?: boolean;
  skipInstall?: boolean;
}

export interface BuildProjectScaffoldArgsInput {
  kit: string;
  name: string;
  outputDir: string;
  skipGit?: boolean;
  skipInstall?: boolean;
}

/**
 * Frontend generators use canonical `create frontend <id>` (official ecosystem generators).
 * Backend kits use `create project <kit>`; npm runs init separately when needed.
 */
export function buildProjectScaffoldArgs(input: BuildProjectScaffoldArgsInput): string[] {
  const frontendDefinition = resolveFrontendKitDefinition(input.kit);
  if (frontendDefinition || isFrontendScaffoldKit(input.kit)) {
    const framework =
      frontendDefinition?.framework ??
      String(input.kit)
        .replace(/^frontend\./, '')
        .trim();
    const args = [
      'create',
      'frontend',
      framework,
      input.name,
      '--output',
      input.outputDir,
      '--yes',
    ];
    if (input.skipGit) {
      args.push('--skip-git');
    }
    if (input.skipInstall) {
      args.push('--skip-install');
    }
    return args;
  }

  const args = ['create', 'project', input.kit, input.name, '--yes'];
  if (input.skipGit) {
    args.push('--skip-git');
  }
  if (input.skipInstall) {
    args.push('--skip-install');
  }
  return args;
}

/** User-facing command text — omits pinned npx package resolution. */
export function formatRapidkitCommandForDisplay(args: string[]): string {
  return buildRapidkitDisplayCommand(args);
}

export class WorkspaiCLI {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  private buildPortableNpxRapidkitArgs(args: string[]): string[] {
    return buildNpxRapidkitArgs(args);
  }

  /**
   * Create a new RapidKit workspace using npm package
   * Uses the canonical first-install-safe Workspai CLI command.
   * Creates workspace at the specified parent path
   */
  async createWorkspace(options: CreateWorkspaceOptions): Promise<ExecaReturnValue> {
    const args = ['create', 'workspace', options.name, '--yes', '--output', options.parentPath];

    if (options.installMethod) {
      args.push('--install-method', options.installMethod);
    }

    if (options.profile) {
      args.push('--profile', options.profile);
    }

    if (options.skipPythonEngine) {
      args.push('--skip-python-engine');
    }

    if (options.skipGit) {
      args.push('--skip-git');
    }

    if (options.dryRun) {
      args.push('--dry-run');
    }

    this.logger.info(
      'Creating workspace:',
      formatRapidkitCommandForDisplay(args),
      'at',
      options.parentPath
    );

    const runOptions = {
      cwd: options.parentPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FORCE_COLOR: '1',
      },
    };
    return await run('npx', this.buildPortableNpxRapidkitArgs(args), runOptions);
  }

  /**
   * Create a standalone project (Direct mode)
   * Uses core: npx --yes --package rapidkit rapidkit create project <kit> <project-name> [--skip-git] [--skip-install]
   */
  async createProject(options: CreateProjectOptions): Promise<ExecaReturnValue> {
    const args = buildProjectScaffoldArgs({
      kit: options.kit,
      name: options.name,
      outputDir: options.parentPath,
      skipGit: options.skipGit,
      skipInstall: options.skipInstall,
    });

    this.logger.info('Creating project:', formatRapidkitCommandForDisplay(args));

    const result = await run('npx', this.buildPortableNpxRapidkitArgs(args), {
      cwd: options.parentPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FORCE_COLOR: '1',
      },
    });

    if (result.exitCode === 0 && !options.skipInstall && !isFrontendScaffoldKit(options.kit)) {
      const projectPath = (await import('path')).join(options.parentPath, options.name);
      await run('npx', this.buildPortableNpxRapidkitArgs(['init', projectPath]), {
        cwd: options.parentPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          FORCE_COLOR: '1',
        },
      });
    }

    return result;
  }

  /**
   * Create a project inside an existing workspace.
   * Runs from workspace dir: npx --yes --package rapidkit rapidkit create project <kit> <project-name>
   * So project is created at <workspacePath>/<project-name>.
   */
  async createProjectInWorkspace(
    options: CreateProjectInWorkspaceOptions
  ): Promise<ExecaReturnValue> {
    const outputParentPath = path.resolve(options.outputParentPath ?? options.workspacePath);
    const workspacePath = path.resolve(options.workspacePath);
    const relativeOutput = path.relative(workspacePath, outputParentPath);
    const outputInsideWorkspace =
      relativeOutput === '' ||
      (!relativeOutput.startsWith('..') && !path.isAbsolute(relativeOutput));
    if (!outputInsideWorkspace) {
      throw new Error(
        `Project output path must stay inside the workspace. output=${outputParentPath} workspace=${workspacePath}`
      );
    }
    const args = buildProjectScaffoldArgs({
      kit: options.kit,
      name: options.name,
      outputDir: '.',
      skipGit: options.skipGit,
      skipInstall: options.skipInstall,
    });

    this.logger.info(
      'Creating project in workspace:',
      formatRapidkitCommandForDisplay(args),
      '(cwd:',
      outputParentPath + ', workspace:',
      workspacePath + ')'
    );

    const result = await run('npx', this.buildPortableNpxRapidkitArgs(args), {
      cwd: outputParentPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FORCE_COLOR: '1',
      },
    });

    if (result.exitCode === 0 && !options.skipInstall && !isFrontendScaffoldKit(options.kit)) {
      const projectPath = path.join(outputParentPath, options.name);

      this.logger.info('Running rapidkit init in project:', projectPath);

      // Run init from project directory (not workspace)
      await run('npx', this.buildPortableNpxRapidkitArgs(['init']), {
        cwd: projectPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          FORCE_COLOR: '1',
        },
      });
    }

    return result;
  }

  /**
   * Check if the Workspai npm CLI is available.
   */
  async isAvailable(): Promise<boolean> {
    // Prefer direct `workspai` binary if available (user-installed global),
    // fallback to npx otherwise. This avoids environment/path
    // differences between VS Code extension host and the user's interactive shell.
    try {
      // Try direct executable first
      const direct = await run('workspai', ['--version'], { stdio: 'pipe', timeout: 3000 });
      if (direct && typeof direct.stdout === 'string' && direct.stdout.trim()) {
        return true;
      }
    } catch {
      // ignore and try npx
    }

    try {
      await run('npx', this.buildPortableNpxRapidkitArgs(['--version']), {
        stdio: 'pipe',
        timeout: 5000,
      });
      return true;
    } catch (error) {
      this.logger.debug('Workspai CLI not available', error);
      return false;
    }
  }

  /**
   * Get the Workspai npm package version.
   */
  async getVersion(): Promise<string | null> {
    try {
      // Prefer direct binary
      const direct = await run('workspai', ['--version'], { stdio: 'pipe', timeout: 3000 });
      if (direct && direct.stdout) {
        return normalizeRapidkitNpmVersion(direct.stdout);
      }
    } catch {
      // ignore
    }

    try {
      const result = await run('npx', this.buildPortableNpxRapidkitArgs(['--version']), {
        stdio: 'pipe',
        timeout: 5000,
      });
      return normalizeRapidkitNpmVersion(result.stdout);
    } catch (error) {
      this.logger.error('Failed to get Workspai CLI version', error);
      return null;
    }
  }

  /**
   * Run arbitrary rapidkit command
   */
  async run(
    args: string[],
    cwd?: string,
    useNpx = true,
    preferredExecutable?: string
  ): Promise<ExecaReturnValue> {
    this.logger.debug('Running Workspai CLI with args:', args);
    const workingDir = cwd || process.cwd();

    if (preferredExecutable) {
      try {
        return await run(preferredExecutable, args, {
          cwd: workingDir,
          stdio: 'pipe',
        });
      } catch (error) {
        this.logger.warn(
          'Preferred workspace rapidkit executable failed; falling back to discovery chain.',
          error
        );
      }
    }

    if (useNpx) {
      try {
        return await run('npx', this.buildPortableNpxRapidkitArgs(args), {
          cwd: workingDir,
          stdio: 'pipe',
        });
      } catch (error) {
        this.logger.error('Workspai npm CLI execution failed.', error);
        throw error;
      }
    }

    // Explicit Python/Core compatibility path. This is never an implicit npm fallback.
    let currentDir = workingDir;
    let venvRapidkit: string | null = null;
    const fs = require('fs');

    // Walk up to 3 levels to find .venv (handles project inside workspace)
    for (let i = 0; i < 3; i++) {
      const candidatePaths = getWorkspaceVenvRapidkitCandidates(currentDir);

      try {
        for (const candidate of candidatePaths) {
          if (fs.existsSync(candidate)) {
            venvRapidkit = candidate;
            this.logger.debug('Found workspace rapidkit:', venvRapidkit);
            break;
          }
        }
        if (venvRapidkit) {
          break;
        }
      } catch {
        // Continue searching
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break;
      } // Reached root
      currentDir = parentDir;
    }

    // If found workspace venv rapidkit, use it
    if (venvRapidkit) {
      try {
        return await run(venvRapidkit, args, {
          cwd: workingDir,
          stdio: 'pipe',
        });
      } catch (e) {
        this.logger.error('Workspace rapidkit execution failed:', e);
        // Continue to fallback options
      }
    } else {
      this.logger.debug('Workspace .venv rapidkit runner not found, trying global rapidkit');
    }

    // Priority 2: Global rapidkit binary (may be Python core — last resort before failure).
    return await run('rapidkit', args, {
      cwd: workingDir,
      stdio: 'pipe',
    });
  }

  /**
   * Add a module to a project from the project directory.
   * Must be run with cwd = project directory (not workspace root).
   * The npm package will detect the project and workspace automatically.
   */
  async addModule(projectPath: string, moduleSlug: string): Promise<ExecaReturnValue> {
    this.logger.info('Adding module to project:', { projectPath, moduleSlug });

    // Run from project directory - npm package will auto-detect workspace
    // Equivalent command: npx --yes --package workspai workspai add module <moduleSlug>
    return await this.run(['add', 'module', moduleSlug], projectPath, true);
  }
}

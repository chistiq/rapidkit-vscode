/**
 * RapidKit CLI Wrapper
 * Wraps the rapidkit NPM package for use in VS Code extension.
 *
 * Uses the current npm workflow (no deprecated --template):
 * - Workspace: npx --yes --package rapidkit rapidkit <workspace-name> [--yes] [--skip-git]
 * - Project:   npx --yes --package rapidkit rapidkit create project <kit> <name> --output <dir> [--yes] [--skip-git] [--skip-install]
 *   Kit slugs: fastapi.standard, fastapi.ddd, nestjs.standard, gofiber.standard,
 *   gogin.standard, springboot.standard, dotnet.webapi.clean.
 */

import { Logger } from '../utils/logger';
import { run } from '../utils/exec';
import {
  buildNpxRapidkitArgs,
  getWorkspaceVenvRapidkitCandidates,
} from '../utils/platformCapabilities';
import * as path from 'path';

type ExecaReturnValue = any;

export interface CreateWorkspaceOptions {
  name: string;
  parentPath: string;
  skipGit?: boolean;
  dryRun?: boolean;
  /** Preferred install backend. Passed as --install-method to npm CLI. */
  installMethod?: 'poetry' | 'venv' | 'pipx';
  /** Bootstrap profile written into .rapidkit/workspace.json. Passed as --profile to npm CLI. */
  profile?:
    | 'minimal'
    | 'python-only'
    | 'node-only'
    | 'go-only'
    | 'java-only'
    | 'polyglot'
    | 'enterprise';
}

export interface CreateProjectOptions {
  name: string;
  kit: string; // Kit name (e.g., 'fastapi.standard', 'nestjs.standard', 'gofiber.standard', 'dotnet.webapi.clean')
  parentPath: string;
  skipGit?: boolean;
  skipInstall?: boolean;
  dryRun?: boolean;
}

export interface CreateProjectInWorkspaceOptions {
  name: string;
  kit: string; // Kit name (e.g., 'fastapi.standard', 'nestjs.standard', 'gofiber.standard', 'dotnet.webapi.clean')
  workspacePath: string;
  skipGit?: boolean;
  skipInstall?: boolean;
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
   * Uses: npx --yes --package rapidkit rapidkit <workspace-name> [--yes] [--skip-git]
   * Creates workspace at the specified parent path
   */
  async createWorkspace(options: CreateWorkspaceOptions): Promise<ExecaReturnValue> {
    // Use: npx --yes --package rapidkit rapidkit create workspace <name> --yes  (skip interactive prompts)
    const args = ['create', 'workspace', options.name, '--yes'];

    if (options.installMethod) {
      args.push('--install-method', options.installMethod);
    }

    if (options.profile) {
      args.push('--profile', options.profile);
    }

    if (options.skipGit) {
      args.push('--skip-git');
    }

    if (options.dryRun) {
      args.push('--dry-run');
    }

    this.logger.info('Creating workspace with npx:', args.join(' '), 'at', options.parentPath);

    return await run('npx', this.buildPortableNpxRapidkitArgs(args), {
      cwd: options.parentPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FORCE_COLOR: '1',
      },
    });
  }

  /**
   * Create a standalone project (Direct mode)
   * Uses core: npx --yes --package rapidkit rapidkit create project <kit> <project-name> --output <dir> [--skip-git] [--skip-install]
   */
  async createProject(options: CreateProjectOptions): Promise<ExecaReturnValue> {
    const args = [
      'create',
      'project',
      options.kit,
      options.name,
      '--output',
      options.parentPath,
      '--install-essentials',
    ];

    if (options.skipGit) {
      args.push('--skip-git');
    }
    if (options.skipInstall) {
      args.push('--skip-install');
    }

    this.logger.info('Creating project with npx (core):', ['npx', ...args].join(' '));

    const result = await run('npx', this.buildPortableNpxRapidkitArgs(args), {
      cwd: options.parentPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FORCE_COLOR: '1',
      },
    });

    if (!options.skipInstall) {
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
   * Runs from workspace dir: npx --yes --package rapidkit rapidkit create project <kit> <project-name> --output .
   * So project is created at <workspacePath>/<project-name>.
   */
  async createProjectInWorkspace(
    options: CreateProjectInWorkspaceOptions
  ): Promise<ExecaReturnValue> {
    const args = [
      'create',
      'project',
      options.kit,
      options.name,
      '--output',
      '.',
      '--install-essentials',
    ];

    if (options.skipGit) {
      args.push('--skip-git');
    }
    if (options.skipInstall) {
      args.push('--skip-install');
    }

    this.logger.info(
      'Creating project in workspace (core):',
      ['npx', ...args].join(' '),
      '(cwd:',
      options.workspacePath + ')'
    );

    const result = await run('npx', this.buildPortableNpxRapidkitArgs(args), {
      cwd: options.workspacePath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FORCE_COLOR: '1',
      },
    });

    if (!options.skipInstall) {
      const path = await import('path');
      const projectPath = path.join(options.workspacePath, options.name);

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
   * Check if rapidkit CLI is available
   */
  async isAvailable(): Promise<boolean> {
    // Prefer direct `rapidkit` binary if available (user-installed global),
    // fallback to `npx --yes --package rapidkit rapidkit` otherwise. This avoids environment/path
    // differences between VS Code extension host and the user's interactive shell.
    try {
      // Try direct executable first
      const direct = await run('rapidkit', ['--version'], { stdio: 'pipe', timeout: 3000 });
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
      this.logger.debug('RapidKit CLI not available', error);
      return false;
    }
  }

  /**
   * Get RapidKit npm package version
   */
  async getVersion(): Promise<string | null> {
    try {
      // Prefer direct binary
      const direct = await run('rapidkit', ['--version'], { stdio: 'pipe', timeout: 3000 });
      if (direct && direct.stdout) {
        return direct.stdout.trim();
      }
    } catch {
      // ignore
    }

    try {
      const result = await run('npx', this.buildPortableNpxRapidkitArgs(['--version']), {
        stdio: 'pipe',
        timeout: 5000,
      });
      return result.stdout.trim();
    } catch (error) {
      this.logger.error('Failed to get RapidKit version', error);
      return null;
    }
  }

  /**
   * Run arbitrary rapidkit command
   */
  async run(args: string[], cwd?: string, useNpx = true): Promise<ExecaReturnValue> {
    this.logger.debug('Running rapidkit with args:', args);
    const workingDir = cwd || process.cwd();

    // Priority 1: Try to find workspace .venv rapidkit runner (walk up from project to workspace root)
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

    // Priority 2: Try global rapidkit binary
    if (useNpx) {
      try {
        return await run('rapidkit', args, {
          cwd: workingDir,
          stdio: 'pipe',
        });
      } catch (e) {
        this.logger.debug('Direct rapidkit binary failed, falling back to npx', e);
        // Priority 3: Fall back to npx (but use workspace's rapidkit if available)
        this.logger.warn('⚠️ Falling back to npx - may use different rapidkit version!');
        return await run('npx', this.buildPortableNpxRapidkitArgs(args), {
          cwd: workingDir,
          stdio: 'pipe',
        });
      }
    } else {
      return await run('rapidkit', args, {
        cwd: workingDir,
        stdio: 'pipe',
      });
    }
  }

  /**
   * Add a module to a project from the project directory.
   * Must be run with cwd = project directory (not workspace root).
   * The npm package will detect the project and workspace automatically.
   */
  async addModule(projectPath: string, moduleSlug: string): Promise<ExecaReturnValue> {
    this.logger.info('Adding module to project:', { projectPath, moduleSlug });

    // Run from project directory - npm package will auto-detect workspace
    // Equivalent command from that directory: npx --yes --package rapidkit rapidkit add module <moduleSlug>
    return await this.run(['add', 'module', moduleSlug], projectPath, true);
  }
}

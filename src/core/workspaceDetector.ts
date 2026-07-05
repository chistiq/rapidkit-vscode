/**
 * Workspace Detector - Detects Workspai projects in the workspace
 */

import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import { WorkspaiProject } from '../types';
import { Logger } from '../utils/logger';
import { hasWorkspaceRootMarkers } from './workspacePaths';

export interface DetectedWorkspaceRoot {
  name: string;
  path: string;
}

export class WorkspaceDetector {
  private static instance: WorkspaceDetector;
  private logger = Logger.getInstance();
  private projects: WorkspaiProject[] = [];

  private constructor() {}

  public static getInstance(): WorkspaceDetector {
    if (!WorkspaceDetector.instance) {
      WorkspaceDetector.instance = new WorkspaceDetector();
    }
    return WorkspaceDetector.instance;
  }

  /**
   * Detect all Workspai projects in workspace
   */
  public async detectRapidKitProjects(): Promise<boolean> {
    if (!vscode.workspace.workspaceFolders) {
      return false;
    }

    this.projects = [];

    for (const folder of vscode.workspace.workspaceFolders) {
      const foundProjects = await this.scanDirectory(folder.uri.fsPath);
      this.projects.push(...foundProjects);
    }

    this.logger.info(`Detected ${this.projects.length} Workspai project(s)`);
    return this.projects.length > 0;
  }

  /**
   * Detect open VS Code folders that are already governed workspace roots but
   * may not be registered in the Workspai workspace registry yet.
   */
  public async detectWorkspaceRoots(): Promise<DetectedWorkspaceRoot[]> {
    if (!vscode.workspace.workspaceFolders) {
      return [];
    }

    const rootsByPath = new Map<string, DetectedWorkspaceRoot>();
    for (const folder of vscode.workspace.workspaceFolders) {
      const workspacePath = path.resolve(folder.uri.fsPath);
      if (!hasWorkspaceRootMarkers(workspacePath)) {
        continue;
      }
      rootsByPath.set(workspacePath, {
        name: path.basename(workspacePath),
        path: workspacePath,
      });
    }

    return Array.from(rootsByPath.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Scan directory for Workspai projects
   */
  private async scanDirectory(dirPath: string): Promise<WorkspaiProject[]> {
    const projects: WorkspaiProject[] = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const projectPath = path.join(dirPath, entry.name);

          // Check if it's a RapidKit project
          if (await this.isRapidKitProject(projectPath)) {
            const project = await this.analyzeProject(projectPath);
            if (project) {
              projects.push(project);
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to scan directory ${dirPath}`, error);
    }

    return projects;
  }

  /**
   * Check if directory is a Workspai project
   */
  private async isRapidKitProject(dirPath: string): Promise<boolean> {
    // Strong markers created by RapidKit
    const strongIndicators = [
      path.join('.rapidkit', 'project.json'),
      path.join('.rapidkit', 'context.json'),
    ];
    for (const indicator of strongIndicators) {
      if (await fs.pathExists(path.join(dirPath, indicator))) {
        return true;
      }
    }

    // Fallback: require a .rapidkit directory plus at least one language hint.
    const hasRapidkitDir = await fs.pathExists(path.join(dirPath, '.rapidkit'));
    if (!hasRapidkitDir) {
      return false;
    }

    const weakIndicators = [
      'pyproject.toml',
      'package.json',
      'go.mod',
      'go.sum',
      'pom.xml',
      'build.gradle',
      'build.gradle.kts',
      path.join('src', 'main.py'),
      path.join('src', 'app.ts'),
      path.join('src', 'main', 'java'),
      path.join('cmd', 'main.go'),
      path.join('main.go'),
    ];
    for (const indicator of weakIndicators) {
      if (await fs.pathExists(path.join(dirPath, indicator))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Analyze project to extract metadata
   */
  private async analyzeProject(projectPath: string): Promise<WorkspaiProject | null> {
    try {
      const projectName = path.basename(projectPath);
      let type: WorkspaiProject['type'] = 'fastapi';
      let kit = 'unknown';
      const modules: string[] = [];

      // ── Bug fix 1: Read kit_name directly from .rapidkit/project.json when present.
      // project.json is the authoritative source written by the CLI at project creation.
      const rapidkitDir = path.join(projectPath, '.rapidkit');
      const projectJsonPath = path.join(rapidkitDir, 'project.json');
      if (await fs.pathExists(projectJsonPath)) {
        try {
          const projectJson = await fs.readJson(projectJsonPath);
          if (typeof projectJson.kit_name === 'string' && projectJson.kit_name !== '') {
            kit = projectJson.kit_name;
            // Derive type from kit_name prefix so downstream logic is consistent.
            if (kit.startsWith('fastapi')) {
              type = 'fastapi';
            } else if (kit.startsWith('nestjs')) {
              type = 'nestjs';
            } else if (
              kit.startsWith('gofiber') ||
              kit.startsWith('gogin') ||
              kit.startsWith('go')
            ) {
              type = 'go';
            } else if (kit.startsWith('springboot')) {
              type = 'springboot';
            } else if (kit.startsWith('dotnet.')) {
              type = 'dotnet';
            }
          }
        } catch {
          // project.json unreadable — fall through to heuristic detection below
        }
      }

      // ── Heuristic detection (only runs when project.json didn't give us a kit) ──

      const goModPath = path.join(projectPath, 'go.mod');
      const goSumPath = path.join(projectPath, 'go.sum');
      const goMainPath = path.join(projectPath, 'main.go');
      const goCmdMainPath = path.join(projectPath, 'cmd', 'main.go');

      if (
        kit === 'unknown' &&
        ((await fs.pathExists(goModPath)) ||
          (await fs.pathExists(goSumPath)) ||
          (await fs.pathExists(goMainPath)) ||
          (await fs.pathExists(goCmdMainPath)))
      ) {
        type = 'go';
        try {
          if (await fs.pathExists(goModPath)) {
            const content = (await fs.readFile(goModPath, 'utf-8')).toLowerCase();

            // Detect by real framework dependencies in go.mod.
            if (content.includes('github.com/gofiber/fiber')) {
              kit = 'gofiber.standard';
            } else if (content.includes('github.com/gin-gonic/gin')) {
              kit = 'gogin.standard';
            } else {
              kit = 'go.standard';
            }
          } else {
            kit = 'go.standard';
          }
        } catch {
          kit = 'go.standard';
        }
      }

      const pomXmlPath = path.join(projectPath, 'pom.xml');
      const gradlePath = path.join(projectPath, 'build.gradle');
      const gradleKtsPath = path.join(projectPath, 'build.gradle.kts');
      const javaSrcPath = path.join(projectPath, 'src', 'main', 'java');

      if (
        kit === 'unknown' &&
        type !== 'go' &&
        ((await fs.pathExists(pomXmlPath)) ||
          (await fs.pathExists(gradlePath)) ||
          (await fs.pathExists(gradleKtsPath)) ||
          (await fs.pathExists(javaSrcPath)))
      ) {
        type = 'springboot';
        kit = 'springboot.standard';
      }

      const hasDotnetProject =
        (await this.hasFileWithExtension(projectPath, '.csproj')) ||
        (await this.hasFileWithExtension(projectPath, '.sln'));

      if (kit === 'unknown' && type !== 'go' && type !== 'springboot' && hasDotnetProject) {
        type = 'dotnet';
        kit = 'dotnet.webapi.clean';
      }

      // Check pyproject.toml for FastAPI
      const pyprojectPath = path.join(projectPath, 'pyproject.toml');
      if (
        kit === 'unknown' &&
        type !== 'go' &&
        type !== 'springboot' &&
        type !== 'dotnet' &&
        (await fs.pathExists(pyprojectPath))
      ) {
        type = 'fastapi';
        const content = await fs.readFile(pyprojectPath, 'utf-8');
        // Bug fix 2: case-insensitive match — pyproject.toml may say "RapidKit" (mixed case)
        if (content.toLowerCase().includes('rapidkit')) {
          kit = 'fastapi.standard';
        }
      }

      // Check package.json for NestJS
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (
        kit === 'unknown' &&
        type !== 'go' &&
        type !== 'springboot' &&
        type !== 'fastapi' &&
        type !== 'dotnet' &&
        (await fs.pathExists(packageJsonPath))
      ) {
        type = 'nestjs';
        const packageJson = await fs.readJson(packageJsonPath);
        if (packageJson.dependencies?.['@nestjs/core']) {
          kit = 'nestjs.standard';
        }
      }

      // ── Bug fix 3: Read modules from .rapidkit/vendor/ subdirectory names.
      // The CLI stores installed modules as directories under vendor/, not in modules.json.
      if (await fs.pathExists(rapidkitDir)) {
        const vendorPath = path.join(rapidkitDir, 'vendor');
        if (await fs.pathExists(vendorPath)) {
          try {
            const entries = await fs.readdir(vendorPath, { withFileTypes: true });
            modules.push(...entries.filter((e) => e.isDirectory()).map((e) => e.name));
          } catch {
            // vendor unreadable — leave modules empty
          }
        }
        // Fallback: legacy modules.json (kept for backwards compatibility)
        if (modules.length === 0) {
          const modulesPath = path.join(rapidkitDir, 'modules.json');
          if (await fs.pathExists(modulesPath)) {
            const modulesData = await fs.readJson(modulesPath);
            modules.push(...(modulesData.installed || []));
          }
        }
      }

      return {
        name: projectName,
        path: projectPath,
        type,
        kit,
        modules,
        isValid: true,
      };
    } catch (error) {
      this.logger.error(`Failed to analyze project ${projectPath}`, error);
      return null;
    }
  }

  /**
   * Get all detected projects
   */
  public getProjects(): WorkspaiProject[] {
    return this.projects;
  }

  /**
   * Get project by path
   */
  public getProject(projectPath: string): WorkspaiProject | undefined {
    return this.projects.find((p) => p.path === projectPath);
  }

  /**
   * Refresh project detection
   */
  public async refresh(): Promise<void> {
    await this.detectRapidKitProjects();
  }

  private async hasFileWithExtension(rootPath: string, extension: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(rootPath, { withFileTypes: true });
      return entries.some((entry) => entry.isFile() && entry.name.endsWith(extension));
    } catch {
      return false;
    }
  }
}

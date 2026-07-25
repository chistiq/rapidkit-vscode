import path from 'node:path';
import fs from 'fs-extra';

import { CoreVersionService } from '../../core/coreVersionService';
import { WorkspaceManager } from '../../core/workspaceManager';
import {
  resolveWorkspaceArtifactPath,
  resolveWorkspaceReportsDir,
} from '../../core/workspaceIntelligencePaths';
import { hasRapidkitProjectMarkers } from '../../core/workspacePaths';

export type RecentWorkspaceProjectStats = {
  fastapi?: number;
  nestjs?: number;
  springboot?: number;
  go?: number;
  dotnet?: number;
};

export type RecentWorkspaceEntry = {
  name: string;
  path: string;
  lastAccessed?: number;
  coreVersion?: string;
  coreLatestVersion?: string;
  coreStatus?:
    | 'ok'
    | 'outdated'
    | 'not-installed'
    | 'update-available'
    | 'up-to-date'
    | 'error'
    | 'deprecated';
  coreLocation?: 'workspace' | 'global' | 'pipx';
  lastModified?: number;
  projectCount?: number;
  projectStats?: RecentWorkspaceProjectStats;
  bootstrapProfile?:
    | 'minimal'
    | 'python-only'
    | 'node-only'
    | 'go-only'
    | 'java-only'
    | 'dotnet-only'
    | 'polyglot'
    | 'enterprise';
  dependencySharingMode?: 'isolated' | 'shared-runtime-caches' | 'shared-node-deps';
  policyMode?: 'warn' | 'strict';
  complianceStatus?: 'passing' | 'failing' | 'unknown';
  mirrorStatus?: 'synced' | 'stale' | 'not-configured';
};

export type RecentWorkspacesHost = {
  detectProjectType: (
    projectPath: string
  ) => Promise<'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet' | null>;
};

export async function buildRecentWorkspaces(
  host: RecentWorkspacesHost
): Promise<RecentWorkspaceEntry[]> {
  try {
    const workspaceManager = WorkspaceManager.getInstance();
    const versionService = CoreVersionService.getInstance();
    const workspaces = workspaceManager.getWorkspaces();

    const enrichedWorkspaces = Promise.all(
      workspaces.map(async (ws) => {
        try {
          const versionInfo = await versionService.getVersionInfo(ws.path);

          let lastModified: number | undefined;
          let projectCount: number | undefined;
          let projectStats: RecentWorkspaceProjectStats | undefined;
          try {
            const stats = await fs.stat(ws.path);
            lastModified = stats.mtimeMs;

            const entries = await fs.readdir(ws.path, { withFileTypes: true });
            const statsCounter = { fastapi: 0, nestjs: 0, springboot: 0, go: 0, dotnet: 0 };
            let count = 0;

            for (const entry of entries) {
              if (entry.isDirectory() && !entry.name.startsWith('.')) {
                const projectPath = path.join(ws.path, entry.name);

                const hasRapidKitMarker = hasRapidkitProjectMarkers(projectPath);

                if (hasRapidKitMarker) {
                  count++;
                  const type = await host.detectProjectType(projectPath);
                  if (type === 'fastapi') {
                    statsCounter.fastapi++;
                  } else if (type === 'nestjs') {
                    statsCounter.nestjs++;
                  } else if (type === 'springboot') {
                    statsCounter.springboot++;
                  } else if (type === 'go') {
                    statsCounter.go++;
                  } else if (type === 'dotnet') {
                    statsCounter.dotnet++;
                  }
                } else if (await fs.pathExists(path.join(projectPath, 'pyproject.toml'))) {
                  count++;
                  statsCounter.fastapi++;
                } else if (
                  (await fs.pathExists(path.join(projectPath, 'pom.xml'))) ||
                  (await fs.pathExists(path.join(projectPath, 'build.gradle'))) ||
                  (await fs.pathExists(path.join(projectPath, 'build.gradle.kts')))
                ) {
                  count++;
                  statsCounter.springboot++;
                } else if (await fs.pathExists(path.join(projectPath, 'go.mod'))) {
                  count++;
                  statsCounter.go++;
                } else if ((await host.detectProjectType(projectPath)) === 'dotnet') {
                  count++;
                  statsCounter.dotnet++;
                } else if (await fs.pathExists(path.join(projectPath, 'package.json'))) {
                  try {
                    const pkg = await fs.readJSON(path.join(projectPath, 'package.json'));
                    if (pkg.dependencies?.['@nestjs/core']) {
                      count++;
                      statsCounter.nestjs++;
                    }
                  } catch {
                    // Ignore invalid package.json
                  }
                }
              }
            }

            projectCount = count;
            projectStats =
              count > 0
                ? {
                    fastapi: statsCounter.fastapi > 0 ? statsCounter.fastapi : undefined,
                    nestjs: statsCounter.nestjs > 0 ? statsCounter.nestjs : undefined,
                    springboot: statsCounter.springboot > 0 ? statsCounter.springboot : undefined,
                    go: statsCounter.go > 0 ? statsCounter.go : undefined,
                    dotnet: statsCounter.dotnet > 0 ? statsCounter.dotnet : undefined,
                  }
                : undefined;
          } catch (err) {
            console.error(`Failed to get stats for ${ws.path}:`, err);
          }

          let bootstrapProfile: RecentWorkspaceEntry['bootstrapProfile'];
          let dependencySharingMode: RecentWorkspaceEntry['dependencySharingMode'];
          let policyMode: RecentWorkspaceEntry['policyMode'];
          let complianceStatus: RecentWorkspaceEntry['complianceStatus'];
          let mirrorStatus: RecentWorkspaceEntry['mirrorStatus'];
          try {
            const manifestPath = await resolveWorkspaceArtifactPath(
              ws.path,
              '.workspai/workspace.json'
            );
            if (await fs.pathExists(manifestPath)) {
              const manifest = await fs.readJSON(manifestPath).catch(() => null);
              if (manifest) {
                bootstrapProfile = manifest.profile;
              }
            }

            const policiesPath = await resolveWorkspaceArtifactPath(
              ws.path,
              '.workspai/policies.yml'
            );
            if (await fs.pathExists(policiesPath)) {
              const policyContent = await fs.readFile(policiesPath, 'utf-8');

              const modeMatch = policyContent.match(/^\s*mode:\s*(warn|strict)\s*$/m);
              if (modeMatch && (modeMatch[1] === 'warn' || modeMatch[1] === 'strict')) {
                policyMode = modeMatch[1];
              }

              const depModeMatch = policyContent.match(
                /^\s*dependency_sharing_mode:\s*(isolated|shared-runtime-caches|shared-node-deps)\s*$/m
              );
              if (
                depModeMatch &&
                (depModeMatch[1] === 'isolated' ||
                  depModeMatch[1] === 'shared-runtime-caches' ||
                  depModeMatch[1] === 'shared-node-deps')
              ) {
                dependencySharingMode = depModeMatch[1];
              }
            }

            const reportsDir = await resolveWorkspaceReportsDir(ws.path);
            if (await fs.pathExists(reportsDir)) {
              const reportFiles = await fs.readdir(reportsDir);
              const latestCompliance = reportFiles
                .filter((f) => f.startsWith('bootstrap-compliance'))
                .sort()
                .reverse()[0];
              if (latestCompliance) {
                const report = await fs
                  .readJSON(path.join(reportsDir, latestCompliance))
                  .catch(() => null);
                const rawResult = report?.result || report?.status;
                complianceStatus =
                  rawResult === 'ok' || rawResult === 'ok_with_warnings'
                    ? 'passing'
                    : rawResult === 'failed'
                      ? 'failing'
                      : 'unknown';
              }
              const latestMirror = reportFiles
                .filter((f) => f.startsWith('mirror-ops'))
                .sort()
                .reverse()[0];
              mirrorStatus = latestMirror
                ? ((await fs.readJSON(path.join(reportsDir, latestMirror)).catch(() => null))
                    ?.status ?? 'not-configured')
                : 'not-configured';
            }
          } catch {
            // Phase 4 data unavailable — leave as undefined
          }

          return {
            ...ws,
            coreVersion: versionInfo.installed,
            coreLatestVersion: versionInfo.latest,
            coreStatus: versionInfo.status,
            coreLocation: versionInfo.location as 'workspace' | 'global' | 'pipx' | undefined,
            lastModified,
            projectCount,
            projectStats,
            bootstrapProfile,
            dependencySharingMode,
            policyMode,
            complianceStatus,
            mirrorStatus,
          };
        } catch (error) {
          console.error(`Failed to get version info for ${ws.path}:`, error);
          return {
            ...ws,
            coreVersion: undefined,
            coreStatus: 'error' as const,
            coreLocation: undefined,
            bootstrapProfile: undefined,
            dependencySharingMode: undefined,
            policyMode: undefined,
            complianceStatus: undefined,
            mirrorStatus: undefined,
          };
        }
      })
    );

    return enrichedWorkspaces;
  } catch (error) {
    console.error('Failed to get recent workspaces:', error);
    return [];
  }
}

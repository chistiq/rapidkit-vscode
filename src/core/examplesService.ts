/**
 * Examples Service
 * Fetches and caches example workspaces metadata from GitHub
 */

import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import axios from 'axios';

export interface ExampleProject {
  id: string;
  name: string;
  type: 'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet';
  displayName: string;
  description: string;
  path: string;
  features?: string[];
  endpoints?: string[];
  defaultPort?: number;
}

export interface ExampleWorkspace {
  id: string;
  name: string;
  title: string;
  description: string;
  path: string;
  tags?: string[];
  featured?: boolean;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  tutorialLinks?: Array<{
    title: string;
    url: string;
    platform: string;
  }>;
  projects: ExampleProject[];
  catalogKind?: 'runnable-example' | 'profile-foundation';
  profile?: string;
  requirements?: {
    python?: string;
    node?: string;
    rapidkit?: string;
  };
  quickStart?: {
    fastapi?: string[];
    nestjs?: string[];
  };
}

export interface ExamplesMetadata {
  version: string;
  lastUpdated: string;
  repository: string;
  workspaces: ExampleWorkspace[];
  profileWorkspaces?: Array<{
    id: string;
    name: string;
    profile: string;
    path: string;
    kind: 'raw-profile-fixture';
    projects: ExampleProject[];
    pythonEngine?: string;
    lifecycleStatus?: string;
  }>;
}

export interface ClonedExampleInfo {
  exampleId: string;
  exampleName: string;
  clonedAt: string;
  clonedPath: string;
  commitHash?: string;
  lastCheckedForUpdate?: string;
}

interface ExamplesCache {
  metadata: ExamplesMetadata;
  timestamp: number;
  projectionVersion?: number;
}

const DEFAULT_EXAMPLES_METADATA_TIMEOUT_MS = 5000;
const DEFAULT_EXAMPLES_UPDATES_TIMEOUT_MS = 10000;
const MIN_NETWORK_TIMEOUT_MS = 1000;
const MAX_NETWORK_TIMEOUT_MS = 60000;
const EXAMPLES_CATALOG_PROJECTION_VERSION = 2;
const PROFILE_LABELS: Readonly<Record<string, string>> = {
  minimal: 'Minimal',
  'java-only': 'Java',
  'python-only': 'Python',
  'node-only': 'Node.js',
  'go-only': 'Go',
  'dotnet-only': '.NET',
  polyglot: 'Polyglot',
  enterprise: 'Enterprise',
};

export class ExamplesService {
  private static instance: ExamplesService | null = null;
  private readonly storagePath: string;
  private readonly cacheFilePath: string;
  private readonly trackingFilePath: string;
  private readonly ttlMs: number = 60 * 60 * 1000; // 1 hour
  private readonly metadataUrl =
    'https://raw.githubusercontent.com/chistiq/rapidkit-examples/main/examples.json';

  private constructor(context: vscode.ExtensionContext) {
    this.storagePath = context.globalStorageUri.fsPath;
    this.cacheFilePath = path.join(this.storagePath, 'examples-cache.json');

    // Use ~/.rapidkit for tracking cloned examples (shared across all vscode instances)
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const rapidkitDir = path.join(homeDir, '.rapidkit');
    this.trackingFilePath = path.join(rapidkitDir, 'cloned-examples.json');
  }

  static initialize(context: vscode.ExtensionContext): ExamplesService {
    if (!ExamplesService.instance) {
      ExamplesService.instance = new ExamplesService(context);
    }
    return ExamplesService.instance;
  }

  static getInstance(): ExamplesService {
    if (!ExamplesService.instance) {
      throw new Error('ExamplesService not initialized');
    }
    return ExamplesService.instance;
  }

  private getNetworkTimeoutMs(fallback: number): number {
    const configured = vscode.workspace
      .getConfiguration('workspai')
      .get<number>('networkTimeoutMs', fallback);

    if (!Number.isFinite(configured)) {
      return fallback;
    }

    return Math.max(MIN_NETWORK_TIMEOUT_MS, Math.min(MAX_NETWORK_TIMEOUT_MS, configured));
  }

  /**
   * Get examples metadata (with caching)
   */
  async getExamples(): Promise<ExampleWorkspace[]> {
    try {
      // Check cache first
      const cached = await this._loadCache();
      if (
        cached &&
        cached.projectionVersion === EXAMPLES_CATALOG_PROJECTION_VERSION &&
        Date.now() - cached.timestamp < this.ttlMs
      ) {
        console.log('[ExamplesService] Using cached metadata');
        return this._getPublishedCatalog(cached.metadata);
      }

      // Fetch from GitHub
      console.log('[ExamplesService] Fetching metadata from GitHub...');
      const response = await axios.get<ExamplesMetadata>(this.metadataUrl, {
        timeout: this.getNetworkTimeoutMs(DEFAULT_EXAMPLES_METADATA_TIMEOUT_MS),
        headers: {
          Accept: 'application/json',
        },
      });

      const metadata = response.data;

      // Save to cache
      await this._saveCache({
        metadata,
        timestamp: Date.now(),
        projectionVersion: EXAMPLES_CATALOG_PROJECTION_VERSION,
      });
      console.log('[ExamplesService] Metadata fetched and cached');

      return this._getPublishedCatalog(metadata);
    } catch (error: any) {
      console.error('[ExamplesService] Failed to fetch metadata:', error.message);

      // Try to use stale cache
      const cached = await this._loadCache();
      if (cached) {
        console.log('[ExamplesService] Using stale cache as fallback');
        return this._getPublishedCatalog(cached.metadata);
      }

      // Ultimate fallback: return hardcoded example
      return this._getFallbackExamples();
    }
  }

  /**
   * Invalidate cache to force refresh
   */
  async invalidateCache(): Promise<void> {
    try {
      if (await fs.pathExists(this.cacheFilePath)) {
        await fs.remove(this.cacheFilePath);
        console.log('[ExamplesService] Cache invalidated');
      }
    } catch (error) {
      console.error('[ExamplesService] Failed to invalidate cache:', error);
    }
  }

  /**
   * Track a cloned example
   */
  async trackClonedExample(
    exampleId: string,
    exampleName: string,
    clonedPath: string,
    commitHash?: string
  ): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(this.trackingFilePath));

      const tracking = await this._loadTracking();

      tracking[exampleId] = {
        exampleId,
        exampleName,
        clonedAt: new Date().toISOString(),
        clonedPath,
        commitHash,
      };

      await fs.writeJson(this.trackingFilePath, tracking, { spaces: 2 });
      console.log('[ExamplesService] Tracked cloned example:', exampleId);
    } catch (error) {
      console.error('[ExamplesService] Failed to track cloned example:', error);
    }
  }

  /**
   * Get cloned example info
   */
  async getClonedExampleInfo(exampleId: string): Promise<ClonedExampleInfo | null> {
    const tracking = await this._loadTracking();
    return tracking[exampleId] || null;
  }

  /**
   * Check if example is cloned
   */
  async isExampleCloned(exampleId: string): Promise<boolean> {
    const info = await this.getClonedExampleInfo(exampleId);
    if (!info) {
      return false;
    }

    // Verify the path still exists
    return await fs.pathExists(info.clonedPath);
  }

  /**
   * Get commit hash from a cloned repository
   */
  async getRepoCommitHash(repoPath: string): Promise<string | null> {
    try {
      const gitHeadPath = path.join(repoPath, '.git', 'HEAD');
      if (!(await fs.pathExists(gitHeadPath))) {
        return null;
      }

      const headContent = await fs.readFile(gitHeadPath, 'utf-8');
      const match = headContent.trim().match(/^ref: (.+)$/);

      if (match) {
        const refPath = path.join(repoPath, '.git', match[1]);
        if (await fs.pathExists(refPath)) {
          const hash = await fs.readFile(refPath, 'utf-8');
          return hash.trim();
        }
      }

      // If HEAD contains hash directly
      if (/^[0-9a-f]{40}$/i.test(headContent.trim())) {
        return headContent.trim();
      }

      return null;
    } catch (error) {
      console.error('[ExamplesService] Failed to get commit hash:', error);
      return null;
    }
  }

  /**
   * Check if an example has updates available
   */
  async checkForUpdates(exampleId: string): Promise<{
    hasUpdate: boolean;
    currentHash?: string;
    latestHash?: string;
  }> {
    try {
      const info = await this.getClonedExampleInfo(exampleId);
      if (!info || !info.clonedPath) {
        return { hasUpdate: false };
      }

      // Get current local commit hash
      const currentHash = await this.getRepoCommitHash(info.clonedPath);
      if (!currentHash) {
        return { hasUpdate: false };
      }

      // Get latest commit hash from GitHub API
      const apiUrl = `https://api.github.com/repos/chistiq/rapidkit-examples/commits/main`;
      const response = await axios.get(apiUrl, {
        timeout: this.getNetworkTimeoutMs(DEFAULT_EXAMPLES_UPDATES_TIMEOUT_MS),
        headers: {
          Accept: 'application/vnd.github.v3+json',
        },
      });

      const latestHash = response.data.sha;

      return {
        hasUpdate: currentHash !== latestHash,
        currentHash,
        latestHash,
      };
    } catch (error) {
      console.error('[ExamplesService] Failed to check for updates:', error);
      return { hasUpdate: false };
    }
  }

  /**
   * Remove tracked example
   */
  async untrackExample(exampleId: string): Promise<void> {
    try {
      const tracking = await this._loadTracking();
      delete tracking[exampleId];
      await fs.writeJson(this.trackingFilePath, tracking, { spaces: 2 });
      console.log('[ExamplesService] Untracked example:', exampleId);
    } catch (error) {
      console.error('[ExamplesService] Failed to untrack example:', error);
    }
  }

  private async _loadCache(): Promise<ExamplesCache | null> {
    try {
      if (await fs.pathExists(this.cacheFilePath)) {
        return await fs.readJson(this.cacheFilePath);
      }
    } catch (error) {
      console.error('[ExamplesService] Failed to load cache:', error);
    }
    return null;
  }

  private async _saveCache(cache: ExamplesCache): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(this.cacheFilePath));
      await fs.writeJson(this.cacheFilePath, cache, { spaces: 2 });
    } catch (error) {
      console.error('[ExamplesService] Failed to save cache:', error);
    }
  }

  private async _loadTracking(): Promise<Record<string, ClonedExampleInfo>> {
    try {
      if (await fs.pathExists(this.trackingFilePath)) {
        return await fs.readJson(this.trackingFilePath);
      }
    } catch (error) {
      console.error('[ExamplesService] Failed to load tracking:', error);
    }
    return {};
  }

  private _getPublishedCatalog(metadata: ExamplesMetadata): ExampleWorkspace[] {
    const runnableExamples = (metadata.workspaces ?? []).map((workspace) => ({
      ...workspace,
      catalogKind: workspace.catalogKind ?? ('runnable-example' as const),
    }));
    const profileFoundations = (metadata.profileWorkspaces ?? [])
      .filter((workspace) => workspace.lifecycleStatus === 'published')
      .map((workspace): ExampleWorkspace => {
        const label =
          PROFILE_LABELS[workspace.profile] ??
          workspace.profile
            .split('-')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
        return {
          id: workspace.id,
          name: workspace.name,
          title: `${label} Workspace Foundation`,
          description: `A clean ${label} Workspace Intelligence foundation for adding or adopting projects without changing their framework.`,
          path: workspace.path,
          profile: workspace.profile,
          catalogKind: 'profile-foundation',
          tags: ['Profile', label, 'Workspace Foundation'],
          difficulty: 'beginner',
          projects: Array.isArray(workspace.projects) ? workspace.projects : [],
        };
      });

    const seen = new Set<string>();
    return [...runnableExamples, ...profileFoundations].filter((workspace) => {
      const identity = workspace.id || workspace.name;
      if (!identity || seen.has(identity)) {
        return false;
      }
      seen.add(identity);
      return true;
    });
  }

  private _getFallbackExamples(): ExampleWorkspace[] {
    // Hardcoded fallback in case GitHub is unreachable
    return [
      {
        id: 'my-ai-workspace',
        name: 'my-ai-workspace',
        title: 'AI Agent Workspace',
        description:
          'Multi-provider AI assistant with FastAPI and NestJS implementations featuring streaming, caching, health checks, and support ticket endpoints.',
        path: 'my-ai-workspace',
        tags: ['AI', 'Streaming', 'Multi-Provider'],
        featured: true,
        projects: [
          {
            id: 'ai-agent',
            name: 'ai-agent',
            type: 'fastapi' as const,
            displayName: 'AI Agent (FastAPI)',
            description: 'FastAPI implementation with echo/template/OpenAI-ready endpoints',
            path: 'my-ai-workspace/ai-agent',
          },
          {
            id: 'ai-agent-nest',
            name: 'ai-agent-nest',
            type: 'nestjs' as const,
            displayName: 'AI Agent (NestJS)',
            description: 'NestJS parity implementation with ai_assistant + support/ticket',
            path: 'my-ai-workspace/ai-agent-nest',
          },
        ],
      },
    ];
  }
}

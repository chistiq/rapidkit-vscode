/**
 * Kits Service
 * Fetches and caches available kits from Workspai CLI
 */

import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import { run } from '../utils/exec';
import { buildNpxRapidkitArgs } from '../utils/platformCapabilities';
import {
  DESKTOP_SCAFFOLD_KITS,
  EXTENSION_SCAFFOLD_KITS,
  FRONTEND_SCAFFOLD_KITS,
  type FrontendScaffoldFramework,
  type ScaffoldFramework,
} from './scaffoldKits';

export interface Kit {
  name: string;
  display_name: string;
  category: 'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet' | string;
  version: string;
  tags?: string[];
  modules?: string[];
  description: string;
}

export interface KitsListResult {
  schema_version: number;
  ok: boolean;
  filters?: {
    category?: string | null;
    tag?: string | null;
    detailed?: boolean;
  };
  count: number;
  kits: Kit[];
}

interface KitsCache {
  kits: Kit[];
  timestamp: number;
}

const DEFAULT_KITS_FETCH_TIMEOUT_MS = 15000;
const MIN_COMMAND_TIMEOUT_MS = 1000;
const MAX_COMMAND_TIMEOUT_MS = 60000;

export class KitsService {
  private static instance: KitsService | null = null;
  private readonly storagePath: string;
  private readonly cacheFilePath: string;
  private readonly ttlMs: number = 24 * 60 * 60 * 1000; // 24 hours

  private constructor(context: vscode.ExtensionContext) {
    this.storagePath = context.globalStorageUri.fsPath;
    this.cacheFilePath = path.join(this.storagePath, 'kits-cache.json');
  }

  static initialize(context: vscode.ExtensionContext): KitsService {
    if (!KitsService.instance) {
      KitsService.instance = new KitsService(context);
    }
    return KitsService.instance;
  }

  static getInstance(): KitsService {
    if (!KitsService.instance) {
      throw new Error('KitsService not initialized');
    }
    return KitsService.instance;
  }

  private getCommandTimeoutMs(fallback: number): number {
    const configured = vscode.workspace
      .getConfiguration('workspai')
      .get<number>('commandTimeoutMs', fallback);

    if (!Number.isFinite(configured)) {
      return fallback;
    }

    return Math.max(MIN_COMMAND_TIMEOUT_MS, Math.min(MAX_COMMAND_TIMEOUT_MS, configured));
  }

  /**
   * Get available kits (with caching)
   */
  async getKits(): Promise<Kit[]> {
    try {
      // Check cache first
      const cached = await this._loadCache();
      if (cached && Date.now() - cached.timestamp < this.ttlMs) {
        console.log('[KitsService] Using cached kits');
        return this._mergeWithFallback(cached.kits);
      }

      // Fetch from CLI
      console.log('[KitsService] Fetching kits from CLI...');
      const result = await run('npx', buildNpxRapidkitArgs(['list', '--json']), {
        timeout: this.getCommandTimeoutMs(DEFAULT_KITS_FETCH_TIMEOUT_MS),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (result.exitCode !== 0) {
        throw new Error(`rapidkit list failed with exit code ${result.exitCode}`);
      }

      const output = result.stdout?.trim();
      if (!output) {
        throw new Error('Empty output from rapidkit list --json');
      }

      const parsed: KitsListResult = JSON.parse(output);

      if (!parsed.ok || !Array.isArray(parsed.kits)) {
        throw new Error('Invalid response from rapidkit list --json');
      }

      const kits = this._mergeWithFallback(parsed.kits);

      // Save to cache
      await this._saveCache({ kits, timestamp: Date.now() });
      console.log('[KitsService] Kits fetched and cached:', kits.length);

      return kits;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[KitsService] Failed to fetch kits:', message);

      // Try to use stale cache
      const cached = await this._loadCache();
      if (cached && cached.kits.length > 0) {
        console.log('[KitsService] Using stale cache as fallback');
        return this._mergeWithFallback(cached.kits);
      }

      // Ultimate fallback: return hardcoded kits
      return this._getFallbackKits();
    }
  }

  /**
   * Merge kits with fallback list – ensures new categories (e.g. Go) are always
   * present even when the live cache was built before they were added.
   */
  private _mergeWithFallback(kits: Kit[]): Kit[] {
    const fallback = this._getFallbackKits();
    const merged = [...kits];
    for (const fallbackKit of fallback) {
      if (!merged.some((k) => k.name === fallbackKit.name)) {
        merged.push(fallbackKit);
      }
    }
    return merged;
  }

  /**
   * Get kits by category
   */
  async getKitsByCategory(category: ScaffoldFramework | string): Promise<Kit[]> {
    const allKits = await this.getKits();
    return allKits.filter((kit) => kit.category === category);
  }

  /**
   * Invalidate cache to force refresh
   */
  async invalidateCache(): Promise<void> {
    try {
      if (await fs.pathExists(this.cacheFilePath)) {
        await fs.remove(this.cacheFilePath);
        console.log('[KitsService] Cache invalidated');
      }
    } catch (error) {
      console.error('[KitsService] Failed to invalidate cache:', error);
    }
  }

  private async _loadCache(): Promise<KitsCache | null> {
    try {
      if (await fs.pathExists(this.cacheFilePath)) {
        return await fs.readJson(this.cacheFilePath);
      }
    } catch (error) {
      console.error('[KitsService] Failed to load cache:', error);
    }
    return null;
  }

  private async _saveCache(cache: KitsCache): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(this.cacheFilePath));
      await fs.writeJson(this.cacheFilePath, cache, { spaces: 2 });
    } catch (error) {
      console.error('[KitsService] Failed to save cache:', error);
    }
  }

  private _getFallbackKits(): Kit[] {
    // Hardcoded fallback kits (synced from npm templates)
    return [
      {
        name: 'fastapi.standard',
        display_name: 'FastAPI Standard Kit',
        category: 'fastapi',
        version: '0.1.0',
        tags: ['fastapi', 'minimal', 'modular'],
        description: 'Standard FastAPI starter that defers features to Workspai modules.',
      },
      {
        name: 'fastapi.ddd',
        display_name: 'FastAPI DDD Kit',
        category: 'fastapi',
        version: '0.1.0',
        tags: ['clean-architecture', 'ddd', 'fastapi', 'modular'],
        description: 'Opinionated FastAPI starter aligned with domain-driven design practices.',
      },
      {
        name: 'nestjs.standard',
        display_name: 'NestJS Standard Kit',
        category: 'nestjs',
        version: '0.1.0',
        tags: ['javascript', 'modular', 'nestjs', 'scalable', 'standard', 'typescript'],
        description:
          'Production-ready NestJS starter kit with modular Workspai integration and TypeScript best practices.',
      },
      {
        name: 'gofiber.standard',
        display_name: 'Go/Fiber Standard Kit',
        category: 'go',
        version: '0.1.0',
        tags: ['go', 'fiber', 'high-performance', 'standard'],
        description: 'High-performance Go web service built with the Fiber framework.',
      },
      {
        name: 'gogin.standard',
        display_name: 'Go/Gin Standard Kit',
        category: 'go',
        version: '0.1.0',
        tags: ['go', 'gin', 'high-performance', 'standard'],
        description: 'Lightweight Go web service built with the Gin framework.',
      },
      {
        name: 'springboot.standard',
        display_name: 'Spring Boot Standard Kit',
        category: 'springboot',
        version: '0.1.0',
        tags: ['java', 'spring', 'springboot', 'maven', 'enterprise'],
        description:
          'Production-ready Spring Boot starter with Maven wrapper, actuator, and OpenAPI defaults.',
      },
      {
        name: 'dotnet.webapi.clean',
        display_name: '.NET Web API Clean Kit',
        category: 'dotnet',
        version: '0.1.0',
        tags: ['dotnet', 'csharp', 'webapi', 'clean-architecture', 'enterprise'],
        description:
          'Clean architecture .NET Web API starter aligned with RapidKit workspace contracts.',
      },
      {
        name: 'rust.axum',
        display_name: 'Rust Axum',
        category: 'rust',
        version: 'latest-stable',
        tags: ['rust', 'axum', 'backend'],
        description: 'Typed Rust backend built with Axum.',
      },
      {
        name: 'php.laravel',
        display_name: 'Laravel',
        category: 'laravel',
        version: 'latest-stable',
        tags: ['php', 'laravel', 'backend'],
        description: 'Official latest stable Laravel application.',
      },
      ...FRONTEND_SCAFFOLD_KITS.map((definition) => ({
        name: definition.kitId,
        display_name: definition.displayName,
        category: definition.framework as FrontendScaffoldFramework,
        version: '0.1.0',
        tags: definition.tags,
        description: definition.description,
      })),
      ...DESKTOP_SCAFFOLD_KITS.map((definition) => ({
        name: definition.kitId,
        display_name: definition.displayName,
        category: definition.framework,
        version: 'latest-stable',
        tags: definition.tags,
        description: definition.description,
      })),
      ...EXTENSION_SCAFFOLD_KITS.map((definition) => ({
        name: definition.kitId,
        display_name: definition.displayName,
        category: definition.framework,
        version: 'latest-stable',
        tags: definition.tags,
        description: definition.description,
      })),
    ];
  }
}

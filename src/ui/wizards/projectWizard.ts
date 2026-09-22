/**
 * Project Wizard
 * Interactive wizard for project creation
 */

import * as vscode from 'vscode';
import { ProjectConfig } from '../../types';
import type { ScaffoldFramework } from '../../core/scaffoldKits';
import {
  AGENT_SCAFFOLD_KITS,
  GATEWAY_SCAFFOLD_KITS,
  DESKTOP_SCAFFOLD_KITS,
  EXTENSION_SCAFFOLD_KITS,
  FRONTEND_SCAFFOLD_KITS,
  scaffoldKitsForFramework,
} from '../../core/scaffoldKits';
import { KitsService } from '../../core/kitsService';

export class ProjectWizard {
  async show(
    preselectedFramework?: ScaffoldFramework,
    prefilledName?: string,
    preselectedKit?: string
  ): Promise<ProjectConfig | undefined> {
    // Step 1: Project name (skip if provided)
    let name: string | undefined;

    if (prefilledName) {
      name = prefilledName;
      // Validate the provided name
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        vscode.window.showErrorMessage(
          'Invalid project name. Use letters, numbers, hyphens, and underscores only.'
        );
        return undefined;
      }
    } else {
      name = await vscode.window.showInputBox({
        prompt: 'Enter project name',
        placeHolder: 'my-api-project',
        validateInput: (value) => {
          if (!value) {
            return 'Project name is required';
          }
          if (!/^[a-z][a-z0-9-_]*$/.test(value)) {
            return 'Use lowercase letters, numbers, hyphens, and underscores only';
          }
          return null;
        },
      });
    }

    if (!name) {
      return undefined;
    }

    // Step 2: Choose framework (skip if preselected)
    let framework: ScaffoldFramework;

    if (preselectedFramework) {
      framework = preselectedFramework;
    } else {
      const frameworkItems = [
        {
          label: '$(symbol-property) FastAPI',
          description: 'Modern Python web framework',
          detail: 'High performance, easy to learn, fast to code',
          framework: 'fastapi' as const,
          category: 'backend' as const,
        },
        {
          label: '$(symbol-class) NestJS',
          description: 'Progressive Node.js framework',
          detail: 'TypeScript-first, modular architecture',
          framework: 'nestjs' as const,
          category: 'backend' as const,
        },
        {
          label: '$(symbol-namespace) Go',
          description: 'High-performance Go web service',
          detail: 'Fiber or Gin framework, fast compile times',
          framework: 'go' as const,
          category: 'backend' as const,
        },
        {
          label: '$(symbol-structure) Spring Boot',
          description: 'Java + Spring ecosystem',
          detail: 'Production-ready Java service with Maven/Gradle',
          framework: 'springboot' as const,
          category: 'backend' as const,
        },
        {
          label: '$(symbol-method) .NET Web API',
          description: 'C# + ASP.NET Core ecosystem',
          detail: 'Clean architecture Web API service',
          framework: 'dotnet' as const,
          category: 'backend' as const,
        },
        {
          label: '$(flame) Rust Axum',
          description: 'Rust backend',
          detail: 'Typed Axum service with Cargo-owned dependencies',
          framework: 'rust' as const,
          category: 'backend' as const,
        },
        {
          label: '$(server-process) Laravel',
          description: 'PHP backend',
          detail: 'Latest stable official Laravel application',
          framework: 'laravel' as const,
          category: 'backend' as const,
        },
        ...FRONTEND_SCAFFOLD_KITS.map((definition) => ({
          label: `$(browser) ${definition.displayName}`,
          description: 'Official frontend generator',
          detail: definition.description,
          framework: definition.framework,
          category: 'frontend' as const,
        })),
        ...DESKTOP_SCAFFOLD_KITS.map((definition) => ({
          label: `$(device-desktop) ${definition.displayName}`,
          description: 'Official desktop generator',
          detail: definition.description,
          framework: definition.framework,
          category: 'desktop' as const,
        })),
        ...EXTENSION_SCAFFOLD_KITS.map((definition) => ({
          label: `$(extensions) ${definition.displayName}`,
          description: 'Official extension generator',
          detail: definition.description,
          framework: definition.framework,
          category: 'extension' as const,
        })),
        ...AGENT_SCAFFOLD_KITS.filter(
          (definition, index, kits) =>
            kits.findIndex((candidate) => candidate.framework === definition.framework) === index
        ).map((definition) => ({
          label: `$(hubot) ${
            definition.framework === 'openai-agents'
              ? 'OpenAI Agents SDK'
              : 'Microsoft Agent Framework'
          }`,
          description: 'Governed AI agent',
          detail: definition.description,
          framework: definition.framework,
          category: 'agent' as const,
        })),
        ...GATEWAY_SCAFFOLD_KITS.filter(
          (definition, index, kits) =>
            kits.findIndex((candidate) => candidate.framework === definition.framework) === index
        ).map((definition) => ({
          label: '$(radio-tower) OpenRouter AI Gateway',
          description: 'Source-ready gateway',
          detail: 'TypeScript or Python. Attach is unsupported, and Go is not included.',
          framework: definition.framework,
          category: 'gateway' as const,
        })),
      ];

      const categoryItems = [
        {
          label: '$(server) Backend',
          detail: 'APIs and services',
          category: 'backend' as const,
        },
        {
          label: '$(browser) Frontend',
          detail: 'Web applications and sites',
          category: 'frontend' as const,
        },
        {
          label: '$(device-desktop) Desktop',
          detail: 'Installable desktop applications',
          category: 'desktop' as const,
        },
        ...(AGENT_SCAFFOLD_KITS.length > 0
          ? [
              {
                label: '$(hubot) AI Agent',
                detail: 'Governed Microsoft and OpenAI agent projects',
                category: 'agent' as const,
              },
            ]
          : []),
        ...(GATEWAY_SCAFFOLD_KITS.length > 0
          ? [
              {
                label: '$(radio-tower) AI Gateway',
                detail: 'Source-ready OpenRouter gateway projects',
                category: 'gateway' as const,
              },
            ]
          : []),
        {
          label: '$(extensions) Extension',
          detail: 'Editor extensions',
          category: 'extension' as const,
        },
      ];
      const selectedCategory = await vscode.window.showQuickPick(categoryItems, {
        placeHolder: 'What are you building?',
        ignoreFocusOut: true,
      });

      if (!selectedCategory) {
        return undefined;
      }

      const selectedFramework = await vscode.window.showQuickPick(
        frameworkItems.filter((item) => item.category === selectedCategory.category),
        {
          placeHolder: `Select a ${selectedCategory.label.replace(/^\$\([^)]*\)\s*/, '').toLowerCase()} framework`,
          ignoreFocusOut: true,
        }
      );

      if (!selectedFramework) {
        return undefined;
      }

      framework = selectedFramework.framework;
    }

    // Step 3: Choose kit (dynamic from KitsService, skip if preselected)
    let selectedKitName: string;

    if (preselectedKit) {
      if (!scaffoldKitsForFramework(framework).includes(preselectedKit)) {
        vscode.window.showErrorMessage(
          `Kit ${preselectedKit} is not available for ${framework} in the current Workspai CLI contract.`
        );
        return undefined;
      }
      // Kit already selected from a contract-backed surface.
      selectedKitName = preselectedKit;
    } else {
      // Load kits and show picker
      const kitsService = KitsService.getInstance();
      let availableKits;

      try {
        availableKits = await kitsService.getKitsByCategory(framework);
      } catch {
        vscode.window.showErrorMessage('Failed to load kits. Please try again.');
        return undefined;
      }

      if (availableKits.length === 0) {
        vscode.window.showErrorMessage(`No kits available for ${framework}`);
        return undefined;
      }

      availableKits = availableKits.filter((kit) =>
        scaffoldKitsForFramework(framework).includes(kit.name)
      );

      if (availableKits.length === 0) {
        vscode.window.showErrorMessage(
          `No executable kits admitted for ${framework} by the current Workspai CLI contract.`
        );
        return undefined;
      }

      if (availableKits.length === 1) {
        // Only one kit available, use it automatically
        selectedKitName = availableKits[0].name;
      } else {
        // Multiple kits available, show picker
        const kitItems = availableKits.map((kit) => ({
          label: `$(package) ${kit.display_name}`,
          description: kit.tags?.join(', ') || '',
          detail: kit.description,
          kitName: kit.name,
        }));

        const selectedKit = await vscode.window.showQuickPick(kitItems, {
          placeHolder: `Select ${framework} kit`,
          ignoreFocusOut: true,
        });

        if (!selectedKit) {
          return undefined;
        }

        selectedKitName = selectedKit.kitName;
      }
    }

    return {
      name,
      framework,
      kit: selectedKitName,
      packageManager: 'npm', // Always use npm (default)
    };
  }
}

/**
 * Project Wizard
 * Interactive wizard for project creation
 */

import * as vscode from 'vscode';
import { ProjectConfig } from '../../types';
import { KitsService } from '../../core/kitsService';

export class ProjectWizard {
  async show(
    preselectedFramework?: 'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet',
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
    let framework: 'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet';

    if (preselectedFramework) {
      framework = preselectedFramework;
    } else {
      const frameworkItems = [
        {
          label: '$(symbol-property) FastAPI',
          description: 'Modern Python web framework',
          detail: 'High performance, easy to learn, fast to code',
          framework: 'fastapi' as const,
        },
        {
          label: '$(symbol-class) NestJS',
          description: 'Progressive Node.js framework',
          detail: 'TypeScript-first, modular architecture',
          framework: 'nestjs' as const,
        },
        {
          label: '$(symbol-namespace) Go',
          description: 'High-performance Go web service',
          detail: 'Fiber or Gin framework, fast compile times',
          framework: 'go' as const,
        },
        {
          label: '$(symbol-structure) Spring Boot',
          description: 'Java + Spring ecosystem',
          detail: 'Production-ready Java service with Maven/Gradle',
          framework: 'springboot' as const,
        },
        {
          label: '$(symbol-method) .NET Web API',
          description: 'C# + ASP.NET Core ecosystem',
          detail: 'Clean architecture Web API service',
          framework: 'dotnet' as const,
        },
      ];

      const selectedFramework = await vscode.window.showQuickPick(frameworkItems, {
        placeHolder: 'Select framework',
        ignoreFocusOut: true,
      });

      if (!selectedFramework) {
        return undefined;
      }

      framework = selectedFramework.framework;
    }

    // Step 3: Choose kit (dynamic from KitsService, skip if preselected)
    let selectedKitName: string;

    if (preselectedKit) {
      // Kit already selected from modal
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

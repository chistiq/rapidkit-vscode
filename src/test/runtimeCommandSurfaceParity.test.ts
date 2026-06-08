import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

type RuntimeSurfaceContract = {
  schemaVersion: string;
  moduleSuggestionFrameworks: string[];
  moduleUnsupportedFrameworks: string[];
  scaffoldKits: string[];
};

const repoRoot = path.resolve(__dirname, '../..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function resolveContractPath(): string {
  const explicitPath = process.env.RAPIDKIT_RUNTIME_COMMAND_SURFACE_CONTRACT;
  if (explicitPath?.trim()) {
    return path.resolve(explicitPath.trim());
  }

  const candidates = [
    path.resolve(process.cwd(), '..', 'contracts', 'runtime-command-surface.v1.json'),
    path.resolve(process.cwd(), 'contracts', 'runtime-command-surface.v1.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

function readContract(): RuntimeSurfaceContract {
  const contractPath = resolveContractPath();
  if (!fs.existsSync(contractPath)) {
    throw new Error(`Runtime command surface contract not found: ${contractPath}`);
  }
  return JSON.parse(fs.readFileSync(contractPath, 'utf8')) as RuntimeSurfaceContract;
}

describe('shared runtime command surface contract (extension)', () => {
  it('pins scaffold kit choices exposed by the extension', () => {
    const contract = readContract();
    const packageJson = JSON.parse(read('package.json')) as {
      contributes?: { configuration?: { properties?: Record<string, { enum?: string[] }> } };
    };
    const defaultKitEnum =
      packageJson.contributes?.configuration?.properties?.['workspai.defaultKit']?.enum ?? [];
    const commandReference = read('webview-ui/src/components/CommandReference.tsx');
    const kitsService = read('src/core/kitsService.ts');
    const rapidkitCli = read('src/core/rapidkitCLI.ts');

    expect(contract.schemaVersion).toBe('rapidkit-runtime-command-surface-v1');
    expect(defaultKitEnum).toEqual(contract.scaffoldKits);
    for (const kit of contract.scaffoldKits) {
      expect(commandReference, kit).toContain(kit);
      expect(kitsService, kit).toContain(kit);
      expect(rapidkitCli, kit).toContain(kit);
    }
  });

  it('keeps AI module suggestions available only for module-capable frameworks', () => {
    const contract = readContract();
    const createProjectModal = read('webview-ui/src/components/CreateProjectModal.tsx');
    const aiCreateModal = read('webview-ui/src/components/AICreateModal.tsx');
    const welcomePanel = read('src/ui/panels/welcomePanel.ts');
    const aiService = read('src/core/aiService.ts');

    expect(contract.moduleSuggestionFrameworks).toEqual(['fastapi', 'nestjs']);
    expect(createProjectModal).toContain("framework === 'fastapi' || framework === 'nestjs'");
    expect(welcomePanel).toContain(
      'AI module suggestions are available only for FastAPI and NestJS projects.'
    );

    for (const framework of contract.moduleUnsupportedFrameworks) {
      expect(aiService, framework).toContain(`framework === '${framework}'`);
    }

    expect(aiCreateModal).toContain('Go projects do not use the RapidKit module system.');
    expect(aiCreateModal).toContain('.NET projects do not use the RapidKit module system.');
    expect(aiCreateModal).toContain('Spring Boot projects do not use the RapidKit module system.');
  });
});

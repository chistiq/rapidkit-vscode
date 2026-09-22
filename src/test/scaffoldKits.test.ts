import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  AGENT_SCAFFOLD_KITS,
  FRONTEND_SCAFFOLD_KITS,
  isBackendScaffoldFramework,
  isFrontendScaffoldKit,
  resolveFrontendKitDefinition,
  scaffoldRuntimeForFramework,
  scaffoldRuntimeCandidatesForKit,
  SCAFFOLD_KIT_IDS,
  workspacePythonEngineForKit,
} from '../core/scaffoldKits';
import createContract from '../contracts/create-planner-capabilities.v1.json';

describe('scaffold kits', () => {
  it('includes all canonical frontend kits from the runtime command surface contract', () => {
    expect(SCAFFOLD_KIT_IDS).toEqual(
      expect.arrayContaining(FRONTEND_SCAFFOLD_KITS.map((kit) => kit.kitId))
    );
    expect(FRONTEND_SCAFFOLD_KITS).toHaveLength(11);
    expect(SCAFFOLD_KIT_IDS).toHaveLength(29);
  });

  it('keeps governed agent kits runtime-specific despite sharing one framework', () => {
    expect(AGENT_SCAFFOLD_KITS.map((kit) => kit.kitId)).toEqual([
      'agent.microsoft.python',
      'agent.microsoft.dotnet',
      'agent.openai.python',
      'agent.openai.typescript',
    ]);
    expect(AGENT_SCAFFOLD_KITS.map((kit) => kit.displayName)).toEqual([
      'Microsoft Agent Framework · Python',
      'Microsoft Agent Framework · .NET',
      'OpenAI Agents SDK · Python',
      'OpenAI Agents SDK · TypeScript',
    ]);
    expect(scaffoldRuntimeCandidatesForKit('agent.microsoft.python')).toEqual(['python']);
    expect(scaffoldRuntimeCandidatesForKit('agent.microsoft.dotnet')).toEqual(['dotnet']);
  });

  it('resolves frontend kits by kit id and framework alias', () => {
    expect(resolveFrontendKitDefinition('frontend.nextjs')?.framework).toBe('nextjs');
    expect(resolveFrontendKitDefinition('nextjs')?.kitId).toBe('frontend.nextjs');
    expect(isFrontendScaffoldKit('frontend.astro')).toBe(true);
    expect(isFrontendScaffoldKit('fastapi.standard')).toBe(false);
  });

  it('classifies backend vs frontend scaffold frameworks', () => {
    expect(isBackendScaffoldFramework('nestjs')).toBe(true);
    expect(isBackendScaffoldFramework('nextjs')).toBe(false);
    expect(isBackendScaffoldFramework('vite-vue')).toBe(false);
    expect(isBackendScaffoldFramework('rust')).toBe(true);
    expect(isBackendScaffoldFramework('laravel')).toBe(true);
  });

  it('derives executable kits, runtimes, and engine ownership from the CLI contract', () => {
    const contractedKits = [
      ...createContract.nativeCreate.map((entry) => entry.id),
      ...createContract.officialCreate
        .filter((entry) => entry.canExecuteCreate)
        .map((entry) => entry.id),
    ];
    expect(SCAFFOLD_KIT_IDS).toEqual(contractedKits);
    expect(scaffoldRuntimeForFramework('nextjs')).toBe('node');
    expect(workspacePythonEngineForKit('fastapi.standard')).toBe('required');
    expect(workspacePythonEngineForKit('nestjs.standard')).toBe('optional');
    expect(workspacePythonEngineForKit('frontend.nextjs')).toBe('none');
  });

  it('keeps the webview enterprise dashboard aligned with eleven frontend starters', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../webview-ui/src/lib/scaffoldFrameworks.ts'),
      'utf8'
    );
    expect(source).toContain("framework: 'vite-vue'");
    expect(source).toContain("framework: 'vite-svelte'");
    expect(source).toContain("framework: 'vite-solid'");
    expect(source).toContain("framework: 'vite-vanilla'");
    expect(FRONTEND_SCAFFOLD_KITS).toHaveLength(11);
  });
});

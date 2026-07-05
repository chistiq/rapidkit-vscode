import path from 'path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  Uri: {
    file: (filePath: string) => ({ fsPath: filePath }),
  },
  workspace: {
    fs: {
      writeFile: async () => undefined,
    },
  },
}));

import { applyDoctorRemediationStep } from '../core/doctorRemediationApply.js';
import type { DoctorRemediationPlanStepView } from '../core/doctorRemediationPlanReader.js';

function step(
  operation: DoctorRemediationPlanStepView['operation'],
  overrides: Partial<DoctorRemediationPlanStepView> = {}
): DoctorRemediationPlanStepView {
  return {
    id: 'web:test-script',
    phase: 'command-contract',
    order: 1,
    projectName: 'web',
    projectPath: '/workspace/apps/web',
    originalCommand: 'npx rapidkit doctor project --fix --json',
    kind: 'package-json-script',
    risk: 'guarded',
    executable: true,
    studioState: 'ready',
    studioReason: 'Ready for deterministic apply.',
    primaryAction: 'Add test script',
    requiresApproval: true,
    confidence: 'high',
    previewTitle: 'Add test script',
    previewSummary: 'Adds a test script.',
    diffSummary: 'package.json script update',
    files: ['package.json'],
    verifyCommand: 'npx rapidkit doctor project --json',
    refreshCommands: [],
    operation,
    canApply: Boolean(operation),
    ...overrides,
  };
}

describe('doctorRemediationApply', () => {
  it('applies package-json-script operations inside the project boundary', async () => {
    const writes = new Map<string, string>();
    const target = path.resolve('/workspace/apps/web/package.json');
    const result = await applyDoctorRemediationStep({
      workspacePath: '/workspace',
      step: step({
        type: 'package-json-script',
        path: 'package.json',
        scriptName: 'test',
        scriptValue: 'vitest run',
      }),
      deps: {
        pathExists: async () => true,
        readFile: async (filePath) =>
          filePath === target ? '{"name":"web","scripts":{"build":"next build"}}\n' : null,
        writeFile: async (filePath, content) => {
          writes.set(filePath, content);
        },
      },
    });

    expect(result.status).toBe('applied');
    expect(result.appliedFixes).toEqual([
      { path: 'package.json', action: 'package-json-script', outcome: 'applied' },
    ]);
    expect(JSON.parse(writes.get(target) ?? '{}')).toMatchObject({
      scripts: { build: 'next build', test: 'vitest run' },
    });
  });

  it('blocks remediation paths outside the project boundary', async () => {
    const result = await applyDoctorRemediationStep({
      workspacePath: '/workspace',
      step: step({
        type: 'file-create',
        path: '../../outside.txt',
        content: 'nope',
        overwrite: false,
      }),
      deps: {
        pathExists: async () => false,
        readFile: async () => null,
        writeFile: async () => {
          throw new Error('should not write');
        },
      },
    });

    expect(result.status).toBe('failed');
    expect(result.summary).toContain('outside project boundary');
  });

  it('keeps file append remediation idempotent for repeated approvals', async () => {
    const writes = new Map<string, string>();
    const target = path.resolve('/workspace/apps/web/.gitignore');
    const result = await applyDoctorRemediationStep({
      workspacePath: '/workspace',
      step: step({
        type: 'file-append',
        path: '.gitignore',
        lines: ['.env', '.env.*', 'node_modules/'],
        ensureNewline: true,
      }),
      deps: {
        pathExists: async () => true,
        readFile: async (filePath) => (filePath === target ? '.env\nnode_modules/\n' : null),
        writeFile: async (filePath, content) => {
          writes.set(filePath, content);
        },
      },
    });

    expect(result.status).toBe('applied');
    expect(writes.get(target)).toBe('.env\nnode_modules/\n.env.*\n');
  });

  it('treats create-if-missing remediation as a no-op when the file already exists', async () => {
    const target = path.resolve('/workspace/apps/web/.gitignore');
    const result = await applyDoctorRemediationStep({
      workspacePath: '/workspace',
      step: step({
        type: 'file-create',
        path: '.gitignore',
        content: '.env\nnode_modules/\n',
        overwrite: false,
      }),
      deps: {
        pathExists: async (filePath) => filePath === target,
        readFile: async () => '.env\nnode_modules/\n',
        writeFile: async () => {
          throw new Error('should not overwrite');
        },
      },
    });

    expect(result.status).toBe('applied');
    expect(result.appliedFixes).toEqual([
      { path: '.gitignore', action: 'file-create', outcome: 'unchanged' },
    ]);
  });

  it('reports unchanged when file append remediation is already satisfied', async () => {
    const writes = new Map<string, string>();
    const target = path.resolve('/workspace/apps/web/.gitignore');
    const result = await applyDoctorRemediationStep({
      workspacePath: '/workspace',
      step: step({
        type: 'file-append',
        path: '.gitignore',
        lines: ['.env', '.env.*', 'node_modules/'],
        ensureNewline: true,
      }),
      deps: {
        pathExists: async () => true,
        readFile: async (filePath) =>
          filePath === target ? '.env\n.env.*\nnode_modules/\n' : null,
        writeFile: async (filePath, content) => {
          writes.set(filePath, content);
        },
      },
    });

    expect(result.status).toBe('applied');
    expect(result.appliedFixes).toEqual([
      { path: '.gitignore', action: 'file-append', outcome: 'unchanged' },
    ]);
    expect(writes.size).toBe(0);
  });

  it('reports unchanged when package-json-script already matches the target value', async () => {
    const writes = new Map<string, string>();
    const target = path.resolve('/workspace/apps/web/package.json');
    const result = await applyDoctorRemediationStep({
      workspacePath: '/workspace',
      step: step({
        type: 'package-json-script',
        path: 'package.json',
        scriptName: 'test',
        scriptValue: 'vitest run',
      }),
      deps: {
        pathExists: async () => true,
        readFile: async (filePath) =>
          filePath === target ? '{"name":"web","scripts":{"test":"vitest run"}}\n' : null,
        writeFile: async (filePath, content) => {
          writes.set(filePath, content);
        },
      },
    });

    expect(result.status).toBe('applied');
    expect(result.appliedFixes).toEqual([
      { path: 'package.json', action: 'package-json-script', outcome: 'unchanged' },
    ]);
    expect(writes.size).toBe(0);
  });
});

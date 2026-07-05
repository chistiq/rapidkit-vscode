import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs-extra';

import type {
  DoctorRemediationOperation,
  DoctorRemediationPlanStepView,
} from './doctorRemediationPlanReader.js';

export type DoctorRemediationApplyResult = {
  status: 'applied' | 'blocked' | 'failed';
  summary: string;
  appliedFixes: Array<{ path: string; action: string; outcome: string }>;
};

type AppliedOperationResult = {
  path: string;
  outcome: 'applied' | 'unchanged';
};

type ApplyDeps = {
  readFile?: (filePath: string) => Promise<string | null>;
  writeFile?: (filePath: string, content: string) => Promise<void>;
  copyFile?: (sourcePath: string, targetPath: string) => Promise<void>;
  pathExists?: (filePath: string) => Promise<boolean>;
};

async function defaultReadFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

async function defaultWriteFile(filePath: string, content: string): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));
  await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(content, 'utf8'));
}

async function defaultCopyFile(sourcePath: string, targetPath: string): Promise<void> {
  const content = await fs.readFile(sourcePath);
  await fs.ensureDir(path.dirname(targetPath));
  await vscode.workspace.fs.writeFile(vscode.Uri.file(targetPath), content);
}

function isChildPathOf(parentPath: string, childPath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return (
    relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function resolveOperationPath(basePath: string, operationPath: string): string {
  const resolved = path.isAbsolute(operationPath)
    ? path.resolve(operationPath)
    : path.resolve(basePath, operationPath);
  if (!isChildPathOf(basePath, resolved)) {
    throw new Error(`Refusing remediation path outside project boundary: ${operationPath}`);
  }
  return resolved;
}

function ensureTrailingNewline(content: string): string {
  return content.endsWith('\n') ? content : `${content}\n`;
}

function setJsonPointerValue(target: unknown, pointer: string, value: unknown): void {
  if (!pointer.startsWith('/')) {
    throw new Error(`Unsupported JSON pointer: ${pointer}`);
  }
  const parts = pointer
    .split('/')
    .slice(1)
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current = target as Record<string, unknown>;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!part) {
      throw new Error(`Unsupported JSON pointer segment: ${pointer}`);
    }
    const existing = current[part];
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1];
  if (!leaf) {
    throw new Error(`Unsupported JSON pointer leaf: ${pointer}`);
  }
  current[leaf] = value;
}

async function applyOperation(
  basePath: string,
  operation: DoctorRemediationOperation,
  deps: Required<ApplyDeps>
): Promise<AppliedOperationResult> {
  const targetPath = resolveOperationPath(basePath, operation.path);
  const exists = await deps.pathExists(targetPath);

  switch (operation.type) {
    case 'file-create':
      if (exists) {
        return { path: operation.path, outcome: 'unchanged' };
      }
      await deps.writeFile(targetPath, operation.content);
      return { path: operation.path, outcome: 'applied' };
    case 'file-append': {
      const current = (await deps.readFile(targetPath)) ?? '';
      const existingLines = new Set(
        current
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      );
      const missingLines = operation.lines.filter((line) => !existingLines.has(line.trim()));
      if (missingLines.length === 0) {
        return { path: operation.path, outcome: 'unchanged' };
      }
      const appendBlock = missingLines.join('\n');
      const separator = operation.ensureNewline ? ensureTrailingNewline(current) : current;
      await deps.writeFile(
        targetPath,
        `${separator}${appendBlock}${appendBlock.endsWith('\n') ? '' : '\n'}`
      );
      return { path: operation.path, outcome: 'applied' };
    }
    case 'file-copy': {
      if (exists) {
        throw new Error(`Refusing to overwrite existing file: ${operation.path}`);
      }
      const sourcePath = resolveOperationPath(basePath, operation.sourcePath);
      await deps.copyFile(sourcePath, targetPath);
      return { path: operation.path, outcome: 'applied' };
    }
    case 'package-json-script': {
      const current = await deps.readFile(targetPath);
      if (!current) {
        throw new Error(`Package file not found: ${operation.path}`);
      }
      const parsed = JSON.parse(current) as { scripts?: Record<string, string> };
      parsed.scripts = parsed.scripts && typeof parsed.scripts === 'object' ? parsed.scripts : {};
      if (parsed.scripts[operation.scriptName] === operation.scriptValue) {
        return { path: operation.path, outcome: 'unchanged' };
      }
      parsed.scripts[operation.scriptName] = operation.scriptValue;
      await deps.writeFile(targetPath, `${JSON.stringify(parsed, null, 2)}\n`);
      return { path: operation.path, outcome: 'applied' };
    }
    case 'json-edit': {
      const current = await deps.readFile(targetPath);
      if (!current) {
        throw new Error(`JSON file not found: ${operation.path}`);
      }
      const parsed = JSON.parse(current) as unknown;
      for (const edit of operation.edits) {
        setJsonPointerValue(parsed, edit.pointer, edit.value);
      }
      await deps.writeFile(targetPath, `${JSON.stringify(parsed, null, 2)}\n`);
      return { path: operation.path, outcome: 'applied' };
    }
    case 'env-key-add': {
      const current = (await deps.readFile(targetPath)) ?? '';
      const existingNames = new Set(
        current
          .split(/\r?\n/)
          .map((line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1])
          .filter((entry): entry is string => Boolean(entry))
      );
      const additions: string[] = [];
      for (const key of operation.keys) {
        if (existingNames.has(key.name)) {
          continue;
        }
        if (key.comment?.trim()) {
          additions.push(`# ${key.comment.trim()}`);
        }
        additions.push(`${key.name}=${key.value}`);
      }
      if (additions.length === 0) {
        return { path: operation.path, outcome: 'unchanged' };
      }
      await deps.writeFile(
        targetPath,
        `${ensureTrailingNewline(current)}${additions.join('\n')}\n`
      );
      return { path: operation.path, outcome: 'applied' };
    }
    case 'makefile-target': {
      const current = (await deps.readFile(targetPath)) ?? '';
      const targetPattern = new RegExp(
        `(^|\\n)${operation.target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`
      );
      if (targetPattern.test(current)) {
        return { path: operation.path, outcome: 'unchanged' };
      }
      const lines = [
        operation.phony ? `.PHONY: ${operation.target}` : '',
        `${operation.target}:`,
        `\t${operation.command}`,
      ].filter(Boolean);
      await deps.writeFile(targetPath, `${ensureTrailingNewline(current)}${lines.join('\n')}\n`);
      return { path: operation.path, outcome: 'applied' };
    }
  }
}

export async function applyDoctorRemediationStep(input: {
  workspacePath: string;
  step: DoctorRemediationPlanStepView;
  deps?: ApplyDeps;
}): Promise<DoctorRemediationApplyResult> {
  if (!input.step.operation) {
    return {
      status: 'blocked',
      summary:
        'This remediation step has no deterministic file operation. Run the command instead.',
      appliedFixes: [],
    };
  }
  if (input.step.risk === 'invasive') {
    return {
      status: 'blocked',
      summary: 'Invasive remediation steps require manual review before file edits.',
      appliedFixes: [],
    };
  }
  if (input.step.studioState !== 'ready' && input.step.studioState !== 'review-required') {
    return {
      status: 'blocked',
      summary: input.step.studioReason || 'This remediation step is not ready for Studio apply.',
      appliedFixes: [],
    };
  }

  const deps: Required<ApplyDeps> = {
    readFile: input.deps?.readFile ?? defaultReadFile,
    writeFile: input.deps?.writeFile ?? defaultWriteFile,
    copyFile: input.deps?.copyFile ?? defaultCopyFile,
    pathExists: input.deps?.pathExists ?? fs.pathExists,
  };
  const basePath = input.step.projectPath?.trim() || input.workspacePath;

  try {
    const operationResult = await applyOperation(basePath, input.step.operation, deps);
    const changed = operationResult.outcome === 'applied';
    return {
      status: 'applied',
      summary: changed
        ? `${input.step.primaryAction || input.step.previewTitle} applied. Run verify to refresh the card.`
        : `${input.step.primaryAction || input.step.previewTitle} was already in place. Run verify to refresh the card.`,
      appliedFixes: [
        {
          path: operationResult.path,
          action: input.step.operation.type,
          outcome: operationResult.outcome,
        },
      ],
    };
  } catch (error) {
    return {
      status: 'failed',
      summary: error instanceof Error ? error.message : String(error),
      appliedFixes: [],
    };
  }
}

import crypto from 'node:crypto';
import { constants } from 'node:fs';
import path from 'node:path';
import fs from 'fs-extra';
import type * as vscode from 'vscode';
import type { StudioAgentToolDefinition } from './studioAgentToolRegistry.js';
import { StudioHostToolOutputStore } from './studioHostToolOutputStore.js';
import { writeStudioNativeAsset } from './studioNativeWorkspace.js';
import { studioSourcePathDenialReason } from './studioWorkspacePathPolicy.js';

async function target(root: string, value: unknown): Promise<string> {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 2000 ||
    /[\0\r\n]/.test(value) ||
    path.isAbsolute(value)
  ) {
    throw new Error('Supply an authorized scope-relative file path.');
  }
  const relative = path.relative(path.resolve(root), path.resolve(root, value));
  if (
    !relative ||
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    studioSourcePathDenialReason(relative)
  ) {
    throw new Error('File is outside the editable source scope.');
  }
  let cursor = root;
  for (const part of relative.split(path.sep)) {
    cursor = path.join(cursor, part);
    const stat = await fs.lstat(cursor).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return undefined;
      }
      throw error;
    });
    if (stat?.isSymbolicLink()) {
      throw new Error('File path crosses a symbolic link.');
    }
  }
  return path.resolve(root, relative);
}
async function read(file: string): Promise<Buffer> {
  const handle = await fs.open(
    file,
    constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0)
  );
  try {
    const stat = await fs.fstat(handle);
    if (!stat.isFile() || stat.size > 16 * 1024 * 1024) {
      throw new Error('File must be a regular file up to 16 MiB.');
    }
    const bytes = Buffer.alloc(stat.size);
    const result = await fs.read(handle, bytes, 0, bytes.length, 0);
    if (result.bytesRead !== bytes.length || (await fs.fstat(handle)).mtimeMs !== stat.mtimeMs) {
      throw new Error('File changed during inspection. Retry its current metadata.');
    }
    return bytes;
  } finally {
    await fs.close(handle);
  }
}
export function studioWorkspaceAssetTools(
  context: vscode.ExtensionContext,
  remember?: (id: string) => void
): StudioAgentToolDefinition[] {
  return [
    {
      name: 'inspect-workspace-file',
      title: 'Read file byte metadata',
      activity: 'inspect',
      risk: 'read',
      description:
        'Read current file hash, byte count and binary/text kind without loading its body into model context. Paths are project-relative when a project is selected, otherwise workspace-relative. Use view-workspace-image for visual inspection. This metadata does not assert file quality.',
      inputSchema: {
        type: 'object',
        required: ['path'],
        additionalProperties: false,
        properties: { path: { type: 'string', minLength: 1, maxLength: 2000 } },
      },
      async execute(raw, owner) {
        const input = raw as { path?: unknown };
        const root = owner.projectPath ?? owner.workspacePath;
        const file = await target(root, input?.path);
        if (owner.signal.aborted) {
          return { ok: false, error: 'File inspection cancelled.' };
        }
        const bytes = await read(file);
        const text = bytes.toString('utf8');
        return {
          ok: true,
          output: {
            path: path.relative(root, file).replace(/\\/g, '/'),
            bytes: bytes.length,
            sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
            binary: bytes.includes(0) || !Buffer.from(text).equals(bytes),
            authority: 'current-disk-bytes',
          },
        };
      },
    },
    {
      name: 'write-workspace-asset',
      title: 'Copy an asset into the workspace',
      activity: 'change',
      risk: 'safe-write',
      description:
        'Write/copy an asset from a scoped source file or an owned retained tool image without sending binary/base64 through model arguments. Supply target and expectedTargetHash from inspect-workspace-file (null only for a new file). Choose sourcePath OR outputRef+imageIndex. The current project/workspace scope, exact hashes and request checkpoint apply; inspect the image and verify relevant project checks. Tool effects outside local files are not undone.',
      inputSchema: {
        type: 'object',
        required: ['target', 'expectedTargetHash'],
        additionalProperties: false,
        properties: {
          target: { type: 'string', minLength: 1, maxLength: 2000 },
          expectedTargetHash: { type: ['string', 'null'], pattern: '^[a-f0-9]{64}$' },
          sourcePath: { type: 'string', maxLength: 2000 },
          outputRef: { type: 'string', maxLength: 200 },
          imageIndex: { type: 'integer', minimum: 0, maximum: 19 },
        },
      },
      async execute(raw, owner) {
        const input = raw as {
          target?: unknown;
          expectedTargetHash?: unknown;
          sourcePath?: unknown;
          outputRef?: unknown;
          imageIndex?: unknown;
        };
        if (
          !input ||
          (input.expectedTargetHash !== null &&
            (typeof input.expectedTargetHash !== 'string' ||
              !/^[a-f0-9]{64}$/.test(input.expectedTargetHash))) ||
          (input.sourcePath !== undefined) === (input.outputRef !== undefined)
        ) {
          throw new Error(
            'Select exactly one asset source and an exact target hash or null for creation.'
          );
        }
        const root = owner.projectPath ?? owner.workspacePath;
        const file = await target(root, input.target);
        let bytes: Buffer;
        if (input.sourcePath !== undefined) {
          bytes = await read(await target(root, input.sourcePath));
        } else {
          const index = input.imageIndex ?? 0;
          if (
            typeof input.outputRef !== 'string' ||
            !Number.isInteger(index) ||
            (index as number) < 0 ||
            (index as number) > 19
          ) {
            throw new Error('Select an owned tool image by output reference and index.');
          }
          const storage = context.storageUri?.fsPath ?? context.globalStorageUri.fsPath;
          const result = await new StudioHostToolOutputStore(storage).read(
            owner.sessionId,
            input.outputRef
          );
          const image = result.images?.[index as number];
          if (!image) {
            throw new Error('The selected retained image is unavailable in this chat.');
          }
          const suffix = new Map([
            ['image/png', ['.png']],
            ['image/jpeg', ['.jpg', '.jpeg']],
            ['image/gif', ['.gif']],
            ['image/webp', ['.webp']],
          ]);
          if (!suffix.get(image.mimeType)?.includes(path.extname(file).toLowerCase())) {
            throw new Error('The target extension must match the retained image MIME type.');
          }
          bytes = Buffer.from(image.base64, 'base64');
        }
        if (owner.signal.aborted) {
          return { ok: false, error: 'Asset write cancelled before execution.' };
        }
        const result = await writeStudioNativeAsset({
          workspacePath: root,
          sessionId: owner.sessionId,
          requestId: owner.requestId,
          relativePath: path.relative(root, file),
          expectedHash: input.expectedTargetHash as string | null,
          bytes,
        });
        remember?.(result.output.transactionId);
        return result;
      },
    },
  ];
}

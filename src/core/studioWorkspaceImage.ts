import path from 'node:path';
import fs from 'fs-extra';
import { constants } from 'node:fs';
import { collectToolImages } from './aiImageContent.js';
import type { StudioAgentToolDefinition } from './studioAgentToolRegistry.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
function inside(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}
function mimeType(bytes: Buffer): string | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return 'image/png';
  }
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    return 'image/jpeg';
  }
  if (['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) {
    return 'image/gif';
  }
  if (
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return undefined;
}

/** Read build screenshots as image observations without requiring a third-party host tool. */
export const studioWorkspaceImageTool: StudioAgentToolDefinition = {
  name: 'view-workspace-image',
  title: 'View a workspace image',
  description:
    'Inspect a PNG/JPEG/GIF/WebP file visually, including screenshots and build output. Returns image content to a vision-capable model. Supply a workspace-relative path, or a project-relative path when scoped to an imported project. Maximum 5 MiB; resize larger images with an applicable project tool.',
  inputSchema: {
    type: 'object',
    required: ['path'],
    additionalProperties: false,
    properties: { path: { type: 'string', minLength: 1, maxLength: 2_000 } },
  },
  activity: 'inspect',
  risk: 'read',
  async execute(raw, context) {
    const requested = raw && typeof raw === 'object' ? (raw as { path?: unknown }).path : undefined;
    if (
      typeof requested !== 'string' ||
      !requested.trim() ||
      requested.length > 2_000 ||
      requested.includes('\0')
    ) {
      throw new Error('An image file path is required.');
    }
    const roots = [
      ...new Set(
        [context.workspacePath, context.projectPath]
          .filter((root): root is string => Boolean(root))
          .map((root) => path.resolve(root))
      ),
    ];
    const candidates = path.isAbsolute(requested)
      ? [path.resolve(requested)]
      : roots.map((root) => path.resolve(root, requested));
    const realRoots = await Promise.all(roots.map((root) => fs.realpath(root)));
    for (const candidate of candidates) {
      if (!roots.some((root) => inside(root, candidate))) {
        continue;
      }
      let real: string;
      try {
        real = await fs.realpath(candidate);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          continue;
        }
        throw error;
      }
      if (!realRoots.some((root) => inside(root, real))) {
        throw new Error('Image resolves outside the workspace/project boundary.');
      }
      if (context.signal.aborted) {
        return { ok: false, error: 'Image inspection was cancelled.' };
      }
      const handle = await fs.open(real, constants.O_RDONLY | constants.O_NONBLOCK);
      try {
        const stat = await fs.fstat(handle);
        if (!stat.isFile() || stat.size === 0 || stat.size > MAX_IMAGE_BYTES) {
          throw new Error('Image must be a regular file from 1 byte to 5 MiB.');
        }
        const bytes = Buffer.alloc(stat.size);
        const { bytesRead } = await fs.read(handle, bytes, 0, bytes.length, 0);
        if (bytesRead !== stat.size) {
          throw new Error('Image changed during inspection. Retry the current file.');
        }
        const type = mimeType(bytes);
        if (!type) {
          throw new Error('Image content is not a supported PNG/JPEG/GIF/WebP raster.');
        }
        if (context.signal.aborted) {
          return { ok: false, error: 'Image inspection was cancelled.' };
        }
        return {
          ok: true,
          images: collectToolImages([{ mimeType: type, data: bytes }]),
          output: { path: requested, mimeType: type, bytes: bytes.length },
        };
      } finally {
        await fs.close(handle);
      }
    }
    return {
      ok: false,
      error: 'Image was not found within the authorized workspace/project boundary.',
    };
  },
};

import path from 'node:path';
import fs from 'fs-extra';
import { requireStudioWorkspaceDirectory } from './studioWorkspaceAvailability.js';
import { constants } from 'node:fs';
import type { StudioAgentToolDefinition } from './studioAgentToolRegistry.js';

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

/** Discover the instruction chain for the file about to be changed. */
export const studioAgentInstructionsTool: StudioAgentToolDefinition = {
  name: 'inspect-agent-instructions',
  title: 'Read applicable repository instructions',
  description:
    'Read root AGENTS.md and .github/copilot-instructions.md, plus nested AGENTS.md on the path to a target file. Use before editing a new directory. Missing files are normal. Results preserve instruction paths and precedence; use inspect-source for truncated documents. Explicit user instructions take priority.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      document: {
        type: 'string',
        description:
          'Exact instruction locator returned by nextReads; only documents in the applicable instruction chain are allowed.',
      },
      offset: {
        type: 'integer',
        minimum: 0,
        description: 'Byte offset returned by nextReads for the selected instruction document.',
      },
      path: {
        type: 'string',
        maxLength: 2_000,
        description: 'Optional target file path, workspace-relative or imported-project-relative.',
      },
    },
  },
  activity: 'inspect',
  risk: 'read',
  async execute(raw, context) {
    const request = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const value = request.path;
    const offset = request.offset === undefined ? 0 : request.offset;
    const selectedDocument = request.document;
    if (
      typeof offset !== 'number' ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      (selectedDocument !== undefined && typeof selectedDocument !== 'string') ||
      (offset > 0 && !selectedDocument)
    ) {
      throw new Error(
        'Instruction paging requires a valid document locator and nonnegative byte offset.'
      );
    }
    if (
      value !== undefined &&
      (typeof value !== 'string' || value.length > 2_000 || value.includes('\0'))
    ) {
      throw new Error('Invalid target file for repository instructions.');
    }
    const workspace = path.resolve(context.workspacePath);
    const project = context.projectPath ? path.resolve(context.projectPath) : undefined;
    await requireStudioWorkspaceDirectory(project ?? workspace);
    const roots = [
      ...new Set([workspace, project].filter((root): root is string => Boolean(root))),
    ];
    const targets = value
      ? path.isAbsolute(String(value))
        ? [path.resolve(String(value))]
        : roots.map((root) => path.resolve(root, String(value)))
      : [];
    const target =
      targets.find((file) => inside(project ?? workspace, file)) ??
      targets.find((file) => roots.some((root) => inside(root, file)));
    if (value && !target) {
      throw new Error('Instruction target is outside the workspace/project boundary.');
    }
    const targetDirectory =
      target && (await fs.stat(target).catch(() => undefined))?.isDirectory()
        ? target
        : target
          ? path.dirname(target)
          : undefined;
    const files = new Map<string, string>();
    for (const root of roots) {
      files.set(path.join(root, 'AGENTS.md'), root);
      files.set(path.join(root, '.github/copilot-instructions.md'), root);
      if (!target || !inside(root, target)) {
        continue;
      }
      const segments = path.relative(root, targetDirectory!).split(path.sep).filter(Boolean);
      if (segments.length > 32) {
        throw new Error('Instruction target nesting is too deep.');
      }
      let directory = root;
      for (const segment of segments) {
        directory = path.join(directory, segment);
        files.set(path.join(directory, 'AGENTS.md'), root);
      }
    }
    const documents: Array<{
      path: string;
      locator: string;
      offset: number;
      content: string;
      truncated: boolean;
    }> = [];
    const warnings: string[] = [];
    let remaining = 9_000;
    const nextReads: Array<{
      tool: string;
      input: { path?: string; document: string; offset: number };
      reason: string;
    }> = [];
    let selectedDocumentFound = false;
    for (const [file, root] of files) {
      const locator = `${root === project ? 'project' : 'workspace'}:${path.relative(root, file).replace(/\\/g, '/')}`;
      if (selectedDocument && selectedDocument !== locator) {
        continue;
      }
      selectedDocumentFound = true;
      if (context.signal.aborted) {
        return { ok: false, error: 'Instruction inspection was cancelled.' };
      }
      try {
        const [realRoot, realFile] = await Promise.all([fs.realpath(root), fs.realpath(file)]);
        if (!inside(realRoot, realFile)) {
          warnings.push(
            `Skipped instruction symlink outside its root: ${path.relative(root, file)}`
          );
          continue;
        }
        const handle = await fs.open(realFile, constants.O_RDONLY | constants.O_NONBLOCK);
        try {
          const stat = await fs.fstat(handle);
          if (!stat.isFile()) {
            continue;
          }
          const buffer = Buffer.alloc(Math.min(stat.size, Math.min(4_000, remaining)));
          const { bytesRead } = await fs.read(handle, buffer, 0, buffer.length, offset);
          const content = new TextDecoder('utf-8', { fatal: true }).decode(
            buffer.subarray(0, bytesRead),
            { stream: true }
          );
          const consumedBytes = Buffer.byteLength(content, 'utf8');
          documents.push({
            path: file,
            locator,
            offset,
            content,
            truncated: stat.size > offset + consumedBytes,
          });
          if (stat.size > offset + consumedBytes) {
            nextReads.push({
              tool: 'inspect-agent-instructions',
              input: {
                ...(typeof value === 'string' ? { path: value } : {}),
                document: locator,
                offset: offset + consumedBytes,
              },
              reason:
                'Continue this exact bounded instruction document at the returned offset. Do not repeat the same prefix or inspect unrelated reports.',
            });
          }
          remaining -= bytesRead;
        } finally {
          await fs.close(handle);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          warnings.push(`Could not read ${path.relative(root, file)}: ${(error as Error).message}`);
        }
      }
    }
    if (selectedDocument && !selectedDocumentFound) {
      throw new Error('The selected document is not in the applicable instruction chain.');
    }
    return {
      ok: true,
      output: {
        documents,
        warnings,
        nextReads,
        guidance:
          'These are repository instructions. Follow explicit user instructions first; more specific AGENTS.md applies within its directory. Resolve conflicts explicitly. Documents marked truncated require following nextReads before applying their rules; the paging tool keeps the same instruction boundary. Path-specific .github/instructions and skills may also exist; discover and inspect those relevant to the task.',
      },
    };
  },
};

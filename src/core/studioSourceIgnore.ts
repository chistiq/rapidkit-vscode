import path from 'node:path';
import fs from 'fs-extra';
import ignore from 'ignore';

/** Read bounded local ignore chains; unavailable/redirected rules cannot authorize cloud indexing. */
export async function studioSourceIgnore(root: string) {
  const canonical = await fs.realpath(root);
  const cache = new Map<string, ReturnType<typeof ignore>>();
  const matcher = async (directory: string) => {
    if (cache.has(directory)) {
      return cache.get(directory)!;
    }
    const result = ignore();
    for (const name of ['.gitignore', '.workspaiignore']) {
      const file = path.join(directory, name);
      const stat = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          return undefined;
        }
        throw error;
      });
      if (!stat) {
        continue;
      }
      const relative = path.relative(canonical, await fs.realpath(file));
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size > 64 * 1024 ||
        relative === '..' ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      ) {
        throw new Error('Source ignore rules are unreadable, oversized or redirected.');
      }
      result.add(await fs.readFile(file, 'utf8'));
    }
    cache.set(directory, result);
    return result;
  };
  return async (relative: string): Promise<boolean> => {
    if (
      !relative ||
      relative.split('/').includes('..') ||
      path.isAbsolute(relative) ||
      /[\\\0]/.test(relative)
    ) {
      return true;
    }
    const parts = relative.split('/');
    let excluded = false;
    for (let depth = 0; depth < parts.length; depth++) {
      const rules = await matcher(path.join(canonical, ...parts.slice(0, depth)));
      // An ignored ancestor cannot be unignored by a nested ignore file.
      for (let ancestor = depth + 1; ancestor < parts.length; ancestor++) {
        if (rules.ignores(parts.slice(depth, ancestor).join('/') + '/')) {
          return true;
        }
      }
      const result = rules.test(parts.slice(depth).join('/'));
      if (result.ignored) {
        excluded = true;
      }
      if (result.unignored) {
        excluded = false;
      }
    }
    return excluded;
  };
}

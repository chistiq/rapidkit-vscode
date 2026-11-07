import path from 'node:path';
import { studioSourcePathDenialReason } from './studioWorkspacePathPolicy.js';

const EXTENSIONS = new Set(
  '.ts .tsx .js .jsx .mjs .cjs .py .go .rs .java .kt .cs .php .rb .swift .c .cpp .h .hpp .sh .sql .md .txt .json .yaml .yml .toml .xml .css .scss .html .vue .svelte .dart .ex .exs .scala .clj .cljs .tf'.split(
    ' '
  )
);
export function isStudioSemanticSourcePath(relative: string): boolean {
  if (
    studioSourcePathDenialReason(relative) ||
    /(?:^|\/)(?:\.ssh|\.aws|\.azure|\.kube|\.config|\.docker|\.gcloud)(?:\/|$)/i.test(relative) ||
    /(?:^|\/)(?:id_rsa|id_ed25519|authorized_keys)(?:\.|$)/i.test(relative)
  ) {
    return false;
  }
  return (
    EXTENSIONS.has(path.posix.extname(relative).toLowerCase()) ||
    /^(?:Dockerfile|Makefile|Rakefile|justfile)$/i.test(path.posix.basename(relative))
  );
}

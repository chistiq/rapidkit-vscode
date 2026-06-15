/**
 * Live module catalog formatting for AI prompts.
 * Uses the same source as the dashboard Catalog tab: rapidkit modules list --json-schema 1
 * (via ModulesCatalogService / fetchLiveModules). Static text is fallback only.
 */

export type LiveModuleEntry = {
  name: string;
  display_name: string;
  version: string;
  category: string;
  description: string;
  slug: string;
  tags: string[];
};

export function buildModuleListForPrompt(liveModules: LiveModuleEntry[] | null): string {
  if (liveModules && liveModules.length > 0) {
    const byCategory: Record<string, LiveModuleEntry[]> = {};
    for (const mod of liveModules) {
      (byCategory[mod.category] ??= []).push(mod);
    }
    const lines = Object.entries(byCategory).map(([cat, mods]) => {
      const slugs = mods
        .map((m) => {
          const version = m.version ? ` v${m.version}` : '';
          const tags =
            Array.isArray(m.tags) && m.tags.length > 0 ? ` [${m.tags.slice(0, 3).join(', ')}]` : '';
          return `${m.slug}${version}${tags}`;
        })
        .join('  ');
      return `  ${cat.charAt(0).toUpperCase() + cat.slice(1).padEnd(16)}: ${slugs}`;
    });
    return [
      'LIVE MODULE CATALOG (from rapidkit modules list — use EXACT slugs only):',
      ...lines,
      `Total: ${liveModules.length} module(s). Do NOT invent slugs not listed here.`,
    ].join('\n');
  }

  return [
    'MODULE CATALOG (fallback — rapidkit modules list unavailable; prefer slugs below):',
    '  Essentials:   free/essentials/settings  free/essentials/logging  free/essentials/middleware  free/essentials/deployment',
    '  Auth:         free/auth/core  free/auth/oauth  free/auth/session  free/auth/passwordless  free/auth/api_keys',
    '  Database:     free/database/db_postgres  free/database/db_mongo  free/database/db_sqlite',
    '  Cache:        free/cache/redis',
    '  Security:     free/security/cors  free/security/security_headers  free/security/rate_limiting',
    '  Observability: free/observability/core',
    '  Users:        free/users/users_core  free/users/users_profiles',
    '  Billing:      free/billing/stripe_payment  free/billing/cart  free/billing/inventory',
    '  Communication: free/communication/notifications  free/communication/email',
    '  Tasks:        free/tasks/celery',
    '  AI:           free/ai/ai_assistant',
    'Run `rapidkit modules list --json-schema 1` at project root for the full live catalog.',
  ].join('\n');
}

export function findLiveModuleBySlug(
  liveModules: LiveModuleEntry[] | null | undefined,
  slug: string
): LiveModuleEntry | undefined {
  if (!liveModules?.length || !slug.trim()) {
    return undefined;
  }
  const normalized = slug.trim().toLowerCase();
  return liveModules.find((mod) => mod.slug.trim().toLowerCase() === normalized);
}

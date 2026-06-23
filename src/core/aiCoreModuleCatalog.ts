/**
 * Canonical Workspai module architecture contract for AI grounding.
 *
 * Distilled once from the RapidKit platform spec (kit-registry + module catalog design).
 * Module-capable kits are pinned in contracts/module-support.v1.json.
 */

import { MODULE_CAPABLE_KIT_IDS } from './moduleSupportContract';

export { MODULE_CAPABLE_KIT_IDS };

export type ModuleCapableKitId = (typeof MODULE_CAPABLE_KIT_IDS)[number];

/** Twelve marketplace categories — slug prefix free/{category}/… */
export const MODULE_CATEGORY_IDS = [
  'ai',
  'auth',
  'users',
  'security',
  'database',
  'cache',
  'billing',
  'observability',
  'tasks',
  'communication',
  'business',
  'essentials',
] as const;

export function isModuleCapableKit(kitId?: string | null): kitId is ModuleCapableKitId {
  if (!kitId?.trim()) {
    return false;
  }
  return (MODULE_CAPABLE_KIT_IDS as readonly string[]).includes(kitId.trim());
}

export function buildWorkspaiPlatformContract(): string {
  return [
    'WORKSPAI PLATFORM CONTRACT (canonical — no developer-repo paths):',
    '- User entrypoint: npx rapidkit at workspace or project root.',
    '- Kit create + catalog module install/uninstall run through rapidkit-core when Python is available',
    '  (workspace .venv via pip/poetry, or pipx — location varies per machine; never cite a fixed engine path).',
    '- Module-capable kits ONLY: fastapi.standard, fastapi.ddd, nestjs.standard.',
    '- Go / Spring Boot / .NET kits: native deps only — no catalog module marketplace.',
    '- Teach from project evidence (.rapidkit/project.json, registry.json, scanned src/) before generic templates.',
  ].join('\n');
}

function buildFastApiModuleContract(kitId: 'fastapi.standard' | 'fastapi.ddd'): string {
  const dddNote =
    kitId === 'fastapi.ddd'
      ? '- Domain features live in src/app/{domain,application,presentation}/ — NOT in src/modules/free/.'
      : '- Domain/example routes: src/routing/ (e.g. examples.py) — separate from catalog modules.';

  return [
    `CATALOG MODULE ARCHITECTURE — ${kitId}:`,
    '',
    'Install (project root):  npx rapidkit add module free/<category>/<name>',
    'Remove (project root):   rapidkit uninstall module free/<category>/<name>',
    'Manifest:                registry.json → installed_modules[]',
    '',
    'Generated layout (in the user project, not in any engine checkout):',
    '  src/modules/free/{category}/{name}/   ← module code + config hooks',
    '  config/{category}/{name}.yaml         ← module settings (when module defines them)',
    '',
    'Wiring after install:',
    '  • pyproject.toml        → # <<<inject:poetry-dependencies>>>',
    '  • src/main.py           → # <<<inject:imports|startup|shutdown|routes>>>',
    '  • src/routing/__init__.py → # <<<inject:router-imports|router-mount>>>',
    '  • src/modules/__init__.py → # <<<inject:module-init>>>',
    '  • HTTP: api_router mounted with prefix="/api" in src/main.py',
    '',
    dddNote,
    '',
    'Dual-framework modules: same slug installs FastAPI routers + pydantic-settings snippets;',
    'NestJS variant exists for the same slug when used on nestjs.standard.',
  ].join('\n');
}

function buildNestJsModuleContract(): string {
  return [
    'CATALOG MODULE ARCHITECTURE — nestjs.standard:',
    '',
    'Install (project root):  npx rapidkit add module free/<category>/<name>',
    'Remove (project root):   rapidkit uninstall module free/<category>/<name>',
    'Manifest:                registry.json → installed_modules[]',
    '',
    'Generated layout (in the user project):',
    '  src/modules/free/{category}/{name}/',
    '    {name}.module.ts | .service.ts | .controller.ts | config/{name}.validation.ts',
    '  src/modules/index.ts  → rapidkitModules[] aggregates installed catalog modules',
    '',
    'Wiring after install:',
    '  • src/app.module.ts     → // <<<inject:module-imports>>> (catalog modules AFTER domain modules like ExamplesModule)',
    '  • src/modules/index.ts  → // <<<inject:module-exports>>>',
    '  • src/config/configuration.ts → // <<<inject:configuration>>>',
    '  • src/config/validation.ts    → // <<<inject:env-schema>>>',
    '  • .env.example          → # <<<inject:module-env>>>',
    '',
    'Domain feature (NOT catalog): src/{feature}/ mirroring src/examples/',
    '  • @Controller("<feature>/<resource>") — no /api prefix unless setGlobalPrefix() exists',
    '  • dto/create-*.dto.ts in dto/ subfolder',
    '',
    'Dual-framework modules: same slug on FastAPI kits generates Python routers for the same capability.',
  ].join('\n');
}

export function buildCatalogModuleArchitectureContract(
  kitId?: string | null,
  installedSlugs?: string[]
): string {
  if (!isModuleCapableKit(kitId)) {
    return '';
  }

  const shared = [
    'WORKSPAI CATALOG MODULE SYSTEM (canonical architecture):',
    '',
    'What catalog modules are:',
    '  • Platform capabilities (auth, db, redis, billing, observability, …)',
    '  • Installed by slug — NOT hand-scaffolded domain code',
    '',
    'What they are NOT:',
    '  • Domain features the product team owns (teams, orders, notes, CRM, …)',
    '',
    `Slug format: free/{category}/{name}   (full slug list: see LIVE MODULE CATALOG in module section)`,
    '',
    'Authoring a new module for a project (follow platform shape):',
    '  • Mirror an existing module under src/modules/free/{category}/{name}/',
    '  • Register via the same inject anchors the CLI uses on install',
    '  • Keep framework variants aligned (FastAPI router + NestJS Module/Service/Controller)',
    '  • Future: publish to marketplace; until then treat as project-local vendor module',
  ];

  const kitBlock =
    kitId === 'nestjs.standard'
      ? buildNestJsModuleContract()
      : buildFastApiModuleContract(kitId as 'fastapi.standard' | 'fastapi.ddd');

  const lines = [...shared, '', kitBlock];

  if (installedSlugs && installedSlugs.length > 0) {
    lines.push(
      '',
      `Installed in active project (${installedSlugs.length}): ${installedSlugs.slice(0, 8).join(', ')}${installedSlugs.length > 8 ? '…' : ''}`
    );
  }

  return lines.join('\n');
}

/** @deprecated Use buildCatalogModuleArchitectureContract — kept for tests counting categories */
export const CORE_MODULE_CATEGORIES = MODULE_CATEGORY_IDS.map((id) => ({
  id,
  moduleCount: 0,
}));

export function totalCoreModuleCount(): number {
  return 52;
}

/** @deprecated Use buildWorkspaiPlatformContract */
export function buildCliCoreBridgeSection(): string {
  return buildWorkspaiPlatformContract();
}

/** @deprecated Use buildCatalogModuleArchitectureContract */
export function buildCoreModuleSystemSection(
  installedSlugs?: string[],
  kitId?: string | null
): string {
  return buildCatalogModuleArchitectureContract(kitId ?? 'fastapi.standard', installedSlugs);
}

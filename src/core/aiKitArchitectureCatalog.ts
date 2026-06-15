import type { AIModalContext, ScannedProjectContext } from './aiService';

/**
 * Canonical Workspai kit architecture contracts for AI grounding.
 * Distilled from the platform kit registry — teaches project layout patterns,
 * NOT paths inside rapidkit-core or any developer checkout.
 */

export type KitOwner = 'core' | 'npm';

export type KitBlueprint = {
  id: string;
  owner: KitOwner;
  runtime: string;
  framework: string;
  moduleSupport: boolean;
  stability: 'stable' | 'preview';
  createCommand: string;
  layout: string;
  patterns: string;
  injectionPoints: string[];
};

const KIT_BLUEPRINTS: Record<string, KitBlueprint> = {
  'fastapi.ddd': {
    id: 'fastapi.ddd',
    owner: 'core',
    runtime: 'python',
    framework: 'fastapi',
    moduleSupport: true,
    stability: 'stable',
    createCommand:
      'npx rapidkit create project fastapi.ddd <name> [--output <dir>] [--install-essentials]',
    layout: `  src/
    app/
      config/            ← Pydantic-settings config loader (__init__.py)
      domain/
        models/          ← Dataclasses with @dataclass(slots=True, frozen=True)
      application/
        interfaces.py    ← Protocol-based repository contracts + ServiceContext
        use_cases/       ← Pure Python functions
      infrastructure/
        repositories/    ← Concrete SQLAlchemy 2.x / in-memory impls
      presentation/
        api/
          routes/        ← APIRouter + Pydantic v2 schemas
          dependencies/  ← @lru_cache get_service_context() → ServiceContext
      shared/
        result.py        ← Result[T, E] generic wrapper
      main.py            ← create_app() factory (FastAPI + CORSMiddleware + /api prefix)
    cli.py               ← poetry scripts (dev, test, lint, format)
    modules/free/        ← Installed RapidKit modules
    routing/             ← src/routing/__init__.py re-exports api_router
  pyproject.toml         ← poetry; fastapi, pydantic, uvicorn[standard]
  alembic/               ← DB migrations (if db_postgres installed)
  registry.json          ← Installed modules manifest
  config/                ← Per-module YAML configs`,
    patterns: `  • App factory: src/app/main.py; entry shim: src/main.py
  • Presentation routes mount with /api prefix (see src/app/presentation/api/router.py)
  • Domain entities: @dataclass(slots=True) — NO SQLAlchemy mixins in domain
  • Repos: Protocol in interfaces.py, concrete in infrastructure/repositories/
  • DI wiring: @lru_cache get_service_context() in presentation/api/dependencies/
  • Catalog modules: src/modules/free/{category}/{name}/ (CLI install — not hand-written)`,
    injectionPoints: [
      'src/main.py → # <<<inject:imports>>> | # <<<inject:startup>>> | # <<<inject:shutdown>>> | # <<<inject:routes>>>',
      'src/routing/__init__.py → # <<<inject:router-imports>>> | # <<<inject:router-mount>>>',
      'src/modules/__init__.py → # <<<inject:module-init>>>',
      'pyproject.toml → # <<<inject:poetry-dependencies>>>',
    ],
  },
  'fastapi.standard': {
    id: 'fastapi.standard',
    owner: 'core',
    runtime: 'python',
    framework: 'fastapi',
    moduleSupport: true,
    stability: 'stable',
    createCommand:
      'npx rapidkit create project fastapi.standard <name> [--output <dir>] [--install-essentials]',
    layout: `  src/
    modules/free/        ← Installed RapidKit modules (main feature code lives here)
    routing/             ← Root router; src/routing/__init__.py re-exports api_router
    main.py              ← create_app() factory
    cli.py               ← poetry scripts (dev, test, lint, format)
  pyproject.toml         ← poetry; fastapi, pydantic, uvicorn[standard]
  registry.json          ← Installed modules manifest
  config/                ← Per-module YAML configs`,
    patterns: `  • src/main.py: app.include_router(api_router, prefix="/api") — routes ARE under /api
  • Example routes: src/routing/examples.py, health: src/routing/health.py
  • Catalog modules: src/modules/free/{category}/{name}/ registered via src/routing/
  • Settings: src/modules/free/essentials/settings/settings.py → get_settings()
  • Create may auto-install essentials (settings, logging, deployment) via --install-essentials`,
    injectionPoints: [
      'src/main.py → # <<<inject:imports>>> | # <<<inject:startup>>> | # <<<inject:shutdown>>> | # <<<inject:routes>>>',
      'src/routing/__init__.py → # <<<inject:router-imports>>> | # <<<inject:router-mount>>>',
      'src/modules/__init__.py → # <<<inject:module-init>>>',
      'pyproject.toml → # <<<inject:poetry-dependencies>>>',
    ],
  },
  'nestjs.standard': {
    id: 'nestjs.standard',
    owner: 'core',
    runtime: 'node',
    framework: 'nestjs',
    moduleSupport: true,
    stability: 'stable',
    createCommand:
      'npx rapidkit create project nestjs.standard <name> [--output <dir>] [--install-essentials]',
    layout: `  src/
    app.module.ts        ← Root module; imports ConfigModule.forRoot({ isGlobal: true })
    app.controller.ts / app.service.ts
    main.ts              ← NestFactory.create; helmet, compression, Swagger at /docs
    config/
      configuration.ts   ← settingsConfiguration loader
      validation.ts      ← Joi validationSchema
    modules/
      index.ts           ← re-exports as rapidkitModules[]
    modules/free/
      {category}/{slug}/ ← Installed RapidKit modules
    auth/                ← Built-in auth scaffold
    examples/            ← Example feature module (mirror for new domain modules)
  test/                  ← E2E specs
  package.json           ← @nestjs/core, helmet, compression, @nestjs/swagger
  registry.json          ← Installed modules manifest`,
    patterns: `  • Example domain module: src/examples/ (@Controller('examples/notes') — mirror for new features)
  • Catalog modules: src/modules/free/{category}/{name}/ → rapidkitModules[] in src/modules/index.ts
  • AppModule: ExamplesModule BEFORE ...rapidkitModules spread
  • No setGlobalPrefix() in main.ts by default — routes are NOT auto-prefixed with /api
  • Default port: parseInt(process.env.PORT ?? '8000'); Swagger at /docs when enabled
  • Auth scaffold: src/auth/ (separate from catalog auth modules)`,
    injectionPoints: [
      'src/app.module.ts → // <<<inject:module-imports>>>',
      'src/main.ts → // <<<inject:global-middleware>>> | // <<<inject:bootstrap-hooks>>>',
      'src/config/configuration.ts → // <<<inject:configuration>>>',
      'src/config/validation.ts → // <<<inject:env-schema>>>',
      'src/modules/index.ts → // <<<inject:module-exports>>>',
      '.env.example → # <<<inject:module-env>>>',
    ],
  },
  'gofiber.standard': {
    id: 'gofiber.standard',
    owner: 'npm',
    runtime: 'go',
    framework: 'gofiber',
    moduleSupport: false,
    stability: 'stable',
    createCommand: 'npx rapidkit create project gofiber.standard <name> [--output <dir>]',
    layout: `  cmd/server/main.go     ← Entry; config.Load(), server.NewRouter(cfg), graceful shutdown
  internal/
    config/config.go       ← 12-factor env config
    server/server.go       ← Fiber v2 router factory
    handlers/              ← HTTP handlers (one file per domain aggregate)
    middleware/            ← requestid, cors, ratelimit
    apierr/apierr.go       ← JSON error envelope
  docs/doc.go              ← swaggo OpenAPI annotations
  go.mod / Makefile / .air.toml / Dockerfile
  rapidkit / rapidkit.cmd  ← project launcher`,
    patterns: `  • Structured logging via slog (JSON handler)
  • Config via os.LookupEnv with fallback; config.Load() returns typed *Config
  • Graceful shutdown: signal.Notify + srv.Shutdown(ctx) with 5s timeout
  • API docs: /docs → /docs/index.html via fiber-swagger
  • No RapidKit module marketplace (module_support=false)
  • Launcher: rapidkit init → rapidkit dev (hot reload via air)`,
    injectionPoints: [],
  },
  'gogin.standard': {
    id: 'gogin.standard',
    owner: 'npm',
    runtime: 'go',
    framework: 'gogin',
    moduleSupport: false,
    stability: 'stable',
    createCommand: 'npx rapidkit create project gogin.standard <name> [--output <dir>]',
    layout: `  cmd/server/main.go     ← Entry; config.Load(), server.NewRouter(cfg), graceful shutdown
  internal/
    config/config.go       ← 12-factor env config
    server/server.go       ← Gin router factory
    handlers/              ← HTTP handlers
    middleware/            ← requestid, cors, ratelimit
    apierr/apierr.go       ← JSON error envelope
  docs/doc.go              ← swaggo OpenAPI annotations
  go.mod / Makefile / .air.toml / Dockerfile
  rapidkit / rapidkit.cmd  ← project launcher`,
    patterns: `  • Structured logging via slog (JSON handler)
  • Config via os.LookupEnv; Gin mode from GIN_MODE env
  • API docs: /docs via gin-swagger
  • No RapidKit module marketplace (module_support=false)
  • Launcher: rapidkit init → rapidkit dev (hot reload via air)`,
    injectionPoints: [],
  },
  'springboot.standard': {
    id: 'springboot.standard',
    owner: 'npm',
    runtime: 'java',
    framework: 'springboot',
    moduleSupport: false,
    stability: 'stable',
    createCommand:
      'npx rapidkit create project springboot.standard <name> [--java-version <major>] [--port <number>]',
    layout: `  src/main/java/com/rapidkit/apps/{service}/
    AppApplication.java                     ← @SpringBootApplication entrypoint
    config/OpenApiConfiguration.java
    service/SystemInfoService.java          ← service layer business logic
    api/http/SystemInfoController.java      ← REST controller (no business logic)
    api/http/ApiExceptionHandler.java
  src/main/resources/application.yml
  src/test/java/...
  pom.xml
  .rapidkit/project.json                    ← runtime=java, module_support=false`,
    patterns: `  • Keep controllers thin; business rules in @Service classes
  • Constructor injection for all Spring beans
  • Jakarta Bean Validation on request DTOs
  • @RestControllerAdvice for HTTP error translation
  • API docs: /swagger-ui/index.html and /v3/api-docs
  • No RapidKit module marketplace (module_support=false)`,
    injectionPoints: [],
  },
  'dotnet.webapi.clean': {
    id: 'dotnet.webapi.clean',
    owner: 'npm',
    runtime: 'dotnet',
    framework: 'dotnet',
    moduleSupport: false,
    stability: 'preview',
    createCommand:
      'npx rapidkit create project dotnet.webapi.clean <name> [--target-framework net8.0] [--port <number>]',
    layout: `  src/
    {Service}.Api/                 ← ASP.NET Core HTTP boundary (Program.cs)
    {Service}.Application/         ← Use cases, DTOs, validation contracts
    {Service}.Domain/              ← Entities, value objects, domain errors
    {Service}.Infrastructure/      ← Repositories, external adapters
  tests/{Service}.Tests/
  *.sln
  .rapidkit/project.json           ← runtime=dotnet, module_support=false`,
    patterns: `  • Controllers/endpoints thin; business rules in Application/Domain
  • DI registration in Program.cs or extension methods
  • appsettings.json + environment variables for configuration
  • Built-in health checks and startup probes
  • No RapidKit module marketplace (module_support=false)`,
    injectionPoints: [],
  },
};

const KIT_ALIASES: Record<string, string> = {
  fastapi: 'fastapi.standard',
  nestjs: 'nestjs.standard',
  nest: 'nestjs.standard',
  go: 'gofiber.standard',
  'go.standard': 'gofiber.standard',
  fiber: 'gofiber.standard',
  gofiber: 'gofiber.standard',
  gin: 'gogin.standard',
  gogin: 'gogin.standard',
  spring: 'springboot.standard',
  springboot: 'springboot.standard',
  java: 'springboot.standard',
  dotnet: 'dotnet.webapi.clean',
  'dotnet.webapi': 'dotnet.webapi.clean',
  aspnet: 'dotnet.webapi.clean',
  csharp: 'dotnet.webapi.clean',
  'go.fiber': 'gofiber.standard',
  'go.gin': 'gogin.standard',
};

export function resolveKitId(value?: string | null): string | null {
  if (!value?.trim()) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (KIT_BLUEPRINTS[normalized]) {
    return normalized;
  }
  if (KIT_ALIASES[normalized]) {
    return KIT_ALIASES[normalized];
  }
  if (normalized.startsWith('fastapi')) {
    return normalized.includes('ddd') ? 'fastapi.ddd' : 'fastapi.standard';
  }
  if (normalized.startsWith('nestjs')) {
    return 'nestjs.standard';
  }
  if (normalized.startsWith('gofiber') || normalized.startsWith('go/fiber')) {
    return 'gofiber.standard';
  }
  if (normalized.startsWith('gogin') || normalized.startsWith('go/gin')) {
    return 'gogin.standard';
  }
  if (normalized.startsWith('springboot')) {
    return 'springboot.standard';
  }
  if (normalized.startsWith('dotnet')) {
    return 'dotnet.webapi.clean';
  }
  return null;
}

export function getKitBlueprint(kitId?: string | null): KitBlueprint | null {
  const resolved = resolveKitId(kitId);
  return resolved ? (KIT_BLUEPRINTS[resolved] ?? null) : null;
}

export function listAllKitBlueprints(): KitBlueprint[] {
  return Object.values(KIT_BLUEPRINTS);
}

export function resolveActiveKitId(
  ctx: AIModalContext,
  scanned?: ScannedProjectContext
): string | null {
  const fromScan = resolveKitId(scanned?.kit);
  if (fromScan) {
    return fromScan;
  }
  const fromCtx = resolveKitId(ctx.framework);
  if (fromCtx) {
    return fromCtx;
  }
  if (scanned?.hasDomainLayer && (fromCtx === 'fastapi.standard' || ctx.framework === 'fastapi')) {
    return 'fastapi.ddd';
  }
  return null;
}

export function buildKitBlueprintSection(kitId: string): string {
  const blueprint = getKitBlueprint(kitId);
  if (!blueprint) {
    return '';
  }

  const sections = [
    `ACTIVE KIT ARCHITECTURE: ${blueprint.id}`,
    blueprint.moduleSupport
      ? 'Catalog modules: supported (npx rapidkit add module free/… from project root)'
      : 'Catalog modules: not supported for this kit',
    '',
    'Project layout (what the user sees after create):',
    blueprint.layout,
    '',
    'KEY PATTERNS:',
    blueprint.patterns,
  ];

  if (blueprint.injectionPoints.length > 0) {
    sections.push('', 'INJECT ANCHORS (catalog modules and CLI hooks use these):');
    for (const point of blueprint.injectionPoints) {
      sections.push(`  • ${point}`);
    }
  }

  return sections.join('\n');
}

export function buildKitSectionForPrompt(
  ctx: AIModalContext,
  scanned?: ScannedProjectContext
): string {
  const fw = scanned?.kit ?? ctx.framework;

  if (fw === 'fastapi.ddd' || (ctx.framework === 'fastapi' && scanned?.hasDomainLayer)) {
    return buildKitBlueprintSection('fastapi.ddd');
  }

  const activeKit = resolveActiveKitId(ctx, scanned);
  if (activeKit) {
    return buildKitBlueprintSection(activeKit);
  }

  if (fw === 'fastapi.standard' || ctx.framework === 'fastapi') {
    return buildKitBlueprintSection('fastapi.standard');
  }
  if (fw === 'nestjs.standard' || ctx.framework === 'nestjs') {
    return buildKitBlueprintSection('nestjs.standard');
  }
  if (
    fw === 'go.fiber' ||
    fw === 'go.gin' ||
    fw === 'gofiber.standard' ||
    fw === 'gogin.standard' ||
    ctx.framework === 'go'
  ) {
    const kit = fw === 'gogin.standard' || fw === 'go.gin' ? 'gogin.standard' : 'gofiber.standard';
    return buildKitBlueprintSection(kit);
  }
  if (fw === 'springboot.standard' || ctx.framework === 'springboot') {
    return buildKitBlueprintSection('springboot.standard');
  }
  if (fw === 'dotnet.webapi.clean' || ctx.framework === 'dotnet') {
    return buildKitBlueprintSection('dotnet.webapi.clean');
  }

  return '';
}

export function buildPlatformTeachingIndex(
  activeKitId?: string | null,
  workspaceKitIds?: string[],
  options?: { polyglotOnly?: boolean }
): string {
  if (options?.polyglotOnly && (!workspaceKitIds || workspaceKitIds.length <= 1)) {
    return '';
  }

  const lines = [
    'KIT INDEX (compact — use when workspace has multiple runtimes or kit is unknown):',
  ];

  for (const blueprint of listAllKitBlueprints()) {
    const marker =
      blueprint.id === activeKitId
        ? ' ← ACTIVE'
        : workspaceKitIds?.includes(blueprint.id)
          ? ' ← in workspace'
          : '';
    lines.push(`  • ${blueprint.id} | modules=${blueprint.moduleSupport ? 'yes' : 'no'}${marker}`);
  }

  return lines.join('\n');
}

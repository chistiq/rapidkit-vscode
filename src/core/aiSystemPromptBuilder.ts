import { WorkspaceMemoryService } from './workspaceMemoryService';
import type { AIModalContext, ScannedProjectContext } from './aiService';
import {
  buildRapidkitCommandScopeSection,
  buildWorkspaceIntelligenceContextSection,
} from './aiContextResolver';
import { buildPersonaAdapterBlock, type AIContextContractV1 } from './aiContextContract';
import { buildArchitectureGroundingForPromptAsync } from './aiArchitectureGrounding';
import { buildKitSectionForPrompt } from './aiKitArchitectureCatalog';
import {
  buildModuleListForPrompt,
  findLiveModuleBySlug,
  type LiveModuleEntry,
} from './aiLiveModuleCatalog';

const MAX_SYSTEM_PROMPT_CHARS = 28_000;

function resolveFrameworkFamily(ctx: AIModalContext, scanned?: ScannedProjectContext): string {
  const fw = scanned?.kit ?? ctx.framework ?? '';
  if (fw.startsWith('fastapi') || fw === 'fastapi') {
    return 'fastapi';
  }
  if (fw.startsWith('nestjs') || fw === 'nestjs') {
    return 'nestjs';
  }
  if (fw.startsWith('go') || fw.startsWith('gofiber') || fw.startsWith('gogin') || fw === 'go') {
    return 'go';
  }
  if (fw.startsWith('springboot') || fw === 'springboot') {
    return 'springboot';
  }
  if (fw.startsWith('dotnet') || fw === 'dotnet') {
    return 'dotnet';
  }
  return fw;
}

// Module knowledge base (slugs -> what AI needs to know)
const MODULE_CONTEXT_HINTS: Record<string, string> = {
  'free/essentials/settings':
    'Pydantic-settings YAML config at src/modules/free/essentials/settings/settings.py. Use get_settings() via @lru_cache. NestJS: ConfigModule.forRoot with settingsConfiguration.',
  'free/essentials/logging':
    'Structured JSON logging via python-json-logger. Wraps stdlib logging. NestJS: pino-http.',
  'free/essentials/middleware':
    'CORS, rate-limiting, request-id, and security headers middleware at src/modules/free/essentials/middleware/.',
  'free/essentials/deployment':
    'Dockerfile, docker-compose.yml, and GitHub Actions CI at src/modules/free/essentials/deployment/.',
  'free/auth/core':
    'auth_core.py — PBKDF2 password hashing (sha256, 390k iterations), HMAC-SHA256 signed tokens. FastAPI deps at src/modules/free/auth/core/auth/dependencies.py. Routes at src/modules/free/auth/core/routers/auth_core.py. NestJS: AuthCoreService injected via AUTH_CORE_CONFIG token.',
  'free/auth/oauth':
    'OAuth 2.0 PKCE scaffolding. Provider registry in src/modules/free/auth/oauth/. Extend by adding provider configs.',
  'free/auth/session':
    'Signed session tokens in httpOnly cookies. Session store backed by Redis when free/cache/redis is installed.',
  'free/auth/passwordless':
    'Magic link and OTP helpers. Requires free/communication/* for delivery.',
  'free/auth/api_keys':
    'Deterministic API key issuance (slugified prefix + random suffix). HMAC verification. Audit log table.',
  'free/database/db_postgres':
    'SQLAlchemy 2.x async engine (asyncpg) + sync engine (psycopg[binary]). Session factory at src/modules/free/database/db_postgres/postgres.py. NestJS: PostgresService injected via TypeORM or raw pg pool.',
  'free/database/db_mongo':
    'Motor (async MongoDB). Repository base class at src/modules/free/database/db_mongo/.',
  'free/database/db_sqlite':
    'SQLite + aiosqlite for local dev. Same session interface as db_postgres.',
  'free/cache/redis':
    'redis-py async client. Cache helpers at src/modules/free/cache/redis/redis.py. NestJS: ioredis.',
  'free/security/cors':
    'CORS middleware configured from settings YAML. Reads allowed_origins, allow_credentials from config.',
  'free/security/security_headers':
    'Security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options) via starlette/NestJS middleware.',
  'free/observability/core':
    'Prometheus metrics at /metrics, OpenTelemetry tracing, structured health checks.\n' +
    '  FastAPI: from src.modules.free.observability.core.metrics import get_counter, get_histogram\n' +
    '    counter = get_counter("requests_total", ["method", "route"])\n' +
    '    counter.labels(method="POST", route="/api/notes").inc()\n' +
    '  Custom health endpoint: src/modules/free/observability/core/health.py → register in src/routing/__init__.py\n' +
    '  OpenTelemetry: trace spans auto-generated per request; add custom span with opentelemetry.trace.get_tracer(__name__)\n' +
    '  NestJS: PrometheusModule.register() in AppModule; inject MetricsService to increment custom counters.\n' +
    '  Go/Fiber or Go/Gin: instrument in internal/middleware and internal/handlers; expose /metrics and attach request-id label to logs.\n' +
    '  Spring Boot: use Micrometer + Actuator /actuator/prometheus and ensure custom business counters are tagged by service + route.',
  'free/users/users_core':
    'User entity (UUID PK, email, hashed_password, role). CRUD use-cases + FastAPI routes at /api/users. Integrates auth_core. NestJS: UsersModule with UsersService.',
  'free/users/users_profiles':
    'Extended user profile: avatar, bio, social links. Foreign key to users table. Separate profile router/service.',
  'free/business/storage':
    'File storage abstraction (local disk + S3/GCS/Azure blob). Key-based upload/download/delete. MIME type validation.',
  'free/billing/cart':
    'Shopping cart with item management, quantity, price calculation. Requires free/database/* and free/users/users_core.',
  'free/billing/stripe_payment':
    'Stripe Payment Intents + webhook handler + subscription lifecycle. Requires free/users/users_core. Checkout session builder.',
  'free/communication/notifications':
    'Notification system: email (SMTP + template), push (FCM), in-app websocket events. Notification preferences per user.',
  'free/tasks/celery':
    'Celery worker setup with Redis broker. Task discovery via autodiscover_tasks. Beat scheduler support.',
  'free/security/rate_limiting':
    'Production-grade rate limiting. Configurable rules per route/client. Integrates with free/cache/redis for distributed counters.',
  'free/billing/inventory':
    'Inventory and pricing service backing Cart + Stripe. Product/SKU catalog, stock tracking.',
  'free/communication/email':
    'Email delivery (SMTP + SendGrid). Template-based transactional email. Async task-friendly.',
  'free/ai/ai_assistant':
    'Provider-agnostic LLM client (OpenAI / Anthropic). Streaming responses. Prompt template registry.',
};

export async function buildWorkspaiSystemPrompt(
  ctx: AIModalContext,
  scanned?: ScannedProjectContext,
  contract?: AIContextContractV1,
  liveModules?: LiveModuleEntry[] | null
): Promise<string> {
  const identity = `You are the Workspai AI assistant — a principal workspace intelligence engineer for the Workspai/RapidKit platform. You reason from the workspace model, evidence artifacts, command contracts, and project-specific architecture before giving advice. You support polyglot software systems across frontend, backend, services, and governance workflows.`;

  const memorySectionPromise = buildMemorySection(ctx);
  const personaBlockPromise = Promise.resolve(contract ? buildPersonaAdapterBlock(contract) : '');
  const architectureGroundingPromise = buildArchitectureGroundingForPromptAsync(ctx, scanned);
  const kitSectionPromise = Promise.resolve(buildKitSectionForPrompt(ctx, scanned));
  const moduleSectionPromise = Promise.resolve(buildModuleSection(ctx, scanned, liveModules));
  const stdSectionPromise = Promise.resolve(buildStandardsSection(ctx, scanned));
  const stateSectionPromise = Promise.resolve(buildStateSection(ctx, scanned));
  const commandScopeSectionPromise = Promise.resolve(buildRapidkitCommandScopeSection(ctx));
  const workspaceIntelligenceSectionPromise = buildWorkspaceIntelligenceContextSection(ctx);

  const [
    memorySection,
    personaBlock,
    architectureGrounding,
    kitSection,
    moduleSection,
    stdSection,
    stateSection,
    commandScopeSection,
    workspaceIntelligenceSection,
  ] = await Promise.all([
    memorySectionPromise,
    personaBlockPromise,
    architectureGroundingPromise,
    kitSectionPromise,
    moduleSectionPromise,
    stdSectionPromise,
    stateSectionPromise,
    commandScopeSectionPromise,
    workspaceIntelligenceSectionPromise,
  ]);

  const instructions = `INSTRUCTIONS:
- Always generate code that fits exactly into the layer described above.
- When adding a FastAPI endpoint, put the router in the correct layer (presentation/api/routes/ for DDD, routing/ for Standard).
- When suggesting catalog module installation: npx workspai add module <slug> from the PROJECT root (not workspace root unless installing to a named subproject).
- When suggesting catalog module removal: rapidkit uninstall module <slug> from the PROJECT root.
- When adding a NestJS DOMAIN feature: mirror src/examples/ routing and DTO layout; do NOT use rapidkit add module.
- Inject points in FastAPI pyproject.toml: # <<<inject:poetry-dependencies>>>
- Inject points in NestJS AppModule: // <<<inject:module-imports>>>
- Never suggest raw HTTP exceptions inside domain or application layers — raise domain exceptions and map them in the presentation layer.
- For migrations: use "alembic revision --autogenerate && alembic upgrade head".
- Never claim fixed, shipped, production-ready, or complete without deterministic verification evidence.
- For any mutating recommendation, include the exact verify command and rollback path.
- If evidence is partial, make the uncertainty visible and choose the next safe diagnostic step.
- Obey EVIDENCE INTEGRITY RULES and ANALYZE EVIDENCE blocks — they override generic kit templates.
- Response language: match the user's query language.`;

  const prompt = [
    identity,
    clampPromptSection(architectureGrounding, 9000),
    clampPromptSection(personaBlock, 3000),
    clampPromptSection(kitSection, 9000),
    clampPromptSection(moduleSection, 8000),
    clampPromptSection(stdSection, 6000),
    clampPromptSection(stateSection, 7000),
    clampPromptSection(commandScopeSection, 2500),
    clampPromptSection(workspaceIntelligenceSection, 3500),
    clampPromptSection(memorySection, 3000),
    instructions,
  ]
    .filter(Boolean)
    .join('\n\n' + '─'.repeat(60) + '\n\n');

  return clampPromptSection(prompt, MAX_SYSTEM_PROMPT_CHARS);
}

function clampPromptSection(section: string, maxChars: number): string {
  if (!section || section.length <= maxChars) {
    return section;
  }
  return `${section.slice(0, maxChars)}\n... [truncated for context budget]`;
}

function buildModuleSection(
  ctx: AIModalContext,
  scanned?: ScannedProjectContext,
  liveModules?: LiveModuleEntry[] | null
): string {
  const fw = resolveFrameworkFamily(ctx, scanned);
  if (fw === 'go' || fw === 'springboot' || fw === 'dotnet') {
    if (fw === 'go') {
      // Distinguish Fiber vs Gin so AI gives accurate routing/middleware advice
      const kit = scanned?.kit ?? ctx.framework ?? '';
      const router = kit === 'gogin.standard' ? 'Gin' : 'Fiber v2';
      const routerPkg =
        kit === 'gogin.standard' ? 'github.com/gin-gonic/gin' : 'github.com/gofiber/fiber/v2';
      return `WORKSPAI GO KITS (${router}):
- Go kits currently do not support the RapidKit module marketplace.
- Active kit: ${kit || 'gofiber.standard (default)'}  Router: ${router} (${routerPkg})
- Add dependencies via: go get <pkg>  then register in internal/server/server.go
- Error envelope: apierr.BadRequest/NotFound/Unauthorized/InternalError(c, msg)
- Extend by adding handlers under internal/handlers/ and wiring them in server.go.
- Launcher commands: rapidkit init | rapidkit dev (hot reload via air) | rapidkit build | rapidkit test`;
    }
    if (fw === 'dotnet') {
      return `WORKSPAI .NET WEB API KIT:
- .NET Web API kit currently does not support the RapidKit module marketplace.
- Supported kits: dotnet.webapi.clean.
- Add dependencies with: dotnet add package <PackageName>
- Keep HTTP endpoints thin; orchestration belongs in Application services.
- Use typed Options and dependency injection instead of reading env vars inside domain logic.
- Launcher commands: rapidkit init | rapidkit dev | rapidkit build | rapidkit test`;
    }
    // springboot
    return `WORKSPAI SPRING BOOT KIT:
- Spring Boot kit currently does not support the RapidKit module marketplace.
- Supported kits: springboot.standard.
- Add dependencies to pom.xml and restart with: rapidkit dev
- Keep controllers thin — orchestration belongs in @Service classes.
- Use constructor injection for all beans; @ConfigurationProperties for structured config.
- Launcher commands: rapidkit init | rapidkit dev | rapidkit build | rapidkit test`;
  }

  const installed = scanned?.installedModules ?? [];
  const catalogBlock = buildModuleListForPrompt(liveModules ?? null);

  const ref = `WORKSPAI MODULE SYSTEM:
- Install command (PROJECT root):  npx workspai add module <slug>   (e.g. npx workspai add module free/cache/redis)
- Remove command (PROJECT root):   rapidkit uninstall module <slug>
- List catalog:                    rapidkit modules list --json-schema 1 (same source as dashboard Catalog tab)
- List installed:                  registry.json at project root
- Module path FastAPI: src/modules/free/{category}/{slug}/
- Module path NestJS:  src/modules/free/{category}/{slug}/{slug}.module.ts
- After install: FastAPI → registered in src/routing/; NestJS → added to rapidkitModules[] in src/modules/index.ts
- Module inject points: pyproject.toml # <<<inject:poetry-dependencies>>>; NestJS AppModule // <<<inject:module-imports>>>
- DOMAIN feature modules (teams, orders, etc.) are NOT catalog modules — scaffold under src/<feature>/ and mirror src/examples/ when present.

${catalogBlock}`;

  if (installed.length === 0 && ctx.type !== 'module') {
    return ref;
  }

  if (ctx.type === 'module' && ctx.moduleSlug) {
    const live = findLiveModuleBySlug(liveModules, ctx.moduleSlug);
    const hint = MODULE_CONTEXT_HINTS[ctx.moduleSlug] ?? '';
    const liveDescription = live?.description?.trim();
    return `${ref}

MODULE IN FOCUS: ${ctx.name} (${ctx.moduleSlug})
${ctx.moduleDescription ? `Description: ${ctx.moduleDescription}` : liveDescription ? `Description: ${liveDescription}` : ''}
${hint ? `\nDetailed knowledge:\n${hint}` : ''}`;
  }

  const moduleLines = installed.map((m) => {
    const hint = MODULE_CONTEXT_HINTS[m.slug];
    return `  • ${m.display_name} (${m.slug} v${m.version})${hint ? '\n    ' + hint : ''}`;
  });

  return `${ref}

INSTALLED IN THIS PROJECT (${installed.length} modules):
${moduleLines.join('\n')}`;
}

function buildStandardsSection(ctx: AIModalContext, scanned?: ScannedProjectContext): string {
  const fw = resolveFrameworkFamily(ctx, scanned);

  if (fw === 'fastapi') {
    return `FASTAPI / PYTHON CODING STANDARDS (exact Workspai patterns):

Domain entities:
  @dataclass(slots=True, frozen=True)
  class NoteDraft:
      title: str
      body: str

Repository protocol (interfaces.py):
  class NoteRepository(Protocol):
      def create(self, draft: NoteDraft) -> Note: ...
      def list(self) -> list[Note]: ...

Use-case (pure function, no FastAPI):
  def create_note(ctx: ServiceContext, draft: NoteDraft) -> Note:
      return ctx.note_repository.create(draft)

APIRouter route:
  @router.post("/notes", response_model=NoteResponse, status_code=201)
  async def create_note_route(payload: NotePayload, ctx = Depends(get_service_context)):
      note = create_note(ctx, NoteDraft(title=payload.title, body=payload.body))
      return NoteResponse(**note.to_dict())

DI wiring (dependencies/__init__.py):
  @lru_cache(maxsize=1)
  def get_service_context() -> ServiceContext:
      return ServiceContext(note_repository=InMemoryNoteRepository())

Pydantic v2 schema:
  class NotePayload(BaseModel):
      title: str = Field(..., max_length=80)
      body: str = Field(..., max_length=500)

Settings (pydantic-settings):
  from src.modules.free.essentials.settings.settings import get_settings
  # get_settings() → Settings (cached, YAML-backed)

Error handling: raise domain exceptions in use-cases, map to HTTPException in routes.
Migrations: alembic revision --autogenerate -m "description" && alembic upgrade head`;
  }

  if (fw === 'springboot') {
    return `SPRING BOOT / JAVA CODING STANDARDS (Workspai patterns):

Controller (HTTP boundary only):
  @RestController
  @RequestMapping("/api/system")
  class SystemInfoController {
      private final SystemInfoService service;
      SystemInfoController(SystemInfoService service) { this.service = service; }

      @GetMapping("/info")
      SystemInfoResponse info() { return service.getInfo(); }
  }

Service layer (business logic):
  @Service
  class SystemInfoService {
      SystemInfoResponse getInfo() { ... }
  }

Error mapping:
  @RestControllerAdvice
  class ApiExceptionHandler {
      @ExceptionHandler(DomainException.class)
      ResponseEntity<ApiError> onDomain(DomainException ex) { ... }
  }

Config & validation:
  • Prefer @ConfigurationProperties for structured settings
  • Use jakarta.validation annotations for request DTOs
  • Keep package structure by domain (api/service/config/system)
  • Keep build/run commands via rapidkit wrapper (rapidkit init/dev/test/build)`;
  }

  if (fw === 'nestjs') {
    const hasPg = scanned?.installedModules.some((m) => m.slug.includes('db_postgres'));
    return `NESTJS / TYPESCRIPT CODING STANDARDS (exact Workspai patterns):

Module structure:
  @Module({ imports: [...], controllers: [AuthController], providers: [AuthService] })
  export class AuthModule {}

Service:
  @Injectable()
  export class AuthService {
    constructor(@Inject(AUTH_CORE_CONFIG) private readonly config: AuthCoreConfig) {}
  }

Controller (mirror src/examples/ — no /api prefix unless setGlobalPrefix is configured):
  @Controller('examples/notes')   // reference pattern — use '<feature>/<resource>' for new modules
  export class ExamplesController {
    constructor(private readonly examplesService: ExamplesService) {}
    @Post()
    create(@Body() payload: CreateNoteDto) { ... }
  }

DTO (class-validator, separate file under dto/):
  export class CreateNoteDto {
    @IsString() @MaxLength(80) title!: string;
  }

Config (settingsConfiguration):
  export const settingsConfiguration = () => ({ port: parseInt(process.env.PORT ?? '8000', 10) });
  // Validated by Joi schema in config/validation.ts

${hasPg ? 'PostgreSQL (TypeORM): use @Entity() for ORM models, inject DataSource for raw queries.' : ''}
Error handling: throw NestJS HttpException in controllers; services throw domain errors.
Testing: Jest, @nestjs/testing TestingModule, supertest for e2e.`;
  }

  if (fw === 'dotnet') {
    return `.NET / C# CODING STANDARDS (Workspai patterns):

Endpoint boundary:
  app.MapGet("/api/system/info", (ISystemInfoService service) => Results.Ok(service.GetInfo()));

Application service:
  public sealed class SystemInfoService : ISystemInfoService
  {
      public SystemInfoResponse GetInfo() { ... }
  }

Configuration:
  builder.Services.Configure<AppOptions>(builder.Configuration.GetSection("App"));
  builder.Services.AddScoped<ISystemInfoService, SystemInfoService>();

Error handling:
  • Map domain/application exceptions at the API boundary
  • Return typed ProblemDetails for HTTP errors
  • Keep Domain project free of ASP.NET Core references

Testing:
  • Use xUnit/NUnit for unit tests
  • Use WebApplicationFactory for API integration tests
  • Verify with npx workspai test and npx workspai doctor project before claiming completion`;
  }

  if (fw === 'go') {
    return `GO CODING STANDARDS (exact Workspai patterns):

Handler:
  func (h *NoteHandler) Create(c *fiber.Ctx) error {
      var req CreateNoteRequest
      if err := c.BodyParser(&req); err != nil { return fiber.ErrBadRequest }
      note, err := h.svc.Create(c.Context(), req)
      if err != nil { return err }
      return c.Status(201).JSON(note)
  }

Service interface:
  type NoteService interface {
      Create(ctx context.Context, req CreateNoteRequest) (Note, error)
      List(ctx context.Context) ([]Note, error)
  }

Config:
  func Load() Config {
      return Config{ Port: getEnv("PORT", "8000"), DBUrl: getEnv("DATABASE_URL", "") }
  }

Error wrapping: fmt.Errorf("create note: %w", err)
Logging: slog.InfoContext(ctx, "note created", "id", note.ID)
Testing: table-driven, testify/assert, mock interfaces with testify/mock.`;
  }

  return '';
}

function buildStateSection(ctx: AIModalContext, scanned?: ScannedProjectContext): string {
  if (!scanned || !ctx.path) {
    return '';
  }

  const scopeLabel = ctx.type === 'workspace' ? 'WORKSPACE' : 'PROJECT';
  const parts: string[] = [`CURRENT ${scopeLabel} STATE: ${scanned.projectName}`];
  parts.push(`  Root:        ${scanned.projectRoot}`);
  parts.push(`  Kit:         ${scanned.kit}`);
  if (scanned.runtime) {
    parts.push(`  Runtime:     ${scanned.runtime}`);
  }
  if (scanned.engine) {
    parts.push(`  Engine:      ${scanned.engine}`);
  }
  if (scanned.pythonVersion) {
    parts.push(`  Python:      ${scanned.pythonVersion}`);
    parts.push(`  python_version: ${scanned.pythonVersion}`);
  }
  if (scanned.runtimeVersion && scanned.runtime !== 'python') {
    const label =
      scanned.runtime === 'java'
        ? 'Java'
        : scanned.runtime === 'go'
          ? 'Go'
          : scanned.runtime === 'dotnet'
            ? '.NET'
            : 'Runtime';
    parts.push(`  ${label} version: ${scanned.runtimeVersion}`);
    parts.push(`  runtime_version: ${scanned.runtimeVersion}`);
  }
  if (scanned.rapidkitCliVersion) {
    parts.push(`  Workspai CLI: ${scanned.rapidkitCliVersion}`);
    parts.push(`  rapidkit_cli_version: ${scanned.rapidkitCliVersion}`);
  }
  if (scanned.rapidkitCoreVersion) {
    parts.push(`  RapidKit Core: ${scanned.rapidkitCoreVersion}`);
    parts.push(`  rapidkit_core_version: ${scanned.rapidkitCoreVersion}`);
  }
  if (scanned.detectionConfidence !== 'none') {
    parts.push(`  Detection:   ${scanned.detectionConfidence}`);
  }
  if (scanned.workspaceHealth) {
    const health = scanned.workspaceHealth;
    parts.push(
      `  Workspace health: ${health.passed}/${health.total} passed (${health.warnings} warn, ${health.errors} error)`
    );
    parts.push(
      `  workspace_health: ${JSON.stringify({
        total: health.total,
        passed: health.passed,
        warnings: health.warnings,
        errors: health.errors,
        generated_at: health.generatedAt,
      })}`
    );
  }
  parts.push(`  Modules:     ${scanned.installedModules.length} installed`);
  if (scanned.hasAlembic) {
    parts.push('  Migrations:  Alembic (alembic/)');
  }
  if (scanned.hasDocker) {
    parts.push('  Docker:      Dockerfile + docker-compose.yml present');
  }
  if (scanned.hasHealthDir) {
    parts.push('  Health dir:  src/health/ (module health endpoints registered)');
  }
  if (scanned.envFile) {
    parts.push(`  Env file:    ${scanned.envFile}`);
  }
  if (scanned.configFiles.length > 0) {
    parts.push(`  Config YAMLs: ${scanned.configFiles.join(', ')}`);
  }
  if (scanned.productionDeps.length > 0) {
    const fw = resolveFrameworkFamily(ctx, scanned);
    const notableByFramework: Record<string, string[]> = {
      fastapi: ['sqlalchemy', 'asyncpg', 'redis', 'boto3', 'stripe', 'celery', 'alembic'],
      nestjs: ['typeorm', 'prisma', 'redis', 'stripe', '@nestjs/jwt', 'ioredis'],
      go: [],
      springboot: [
        'spring-boot-starter-data-jpa',
        'spring-boot-starter-security',
        'spring-boot-starter-data-redis',
        'spring-kafka',
        'postgresql',
        'mysql-connector-j',
        'liquibase-core',
        'flyway-core',
        'stripe-java',
        'aws-java-sdk-s3',
        'spring-boot-starter-oauth2-resource-server',
      ],
    };
    const watchList = notableByFramework[fw] ?? notableByFramework.fastapi;
    const notable = scanned.productionDeps
      .filter((d) => watchList.some((w) => d.includes(w)))
      .slice(0, 8);
    if (notable.length > 0) {
      parts.push(`  Notable deps: ${notable.join(', ')}`);
    }
  }

  if (scanned.dirTree) {
    parts.push(
      `\n  Directory layout:\n${scanned.dirTree
        .split('\n')
        .map((l) => '  ' + l)
        .join('\n')}`
    );
  }

  for (const file of scanned.relevantFiles) {
    parts.push(
      `\n  [${file.relPath}]\n${file.content
        .split('\n')
        .slice(0, 25)
        .map((l) => '  ' + l)
        .join('\n')}`
    );
  }

  if (scanned.gitDiff) {
    parts.push(
      `\n  Recent uncommitted changes (git diff --stat HEAD):\n${scanned.gitDiff
        .split('\n')
        .map((l) => '  ' + l)
        .join('\n')}`
    );
  }

  return parts.join('\n');
}

async function buildMemorySection(ctx: AIModalContext): Promise<string> {
  if (!ctx.path) {
    return '';
  }
  try {
    const memSvc = WorkspaceMemoryService.getInstance();
    const memory = await memSvc.readNearest(ctx.path);
    const formatted = memSvc.formatForPrompt(memory);
    if (!formatted) {
      return '';
    }
    return `WORKSPACE MEMORY (team-defined conventions and decisions — follow these exactly):\n${formatted}`;
  } catch {
    return '';
  }
}

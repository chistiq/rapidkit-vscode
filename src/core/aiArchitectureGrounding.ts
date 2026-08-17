import * as fs from 'fs';
import * as path from 'path';
import type { AIModalContext, ScannedProjectContext } from './aiService';
import { buildKitBlueprintSection, resolveActiveKitId } from './aiKitArchitectureCatalog';
import {
  buildCatalogModuleArchitectureContract,
  buildWorkspaiPlatformContract,
  isModuleCapableKit,
} from './aiCoreModuleCatalog';
import { buildWorkspaceArchitectureAtlasPromptBlock } from './aiWorkspaceArchitectureAtlas';
import {
  getWorkspaceIntelligenceEvidencePrinciples,
  getWorkspaceIntelligencePositioning,
} from './workspaceIntelligenceArchitectureContract';

export type AnalyzeProjectEvidenceSlice = {
  name: string;
  path: string;
  relativePath?: string;
  runtime: string;
  framework: string;
  confidence?: string;
  hasRapidKitMarker: boolean;
  hasTests: boolean;
  hasDockerfile: boolean;
  hasHealthEndpoint: boolean;
  hasCiConfig: boolean;
  score?: number;
  findingCount: number;
};

export type AnalyzeEvidenceSlice = {
  generatedAt: string;
  workspacePath: string;
  verdict: string;
  score: number;
  projectCount: number;
  projects: AnalyzeProjectEvidenceSlice[];
  workspaceFindings: Array<{ severity: string; target: string; title: string }>;
};

const ANALYZE_REPORT_REL = path.join('.workspai', 'reports', 'analyze-last-run.json');
const LEGACY_ANALYZE_REPORT_REL = path.join('.rapidkit', 'reports', 'analyze-last-run.json');

export function resolveWorkspacePathForGrounding(ctx: AIModalContext): string | undefined {
  if (ctx.type === 'workspace' && ctx.path?.trim()) {
    return path.resolve(ctx.path.trim());
  }
  if (ctx.workspaceRootPath?.trim()) {
    return path.resolve(ctx.workspaceRootPath.trim());
  }
  if (ctx.type === 'project' && ctx.path?.trim()) {
    const projectPath = path.resolve(ctx.path.trim());
    const parent = path.dirname(projectPath);
    if (
      fs.existsSync(path.join(parent, '.workspai-workspace')) ||
      fs.existsSync(path.join(parent, '.rapidkit-workspace'))
    ) {
      return parent;
    }
    if (
      fs.existsSync(path.join(projectPath, '.workspai-workspace')) ||
      fs.existsSync(path.join(projectPath, '.rapidkit-workspace'))
    ) {
      return projectPath;
    }
  }
  return undefined;
}

export function loadAnalyzeEvidenceSlice(workspacePath?: string): AnalyzeEvidenceSlice | null {
  if (!workspacePath?.trim()) {
    return null;
  }

  const workspaceRoot = path.resolve(workspacePath);
  const canonicalReportPath = path.join(workspaceRoot, ANALYZE_REPORT_REL);
  const reportPath = fs.existsSync(canonicalReportPath)
    ? canonicalReportPath
    : path.join(workspaceRoot, LEGACY_ANALYZE_REPORT_REL);
  if (!fs.existsSync(reportPath)) {
    return null;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as Record<string, unknown>;
    const summary = (raw.summary ?? {}) as Record<string, unknown>;
    const projectsRaw = Array.isArray(raw.projects) ? raw.projects : [];
    const findingsRaw = Array.isArray(raw.findings) ? raw.findings : [];

    const projects: AnalyzeProjectEvidenceSlice[] = projectsRaw
      .map((entry) => {
        const project = entry as Record<string, unknown>;
        const projectFindings = Array.isArray(project.findings) ? project.findings : [];
        return {
          name: String(project.name ?? 'unknown'),
          path: String(project.path ?? ''),
          relativePath: typeof project.relativePath === 'string' ? project.relativePath : undefined,
          runtime: String(project.runtime ?? 'unknown'),
          framework: String(project.framework ?? project.runtime ?? 'unknown'),
          confidence: typeof project.confidence === 'string' ? project.confidence : undefined,
          hasRapidKitMarker: project.hasRapidKitMarker === true,
          hasTests: project.hasTests === true,
          hasDockerfile: project.hasDockerfile === true,
          hasHealthEndpoint: project.hasHealthEndpoint === true,
          hasCiConfig: project.hasCiConfig === true,
          score: typeof project.score === 'number' ? project.score : undefined,
          findingCount: projectFindings.length,
        };
      })
      .slice(0, 12);

    return {
      generatedAt: String(raw.generatedAt ?? ''),
      workspacePath: String(raw.workspacePath ?? workspacePath),
      verdict: String(summary.verdict ?? 'unknown'),
      score: typeof summary.score === 'number' ? summary.score : 0,
      projectCount:
        typeof summary.projectCount === 'number' ? summary.projectCount : projects.length,
      projects,
      workspaceFindings: findingsRaw.slice(0, 6).map((entry) => {
        const finding = entry as Record<string, unknown>;
        return {
          severity: String(finding.severity ?? 'info'),
          target: String(finding.target ?? ''),
          title: String(finding.title ?? ''),
        };
      }),
    };
  } catch {
    return null;
  }
}

function resolveActiveProjectEvidence(
  ctx: AIModalContext,
  scanned: ScannedProjectContext | undefined,
  analyze: AnalyzeEvidenceSlice | null
): AnalyzeProjectEvidenceSlice | null {
  const projectPath = ctx.projectRootPath ?? (ctx.type === 'project' ? ctx.path : undefined);
  if (!projectPath?.trim()) {
    return null;
  }
  const normalized = path.resolve(projectPath.trim());
  const fromAnalyze =
    analyze?.projects.find((project) => path.resolve(project.path) === normalized) ?? null;
  if (fromAnalyze) {
    return fromAnalyze;
  }
  if (scanned?.projectRoot && path.resolve(scanned.projectRoot) === normalized) {
    return {
      name: scanned.projectName,
      path: scanned.projectRoot,
      runtime: scanned.runtime ?? 'unknown',
      framework: scanned.kit !== 'unknown' ? scanned.kit : (ctx.framework ?? 'unknown'),
      hasRapidKitMarker: scanned.detectionConfidence === 'strong',
      hasTests: false,
      hasDockerfile: scanned.hasDocker,
      hasHealthEndpoint: scanned.hasHealthDir,
      hasCiConfig: false,
      findingCount: 0,
    };
  }
  return null;
}

function extractNestJsRoutingFacts(scanned?: ScannedProjectContext): string[] {
  const lines: string[] = [];
  const examplesController = scanned?.relevantFiles.find((file) =>
    file.relPath.endsWith('examples/examples.controller.ts')
  );
  const mainTs = scanned?.relevantFiles.find((file) => file.relPath.endsWith('main.ts'));
  const appModule = scanned?.relevantFiles.find((file) => file.relPath.endsWith('app.module.ts'));

  if (mainTs?.content && !/setGlobalPrefix\s*\(/i.test(mainTs.content)) {
    lines.push(
      '- No app.setGlobalPrefix() in main.ts — routes are NOT prefixed with /api by default.'
    );
  }
  if (examplesController?.content) {
    const routeMatch = examplesController.content.match(/@Controller\(\s*['"`]([^'"`]+)['"`]/);
    if (routeMatch?.[1]) {
      lines.push(
        `- Reference feature route pattern (examples): @Controller('${routeMatch[1]}') — mirror this style for new domain modules.`
      );
    }
    if (/@Body\(\)\s+\w+:\s*Create\w+Dto/.test(examplesController.content)) {
      lines.push(
        '- DTO pattern: import CreateXDto from ./dto/ — do NOT duplicate inline DTO classes in controllers.'
      );
    }
  }
  if (appModule?.content) {
    if (appModule.content.includes('<<<inject:module-imports>>>')) {
      lines.push('- AppModule inject marker: // <<<inject:module-imports>>>');
    }
    if (/ExamplesModule[\s\S]*\.\.\.rapidkitModules/.test(appModule.content)) {
      lines.push(
        '- Domain modules register in AppModule imports BEFORE ...rapidkitModules (see ExamplesModule placement).'
      );
    }
  }
  if (scanned?.topLevelSrcDirs.includes('examples')) {
    lines.push('- Example domain module path: src/examples/ (module, service, controller, dto/).');
  }
  return lines;
}

function buildAnalyzeEvidenceBlock(
  ctx: AIModalContext,
  analyze: AnalyzeEvidenceSlice | null,
  activeProject: AnalyzeProjectEvidenceSlice | null
): string {
  if (!analyze) {
    return [
      'ANALYZE EVIDENCE:',
      '- No analyze-last-run.json loaded. Do not assume kit, runtime, Dockerfile, or health endpoints exist.',
      '- Prefer scanProjectContext facts and on-disk files over generic kit templates.',
    ].join('\n');
  }

  const lines: string[] = [
    'ANALYZE EVIDENCE (authoritative — do not contradict):',
    `- Generated: ${analyze.generatedAt || 'unknown'}`,
    '- Workspace: $WORKSPACE (runtime-private)',
    `- Verdict/score: ${analyze.verdict} / ${analyze.score}`,
    `- Registered projects: ${analyze.projectCount}`,
  ];

  if (analyze.projects.length > 0) {
    lines.push('- Projects (from analyze):');
    for (const project of analyze.projects) {
      const flags = [
        project.hasRapidKitMarker ? 'rapidkit-marker' : 'no-marker',
        project.hasDockerfile ? 'dockerfile' : 'no-dockerfile',
        project.hasHealthEndpoint ? 'health' : 'no-health',
        project.hasTests ? 'tests' : 'no-tests',
      ].join(', ');
      lines.push(
        `    • ${project.name} | framework=${project.framework} runtime=${project.runtime} | ${flags} | identity=project:${project.name}`
      );
    }
  }

  if (activeProject) {
    lines.push(`- ACTIVE PROJECT (selected): ${activeProject.name} (${activeProject.framework})`);
    if (
      activeProject.framework === 'python' &&
      !activeProject.framework.includes('fastapi') &&
      activeProject.hasRapidKitMarker === false &&
      !activeProject.hasDockerfile
    ) {
      lines.push(
        '- GUARD: This is NOT a scaffolded FastAPI/NestJS app yet. Do NOT recommend uvicorn/Docker/K8s deploy until `workspai create project` or import produces an application.'
      );
    }
  }

  if (ctx.type === 'workspace' && analyze.projects.length === 1) {
    const only = analyze.projects[0];
    if (
      only &&
      !only.hasRapidKitMarker &&
      !only.hasDockerfile &&
      !only.hasHealthEndpoint &&
      (only.framework === 'python' || only.runtime === 'python')
    ) {
      lines.push(
        '- GUARD: Workspace is minimal (workspace shell without deployable service). Recommend `workspai create project` before deployment/Docker/K8s guidance.'
      );
    }
  }

  if (analyze.workspaceFindings.length > 0) {
    lines.push('- Top workspace findings:');
    for (const finding of analyze.workspaceFindings.slice(0, 4)) {
      lines.push(`    • [${finding.severity}] ${finding.target}: ${finding.title}`);
    }
  }

  return lines.join('\n');
}

function buildIntentDisambiguationBlock(): string {
  return [
    'WORKSPAI INTENT ROUTING (mandatory — pick exactly one path per question):',
    '',
    '1) DOMAIN FEATURE MODULE (NestJS/FastAPI app code the team owns)',
    '   Triggers: "create feature", "new endpoint", "teams module", "NestJS conventions", "add controller".',
    '   Action: Scaffold under src/<feature>/ (NestJS) or kit layer paths (FastAPI). Mirror src/examples/ when present.',
    '   Do NOT use: workspai add module',
    '',
    '2) RAPIDKIT CATALOG MODULE (platform module from marketplace)',
    '   Triggers: "Workspai module", "RapidKit module", "install module", "add redis/settings/auth from catalog".',
    '   Action (project root): npx workspai add module <slug>   e.g. npx workspai add module free/cache/redis',
    '   Remove (project root): workspai uninstall module <slug>',
    '   Updates: registry.json, src/modules/free/..., src/modules/index.ts (rapidkitModules).',
    '',
    '3) DEPLOY / DEVOPS (containers, CI, K8s)',
    '   Triggers: deployment strategy, Docker, Kubernetes, CI/CD, multi-project workspace ops.',
    '   Preconditions: analyze evidence must show hasDockerfile or a registered kit app — otherwise say "create/import project first".',
    '   Scope: workspace-root commands for workspace ops; project-root for Dockerfile/CI tied to one service.',
  ].join('\n');
}

function buildEvidenceIntegrityBlock(
  ctx: AIModalContext,
  scanned?: ScannedProjectContext,
  activeProject?: AnalyzeProjectEvidenceSlice | null
): string {
  const kit = scanned?.kit ?? ctx.framework ?? 'unknown';
  const detection = scanned?.detectionConfidence ?? 'none';

  return [
    'EVIDENCE INTEGRITY RULES (non-negotiable):',
    `- Declared kit for this turn: ${kit} (detection confidence: ${detection}).`,
    '- Never invent kit/runtime (e.g. fastapi.standard) when analyze or scan says framework=python or kit=unknown.',
    '- Never invent /api route prefix unless setGlobalPrefix or existing controllers use it.',
    '- Never recommend Dockerfile/uvicorn/K8s smoke tests when analyze shows hasDockerfile=false and no src/main.py or src/main.ts.',
    '- Catalog install ≠ domain feature scaffold — never mix the two in one answer.',
    '- Commands must state execution directory: workspace root vs selected project root.',
    `- Selected scope: ${ctx.type}${ctx.projectRootPath ? ' | project=$PROJECT' : ''}${ctx.workspaceRootPath ? ' | workspace=$WORKSPACE' : ''}.`,
    activeProject?.hasRapidKitMarker === false
      ? '- Active project lacks RapidKit marker — prefer import/create flow before module install or dev commands.'
      : '',
    '- If evidence is partial, list Assumptions explicitly instead of guessing paths or ports.',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildNestJsGroundingBlock(scanned?: ScannedProjectContext): string {
  if (!scanned?.kit.startsWith('nestjs')) {
    return '';
  }

  const routingFacts = extractNestJsRoutingFacts(scanned);
  const lines = [
    'NESTJS PROJECT GROUNDING (from scanned files):',
    ...routingFacts,
    '- Feature module files: <feature>.module.ts, <feature>.service.ts, <feature>.controller.ts, dto/create-<feature>.dto.ts',
    '- Default dev/start: npx workspai dev or npx workspai start from project root (after init + node_modules).',
    '- Default port: parseInt(process.env.PORT ?? "8000") in main.ts unless settings say otherwise.',
  ];

  return lines.join('\n');
}

function buildFastApiGroundingBlock(scanned?: ScannedProjectContext): string {
  if (!scanned?.kit.startsWith('fastapi')) {
    return '';
  }

  const hasMain = scanned.relevantFiles.some((file) => file.relPath.endsWith('src/main.py'));
  if (!hasMain) {
    return [
      'FASTAPI PROJECT GROUNDING:',
      '- src/main.py not found on disk — do NOT recommend uvicorn/create_app until project is scaffolded.',
    ].join('\n');
  }

  return [
    'FASTAPI PROJECT GROUNDING:',
    '- Entry: src/main.py create_app() factory; routers via src/routing/',
    '- Standard kit mounts api_router with prefix="/api" in src/main.py — module routes live under /api',
    '- DDD kit: domain logic in src/app/ layers; presentation routes under /api',
    '- Module path: src/modules/free/{category}/{name}/',
  ].join('\n');
}

export function buildArchitectureGroundingSection(
  ctx: AIModalContext,
  scanned?: ScannedProjectContext,
  analyze?: AnalyzeEvidenceSlice | null
): string {
  const activeProject = resolveActiveProjectEvidence(ctx, scanned, analyze ?? null);
  const positioning = getWorkspaceIntelligencePositioning();
  const primaryEvidencePrinciple = getWorkspaceIntelligenceEvidencePrinciples()[0];

  const sections = [
    [
      `WORKSPACE INTELLIGENCE CONTRACT: ${positioning.primaryPromise}`,
      primaryEvidencePrinciple ? `- ${primaryEvidencePrinciple}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    buildEvidenceIntegrityBlock(ctx, scanned, activeProject ?? undefined),
    buildIntentDisambiguationBlock(),
    buildAnalyzeEvidenceBlock(ctx, analyze ?? null, activeProject),
    buildNestJsGroundingBlock(scanned),
    buildFastApiGroundingBlock(scanned),
  ].filter(Boolean);

  return sections.join('\n\n');
}

export function buildArchitectureGroundingForPrompt(
  ctx: AIModalContext,
  scanned?: ScannedProjectContext
): string {
  const workspacePath = resolveWorkspacePathForGrounding(ctx);
  const analyze = loadAnalyzeEvidenceSlice(workspacePath);
  return buildArchitectureGroundingSection(ctx, scanned, analyze);
}

function buildActiveKitBlueprintBlock(
  ctx: AIModalContext,
  scanned?: ScannedProjectContext
): string {
  const activeKit = resolveActiveKitId(ctx, scanned);
  if (!activeKit) {
    return '';
  }
  if (scanned?.hasDomainLayer && activeKit === 'fastapi.standard') {
    return buildKitBlueprintSection('fastapi.ddd');
  }
  return buildKitBlueprintSection(activeKit);
}

export async function buildArchitectureGroundingForPromptAsync(
  ctx: AIModalContext,
  scanned?: ScannedProjectContext
): Promise<string> {
  const workspacePath = resolveWorkspacePathForGrounding(ctx);
  const analyze = loadAnalyzeEvidenceSlice(workspacePath);
  const base = buildArchitectureGroundingSection(ctx, scanned, analyze);
  const activeKit = resolveActiveKitId(ctx, scanned);

  const sections = [base, buildWorkspaiPlatformContract()];

  if (isModuleCapableKit(activeKit)) {
    sections.push(
      buildCatalogModuleArchitectureContract(
        activeKit,
        scanned?.installedModules.map((mod) => mod.slug)
      )
    );
    sections.push(buildActiveKitBlueprintBlock(ctx, scanned));
  } else if (activeKit) {
    sections.push(buildActiveKitBlueprintBlock(ctx, scanned));
  }

  const atlasBlock = await buildWorkspaceArchitectureAtlasPromptBlock(
    ctx,
    scanned,
    analyze,
    workspacePath
  );
  sections.push(atlasBlock);

  return sections.filter(Boolean).join('\n\n');
}

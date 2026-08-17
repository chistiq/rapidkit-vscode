import path from 'node:path';
import fs from 'fs-extra';

import { buildArchitectureGroundingForPromptAsync } from '../../core/aiArchitectureGrounding';
import { buildModuleListForPrompt, getWorkspaceAwareLiveModules } from '../../core/aiService';
import type { AIModalContext } from '../../core/aiService';
import { buildIncidentStudioEvidencePrompt } from '../../core/incidentStudioEvidenceContext';
import { buildIncidentFirstResponseRules } from './incidentStudioPromptPolicy';
import { loadAnalyzeReport } from './incidentStudioAnalyze';
import type { DoctorEvidenceSnapshot } from './incidentStudioDoctorEvidence';
import { buildWorkspaceArchitectureBlock } from './welcomePanelStructuredPromptBlocks';

export type StructuredIncidentPromptOptions = {
  workspacePath?: string;
  projectPath?: string;
  projectName?: string;
  projectType?: string;
  scopeIntent?: 'workspace' | 'project';
};

export type StructuredIncidentPromptHost = {
  resolveFallbackWorkspacePath?: () => string | undefined;
  readDoctorEvidenceSnapshot: (
    workspacePath?: string,
    options?: { projectPath?: string }
  ) => Promise<DoctorEvidenceSnapshot | undefined>;
  buildWorkspaceProjectCandidatesBlock: (
    workspacePath: string,
    doctorSnapshot?: DoctorEvidenceSnapshot
  ) => Promise<string | undefined>;
  resolveScopedProjectForWorkspace: (options: {
    workspacePath?: string;
    projectPath?: string;
    projectName?: string;
    projectType?: string;
    doctorSnapshot?: DoctorEvidenceSnapshot;
  }) => Promise<{ name: string; path: string; type?: string } | null>;
  inferFrameworkFromWorkspace: (workspacePath: string) => Promise<string>;
};

export function buildStructuredPromptAIModalContext(input: {
  workspacePath?: string;
  projectPath?: string;
  projectName?: string;
  projectType?: string;
  scopeIntent?: 'workspace' | 'project';
}): AIModalContext {
  const explicitProjectPath = input.projectPath?.trim();
  const isProjectScope = Boolean(explicitProjectPath) || input.scopeIntent === 'project';

  if (isProjectScope && explicitProjectPath) {
    return {
      type: 'project',
      name: input.projectName?.trim() || path.basename(explicitProjectPath),
      path: explicitProjectPath,
      framework: input.projectType,
      projectRootPath: explicitProjectPath,
      workspaceRootPath: input.workspacePath?.trim() || undefined,
    };
  }

  const workspacePath = input.workspacePath?.trim();
  return {
    type: 'workspace',
    name: workspacePath ? path.basename(workspacePath) : 'Workspace',
    path: workspacePath,
    workspaceRootPath: workspacePath,
  };
}

export async function buildProjectExecutionBlock(
  options: {
    workspacePath?: string;
    projectPath?: string;
    projectName?: string;
    projectType?: string;
  },
  inferFrameworkFromWorkspace: (workspacePath: string) => Promise<string>
): Promise<string | undefined> {
  if (!options.projectPath) {
    return undefined;
  }

  const projectPath = options.projectPath;
  const framework = options.projectType || (await inferFrameworkFromWorkspace(projectPath));
  const lines: string[] = ['PROJECT EXECUTION STATE:'];

  lines.push(`- Selected project: ${options.projectName || path.basename(projectPath)}`);
  lines.push('- Project path: $PROJECT');
  lines.push(`- Framework: ${framework || 'unknown'}`);

  if (framework === 'springboot') {
    const hasPom = await fs.pathExists(path.join(projectPath, 'pom.xml'));
    const hasGradle =
      (await fs.pathExists(path.join(projectPath, 'build.gradle'))) ||
      (await fs.pathExists(path.join(projectPath, 'build.gradle.kts')));
    const hasMavenWrapper =
      (await fs.pathExists(path.join(projectPath, 'mvnw'))) ||
      (await fs.pathExists(path.join(projectPath, 'mvnw.cmd')));
    const hasGradleWrapper =
      (await fs.pathExists(path.join(projectPath, 'gradlew'))) ||
      (await fs.pathExists(path.join(projectPath, 'gradlew.bat')));

    lines.push(
      `- Build files: ${hasPom ? 'pom.xml ' : ''}${hasGradle ? 'gradle ' : ''}`.trim() ||
        '- Build files: none detected'
    );
    lines.push(
      `- Wrappers present: maven=${hasMavenWrapper ? 'yes' : 'no'}, gradle=${hasGradleWrapper ? 'yes' : 'no'}`
    );

    if (!hasMavenWrapper && !hasGradleWrapper) {
      lines.push(
        '- Launch blocker: no Maven Wrapper or Gradle Wrapper is present. `rapidkit dev` will require system Maven or Gradle.'
      );
      lines.push(
        '- If `rapidkit init` is quiet, treat it as a warm-up step and explicitly re-check wrappers/build-tool readiness before recommending `rapidkit dev`.'
      );
      lines.push(
        '- The next step is usually to install Maven 3.9+ or Gradle 8+, or generate and commit the wrapper in the selected project root.'
      );
    } else {
      lines.push(
        '- Expected launch flow: rapidkit init -> rapidkit dev -> verify startup logs or the service health endpoint.'
      );
    }
  }

  if (framework === 'fastapi') {
    const hasVenv = await fs.pathExists(path.join(projectPath, '.venv'));
    lines.push(`- Python environment present: ${hasVenv ? 'yes' : 'no'}`);
    if (!hasVenv) {
      lines.push(
        '- Launch blocker: no project virtual environment detected yet. Prioritize `rapidkit init` before `rapidkit dev`.'
      );
    }
  }

  if (framework === 'nestjs') {
    const hasNodeModules = await fs.pathExists(path.join(projectPath, 'node_modules'));
    lines.push(`- node_modules present: ${hasNodeModules ? 'yes' : 'no'}`);
    if (!hasNodeModules) {
      lines.push(
        '- Launch blocker: dependencies not installed yet. Prioritize `rapidkit init` or package-manager install before `rapidkit dev`.'
      );
    }
  }

  if (framework === 'go') {
    const hasGoMod = await fs.pathExists(path.join(projectPath, 'go.mod'));
    const hasGoSum = await fs.pathExists(path.join(projectPath, 'go.sum'));
    lines.push(`- go.mod present: ${hasGoMod ? 'yes' : 'no'}`);
    lines.push(`- go.sum present: ${hasGoSum ? 'yes' : 'no'}`);
    if (hasGoMod && !hasGoSum) {
      lines.push(
        '- Launch blocker: dependencies likely not downloaded yet. Prioritize `rapidkit init` or `go mod tidy` before `rapidkit dev`.'
      );
    }
  }

  lines.push(
    '- Optimize for the path to a running service: install deps -> init -> dev -> verify.'
  );
  lines.push('- `Verify command` must be an actual shell command or file check, never prose.');

  return lines.join('\n');
}

export async function buildStructuredIncidentPrompt(
  host: StructuredIncidentPromptHost,
  message: string,
  options?: StructuredIncidentPromptOptions
): Promise<string> {
  const resolvedWorkspacePath = options?.workspacePath || host.resolveFallbackWorkspacePath?.();
  const doctorSnapshot = await host.readDoctorEvidenceSnapshot(resolvedWorkspacePath, {
    projectPath: options?.projectPath,
  });
  const workspaceName = resolvedWorkspacePath ? path.basename(resolvedWorkspacePath) : 'workspace';
  const analyzeLoaded = resolvedWorkspacePath
    ? loadAnalyzeReport({ workspacePath: resolvedWorkspacePath, workspaceName })
    : { report: null };
  const intelligenceEvidenceBlock = resolvedWorkspacePath
    ? await buildIncidentStudioEvidencePrompt({
        workspacePath: resolvedWorkspacePath,
        workspaceName,
        projectPath: options?.projectPath,
        projectName: options?.projectName,
        projectFramework: options?.projectType,
        analyzeReport: analyzeLoaded.report,
        doctorSnapshot,
      })
    : '';
  const architectureGrounding = await buildArchitectureGroundingForPromptAsync(
    buildStructuredPromptAIModalContext({
      workspacePath: resolvedWorkspacePath,
      projectPath: options?.projectPath,
      projectName: options?.projectName,
      projectType: options?.projectType,
      scopeIntent: options?.scopeIntent,
    }),
    undefined
  );
  const liveModules = await getWorkspaceAwareLiveModules(resolvedWorkspacePath);
  const liveCatalogBlock =
    liveModules && liveModules.length > 0
      ? `LIVE MODULE CATALOG:\n${buildModuleListForPrompt(liveModules)}`
      : '';

  // Explicit project path or scopeIntent='project' → project-level analysis.
  // No project path and scopeIntent='workspace' (or omitted) → workspace-level analysis.
  // We do NOT auto-detect a project when the user is in workspace scope; doing so silently
  // collapses multi-project workspace reasoning into single-service focus.
  const explicitProjectPath = options?.projectPath?.trim() || undefined;
  const isProjectScope = Boolean(explicitProjectPath) || options?.scopeIntent === 'project';

  if (!isProjectScope) {
    // ── WORKSPACE-LEVEL ANALYSIS ────────────────────────────────────────────
    // Reason across ALL workspace projects: topology, shared health, cross-project risks,
    // workspace memory, and workspace-wide KPI state.
    const projectCandidatesBlock = resolvedWorkspacePath
      ? await host.buildWorkspaceProjectCandidatesBlock(resolvedWorkspacePath, doctorSnapshot)
      : undefined;
    const workspaceArchitectureBlock = buildWorkspaceArchitectureBlock(
      doctorSnapshot,
      resolvedWorkspacePath
    );
    const workspaceResponseRules = [
      'SCOPE: This is a workspace-level analysis. Reason across ALL projects in the workspace topology — do not collapse focus onto a single service.',
      'EVIDENCE INTEGRITY: Use only facts from the WORKSPACE ARCHITECTURE block. Do not invent project names, paths, or issue counts.',
      'Do not assume fastapi.standard/nestjs.standard when analyze lists framework=python or kit unknown — state the gap and recommend create/import project first.',
      'Do not recommend Docker/K8s/uvicorn deploy for minimal workspaces without Dockerfile and application entrypoint.',
      'CROSS-PROJECT REASONING: Identify which projects share dependencies, configs, or failure modes. Surface topology-level risks explicitly.',
      'WORKSPACE HEALTH: Lead with the overall workspace health score and how issues are distributed across projects.',
      'If all projects are healthy, confirm that explicitly and suggest a proactive workspace-level improvement (e.g., memory capture, topology snapshot).',
      'If multiple projects share a root cause (same framework issue, missing deps, config drift), name the shared pattern and address it once.',
      'Do NOT recommend project-specific commands as the primary answer unless workspace health shows a single-project bottleneck that clearly dominates.',
      'PRIORITY: Rank recommendations by workspace-wide impact, not per-project severity in isolation.',
      'CLARITY: Keep total response length to 8-12 lines. No markdown tables. No fenced code blocks unless user explicitly asks.',
      'COMMANDS: Recommended Action and Verification must each contain exactly one deterministic command in plain text.',
      'CONFIDENCE: If a claim depends on inferred/partial evidence, add a single short assumption line.',
    ];

    return [
      message,
      '',
      ...(projectCandidatesBlock ? [projectCandidatesBlock, ''] : []),
      workspaceArchitectureBlock,
      '',
      ...(intelligenceEvidenceBlock ? [intelligenceEvidenceBlock, ''] : []),
      ...(liveCatalogBlock ? [liveCatalogBlock, ''] : []),
      architectureGrounding,
      '',
      ...workspaceResponseRules,
      '',
      'Respond using this exact structure and headings:',
      'Workspace Status: <health score — e.g. "85% — 17 passed, 2 warnings, 1 error | 3 project(s)">',
      'Priority Issues: <max 3 bullets; if all healthy, write "No critical issues detected across all projects">',
      'Cross-Project Risks: <shared dependencies, config drift, topology risks — or "None detected">',
      'Recommended Action: <workspace-wide next step — single most impactful command or investigation>',
      'Verification: <workspace-level check command, e.g. rapidkit doctor workspace>',
      'Affected Projects: <comma-separated project names needing attention, or "All healthy">',
      'Assumptions: <"none" or one short confidence-qualified assumption>',
      '',
      'Keep it concise, evidence-backed, and actionable at the workspace level.',
    ].join('\n');
  }

  // ── PROJECT-LEVEL ANALYSIS ────────────────────────────────────────────────
  // User has explicitly selected a project. Focus on that project's internals:
  // runtime state, module health, framework-specific blockers, execution readiness.
  const selectedProject = await host.resolveScopedProjectForWorkspace({
    workspacePath: resolvedWorkspacePath,
    projectPath: explicitProjectPath,
    projectName: options?.projectName,
    projectType: options?.projectType,
    doctorSnapshot,
  });
  const selectedProjectBelongsToWorkspace = Boolean(selectedProject);

  const projectCandidatesBlock = resolvedWorkspacePath
    ? await host.buildWorkspaceProjectCandidatesBlock(resolvedWorkspacePath, doctorSnapshot)
    : undefined;
  const workspaceArchitectureBlock = buildWorkspaceArchitectureBlock(
    doctorSnapshot,
    resolvedWorkspacePath
  );
  const projectExecutionBlock = await buildProjectExecutionBlock(
    {
      workspacePath: resolvedWorkspacePath,
      projectPath: selectedProjectBelongsToWorkspace ? selectedProject?.path : undefined,
      projectName: selectedProjectBelongsToWorkspace ? selectedProject?.name : undefined,
      projectType: selectedProjectBelongsToWorkspace ? selectedProject?.type : undefined,
    },
    host.inferFrameworkFromWorkspace
  );
  const responseRules = [
    'SCOPE: This is a project-level analysis. Focus on the selected project internals — runtime state, module health, framework-specific blockers, and execution readiness.',
    'EVIDENCE INTEGRITY: Use only facts present in WORKSPACE ARCHITECTURE and PROJECT EXECUTION STATE blocks. Do not invent missing modules, unknown kit, or missing projects.',
    'Domain feature modules (src/<feature>/) ≠ RapidKit Core catalog modules (npx workspai add module <slug>). Route questions accordingly.',
    'NestJS routes: mirror src/examples/ — no /api prefix unless setGlobalPrefix exists in main.ts.',
    'If doctor evidence shows healthy projects with zero issues, do not recommend setup/reset commands unless the user explicitly asks for reconfiguration.',
    'Never claim `kit unknown` or `no modules installed` unless those exact conditions are explicitly listed in the evidence block.',
    'CLARITY: Keep response short (6-10 lines), concrete, and execution-first. Avoid long narrative and avoid repeating the same risk in multiple sections.',
    'COMMANDS: Return exactly one Next command and one Verify command in plain text; do not wrap them in code fences unless user asks.',
    ...(selectedProjectBelongsToWorkspace
      ? [
          'Answer as a launch/readiness assistant for the selected project first.',
          'Explain the current delivery stage in plain language before listing commands.',
          'If Java build wrappers or system build tools are missing, name that blocker explicitly and do not recommend `rapidkit dev` as the next successful step.',
          'If `rapidkit init` may be quiet, explain what it prepares and how the user can verify readiness for `rapidkit dev`.',
        ]
      : [
          'If workspace project scope is ambiguous, do not produce definitive project-level root-cause claims. Ask for target project path first and provide a safe workspace-level next step.',
        ]),
    ...buildIncidentFirstResponseRules({
      projectScoped: selectedProjectBelongsToWorkspace,
      hasDoctorEvidence: Boolean(doctorSnapshot),
      framework: selectedProjectBelongsToWorkspace ? selectedProject?.type : undefined,
    }),
  ];

  return [
    message,
    '',
    ...(projectCandidatesBlock ? [projectCandidatesBlock, ''] : []),
    ...(projectExecutionBlock ? [projectExecutionBlock, ''] : []),
    workspaceArchitectureBlock,
    '',
    ...(intelligenceEvidenceBlock ? [intelligenceEvidenceBlock, ''] : []),
    ...(liveCatalogBlock ? [liveCatalogBlock, ''] : []),
    architectureGrounding,
    '',
    ...responseRules,
    ...(responseRules.length ? [''] : []),
    'Respond using this exact structure and headings:',
    'What happened: <short diagnosis specific to this project>',
    'Why: <root cause in 1-3 bullets>',
    'Next command: <single best next command for this project>',
    'Verify command: <single command/check to confirm success>',
    '',
    'Keep it concise, specific to this project, and executable.',
  ].join('\n');
}

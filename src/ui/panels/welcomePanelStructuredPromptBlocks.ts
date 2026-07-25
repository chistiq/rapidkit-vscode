import path from 'node:path';

import type { DoctorEvidenceSnapshot } from './incidentStudioDoctorEvidence';

export function buildWorkspaceArchitectureBlock(
  snapshot: DoctorEvidenceSnapshot | undefined,
  workspacePath?: string
): string {
  const lines: string[] = ['WORKSPACE ARCHITECTURE (from doctor evidence):'];

  if (!snapshot) {
    lines.push(
      '- No doctor evidence available yet. Do not assume workspace doctor is the immediate next step unless the user asked for a workspace-wide audit.'
    );
    lines.push(`- Workspace path: ${workspacePath ?? 'unknown'}`);
    lines.push(
      '- Use the selected project path, framework files, dependency state, and launch blockers to guide the next action.'
    );
    lines.push(
      '- Doctor evidence, when present, is stored at .workspai/reports/doctor-last-run.json.'
    );
    return lines.join('\n');
  }

  const workspaceName =
    snapshot.workspaceName ?? (workspacePath ? path.basename(workspacePath) : 'unknown');
  lines.push(`- Workspace name: ${workspaceName}`);
  lines.push(`- Workspace path: ${workspacePath ?? 'unknown'}`);
  lines.push(
    `- Health: ${snapshot.health.percent}% (${snapshot.health.passed} passed, ${snapshot.health.warnings} warnings, ${snapshot.health.errors} errors)`
  );
  lines.push(`- Total projects: ${snapshot.projectCount}`);

  if (snapshot.projects.length === 0) {
    lines.push('- Projects: none found');
  } else {
    lines.push('- Projects in this workspace:');
    for (const project of snapshot.projects) {
      const issueText = project.issues > 0 ? ` [${project.issues} issue(s)]` : ' [healthy]';
      const depsText = project.depsInstalled === false ? ' [deps missing]' : '';
      const framework = project.framework ?? 'unknown framework';
      const kitText = project.kit ? ` | kit: ${project.kit}` : '';
      const modulesText =
        typeof project.modulesCount === 'number' && Number.isFinite(project.modulesCount)
          ? ` | modules: ${project.modulesCount}`
          : '';
      const moduleSlugSample = Array.isArray(project.installedModules)
        ? project.installedModules
            .map((mod) => mod.slug)
            .filter((slug) => typeof slug === 'string' && slug.trim().length > 0)
            .slice(0, 4)
        : [];
      const moduleSlugText =
        moduleSlugSample.length > 0 ? ` | moduleSlugs: ${moduleSlugSample.join(', ')}` : '';
      const modulesHealthText =
        typeof project.modulesHealthy === 'boolean'
          ? project.projectKind === 'frontend'
            ? ` | sourceTreeHealthy: ${project.modulesHealthy ? 'yes' : 'no'}`
            : ` | modulesHealthy: ${project.modulesHealthy ? 'yes' : 'no'}`
          : '';
      const qualitySignals = [
        project.hasTests === true ? 'tests:yes' : project.hasTests === false ? 'tests:no' : null,
        project.hasCodeQuality === true
          ? 'lint:yes'
          : project.hasCodeQuality === false
            ? 'lint:no'
            : null,
      ]
        .filter(Boolean)
        .join(' | ');
      const qualityText = qualitySignals ? ` | ${qualitySignals}` : '';
      const vulnText =
        typeof project.vulnerabilities === 'number' && project.vulnerabilities > 0
          ? ` | vulnerabilities: ${project.vulnerabilities}`
          : '';
      lines.push(
        `    • ${project.name} (${framework}) — path: ${project.path || `${workspacePath}/${project.name}`}${issueText}${depsText}${kitText}${modulesText}${moduleSlugText}${modulesHealthText}${qualityText}${vulnText}`
      );
    }
  }

  if (snapshot.fixCommands.length > 0) {
    lines.push(`- Suggested fix commands: ${snapshot.fixCommands.slice(0, 3).join(' | ')}`);
  }

  lines.push('');
  if (
    snapshot.health.errors === 0 &&
    snapshot.health.warnings === 0 &&
    snapshot.projects.length > 0 &&
    snapshot.projects.every((project) => project.issues === 0)
  ) {
    lines.push(
      'EVIDENCE NOTE: Workspace baseline is healthy. Prefer targeted verification commands over setup/reset flows.'
    );
  }
  if (
    snapshot.projects.some(
      (project) => project.projectKind !== 'frontend' && project.modulesHealthy === true
    )
  ) {
    lines.push(
      'EVIDENCE NOTE: Doctor reports modulesHealthy=true for module-capable projects. Do NOT claim missing RapidKit modules unless user provides contradictory evidence.'
    );
  }
  if (
    snapshot.projects.some(
      (project) => project.projectKind === 'frontend' && project.modulesHealthy === true
    )
  ) {
    lines.push(
      'EVIDENCE NOTE: Doctor reports a healthy frontend source tree (src/app/pages). Do NOT claim missing application code unless user provides contradictory evidence.'
    );
  }
  lines.push(
    'IMPORTANT: The workspace already has the projects listed above. Do NOT suggest creating a new project unless the user explicitly asks for one. Use the existing project paths for all commands.'
  );

  return lines.join('\n');
}

import type { AIModalContext, AIConversationMode, ScannedProjectContext } from './aiService';
import { getAIOutputQualityContract } from './aiOutputQuality';

/**
 * Build the user-facing message for an AI modal query.
 */
export function buildAIModalUserMessage(
  mode: AIConversationMode,
  question: string,
  ctx: AIModalContext,
  scanned?: ScannedProjectContext
): string {
  const kitLabel = scanned?.kit ?? ctx.framework ?? ctx.type;
  const installedList = scanned?.installedModules.map((m) => m.slug).join(', ');
  const contextPacket = scanned
    ? {
        project_type: scanned.kit,
        python_version: scanned.pythonVersion,
        java_version:
          scanned.kit === 'springboot.standard' || scanned.runtime === 'java'
            ? scanned.runtimeVersion
            : null,
        dotnet_version:
          scanned.kit === 'dotnet.webapi.clean' || scanned.runtime === 'dotnet'
            ? scanned.runtimeVersion
            : null,
        go_version:
          scanned.kit === 'gofiber.standard' ||
          scanned.kit === 'gogin.standard' ||
          scanned.runtime === 'go'
            ? scanned.runtimeVersion
            : null,
        runtime_version: scanned.runtimeVersion,
        rapidkit_cli_version: scanned.rapidkitCliVersion,
        rapidkit_core_version: scanned.rapidkitCoreVersion,
        installed_modules: scanned.installedModules.map((m) => m.slug),
        workspace_health: scanned.workspaceHealth,
        runtime: scanned.runtime,
        engine: scanned.engine,
      }
    : null;

  const ctxHeader = [
    `[${ctx.type.toUpperCase()}] ${ctx.name}`,
    kitLabel && `Kit: ${kitLabel}`,
    ctx.path && `Path: ${ctx.path}`,
    ctx.workspaceRootPath && `workspace_root: ${ctx.workspaceRootPath}`,
    ctx.projectRootPath && `project_root: ${ctx.projectRootPath}`,
    scanned?.pythonVersion && `python_version: ${scanned.pythonVersion}`,
    scanned?.rapidkitCliVersion && `rapidkit_cli_version: ${scanned.rapidkitCliVersion}`,
    scanned?.rapidkitCoreVersion && `rapidkit_core_version: ${scanned.rapidkitCoreVersion}`,
    scanned?.workspaceHealth &&
      `workspace_health: ${JSON.stringify({
        total: scanned.workspaceHealth.total,
        passed: scanned.workspaceHealth.passed,
        warnings: scanned.workspaceHealth.warnings,
        errors: scanned.workspaceHealth.errors,
        generated_at: scanned.workspaceHealth.generatedAt,
      })}`,
    contextPacket && `context_packet: ${JSON.stringify(contextPacket)}`,
    installedList && `Installed modules: ${installedList}`,
    scanned?.gitDiff && `Recent uncommitted changes (git diff --stat):\n${scanned.gitDiff}`,
  ]
    .filter(Boolean)
    .join('\n');

  if (mode === 'debug') {
    return `${ctxHeader}

Error / Issue to debug:
${question}

${getAIOutputQualityContract(mode, kitLabel)}`;
  }

  return `${ctxHeader}

Question: ${question}

Answer precisely using the project's actual kit (${kitLabel}), installed modules, and Workspai coding standards.

${getAIOutputQualityContract(mode, kitLabel)}`;
}

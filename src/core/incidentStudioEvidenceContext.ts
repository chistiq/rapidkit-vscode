import { getGitDiffStat } from './aiProjectContextUtils';
import { readAIActionRegistry } from './aiActionRegistry';
import { buildIncidentStudioArchitecturePromptSection } from './incidentStudioArchitectureGrounding';
import {
  buildWorkspaceAgentContextPromptSection,
  readWorkspaceAgentContextReport,
} from './workspaceAgentContextReader';
import {
  buildWorkspaceImpactPromptSection,
  readWorkspaceImpactReport,
} from './workspaceImpactReader';
import { buildWorkspaceModelPromptSection, readWorkspaceModelReport } from './workspaceModelReader';
import {
  buildWorkspaceVerifyPromptSection,
  readWorkspaceVerifyReport,
} from './workspaceVerifyReader';
import { AnalyzeReport } from '../ui/panels/incidentStudioAnalyze';

export interface IncidentStudioEvidenceContext {
  workspace: {
    name: string;
    path: string;
  };
  analyzeReport: {
    available: boolean;
    generatedAt?: string;
    score?: number;
    verdict?: string;
    findings?: {
      fail: number;
      warn: number;
      info: number;
    };
    topFindings: Array<{
      severity: string;
      target: string;
      title: string;
      remediation: string;
    }>;
    ciGateCommand?: string;
    releaseGateCommand?: string;
  };
  git: {
    diffStat: string;
  };
  doctor: {
    available: boolean;
    generatedAt?: string;
    projectScoped?: boolean;
    health?: {
      total: number;
      passed: number;
      warnings: number;
      errors: number;
      percent: number;
    };
    selectedProject?: {
      name: string;
      framework?: string;
      issues: number;
    };
    fixCommands: string[];
  };
  aiActions: {
    total: number;
    latest: Array<{
      summary: string;
      actionType: string;
      riskLevel: string;
      validationStatus: string;
      lastExecution?: string;
    }>;
  };
  workspaceIntelligence: {
    model: {
      available: boolean;
      projectCount?: number;
      validationStatus?: string;
      workspaceType?: string;
    };
    agentContext: {
      available: boolean;
      agent?: string;
      safeCommands?: number;
      validationStatus?: string;
      summary?: string;
    };
    impact: {
      available: boolean;
      risk?: string;
      affectedProjects?: number;
      workspaceItems?: number;
      recommendedCommands?: number;
      headline?: string;
      topAffected: Array<{
        name: string;
        risk?: string;
        summary?: string;
      }>;
      topWorkspaceImpact: Array<{
        target?: string;
        risk?: string;
        summary?: string;
      }>;
    };
    verify: {
      available: boolean;
      verdict?: string;
      exitCode?: number;
      stepsPassed?: number;
      stepsMissing?: number;
      blockingReasons: string[];
    };
  };
}

type IncidentStudioDoctorSnapshot = {
  generatedAt?: string;
  health: {
    total: number;
    passed: number;
    warnings: number;
    errors: number;
    percent: number;
  };
  fixCommands?: string[];
  projects?: Array<{
    name: string;
    path?: string;
    framework?: string;
    issues: number;
  }>;
};

const SECRET_PATTERNS: RegExp[] = [
  /\b(sk-[a-zA-Z0-9_-]{8,})\b/g,
  /\b(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"'\s,}]+/gi,
  /\bBearer\s+[a-zA-Z0-9._-]+/g,
];

function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce((next, pattern) => next.replace(pattern, '[redacted]'), value);
}

function clip(value: string, maxLength: number): string {
  const redacted = redactSecrets(value);
  if (redacted.length <= maxLength) {
    return redacted;
  }
  return `${redacted.slice(0, maxLength)}\n[truncated]`;
}

export async function buildIncidentStudioEvidenceContext(input: {
  workspacePath: string;
  workspaceName: string;
  projectPath?: string;
  projectName?: string;
  projectFramework?: string;
  analyzeReport?: AnalyzeReport | null;
  doctorSnapshot?: IncidentStudioDoctorSnapshot | null;
  gitDiffTimeoutMs?: number;
}): Promise<IncidentStudioEvidenceContext> {
  const report = input.analyzeReport || null;
  const doctorSnapshot = input.doctorSnapshot ?? null;
  const explicitProjectPath = input.projectPath?.trim();
  const scopedProject = explicitProjectPath
    ? doctorSnapshot?.projects?.find(
        (project) =>
          project.path === explicitProjectPath ||
          project.name === input.projectName?.trim() ||
          project.name === explicitProjectPath.split(/[\\/]/).pop()
      )
    : undefined;
  const [registry, diffStat, agentContextReport, impactReport, verifyReport, workspaceModelReport] =
    await Promise.all([
      readAIActionRegistry(input.workspacePath),
      getGitDiffStat(input.workspacePath, input.gitDiffTimeoutMs ?? 1500),
      readWorkspaceAgentContextReport(input.workspacePath),
      readWorkspaceImpactReport(input.workspacePath),
      readWorkspaceVerifyReport(input.workspacePath),
      readWorkspaceModelReport(input.workspacePath),
    ]);
  const affected = Array.isArray(impactReport?.affectedProjects)
    ? impactReport.affectedProjects
    : [];
  const workspaceImpactItems = Array.isArray(impactReport?.workspaceImpact)
    ? impactReport.workspaceImpact
    : [];

  return {
    workspace: {
      name: input.workspaceName,
      path: input.workspacePath,
    },
    analyzeReport: {
      available: Boolean(report),
      generatedAt: report?.generatedAt,
      score: report?.summary?.score,
      verdict: report?.summary?.verdict,
      findings: report?.summary?.findings,
      topFindings: (report?.findings || []).slice(0, 8).map((finding) => ({
        severity: finding.severity,
        target: clip(finding.target, 180),
        title: clip(finding.title, 220),
        remediation: clip(finding.remediation, 260),
      })),
      ciGateCommand: report?.enterpriseControls?.ciGateCommand
        ? clip(report.enterpriseControls.ciGateCommand, 240)
        : undefined,
      releaseGateCommand: report?.enterpriseControls?.releaseGateCommand
        ? clip(report.enterpriseControls.releaseGateCommand, 240)
        : undefined,
    },
    git: {
      diffStat: clip(diffStat || 'Git context unavailable.', 1200),
    },
    doctor: {
      available: Boolean(doctorSnapshot),
      generatedAt: doctorSnapshot?.generatedAt,
      projectScoped: Boolean(explicitProjectPath && scopedProject),
      health: doctorSnapshot
        ? {
            total: doctorSnapshot.health.total,
            passed: doctorSnapshot.health.passed,
            warnings: doctorSnapshot.health.warnings,
            errors: doctorSnapshot.health.errors,
            percent: doctorSnapshot.health.percent,
          }
        : undefined,
      selectedProject: scopedProject
        ? {
            name: scopedProject.name,
            framework: scopedProject.framework,
            issues: scopedProject.issues,
          }
        : undefined,
      fixCommands: (doctorSnapshot?.fixCommands ?? []).slice(0, 6),
    },
    aiActions: {
      total: registry.entries.length,
      latest: registry.entries.slice(0, 5).map((entry) => {
        const lastExecution = entry.executions[0];
        return {
          summary: clip(entry.contract.summary, 180),
          actionType: entry.contract.actionType,
          riskLevel: entry.contract.riskLevel,
          validationStatus: entry.validation.status,
          lastExecution: lastExecution
            ? `${lastExecution.operation}:${lastExecution.ok ? 'pass' : 'fail'}`
            : undefined,
        };
      }),
    },
    workspaceIntelligence: {
      model: {
        available: Boolean(workspaceModelReport),
        projectCount: workspaceModelReport?.summary?.projectCount,
        validationStatus: workspaceModelReport?.validation?.status,
        workspaceType: workspaceModelReport?.identity?.workspaceType,
      },
      agentContext: {
        available: Boolean(agentContextReport),
        agent: agentContextReport?.agent,
        safeCommands: Array.isArray(agentContextReport?.safeCommands)
          ? agentContextReport.safeCommands.length
          : 0,
        validationStatus: agentContextReport?.validation?.status,
        summary: agentContextReport?.workspaceSummary
          ? clip(agentContextReport.workspaceSummary, 280)
          : undefined,
      },
      impact: {
        available: Boolean(impactReport),
        risk: impactReport?.summary?.risk,
        affectedProjects: impactReport?.summary?.affectedProjects,
        workspaceItems: impactReport?.summary?.workspaceItems,
        recommendedCommands: impactReport?.summary?.recommendedCommands,
        headline: impactReport?.agentBrief?.headline
          ? clip(impactReport.agentBrief.headline, 220)
          : undefined,
        topAffected: affected.slice(0, 6).map((item) => ({
          name: item.project?.name ?? item.title ?? 'project',
          risk: item.risk,
          summary: item.summary ? clip(item.summary, 220) : undefined,
        })),
        topWorkspaceImpact: workspaceImpactItems.slice(0, 8).map((item) => ({
          target: item.target ? clip(item.target, 180) : item.title,
          risk: item.risk,
          summary: item.summary ? clip(item.summary, 220) : undefined,
        })),
      },
      verify: {
        available: Boolean(verifyReport),
        verdict: verifyReport?.summary?.verdict,
        exitCode: verifyReport?.summary?.exitCode,
        stepsPassed: verifyReport?.summary?.stepsPassed,
        stepsMissing: verifyReport?.summary?.stepsMissing,
        blockingReasons: (verifyReport?.blockingReasons ?? [])
          .slice(0, 6)
          .map((reason) => clip(reason, 220)),
      },
    },
  };
}

export function renderIncidentStudioEvidencePrompt(context: IncidentStudioEvidenceContext): string {
  const sections = [
    'Workspace evidence context:',
    JSON.stringify(context, null, 2),
    '',
    'Use this evidence as the source of truth. If evidence is missing, say what is missing and prefer a verify action over a fix.',
  ];

  const agentSection = buildWorkspaceAgentContextPromptSection(
    context.workspaceIntelligence.agentContext.available
      ? {
          workspaceSummary: context.workspaceIntelligence.agentContext.summary,
          agent: context.workspaceIntelligence.agentContext.agent,
          validation: context.workspaceIntelligence.agentContext.validationStatus
            ? { status: context.workspaceIntelligence.agentContext.validationStatus }
            : undefined,
        }
      : null
  );
  if (agentSection) {
    sections.push(agentSection);
  }

  const impactSection = buildWorkspaceImpactPromptSection(
    context.workspaceIntelligence.impact.available
      ? {
          summary: {
            risk: context.workspaceIntelligence.impact.risk,
            affectedProjects: context.workspaceIntelligence.impact.affectedProjects,
            workspaceItems: context.workspaceIntelligence.impact.workspaceItems,
            recommendedCommands: context.workspaceIntelligence.impact.recommendedCommands,
          },
          agentBrief: context.workspaceIntelligence.impact.headline
            ? { headline: context.workspaceIntelligence.impact.headline }
            : undefined,
          affectedProjects: context.workspaceIntelligence.impact.topAffected.map((item) => ({
            title: item.name,
            summary: item.summary,
            risk: item.risk,
            project: { name: item.name },
          })),
          workspaceImpact: context.workspaceIntelligence.impact.topWorkspaceImpact.map((item) => ({
            target: item.target,
            summary: item.summary,
            risk: item.risk,
          })),
        }
      : null
  );
  if (impactSection) {
    sections.push(impactSection);
  }

  return sections.join('\n');
}

export async function buildIncidentStudioEvidencePrompt(input: {
  workspacePath: string;
  workspaceName: string;
  projectPath?: string;
  projectName?: string;
  projectFramework?: string;
  analyzeReport?: AnalyzeReport | null;
  doctorSnapshot?: IncidentStudioDoctorSnapshot | null;
  gitDiffTimeoutMs?: number;
}): Promise<string> {
  const [context, architectureGrounding, workspaceModelReport, verifyReport] = await Promise.all([
    buildIncidentStudioEvidenceContext(input),
    buildIncidentStudioArchitecturePromptSection({
      workspacePath: input.workspacePath,
      workspaceName: input.workspaceName,
      projectPath: input.projectPath,
      projectName: input.projectName,
      projectFramework: input.projectFramework,
    }),
    readWorkspaceModelReport(input.workspacePath),
    readWorkspaceVerifyReport(input.workspacePath),
  ]);

  const sections = [renderIncidentStudioEvidencePrompt(context)];
  const modelSection = buildWorkspaceModelPromptSection(workspaceModelReport);
  if (modelSection && !architectureGrounding.includes('WORKSPACE MODEL')) {
    sections.push(modelSection);
  }
  if (architectureGrounding) {
    sections.push(architectureGrounding);
  }
  const verifySection = buildWorkspaceVerifyPromptSection(verifyReport);
  if (verifySection) {
    sections.push(verifySection);
  }

  return sections.join('\n\n');
}

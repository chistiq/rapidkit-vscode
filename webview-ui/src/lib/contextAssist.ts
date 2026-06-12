export interface ContextAssistContext {
  type: 'workspace' | 'project' | 'module';
  name: string;
  path?: string;
  framework?: string;
  moduleSlug?: string;
  moduleDescription?: string;
  prefillQuestion?: string;
  prefillMode?: 'debug' | 'ask';
}

/** @deprecated Use ContextAssistContext */
export type AIModalContext = ContextAssistContext;

export interface ContextAssistContractSummary {
  persona_level?: string;
  evidence_confidence?: string;
  commandScope?: string;
  missingFields?: string[];
  safetyFlags?: Record<string, boolean>;
}

/** @deprecated Use ContextAssistContractSummary */
export type AIContextContractSummary = ContextAssistContractSummary;

export type ContextAssistMode = 'debug' | 'ask';

export const CONTEXT_ASSIST_TYPE_LABELS: Record<string, string> = {
  workspace: 'Workspace',
  project: 'Project',
  module: 'Module',
};

export const CONTEXT_ASSIST_FRAMEWORK_LABELS: Record<string, string> = {
  fastapi: 'FastAPI',
  nestjs: 'NestJS',
  go: 'Go',
  springboot: 'Spring Boot',
};

export function getContextAssistQuickPrompts(
  ctx: ContextAssistContext,
  mode: ContextAssistMode
): string[] {
  if (mode === 'debug') {
    return [
      'Paste the full stack trace here and I will analyse it…',
      'Paste the test failure output here…',
    ];
  }
  if (ctx.type === 'workspace') {
    return [
      'What is the best way to share code between projects in this workspace?',
      'How should I set up a shared database for all projects?',
      'What deployment strategy fits a multi-project Workspai workspace?',
    ];
  }
  if (ctx.type === 'project') {
    const fw = ctx.framework || '';
    if (fw === 'fastapi') {
      return [
        "How do I add a new endpoint following this project's DDD structure?",
        'What is the correct way to add a new SQLAlchemy model here?',
        'How should I add a new Workspai module to this project?',
        'How do I write a unit test for a use-case in the application layer?',
      ];
    }
    if (fw === 'nestjs') {
      return [
        'How do I create a new feature module following NestJS conventions here?',
        'How should I add a new database table with TypeORM in this project?',
        'How do I add a new Workspai module to this project?',
      ];
    }
    if (fw === 'go') {
      return [
        "How do I add a new HTTP handler in internal/handlers following this project's conventions?",
        'How should I add a new service function with dependency injection here?',
        'How do I add a new Workspai module to this Go project?',
      ];
    }
    if (fw === 'springboot') {
      return [
        "How do I add a new Spring REST controller following this project's package structure?",
        'How should I add a service class and constructor-based dependency injection here?',
        'How do I expose a new endpoint in OpenAPI/Swagger for this Spring project?',
      ];
    }
    return [
      'How do I add a feature to this project following its conventions?',
      'What Workspai modules should I add to this project?',
    ];
  }
  if (ctx.type === 'module') {
    return [
      `How do I configure the ${ctx.name} module after installation?`,
      `Show me an example of using the ${ctx.name} module in a route handler.`,
      `What does the ${ctx.name} module add to my project structure?`,
    ];
  }
  return [];
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const {
  mockSelectChatModels,
  mockPreferredModelGet,
  mockDetectRapidkitProject,
  mockModulesCatalogGetInstance,
  mockGetModulesCatalog,
} = vi.hoisted(() => ({
  mockSelectChatModels: vi.fn(),
  mockPreferredModelGet: vi.fn(),
  mockDetectRapidkitProject: vi.fn(),
  mockModulesCatalogGetInstance: vi.fn(),
  mockGetModulesCatalog: vi.fn(),
}));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: mockPreferredModelGet,
    }),
  },
  lm: {
    selectChatModels: mockSelectChatModels,
  },
  window: {
    createOutputChannel: () => ({
      appendLine: () => undefined,
      show: () => undefined,
      clear: () => undefined,
      dispose: () => undefined,
    }),
  },
  LanguageModelChatMessage: {
    User: (content: string) => ({ role: 'user', content }),
    Assistant: (content: string) => ({ role: 'assistant', content }),
  },
  LanguageModelTextPart: class {
    value: string;

    constructor(value: string) {
      this.value = value;
    }
  },
  CancellationTokenSource: class {
    private _isCancellationRequested = false;
    private readonly _listeners = new Set<() => void>();
    readonly token: {
      readonly isCancellationRequested: boolean;
      onCancellationRequested: (listener: () => void) => { dispose: () => void };
    };

    constructor() {
      const thisSource = this;
      this.token = {
        get isCancellationRequested() {
          return thisSource._isCancellationRequested;
        },
        onCancellationRequested: (listener: () => void) => {
          thisSource._listeners.add(listener);
          return {
            dispose: () => {
              thisSource._listeners.delete(listener);
            },
          };
        },
      };
    }

    cancel(): void {
      this._isCancellationRequested = true;
      for (const listener of this._listeners) {
        listener();
      }
    }

    dispose(): void {
      this._listeners.clear();
    }
  },
}));

vi.mock('../core/bridge/pythonRapidkit', () => ({
  detectRapidkitProject: mockDetectRapidkitProject,
}));

vi.mock('../core/modulesCatalogService', () => ({
  ModulesCatalogService: {
    getInstance: mockModulesCatalogGetInstance,
  },
}));

import { prepareAIConversation, resetAIServiceCaches } from '../core/aiService';
import { validateIncidentStudioResponse } from '../ui/panels/incidentStudioResponseValidator';
import {
  enforceVerifyCompletionGates,
  isVerifyCompletionPremature,
} from '../ui/panels/incidentStudioPolicyGates';

type StackFixture = {
  framework: 'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet';
  projectName: string;
  expectedKit:
    | 'fastapi.standard'
    | 'nestjs.standard'
    | 'gofiber.standard'
    | 'springboot.standard'
    | 'dotnet.webapi.clean';
  expectedPromptSignal: string;
  moduleSupportExpected: boolean;
};

const STACK_FIXTURES: StackFixture[] = [
  {
    framework: 'fastapi',
    projectName: 'orders-api',
    expectedKit: 'fastapi.standard',
    expectedPromptSignal: 'PROJECT ARCHITECTURE: FastAPI Standard Kit',
    moduleSupportExpected: true,
  },
  {
    framework: 'nestjs',
    projectName: 'catalog-api',
    expectedKit: 'nestjs.standard',
    expectedPromptSignal: 'PROJECT ARCHITECTURE: NestJS Standard Kit',
    moduleSupportExpected: true,
  },
  {
    framework: 'go',
    projectName: 'checkout-api',
    expectedKit: 'gofiber.standard',
    expectedPromptSignal: 'PROJECT ARCHITECTURE: Go Standard Kit (gofiber.standard)',
    moduleSupportExpected: false,
  },
  {
    framework: 'springboot',
    projectName: 'billing-api',
    expectedKit: 'springboot.standard',
    expectedPromptSignal: 'PROJECT ARCHITECTURE: Spring Boot Standard Kit',
    moduleSupportExpected: false,
  },
  {
    framework: 'dotnet',
    projectName: 'inventory-api',
    expectedKit: 'dotnet.webapi.clean',
    expectedPromptSignal: 'PROJECT ARCHITECTURE: .NET Web API Clean Kit',
    moduleSupportExpected: false,
  },
];

function writeFreshDoctorEvidence(projectPath: string): void {
  fs.mkdirSync(path.join(projectPath, '.rapidkit', 'reports'), { recursive: true });
  fs.writeFileSync(
    path.join(projectPath, '.rapidkit', 'reports', 'doctor-last-run.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        healthScore: {
          total: 10,
          passed: 9,
          warnings: 1,
          errors: 0,
        },
        system: {
          versions: {
            core: '0.3.9',
            npm: '0.29.1',
          },
        },
      },
      null,
      2
    )
  );
}

function createStackProject(root: string, fixture: StackFixture): string {
  const projectPath = path.join(root, fixture.projectName);
  fs.mkdirSync(projectPath, { recursive: true });

  if (fixture.framework === 'fastapi') {
    fs.mkdirSync(path.join(projectPath, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(projectPath, 'pyproject.toml'),
      [
        '[tool.poetry]',
        `name = "${fixture.projectName}"`,
        '[tool.poetry.dependencies]',
        'python = "^3.12"',
        'fastapi = "^0.128.0"',
      ].join('\n')
    );
    fs.writeFileSync(path.join(projectPath, 'src', 'main.py'), 'from fastapi import FastAPI\n');
  }

  if (fixture.framework === 'nestjs') {
    fs.mkdirSync(path.join(projectPath, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(projectPath, 'package.json'),
      JSON.stringify({ dependencies: { '@nestjs/core': '^11.0.0' } }, null, 2)
    );
    fs.writeFileSync(path.join(projectPath, 'src', 'main.ts'), 'console.log("boot")\n');
  }

  if (fixture.framework === 'go') {
    fs.writeFileSync(
      path.join(projectPath, 'go.mod'),
      [
        'module example.com/checkout-api',
        '',
        'go 1.23',
        '',
        'require github.com/gofiber/fiber/v2 v2.52.0',
      ].join('\n')
    );
  }

  if (fixture.framework === 'springboot') {
    fs.mkdirSync(path.join(projectPath, 'src', 'main', 'java'), { recursive: true });
    fs.writeFileSync(
      path.join(projectPath, 'pom.xml'),
      [
        '<project>',
        '  <properties><java.version>21</java.version></properties>',
        '  <dependencies>',
        '    <dependency>',
        '      <groupId>org.springframework.boot</groupId>',
        '      <artifactId>spring-boot-starter-web</artifactId>',
        '    </dependency>',
        '  </dependencies>',
        '</project>',
      ].join('\n')
    );
  }

  if (fixture.framework === 'dotnet') {
    fs.mkdirSync(path.join(projectPath, 'src', 'Inventory.Api'), { recursive: true });
    fs.writeFileSync(
      path.join(projectPath, 'inventory-api.csproj'),
      [
        '<Project Sdk="Microsoft.NET.Sdk.Web">',
        '  <PropertyGroup>',
        '    <TargetFramework>net9.0</TargetFramework>',
        '  </PropertyGroup>',
        '  <ItemGroup>',
        '    <PackageReference Include="Swashbuckle.AspNetCore" Version="6.6.2" />',
        '  </ItemGroup>',
        '</Project>',
      ].join('\n')
    );
    fs.writeFileSync(
      path.join(projectPath, 'src', 'Inventory.Api', 'Program.cs'),
      'var builder = WebApplication.CreateBuilder(args);\n'
    );
  }

  writeFreshDoctorEvidence(projectPath);
  return projectPath;
}

describe('AI reliability release gate', () => {
  let tempRoot: string;

  beforeEach(() => {
    vi.clearAllMocks();
    resetAIServiceCaches();
    mockPreferredModelGet.mockReturnValue('auto');
    mockSelectChatModels.mockResolvedValue([]);
    mockDetectRapidkitProject.mockResolvedValue({ ok: false });
    mockGetModulesCatalog.mockResolvedValue({
      modules: [],
      source: 'fallback',
      catalog: null,
    });
    mockModulesCatalogGetInstance.mockReturnValue({
      getModulesCatalog: mockGetModulesCatalog,
    });
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-ai-reliability-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('blocks no-evidence prompts before any model stream can be trusted', async () => {
    const prepared = await prepareAIConversation('ask', 'Can I ship this?', {
      type: 'workspace',
      name: 'unknown-workspace',
    });

    expect(prepared.validation.clarificationNeeded).toBe(true);
    expect(prepared.contract.evidence_confidence).toBe('none');
    expect(prepared.messages.map((message) => message.content).join('\n')).toContain(
      'Evidence confidence: NONE'
    );
  });

  it.each(STACK_FIXTURES)(
    'builds a governed AI contract and prompt for $framework projects',
    async (fixture) => {
      const projectPath = createStackProject(tempRoot, fixture);
      const prepared = await prepareAIConversation('ask', 'What should I verify first?', {
        type: 'project',
        name: fixture.projectName,
        path: projectPath,
        framework: fixture.framework,
        projectRootPath: projectPath,
        workspaceRootPath: tempRoot,
      });

      const joinedPrompt = prepared.messages.map((message) => message.content).join('\n');

      expect(prepared.validation.clarificationNeeded).toBe(false);
      expect(prepared.scanned?.kit).toBe(fixture.expectedKit);
      expect(prepared.contract.commandScope).toBe('project');
      expect(prepared.contract.workspace.doctorLastRunAt).toBeTruthy();
      expect(prepared.contract.safetyFlags.doctorEvidenceStale).toBe(false);
      expect(prepared.contract.safetyFlags.moduleSupportDisabled).toBe(
        !fixture.moduleSupportExpected
      );
      expect(joinedPrompt).toContain(fixture.expectedPromptSignal);
      expect(joinedPrompt).toContain('RAPIDKIT COMMAND EXECUTION CONTEXT');
      expect(joinedPrompt).toContain(`Selected project root: ${projectPath}`);
      expect(joinedPrompt).toContain('OUTPUT QUALITY CONTRACT');
      expect(joinedPrompt).toContain('## Next Safe Step');
      expect(joinedPrompt).toContain('## Verification');
      expect(joinedPrompt).toContain('Every command must include the correct execution directory');
      expect(joinedPrompt).toContain('Do not claim fixed, shipped, production-ready, or complete');

      if (!fixture.moduleSupportExpected) {
        expect(joinedPrompt).toContain('SAFETY GATE — NO MODULE SUPPORT');
        expect(joinedPrompt).toContain('Do NOT suggest "rapidkit add module" commands');
      }
    }
  );

  it('marks stale doctor evidence as a governed caveat instead of silently trusting it', async () => {
    const projectPath = createStackProject(tempRoot, STACK_FIXTURES[0]!);
    fs.writeFileSync(
      path.join(projectPath, '.rapidkit', 'reports', 'doctor-last-run.json'),
      JSON.stringify(
        {
          generatedAt: '2020-01-01T00:00:00.000Z',
          healthScore: {
            total: 5,
            passed: 4,
            warnings: 1,
            errors: 0,
          },
        },
        null,
        2
      )
    );

    const prepared = await prepareAIConversation('debug', 'Why is startup failing?', {
      type: 'project',
      name: 'orders-api',
      path: projectPath,
      framework: 'fastapi',
      projectRootPath: projectPath,
      workspaceRootPath: tempRoot,
    });

    expect(prepared.validation.clarificationNeeded).toBe(false);
    expect(prepared.contract.safetyFlags.doctorEvidenceStale).toBe(true);
    expect(prepared.messages[0]?.content).toContain('NOTE — STALE EVIDENCE');
  });

  it('keeps stable Incident Studio responses verify-first and claim-safe', () => {
    const validProjectResponse = [
      'What happened: FastAPI startup failed after dependency refresh based on doctor evidence',
      'Why: Missing package import appears to block application boot from current evidence',
      'Next command: python -m pytest tests/test_health.py',
      'Verify command: npx --yes --package rapidkit rapidkit doctor project',
      'Risk and confidence: medium risk; confidence 80 based on doctor evidence',
      'Assumptions: Project path and doctor evidence are current',
    ].join('\n');
    const prematureClaim = [
      'What happened: The issue is fixed and production ready',
      'Why: Everything is working now',
      'Next command: echo done',
      'Assumptions: none',
    ].join('\n');

    const validResult = validateIncidentStudioResponse(validProjectResponse, 'project');
    const invalidResult = validateIncidentStudioResponse(prematureClaim, 'project');
    const blockedGate = enforceVerifyCompletionGates({
      verifyPhaseReachPass: false,
      bridgeRouteCompletionPass: true,
      overallPass: false,
    });
    const premature = isVerifyCompletionPremature({
      verifyPhaseReachPass: false,
      bridgeRouteCompletionPass: true,
      overallPass: false,
    });

    expect(validResult.isValid).toBe(true);
    expect(invalidResult.isValid).toBe(false);
    expect(
      invalidResult.violations.some((violation) => violation.rule === 'MISSING_VERIFY_COMMAND')
    ).toBe(true);
    expect(blockedGate.canCompleteVerify).toBe(false);
    expect(blockedGate.blockedReasons).toContain('Verify phase reach < minimum threshold');
    expect(premature.isPremature).toBe(true);
  });
});

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
      if (this._isCancellationRequested) {
        return;
      }
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

import {
  parseCreationIntent,
  prepareAIConversation,
  resetAIServiceCaches,
  selectModelWithPreference,
  streamAIResponse,
  UnsupportedCreationStackError,
} from '../core/aiService';
import * as vscode from 'vscode';

describe('aiService', () => {
  let tempProjectPath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    resetAIServiceCaches();
    mockPreferredModelGet.mockReturnValue('auto');
    mockDetectRapidkitProject.mockResolvedValue({ ok: false });
    mockGetModulesCatalog.mockResolvedValue({
      modules: [],
      source: 'fallback',
      catalog: null,
    });
    mockModulesCatalogGetInstance.mockReturnValue({
      getModulesCatalog: mockGetModulesCatalog,
    });
    tempProjectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-ai-'));
  });

  afterEach(() => {
    fs.rmSync(tempProjectPath, { recursive: true, force: true });
  });

  it('prepares a shared AI conversation with scanned workspace context and memory', async () => {
    fs.mkdirSync(path.join(tempProjectPath, 'src', 'app', 'domain'), { recursive: true });
    fs.mkdirSync(path.join(tempProjectPath, '.rapidkit'), { recursive: true });

    fs.writeFileSync(
      path.join(tempProjectPath, 'pyproject.toml'),
      [
        '[tool.poetry]',
        'name = "demo-api"',
        '[tool.poetry.dependencies]',
        'python = "^3.12"',
        'fastapi = "^0.128.0"',
        'sqlalchemy = "^2.0.0"',
        'redis = "^5.0.0"',
      ].join('\n')
    );
    fs.writeFileSync(
      path.join(tempProjectPath, 'src', 'main.py'),
      'from fastapi import FastAPI\napp = FastAPI()\n'
    );
    fs.writeFileSync(
      path.join(tempProjectPath, 'registry.json'),
      JSON.stringify(
        {
          installed_modules: [
            {
              slug: 'free/auth/core',
              version: '1.0.0',
              display_name: 'Auth Core',
            },
          ],
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      path.join(tempProjectPath, '.rapidkit', 'workspace-memory.json'),
      JSON.stringify(
        {
          context: 'B2B backend with strict domain boundaries',
          conventions: ['Use services through interfaces only'],
          decisions: ['PostgreSQL is the source of truth'],
          lastUpdated: '2026-04-17T00:00:00.000Z',
        },
        null,
        2
      )
    );
    fs.mkdirSync(path.join(tempProjectPath, '.rapidkit', 'reports'), { recursive: true });
    fs.writeFileSync(
      path.join(tempProjectPath, '.rapidkit', 'reports', 'doctor-last-run.json'),
      JSON.stringify(
        {
          generatedAt: '2026-04-18T00:00:00.000Z',
          healthScore: {
            total: 8,
            passed: 7,
            warnings: 1,
            errors: 0,
          },
          system: {
            versions: {
              core: '0.3.9',
              npm: '0.25.4',
            },
          },
        },
        null,
        2
      )
    );

    const prepared = await prepareAIConversation('ask', 'Where should I add auth?', {
      type: 'workspace',
      name: 'demo-api',
      path: tempProjectPath,
      framework: 'fastapi',
      workspaceRootPath: tempProjectPath,
    });

    expect(prepared.scanned?.kit).toBe('fastapi.ddd');
    expect(prepared.messages[0].content).toContain('CURRENT WORKSPACE STATE');
    expect(prepared.messages[0].content).toContain('WORKSPACE MEMORY');
    expect(prepared.messages[0].content).toContain('Use services through interfaces only');
    expect(prepared.messages[0].content).toContain('src/');
    expect(prepared.messages[0].content).toContain('python_version: ^3.12');
    expect(prepared.messages[0].content).toContain('workspace_health: {"total":8,"passed":7');
    expect(prepared.messages[0].content).toContain('rapidkit_cli_version: 0.25.4');
    expect(prepared.messages[0].content).toContain('rapidkit_core_version: 0.3.9');
    expect(prepared.messages[0].content).toContain('RAPIDKIT COMMAND EXECUTION CONTEXT');
    expect(prepared.messages[0].content).toContain(`Active workspace root: ${tempProjectPath}`);
    expect(prepared.messages.at(-1)?.content).toContain('python_version: ^3.12');
    expect(prepared.messages.at(-1)?.content).toContain('workspace_health: {"total":8,"passed":7');
    expect(prepared.messages.at(-1)?.content).toContain('rapidkit_cli_version: 0.25.4');
    expect(prepared.messages.at(-1)?.content).toContain('rapidkit_core_version: 0.3.9');
    expect(prepared.messages.at(-1)?.content).toContain(`workspace_root: ${tempProjectPath}`);
    expect(prepared.messages.at(-1)?.content).toContain(
      'context_packet: {"project_type":"fastapi.ddd"'
    );
    expect(prepared.messages.at(-1)?.content).toContain('Installed modules: free/auth/core');
    expect(prepared.messages.at(-1)?.content).toContain('OUTPUT QUALITY CONTRACT');
    expect(prepared.messages.at(-1)?.content).toContain('## Next Safe Step');
    expect(prepared.messages.at(-1)?.content).toContain('## Verification');
    expect(prepared.messages.at(-1)?.content).toContain(
      'Do not claim fixed, shipped, production-ready, or complete'
    );
  });

  it('injects ancestor workspace memory when AI runs at project scope', async () => {
    const workspaceRoot = path.join(tempProjectPath, 'workspace-root');
    const projectRoot = path.join(workspaceRoot, 'apps', 'orders-api');

    fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
    fs.mkdirSync(path.join(workspaceRoot, '.rapidkit'), { recursive: true });
    fs.writeFileSync(
      path.join(workspaceRoot, '.rapidkit', 'workspace-memory.json'),
      JSON.stringify(
        {
          context: 'Orders platform with strict API contracts',
          conventions: ['Use DTO mapping in application layer'],
          decisions: ['Kafka is used for integration events'],
          lastUpdated: '2026-04-20T00:00:00.000Z',
        },
        null,
        2
      )
    );

    const prepared = await prepareAIConversation('ask', 'Where should I add new order endpoints?', {
      type: 'project',
      name: 'orders-api',
      path: projectRoot,
      framework: 'fastapi',
      workspaceRootPath: workspaceRoot,
      projectRootPath: projectRoot,
    });

    expect(prepared.messages[0].content).toContain('WORKSPACE MEMORY');
    expect(prepared.messages[0].content).toContain('Use DTO mapping in application layer');
    expect(prepared.messages[0].content).toContain('Kafka is used for integration events');
    expect(prepared.messages[0].content).toContain(`Selected project root: ${projectRoot}`);
    expect(prepared.messages.at(-1)?.content).toContain(`project_root: ${projectRoot}`);
    expect(prepared.messages.at(-1)?.content).toContain(
      'Every command must include the correct execution directory'
    );
  });

  it('returns clarification-needed validation when evidence is missing', async () => {
    const prepared = await prepareAIConversation('ask', 'How do I fix this?', {
      type: 'workspace',
      name: 'unknown-workspace',
    });

    expect(prepared.validation.clarificationNeeded).toBe(true);
    expect(prepared.validation.clarificationReason).toContain(
      'run `npx rapidkit doctor workspace`'
    );
    expect(prepared.contract.evidence_confidence).toBe('none');
  });

  it('uses scanned doctor evidence freshness when no explicit doctor snapshot is provided', async () => {
    fs.mkdirSync(path.join(tempProjectPath, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tempProjectPath, '.rapidkit', 'reports'), { recursive: true });
    fs.writeFileSync(
      path.join(tempProjectPath, 'pyproject.toml'),
      [
        '[tool.poetry]',
        'name = "doctor-fresh-api"',
        '[tool.poetry.dependencies]',
        'python = "^3.12"',
        'fastapi = "^0.128.0"',
      ].join('\n')
    );
    fs.writeFileSync(
      path.join(tempProjectPath, '.rapidkit', 'reports', 'doctor-last-run.json'),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          healthScore: {
            total: 10,
            passed: 9,
            warnings: 1,
            errors: 0,
          },
        },
        null,
        2
      )
    );

    const prepared = await prepareAIConversation('ask', 'Is my doctor evidence current?', {
      type: 'project',
      name: 'doctor-fresh-api',
      path: tempProjectPath,
      framework: 'fastapi',
      projectRootPath: tempProjectPath,
    });

    expect(prepared.scanned?.workspaceHealth?.generatedAt).toBeTruthy();
    expect(prepared.contract.workspace.doctorLastRunAt).toBeTruthy();
    expect(prepared.contract.workspace.healthPercent).toBe(90);
    expect(prepared.contract.safetyFlags.doctorEvidenceStale).toBe(false);
  });

  it('redacts sensitive literals from history and question before prompt assembly', async () => {
    const prepared = await prepareAIConversation(
      'ask',
      'Please review token=abc123secret and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      {
        type: 'workspace',
        name: 'security-demo',
      },
      [
        {
          role: 'user',
          content: 'password: supersecret',
        },
      ]
    );

    const joined = prepared.messages.map((msg) => msg.content).join('\n');
    expect(joined).toContain('[REDACTED]');
    expect(joined).not.toContain('abc123secret');
    expect(joined).not.toContain('supersecret');
    expect(joined).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
  });

  it('parses spring pom runtime deps without plugin/dependencyManagement noise', async () => {
    fs.mkdirSync(path.join(tempProjectPath, 'src', 'main', 'java'), { recursive: true });
    fs.writeFileSync(
      path.join(tempProjectPath, 'pom.xml'),
      [
        '<project>',
        '  <properties>',
        '    <maven.compiler.release>21</maven.compiler.release>',
        '  </properties>',
        '  <dependencyManagement>',
        '    <dependencies>',
        '      <dependency>',
        '        <groupId>org.springframework.boot</groupId>',
        '        <artifactId>spring-boot-dependencies</artifactId>',
        '        <version>3.3.0</version>',
        '        <type>pom</type>',
        '        <scope>import</scope>',
        '      </dependency>',
        '    </dependencies>',
        '  </dependencyManagement>',
        '  <dependencies>',
        '    <dependency>',
        '      <groupId>org.springframework.boot</groupId>',
        '      <artifactId>spring-boot-starter-web</artifactId>',
        '    </dependency>',
        '    <dependency>',
        '      <groupId>org.postgresql</groupId>',
        '      <artifactId>postgresql</artifactId>',
        '      <scope>runtime</scope>',
        '    </dependency>',
        '    <dependency>',
        '      <groupId>org.springframework.boot</groupId>',
        '      <artifactId>spring-boot-starter-test</artifactId>',
        '      <scope>test</scope>',
        '    </dependency>',
        '  </dependencies>',
        '  <build>',
        '    <plugins>',
        '      <plugin>',
        '        <groupId>org.springframework.boot</groupId>',
        '        <artifactId>spring-boot-maven-plugin</artifactId>',
        '        <dependencies>',
        '          <dependency>',
        '            <groupId>org.example</groupId>',
        '            <artifactId>plugin-helper</artifactId>',
        '          </dependency>',
        '        </dependencies>',
        '      </plugin>',
        '    </plugins>',
        '  </build>',
        '</project>',
      ].join('\n')
    );

    const prepared = await prepareAIConversation('ask', 'check spring deps', {
      type: 'project',
      name: 'billing-api',
      path: tempProjectPath,
      framework: 'springboot',
      projectRootPath: tempProjectPath,
    });

    expect(prepared.scanned?.kit).toBe('springboot.standard');
    expect(prepared.scanned?.runtimeVersion).toBe('21');
    expect(prepared.scanned?.productionDeps).toContain('spring-boot-starter-web');
    expect(prepared.scanned?.productionDeps).toContain('postgresql');
    expect(prepared.scanned?.productionDeps).not.toContain('spring-boot-starter-test');
    expect(prepared.scanned?.productionDeps).not.toContain('spring-boot-dependencies');
    expect(prepared.scanned?.productionDeps).not.toContain('plugin-helper');
  });

  it('caches model selection for repeated AI requests', async () => {
    const model = {
      id: 'gpt-4o',
      name: 'GPT-4o',
      sendRequest: vi.fn(),
    };

    mockSelectChatModels.mockResolvedValue([model]);

    const first = await selectModelWithPreference();
    const second = await selectModelWithPreference();

    expect(first.modelId).toBe('GPT-4o');
    expect(second.modelId).toBe('GPT-4o');
    expect(mockSelectChatModels).toHaveBeenCalledTimes(2);
  });

  it('stops streaming when cancellation is requested mid-response without emitting done', async () => {
    const model = {
      id: 'gpt-4o',
      name: 'GPT-4o',
      sendRequest: vi.fn(async () => ({
        stream: (async function* () {
          yield new vscode.LanguageModelTextPart('first chunk');
          yield new vscode.LanguageModelTextPart('second chunk');
        })(),
      })),
    };

    mockSelectChatModels.mockResolvedValue([model]);

    const cancellationListeners = new Set<() => void>();
    const mutableToken = {
      isCancellationRequested: false,
      onCancellationRequested: (listener: () => void) => {
        cancellationListeners.add(listener);
        return {
          dispose: () => {
            cancellationListeners.delete(listener);
          },
        };
      },
    };
    const chunks: string[] = [];
    let done = 0;

    await streamAIResponse(
      [{ role: 'user', content: 'Explain this' }],
      (chunk) => {
        if (chunk.text) {
          chunks.push(chunk.text);
          mutableToken.isCancellationRequested = true;
          for (const listener of cancellationListeners) {
            listener();
          }
        }
        if (chunk.done) {
          done += 1;
        }
      },
      mutableToken as unknown as vscode.CancellationToken
    );

    expect(chunks).toEqual(['first chunk']);
    expect(done).toBe(0);
  });

  it('falls back to another model when initial request fails with retryable rate-limit error', async () => {
    const autoModel = {
      id: 'auto',
      name: 'Auto (copilot)',
      sendRequest: vi.fn(async () => {
        throw new Error('429 Too Many Requests: rate limit exceeded');
      }),
    };

    const fallbackModel = {
      id: 'gpt-4o',
      name: 'GPT-4o',
      sendRequest: vi.fn(async () => ({
        stream: (async function* () {
          yield new vscode.LanguageModelTextPart('fallback response');
        })(),
      })),
    };

    mockSelectChatModels.mockResolvedValue([autoModel, fallbackModel]);

    const chunks: string[] = [];
    let done = 0;

    const result = await streamAIResponse(
      [{ role: 'user', content: 'hello' }],
      (chunk) => {
        if (chunk.text) {
          chunks.push(chunk.text);
        }
        if (chunk.done) {
          done += 1;
        }
      },
      undefined,
      'auto'
    );

    expect(autoModel.sendRequest).toHaveBeenCalledTimes(1);
    expect(fallbackModel.sendRequest).toHaveBeenCalledTimes(1);
    expect(chunks).toEqual(['fallback response']);
    expect(done).toBe(1);
    expect(result.modelId).toBe('GPT-4o');
  });

  it('uses project-detect contract to resolve the canonical project root and kit', async () => {
    const workspaceRoot = path.join(tempProjectPath, 'workspace-root');
    const projectRoot = path.join(workspaceRoot, 'node-app');
    fs.mkdirSync(path.join(projectRoot, '.rapidkit'), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, '.rapidkit', 'project.json'),
      JSON.stringify({ runtime: 'node', kit_name: 'nestjs.standard' }, null, 2)
    );
    fs.writeFileSync(
      path.join(projectRoot, '.rapidkit', 'context.json'),
      JSON.stringify({ engine: 'npm' }, null, 2)
    );
    fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify({ dependencies: { '@nestjs/core': '^11.0.0' } }, null, 2)
    );
    fs.writeFileSync(path.join(projectRoot, 'src', 'main.ts'), 'console.log("boot")\n', {
      flag: 'w',
    });

    mockDetectRapidkitProject.mockResolvedValue({
      ok: true,
      data: {
        schema_version: 1,
        input: workspaceRoot,
        confidence: 'strong',
        isRapidkitProject: true,
        projectRoot,
        engine: 'node',
        markers: {},
      },
    });

    const prepared = await prepareAIConversation('ask', 'Explain this service', {
      type: 'workspace',
      name: 'workspace-root',
      path: workspaceRoot,
    });

    expect(prepared.scanned?.projectRoot).toBe(projectRoot);
    expect(prepared.scanned?.kit).toBe('nestjs.standard');
    expect(prepared.messages[0].content).toContain(`Root:        ${projectRoot}`);
    expect(prepared.messages[0].content).toContain('Engine:      node');
    expect(prepared.messages[0].content).toContain('Detection:   strong');
  });

  it('uses the workspace-aware modules catalog when parsing creation intent', async () => {
    const model = {
      id: 'gpt-4o',
      name: 'GPT-4o',
      sendRequest: vi.fn(async (messages: Array<{ content: string }>) => ({
        stream: (async function* () {
          yield new vscode.LanguageModelTextPart(
            JSON.stringify({
              workspaceName: 'billing-suite',
              profile: 'python-only',
              installMethod: 'auto',
              framework: 'fastapi',
              kit: 'fastapi.standard',
              projectName: 'billing-api',
              suggestedModules: ['free/essentials/settings', 'pro/billing/invoices'],
              description: 'Billing APIs for subscription management.',
            })
          );
        })(),
      })),
    };

    mockGetModulesCatalog.mockResolvedValue({
      modules: [
        {
          id: 'invoices',
          name: 'Invoices',
          version: '2.3.0',
          category: 'billing',
          icon: 'x',
          description: 'Invoice workflows',
          status: 'stable',
          tags: ['payments', 'finance'],
          slug: 'pro/billing/invoices',
        },
      ],
      source: 'live',
      catalog: null,
    });
    mockSelectChatModels.mockResolvedValue([model]);

    await parseCreationIntent(
      'Create a billing workspace with invoices',
      'workspace',
      'fastapi',
      tempProjectPath
    );

    expect(mockGetModulesCatalog).toHaveBeenCalledWith(tempProjectPath);
    const sendRequestMock = model.sendRequest as unknown as {
      mock: { calls: Array<Array<Array<{ content?: string }>>> };
    };
    const systemPrompt = sendRequestMock.mock.calls[0]?.[0]?.[0]?.content ?? '';
    expect(systemPrompt).toContain('pro/billing/invoices');
    expect(systemPrompt).toContain('v2.3.0');
  });

  it('does not translate explicit PHP Laravel creation requests into NestJS', async () => {
    await expect(
      parseCreationIntent(
        'I want a PHP Laravel workspace for project management',
        'workspace',
        undefined,
        tempProjectPath
      )
    ).rejects.toMatchObject({
      name: 'UnsupportedCreationStackError',
      stackLabel: 'Laravel',
      capability: {
        lane: 'external-create-adopt',
        resolved: 'laravel',
        canExecuteCreate: false,
        fallbackLane: 'adopt-only',
      },
    });

    expect(mockSelectChatModels).not.toHaveBeenCalled();
  });

  it('does not translate WordPress creation requests into native scaffolds', async () => {
    await expect(
      parseCreationIntent(
        'Create a WordPress site for an editorial team',
        'workspace',
        undefined,
        tempProjectPath
      )
    ).rejects.toMatchObject({
      name: 'UnsupportedCreationStackError',
      stackLabel: 'WordPress',
      capability: {
        lane: 'external-create-adopt',
        resolved: 'wordpress-site',
        canExecuteCreate: false,
        fallbackLane: 'adopt-only',
      },
    });

    expect(mockSelectChatModels).not.toHaveBeenCalled();
  });

  it('does not translate generic PHP creation requests into native scaffolds', async () => {
    await expect(
      parseCreationIntent('Create a PHP workspace', 'workspace', undefined, tempProjectPath)
    ).rejects.toMatchObject({
      name: 'UnsupportedCreationStackError',
      stackLabel: 'PHP',
      capability: {
        lane: 'adopt-only',
        resolved: 'php',
        canExecuteCreate: false,
      },
    });

    expect(mockSelectChatModels).not.toHaveBeenCalled();
  });

  it('does not override an ambiguous product-domain model plan without stack evidence', async () => {
    const { plan, planSource } = await parseCreationIntent(
      'Build a workspace for a clothing store',
      'workspace',
      undefined,
      tempProjectPath,
      undefined,
      async () => ({
        modelId: 'test-model',
        text: JSON.stringify({
          workspaceName: 'clothing-store',
          profile: 'python-only',
          installMethod: 'auto',
          framework: 'fastapi',
          kit: 'fastapi.standard',
          projectName: 'clothing-api',
          suggestedModules: ['free/essentials/settings', 'free/database/db_postgres'],
          description: 'Clothing store backend.',
        }),
      })
    );

    expect(planSource).toBe('llm');
    expect(plan.profile).toBe('python-only');
    expect(plan.framework).toBe('fastapi');
    expect(plan.secondaryProject).toBeUndefined();
  });

  it('adds a stable frontend companion when full-stack intent is explicit and the model omits it', async () => {
    const { plan, planSource } = await parseCreationIntent(
      'Build a full-stack clothing store with an API connected to a frontend',
      'workspace',
      undefined,
      tempProjectPath,
      undefined,
      async () => ({
        modelId: 'test-model',
        text: JSON.stringify({
          workspaceName: 'clothing-store',
          profile: 'polyglot',
          installMethod: 'auto',
          framework: 'fastapi',
          kit: 'fastapi.standard',
          projectName: 'clothing-api',
          suggestedModules: ['free/essentials/settings', 'free/database/db_postgres'],
          description: 'Clothing store platform.',
        }),
      }),
      'polyglot'
    );

    expect(planSource).toBe('llm');
    expect(plan.profile).toBe('polyglot');
    expect(plan.framework).toBe('fastapi');
    expect(plan.secondaryProject?.framework).toBe('nextjs');
    expect(plan.secondaryProject?.kit).toBe('frontend.nextjs');
    expect(plan.secondaryProject?.projectName).toMatch(/-app$/);
  });

  it('injects workspace-installed module signals into AI creation prompt', async () => {
    const model = {
      id: 'gpt-4o',
      name: 'GPT-4o',
      sendRequest: vi.fn(async () => ({
        stream: (async function* () {
          yield new vscode.LanguageModelTextPart(
            JSON.stringify({
              workspaceName: 'reuse-suite',
              profile: 'python-only',
              installMethod: 'auto',
              framework: 'fastapi',
              kit: 'fastapi.standard',
              projectName: 'reuse-api',
              suggestedModules: ['free/cache/redis', 'free/essentials/settings'],
              description: 'Reuse redis module from sibling projects.',
            })
          );
        })(),
      })),
    };

    const sibling = path.join(tempProjectPath, 'billing-api');
    fs.mkdirSync(sibling, { recursive: true });
    fs.writeFileSync(
      path.join(sibling, 'registry.json'),
      JSON.stringify(
        {
          installed_modules: [
            {
              slug: 'free/cache/redis',
              version: '1.0.0',
              display_name: 'Redis',
            },
          ],
        },
        null,
        2
      )
    );

    mockGetModulesCatalog.mockResolvedValue({
      modules: [
        {
          id: 'redis',
          name: 'Redis',
          version: '1.0.0',
          category: 'cache',
          icon: 'x',
          description: 'Redis cache',
          status: 'stable',
          tags: ['cache'],
          slug: 'free/cache/redis',
        },
        {
          id: 'settings',
          name: 'Settings',
          version: '1.0.0',
          category: 'essentials',
          icon: 'x',
          description: 'Settings module',
          status: 'stable',
          tags: ['config'],
          slug: 'free/essentials/settings',
        },
      ],
      source: 'live',
      catalog: null,
    });
    mockSelectChatModels.mockResolvedValue([model]);

    await parseCreationIntent('Create a redis-backed api', 'workspace', 'fastapi', tempProjectPath);

    const sendRequestMock = model.sendRequest as unknown as {
      mock: { calls: Array<Array<Array<{ content?: string }>>> };
    };
    const systemPrompt = sendRequestMock.mock.calls[0]?.[0]?.[0]?.content ?? '';
    expect(systemPrompt).toContain('Installed modules already present in this workspace');
    expect(systemPrompt).toContain('free/cache/redis');
    expect(systemPrompt).toContain('billing-api');
  });

  it('sanitizes invalid AI creation fields and keeps only allowed module slugs', async () => {
    const model = {
      id: 'gpt-4o',
      name: 'GPT-4o',
      sendRequest: vi.fn(async () => ({
        stream: (async function* () {
          yield new vscode.LanguageModelTextPart(
            JSON.stringify({
              workspaceName: '%%% Weird Workspace ###',
              profile: 'random-profile',
              installMethod: 'invalid-install',
              framework: 'django',
              kit: 'nestjs.standard',
              projectName: '*** API ###',
              suggestedModules: [
                'free/essentials/settings',
                'unknown/foo/bar',
                'pro/billing/invoices',
                'not-a-slug',
              ],
              description: '   Build a robust billing API   ',
            })
          );
        })(),
      })),
    };

    mockGetModulesCatalog.mockResolvedValue({
      modules: [
        {
          id: 'settings',
          name: 'Settings',
          version: '1.0.0',
          category: 'essentials',
          icon: 'x',
          description: 'Settings module',
          status: 'stable',
          tags: [],
          slug: 'free/essentials/settings',
        },
        {
          id: 'invoices',
          name: 'Invoices',
          version: '2.3.0',
          category: 'billing',
          icon: 'x',
          description: 'Invoice workflows',
          status: 'stable',
          tags: ['payments'],
          slug: 'pro/billing/invoices',
        },
      ],
      source: 'live',
      catalog: null,
    });
    mockSelectChatModels.mockResolvedValue([model]);

    const { plan } = await parseCreationIntent(
      'Generate a billing service',
      'workspace',
      'fastapi',
      tempProjectPath
    );

    expect(plan.framework).toBe('fastapi');
    expect(plan.kit).toBe('fastapi.standard');
    expect(plan.profile).toBe('python-only');
    expect(plan.installMethod).toBe('auto');
    expect(plan.workspaceName).toBe('weird-workspace-wsp');
    expect(plan.projectName).toBe('api');
    expect(plan.suggestedModules).toEqual(['free/essentials/settings', 'pro/billing/invoices']);
    expect(plan.description).toBe('Build a robust billing API');
  });

  it('resolves legacy preferred model aliases to currently available models', async () => {
    mockPreferredModelGet.mockReturnValue('claude-3-7-sonnet');

    const legacyMappedModel = {
      id: 'anthropic.claude-sonnet-4-6',
      name: 'Claude Sonnet 4.6',
      sendRequest: vi.fn(),
    };

    mockSelectChatModels.mockResolvedValue([legacyMappedModel]);

    const selected = await selectModelWithPreference();

    expect(selected.model).toBe(legacyMappedModel);
    expect(selected.modelId).toBe('Claude Sonnet 4.6');
    expect(mockSelectChatModels).toHaveBeenCalledTimes(1);
  });

  it('returns java-only springboot plan with empty module list for spring projects', async () => {
    const model = {
      id: 'gpt-4o',
      name: 'GPT-4o',
      sendRequest: vi.fn(async () => ({
        stream: (async function* () {
          yield new vscode.LanguageModelTextPart(
            JSON.stringify({
              workspaceName: 'orders-platform',
              profile: 'java-only',
              installMethod: 'auto',
              framework: 'springboot',
              kit: 'springboot.standard',
              projectName: 'orders-service',
              suggestedModules: ['free/essentials/settings', 'free/cache/redis'],
              description: 'Spring Boot orders service.',
            })
          );
        })(),
      })),
    };

    mockGetModulesCatalog.mockResolvedValue({
      modules: [
        {
          id: 'settings',
          name: 'Settings',
          version: '1.0.0',
          category: 'essentials',
          icon: 'x',
          description: 'Settings module',
          status: 'stable',
          tags: [],
          slug: 'free/essentials/settings',
        },
      ],
      source: 'live',
      catalog: null,
    });
    mockSelectChatModels.mockResolvedValue([model]);

    const { plan } = await parseCreationIntent(
      'Create a spring boot orders service',
      'project',
      'springboot',
      tempProjectPath
    );

    expect(plan.framework).toBe('springboot');
    expect(plan.kit).toBe('springboot.standard');
    expect(plan.profile).toBe('java-only');
    expect(plan.suggestedModules).toEqual([]);
  });

  it('auto-corrects near-miss module slug typos in AI creation output', async () => {
    const model = {
      id: 'gpt-4o',
      name: 'GPT-4o',
      sendRequest: vi.fn(async () => ({
        stream: (async function* () {
          yield new vscode.LanguageModelTextPart(
            JSON.stringify({
              workspaceName: 'catalog',
              profile: 'python-only',
              installMethod: 'auto',
              framework: 'fastapi',
              kit: 'fastapi.standard',
              projectName: 'catalog-api',
              suggestedModules: ['free/security/rate-limitng'],
              description: 'Catalog API with rate limiting.',
            })
          );
        })(),
      })),
    };

    mockGetModulesCatalog.mockResolvedValue({
      modules: [
        {
          id: 'rate_limiting',
          name: 'Rate Limiting',
          version: '1.0.0',
          category: 'security',
          icon: 'x',
          description: 'Rate limiter module',
          status: 'stable',
          tags: [],
          slug: 'free/security/rate_limiting',
        },
        {
          id: 'settings',
          name: 'Settings',
          version: '1.0.0',
          category: 'essentials',
          icon: 'x',
          description: 'Settings module',
          status: 'stable',
          tags: [],
          slug: 'free/essentials/settings',
        },
      ],
      source: 'live',
      catalog: null,
    });
    mockSelectChatModels.mockResolvedValue([model]);

    const { plan } = await parseCreationIntent(
      'Create a catalog api with throttling',
      'workspace',
      'fastapi',
      tempProjectPath
    );

    expect(plan.suggestedModules).toContain('free/security/rate_limiting');
    expect(plan.suggestedModules).toContain('free/essentials/settings');
  });

  it('uses response.text when stream is empty and marks heuristic fallback on invalid JSON', async () => {
    const model = {
      id: 'gpt-4o',
      name: 'GPT-4o',
      sendRequest: vi.fn(async () => ({
        stream: (async function* () {
          // Some providers return no stream chunks.
        })(),
        text: (async function* () {
          yield 'not-json';
        })(),
      })),
    };

    mockGetModulesCatalog.mockResolvedValue({
      modules: [
        {
          id: 'settings',
          name: 'Settings',
          version: '1.0.0',
          category: 'essentials',
          icon: 'x',
          description: 'Settings module',
          status: 'stable',
          tags: [],
          slug: 'free/essentials/settings',
        },
        {
          id: 'stripe_payment',
          name: 'Stripe Payment',
          version: '1.0.0',
          category: 'billing',
          icon: 'x',
          description: 'Stripe billing module',
          status: 'stable',
          tags: [],
          slug: 'free/billing/stripe_payment',
        },
        {
          id: 'db_postgres',
          name: 'Db Postgres',
          version: '1.0.0',
          category: 'database',
          icon: 'x',
          description: 'PostgreSQL module',
          status: 'stable',
          tags: [],
          slug: 'free/database/db_postgres',
        },
      ],
      source: 'live',
      catalog: null,
    });
    mockSelectChatModels.mockResolvedValue([model]);

    const { plan, planSource } = await parseCreationIntent(
      'NestJS SaaS with Stripe payments and PostgreSQL',
      'workspace',
      undefined,
      tempProjectPath
    );

    expect(planSource).toBe('heuristic');
    expect(plan.framework).toBe('nestjs');
    expect(plan.suggestedModules).toEqual(
      expect.arrayContaining([
        'free/essentials/settings',
        'free/billing/stripe_payment',
        'free/database/db_postgres',
      ])
    );
  });

  it('parses AI creation plans through an injected provider', async () => {
    mockGetModulesCatalog.mockResolvedValue({
      modules: [
        {
          id: 'settings',
          name: 'Settings',
          version: '1.0.0',
          category: 'essentials',
          icon: 'x',
          description: 'Settings module',
          status: 'stable',
          tags: [],
          slug: 'free/essentials/settings',
        },
      ],
      source: 'live',
      catalog: null,
    });

    const provider = vi.fn(async () => ({
      modelId: 'openai-compatible',
      text: JSON.stringify({
        workspaceName: 'custom-provider-saas',
        profile: 'enterprise',
        installMethod: 'auto',
        framework: 'nestjs',
        kit: 'nestjs.standard',
        projectName: 'billing-api',
        suggestedModules: ['free/essentials/settings'],
        description: 'SaaS billing workspace from custom provider.',
      }),
    }));

    const { plan, modelId, planSource } = await parseCreationIntent(
      'Create an enterprise NestJS billing SaaS',
      'workspace',
      undefined,
      tempProjectPath,
      undefined,
      provider
    );

    expect(provider).toHaveBeenCalledTimes(1);
    expect(modelId).toBe('openai-compatible');
    expect(planSource).toBe('llm');
    expect(plan.framework).toBe('nestjs');
    expect(plan.profile).toBe('enterprise');
    expect(plan.projectName).toBe('billing-api');
  });
});

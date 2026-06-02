import { useMemo, useState } from 'react';
import {
  Activity,
  Archive,
  Boxes,
  CheckCircle2,
  ChevronDown,
  Copy,
  FolderOpen,
  GitBranch,
  HeartPulse,
  Package as PackageIcon,
  PanelTopOpen,
  Play,
  Rocket,
  Settings,
  Terminal,
} from 'lucide-react';
import { vscode } from '@/vscode';

interface Command {
  code: string;
  description: string;
}

interface CommandCategory {
  id: string;
  title: string;
  icon: any;
  count: number;
  commands: Command[];
}

interface CommandAction {
  id: string;
  title: string;
  detail: string;
  icon: any;
  command: string;
  requiresWorkspace?: boolean;
  tone?: 'primary' | 'default';
}

interface WorkflowRow {
  title: string;
  detail: string;
  action: CommandAction;
}

type WorkspaceProfile =
  | 'minimal'
  | 'python-only'
  | 'node-only'
  | 'go-only'
  | 'java-only'
  | 'polyglot'
  | 'enterprise';

interface CommandReferenceProps {
  workspaceProfile?: WorkspaceProfile;
  hasActiveWorkspace?: boolean;
  workspaceName?: string;
}

function simplifyCommandForDisplay(command: string): string {
  const compact = command.trim().replace(/\s+/g, ' ');
  if (!compact) {
    return compact;
  }

  return compact
    .replace(/^npx\s+--yes\s+--package\s+rapidkit\s+rapidkit\b/i, 'rapidkit')
    .replace(/^npx\s+rapidkit\b/i, 'rapidkit')
    .trim();
}

function buildWorkspaceCommands(profile: WorkspaceProfile): Command[] {
  const common: Command[] = [
    {
      code: 'npx --yes --package rapidkit rapidkit create workspace my-workspace --yes --profile polyglot',
      description: 'Create a workspace with explicit profile',
    },
    {
      code: `npx --yes --package rapidkit rapidkit bootstrap --profile ${profile}`,
      description: `Bootstrap runtimes for the active profile (${profile})`,
    },
    {
      code: 'npx --yes --package rapidkit rapidkit init',
      description: 'Initialize workspace files and project dependencies',
    },
    {
      code: 'npx --yes --package rapidkit rapidkit doctor workspace',
      description: 'Run workspace health checks',
    },
    {
      code: 'npx --yes --package rapidkit rapidkit cache status',
      description: 'Inspect workspace cache policy and status',
    },
    {
      code: 'npx --yes --package rapidkit rapidkit mirror status',
      description: 'Inspect mirror and offline artifact status',
    },
  ];

  const runtimeByProfile: Record<WorkspaceProfile, Command[]> = {
    'go-only': [
      {
        code: 'npx --yes --package rapidkit rapidkit setup go --warm-deps',
        description: 'Validate Go runtime and pre-warm module dependencies',
      },
    ],
    'java-only': [
      {
        code: 'npx --yes --package rapidkit rapidkit setup java --warm-deps',
        description: 'Validate Java runtime and pre-warm build dependencies',
      },
    ],
    'node-only': [
      {
        code: 'npx --yes --package rapidkit rapidkit setup node --warm-deps',
        description: 'Validate Node runtime and pre-warm dependency cache',
      },
    ],
    'python-only': [
      {
        code: 'npx --yes --package rapidkit rapidkit setup python',
        description: 'Validate Python runtime prerequisites',
      },
    ],
    polyglot: [
      {
        code: 'npx --yes --package rapidkit rapidkit setup python',
        description: 'Validate Python runtime prerequisites',
      },
      {
        code: 'npx --yes --package rapidkit rapidkit setup node --warm-deps',
        description: 'Validate Node runtime and pre-warm dependency cache',
      },
      {
        code: 'npx --yes --package rapidkit rapidkit setup go --warm-deps',
        description: 'Validate Go runtime and pre-warm module dependencies',
      },
      {
        code: 'npx --yes --package rapidkit rapidkit setup java --warm-deps',
        description: 'Validate Java runtime and pre-warm Maven/Gradle dependencies',
      },
    ],
    enterprise: [
      {
        code: 'npx --yes --package rapidkit rapidkit setup python',
        description: 'Validate Python runtime prerequisites',
      },
      {
        code: 'npx --yes --package rapidkit rapidkit setup node --warm-deps',
        description: 'Validate Node runtime and pre-warm dependency cache',
      },
      {
        code: 'npx --yes --package rapidkit rapidkit setup go --warm-deps',
        description: 'Validate Go runtime and pre-warm module dependencies',
      },
      {
        code: 'npx --yes --package rapidkit rapidkit setup java --warm-deps',
        description: 'Validate Java runtime and pre-warm Maven/Gradle dependencies',
      },
      {
        code: 'npx --yes --package rapidkit rapidkit mirror verify',
        description: 'Verify mirrored artifacts and policy compliance',
      },
    ],
    minimal: [
      {
        code: 'npx --yes --package rapidkit rapidkit setup python',
        description: 'Validate Python runtime prerequisites',
      },
    ],
  };

  return [...common, ...runtimeByProfile[profile]];
}

function buildCategories(profile: WorkspaceProfile): CommandCategory[] {
  const workspaceCommands = buildWorkspaceCommands(profile);
  const devCommands: Command[] = [
    {
      code: 'npx --yes --package rapidkit rapidkit doctor workspace --fix',
      description: 'Run doctor with safe auto-fixes',
    },
    {
      code: 'npx --yes --package rapidkit rapidkit --version',
      description: 'Show RapidKit CLI version',
    },
    {
      code: 'npx --yes --package rapidkit rapidkit --help',
      description: 'Display all available commands',
    },
    {
      code: 'npx --yes --package rapidkit rapidkit mirror sync',
      description: 'Sync mirror artifacts for controlled environments',
    },
    {
      code: 'npx --yes --package rapidkit rapidkit mirror verify',
      description: 'Verify mirrored artifacts and policy compliance',
    },
  ];

  return [
    {
      id: 'workspace',
      title: 'Workspace',
      icon: FolderOpen,
      count: workspaceCommands.length,
      commands: workspaceCommands,
    },
    {
      id: 'project',
      title: 'Project',
      icon: Rocket,
      count: 7,
      commands: [
        {
          code: 'npx --yes --package rapidkit rapidkit create project fastapi.standard my-api --output .',
          description: 'Create FastAPI Standard project in current workspace',
        },
        {
          code: 'npx --yes --package rapidkit rapidkit create project fastapi.ddd my-ddd-api --output .',
          description: 'Create FastAPI DDD project with clean architecture',
        },
        {
          code: 'npx --yes --package rapidkit rapidkit create project nestjs.standard my-service --output .',
          description: 'Create NestJS project in current workspace',
        },
        {
          code: 'npx --yes --package rapidkit rapidkit create project gofiber.standard my-go-service --output .',
          description: 'Create Go/Fiber project in current workspace',
        },
        {
          code: 'npx --yes --package rapidkit rapidkit create project springboot.standard my-spring-service --output .',
          description: 'Create Spring Boot project in current workspace',
        },
        {
          code: 'npx --yes --package rapidkit rapidkit create project springboot.standard billing-api --output ~/projects',
          description: 'Create standalone Spring Boot project at custom location',
        },
        {
          code: 'npx --yes --package rapidkit rapidkit init && npx --yes --package rapidkit rapidkit dev',
          description: 'Initialize dependencies and start development server',
        },
      ],
    },
    {
      id: 'module',
      title: 'Module',
      icon: PackageIcon,
      count: 5,
      commands: [
        {
          code: 'npx --yes --package rapidkit rapidkit add module auth_core',
          description: 'Password hashing, token signing, and runtime auth',
        },
        {
          code: 'npx --yes --package rapidkit rapidkit add module db_postgres',
          description: 'SQLAlchemy async Postgres with DI and health checks',
        },
        {
          code: 'npx --yes --package rapidkit rapidkit add module redis',
          description: 'Redis runtime with async and sync client',
        },
        {
          code: 'npx --yes --package rapidkit rapidkit add module email',
          description: 'Email delivery with SMTP support',
        },
        {
          code: 'npx --yes --package rapidkit rapidkit add module storage',
          description: 'File storage and media management',
        },
      ],
    },
    {
      id: 'dev',
      title: 'Development',
      icon: Settings,
      count: devCommands.length,
      commands: devCommands,
    },
  ];
}

export function CommandReference({
  workspaceProfile = 'minimal',
  hasActiveWorkspace = false,
  workspaceName,
}: CommandReferenceProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['workspace']));
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const categories = useMemo(() => buildCategories(workspaceProfile), [workspaceProfile]);

  const actions: CommandAction[] = [
    {
      id: 'create',
      title: 'Create',
      detail: 'New workspace',
      icon: Rocket,
      command: 'openWorkspaceModal',
      tone: 'primary',
    },
    {
      id: 'import',
      title: 'Import',
      detail: 'Folder or archive',
      icon: FolderOpen,
      command: 'importWorkspace',
    },
    {
      id: 'doctor',
      title: 'Doctor',
      detail: 'Readiness scan',
      icon: HeartPulse,
      command: 'checkWorkspaceHealth',
      requiresWorkspace: true,
    },
    {
      id: 'test',
      title: 'Test',
      detail: 'Safe run',
      icon: Play,
      command: 'workspaceRunTest',
      requiresWorkspace: true,
    },
    {
      id: 'contract',
      title: 'Graph',
      detail: 'Services, ports',
      icon: GitBranch,
      command: 'workspaceContractGraph',
      requiresWorkspace: true,
    },
    {
      id: 'archive',
      title: 'Archive',
      detail: 'Share safely',
      icon: Archive,
      command: 'workspaceArchive',
    },
    {
      id: 'terminal',
      title: 'Terminal',
      detail: 'Workspace root',
      icon: Terminal,
      command: 'workspaceTerminal',
      requiresWorkspace: true,
    },
    {
      id: 'release',
      title: 'Release',
      detail: 'Autopilot gate',
      icon: Activity,
      command: 'workspaceAutopilotRelease',
      requiresWorkspace: true,
    },
  ];

  const nextRows: WorkflowRow[] = hasActiveWorkspace
    ? [
        {
          title: 'Prove workspace health',
          detail: 'Run doctor before changing or sharing the workspace.',
          action: actions[2],
        },
        {
          title: 'Inspect topology',
          detail: 'Open service graph, port ownership, dependencies, APIs, and events.',
          action: actions[4],
        },
        {
          title: 'Validate execution',
          detail: 'Run the selected workspace test path with guardrails.',
          action: actions[3],
        },
        {
          title: 'Prepare handoff',
          detail: 'Create or inspect a portable archive before sharing.',
          action: actions[5],
        },
      ]
    : [
        {
          title: 'Create a workspace',
          detail: 'Start with a deterministic profile and a clean local contract.',
          action: actions[0],
        },
        {
          title: 'Import existing work',
          detail: 'Open a folder, local archive, or remote archive URL.',
          action: actions[1],
        },
        {
          title: 'Doctor an archive',
          detail: 'Check integrity before importing shared workspace assets.',
          action: {
            id: 'archive-doctor',
            title: 'Doctor Archive',
            detail: 'Verify first',
            icon: Archive,
            command: 'workspaceArchiveDoctor',
          },
        },
      ];

  const workflowRows: WorkflowRow[] = [
    {
      title: 'Workspace handoff',
      detail: 'Export, verify, doctor, and hydrate portable workspace archives.',
      action: actions[5],
    },
    {
      title: 'Contract registry',
      detail: 'Keep service ownership, ports, APIs, events, and dependencies explicit.',
      action: actions[4],
    },
    {
      title: 'Release safety',
      detail: 'Use workspace tests and autopilot gates before publish or delivery.',
      action: actions[7],
    },
    {
      title: 'Operator loop',
      detail: 'Doctor, terminal, policy, and mirror checks from one consistent surface.',
      action: actions[6],
    },
  ];

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  const copyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    setCopiedCommand(command);
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  const runAction = (action: CommandAction) => {
    if (action.requiresWorkspace && !hasActiveWorkspace) {
      vscode.postMessage('openWorkspaceModal');
      return;
    }
    vscode.postMessage(action.command);
  };

  const renderActionButton = (action: CommandAction) => {
    const Icon = action.icon;
    const disabled = action.requiresWorkspace && !hasActiveWorkspace;

    return (
      <button
        key={action.id}
        type="button"
        onClick={() => runAction(action)}
        title={disabled ? 'Select a workspace first' : action.detail}
        style={{
          display: 'grid',
          gridTemplateColumns: '18px minmax(0, 1fr)',
          alignItems: 'center',
          gap: '7px',
          minHeight: '36px',
          border: `1px solid ${
            action.tone === 'primary' ? 'var(--vscode-focusBorder)' : 'var(--vscode-panel-border)'
          }`,
          borderRadius: '6px',
          padding: '7px 9px',
          background:
            action.tone === 'primary'
              ? 'var(--vscode-button-background)'
              : 'var(--vscode-button-secondaryBackground)',
          color:
            action.tone === 'primary'
              ? 'var(--vscode-button-foreground)'
              : 'var(--vscode-button-secondaryForeground)',
          cursor: 'pointer',
          opacity: disabled ? 0.55 : 1,
          textAlign: 'left',
        }}
      >
        <Icon size={15} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '12px', fontWeight: 700 }}>
            {action.title}
          </span>
          <span
            style={{
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: '10.5px',
              color:
                action.tone === 'primary'
                  ? 'var(--vscode-button-foreground)'
                  : 'var(--vscode-descriptionForeground)',
            }}
          >
            {disabled ? 'Select workspace' : action.detail}
          </span>
        </span>
      </button>
    );
  };

  return (
    <div className="section command-reference">
      <div
        style={{
          display: 'grid',
          gap: '12px',
          border: '1px solid var(--vscode-panel-border)',
          borderRadius: '8px',
          background: 'var(--vscode-editor-background)',
          padding: '12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            minWidth: 0,
          }}
        >
          <PanelTopOpen size={17} style={{ color: 'var(--vscode-focusBorder)' }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <strong style={{ fontSize: '13px' }}>Command Center</strong>
              <span className="ws-tag ws-tag--profile">{workspaceProfile}</span>
            </div>
            <div
              style={{
                marginTop: '2px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: '11px',
                color: 'var(--vscode-descriptionForeground)',
              }}
            >
              {hasActiveWorkspace && workspaceName
                ? `Workspace: ${workspaceName}`
                : 'No workspace selected. Start with Create or Import.'}
            </div>
          </div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              border: '1px solid var(--vscode-panel-border)',
              borderRadius: '999px',
              padding: '3px 8px',
              fontSize: '11px',
              color: 'var(--vscode-descriptionForeground)',
            }}
          >
            <CheckCircle2 size={13} />
            Guided
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))',
            gap: '7px',
          }}
        >
          {actions.map(renderActionButton)}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 0.95fr)',
            gap: '10px',
          }}
        >
          <div
            style={{
              border: '1px solid var(--vscode-panel-border)',
              borderRadius: '7px',
              overflow: 'hidden',
              background: 'var(--vscode-editor-inactiveSelectionBackground)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '8px 10px',
                borderBottom: '1px solid var(--vscode-panel-border)',
                fontSize: '12px',
                fontWeight: 700,
              }}
            >
              <Activity size={14} />
              Next best actions
            </div>
            <div style={{ display: 'grid' }}>
              {nextRows.map((row) => (
                <button
                  key={row.title}
                  type="button"
                  onClick={() => runAction(row.action)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                    gap: '10px',
                    alignItems: 'center',
                    border: 0,
                    borderBottom: '1px solid var(--vscode-panel-border)',
                    padding: '8px 10px',
                    background: 'transparent',
                    color: 'var(--vscode-foreground)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '12px', fontWeight: 700 }}>
                      {row.title}
                    </span>
                    <span
                      style={{
                        display: 'block',
                        marginTop: '2px',
                        fontSize: '11px',
                        color: 'var(--vscode-descriptionForeground)',
                      }}
                    >
                      {row.detail}
                    </span>
                  </span>
                  <span className="ws-tag">{row.action.title}</span>
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              border: '1px solid var(--vscode-panel-border)',
              borderRadius: '7px',
              overflow: 'hidden',
              background: 'var(--vscode-editor-inactiveSelectionBackground)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '8px 10px',
                borderBottom: '1px solid var(--vscode-panel-border)',
                fontSize: '12px',
                fontWeight: 700,
              }}
            >
              <Boxes size={14} />
              Enterprise workflows
            </div>
            <div style={{ display: 'grid' }}>
              {workflowRows.map((row) => {
                const Icon = row.action.icon;
                return (
                  <button
                    key={row.title}
                    type="button"
                    onClick={() => runAction(row.action)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '17px minmax(0, 1fr)',
                      gap: '8px',
                      alignItems: 'start',
                      border: 0,
                      borderBottom: '1px solid var(--vscode-panel-border)',
                      padding: '8px 10px',
                      background: 'transparent',
                      color: 'var(--vscode-foreground)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <Icon
                      size={14}
                      style={{ marginTop: '1px', color: 'var(--vscode-focusBorder)' }}
                    />
                    <span>
                      <span style={{ display: 'block', fontSize: '12px', fontWeight: 700 }}>
                        {row.title}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          marginTop: '2px',
                          fontSize: '11px',
                          color: 'var(--vscode-descriptionForeground)',
                          lineHeight: 1.35,
                        }}
                      >
                        {row.detail}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            <Terminal size={14} />
            CLI Reference
          </div>

          {categories.map((category) => {
            const Icon = category.icon;
            const isExpanded = expandedCategories.has(category.id);

            return (
              <div key={category.id} className="command-category" style={{ marginBottom: 0 }}>
                <div
                  className={`category-header ${isExpanded ? 'expanded' : ''}`}
                  onClick={() => toggleCategory(category.id)}
                  style={{ padding: '8px 10px', borderRadius: isExpanded ? '6px 6px 0 0' : '6px' }}
                >
                  <div className="category-title" style={{ fontSize: '12px' }}>
                    <Icon size={14} className="category-icon-lucide" />
                    <span>{category.title}</span>
                    <span className="category-count">{category.count}</span>
                  </div>
                  <ChevronDown
                    size={15}
                    className="category-toggle"
                    style={{
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                    }}
                  />
                </div>
                <div className={`category-content ${isExpanded ? 'expanded' : ''}`}>
                  <div className="command-list" style={{ padding: '8px', gap: '7px' }}>
                    {category.commands.map((cmd) => (
                      <div key={cmd.code} className="command-item" style={{ padding: '8px' }}>
                        <div className="command-header" style={{ marginBottom: '6px' }}>
                          <div className="command-code" title={cmd.code}>
                            {simplifyCommandForDisplay(cmd.code)}
                          </div>
                          <button
                            className={`command-copy-btn ${
                              copiedCommand === cmd.code ? 'copied' : ''
                            }`}
                            onClick={() => copyCommand(cmd.code)}
                            title="Copy command"
                          >
                            {copiedCommand === cmd.code ? (
                              <>Copied</>
                            ) : (
                              <>
                                <Copy size={12} /> Copy
                              </>
                            )}
                          </button>
                        </div>
                        <div className="command-desc">{cmd.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

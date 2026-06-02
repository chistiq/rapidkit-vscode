import { useState } from 'react';
import {
  Copy,
  ChevronDown,
  FolderOpen,
  Rocket,
  Package as PackageIcon,
  Settings,
  Activity,
  Archive,
  GitBranch,
  HeartPulse,
  Play,
  Share2,
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

interface OperationAction {
  title: string;
  detail: string;
  icon: any;
  command: string;
  requiresWorkspace?: boolean;
}

interface WorkflowStep {
  title: string;
  detail: string;
  command: string;
  requiresWorkspace?: boolean;
}

interface IntentCommand {
  intent: string;
  useWhen: string;
  primary: string;
  commands: string[];
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
      description: 'Create a workspace with explicit profile (recommended canonical form)',
    },
    {
      code: `npx --yes --package rapidkit rapidkit bootstrap --profile ${profile}`,
      description: `Sync and bootstrap runtimes for the active profile (${profile})`,
    },
    {
      code: 'npx --yes --package rapidkit rapidkit init',
      description:
        'Full init (workspace + projects). Mirror aliases at workspace root: `workspace init` and `workspace run init`.',
    },
    {
      code: 'npx --yes --package rapidkit rapidkit doctor workspace',
      description: 'Run workspace health checks (canonical doctor contract)',
    },
    {
      code: 'npx --yes --package rapidkit rapidkit cache status',
      description: 'Inspect workspace cache policy and status',
    },
    {
      code: 'npx --yes --package rapidkit rapidkit mirror status',
      description: 'Inspect mirror/offline artifact status',
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
        description: 'Verify mirrored artifacts and policy compliance (enterprise)',
      },
    ],
    minimal: [
      {
        code: 'npx --yes --package rapidkit rapidkit setup python',
        description: 'Validate Python runtime prerequisites (optional for minimal)',
      },
    ],
  };

  return [...common, ...runtimeByProfile[profile]];
}

export function CommandReference({
  workspaceProfile = 'minimal',
  hasActiveWorkspace = false,
  workspaceName,
}: CommandReferenceProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['workspace']));
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const operationActions: OperationAction[] = [
    {
      title: 'Create',
      detail: 'Start a new workspace',
      icon: Rocket,
      command: 'openWorkspaceModal',
    },
    {
      title: 'Import',
      detail: 'Folder, local archive, or remote archive',
      icon: FolderOpen,
      command: 'importWorkspace',
    },
    {
      title: 'Health',
      detail: 'Doctor checks and fixes',
      icon: HeartPulse,
      command: 'checkWorkspaceHealth',
      requiresWorkspace: true,
    },
    {
      title: 'Run',
      detail: 'Test/build/start selected workspace',
      icon: Play,
      command: 'workspaceRunTest',
      requiresWorkspace: true,
    },
    {
      title: 'Contract',
      detail: 'Service topology and ports',
      icon: GitBranch,
      command: 'workspaceContractGraph',
      requiresWorkspace: true,
    },
    {
      title: 'Archive',
      detail: 'Inspect, verify, or doctor archive',
      icon: Archive,
      command: 'workspaceArchive',
    },
    {
      title: 'Terminal',
      detail: 'Open at workspace root',
      icon: Terminal,
      command: 'workspaceTerminal',
      requiresWorkspace: true,
    },
    {
      title: 'Release',
      detail: 'Autopilot release gate',
      icon: Activity,
      command: 'workspaceAutopilotRelease',
      requiresWorkspace: true,
    },
  ];

  const guidedSteps: WorkflowStep[] = [
    {
      title: 'Create or import a workspace',
      detail: 'Start from a new workspace, an existing folder, or a verified archive.',
      command: hasActiveWorkspace ? 'importWorkspace' : 'openWorkspaceModal',
    },
    {
      title: 'Run doctor',
      detail: 'Check local tools, workspace files, and project readiness.',
      command: 'checkWorkspaceHealth',
      requiresWorkspace: true,
    },
    {
      title: 'Initialize contract graph',
      detail: 'Create or verify the service contract for topology, ports, APIs, and events.',
      command: 'workspaceContract',
      requiresWorkspace: true,
    },
    {
      title: 'Run workspace tests',
      detail: 'Execute the workspace test stage with safety gates.',
      command: 'workspaceRunTest',
      requiresWorkspace: true,
    },
    {
      title: 'Share safely',
      detail: 'Export a full archive or diagnose an incoming archive before import.',
      command: 'workspaceArchive',
    },
  ];

  const intentCommands: IntentCommand[] = [
    {
      intent: 'Share a workspace with a teammate',
      useWhen: 'You need a portable handoff or remote import.',
      primary: 'Workspace Archive',
      commands: [
        'rapidkit workspace export --output team.rapidkit-archive.zip',
        'rapidkit workspace archive doctor team.rapidkit-archive.zip',
        'rapidkit workspace hydrate team.rapidkit-archive.zip --output ./team',
      ],
    },
    {
      intent: 'Understand services and ports',
      useWhen: 'You need topology, dependencies, APIs, events, or port conflict visibility.',
      primary: 'Contract Graph',
      commands: [
        'rapidkit workspace contract init',
        'rapidkit workspace contract verify --strict',
        'rapidkit workspace contract graph',
      ],
    },
    {
      intent: 'Run the workspace safely',
      useWhen: 'You want affected/blast-radius execution instead of ad hoc scripts.',
      primary: 'Workspace Run',
      commands: [
        'rapidkit workspace run test --affected --blast-radius',
        'rapidkit workspace run build --strict',
        'rapidkit autopilot release --mode enforce',
      ],
    },
    {
      intent: 'Prepare enterprise/offline workflows',
      useWhen: 'You need cache, mirror, policy, and reproducible setup checks.',
      primary: 'Governance',
      commands: [
        'rapidkit bootstrap --profile enterprise',
        'rapidkit mirror sync',
        'rapidkit mirror verify',
        'rapidkit workspace policy show',
      ],
    },
  ];

  const workspaceCommands = buildWorkspaceCommands(workspaceProfile);
  const devCommands: Command[] = [
    {
      code: 'npx --yes --package rapidkit rapidkit doctor workspace --fix',
      description: 'Run doctor with safe auto-fixes for workspace issues',
    },
    {
      code: 'npx --yes --package rapidkit rapidkit --version',
      description: 'Show RapidKit CLI version',
    },
    {
      code: 'npx --yes --package rapidkit rapidkit --help',
      description: 'Display all available commands and options',
    },
    {
      code: 'npx --yes --package rapidkit rapidkit mirror sync',
      description: 'Sync mirror artifacts for offline/controlled environments',
    },
    {
      code: 'npx --yes --package rapidkit rapidkit mirror verify',
      description: 'Verify mirrored artifacts and policy compliance',
    },
  ];

  const categories: CommandCategory[] = [
    {
      id: 'workspace',
      title: 'Workspace Commands',
      icon: FolderOpen,
      count: workspaceCommands.length,
      commands: workspaceCommands,
    },
    {
      id: 'project',
      title: 'Project Commands',
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
      title: 'Module Commands',
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
      title: 'Development & Utilities',
      icon: Settings,
      count: devCommands.length,
      commands: devCommands,
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

  const runAction = (action: OperationAction | WorkflowStep) => {
    if (action.requiresWorkspace && !hasActiveWorkspace) {
      vscode.postMessage('openWorkspaceModal');
      return;
    }
    vscode.postMessage(action.command);
  };

  return (
    <div className="section command-reference">
      <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Copy size={18} style={{ color: '#6C5CE7' }} />
        Command Reference
        {hasActiveWorkspace ? (
          <span
            className="ws-tag ws-tag--profile"
            style={{ marginLeft: '6px' }}
            title="Commands are filtered by the active workspace profile"
          >
            {workspaceProfile}
          </span>
        ) : (
          <span
            className="ws-tag"
            style={{ marginLeft: '6px' }}
            title="Select a workspace to see profile-specific command suggestions"
          >
            Select workspace
          </span>
        )}
      </div>

      {!hasActiveWorkspace && (
        <div
          className="command-hint"
          style={{
            marginTop: '8px',
            marginBottom: '10px',
            padding: '8px 10px',
            borderRadius: '6px',
            border: '1px solid var(--vscode-panel-border)',
            background: 'var(--vscode-editor-inactiveSelectionBackground)',
            fontSize: '11px',
            color: 'var(--vscode-descriptionForeground)',
          }}
        >
          💡 To see profile-specific commands, select a workspace from the{' '}
          <strong style={{ color: 'var(--vscode-foreground)' }}>WORKSPACES</strong> sidebar panel
          first.
        </div>
      )}

      {hasActiveWorkspace && workspaceName && (
        <div
          style={{
            marginTop: '8px',
            marginBottom: '10px',
            fontSize: '11px',
            color: 'var(--vscode-descriptionForeground)',
          }}
        >
          Workspace: <strong style={{ color: 'var(--vscode-foreground)' }}>{workspaceName}</strong>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '8px',
          margin: '12px 0',
        }}
      >
        {operationActions.map((action) => {
          const Icon = action.icon;
          const disabled = action.requiresWorkspace && !hasActiveWorkspace;
          return (
            <button
              key={action.command}
              type="button"
              onClick={() => runAction(action)}
              title={disabled ? 'Select a workspace first' : action.detail}
              style={{
                border: '1px solid var(--vscode-panel-border)',
                borderRadius: '6px',
                padding: '9px',
                textAlign: 'left',
                background: disabled
                  ? 'var(--vscode-editor-inactiveSelectionBackground)'
                  : 'var(--vscode-button-secondaryBackground)',
                color: 'var(--vscode-foreground)',
                cursor: 'pointer',
                minHeight: '74px',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                <Icon size={14} />
                {action.title}
              </span>
              <span
                style={{
                  display: 'block',
                  marginTop: '6px',
                  fontSize: '11px',
                  color: 'var(--vscode-descriptionForeground)',
                  lineHeight: 1.35,
                }}
              >
                {disabled ? 'Select workspace first' : action.detail}
              </span>
            </button>
          );
        })}
      </div>

      <div
        style={{
          margin: '10px 0',
          padding: '10px',
          border: '1px solid var(--vscode-panel-border)',
          borderRadius: '6px',
          background: 'var(--vscode-editor-inactiveSelectionBackground)',
        }}
      >
        <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>
          Professional start path
        </div>
        <div style={{ display: 'grid', gap: '6px' }}>
          {guidedSteps.map((step, index) => (
            <button
              key={step.title}
              type="button"
              onClick={() => runAction(step)}
              style={{
                display: 'grid',
                gridTemplateColumns: '22px 1fr',
                gap: '8px',
                alignItems: 'start',
                border: '1px solid transparent',
                borderRadius: '6px',
                padding: '7px',
                background: 'transparent',
                color: 'var(--vscode-foreground)',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--vscode-badge-background)',
                  color: 'var(--vscode-badge-foreground)',
                  fontSize: '11px',
                  fontWeight: 700,
                }}
              >
                {index + 1}
              </span>
              <span>
                <span style={{ display: 'block', fontSize: '12px', fontWeight: 700 }}>
                  {step.title}
                </span>
                <span
                  style={{
                    display: 'block',
                    marginTop: '2px',
                    fontSize: '11px',
                    color: 'var(--vscode-descriptionForeground)',
                  }}
                >
                  {step.requiresWorkspace && !hasActiveWorkspace
                    ? 'Select a workspace first.'
                    : step.detail}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gap: '8px', margin: '10px 0 12px' }}>
        {intentCommands.map((item) => (
          <div
            key={item.intent}
            style={{
              border: '1px solid var(--vscode-panel-border)',
              borderRadius: '6px',
              padding: '9px',
              background: 'var(--vscode-editor-background)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Share2 size={13} />
              <strong style={{ fontSize: '12px' }}>{item.intent}</strong>
              <span className="ws-tag" style={{ marginLeft: 'auto' }}>
                {item.primary}
              </span>
            </div>
            <div
              style={{
                marginTop: '4px',
                fontSize: '11px',
                color: 'var(--vscode-descriptionForeground)',
              }}
            >
              {item.useWhen}
            </div>
            <div style={{ marginTop: '7px', display: 'grid', gap: '4px' }}>
              {item.commands.map((command) => (
                <button
                  key={command}
                  type="button"
                  onClick={() => copyCommand(command)}
                  className="command-copy-btn"
                  style={{
                    justifyContent: 'space-between',
                    width: '100%',
                    fontFamily: 'var(--vscode-editor-font-family)',
                  }}
                >
                  <span>{simplifyCommandForDisplay(command)}</span>
                  <Copy size={12} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {categories.map((category) => {
        const Icon = category.icon;
        const isExpanded = expandedCategories.has(category.id);

        return (
          <div key={category.id} className="command-category">
            <div
              className={`category-header ${isExpanded ? 'expanded' : ''}`}
              onClick={() => toggleCategory(category.id)}
            >
              <div className="category-title">
                <Icon size={16} className="category-icon-lucide" />
                <span>{category.title}</span>
                <span className="category-count">{category.count}</span>
              </div>
              <ChevronDown
                size={16}
                className="category-toggle"
                style={{
                  transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}
              />
            </div>
            <div className={`category-content ${isExpanded ? 'expanded' : ''}`}>
              <div className="command-list">
                {category.commands.map((cmd, index) => (
                  <div key={index} className="command-item">
                    <div className="command-header">
                      <div className="command-code">{simplifyCommandForDisplay(cmd.code)}</div>
                      <button
                        className={`command-copy-btn ${copiedCommand === cmd.code ? 'copied' : ''}`}
                        onClick={() => copyCommand(cmd.code)}
                        title="Copy command"
                      >
                        {copiedCommand === cmd.code ? (
                          <>✓ Copied!</>
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
  );
}

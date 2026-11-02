/** Product semantics from the versioned CLI creation and operations guides.
 * Reference knowledge selects tools; it never authorizes an operation.
 */
export const STUDIO_WORKSPAI_SCOPE_KNOWLEDGE = {
  entities: {
    workspace:
      'Canonical owner of registered projects, contracts, Model/Graph and shared evidence. A workspace may be empty; it is not a project or merely the folder open in VS Code.',
    project:
      'Application, service, desktop app, agent, gateway or extension with its own source/runtime/checks. Membership does not require physical containment: adopted projects may remain outside the workspace directory.',
    binding:
      'Project-local workspace-link.local.json locates the canonical workspace; it is machine-local, not a second workspace. Validate it and membership; never turn the project directory into its own workspace.',
  },
  locations: {
    managed:
      'A named workspace defaults to ~/.workspai/workspaces/<name>. Outside a workspace, noninteractive adopt/import without --workspace uses the managed default named workspai, with legacy-root reuse where supported.',
    custom:
      'create workspace <name> --output <parent> creates <parent>/<name>. --here creates a named child of cwd; it does not convert cwd itself. Workspaces cannot nest.',
    currentProject:
      'For project creation in an existing workspace, execute from that canonical workspace and verify membership. Outside one, explicitly select documented managed linking, --create-workspace or --no-workspace behavior. Inspect installed help for supported options; do not invent --workspace for a command.',
    independent:
      'New software uses Workspai by default unless the user opts out. --no-workspace creates an independent project where supported; other ecosystem generators and general tools remain available.',
  },
  onboarding: [
    {
      resource: 'project',
      source: 'local-folder',
      intent: 'keep-in-place',
      command: ['adopt'],
      materialization: 'none',
      registration: true,
      consent:
        'Confirm source and workspace destination; source stays in place but metadata/grounding and registry change.',
    },
    {
      resource: 'project',
      source: 'local-folder',
      intent: 'copy-into-workspace',
      command: ['import'],
      materialization: 'copy',
      registration: true,
      consent: 'Confirm source, destination and copying before execution.',
    },
    {
      resource: 'project',
      source: 'git-url',
      intent: 'clone-into-workspace',
      command: ['import'],
      flags: ['--git'],
      materialization: 'clone',
      registration: true,
      consent: 'Confirm repository, destination and cloning before execution.',
    },
    {
      resource: 'workspace',
      source: 'local-folder',
      intent: 'register-in-place',
      command: ['workspace', 'connect'],
      materialization: 'none',
      registration: true,
    },
    {
      resource: 'workspace',
      source: 'archive',
      intent: 'restore-and-register',
      command: ['workspace', 'import'],
      materialization: 'extract',
      registration: true,
    },
    {
      resource: 'workspace',
      source: 'archive',
      intent: 'extract-only',
      command: ['workspace', 'hydrate'],
      materialization: 'extract',
      registration: false,
    },
  ],
  adoptionTargets:
    'adopt --workspace selects an existing valid workspace or bootstraps an eligible existing empty directory. A nonempty unmanaged destination is rejected without modification. Interactive parent bootstrap is offered only for an eligible direct parent containing exactly that project; noninteractive callers must not assume that choice.',
  resolution: {
    precedence: [
      'explicit --workspace',
      'parent workspace',
      'validated local link',
      'reverse registry',
    ],
    errors:
      'An invalid explicit destination, stale/malformed link or ambiguous membership requires resolution; never silently choose another workspace. Inventory is observation, not permission to broaden source-edit scope.',
  },
  commandsByScope: [
    {
      scope: 'workspace',
      argv: ['create', 'workspace', '<name>'],
      effect: 'Provision a new independent workspace at the selected parent.',
    },
    {
      scope: 'workspace/project-membership',
      argv: ['create', 'project', '<kit>', '<name>'],
      effect:
        'Scaffold and register one project in the chosen workspace, or explicitly create without management.',
    },
    {
      scope: 'project',
      argv: ['doctor', 'project'],
      effect: 'Inspect the chosen project; mutation flags require their own authorization.',
    },
    {
      scope: 'project-entry',
      argv: ['project', 'workspace', 'status', '--json'],
      effect: 'Read canonical workspace ownership from a project entry.',
    },
    {
      scope: 'project-entry',
      argv: ['project', 'workspace', 'relink', '--workspace', '<root>', '--json'],
      effect:
        'Reconcile a local binding only for an already registered member; this is not adopt/import.',
    },
    {
      scope: 'workspace',
      argv: ['workspace', 'intelligence', 'run'],
      effect:
        'Run the canonical chain on the resolved workspace; do not invoke for unrelated questions.',
    },
    {
      scope: 'workspace-with-project-filter',
      argv: ['workspace', 'run', '<stage>', '--scope', 'project:<name>'],
      effect:
        'Run an applicable lifecycle stage on selected membership; inspect --plan/help before execution.',
    },
  ],
  completion:
    'Inspect the CLI ingestion plan and actual workspacePath/project path/relationship, verify contract membership and the requested source location, then verify application behavior with applicable tools. Create foundation sync is not dependency installation, tests, health or release readiness.',
} as const;

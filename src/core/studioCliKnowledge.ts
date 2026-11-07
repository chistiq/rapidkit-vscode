import surface from '../../contracts/runtime-command-surface.v1.json';
import closure from '../../contracts/official-cli-closure.v1.json';
import { listExecutableScaffoldKitCapabilities } from './scaffoldKits.js';
import { STUDIO_WORKSPAI_SCOPE_KNOWLEDGE } from './studioWorkspaiScopeKnowledge.js';
import { STUDIO_INTELLIGENCE_KNOWLEDGE } from './studioIntelligenceKnowledge.js';

type Entry = {
  command: string;
  summary: string;
  argv: string[];
  usage?: string;
  options?: unknown[];
  arguments?: unknown[];
  examples?: string[];
};

export const STUDIO_CLI_KNOWLEDGE_HINT =
  `Workspai CLI knowledge: reference ${closure.cli.version} is not installed-version proof or execution authority. ` +
  'inspect-cli-commands: topic=architecture for scopes/kits, topic=knowledge for guides, includeDetails=true for syntax, source=installed for runtime proof. inspect-cli-help gives usage. ' +
  'Destinations: create-workspace appends a name to --output parent; bind-workspace selects an owner; select-project selects source without membership. onboard-project offers exact-approved adopt/import into default/custom workspace roots. No nested workspaces. Adopted source may be external. ' +
  'CLI routes: inspect-project-agent-entry reads bootstrap; run-governed-command handles registered producers; other operations may use exact-approved start-terminal. Bootstrap never gates ordinary coding. Combine relevant blocker checks with other tools; exit zero is not objective verification.';

export const STUDIO_WORKSPAI_PROJECT_POLICY = [
  'At the start of each project creation or modification request, resolve the exact user target, then use the select-project inventory or inspect-workspace for a quick .workspai signature and ownership check at that source. This is not the filesystem-root /.workspai and not a recursive sibling-repository search. Reuse this request’s current observation until the target or metadata changes. Greetings and ordinary questions need no signature inspection. A destination that does not exist yet can be created without inspecting a nonexistent project.',
  'Use Workspai architecture by default for new software: discover supported kits and suitable runtimes with inspect-cli-commands topic=architecture and installed help, scaffold/register the required projects, then implement and verify the requested product behavior. If the requested framework has no supported kit, use its native ecosystem scaffolder, select the actual created source, inspect its signature, offer optional in-place adoption once and continue implementation/checks even when the offer is declined. Never substitute a supported framework for the requested one merely to use Workspai. A workspace owns related projects, contracts, dependency/impact intelligence and verification evidence; frontend and backend can be separate registered projects. Choose topology, kits and tools from the actual request, not a fixed sample stack.',
  'Honor explicit destinations. Add to the current workspace when requested; create a separate workspace when requested; choose a sensible managed destination for new software if no usable folder exists. create-workspace and bind-workspace are optional capabilities, not mandatory sequences. A stale selected folder is not an empty repository or a reason to stop a new-project task when independent creation is available.',
  'For an existing project, select its source with select-project when needed and inspect the returned inventory (or inspect-workspace at the current target) before changes. If .workspai is absent and canonical ownership is unmanaged, offer optional onboard-project (adopt keeps source; import copies) once with benefits such as registration, dependency mapping, diagnostics and impact checks. Existing .workspai metadata or verified parent/legacy ownership means continue without another adoption offer; a bare directory does not establish valid workspace membership. Resolve ambiguous/broken metadata when needed without forcing adoption or blocking ordinary coding. Adoption needs user acceptance; import needs it too. Exact command approval must cover source, destination and keeping/copying/cloning source; an ordinary edit request does not authorize migration. Continue the task while consent is undecided or declined; do not block work or repeat a declined offer.',
  'If the user explicitly wants independent architecture or no Workspai, honor that choice, optionally explain relevant benefits once, then deliver the requested solution with general tools. Workspai bootstrap/Goal/health setup must never become a prerequisite for unrelated edits. Choose reasonable defaults when delegated; ask only for an essential ambiguity. Scaffolding is a starting point, not a completed shop: implement the requested features and run checks that exercise them.',
  'A scaffold created with --skip-install has no installed runtime tools or bundled dependency docs yet. Inspect its manifest/lockfile, choose the matching package manager and install when needed with applicable approval; npm ci needs a compatible lockfile. inspect-project-docs reads installed package guides without granting edit authority. If guides are unavailable, use relevant official vendor docs or another applicable tool. Resolve repository prerequisites causally rather than repeatedly reading the same instructions or missing directories.',
].join('\n');

/** Versioned architecture knowledge is available without a folder or running CLI. */
export function buildStudioWorkspaiArchitecture(query = '') {
  const catalog = listExecutableScaffoldKitCapabilities();
  const filler = new Set([
    'kit',
    'kits',
    'project',
    'projects',
    'supported',
    'support',
    'create',
    'creation',
    'identifier',
    'identifiers',
    'framework',
    'frameworks',
    'available',
    'starter',
    'starters',
    'for',
    'with',
    'and',
    'using',
  ]);
  const terms = [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9._-]+/)
        .filter((term) => Boolean(term) && !filler.has(term))
    ),
  ];
  // Natural-language filler such as "supported project kits" is not a kit
  // filter. Retain actual catalog terms, so "React + Vite" finds its contract.
  const searchable = (kit: (typeof catalog)[number]) => JSON.stringify(kit).toLowerCase();
  const meaningful = terms.filter((term) => catalog.some((kit) => searchable(kit).includes(term)));
  const kits = catalog.filter(
    (kit) =>
      terms.length === 0 ||
      (meaningful.length > 0 && meaningful.every((term) => searchable(kit).includes(term)))
  );
  return {
    schemaVersion: 'workspai.studio-architecture.v1',
    source: 'bundled-create-contract',
    version: closure.cli.version,
    kits,
    ownership: {
      workspace:
        'Related registered projects, shared contracts, intelligence and verification evidence.',
      project:
        'Application/service with its own runtime, source, dependencies and checks; may be native-scaffolded, ecosystem-generated or adopted.',
    },
    scopeModel: STUDIO_WORKSPAI_SCOPE_KNOWLEDGE,
    intelligence: STUDIO_INTELLIGENCE_KNOWLEDGE,
    categories: [...new Set(kits.map((kit) => kit.category))].map((category) => ({
      category,
      kitIds: kits.filter((kit) => kit.category === category).map((kit) => kit.id),
    })),
    principles: {
      truth:
        'The Workspace Model is canonical; Graph is derived and revision-bound. A missing graph relationship means not proven, not independent.',
      onboarding:
        'Adopt keeps existing source in place; import copies or clones; workspace connect registers an existing workspace; hydrate extracts an archive without registration.',
      goals:
        'Goal plans scope and acceptance criteria. It does not edit source or prove completion. General engineering objectives are supported; canonical Goal entry needs current adopted scope and evidence.',
      verification:
        'Agent grounding, project environment, architecture freshness and release readiness are separate verdicts. Successful bootstrap or a single command is not a release or feature verdict.',
      pcc: 'Proof-Carrying Change composes Goal intent, Decisions authorization/effect receipts, Model/Graph baselines and independent verification. Prediction and live telemetry are not proof.',
      runtimes:
        'Create lanes are finite executable contracts, not a language allowlist for ordinary work or adoption. For an unsupported starter, use applicable native ecosystem tools, then offer or perform authorized Workspai registration.',
    },
    knowledge: {
      tool: 'inspect-cli-commands',
      input: { topic: 'knowledge' },
      coverage:
        'Official source-addressable guides with hashes and bounded reading; search by capability and follow nextOffset.',
    },
    workflow: STUDIO_WORKSPAI_PROJECT_POLICY,
    canonicalCommands: {
      createWorkspace: 'workspai create workspace <name>',
      createProject: 'workspai create project <kit> <name>',
      adoptExisting: 'workspai adopt <path>',
      adoptIntoWorkspace: 'workspai adopt <project-path> --workspace <workspace-root> --json',
      previewAdoption:
        'workspai adopt <project-path> --workspace <workspace-root> --dry-run --json',
      importLocalCopy: 'workspai import <project-path> --workspace <workspace-root> --json',
      importGitClone: 'workspai import <repository-url> --git --workspace <workspace-root> --json',
    },
    profiles: [
      'minimal',
      'node-only',
      'python-only',
      'go-only',
      'java-only',
      'dotnet-only',
      'polyglot',
      'enterprise',
    ],
    coverage:
      'Executable kits from the bundled contract, not proof of locally installed generators or toolchains. Inspect installed help when selecting exact CLI syntax. Existing/import lanes do not imply native create support.',
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** CLI-authored documentation remains available before any workspace or runtime exists. */
export function buildStudioCliCatalog(input: {
  query?: string;
  offset?: number;
  limit?: number;
  includeDetails?: boolean;
  installed?: unknown;
}) {
  const offset = input.offset ?? 0;
  const limit = input.limit ?? 20;
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 40
  ) {
    throw new Error('Command catalog requires a nonnegative offset and a limit from 1 to 40.');
  }
  const entries = new Map<string, Entry>();
  let version = closure.cli.version;
  if (input.installed !== undefined) {
    const payload = record(input.installed);
    const inventory = record(payload.runtimeInventory);
    if (
      payload.schemaVersion !== 'rapidkit-command-capabilities-v1' ||
      inventory.schemaVersion !== 'workspai-cli-runtime-command-inventory-v1' ||
      !Array.isArray(inventory.commands)
    ) {
      throw new Error(
        'Installed CLI did not return a supported runtime command inventory. Use the bundled catalog or installed help.'
      );
    }
    version = typeof payload.version === 'string' ? payload.version : 'unknown';
    for (const raw of inventory.commands) {
      const value = record(raw);
      if (
        !Array.isArray(value.path) ||
        !value.path.length ||
        !value.path.every((part) => typeof part === 'string' && /^[a-z][a-z0-9-]*$/.test(part))
      ) {
        continue;
      }
      const argv = value.path as string[];
      const command = argv.join(' ');
      entries.set(command, {
        command,
        argv,
        summary: typeof value.description === 'string' ? value.description : '',
        options: Array.isArray(value.options) ? value.options : [],
        arguments: Array.isArray(value.arguments) ? value.arguments : [],
      });
    }
    for (const field of ['coreBacked', 'projectScoped']) {
      const commands = record(payload.commands)[field];
      if (!Array.isArray(commands)) {
        continue;
      }
      for (const command of commands) {
        if (
          typeof command !== 'string' ||
          !/^[a-z][a-z0-9-]*$/.test(command) ||
          entries.has(command)
        ) {
          continue;
        }
        entries.set(command, {
          command,
          argv: [command],
          summary: `${field} command; inspect installed help for runtime-specific syntax.`,
        });
      }
    }
    const workspace = record(payload.workspace).subcommands;
    if (Array.isArray(workspace)) {
      for (const action of workspace) {
        if (typeof action !== 'string' || !/^[a-z][a-z0-9-]*$/.test(action)) {
          continue;
        }
        const command = `workspace ${action}`;
        if (!entries.has(command)) {
          entries.set(command, {
            command,
            argv: ['workspace', action],
            summary: 'Workspace action; inspect installed help for its options and subactions.',
          });
        }
      }
    }
  } else {
    for (const entry of surface.commandDocumentation) {
      entries.set(entry.invocation, {
        command: entry.invocation,
        summary: entry.summary,
        argv: entry.canonicalArgv,
      });
    }
    for (const action of surface.workspaceActions) {
      const command = `workspace ${action.id}`;
      entries.set(command, {
        command,
        argv: ['workspace', action.id],
        summary: action.summary,
        usage: action.usage,
        options: action.options,
        examples: action.examples,
      });
    }
  }
  const terms = (input.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const all = [...entries.values()].sort((a, b) => a.command.localeCompare(b.command));
  const matching = all.filter((entry) =>
    terms.every((term) => `${entry.command} ${entry.summary}`.toLowerCase().includes(term))
  );
  const page = matching
    .slice(offset, offset + limit)
    .map(
      (entry): Entry =>
        input.includeDetails
          ? entry
          : { command: entry.command, summary: entry.summary.slice(0, 300), argv: entry.argv }
    );
  const nextOffset = offset + page.length < matching.length ? offset + page.length : null;
  return {
    schemaVersion: 'workspai.studio-cli-catalog.v1',
    source: input.installed !== undefined ? 'installed-runtime' : 'bundled-contract',
    version,
    provenance:
      input.installed !== undefined
        ? 'workspai commands --json'
        : 'contracts/runtime-command-surface.v1.json',
    coverage:
      'Advertised command families; inspect command help for detailed and runtime-specific syntax. A page is not the complete command list.',
    totalCommands: all.length,
    matchingCommands: matching.length,
    offset,
    nextOffset,
    detailsIncluded: input.includeDetails === true,
    commands: page,
  };
}

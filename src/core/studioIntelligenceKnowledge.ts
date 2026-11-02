import surface from '../../contracts/runtime-command-surface.v1.json';

export const STUDIO_INTELLIGENCE_USAGE_HINT =
  'Use Workspai intelligence when it helps: bounded project context or query-workspace-graph can locate owners, dependencies, tests and proofs before broad scans. Choose search/entities/evidence/path and project/workspace scope from the question. Preserve freshness, source hash, omitted counts and proof links; absence is not independence. Read current source before edits. inspect-project-commands reports effective Core/runtime support. Missing intelligence is not a setup requirement: use source/LSP/terminal/host tools. Run the full chain only for a relevant health/readiness/verification objective; retrieval alone is not completion.';

export const STUDIO_INTELLIGENCE_KNOWLEDGE = {
  reference:
    'Bundled CLI contract and versioned intelligence/graph/agent-entry guides; inspect installed capabilities for runtime proof.',
  planes: [
    {
      owner: 'npm-wrapper',
      purpose:
        'Onboarding and product command orchestration; use installed command inventory/help for actual syntax and availability.',
    },
    {
      owner: 'python-core',
      purpose:
        'Delegated Core operations depend on the effective project contract. A registered/adopted project does not automatically support modules, upgrade or merge.',
    },
    {
      owner: 'project-runtime',
      purpose:
        'init/dev/start/build/test/lint/format use detected runtime/manifest capabilities, not one fixed npm workflow.',
      discovery: 'inspect-project-commands',
    },
    {
      owner: 'workspace-intelligence',
      families: surface.workspaceIntelligenceSubcommands,
      purpose:
        'Canonical modeling, relationships, change impact, evidence, verification and agent projections. Select only operations relevant to the request.',
    },
  ],
  retrieval: [
    {
      need: 'Owners, dependencies, tests, architecture boundaries',
      tool: 'query-workspace-graph',
      operation: 'search',
      scope: 'Selected project by default; workspace for cross-project questions.',
    },
    {
      need: 'Inventory of an architectural kind',
      tool: 'query-workspace-graph',
      operation: 'entities',
    },
    {
      need: 'Why an entity or relationship is believed',
      tool: 'query-workspace-graph',
      operation: 'evidence',
    },
    { need: 'How two entities are connected', tool: 'query-workspace-graph', operation: 'path' },
    {
      need: 'Bounded agent context, report index, applicable operational skills',
      tool: 'inspect-evidence',
      artifacts: [
        '.workspai/reports/INDEX.json',
        '.workspai/reports/project-context-agent.json',
        '.workspai/reports/workspace-context-agent.json',
        '.workspai/reports/workspace-skills-index.json',
      ],
      caveat: 'Read only present, authorized locators; project entry and workspace scope differ.',
    },
  ],
  producers: [
    {
      need: 'Current canonical Model or accepted structural baseline',
      commands: ['workspace model', 'workspace snapshot'],
      caveat: 'Never replace the baseline before Diff merely to erase a change.',
    },
    {
      need: 'What changed and affected dependents',
      commands: ['workspace diff', 'workspace impact'],
    },
    {
      need: 'Environment, architecture and release evidence',
      commands: ['doctor', 'analyze', 'readiness', 'workspace contract verify', 'workspace verify'],
      caveat:
        'These are distinct verdicts; a successful graph query or bootstrap is not release readiness.',
    },
    {
      need: 'Complete governed intelligence decision chain',
      commandId: 'workspaceIntelligenceChain',
      caveat:
        'Use the CLI-owned canonical sequence when relevant. No mandatory chain for greetings, explanations or an unrelated edit.',
    },
    {
      need: 'Agent projections, explanations and automation',
      commands: [
        'workspace context',
        'workspace agent-sync',
        'workspace explain',
        'workspace why',
        'workspace trace',
        'workspace feedback',
        'workspace eval',
        'workspace mcp',
      ],
      caveat:
        'Inspect exact installed help and available host tools; these are capabilities, not compulsory steps.',
    },
  ],
  evidenceLimits:
    'Graph is derived from Model with revision/source hashes and bounded provider coverage. CLI graph reads validate freshness and may rebuild derived artifacts; inspect evidence and current source for the requested claim. No second extension cache assumes freshness across edits. Omitted results and unresolved calls remain unknown.',
  efficiency:
    'Question-sized retrieval can reduce model context compared with broad source loading. Savings depend on query quality, result size and cold/warm CLI cost; no fixed token saving is guaranteed. Reuse observed proof locators and avoid re-reading unchanged results.',
} as const;

export type NpmContractSupportMode =
  | 'runtime-consumed'
  | 'evidence-consumed'
  | 'schema-guarded'
  | 'mirrored-reserved';

export type NpmContractSupportEntry = {
  contractPath: string;
  mode: NpmContractSupportMode;
  extensionSurface: string;
  usage: string;
};

export const NPM_CONTRACT_SUPPORT_MATRIX: NpmContractSupportEntry[] = [
  {
    contractPath: 'bootstrap-compliance.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Bootstrap compliance card and workspace repair flow',
    usage:
      'Reads bootstrap compliance evidence for profile/runtime prerequisites and repair routing.',
  },
  {
    contractPath: 'mirror-ops.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Mirror operations evidence and workspace dashboard',
    usage:
      'Reads canonical mirror operation results for status, verification, and repair feedback.',
  },
  {
    contractPath: 'transparency-evidence.v1.json',
    mode: 'schema-guarded',
    extensionSurface: 'Evidence provenance and transparent decision boundary',
    usage: 'Guards portable provenance fields used by evidence-backed UI and agent handoffs.',
  },
  {
    contractPath: 'workspace-contract.v1.json',
    mode: 'runtime-consumed',
    extensionSurface: 'Workspace discovery, project identity, graph, and contract inspection',
    usage:
      'Consumes the canonical workspace contract instead of inferring registered project ownership.',
  },
  {
    contractPath: 'workspace-share-bundle.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Share bundle export and artifact inventory',
    usage: 'Guards portable workspace share bundle metadata exposed by extension export flows.',
  },
  {
    contractPath: 'workspace-intelligence/model-usage-event.v1.json',
    mode: 'schema-guarded',
    extensionSurface: 'Agent evaluation event boundary',
    usage:
      'Guards provider/tokenizer provenance events aggregated by workspace evaluation reports.',
  },
  {
    contractPath: 'workspace-intelligence/workspace-graph-token-efficiency.v1.json',
    mode: 'mirrored-reserved',
    extensionSurface: 'Graph retrieval efficiency compatibility boundary',
    usage:
      'Preserves the benchmark schema for a future visual comparison surface without inventing metrics.',
  },
  {
    contractPath: 'workspace-intelligence/workspace-graph-stream.v1.json',
    mode: 'schema-guarded',
    extensionSurface: 'Workspace Graph revision store and incremental projection boundary',
    usage:
      'Guards snapshot, delta, hash continuity, revision-gap, resync, provider progress, and control events independently of transport.',
  },
  {
    contractPath: 'workspace-intelligence/workspace-intelligence-evaluation.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Intelligence Run card and evaluation commands',
    usage:
      'Reads live/final model calls, token provenance, tool activity, cost, latency, and verified outcomes.',
  },
  {
    contractPath: 'workspace-intelligence/workspace-intelligence-evaluation-comparison.v1.json',
    mode: 'mirrored-reserved',
    extensionSurface: 'Evaluation comparison compatibility boundary',
    usage: 'Ships the task-aligned comparison contract for a future baseline comparison view.',
  },
  {
    contractPath: 'workspace-intelligence/workspace-knowledge-graph.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Workspace Model card, graph search, and graph export commands',
    usage:
      'Reads proof-backed entity, relation, provider, diagnostic, and quality metrics from the canonical graph.',
  },
  {
    contractPath: 'workspace-intelligence/workspace-knowledge-graph-change-overlay.v1.json',
    mode: 'mirrored-reserved',
    extensionSurface: 'Pre-merge graph change-overlay compatibility boundary',
    usage: 'Preserves the overlay schema for future PR and staged-change visualization.',
  },
  {
    contractPath: 'workspace-intelligence/workspace-knowledge-search.v1.json',
    mode: 'runtime-consumed',
    extensionSurface: 'Bounded workspace graph search command',
    usage:
      'Guards ranked, proof-backed graph search responses consumed through the command surface.',
  },
  {
    contractPath: 'extension-cli-compatibility.v1.json',
    mode: 'runtime-consumed',
    extensionSurface: 'CLI version gate and contract compatibility floor',
    usage:
      'Pins MIN_RAPIDKIT_CLI_VERSION to the npm release this extension was verified against; includes bundled contract schema versions.',
  },
  {
    contractPath: 'agent-customization-pack.v1.json',
    mode: 'runtime-consumed',
    extensionSurface: 'Agent Customization Pack card, walkthrough agent-sync step, Copilot handoff',
    usage:
      'Imports the npm-synced contract for the standard answer contract and reads agent-customization-pack.json for preset/target inventory, drift state, hooks/MCP metadata, and enterprise agent-sync routing.',
  },
  {
    contractPath: 'analyze-last-run.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Dashboard evidence, Studio handoff, AI architecture grounding',
    usage: 'Reads analyze-last-run.json blockers, score, warnings, and artifact paths.',
  },
  {
    contractPath: 'artifact-remediation-plan.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Studio cross-artifact repair plan and evidence-card remediation',
    usage:
      'Reads artifact-remediation-plan-last-run.json emitted by workspace remediation-plan --ci --write --include-paths so Studio can consume npm-authored repair actions for all governance cards, not only Doctor.',
  },
  {
    contractPath: 'backend-import-stack-parity.snapshot.json',
    mode: 'schema-guarded',
    extensionSurface: 'Runtime parity and import-stack guardrails',
    usage: 'Guards supported backend import stacks against npm canonical parity.',
  },
  {
    contractPath: 'cli-log-event.v1.json',
    mode: 'runtime-consumed',
    extensionSurface: 'Terminal/evidence telemetry compatibility',
    usage:
      'Evidence terminals request RAPIDKIT_LOG_FORMAT=json and validate CLI log events for evidence refresh routing.',
  },
  {
    contractPath: 'create-planner-capabilities.v1.json',
    mode: 'runtime-consumed',
    extensionSurface: 'Create with AI and manual create',
    usage: 'Drives native, official, and existing project-entry capability decisions.',
  },
  {
    contractPath: 'doctor-project-evidence.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Project health evidence and Project lifecycle',
    usage: 'Reads project doctor evidence for blockers, warnings, health, and capability status.',
  },
  {
    contractPath: 'doctor-remediation-plan.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Studio repair plan, doctor-fix UX, and evidence-card remediation',
    usage:
      'Reads doctor-remediation-plan-last-run.json to show ordered, policy-aware repair steps, affected files, risk, and verify commands for Studio handoff.',
  },
  {
    contractPath: 'doctor-workspace-evidence.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Workspace health evidence and repair flow',
    usage: 'Reads workspace doctor evidence for primary blockers and next safe actions.',
  },
  {
    contractPath: 'infra-stack.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Dashboard evidence and Studio operations',
    usage: 'Frames infra readiness, service presence, and infra blockers when reports exist.',
  },
  {
    contractPath: 'module-layout.v1.json',
    mode: 'schema-guarded',
    extensionSurface: 'Module browser and module support guardrails',
    usage: 'Keeps module layout assumptions aligned with npm module scaffolding.',
  },
  {
    contractPath: 'module-support.v1.json',
    mode: 'runtime-consumed',
    extensionSurface: 'Library and Project lifecycle',
    usage:
      'Controls module-capable kits, unsupported frameworks, install readiness, and disabled reasons.',
  },
  {
    contractPath: 'pipeline-last-run.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Governance pipeline evidence and repair flow',
    usage: 'Reads pipeline pass/fail/warn evidence and routes blockers to deterministic commands.',
  },
  {
    contractPath: 'release-readiness.v1.json',
    mode: 'runtime-consumed',
    extensionSurface: 'Readiness evidence, Studio release action, and src contract mirror',
    usage: 'Guards release readiness outcomes and Go/No-Go evidence paths.',
  },
  {
    contractPath: 'runtime-command-surface.v1.json',
    mode: 'runtime-consumed',
    extensionSurface: 'Commands, kit choices, lifecycle actions, and create planner parity',
    usage:
      'Pins scaffold kits, lifecycle command support, module support, and create planner capability lanes.',
  },
  {
    contractPath: 'workspace-intelligence-architecture.v1.json',
    mode: 'runtime-consumed',
    extensionSurface: 'Workspace Intelligence positioning, AI grounding, and claim boundary',
    usage:
      'Consumes the CLI-owned positioning, available intelligence loop, and evidence principles so AI grounding and extension claims share the same input-core-consumer boundary.',
  },
  {
    contractPath: 'workspace-intelligence-chain.v1.json',
    mode: 'runtime-consumed',
    extensionSurface:
      'Workspace Intelligence chain runner, progress verdicts, and agent artifact order',
    usage:
      'Drives canonical command order, labels, dependencies, artifact flow, and structured-verdict continuation from the CLI-owned chain contract.',
  },
  {
    contractPath: 'workspace-intelligence/agent-customization-pack-report.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Agent Customization Pack evidence reader and drift UI',
    usage:
      'Validates agent-customization-pack.json inventory, capability matrix, drift, and chain provenance independently from the capability contract.',
  },
  {
    contractPath: 'workspace-intelligence/agent-reports-index.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Canonical agent evidence read order and blocker index',
    usage:
      'Validates INDEX.json report inventory, freshness metadata, blockers, and intelligence-chain provenance.',
  },
  {
    contractPath: 'workspace-intelligence/workspace-context.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Agent context, Copilot handoff, Workspace Advisor, Studio',
    usage: 'Reads workspace-context-agent.json as shared agent context and safe command evidence.',
  },
  {
    contractPath: 'workspace-intelligence/workspace-dependency-graph.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Workspace atlas graph view, Advisor, Studio blast-radius',
    usage:
      'Reads the dependency graph embedded in workspace-model.json (typed edges, coverage, diagnostics, operational weight, and integrity) for blast-radius and impact navigation.',
  },
  {
    contractPath: 'workspace-intelligence/workspace-impact.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Workspace Advisor, Studio, impact verification',
    usage: 'Reads workspace-impact-last-run.json for affected projects, risk, and verify path.',
  },
  {
    contractPath: 'workspace-intelligence/workspace-intelligence-run.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Unified Workspace Intelligence runner, Dashboard, and Studio progress',
    usage:
      'Validates workspace-intelligence-run-last-run.json stage outcomes, artifact paths, blockers, and definitive runner status.',
  },
  {
    contractPath: 'workspace-intelligence/workspace-model-diff.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Workspace diff evidence and impact chain',
    usage: 'Reads workspace-model-diff-last-run.json as the source for impact analysis.',
  },
  {
    contractPath: 'workspace-intelligence/workspace-model-snapshot.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Workspace model baseline and diff chain',
    usage: 'Reads workspace-model-snapshot.json as the stable baseline for workspace diff.',
  },
  {
    contractPath: 'workspace-intelligence/workspace-model.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Workspace atlas, Advisor, Studio, Copilot context',
    usage: 'Reads workspace-model.json as the canonical workspace architecture atlas.',
  },
  {
    contractPath: 'workspace-intelligence/workspace-verify.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Workspace verify evidence and repair verification',
    usage: 'Reads workspace-verify-last-run.json to verify impact and gate results.',
  },
  {
    contractPath: 'workspace-intelligence/workspace-contract-verify.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Workspace contract verify card and governance gate',
    usage: 'Reads workspace-contract-verify-last-run.json for contract gate evidence.',
  },
  {
    contractPath: 'workspace-intelligence/blocker-resolution.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Studio blocker resolution hints and verify handoff',
    usage: 'Reads resolutionHints from workspace verify aligned with blocker-resolution.v1.',
  },
  {
    contractPath: 'workspace-intelligence/studio-blocker-handoff.v1.json',
    mode: 'runtime-consumed',
    extensionSurface: 'Studio fix loop handoff and sidebar patch bridge',
    usage: 'Validates studio blocker handoff payloads between dashboard and sidebar Studio.',
  },
  {
    contractPath: 'workspace-intelligence/workspace-explain.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Workspace Explain card and Advisor read-only narrative',
    usage: 'Reads workspace-explain-last-run.json for release/project explain sections.',
  },
  {
    contractPath: 'workspace-intelligence/workspace-skills-index.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Agent Grounding card and Copilot handoff',
    usage: 'Reads workspace-skills-index.json for operational skill catalog metadata.',
  },
  {
    contractPath: 'workspace-intelligence/doctor-fix-result.v1.json',
    mode: 'schema-guarded',
    extensionSurface: 'Studio doctor-fix stdout parsing',
    usage: 'Guards structured fixResult payloads emitted by doctor workspace/project --fix --json.',
  },
  {
    contractPath: 'workspace-intelligence/fact-freshness.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Workspace evidence freshness, Advisor grounding, and Studio verification',
    usage:
      'Consumes fact-level freshness metadata embedded in workspace intelligence artifacts so UI surfaces can distinguish durable facts from verify-before-use or live evidence.',
  },
  {
    contractPath: 'workspace-intelligence/workspace-operational-skill.v1.json',
    mode: 'schema-guarded',
    extensionSurface: 'Operational skills parity',
    usage: 'Guards canonical .rapidkit/skills/ record shape against npm generator.',
  },
  {
    contractPath: 'workspace-intelligence/agent-action-outcome.v1.json',
    mode: 'runtime-consumed',
    extensionSurface: 'Studio feedback bridge to workspace history',
    usage: 'Maps sidebar audit payloads to workspace feedback record CLI stdin.',
  },
  {
    contractPath: 'workspace-intelligence/workspace-intelligence-history.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Workspace trend chart and feedback history',
    usage: 'Reads verify and agent-action entries from workspace-intelligence-history.json.',
  },
  {
    contractPath: 'workspace-registry.v1.json',
    mode: 'runtime-consumed',
    extensionSurface: 'Workspace/project sidebar scope and src contract mirror',
    usage:
      'Reads workspace-registry.v1.json for project discovery, scope summary, and sidebar state.',
  },
  {
    contractPath: 'workspace-run-last.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Run workspace evidence and repair flow',
    usage: 'Reads workspace-run-last.json aggregate stage evidence for init/test/build blockers.',
  },
  {
    contractPath: 'autopilot-release.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Release Hub, Studio ship loop, and release evidence refresh',
    usage:
      'Reads both autopilot-release-last-run.json and autopilot-release.json to present governed release state and remaining blockers.',
  },
  {
    contractPath: 'cli-operation-result.v1.json',
    mode: 'schema-guarded',
    extensionSurface: 'Structured CLI execution result boundary',
    usage:
      'Pins the generic JSON operation envelope used by command bridges so success, error, and artifact fields cannot silently drift.',
  },
  {
    contractPath: 'cli-runtime-command-inventory.v1.snapshot.json',
    mode: 'runtime-consumed',
    extensionSurface: 'Live command inventory parity and release gates',
    usage:
      'Guards the complete installed command tree that the extension probes through workspai commands --json, including scoped command ownership.',
  },
  {
    contractPath: 'command-capabilities.v1.json',
    mode: 'runtime-consumed',
    extensionSurface: 'CLI capability probing and command visibility gates',
    usage:
      'Defines the structured workspai commands --json response consumed by runtimeCommandSurface and all capability-aware UI actions.',
  },
  {
    contractPath: 'compatibility-matrix.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Workspace profile compatibility and bootstrap repair',
    usage:
      'Reads compatibility-matrix.json to explain runtime/profile mismatches and ground bootstrap compliance remediation.',
  },
  {
    contractPath: 'doctor-project-scan.v2.json',
    mode: 'schema-guarded',
    extensionSurface: 'Doctor project scan cache compatibility',
    usage:
      'Guards the v2 project scan records that feed Doctor evidence without treating cache internals as user-authored truth.',
  },
  {
    contractPath: 'doctor-remediation-plan.v2.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Studio deterministic remediation controller',
    usage:
      'Consumes the canonical v2 repair operation, risk, approval, preview, freshness, and verify fields used by automatic and reviewed Studio steps.',
  },
  {
    contractPath: 'doctor-workspace-cache.v2.json',
    mode: 'schema-guarded',
    extensionSurface: 'Doctor workspace cache compatibility',
    usage:
      'Guards v2 cached workspace Doctor records while visible decisions remain grounded in emitted evidence artifacts.',
  },
  {
    contractPath: 'infra-plan.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Infrastructure plan card and Studio operations',
    usage:
      'Reads infra-plan.json for service plans, blockers, and safe infrastructure action routing without applying infrastructure implicitly.',
  },
  {
    contractPath: 'private-product-manifest.v1.json',
    mode: 'mirrored-reserved',
    extensionSurface: 'Private product manifest compatibility boundary',
    usage:
      'Ships the canonical schema for validation and future private-product UI integration; the extension does not infer private product state today.',
  },
  {
    contractPath: 'product-factory-plan.v1.json',
    mode: 'mirrored-reserved',
    extensionSurface: 'Product factory planning compatibility boundary',
    usage:
      'Preserves schema parity for product plan artifacts while product-factory execution remains CLI-owned and intentionally absent from Studio auto-fix.',
  },
  {
    contractPath: 'project-archive.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Project archive and restore inventory',
    usage:
      'Guards archived-project metadata used by workspace archive/restore surfaces so project identity and recovery paths stay explicit.',
  },
  {
    contractPath: 'project-entry-capability.v1.json',
    mode: 'runtime-consumed',
    extensionSurface: 'Create, adopt, and import project entry routing',
    usage:
      'Controls which stacks enter through native creation, official generators, adopt, or import without overstating module support.',
  },
  {
    contractPath: 'published-contract-catalog.v1.json',
    mode: 'runtime-consumed',
    extensionSurface: 'Bundled contract discovery and packaging parity',
    usage:
      'Enumerates published schemas and artifact ownership so release gates verify that every required contract is bundled in the VSIX.',
  },
  {
    contractPath: 'version.v1.json',
    mode: 'runtime-consumed',
    extensionSurface: 'CLI version probe and setup compatibility',
    usage:
      'Guards structured version output used to compare the linked CLI against extension-cli-compatibility.v1.',
  },
  {
    contractPath: 'workspace-archive-capabilities.v1.json',
    mode: 'runtime-consumed',
    extensionSurface: 'Workspace archive command capability gates',
    usage:
      'Defines export, inspect, verify, doctor, hydrate, project archive, and restore support before those actions are exposed.',
  },
  {
    contractPath: 'workspace-archive-manifest.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Archive inspection, integrity, and recovery UX',
    usage:
      'Validates streamed workspace archive manifests, exclusions, checksums, and recovery metadata shown to the operator.',
  },
  {
    contractPath: 'workspace-archive-operation-result.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Archive operation result and error presentation',
    usage:
      'Consumes structured archive operation outcomes so export, inspect, verify, hydrate, and restore failures remain actionable.',
  },
  {
    contractPath: 'workspace-intelligence/agent-hooks.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Agent grounding hook inventory',
    usage:
      'Validates .vscode/workspai-agent-hooks.json and exposes governed hook state as part of agent grounding evidence.',
  },
  {
    contractPath: 'workspace-intelligence/mcp-design.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'MCP design artifact and agent grounding card',
    usage:
      'Consumes workspai-mcp-design.json while retaining the legacy rapidkit filename as a read-only compatibility fallback.',
  },
  {
    contractPath: 'workspace-list.v1.json',
    mode: 'runtime-consumed',
    extensionSurface: 'Workspace selector and registry discovery',
    usage:
      'Guards structured workspace list output used to populate machine-local workspace selection without parsing terminal text.',
  },
  {
    contractPath: 'workspace-model-cache.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Workspace model cache freshness and fallback',
    usage:
      'Validates the canonical model cache before it is used as a performance fallback; report artifacts remain the visible source of truth.',
  },
  {
    contractPath: 'workspace-snapshot.v1.json',
    mode: 'schema-guarded',
    extensionSurface: 'Legacy workspace snapshot compatibility',
    usage:
      'Retains validation for v1 snapshot metadata while new recovery flows prefer the transactional v2 contract.',
  },
  {
    contractPath: 'workspace-snapshot.v2.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Transactional workspace and selective recovery snapshots',
    usage:
      'Guards v2 recovery scope, project payloads, integrity, and restore metadata used by destructive-operation safety UX.',
  },
  {
    contractPath: 'workspace-sync.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Workspace registry sync result and project refresh',
    usage:
      'Consumes structured workspace sync results so project discovery refreshes from canonical registry evidence.',
  },
  {
    contractPath: 'workspace-watch-event.v1.json',
    mode: 'evidence-consumed',
    extensionSurface: 'Workspace watch event refresh bridge',
    usage:
      'Guards watch event reason, changed paths, and affected artifacts before incremental dashboard and Studio refresh.',
  },
];

export function getNpmContractSupportEntry(
  contractPath: string
): NpmContractSupportEntry | undefined {
  return NPM_CONTRACT_SUPPORT_MATRIX.find((entry) => entry.contractPath === contractPath);
}

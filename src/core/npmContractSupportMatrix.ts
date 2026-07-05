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
    usage: 'Drives native create, external create-adopt, and adopt-only capability decisions.',
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
];

export function getNpmContractSupportEntry(
  contractPath: string
): NpmContractSupportEntry | undefined {
  return NPM_CONTRACT_SUPPORT_MATRIX.find((entry) => entry.contractPath === contractPath);
}

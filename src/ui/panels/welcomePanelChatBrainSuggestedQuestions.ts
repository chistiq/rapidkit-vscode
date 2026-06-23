/**
 * Chat-brain follow-up question suggestions by action type and scope.
 */

export function buildChatBrainSuggestedQuestions(
  actionType: string,
  message: string,
  scopeIntent: 'workspace' | 'project' = 'workspace'
): string[] {
  const isProject = scopeIntent === 'project';
  const norm = message.toLowerCase();

  // ── specialist: DevOps / CI-CD ──────────────────────────────────────────
  if (
    actionType === 'doctor-fix' &&
    (norm.includes('ci/cd') ||
      norm.includes('pipeline') ||
      norm.includes('kubernetes') ||
      norm.includes('helm') ||
      norm.includes('dockerfile') ||
      norm.includes('docker compose'))
  ) {
    return isProject
      ? [
          'Show me the exact Dockerfile line causing this failure',
          'What environment variables are missing from my CI pipeline?',
          'Verify the deployment config is consistent with the doctor evidence',
        ]
      : [
          'Which services have CI/CD drift across this workspace?',
          'Show me cross-service pipeline config inconsistencies',
          'Generate a workspace-wide deployment health checklist',
        ];
  }

  // ── specialist: Database / schema ───────────────────────────────────────
  if (
    actionType === 'change-impact-lite' &&
    (norm.includes('schema') ||
      norm.includes('migration') ||
      norm.includes('sql') ||
      norm.includes('database') ||
      norm.includes('postgres') ||
      norm.includes('mysql') ||
      norm.includes('mongodb'))
  ) {
    return isProject
      ? [
          'What tables or collections does this migration touch?',
          'Generate a rollback SQL script for this schema change',
          'Which integration tests cover this migration path?',
        ]
      : [
          'Which services share this database schema dependency?',
          'Show cross-service migration order and risk',
          'Generate rollback steps for each affected service',
        ];
  }

  // ── specialist: Docs / readme / runbook ─────────────────────────────────
  if (
    actionType === 'workspace-memory-wizard' &&
    (norm.includes('docs') ||
      norm.includes('documentation') ||
      norm.includes('readme') ||
      norm.includes('runbook') ||
      norm.includes('adr'))
  ) {
    return isProject
      ? [
          'Generate a README section for the public API of this project',
          'What architecture decisions should I document for this project?',
          'Create a runbook entry for the most common failure in this service',
        ]
      : [
          'Generate a workspace topology overview for the README',
          'Which ADRs are missing across all workspace services?',
          'Create a cross-service runbook for the top shared failure mode',
        ];
  }

  // ── specialist: Architecture / risk / blast-radius ──────────────────────
  if (
    actionType === 'change-impact-lite' &&
    (norm.includes('architecture') ||
      norm.includes('blast radius') ||
      norm.includes('refactor plan') ||
      norm.includes('risk'))
  ) {
    return isProject
      ? [
          'Show me the safest order to make these changes in this project',
          'What rollback plan should I have for this refactor?',
          'Generate a test checklist scoped to the affected modules',
        ]
      : [
          'Which other services are coupled to the changes I am making?',
          'What is the safest multi-service rollout sequence?',
          'Generate a workspace-wide blast-radius rollback plan',
        ];
  }

  // ── standard action types ────────────────────────────────────────────────
  if (actionType === 'terminal-bridge' || /error|traceback|failed/i.test(norm)) {
    return isProject
      ? [
          'Show me which files I need to change to fix this',
          'Run impact analysis before applying the fix',
          'Add this issue to workspace memory so it never happens again',
        ]
      : [
          'Which workspace services are affected by this error?',
          'Show cross-service impact before applying the fix',
          'Add this failure pattern to workspace memory',
        ];
  }
  if (actionType === 'fix-preview-lite' || /fix|patch|bug/i.test(norm)) {
    return isProject
      ? [
          'What tests should I add to cover this fix?',
          'Check if this fix could break anything else in this project',
          'Apply this fix and verify with doctor checks',
        ]
      : [
          'Does this fix propagate a regression risk to other services?',
          'Generate a workspace-level test checklist for this patch',
          'Apply this fix and verify across all affected services',
        ];
  }
  if (actionType === 'change-impact-lite' || /impact|risk|refactor/i.test(norm)) {
    return isProject
      ? [
          'Show me the safest order to make these changes',
          'What rollback plan should I have?',
          'Generate a test checklist for this change',
        ]
      : [
          'Which services are at highest risk from this change?',
          'What is the safest cross-service rollout sequence?',
          'Generate a workspace-wide rollback checklist',
        ];
  }
  if (actionType === 'doctor-fix' || /doctor|health|issue/i.test(norm)) {
    return isProject
      ? [
          'Fix all remaining doctor issues automatically',
          'Explain why this issue happens in my project type',
          'Save this fix pattern to workspace memory',
        ]
      : [
          'Fix all workspace issues grouped by root cause',
          'Show me which services share the same failure pattern',
          'Save the workspace-wide fix pattern to memory',
        ];
  }
  if (/module|install|add service|database|auth/i.test(norm)) {
    return [
      'What configuration do I need after adding this?',
      'Show me how to test this module is working',
      'What other modules pair well with this one?',
    ];
  }
  if (actionType === 'release-readiness-commander' || /release|ship|go\/no-go/i.test(norm)) {
    return isProject
      ? [
          'Export the Go/No-Go artifact for team signoff',
          'Show me blocking reasons ranked by risk',
          'Generate the exact release-stop-gate command for this decision',
        ]
      : [
          'Export the workspace-level Go/No-Go artifact for all services',
          'Which services are blocking the workspace release?',
          'Generate release-stop-gate commands for each NO-GO service',
        ];
  }
  if (
    actionType === 'verify-pack-autopilot' ||
    /verify|proof|checklist|deterministic/i.test(norm)
  ) {
    return isProject
      ? [
          'Generate a deterministic verify command pack for this change',
          'Rank verification commands by confidence and execution scope',
          'Show blockers that still prevent a completion claim',
        ]
      : [
          'Generate a workspace-wide verify command pack',
          'Show per-service verify commands ranked by confidence',
          'List workspace blockers that prevent a completion claim',
        ];
  }
  return isProject
    ? [
        'Run a full project health check now',
        'Show me the next highest-priority action for this project',
        'Save this analysis to workspace memory',
      ]
    : [
        'Run a full workspace health check now',
        'Show me the next highest-priority workspace action',
        'Save this workspace analysis to memory',
      ];
}

export function getChatBrainPrimaryActionLabel(actionType: string, projectName?: string): string {
  const target = projectName ? ` for ${projectName}` : '';
  const labels: Record<string, string> = {
    orchestrate: projectName
      ? `Inspect launch blockers for ${projectName}`
      : 'Inspect workspace launch blockers',
    'terminal-bridge': `Analyze the failing command${target}`,
    'fix-preview-lite': `Preview the safest fix${target}`,
    'change-impact-lite': `Map blast radius before changes${target}`,
    'doctor-fix': `Run health diagnosis${target}`,
    'workspace-memory-wizard': 'Capture workspace memory',
    'recipe-pack': `Run the best guided workflow${target}`,
    'incident-repro-pack': `Build a reproducible incident pack${target}`,
    'apply-module-gen': `Generate module plan with verify path${target}`,
    'apply-debug-patch': `Preview patch with rollback plan${target}`,
    'inline-command': `Prepare safe command execution${target}`,
    'release-readiness-commander': 'Generate release Go/No-Go decision',
    'browser-smoke-test': `Run browser smoke verification${target}`,
    'verify-pack-autopilot': `Generate deterministic verify pack${target}`,
  };

  return labels[actionType] ?? `Continue safe investigation${target}`;
}

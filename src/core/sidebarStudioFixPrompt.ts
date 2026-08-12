import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';
import type { DoctorRemediationPlanView } from './doctorRemediationPlanReader.js';
import {
  resolveStudioRunOnceProducerCommands,
  shouldForbidSourceCommandRerun,
} from './studioBlockerResolution.js';
const DEFAULT_WORKSPACE_VERIFY_COMMAND = 'workspace verify --json';

export function buildSidebarStudioPrompt(input: {
  task: string;
  handoff?: StudioBlockerHandoff | null;
  remediationPlan?: DoctorRemediationPlanView | null;
  studioMode?: 'investigate' | 'verify' | 'prepare';
}): string {
  const handoff = input.handoff;
  const remediationPlan = input.remediationPlan;
  const executionMode = handoff?.studioMode;
  const forbidRerun =
    handoff !== null &&
    handoff !== undefined &&
    shouldForbidSourceCommandRerun({
      mode: executionMode ?? 'FIX',
      commandRunCount: handoff.commandRunCount ?? 0,
      blockerSignature: handoff.blockerSignature,
      priorSignature: handoff.blockerSignature,
    });

  const modeLabel =
    input.studioMode === 'verify'
      ? 'Verify'
      : input.studioMode === 'prepare'
        ? 'Prepare safe action'
        : executionMode === 'VERIFY_ONLY'
          ? 'Verify only'
          : executionMode === 'EXPLAIN'
            ? 'Explain'
            : executionMode === 'RUN_ONCE'
              ? 'Run once'
              : 'Fix';

  const lines = [
    `Studio mode: ${modeLabel}.`,
    'Internal Studio loop: Detect -> Diagnose -> Plan -> Verify -> Learn.',
    'Respond as Workspai Studio inside VS Code.',
    'Be concise, evidence-aware, and action-safe.',
    'Do not claim that files were changed unless an explicit tool/command did it.',
    'Choose and execute the smallest safe next action through Studio tools; return a verification path and any remaining risk.',
    'Use short markdown sections only when relevant, in this order: Detect, Diagnose, Plan, Verify, Learn, Evidence, Assumptions.',
    'Each section should be brief: one short paragraph or up to three bullets.',
    'If evidence is missing, say exactly what evidence is missing and which command can refresh it.',
  ];

  if (handoff) {
    lines.push(
      '',
      '## Active blocker handoff',
      `- Card: ${handoff.cardLabel ?? handoff.cardId} (${handoff.cardStatus})`,
      `- Resolution class: ${handoff.resolutionClass ?? 'unknown'}`,
      `- Execution mode: ${executionMode ?? 'FIX'}`,
      `- Source command: ${handoff.sourceCommand}`,
      ...(handoff.workspacePath ? [`- Workspace path: ${handoff.workspacePath}`] : []),
      ...(handoff.projectPath ? [`- Project path: ${handoff.projectPath}`] : []),
      ...(handoff.artifactPath ? [`- Evidence artifact: ${handoff.artifactPath}`] : []),
      ...(handoff.exitCode !== null && handoff.exitCode !== undefined
        ? [`- Last exit code: ${handoff.exitCode}`]
        : []),
      ...(handoff.stderrTail ? [`- Last stderr tail: ${handoff.stderrTail.slice(0, 800)}`] : []),
      ...(handoff.commandRunCount !== null && handoff.commandRunCount !== undefined
        ? [`- Prior command runs for this signature: ${handoff.commandRunCount}`]
        : []),
      ...(handoff.incidentSummary
        ? [
            `- Incident phase: ${handoff.incidentSummary.phase}`,
            `- Primary action: ${handoff.incidentSummary.primaryAction}`,
            `- Verify required: ${handoff.incidentSummary.verifyRequired ? 'yes' : 'no'}`,
            `- Audit status: ${handoff.incidentSummary.auditStatus}`,
          ]
        : []),
      ...(handoff.blockers.length > 0
        ? [`- Blockers: ${handoff.blockers.slice(0, 4).join('; ')}`]
        : []),
      ...(handoff.doctorFindings?.length
        ? [
            '- Canonical Doctor targets:',
            ...handoff.doctorFindings
              .slice(0, 6)
              .map(
                (finding) =>
                  `  - ${finding.id}${finding.causalKey ? ` · causal ${finding.causalKey}` : ''}${finding.projectName ? ` · project ${finding.projectName}` : ''}${finding.capabilityId ? ` · capability ${finding.capabilityId}` : ''} · ${finding.repairDisposition ?? 'unknown repair disposition'} · ${finding.symptom}`
              ),
          ]
        : []),
      ...(handoff.verifyCommand ? [`- Verify after fix: ${handoff.verifyCommand}`] : [])
    );

    const resolutionCommands = resolveStudioRunOnceProducerCommands(handoff);
    if (resolutionCommands.length > 0) {
      lines.push(
        '- Contract-authored causal producers:',
        ...resolutionCommands.map((command) => `  - ${command}`)
      );
    }

    lines.push(
      '',
      'Card repair continuation contract:',
      '- Treat short follow-ups such as "continue", "fix it", "apply it", "yes", or unrelated small talk as part of this active card repair session unless the user explicitly changes topic.',
      '- Do not ask the user to restate the blocker; use the active blocker handoff, project path, remediation plan, artifact, and verify command first.',
      '- If the user asks a casual or clarifying question, answer briefly, then return to the current card fix path and next safe action.',
      '- Prefer the project path from the handoff over the globally active workspace/project when they differ.',
      '- For Doctor cards, bind every action to the supplied canonical finding id, causal key, project path, and capability id; never substitute an advisory finding for the selected blocking cause.',
      '- If a deterministic approval-free Studio apply step exists, continue it automatically instead of asking the user to run commands.',
      '- Pause once for approval only when the contract marks a step guarded, review-required, invasive, destructive, external, or ambiguous.',
      '- If deterministic steps are exhausted or blocked, continue with the smallest AI-assisted source/config edit grounded in the blocker and current evidence.'
    );
  }

  if (remediationPlan) {
    const firstSteps = remediationPlan.visibleSteps.slice(0, 4);
    lines.push(
      '',
      '## Active remediation plan',
      `- Freshness: ${remediationPlan.freshness.verdict}${
        remediationPlan.freshness.reason ? ` (${remediationPlan.freshness.reason})` : ''
      }`,
      `- Scope: ${remediationPlan.scope}`,
      `- Visible steps: ${remediationPlan.visibleSteps.length} of ${remediationPlan.totalSteps}`,
      `- Executable steps: ${remediationPlan.executableSteps}`,
      ...(firstSteps.length > 0
        ? firstSteps.flatMap((step, index) => [
            `- Step ${index + 1}: ${step.previewTitle || step.primaryAction}`,
            `  - Project: ${step.projectName}`,
            `  - Risk: ${step.risk}; Studio state: ${step.studioState}; Apply available: ${step.canApply ? 'yes' : 'no'}`,
            `  - Action: ${step.primaryAction}`,
            ...(step.diffSummary ? [`  - Diff preview: ${step.diffSummary}`] : []),
            ...(step.files.length > 0
              ? [`  - File hints: ${step.files.slice(0, 4).join(', ')}`]
              : []),
            ...(step.verifyCommand ? [`  - Verify: ${step.verifyCommand}`] : []),
          ])
        : [
            '- Deterministic remediation steps: none visible.',
            '- Continue with AI fix: propose the smallest source/config edit grounded in the blocker and verify command.',
          ]),
      remediationPlan.hiddenStepCount > 0
        ? `- Hidden supporting steps: ${remediationPlan.hiddenStepCount}`
        : '- Hidden supporting steps: 0',
      '',
      'Remediation contract:',
      '- Use the active remediation plan as the source of truth for known safe/guarded edits.',
      '- Do not invent unrelated framework setup when the remediation plan already names a safer step.',
      '- If the user asks to fix it, execute the Studio Apply/Continue repair path for safe approval-free deterministic steps.',
      '- If no deterministic step remains, propose the smallest source edit and verification command.',
      '- If you propose an AI-assisted file edit, return patch blocks in this exact format: ```<language> path: <relative/path> ... ```.',
      '- If you cannot produce a safe patch from the evidence, say that no patch is safe yet and name the missing evidence.',
      '- Do not present prose guidance as a completed repair; Studio must extract/apply a patch or run a verified deterministic step.',
      '- Never switch to a generic workspace answer while a card repair handoff is active.'
    );
  }

  if (forbidRerun && handoff?.sourceCommand && executionMode !== 'VERIFY_ONLY') {
    lines.push(
      '',
      'FIX-mode contract:',
      `- You already have failure evidence for ${handoff.cardLabel ?? handoff.cardId}.`,
      `- Propose or apply the smallest file/config/policy fix.`,
      `- Do NOT recommend re-running \`${handoff.sourceCommand}\` unless verify proves the fix failed.`,
      '- Do NOT put runnable shell commands in bash fences unless the mode is RUN_ONCE with zero prior runs.',
      '- After a fix, tell the operator to run the verify command once to refresh the card.'
    );
  } else if (executionMode === 'RUN_ONCE') {
    lines.push(
      '',
      'RUN_ONCE contract:',
      '- Missing artifact: run every distinct contract-authored causal producer once through the governed Studio bridge, then verify.',
      '- Do not propose a source edit while the declared evidence producer has not been observed.',
      '- Put the single runnable command in a bash fence if needed.'
    );
  } else if (executionMode !== 'VERIFY_ONLY') {
    lines.push(
      '',
      'Put runnable shell commands in bash code fences or inline code so Studio can expose Run/Copy actions.'
    );
  } else {
    lines.push(
      '',
      'VERIFY_ONLY contract:',
      `- Only recommend: ${handoff?.verifyCommand ?? DEFAULT_WORKSPACE_VERIFY_COMMAND}.`,
      '- Do not propose new fixes unless verify fails with new evidence.'
    );
  }

  lines.push('', input.task);
  return lines.join('\n');
}

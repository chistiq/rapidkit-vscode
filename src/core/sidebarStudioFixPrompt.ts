import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';
import { shouldForbidSourceCommandRerun } from './studioBlockerResolution.js';

export function buildSidebarStudioPrompt(input: {
  task: string;
  handoff?: StudioBlockerHandoff | null;
  studioMode?: 'investigate' | 'verify' | 'prepare';
}): string {
  const handoff = input.handoff;
  const executionMode = handoff?.studioMode;
  const forbidRerun =
    handoff != null &&
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
    'Return a clear next action, verification path, and any risk to check.',
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
      ...(handoff.blockers.length > 0
        ? [`- Blockers: ${handoff.blockers.slice(0, 4).join('; ')}`]
        : []),
      ...(handoff.verifyCommand ? [`- Verify after fix: ${handoff.verifyCommand}`] : [])
    );
  }

  if (forbidRerun && handoff?.sourceCommand) {
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
      '- Missing artifact: run the source command once via Studio bridge, then prompt verify.',
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
      `- Only recommend: ${handoff?.verifyCommand ?? 'workspace verify'}.`,
      '- Do not propose new fixes unless verify fails with new evidence.'
    );
  }

  lines.push('', input.task);
  return lines.join('\n');
}

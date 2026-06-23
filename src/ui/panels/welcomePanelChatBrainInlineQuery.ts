import * as vscode from 'vscode';
import path from 'node:path';

import { runningServers } from '../../core/runningServers';

/**
 * Build a natural-language query from an action type + optional payload.
 * Lets every action stream its answer INTO the Studio thread instead of
 * opening a separate modal.
 *
 * scopeIntent drives fundamentally different query content:
 * - 'workspace': reason across all projects, topology, shared health
 * - 'project': focus on the selected project's internals and runtime state
 */
export async function buildInlineQueryFromAction(
  actionType: string,
  payload?: Record<string, unknown>,
  scopeIntent: 'workspace' | 'project' = 'workspace'
): Promise<string> {
  const isWorkspaceScope = scopeIntent === 'workspace';

  // ── terminal-bridge ──────────────────────────────────────────────────────
  if (actionType === 'terminal-bridge') {
    let terminalOutput = '';
    try {
      const clip = (await vscode.env.clipboard.readText()).trim();
      if (clip && /\n|Error:|error:|Traceback|FAILED|npm ERR|❌/.test(clip)) {
        terminalOutput = clip.slice(0, 5000);
      }
    } catch {
      // clipboard unavailable — fall through to selection
    }
    if (!terminalOutput) {
      const editor = vscode.window.activeTextEditor;
      terminalOutput = editor?.document.getText(editor.selection).trim() ?? '';
    }
    if (terminalOutput) {
      const scopeLabel = isWorkspaceScope
        ? 'Identify which workspace projects are affected and provide workspace-wide remediation steps.'
        : 'Guide me to the fastest, safest fix for this project.';
      return [
        isWorkspaceScope
          ? 'Analyze this terminal output across the workspace context and identify affected services.'
          : 'Analyze this terminal output and guide me to the fastest, safest fix.',
        '```\n' + terminalOutput + '\n```',
        `Respond with: root cause, immediate fix steps, any code-level follow-up, a prevention tip. ${scopeLabel}`,
      ].join('\n\n');
    }
    return isWorkspaceScope
      ? 'Analyze all workspace projects for runtime errors, check logs and recent terminal output across services, then surface the highest-priority cross-workspace fix.'
      : 'Analyze my project for runtime errors, check logs and recent terminal output, then suggest the highest-priority fix.';
  }

  // ── fix-preview-lite ─────────────────────────────────────────────────────
  if (actionType === 'fix-preview-lite') {
    const editor = vscode.window.activeTextEditor;
    const selection = editor?.document.getText(editor.selection).trim();
    const fileName = editor?.document.fileName
      ? path.basename(editor.document.fileName)
      : 'current file';
    if (selection) {
      return [
        `Preview a fix for this code in \`${fileName}\`:`,
        '```\n' + selection.slice(0, 3000) + '\n```',
        'Provide: what is wrong, the corrected code, and a one-sentence explanation of the change.',
      ].join('\n\n');
    }
    const issueSummary = typeof payload?.issueSummary === 'string' ? payload.issueSummary : '';
    if (issueSummary) {
      return `Preview the safest fix for this issue: ${issueSummary}\n\nShow the corrected code and explain why the change is safe.`;
    }
    return isWorkspaceScope
      ? 'Scan all workspace projects for the most impactful bugs or code smells. For each project with issues, show a concrete fix preview with before/after code and note any cross-project propagation risk.'
      : 'Scan my project for the most impactful bug or code smell and show a concrete fix preview with before/after code.';
  }

  // ── change-impact-lite ───────────────────────────────────────────────────
  if (actionType === 'change-impact-lite') {
    const editor = vscode.window.activeTextEditor;
    const selection = editor?.document.getText(editor.selection).trim();
    const fileName = editor?.document.fileName
      ? path.basename(editor.document.fileName)
      : 'current file';
    if (selection) {
      const impactLens = isWorkspaceScope
        ? 'List: affected modules/files across ALL workspace projects, cross-service propagation risk, overall risk level (low/medium/high/critical), required test updates per service, and a safe workspace-wide rollout checklist.'
        : 'List: affected modules/files, risk level (low/medium/high/critical), required test updates, and a safe rollout checklist.';
      return [
        isWorkspaceScope
          ? `Analyze the workspace-wide blast radius of changing this code in \`${fileName}\`:`
          : `Analyze the blast radius of changing this code in \`${fileName}\`:`,
        '```\n' + selection.slice(0, 3000) + '\n```',
        impactLens,
      ].join('\n\n');
    }
    return isWorkspaceScope
      ? 'Analyze the entire workspace for the highest-risk pending changes or tech debt. Identify cross-project impact: which projects are coupled, what shared dependencies could cascade, and what the safest multi-project rollout sequence is.'
      : 'Analyze the current project for the highest-risk pending change or tech debt and estimate its impact on the rest of the project.';
  }

  // ── doctor-fix ───────────────────────────────────────────────────────────
  if (actionType === 'doctor-fix') {
    const issueSummary = typeof payload?.issueSummary === 'string' ? payload.issueSummary : '';
    const projectName = typeof payload?.projectName === 'string' ? payload.projectName : '';
    const issueType = typeof payload?.issueType === 'string' ? payload.issueType : '';
    if (issueSummary) {
      return [
        `Doctor detected an issue in project "${projectName || 'unknown'}":`,
        `Type: ${issueType || 'unknown'}`,
        `Detail: ${issueSummary}`,
        '',
        'Give me the exact fix commands or code changes to resolve this. Be direct and specific.',
        ...(isWorkspaceScope
          ? [
              'Also check whether this issue pattern affects other projects in the workspace and surface any shared root cause.',
            ]
          : []),
      ].join('\n');
    }
    return isWorkspaceScope
      ? 'Run a full workspace doctor check across ALL projects and summarize the top issues per project. Group issues by root cause where possible and provide workspace-wide fix steps.'
      : 'Run a full project doctor check and explain the top issues with their exact fix steps.';
  }

  // ── workspace-memory-wizard ───────────────────────────────────────────────
  if (actionType === 'workspace-memory-wizard') {
    return isWorkspaceScope
      ? [
          'Help me capture workspace-wide architecture decisions, conventions, and cross-project patterns into memory.',
          'Cover all projects in the workspace: shared patterns, deployment topology, cross-service contracts, and team conventions.',
          'Ask the most important questions to build a comprehensive workspace-level memory profile that benefits all projects.',
          'After my answers, generate a structured workspace memory summary that spans all projects.',
        ].join('\n')
      : [
          'Help me capture the key architecture decisions and conventions from this project into memory.',
          'Ask me the most important questions to build a complete project memory profile.',
          'After my answers, generate a structured memory summary I can save.',
        ].join('\n');
  }

  // ── recipe-pack ───────────────────────────────────────────────────────────
  if (actionType === 'recipe-pack') {
    const recipeId = typeof payload?.recipeId === 'string' ? payload.recipeId : '';
    if (recipeId) {
      return `Run the AI recipe "${recipeId}" for this ${isWorkspaceScope ? 'workspace (apply across all relevant projects)' : 'project'}. Provide a step-by-step analysis and actionable output.`;
    }
    return isWorkspaceScope
      ? 'List the 5 most relevant AI recipe workflows for this workspace topology and project mix, then run the highest-impact one across all applicable projects.'
      : 'List the 5 most relevant AI recipe workflows for my current project type, then run the top one.';
  }

  // ── incident-repro-pack (KF5) ─────────────────────────────────────────────
  if (actionType === 'incident-repro-pack') {
    const incidentScope =
      typeof payload?.incidentScope === 'string' ? payload.incidentScope.trim() : '';
    const incidentSummary =
      typeof payload?.incidentSummary === 'string' ? payload.incidentSummary.trim() : '';
    return [
      'Prepare a reproducible incident pack and replay brief from the current Incident Studio context.',
      incidentScope ? `Scope: ${incidentScope}` : '',
      incidentSummary ? `Incident summary: ${incidentSummary}` : '',
      '',
      'Return exactly these sections:',
      '1) Incident reproduction checklist (deterministic, step-by-step)',
      '2) Minimal evidence bundle (logs, diff, commands, environment)',
      '3) Sanitized share payload (what is safe to share and what must be redacted)',
      '4) Replay procedure for another developer and expected pass/fail signals',
    ]
      .filter(Boolean)
      .join('\n');
  }

  // ── apply-module-gen (A02) ────────────────────────────────────────────────
  if (actionType === 'apply-module-gen') {
    const featureIntent =
      typeof payload?.featureIntent === 'string' ? payload.featureIntent.trim() : '';
    const moduleName = typeof payload?.moduleName === 'string' ? payload.moduleName.trim() : '';
    const targetPath = typeof payload?.targetPath === 'string' ? payload.targetPath.trim() : '';
    return [
      featureIntent
        ? `Generate a complete, production-ready module for this feature: ${featureIntent}`
        : `Generate a complete module${moduleName ? ` named "${moduleName}"` : ''} for this workspace.`,
      targetPath ? `Target directory: ${targetPath}` : '',
      '',
      'IMPORTANT: For every file you create or modify, output it as a fenced code block with this format:',
      '```<language> path: <relative/path/to/file>',
      '// file content here',
      '```',
      '',
      'Decision Clarity Contract (required):',
      '1) Situation',
      '2) Why',
      '3) Impact scope (exact files/modules)',
      '4) Risk (confidence + mutating/non-mutating)',
      '5) Next safe step',
      '6) Verify plan (required commands)',
      '7) Rollback plan',
      '',
      'Include: all required source files, tests, and any configuration changes needed.',
      'After the code blocks, provide a brief summary of what was generated and verification steps.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  // ── apply-debug-patch (A03) ───────────────────────────────────────────────
  if (actionType === 'apply-debug-patch') {
    const traceText = typeof payload?.traceText === 'string' ? payload.traceText.trim() : '';
    const logContext = typeof payload?.logContext === 'string' ? payload.logContext.trim() : '';
    const issueSummary =
      typeof payload?.issueSummary === 'string' ? payload.issueSummary.trim() : '';
    const parts: string[] = [];
    if (traceText) {
      parts.push(`Stack trace / error:\n\`\`\`\n${traceText.slice(0, 4000)}\n\`\`\``);
    }
    if (logContext) {
      parts.push(`Relevant log context:\n\`\`\`\n${logContext.slice(0, 2000)}\n\`\`\``);
    }
    if (issueSummary) {
      parts.push(`Issue description: ${issueSummary}`);
    }
    parts.push(
      '',
      'Provide a concrete patch to fix this issue.',
      'IMPORTANT: For every file you create or modify, output it as a fenced code block with this format:',
      '```<language> path: <relative/path/to/file>',
      '// patched content here',
      '```',
      '',
      'Decision Clarity Contract (required):',
      '1) Situation',
      '2) Why',
      '3) Impact scope (exact files/modules)',
      '4) Risk (confidence + mutating/non-mutating)',
      '5) Next safe step',
      '6) Verify plan (required commands)',
      '7) Rollback plan',
      '',
      'After the code blocks: explain the root cause, why this patch fixes it, and any required verification commands.'
    );
    if (!traceText && !issueSummary) {
      return 'Scan my workspace for the most likely active bug or error, then generate a targeted patch with before/after code blocks per file.';
    }
    return parts.filter(Boolean).join('\n');
  }

  // ── inline-command (A01) ─────────────────────────────────────────────────
  if (actionType === 'inline-command') {
    const command =
      typeof payload?.command === 'string' && payload.command.trim() ? payload.command.trim() : '';
    return [
      command
        ? `Analyze and safely execute this inline command intent: ${command}`
        : 'Analyze and safely execute an inline command for this incident context.',
      'Use fail-closed behavior for mutating steps and never claim completion without deterministic verify evidence.',
      '',
      'Return exactly these sections:',
      '1) Situation',
      '2) Why',
      '3) Impact scope (exact files/modules)',
      '4) Risk (confidence + mutating/non-mutating)',
      '5) Next safe step',
      '6) Verify plan (required commands)',
      '7) Rollback plan',
    ].join('\n');
  }

  // ── release-readiness-commander (KF9) ───────────────────────────────────
  if (actionType === 'release-readiness-commander') {
    return isWorkspaceScope
      ? [
          'Build a release readiness decision for ALL projects in this workspace.',
          'Evaluate cross-project health, dependency state, and go/no-go criteria for each service.',
          'Use strict verify-first and evidence-first policy.',
          '',
          'Return exactly these sections:',
          '1) Workspace Decision: GO or NO-GO',
          '2) Per-project status: list each project with its individual GO / NO-GO and top blocking reason',
          '3) Cross-project blockers: shared risks that affect multiple services',
          '4) Evidence summary (verify/sandbox/doctor/scope per workspace)',
          '5) Recommended next safe step (workspace-wide)',
        ].join('\n')
      : [
          'Build a release readiness decision for this project.',
          'Use strict verify-first and evidence-first policy.',
          '',
          'Return exactly these sections:',
          '1) Decision: GO or NO-GO',
          '2) Blocking reasons',
          '3) Evidence summary (verify/sandbox/doctor/scope)',
          '4) Recommended next safe step',
        ].join('\n');
  }

  // ── browser-smoke-test (VSC-1119 browser agent tools) ───────────────────
  if (actionType === 'browser-smoke-test') {
    const targetPath = typeof payload?.projectPath === 'string' ? payload.projectPath.trim() : '';
    let devUrl = 'http://localhost:8000';

    // Detect running dev server port from the runningServers registry
    if (targetPath) {
      const runningTerminal = runningServers.get(targetPath);
      if (runningTerminal) {
        const portMatch = runningTerminal.name.match(/:([0-9]+)/);
        if (portMatch) {
          devUrl = `http://localhost:${portMatch[1]}`;
        }
      }
    }

    // Open VS Code simple browser to the dev URL (best-effort)
    try {
      await vscode.commands.executeCommand('simpleBrowser.show', devUrl);
    } catch {
      // simpleBrowser unavailable — browser tools will handle navigation
    }

    return [
      `Run a browser smoke test against the project at: ${devUrl}`,
      '',
      'Using VS Code browser agent tools (VS Code 1.119+), verify the following:',
      '1) The root URL loads without errors and returns HTTP 2xx',
      '2) Key UI surfaces render: main page, API docs (/docs or /swagger), and health endpoint (/health or /actuator/health)',
      '3) No JavaScript console errors on initial load',
      '4) Critical interactive elements are visible and not broken',
      '',
      'Return exactly these sections:',
      '1) Smoke result: PASS or FAIL',
      '2) Verified endpoints (URL → status code → pass/fail)',
      '3) Detected issues (if any)',
      '4) Recommended next step',
    ].join('\n');
  }

  // ── verify-pack-autopilot ───────────────────────────────────────────────
  if (actionType === 'verify-pack-autopilot') {
    return isWorkspaceScope
      ? [
          'Generate a deterministic verify command pack for ALL projects in this workspace.',
          'Start with workspace-wide health checks, then per-project verify commands.',
          'Prioritize by cross-project risk and confidence.',
          'Flag blockers that prevent workspace-level completion claim.',
          'Return exactly these sections:',
          '1) Workspace verify pack quality score (0-100)',
          '2) Workspace-wide required checks (max 3)',
          '3) Per-project required commands (max 2 per project)',
          '4) Blocking reasons (workspace-level and per-project)',
        ].join('\n')
      : [
          'Generate a deterministic verify command pack for this incident context.',
          'Prioritize commands by confidence and execution scope (workspace vs project).',
          'Flag blockers that still prevent completion claim.',
          'Return exactly these sections:',
          '1) Verify pack quality score (0-100)',
          '2) Required commands (max 3)',
          '3) Optional commands (max 2)',
          '4) Blocking reasons (if any)',
        ].join('\n');
  }

  // ── generic/orchestrate fallback ──────────────────────────────────────────
  const label = typeof payload?.label === 'string' ? payload.label : actionType;
  const scopeLabel = isWorkspaceScope ? 'workspace (across all projects)' : 'project';
  return `Perform the following action for my ${scopeLabel}: ${label}. Analyze the current state and provide specific, actionable guidance.`;
}

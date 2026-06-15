export type RoutingResult = {
  actionType:
    | 'terminal-bridge'
    | 'change-impact-lite'
    | 'fix-preview-lite'
    | 'verify-pack-autopilot'
    | 'workspace-memory-wizard'
    | 'doctor-fix'
    | 'recipe-pack'
    | 'apply-module-gen'
    | 'incident-repro-pack'
    | 'release-readiness-commander'
    | 'browser-smoke-test'
    | 'orchestrate';
  fallbackReason:
    | 'success'
    | 'terminal_bridge_fallback'
    | 'fix_preview_fallback'
    | 'bare_keyword_only'
    | 'orchestrate_default';
};

export function routeIncidentActionTypeFromMessage(message: string): RoutingResult {
  const normalized = message.toLowerCase();

  if (
    normalized.includes('release readiness') ||
    normalized.includes('go/no-go') ||
    normalized.includes('go no-go') ||
    normalized.includes('ship readiness') ||
    normalized.includes('release gate') ||
    normalized.includes('commander artifact')
  ) {
    return { actionType: 'release-readiness-commander', fallbackReason: 'success' };
  }
  if (
    normalized.includes('verify pack') ||
    normalized.includes('verification pack') ||
    normalized.includes('proof of success') ||
    normalized.includes('verify checklist') ||
    normalized.includes('deterministic verify')
  ) {
    return { actionType: 'verify-pack-autopilot', fallbackReason: 'success' };
  }
  if (
    normalized.includes('browser smoke') ||
    normalized.includes('smoke test') ||
    normalized.includes('ui smoke') ||
    normalized.includes('browser test') ||
    normalized.includes('browser check') ||
    normalized.includes('verify ui') ||
    normalized.includes('verify browser') ||
    normalized.includes('open browser')
  ) {
    return { actionType: 'browser-smoke-test', fallbackReason: 'success' };
  }
  if (
    normalized.includes('repro') ||
    normalized.includes('replay') ||
    normalized.includes('incident pack') ||
    normalized.includes('share incident')
  ) {
    return { actionType: 'incident-repro-pack', fallbackReason: 'success' };
  }
  if (
    normalized.includes('install') &&
    (normalized.includes('module') ||
      normalized.includes('catalog') ||
      normalized.includes('package'))
  ) {
    return { actionType: 'apply-module-gen', fallbackReason: 'success' };
  }
  if (
    normalized.includes('recipe') ||
    normalized.includes('starter template') ||
    normalized.includes('project template') ||
    normalized.includes('scaffold')
  ) {
    return { actionType: 'recipe-pack', fallbackReason: 'success' };
  }

  // DevOps/ops guidance is routed to doctor-fix because it enforces runtime health-first actions.
  if (
    normalized.includes('devops') ||
    normalized.includes('ci/cd') ||
    normalized.includes('pipeline') ||
    normalized.includes('kubernetes') ||
    normalized.includes('helm') ||
    normalized.includes('docker compose') ||
    normalized.includes('dockerfile')
  ) {
    return { actionType: 'doctor-fix', fallbackReason: 'success' };
  }

  // Database/schema work should pass through impact route before mutation.
  if (
    normalized.includes('database') ||
    normalized.includes('sql') ||
    normalized.includes('schema') ||
    normalized.includes('migration') ||
    normalized.includes('postgres') ||
    normalized.includes('mysql') ||
    normalized.includes('mongodb')
  ) {
    return { actionType: 'change-impact-lite', fallbackReason: 'success' };
  }

  // Documentation requests default to memory/convention assistant path.
  if (
    normalized.includes('documentation') ||
    normalized.includes('docs') ||
    normalized.includes('readme') ||
    normalized.includes('runbook') ||
    normalized.includes('adr')
  ) {
    return { actionType: 'workspace-memory-wizard', fallbackReason: 'success' };
  }

  if (
    (normalized.includes('doctor') && normalized.includes('fix')) ||
    (normalized.includes('doctor') && normalized.includes('error')) ||
    normalized.includes('workspace health') ||
    normalized.includes('fix workspace') ||
    normalized.includes('rapidkit doctor')
  ) {
    return { actionType: 'doctor-fix', fallbackReason: 'success' };
  }

  const hasExplicitTerminalSignal =
    normalized.includes('traceback') ||
    normalized.includes('stack trace') ||
    normalized.includes('exception') ||
    normalized.includes('terminal') ||
    normalized.includes('timeout') ||
    (normalized.includes('error') &&
      (normalized.includes('line ') ||
        normalized.includes('at ') ||
        normalized.includes('crash') ||
        normalized.includes('stderr') ||
        normalized.includes('exit code') ||
        normalized.includes('segfault') ||
        normalized.includes('killed')));

  if (hasExplicitTerminalSignal) {
    return { actionType: 'terminal-bridge', fallbackReason: 'success' };
  }

  if (
    normalized.includes('impact') ||
    normalized.includes('risk') ||
    normalized.includes('architecture') ||
    normalized.includes('blast radius') ||
    normalized.includes('refactor plan')
  ) {
    return { actionType: 'change-impact-lite', fallbackReason: 'success' };
  }

  const hasPatchPreviewContext =
    normalized.includes('preview') ||
    normalized.includes('patch') ||
    (normalized.includes('fix') &&
      (normalized.includes('code') ||
        normalized.includes('function') ||
        normalized.includes('class') ||
        normalized.includes('module') ||
        normalized.includes('import') ||
        normalized.includes('bug') ||
        normalized.includes('file')));

  if (hasPatchPreviewContext) {
    return { actionType: 'fix-preview-lite', fallbackReason: 'success' };
  }

  if (normalized.includes('memory') || normalized.includes('convention')) {
    return { actionType: 'workspace-memory-wizard', fallbackReason: 'success' };
  }

  if (
    normalized.includes('error') ||
    normalized.includes('fix') ||
    normalized.includes('failing') ||
    normalized.includes('broken')
  ) {
    const barefallbackReason = normalized.includes('error')
      ? 'bare_keyword_only'
      : normalized.includes('fix')
        ? 'fix_preview_fallback'
        : 'bare_keyword_only';
    return { actionType: 'terminal-bridge', fallbackReason: barefallbackReason };
  }

  return { actionType: 'orchestrate', fallbackReason: 'orchestrate_default' };
}

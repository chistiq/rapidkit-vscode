import type { WorkspaceCreationFailure } from './workspaceCreationService.js';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function describePortableCreationFailure(
  error: unknown,
  workspaceName: string,
  phase: WorkspaceCreationFailure['phase'] = 'create'
): WorkspaceCreationFailure {
  const technicalMessage = errorText(error);
  const normalized = technicalMessage.toLowerCase();
  const errorCode =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code ?? '').toLowerCase()
      : '';

  if (
    errorCode === 'runtime-missing' ||
    errorCode === 'runtime-unsupported-host' ||
    (normalized.includes('bundled workspai cli') && normalized.includes('missing'))
  ) {
    return {
      ok: false,
      code: 'runtime-unavailable',
      message:
        'The verified Workspai runtime is unavailable. Reload VS Code, then retry this creation.',
      technicalMessage,
      retryable: true,
      phase: 'runtime',
    };
  }
  if (
    errorCode === 'python-runtime-unavailable' ||
    errorCode === 'python-version-unsupported' ||
    errorCode === 'python-venv-unavailable' ||
    normalized.includes('python venv support') ||
    normalized.includes('python venv package') ||
    normalized.includes('pipx is not installed') ||
    normalized.includes('poetry is not installed')
  ) {
    return {
      ok: false,
      code: 'runtime-unavailable',
      message: technicalMessage,
      technicalMessage,
      retryable: false,
      phase: 'preflight',
    };
  }
  if (
    errorCode === 'runtime-corrupt' ||
    errorCode === 'runtime-incompatible' ||
    normalized.includes('integrity verification')
  ) {
    return {
      ok: false,
      code: 'runtime-integrity-failed',
      message:
        'The bundled Workspai runtime failed its integrity check. Reinstall the extension before retrying.',
      technicalMessage,
      retryable: false,
      phase: 'runtime',
    };
  }
  if (errorCode === 'enospc' || /\benospc\b|no space left on device/i.test(technicalMessage)) {
    return {
      ok: false,
      code: 'disk-space-exhausted',
      message: `Workspai could not finish creating “${workspaceName}” because the filesystem ran out of space (ENOSPC). Free space on the destination/cache filesystem or choose another location, then inspect any partial output before continuing.`,
      technicalMessage,
      retryable: false,
      phase,
    };
  }
  if (normalized.includes('enotempty') && normalized.includes('_npx')) {
    return {
      ok: false,
      code: 'runtime-cache-conflict',
      message:
        'The legacy npm runtime cache was busy. Retry once; the extension will reuse one serialized runtime operation.',
      technicalMessage,
      retryable: true,
      phase: 'runtime',
    };
  }
  if (
    errorCode === 'eacces' ||
    errorCode === 'eperm' ||
    /\b(eacces|eperm)\b/i.test(technicalMessage)
  ) {
    return {
      ok: false,
      code: 'permission-denied',
      message: `Workspai could not create “${workspaceName}” with the current filesystem permissions.`,
      technicalMessage,
      retryable: false,
      phase,
    };
  }
  return {
    ok: false,
    code: 'creation-failed',
    message: `Workspai could not finish creating “${workspaceName}”. Review any partial output, then start a fresh creation plan.`,
    technicalMessage,
    retryable: false,
    phase,
  };
}

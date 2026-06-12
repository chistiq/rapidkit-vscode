const SECRET_PATTERNS: RegExp[] = [
  /\bAuthorization\s*[:=]\s*Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b([A-Za-z0-9_]*api[_-]?key|token|secret|password|authorization)\s*[:=]\s*["']?[^"'\s,}]+/gi,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\bsk-[A-Za-z0-9._-]+/gi,
  /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g,
  /\b[A-Za-z0-9+/]{32,}={0,2}\b/g,
];

export function redactAIActionText(value: string): string {
  return SECRET_PATTERNS.reduce(
    (next, pattern) =>
      next.replace(pattern, (match) => {
        const keyMatch = match.match(/^([A-Za-z_-]+)\s*[:=]/);
        if (keyMatch?.[1]) {
          return `${keyMatch[1]}=[redacted]`;
        }
        if (/^Bearer\s+/i.test(match)) {
          return 'Bearer [redacted]';
        }
        if (/^Authorization\s*[:=]\s*Bearer\s+/i.test(match)) {
          return 'Authorization=[redacted]';
        }
        if (/^sk-/i.test(match)) {
          return 'sk-[redacted]';
        }
        return '[redacted]';
      }),
    value
  );
}

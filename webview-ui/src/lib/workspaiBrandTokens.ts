import type { CSSProperties } from 'react';

/** Stack / toolchain brand accents — hex values live only in workspai-tokens.css */
export const wsBrand = {
  muted: 'var(--ws-brand-muted)',
  python: 'var(--ws-brand-python)',
  node: 'var(--ws-brand-node)',
  core: 'var(--ws-brand-core)',
  cli: 'var(--ws-brand-cli)',
  pip: 'var(--ws-brand-pip)',
  pipx: 'var(--ws-brand-pipx)',
  poetry: 'var(--ws-brand-poetry)',
  go: 'var(--ws-brand-go)',
  java: 'var(--ws-brand-java)',
  maven: 'var(--ws-brand-maven)',
  gradle: 'var(--ws-brand-gradle)',
  dotnet: 'var(--ws-brand-dotnet)',
  spring: 'var(--ws-brand-spring)',
  fastapi: 'var(--ws-brand-fastapi)',
  nestjs: 'var(--ws-brand-nestjs)',
  polyglot: 'var(--ws-brand-polyglot)',
  enterprise: 'var(--ws-brand-enterprise)',
} as const;

export function brandMonogramStyle(color: string): CSSProperties {
  return {
    background: `color-mix(in srgb, ${color} 13%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} 33%, transparent)`,
    color,
  };
}

/**
 * One-shot extractor: globalStyles.tsx template → workspai-studio-chrome.css
 * Run: node scripts/extract-studio-chrome-css.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const globalStylesPath = path.join(
  repoRoot,
  'webview-ui/src/components/StudioRedesign/styles/globalStyles.tsx'
);
const outPath = path.join(repoRoot, 'webview-ui/src/styles/workspai-studio-chrome.css');

const source = fs.readFileSync(globalStylesPath, 'utf8');
const match = source.match(/<style>\{\`([\s\S]*)\`\}<\/style>/);
if (!match) {
  throw new Error('Could not extract CSS template from globalStyles.tsx');
}

let css = match[1];

const replacements = [
  ['${colorTokens.text.primary}', 'var(--ws-text)'],
  ['${colorTokens.text.secondary}', 'var(--ws-text)'],
  ['${colorTokens.text.tertiary}', 'var(--ws-text-muted)'],
  ['${colorTokens.text.quaternary}', 'var(--ws-text-subtle)'],
  ['${colorTokens.text.high}', 'var(--ws-text)'],
  ['${colorTokens.text.medium}', 'var(--ws-text)'],
  ['${colorTokens.text.muted}', 'var(--ws-text-muted)'],
  ['${colorTokens.text.subtle}', 'var(--ws-text-subtle)'],
  ['${colorTokens.surface1}', 'var(--ws-surface)'],
  ['${colorTokens.surface2}', 'var(--ws-surface-raised)'],
  ['${colorTokens.surface3}', 'color-mix(in srgb, var(--ws-surface-raised) 88%, transparent)'],
  ['${colorTokens.surface4}', 'var(--ws-surface-input)'],
  ['${colorTokens.canvas}', 'var(--ws-surface)'],
  ['${colorTokens.root}', 'var(--ws-surface)'],
  ['${colorTokens.border.subtle}', 'var(--ws-border-subtle)'],
  ['${colorTokens.border.medium}', 'var(--ws-border)'],
  ['${colorTokens.border.strong}', 'var(--ws-focus)'],
  ['${colorTokens.primary}', 'var(--ws-accent)'],
  ['${colorTokens.primaryHover}', 'color-mix(in srgb, var(--ws-accent) 78%, var(--ws-text))'],
  ['${colorTokens.primaryActive}', 'color-mix(in srgb, var(--ws-accent) 62%, var(--ws-text))'],
  ['${colorTokens.primaryInverse}', 'color-mix(in srgb, var(--ws-accent) 11%, transparent)'],
  ['${colorTokens.accent}', 'var(--ws-primary)'],
  ['${colorTokens.accentHover}', 'color-mix(in srgb, var(--ws-primary) 78%, var(--ws-text))'],
  ['${colorTokens.teal}', 'var(--ws-accent)'],
  ['${colorTokens.tealHover}', 'color-mix(in srgb, var(--ws-accent) 78%, var(--ws-text))'],
  ['${colorTokens.success}', 'var(--ws-success)'],
  ['${colorTokens.successBg}', 'color-mix(in srgb, var(--ws-success) 14%, transparent)'],
  ['${colorTokens.warning}', 'var(--ws-warn)'],
  ['${colorTokens.warningBg}', 'color-mix(in srgb, var(--ws-warn) 16%, transparent)'],
  ['${colorTokens.error}', 'var(--ws-error)'],
  ['${colorTokens.errorBg}', 'color-mix(in srgb, var(--ws-error) 14%, transparent)'],
  ['${colorTokens.health.ok}', 'var(--ws-success)'],
  ['${colorTokens.health.warning}', 'var(--ws-warn)'],
  ['${colorTokens.health.error}', 'var(--ws-error)'],
  ['${colorTokens.health.unknown}', 'var(--ws-text-muted)'],
  ['${fontTokens.ui}', 'var(--ws-font-ui)'],
  ['${fontTokens.mono}', 'var(--vscode-editor-font-family, monospace)'],
  ['${spacing.xs}', 'var(--ws-space-xs)'],
  ['${spacing.sm}', 'var(--ws-space-sm)'],
  ['${spacing.md}', 'var(--ws-space-md)'],
  ['${spacing.lg}', 'var(--ws-space-lg)'],
  ['${spacing.xl}', 'var(--ws-space-xl)'],
  ['${spacing.xxl}', '32px'],
  ['${spacing.xxxl}', '40px'],
  ['${gridBaseline}', '8'],
  ['${typography.h1.fontSize}', '18px'],
  ['${typography.h1.fontWeight}', '850'],
  ['${typography.h1.lineHeight}', '1.25'],
  ['${typography.h1.letterSpacing}', '-0.3px'],
  ['${typography.h2.fontSize}', '14px'],
  ['${typography.h2.fontWeight}', '850'],
  ['${typography.h2.lineHeight}', '1.35'],
  ['${typography.h2.letterSpacing}', '-0.1px'],
  ['${typography.h3.fontSize}', '13px'],
  ['${typography.h3.fontWeight}', '700'],
  ['${typography.h3.lineHeight}', '1.4'],
  ['${typography.body.fontSize}', '13px'],
  ['${typography.body.lineHeight}', '1.55'],
  ['${typography.caption.fontSize}', '10.5px'],
  ['${typography.caption.lineHeight}', '1.4'],
  ['${typography.code.fontSize}', '12px'],
  ['${typography.display.fontSize}', '22px'],
  ['${typography.display.fontWeight}', '850'],
  ['${typography.display.lineHeight}', '1.15'],
  ['${typography.display.letterSpacing}', '-0.4px'],
  ['${typography.labelSmall.fontSize}', '10px'],
  ['${typography.labelSmall.fontWeight}', '850'],
  ['${typography.labelSmall.letterSpacing}', '0.08em'],
  ['${typography.label.fontSize}', '10.5px'],
  ['${typography.label.fontWeight}', '750'],
  ['${typography.label.letterSpacing}', '0.02em'],
  ['${typography.bodySmall.fontSize}', '11px'],
  ['${typography.bodySmall.fontWeight}', '500'],
  ['${typography.bodySmall.lineHeight}', '1.45'],
  ['${typography.bodyLarge.fontSize}', '13px'],
  ['${typography.bodyLarge.fontWeight}', '400'],
  ['${typography.bodyLarge.lineHeight}', '1.6'],
  ['${typography.captionSmall.fontSize}', '10.5px'],
  ['${typography.captionSmall.fontWeight}', '700'],
  ['${typography.captionSmall.lineHeight}', '1.35'],
  ['${typography.captionSmall.letterSpacing}', '0.02em'],
  ['${typography.headingSmall.fontSize}', '11px'],
  ['${typography.headingSmall.fontWeight}', '750'],
  ['${typography.headingSmall.lineHeight}', '1.4'],
  ['${typography.heading.fontSize}', '12px'],
  ['${typography.heading.fontWeight}', '750'],
  ['${typography.heading.lineHeight}', '1.45'],
  ['${borderRadius.xs}', 'var(--ws-radius-sm)'],
  ['${borderRadius.sm}', 'var(--ws-radius-sm)'],
  ['${borderRadius.md}', 'var(--ws-radius-md)'],
  ['${borderRadius.lg}', 'var(--ws-radius-lg)'],
  ['${borderRadius.xl}', '12px'],
  ['${borderRadius.full}', '999px'],
  ['${shadows.xs}', 'none'],
  ['${shadows.sm}', 'none'],
  ['${shadows.md}', 'none'],
  ['${shadows.lg}', 'none'],
  ['${shadows.xl}', 'none'],
  ['${shadows.elevation1}', 'none'],
  ['${shadows.elevation2}', 'none'],
  ['${transitions.microInteraction}', 'color 120ms cubic-bezier(0.4, 0, 0.2, 1), background-color 120ms cubic-bezier(0.4, 0, 0.2, 1), border-color 120ms cubic-bezier(0.4, 0, 0.2, 1)'],
  ['${transitions.standard}', 'all 180ms cubic-bezier(0.4, 0, 0.2, 1)'],
  ['${transitions.emphasized}', 'all 260ms cubic-bezier(0.22, 1, 0.36, 1)'],
  ['${layout.activityBar}', '42px'],
  ['${layout.contextPanel}', '280px'],
];

for (const [from, to] of replacements) {
  css = css.split(from).join(to);
}

if (/\$\{/.test(css)) {
  const leftovers = [...css.matchAll(/\$\{[^}]+\}/g)].map((m) => m[0]);
  console.warn('Unresolved interpolations:', [...new Set(leftovers)].slice(0, 20));
}

const header = `/**
 * Incident Studio component chrome — extracted from globalStyles.tsx.
 * Uses --ws-* tokens; theme follows VS Code via WorkspaiThemeProvider.
 */

`;

fs.writeFileSync(outPath, header + css.trimStart());
console.log(`Wrote ${outPath} (${css.length} chars)`);

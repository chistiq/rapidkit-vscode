/**
 * CI guard: workspai-studio-chrome.css stays token-backed and complete.
 * Run: node scripts/verify-studio-chrome-css.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const chromePath = path.join(repoRoot, 'webview-ui/src/styles/workspai-studio-chrome.css');
const globalStylesPath = path.join(
  repoRoot,
  'webview-ui/src/components/StudioRedesign/styles/globalStyles.tsx',
);

const css = fs.readFileSync(chromePath, 'utf8');
const globalStyles = fs.readFileSync(globalStylesPath, 'utf8');

const MIN_BYTES = 30_000;
const requiredSelectors = [
  '.studio-sidebar',
  '.studio-shell',
  '.studio-signal-row',
  '.studio-approval-card',
  '.studio-context-section',
];

const failures = [];

if (css.length < MIN_BYTES) {
  failures.push(`Chrome CSS too small: ${css.length} bytes (minimum ${MIN_BYTES})`);
}

if (/\$\{/.test(css)) {
  failures.push('Chrome CSS contains unresolved template interpolations');
}

if (!css.includes('var(--ws-accent)')) {
  failures.push('Chrome CSS missing var(--ws-accent)');
}

for (const selector of requiredSelectors) {
  if (!css.includes(selector)) {
    failures.push(`Chrome CSS missing selector: ${selector}`);
  }
}

if (!globalStyles.includes('() => null')) {
  failures.push('globalStyles.tsx must remain a stub — chrome lives in workspai-studio-chrome.css');
}

if (failures.length > 0) {
  console.error('Studio chrome verification failed:');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(`OK: studio chrome CSS verified (${css.length} bytes)`);

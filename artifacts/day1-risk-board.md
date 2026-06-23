# Day 1 Risk Board (Evidence-backed)

Generated at: 2026-05-13 (local)
Owner: Engineering

## Top Risk Items (from current diff)

1. Release gate behavior tightening (`scripts/release-stop-gate.mjs`)
- Risk: stricter telemetry/schema gates can block release in malformed marker environments.
- Owner: Engineering
- ETA: Day 6 claim/parity completion.

2. Incident replay sanitization behavior shift (`src/ui/panels/incidentReproPackUtils.ts`)
- Risk: legacy tests/consumers expecting unsanitized paths/text may regress.
- Owner: Engineering + QA
- ETA: same day regression validation.

3. CI issue-report artifact path migration (`.github/workflows/extension-smoke-matrix.yml`)
- Risk: external scripts expecting old `releases/open-issues-report.json` path can fail.
- Owner: DevOps
- ETA: before Day 7 go/no-go.

## Evidence Inputs

- Changed surfaces: `artifacts/day1-risk-board-changed-surfaces.txt`
- Patch size: `artifacts/day1-risk-board-shortstat.txt`
- Baseline critical suites: `artifacts/day1-baseline-critical-suites.log` (98/98 pass)

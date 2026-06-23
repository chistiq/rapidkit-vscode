# Day 6 Patch Candidate Diff/Stat and Regression Impact Note

Generated at: 2026-05-13T00:00:00Z (local)
Repository: rapidkitlabs/rapidkit-vscode
Candidate: v0.28.1-rc (stabilization)

## Diff Summary

- Files changed: 9
- Insertions: 620
- Deletions: 76
- Net lines: +544

## Diff Stat (git --no-pager diff --stat)

```text
.github/workflows/extension-smoke-matrix.yml |   4 +-
.gitignore                                   |   4 +-
scripts/export-open-issues-report.mjs        |   2 +-
scripts/release-stop-gate.mjs                | 254 ++++++++++++++++++++++++++-
src/core/workspaceMemoryService.ts           |   9 +-
src/test/driftGuard.test.ts                  |   2 +-
src/test/incidentReproPackUtils.test.ts      | 170 +++++++++++++++++-
src/test/workspaceMemoryService.test.ts      |  62 +++++++
src/ui/panels/incidentReproPackUtils.ts      | 189 +++++++++++++-------
9 files changed, 620 insertions(+), 76 deletions(-)
```

## Changed Files

- .github/workflows/extension-smoke-matrix.yml
- .gitignore
- scripts/export-open-issues-report.mjs
- scripts/release-stop-gate.mjs
- src/core/workspaceMemoryService.ts
- src/test/driftGuard.test.ts
- src/test/incidentReproPackUtils.test.ts
- src/test/workspaceMemoryService.test.ts
- src/ui/panels/incidentReproPackUtils.ts

## Regression Impact Assessment

### High-impact surfaces

1. release governance/gating:
   - `scripts/release-stop-gate.mjs`
   - Impact: gate behavior tightened (telemetry integrity + issue report freshness)
   - Risk: release may block in environments with malformed marker telemetry or stale/missing issue reports

2. incident repro/replay utility path:
   - `src/ui/panels/incidentReproPackUtils.ts`
   - Impact: stronger sanitization and path normalization, rollback guard injection for high-risk replay
   - Risk: legacy expectations can fail if tests assume old unsanitized format

3. memory policy boundary enforcement:
   - `src/core/workspaceMemoryService.ts`
   - Impact: fail-closed local-processing behavior for strict/sensitive policy
   - Risk: any flow assuming permissive fallback may be rejected

### Medium-impact surfaces

1. CI route pathing for issue report artifact:
   - `.github/workflows/extension-smoke-matrix.yml`
   - `scripts/export-open-issues-report.mjs`
   - `src/test/driftGuard.test.ts`
   - Impact: issue report path standardized to `artifacts/open-issues-report.json`
   - Risk: external scripts still expecting `releases/open-issues-report.json` will fail unless updated

2. local ignore behavior:
   - `.gitignore`
   - Impact: local/internal artifacts excluded from source control

## Evidence Snapshot

- Targeted stabilization suites: 98/98 passing
  - command:
    `npm test -- src/test/incidentReproPackUtils.test.ts src/test/workspaceMemoryService.test.ts src/test/releaseStopGateScript.test.ts src/test/incidentStudioPayload.test.ts src/test/driftGuard.test.ts`
- Drift guard path-contract validation: 15/15 passing
  - command:
    `npm test -- src/test/driftGuard.test.ts`

## Recommendation

- Patch candidate is acceptable for continued stabilization as `v0.28.1-rc`, with focus on:
  1. Monitoring false-positive gate blocks from telemetry integrity checks.
  2. Confirming downstream automation compatibility with new issue-report artifact path.
  3. Keeping replay sanitization assertions synchronized with security-hardening behavior.

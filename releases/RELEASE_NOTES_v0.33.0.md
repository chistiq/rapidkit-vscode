# Release Notes v0.33.0

## v0.33.0 (June 8, 2026)

### .NET Setup Runtime and Enterprise Profile Parity

This release packages the extension hardening work after `v0.32.1`. The previous tag was pushed but not published to the marketplace, so this release moves the public package forward as `0.33.0` with the completed runtime/profile parity work.

## Highlights

- **Full .NET setup runtime support**
  - Setup Runtime now offers `.NET` next to Python, Node.js, Go, and Java.
  - The setup dashboard detects `.NET`, verifies the configured runtime, opens official install guidance, and reports `.NET SDK 8+` readiness.
  - Manual runtime path checks now include `dotnet`.

- **dotnet-only workspace profile**
  - Added `dotnet-only` to workspace creation profiles across schemas, TypeScript types, completion, hover help, AI creation, command reference, and the workspace creation modal.
  - Polyglot and enterprise profile copy now explicitly includes `.NET`.

- **Extension/npm parity hardening**
  - Drift guards now assert that `.NET` remains visible in command palette setup, setup dashboard, and command center copy.
  - Runtime command and import-stack parity contracts remain synchronized with RapidKit npm.

- **Test and release-gate stability**
  - Release stop-gate script tests now run child Node processes in a clean CLI environment.
  - RapidKit CLI fallback tests now reset mocks between cases and follow the actual direct-binary-to-npx fallback order.

## Validation

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
./node_modules/.bin/eslint src --ext ts --max-warnings 100
node scripts/sync-import-stack-parity-snapshot.mjs --check
node esbuild.js --production
cd webview-ui && node esbuild.js
```

Release posture: `runtime-profile-parity-and-extension-stabilization`

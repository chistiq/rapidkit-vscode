# Release Notes v0.32.1

## v0.32.1 (June 8, 2026)

### ✦ Runtime Command Surface Parity and Module Boundary Hardening

This patch brings the Workspai VS Code extension into alignment with the latest RapidKit npm command surface. It focuses on command-contract correctness, module-support boundaries, and dashboard/AI copy that reflects what each runtime can actually do.

## Highlights

- **Shared runtime command surface contract**
  - Added `contracts/runtime-command-surface.v1.json`.
  - Captures supported scaffold kits, lifecycle commands, universal commands, runtime tiers, and module marketplace boundaries.
  - Adds parity tests so extension-facing surfaces stay aligned with RapidKit npm.

- **Pinned npm wrapper execution**
  - Extension-host RapidKit calls now use `npx --yes --package rapidkit rapidkit ...`.
  - This avoids ambiguous local/global launcher resolution across Windows, macOS, and Linux.
  - Setup, update checks, kit listing, AI module installs, and user-facing command snippets now use the same command contract.

- **Module support boundaries**
  - AI module suggestions are available only for FastAPI and NestJS projects.
  - Go, Spring Boot, and .NET remain scaffold/import/runtime-supported, but use native package ecosystems instead of the RapidKit module marketplace.
  - The AI creation modal now shows correct native-package guidance for Go, Spring Boot, and .NET.

- **Dashboard and documentation alignment**
  - Command Reference, Quick Links, Module Browser, Module Details, setup flows, README examples, and Studio command snippets were updated to current CLI syntax.
  - Stale `rapidkit doctor --scope=workspace` and raw `rapidkit add module` snippets were replaced with current scoped/pinned commands.

## Validation

```bash
npm run typecheck
npm run check:parity-snapshot
vitest run src/test/runtimeCommandSurfaceParity.test.ts src/test/driftGuard.test.ts src/test/platformCapabilities.test.ts src/test/springSupportContracts.test.ts src/test/aiService.test.ts
npm run lint:stabilization
npm run build
git diff --check
```

Release posture: `contract-parity-and-extension-stabilization`

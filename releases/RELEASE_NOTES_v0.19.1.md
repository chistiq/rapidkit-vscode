# Release Notes — v0.19.1 (April 19, 2026)

## ✦ Toolchain Reliability + Go Context + Workspai Positioning

### Summary

This release hardens cross-platform tool verification, improves how Go workspaces are detected and explained inside the AI experience, and aligns public-facing Workspai positioning across the extension.
The result is more reliable doctor/setup flows, more accurate Go guidance, and cleaner product messaging in the editor and Marketplace surfaces.

---

### Changed

- **Workspai product positioning sync**
  Extension README, Marketplace description, and the webview header now consistently present Workspai as **"The AI workspace for backend teams."**

- **Go AI guidance**
  The AI experience now explains the current Go support boundary more clearly:
  - supported kits are `gofiber.standard` and `gogin.standard`
  - Go projects should be extended with native Go packages and internal adapters
  - Go kits do not currently use the RapidKit module marketplace

- **Go kit metadata cleanup**
  Removed the misleading `modular` tag from Go/Fiber and Go/Gin kit descriptors.

### Fixed

- **Workspace memory inline action icon**
  The WORKSPACES sidebar action for editing workspace memory now uses a valid codicon, so the button glyph is visible again next to each workspace instead of showing only an empty clickable slot.

- **Platform-safe `rapidkit` command execution**
  Wrapper commands now resolve the npm package explicitly through:

  ```bash
  npx --yes --package rapidkit rapidkit ...
  ```

  This prevents local `rapidkit` launchers in the current working directory from shadowing the intended npm command, especially on Windows shells.

- **Go framework detection from real dependencies**
  `workspaceDetector` now identifies `gofiber.standard` and `gogin.standard` by inspecting actual `go.mod` framework dependencies instead of looking for RapidKit-specific strings.

- **`rapidkit-core` verification reliability**
  Setup checks now verify `rapidkit-core` using `pip show` and `pipx list` paths that behave more consistently across Windows and Linux toolchains.

- **Poetry verification discovery**
  The setup flow now checks Poetry executable candidates only when those paths actually exist, reducing false negatives and noisy command attempts.

### Test Coverage

- Added regression tests for `gofiber.standard` and `gogin.standard` detection in `workspaceDetector.test.ts`
- Updated platform command tests to validate the explicit npm package wrapper invocation

---

## Links

- 📦 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode)
- 🐙 [GitHub Repository](https://github.com/chistiq/rapidkit-vscode)
- 🌐 [Workspai Website](https://www.workspai.com/)
- 🚀 [RapidKit CLI (npm)](https://www.npmjs.com/package/rapidkit)

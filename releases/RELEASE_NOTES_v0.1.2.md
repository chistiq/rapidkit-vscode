# Release Notes - v0.1.2

## 🔥 Critical Bug Fix Release

**Release Date:** November 7, 2025

This release fixes a critical issue where commands were not available when the extension was installed from a VSIX package.

---

## 🐛 Bug Fixes

### Commands Not Found in Packaged Extension
**Fixed the most critical issue reported by users:**
- ✅ Fixed `command 'rapidkit.createWorkspace' not found` error
- ✅ Fixed `command 'rapidkit.addWorkspace' not found` error
- ✅ Fixed `command 'rapidkit.refreshWorkspaces' not found` error
- ✅ All toolbar buttons and context menu items now work correctly

**Root Cause:**
The extension was not packaging all required runtime dependencies (`node_modules`), causing activation to fail silently when installed from VSIX. Commands worked fine in development mode but failed in production.

**Solution:**
Updated `.vscodeignore` to include all necessary runtime dependencies until we implement proper bundling with esbuild/webpack.

---

## 🔧 Technical Changes

- **Dependency Packaging:** Updated build configuration to include complete `node_modules` in VSIX
- **Vitest Update:** Upgraded Vitest to v4.0.7 to align with @vitest/coverage-v8 peer requirements
- **Build Process:** Improved packaging to ensure all dependencies are available at runtime

---

## 📦 Installation

### From VSIX (Recommended for Testing)
```bash
# Download the VSIX file
# Then install using VS Code
code --install-extension rapidkit-vscode-0.1.2.vsix
```

### From Marketplace (Coming Soon)
Once published, you can install directly from the VS Code Marketplace.

---

## ✅ Verified Working

All commands and features have been tested and verified working in the packaged extension:

- ✅ Create Workspace
- ✅ Add Workspace  
- ✅ Refresh Workspaces
- ✅ Create Project
- ✅ Add Module
- ✅ All toolbar buttons
- ✅ All context menu items
- ✅ TreeView interactions

---

## 🚀 What's Next

### v0.1.3 (Planned)
- Bundle extension with esbuild/webpack to reduce package size
- Optimize VSIX from 616 files (2.22 MB) to <10 files (<500 KB)
- Improve activation performance
- Add more modules and templates

---

## 🙏 Thank You

Thank you to everyone who reported this issue and tested the pre-release versions. Your feedback is invaluable!

If you encounter any issues, please report them on our [GitHub Issues](https://github.com/chistiq/rapidkit-vscode/issues) page.

---

**Full Changelog:** [v0.1.1...v0.1.2](https://github.com/chistiq/rapidkit-vscode/compare/v0.1.1...v0.1.2)

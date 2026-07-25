# Release Notes — v0.18.0 (April 17, 2026)

## ✦ AI Stability + Context Intelligence Upgrade

### Summary

This release focuses on making Workspai AI more reliable in real-world repositories.
Model selection is now more robust, context assembly is richer and safer, and request handling is more stable for generation and debugging flows.

---

### Added

- **Richer project-context extraction** in the AI pipeline for FastAPI, NestJS, and Go projects
- **New AI regression tests** for model alias resolution and debugger command integration

### Changed

- **Model selection strategy** updated with broader alias support and stronger fallback ordering for modern Copilot/GitHub model IDs
- **Workspace memory operations** switched to async flow to reduce extension-side blocking
- **Legacy AI entry points** unified through the shared Workspai AI modal flow for consistent UX

### Fixed

- **Prompt budget safeguards** to reduce oversize prompt failures on large codebases
- **Module slug typo normalization** for safer module resolution
- **Streaming request lifecycle handling** improved for cancel/request correlation consistency

---

## Links

- 📦 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode)
- 🐙 [GitHub Repository](https://github.com/chistiq/rapidkit-vscode)
- 🌐 [Workspai Website](https://www.workspai.com/)
- 🚀 [RapidKit CLI (npm)](https://www.npmjs.com/package/rapidkit)

# Release Notes — v0.17.1 (April 17, 2026)

## ⚡ Deep Performance Audit — All Sidebars + UI Polish

### Summary

Six performance bottlenecks were identified and fixed. Every sidebar panel now renders instantly using a consistent **two-phase rendering model**: items appear immediately from cache, and data-heavy work (subprocess calls, disk reads, network requests) runs in the background.

---

### Two-Phase Rendering — Consistent Across All Panels

All three tree views now follow the same pattern:

**Phase 1 — Immediate (synchronous)**
`getChildren()` returns items instantly from whatever is already in memory. The panel appears on the first frame.

**Phase 2 — Background**
A `_schedule*` method runs async I/O in the background and fires `_onDidChangeTreeData` when done, filling in details without blocking the user.

| Panel | Phase 1 | Phase 2 |
|---|---|---|
| WORKSPACES | workspace names from `_workspaceCache` | version badge, profile, module count |
| PROJECTS | project items from `this.projects` | project type detection, path checks |
| AVAILABLE MODULES | `loading~spin` spinner | full catalog from subprocess/disk |

---

### All Fixes

| # | File | Change |
|---|---|---|
| 1 | `workspaceExplorer.ts` | Two-phase rendering — `_scheduleBackgroundMetadataLoad()` runs version/profile/moduleCount in background; `moduleCountCache` added; `_backgroundLoadInProgress` guard |
| 2 | `projectExplorer.ts` | Two-phase rendering — `_scheduleProjectLoad()` background; `loadProjects()` uses `Promise.all` for parallel `pathExists` per project |
| 3 | `moduleExplorer.ts` | Two-phase rendering — `_scheduleBackgroundCatalogLoad()` replaces blocking `_ensureCatalogLoaded()`; spinner shown immediately |
| 4 | `extension.ts` | `workspaceDetector.detectRapidKitProjects()` deferred to background (removed `await`) |
| 5 | `extension.ts` | Removed `setTimeout(5000/8000)` for doctor refresh — file watcher handles it |
| 6 | `coreVersionService.ts` | Cache TTL 5 min → 30 min |
| 7 | `examplesService.ts` | axios timeout 10 s → 5 s |
| 8 | `moduleExplorer.ts` | Empty state: returns `[]` when no project selected → `viewsWelcome` rich panel with `$(package)` icon + "Open Projects" button |
| 9 | `moduleExplorer.ts` | Dead code removed: `_ensureCatalogLoaded()` deleted |
| 10 | `HeroAction.tsx` + `styles-tailwind.css` | Sparkles badge: `inline-block` → `inline-flex items-center gap-1` — icon aligns inline with text |
| 11 | `package.json` | `concurrently` added to `devDependencies` (was used in `dev` script but undeclared) |

---

## Links

- 📦 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode)
- 🐙 [GitHub Repository](https://github.com/chistiq/rapidkit-vscode)

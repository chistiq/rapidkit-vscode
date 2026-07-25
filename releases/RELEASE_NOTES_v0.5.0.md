# Release Notes — v0.5.0

**Release Date:** February 1, 2026  
**Release Type:** Minor (New Features)

---

## 🔗 Python Core Bridge + Workspace Registry Integration

This major release combines **Python Core integration** with **cross-tool workspace discovery**, creating a fully unified RapidKit ecosystem.

---

## 🎯 What's New

### 🐍 Python Core Bridge

Direct integration with `rapidkit-core` Python engine:

- **Smart Python Detection** - 3 resolution scenarios:
  - **Scenario A**: System Python with `rapidkit-core` installed
  - **Scenario B**: System Python without core → auto-creates cached venv
  - **Scenario C**: No Python → prompts for installation
  
- **Cached Venv Management** - `~/.cache/rapidkit/` directory
  - Prevents repeated venv creation
  - Shared across all workspaces
  - Auto-cleanup and validation

- **Zero Configuration** - Works out of the box
  - Auto-fallback chain: System → Cached → Workspace
  - Cross-platform: Unix (`python3`) and Windows (`python`) support
  - Automatic process isolation and cleanup

### 📋 Shared Workspace Registry

Cross-tool workspace discovery with npm package:

- **Registry Location**: `~/.rapidkit/workspaces.json`
- **Bidirectional Discovery**:
  - Extension auto-detects workspaces created via npm CLI
  - npm package can list workspaces created by Extension
  - Workspace detection from any subdirectory

- **Multi-Layer Detection**:
  1. Primary: `.rapidkit-workspace` marker file validation
  2. Fallback: Structure detection (pyproject.toml + .venv)
  3. Last resort: Registry lookup

### 🏷️ Unified Workspace Signature

Changed from `RAPIDKIT_VSCODE_WORKSPACE` to `RAPIDKIT_WORKSPACE`:

- **Cross-Tool Compatibility**: Same signature across npm CLI and Extension
- **Constants Centralized**: No hardcoded strings, imported from `constants.ts`
- **Attribution Tracking**: `createdBy: 'rapidkit-vscode'` or `'rapidkit-npm'`
- **Backward Compatible**: Both old and new signatures recognized

### 🔗 Cross-Platform Execution

Stable command execution utilities:

- **Platform Handling**: Transparent `python3` (Unix) vs `python` (Windows)
- **Process Management**: Timeout handling, isolation, auto-cleanup
- **Output Capture**: Proper stdout/stderr and exit codes
- **JSON Protocol**: Aligned with npm package for reliable interop

### 🎯 Project Context Tracking

Enhanced project/workspace awareness:

- **Visual Indicators**: Checkmark (✓) shows currently selected project
- **Blue Highlighting**: Active selection clearly visible
- **Tooltip Status**: Displays selection status
- **Better Routing**: Commands routed based on project type (FastAPI vs NestJS)

### 📦 Bridge-Aware Doctor Command

System diagnostics now include Python engine:

- Checks Python availability (all scenarios)
- Verifies `rapidkit-core` installation
- Detects cached bridge environments
- Shows npm integration status

---

## 🏗️ Architecture

**RapidKit Ecosystem Fully Unified:**

```
┌─────────────────────┐
│  VS Code Extension  │ ← UI Layer
└──────────┬──────────┘
           │
           ↓
    ┌─────────────┐
    │ Python Core │ ← Business Logic
    │   Engine    │
    └─────────────┘
           ↕
  ~/.rapidkit/workspaces.json
           ↕
    ┌─────────────┐
    │  npm CLI    │ ← CLI Layer
    └─────────────┘
```

**Benefits:**
- **Single Source of Truth**: Python engine handles all generation logic
- **Cross-Tool Discovery**: Start with CLI, continue in Extension (or vice versa)
- **Unified Format**: Same workspace markers across all tools
- **Faster Rollout**: Deploy to engine, updates reach all tools

---

## 🔄 Breaking Changes

None! Fully backward compatible:
- Old workspace signature (`RAPIDKIT_VSCODE_WORKSPACE`) still recognized
- Existing workspaces continue to work
- No migration required

---

## 🚀 Upgrade

This extension auto-updates in VS Code. To force update:

1. Open Extensions view (`Ctrl+Shift+X`)
2. Search for "RapidKit"
3. Click "Update" if available

Or install manually:
```bash
code --install-extension rapidkit.rapidkit-vscode@0.5.0
```

---

## 📊 What Changed

### Commands Updated

All commands now use Python Core bridge:

- `RapidKit: Create Workspace` → Python engine via bridge
- `RapidKit: Create Project` → Python engine via bridge  
- `RapidKit: Add Module` → Python engine via bridge
- `RapidKit: Doctor` → Includes Python/core diagnostics

### Files Added

New utilities for bridge and workspace management:

- `src/core/bridge/pythonRapidkit.ts` - Python bridge
- `src/core/selectedProject.ts` - Project context tracking
- `src/utils/exec.ts` - Cross-platform execution
- `src/utils/findWorkspace.ts` - Multi-layer workspace detection
- `src/utils/workspaceMarker.ts` - Unified marker management
- `src/utils/registryPath.ts` - Registry path resolution
- `src/utils/pythonChecker.ts` - Python scenario detection
- `src/utils/systemRequirements.ts` - System diagnostics
- `src/test/pythonRapidkit.test.ts` - Bridge tests

### Files Modified

Updated for bridge integration and workspace registry:

- `src/commands/createWorkspace.ts` - Uses Python bridge
- `src/commands/createProject.ts` - Uses Python bridge
- `src/commands/addModule.ts` - Uses `findWorkspace` with registry
- `src/commands/doctor.ts` - Includes bridge diagnostics
- `src/core/workspaceManager.ts` - Registry integration
- `src/utils/constants.ts` - Centralized workspace constants
- `src/ui/treeviews/projectExplorer.ts` - Visual selection indicators

---

## 🐛 Bug Fixes

- ✅ Workspace context lost when quick-switching between projects
- ✅ Module commands failing due to missing project context
- ✅ Cross-platform Python inconsistencies (hardcoded paths)
- ✅ Process cleanup on command timeout
- ✅ Workspace creation requiring unnecessary Python pre-flight checks
- ✅ Attribution mismatches (hardcoded strings vs constants)

---

## 📚 Documentation

- Added workspace registry documentation to README
- Documented cross-tool compatibility workflow
- Added examples for npm/Extension interoperability
- Updated architecture diagrams

---

## 🔗 Links

- **Marketplace**: [RapidKit Extension](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode)
- **GitHub**: [rapidkit-vscode](https://github.com/chistiq/rapidkit-vscode)
- **npm Package**: [rapidkit@0.16.0](https://www.npmjs.com/package/rapidkit)
- **Core Engine**: [rapidkit-core](https://pypi.org/project/rapidkit-core/)
- **Docs**: [www.workspai.com](https://www.workspai.com)

---

**Previous Release:** [v0.4.7](RELEASE_NOTES_v0.4.7.md) (November 7, 2025)  
**Next Release:** TBD

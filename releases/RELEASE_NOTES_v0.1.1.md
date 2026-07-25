## 🔧 v0.1.1 - Bug Fix Release

**Release Date:** November 7, 2025

### 🐛 Critical Fixes

This patch release fixes critical issues that prevented users from using the extension's core functionality.

#### Fixed Issues

- **🔴 Workspace Selection** - Fixed workspace selection buttons not becoming enabled after selecting a workspace
- **🔴 Project Creation** - Fixed "Create Project" button not working in the Projects view after selecting a workspace
- **🔴 Context Menu Items** - Fixed context menu items not appearing due to context key timing issues
- **🔴 Context Keys** - Fixed workspace and project selection context keys not being set properly due to synchronous execution

### 📝 Technical Changes

#### Root Cause
VS Code context keys (`rapidkit:workspaceSelected`, `rapidkit:noProjects`, etc.) were being set synchronously using `vscode.commands.executeCommand()`, which caused race conditions and timing issues. The UI would not update properly because commands executed before context was ready.

#### Solution
- Made all `setContext` calls **async** to ensure proper execution order
- Added proper `await` statements throughout the codebase
- Fixed async handling in `ProjectExplorerProvider` and `WorkspaceExplorerProvider`
- Updated method signatures to properly handle Promise returns

#### Modified Files

- `src/extension.ts` - Added async/await for context key updates
- `src/ui/treeviews/workspaceExplorer.ts` - Made `selectWorkspace()` async
- `src/ui/treeviews/projectExplorer.ts` - Made `updateProjectsContext()` async, fixed refresh flow

### 🧪 Testing Recommendations

1. **Test Workspace Selection**
   - Open the RapidKit explorer
   - Create a new workspace or add an existing one
   - Select a workspace from the Workspaces view
   - ✅ Verify "Create Project" button becomes enabled

2. **Test Project Creation**
   - After selecting a workspace, click "Create Project"
   - ✅ Verify the project creation wizard launches

3. **Test Context Menus**
   - Right-click on a workspace item
   - ✅ Verify context menu appears with correct options
   - Right-click on a project item
   - ✅ Verify context menu appears with correct options

4. **Test Auto-Discovery**
   - Use "Discover Workspaces" command
   - ✅ Verify workspaces are found and appear in the list

### 📦 Installation

Download `rapidkit-vscode-0.1.1.vsix` and install using:

```bash
code --install-extension rapidkit-vscode-0.1.1.vsix
```

Or in VS Code:
1. Open Extensions (Ctrl+Shift+X / Cmd+Shift+X)
2. Click `...` menu → Install from VSIX
3. Select the downloaded file

### ✅ What Works Now

- ✅ Workspace creation and selection
- ✅ Project creation in selected workspace
- ✅ Context menu actions on workspaces and projects
- ✅ Module explorer and template browser
- ✅ All keyboard shortcuts
- ✅ System doctor and diagnostics

### 📋 Known Limitations

- RapidKit CLI must be installed (system-wide or in virtual environment)
- Python 3.10+ required for FastAPI projects
- Node.js 18+ required for NestJS projects
- Poetry required for Python dependency management

### 🔗 Resources

- **GitHub Repository:** https://github.com/chistiq/rapidkit-vscode
- **Report Issues:** https://github.com/chistiq/rapidkit-vscode/issues
- **Previous Release:** [v0.1.0](https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.1.0)

### 🙏 Feedback

Please report any issues or suggestions on the GitHub repository. Your feedback is valuable for improving the extension!

---

**Changelog:** Full changelog is available in [CHANGELOG.md](CHANGELOG.md)

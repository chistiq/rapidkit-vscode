# Release Notes - v0.11.0

**Release Date:** February 14, 2026  
**Type:** Minor Release  
**Semver:** 0.11.0

---

## 🌐 Dynamic Examples + Kit Selection + Workspace Export/Import

This minor release introduces **dynamic example workspaces** from GitHub, **enhanced kit selection** with dropdown in modal, **complete workspace export/import** with ZIP archives, and various **UX improvements** for better visual hierarchy.

---

## ✨ What's New

### 🌐 Dynamic Example Workspaces

Load and manage example workspaces directly from GitHub repository:

- **Real-time GitHub Integration**
  - Fetch examples from `rapidkitlabs/rapidkit-examples` repository
  - Example metadata with icons, descriptions, framework tags
  - Smart caching (1-hour TTL, 5-minute stale-while-revalidate)
  
- **Clone State Management**
  - Track cloned examples in `~/.rapidkit/cloned-examples.json`
  - Detect already-cloned examples
  - Show "Update" button when remote changes detected
  - Interactive loading states during clone/update
  
- **User Experience**
  - Browse curated examples from community
  - One-click clone to local machine
  - Update existing clones to latest version
  - Visual indicators for cloned vs. available examples

### 🎨 Dynamic Kit Selection

Enhanced project creation with intelligent kit selection:

- **Kit Dropdown in Modal**
  - Kit selection moved from separate QuickPick to modal UI
  - Framework-based filtering (FastAPI/NestJS kits)
  - Kit descriptions and tags displayed
  - Auto-select first available kit
  
- **Dynamic Kit Loading**
  - Fetch kits from `rapidkit list --json` via KitsService
  - 24-hour cache for optimal performance
  - Fallback to hardcoded kits when Python Core unavailable
  - Seamless user experience regardless of Python Core status
  
- **Streamlined Workflow**
  - Framework card → Modal with pre-filtered kits
  - Select kit in dropdown → Create project
  - Skip kit selection in wizard if pre-selected
  - Fewer clicks, clearer intent

### 📦 Full Workspace Export/Import

Complete backup and restore functionality:

- **Export as ZIP Archive**
  - Export entire workspace as `.rapidkit-archive.zip`
  - Smart exclusion patterns (node_modules, __pycache__, .venv, .git, etc.)
  - Maximum compression (level 9)
  - File size display after export
  - "Open Folder" action to reveal exported file
  
- **Import from ZIP Archive**
  - Extract ZIP to selected destination
  - Validate workspace structure
  - Overwrite protection with user confirmation
  - Auto-register imported workspace
  - "Open Workspace" action after import
  
- **Import Existing Folder**
  - Register existing RapidKit workspace
  - Validate workspace markers
  - Add to workspace registry
  
- **Progress Tracking**
  - Detailed status messages during export/import
  - Progress notifications with percentages
  - Error handling with user-friendly messages

### 🆕 New Core Services

**ExamplesService** - GitHub Integration
- Fetch repository contents via GitHub API
- Parse example metadata from README files
- Cache responses with configurable TTL
- Track clone state in local JSON file
- Detect remote updates

**KitsService** - CLI Integration
- Execute `rapidkit list --json` to fetch kits
- Parse and cache kit catalog
- 24-hour cache duration
- Fallback to hardcoded kits array
- Framework-based filtering support

---

## 🔄 Changed

### ✨ UX Improvements

**Better Visual Hierarchy:**
- Section header font-size: 1rem → 1.1rem
- Icon size: 16px (w-4 h-4) → 24px (w-6 h-6)
- Added subtle border-bottom to section titles
- Improved spacing (gap: 6px → 8px, margin-bottom: 14px → 18px)

**Layout Optimization:**
- Features section moved from top to page footer
- More prominent section headers without overwhelming colors
- Better balance between content and whitespace

**Icon Consistency:**
- Export icon changed from Download (↓) to Upload (↑) for better semantics
- All section icons now 24px for uniform appearance

### 🎯 Project Creation Flow

**Simplified Workflow:**
- Kit selection moved to CreateProjectModal
- Framework cards open modal with pre-filtered kits
- No more separate QuickPick for kit selection
- Pass `kitName` to ProjectWizard to skip kit step

**Better Context:**
- Kit descriptions visible in dropdown
- Framework filtering automatic
- Default kit auto-selected

### 📋 Bug Fixes

**Workspace Context:**
- Fixed undefined workspace path in `createProjectWithKit`
- Added `WorkspaceExplorerProvider` reference to `WelcomePanel`
- Workspace selection now properly maintained across panels
- No more workspace selection prompt when already selected in sidebar

---

## ❌ Removed

### Config-Only Export/Import

Removed the "Export Configuration Only" and "Import from Config" options:

**Why?**
- Created empty workspace folders (no actual code)
- Confusing user experience (expected full restore)
- No practical use case

**What's Left?**
- **Export**: Direct to Full Archive (ZIP)
- **Import**: Full Archive (ZIP) or Existing Folder
- Clear, practical workflow

---

## 🔧 Technical Details

### New Dependencies

```json
{
  "archiver": "^7.0.1",
  "@types/archiver": "^7.0.0",
  "adm-zip": "^0.5.16",
  "@types/adm-zip": "^0.5.5"
}
```

### Code Statistics

```
20 files modified
3,111 lines added
701 lines removed

New files:
- src/core/examplesService.ts
- src/core/kitsService.ts
- webview-ui/src/components/ExampleWorkspaces.tsx
```

### Key Files Modified

**Backend (Extension):**
- `src/extension.ts` - Added services, workspace context fix
- `src/ui/panels/welcomePanel.ts` - Example/kit integration, workspace context
- `src/ui/treeviews/workspaceExplorer.ts` - Export/import implementation
- `src/ui/wizards/projectWizard.ts` - Kit pre-selection support
- `src/commands/createProject.ts` - Kit name parameter

**Frontend (Webview):**
- `webview-ui/src/App.tsx` - Example/kit state, Features moved
- `webview-ui/src/components/CreateProjectModal.tsx` - Kit dropdown
- `webview-ui/src/components/ExampleWorkspaces.tsx` - New component
- `webview-ui/src/components/RecentWorkspaces.tsx` - Upload icon
- `webview-ui/src/styles.css` - Section header improvements

---

## 📊 Impact Analysis

### User Experience
- ✅ **Faster project creation** - Kit selection in modal (fewer clicks)
- ✅ **Example browsing** - Discover community examples
- ✅ **Complete backups** - Full workspace export/import
- ✅ **Better visibility** - Larger icons, clearer sections

### Performance
- ✅ **Smart caching** - Examples (1h), Kits (24h)
- ✅ **Graceful fallback** - Works offline with npm kits
- ✅ **Efficient I/O** - ZIP compression, minimal file operations

### Reliability
- ✅ **State persistence** - Clone tracking, kit cache
- ✅ **Error handling** - User-friendly messages
- ✅ **Validation** - Workspace structure checks

---

## 🚀 Usage Examples

### Browse and Clone Examples

1. Open Welcome Page
2. Scroll to "Example Workspaces" section
3. Browse available examples
4. Click "Clone" on desired example
5. Select destination folder
6. Example cloned and ready to use

### Create Project with Kit Selection

1. Open Welcome Page
2. Click "FastAPI" or "NestJS" card
3. Modal opens with kit dropdown
4. Select desired kit (e.g., "fastapi.ddd")
5. Enter project name
6. Click "Create Project"

### Export Workspace

1. Right-click workspace in sidebar
2. Click "Export Workspace"
3. Choose save location
4. Wait for ZIP creation
5. Click "Open Folder" to view exported file

### Import Workspace

1. Click "Import Workspace" in sidebar header
2. Select "Import from Archive"
3. Choose `.rapidkit-archive.zip` file
4. Select destination folder
5. Confirm overwrite if needed
6. Click "Open Workspace" to start working

---

## ⬆️ Upgrade

### Install Extension
```bash
# From VS Code Marketplace
# Search for "RapidKit" and click Install
```

### Verify Version
```
Open Command Palette (Ctrl+Shift+P)
Type: "RapidKit: Show Extension Info"
Check version: 0.11.0
```

---

## 🐛 Known Issues

None at this time. Please report issues on GitHub.

---

## 🔮 Coming Next (v0.12.0)

- 🎨 Custom kit templates from local folders
- 🔄 Workspace sync across multiple machines
- 📊 Enhanced module browser with categories
- 🛠️ Workspace-level settings management

---

## 🙏 Contributors

Thanks to everyone who contributed to this release!

---

## 📚 Documentation

- [Extension Documentation](https://www.workspai.com/docs/vscode)
- [Example Workspaces Guide](https://www.workspai.com/docs/examples)
- [Kit Selection Guide](https://www.workspai.com/docs/kits)
- [Export/Import Guide](https://www.workspai.com/docs/backup)

---

## 🔗 Links

- [GitHub Repository](https://github.com/chistiq/rapidkit-vscode)
- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode)
- [Report Issues](https://github.com/chistiq/rapidkit-vscode/issues)
- [Python Core](https://github.com/chistiq/rapidkit-core)

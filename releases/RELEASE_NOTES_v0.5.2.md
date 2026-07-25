# Release Notes v0.5.2

## February 2, 2026

### 🔧 Critical Fixes + UX Enhancements + Workspace Improvements

**Fixed npm caching issues, added standalone mode, improved notifications, enhanced welcome page, and upgraded workspace explorer!**

---

## 🔧 Critical Fixes

### NPM Package Caching Fix
- **Problem**: Users getting "Invalid project name" errors
- **Root Cause**: `npx rapidkit` was using cached outdated CLI versions
- **Solution**: All commands now use `npx --yes rapidkit@latest`
- **Impact**: 15 files updated, 100% reliability for workspace/project creation
- **Files**: rapidkitCLI.ts, doctor.ts, firstTimeSetup.ts, updateChecker.ts, createProject.ts, createWorkspace.ts, and more

### Doctor Command Accuracy
- **Problem**: Showing "All checks passed" even when RapidKit Core missing
- **Root Cause**: Core and npm marked as optional (warning) instead of required (fail)
- **Solution**: Changed status to 'fail' when critical components missing
- **Impact**: Now shows accurate system status, aligned with Setup Wizard

### Notification Issues
- **Problem**: Some notifications couldn't be closed (no × button)
- **Solution**: Added "OK" button to all 9 affected notifications
- **Impact**: Better UX, all messages now dismissible
- **Bonus**: Removed duplicate "Creating workspace..." notification

---

## 📦 New Features

### Standalone Project Mode
When creating a project without workspace, you now get **3 clear options**:

1. **Create Workspace First (Recommended)** → Full workspace setup then project
2. **Create Standalone Project** → Direct project at `~/RapidKit/rapidkits/`
3. **Cancel**

**Benefits**:
- Flexibility for quick prototypes
- Clear workflow guidance
- Automatic project creation prompt after workspace
- Proper labeling in success messages

---

### Command Reference (Welcome Page)
Professional command reference with **14 ready-to-copy commands**:

#### 📋 4 Collapsible Categories

**Workspace Commands (2)**
```bash
npx rapidkit my-workspace
npx rapidkit my-workspace --yes --skip-git
```

**Project Commands (4)**
```bash
npx rapidkit create project fastapi.standard my-api --output .
npx rapidkit create project nestjs.standard my-service --output .
npx rapidkit init && npx rapidkit dev
```

**Module Commands (5)** - Real module slugs
```bash
npx rapidkit add module auth_core
npx rapidkit add module db_postgres
npx rapidkit add module redis
npx rapidkit add module email
npx rapidkit add module storage
```

**Development & Utilities (3)**
```bash
npx rapidkit doctor
npx rapidkit --version
npx rapidkit --help
```

**Features**:
- 📋 Copy-to-clipboard with "✓ Copied!" feedback
- 🎨 Syntax-highlighted code blocks
- 📖 Clear descriptions for each command
- ▼ Expandable/collapsible categories

---

### Recent Workspaces (Welcome Page)
Dynamic workspace list with **auto-refresh**:

**Shows**:
- Up to 5 most recent workspaces
- Project count badge: "3 projects"
- Full workspace path
- Click to open workspace

**Features**:
- ↻ Manual refresh button
- Auto-refreshes after creating workspace/project
- Sorted by last accessed time
- Empty state with helpful message
- Visual hover effects

---

## ⚡ Workspace Explorer Enhancements

### Project Count in Labels
```
my-workspace (3)
api-gateway (5)
auth-service (2)
```

### Smart Time Display
- **Just now** (< 1 minute ago)
- **15m ago** (< 1 hour)
- **3h ago** (< 24 hours)
- **2d ago** (< 7 days)
- Hidden after 7 days

### Status Icons
- **Active**: 🟢 + green folder-opened icon
- **Inactive**: purple folder-library icon
- Clear visual hierarchy

### Automatic Time Tracking
- Updates on workspace selection
- Persists to `~/.config/rapidkit/workspaces.json`
- Used for sorting in Recent Workspaces

---

## 🎨 UI Polish

### Updated Icons
- 💻 **VS Code Extension** (was 🎨) - More professional
- 🔍 **System Check** (was 🩺) - Clearer meaning
- ⚡ **Key Features** (was ✨) - Better contrast
- ↻ **Refresh** (was 🔄) - Minimal and clear

### Better Notifications
- All messages now have "OK" button
- No more uncloseable notifications
- Removed duplicate messages

---

## 📊 Technical Details

### Files Updated (15 total)

**Core Commands**:
- `src/commands/createWorkspace.ts` - Auto-refresh support
- `src/commands/createProject.ts` - Standalone mode + refresh
- `src/commands/doctor.ts` - Accurate status
- `src/commands/checkSystem.ts` - Notification fix

**CLI & Utils**:
- `src/core/rapidkitCLI.ts` - All npx commands updated
- `src/core/workspaceManager.ts` - touchWorkspace() method
- `src/utils/firstTimeSetup.ts` - Cache fix
- `src/utils/updateChecker.ts` - Cache fix

**UI Components**:
- `src/ui/panels/welcomePanel.ts` - Command Reference + Recent Workspaces + refresh
- `src/ui/treeviews/workspaceExplorer.ts` - Time tracking + icons + project count
- `src/commands/workspaceContextMenu.ts` - Notification fix
- `src/commands/projectContextMenu.ts` - Notification fix

**Infrastructure**:
- `src/extension.ts` - Global context storage
- `package.json` - Version 0.5.2
- `CHANGELOG.md` - Complete changelog

---

## 🚀 Upgrade Instructions

### From Marketplace
1. Open VS Code Extensions
2. Search "RapidKit"
3. Click "Update" button

### From Command Line
```bash
code --install-extension rapidkit.rapidkit-vscode
```

### Post-Update
1. Reload VS Code window (Ctrl+Shift+P → "Reload Window")
2. Open Welcome Page (Ctrl+Shift+P → "RapidKit: Show Welcome")
3. Verify Setup Wizard shows latest npm/core versions
4. Test workspace creation with latest CLI

---

## 🐛 Bug Fixes Summary

| Issue | Status | Impact |
|-------|--------|--------|
| NPM cache causing "Invalid project name" | ✅ Fixed | High |
| Doctor showing false positive | ✅ Fixed | Medium |
| Notifications can't be closed | ✅ Fixed | Medium |
| Workspace project count always 0 | ✅ Fixed | Low |
| Duplicate creation notification | ✅ Fixed | Low |

---

## 📈 What's Next?

**Coming in v0.5.3**:
- Module installation progress tracking
- Project templates preview
- Integrated terminal commands
- Enhanced project explorer

**Long-term Roadmap**:
- Visual project dependency graph
- Module compatibility checker
- One-click deployment helpers
- Advanced configuration wizard

---

## 💬 Feedback

Found a bug or have a feature request?
- GitHub Issues: https://github.com/chistiq/rapidkit-vscode/issues
- Discussions: https://github.com/chistiq/rapidkit-vscode/discussions

---

## 🙏 Thank You

Special thanks to all users who reported the npm caching issue and helped identify the root cause!

---

**Full Changelog**: https://github.com/chistiq/rapidkit-vscode/blob/main/CHANGELOG.md

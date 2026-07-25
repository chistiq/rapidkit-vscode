# RapidKit VS Code Extension v0.7.0 Release Notes

**Release Date:** February 6, 2026  
**Type:** Minor Release  
**Breaking Changes:** None

---

## 🎯 Overview

RapidKit v0.7.0 introduces powerful workspace diagnostics and a dedicated setup verification panel, making it easier than ever to ensure your development environment is properly configured.

---

## ✨ What's New

### 🩺 Workspace Health Check

Quickly diagnose the health of any RapidKit workspace directly from the sidebar:

**Features:**
- ✅ One-click health diagnostics via pulse icon (🩺)
- ✅ Comprehensive checks for Python, pip, pipx, Poetry, and RapidKit Core
- ✅ Terminal integration showing detailed results
- ✅ Progress notifications during checks
- ✅ Available in both inline button and context menu

**How to Use:**
1. Open RapidKit sidebar
2. Find your workspace in the WORKSPACES view
3. Click the pulse icon (🩺) next to the workspace name
4. View health check results in the terminal

**What It Checks:**
- Python installation and version (3.10+ required)
- pip and pipx availability
- Poetry installation (optional)
- RapidKit Core installation and version
- Workspace configuration integrity

---

### 🏥 Standalone Setup Status Panel

A dedicated panel for verifying your RapidKit toolchain setup:

**Features:**
- ✅ Separate webview panel accessible via "Setup" button
- ✅ Three-tier hierarchy: Required → Recommended → Optional
- ✅ Real-time status checking for all tools
- ✅ Install and Verify buttons for each tool
- ✅ Professional tooltips explaining each tool's purpose
- ✅ Auto-refresh after installations
- ✅ Clean minimal design with colored borders

**Tool Categories:**

**Required (Must Have):**
- Python 3.10+ - Essential for all workflows

**Recommended (Better Performance):**
- pipx - Global tool manager
- RapidKit Core - Python engine
- RapidKit CLI - npm bridge

**Optional (Per-Project):**
- Poetry - Recommended dependency manager
- pip - Per-project package installer

**How to Access:**
1. Open RapidKit sidebar
2. Click "Setup" button in Welcome panel
3. Or use Command Palette: "RapidKit: Open Setup"

---

## 🎨 UI/UX Improvements

### Minimal Button Design
- Transparent backgrounds with colored borders only
- Cyan borders for primary actions (Install/Upgrade)
- Blue borders for verification actions
- Smooth hover effects with subtle background tints

### Enhanced Status Indicators
- ✓ Green checkmark for installed tools
- ⏳ Hourglass for checking status
- ⚠ Warning symbol for missing tools
- Clear version numbers for installed tools

### Installation Progress
- Animated progress bars during installations
- Time estimates for each installation
- Real-time status updates
- Auto-refresh after completion

---

## 🔧 Technical Improvements

### Architecture
- **New Files:**
  - `src/ui/panels/setupPanel.ts` - Standalone setup panel
  - `docs/setup-wizard-improvements.md` - Setup improvements documentation
  - `docs/workspace-health-check-feature.md` - Health check feature docs

- **Modified Files:**
  - `src/extension.ts` - Added new commands and integrations
  - `src/ui/panels/welcomePanel.ts` - Streamlined quick actions
  - `package.json` - New commands and inline buttons

### New Commands
- `rapidkit.openSetup` - Opens standalone setup panel
- `rapidkit.checkWorkspaceHealth` - Runs health diagnostics

### Better Modularity
- Setup logic separated from Welcome panel
- Improved state management
- Enhanced terminal integration
- Better error handling

---

## 📊 Status Detection

### Improved Detection Logic
- Distinguishes between npm CLI and pipx-installed RapidKit
- Better version parsing for all tools
- More reliable status checking
- Reduced false positives

### Real-Time Updates
- Debounced status updates to prevent flicker
- Auto-refresh after installations
- Efficient polling mechanism
- Better loading states

---

## 🚀 Getting Started

### Update Your Extension
1. Open VS Code
2. Go to Extensions view (Ctrl+Shift+X / Cmd+Shift+X)
3. Find "RapidKit" extension
4. Click "Update" button

Or install directly:
```bash
code --install-extension rapidkit.rapidkit-vscode
```

### Verify Your Setup
1. Open RapidKit sidebar
2. Click "Setup" button
3. Review status of all tools
4. Install any missing recommended tools
5. Use "Verify" buttons to confirm installations

### Check Workspace Health
1. Open RapidKit sidebar
2. Navigate to WORKSPACES view
3. Click pulse icon (🩺) next to any workspace
4. Review health check results in terminal

---

## 📝 Documentation

New comprehensive documentation added:

1. **Setup Wizard Improvements** (`docs/setup-wizard-improvements.md`)
   - Complete redesign overview
   - Three-tier hierarchy explanation
   - Installation scenarios and workflows

2. **Workspace Health Check** (`docs/workspace-health-check-feature.md`)
   - Feature description and usage
   - Technical implementation details
   - Troubleshooting guide

---

## 🔄 Upgrade Notes

**No breaking changes.** This release is fully backward compatible with v0.6.x.

**New Features:**
- Use new Setup panel for better setup verification experience
- Try workspace health check for quick diagnostics
- Enjoy improved UI/UX with minimal design

**Recommendations:**
- Run health check on existing workspaces to ensure proper configuration
- Review setup status to verify all recommended tools are installed
- Explore new tooltips to understand each tool's purpose

---

## 🐛 Bug Fixes

- Fixed Setup Status stuck on "Checking..." state
- Improved npm vs pipx detection to prevent false positives
- Better handling of installation status updates
- Reduced UI flicker during status checks

---

## 🎯 What's Next (v0.7.1+)

Planned improvements:
- Enhanced error reporting in health checks
- Quick-fix suggestions for common issues
- Workspace health history tracking
- Setup troubleshooting wizard
- Better offline support

---

## 🙏 Credits

Thanks to all contributors and users providing feedback!

---

## 📝 Full Changelog

See [CHANGELOG.md](../CHANGELOG.md) for complete details.

---

## 🔗 Links

- **Marketplace:** https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode
- **GitHub Repository:** https://github.com/chistiq/rapidkit-vscode
- **Documentation:** https://docs.rapidkit.dev
- **Report Issues:** https://github.com/chistiq/rapidkit-vscode/issues

---

**Happy Building! 🚀**

# RapidKit v0.6.0 Release Notes

**Release Date:** February 3, 2026

## 🎯 Major Feature Release: Module Browser & Setup Wizard

This release introduces a complete module management system and intelligent setup wizard with multi-method package manager support.

---

## ✨ What's New

### 🎯 Interactive Module Browser

Browse and manage 27+ RapidKit modules directly from the extension:

- **Grid/List Views** - Switch between different viewing modes
- **Search & Filter** - Find modules by name or category
- **Installation Status** - See at a glance what's installed (installed/update available/not installed)
- **One-Click Install/Update** - Install modules directly without terminal
- **Module Details** - View descriptions, versions, and dependencies
- **Sidebar Explorer** - Quick access to all modules organized by category
- **Real-time Sync** - Status updates automatically when you install/update

### 🔧 Intelligent Setup Wizard

Pre-flight checks before workspace creation ensure you have everything needed:

- **Step 1: Python 3.10+** - Validates Python installation with venv support
- **Step 2: RapidKit Core** - Checks if RapidKit Core is installed locally
- **Step 3: npm Package** - Verifies rapidkit npm package is available
- **Step 4: Package Manager** - Select your preferred installation method (Poetry/pip/pipx)

Each step shows clear status and auto-detects installed environments.

### 📦 Package Manager Selection

Three methods to choose from, each with different benefits:

#### Poetry (Recommended ⭐)
- Automatically manages virtual environments
- Intelligent dependency resolution
- Best for beginners and modern workflows
- One-click installation available

#### pip (Optional)
- Standard Python package manager
- Works with existing Python installations
- For users who prefer manual venv management

#### pipx (Optional)
- Isolated tool installation
- Great for command-line tools
- No virtual environment needed

---

## 🔧 Technical Improvements

### Python Environment Detection

- 8 different detection methods for robust environment discovery:
  - Direct import checking
  - pip show command
  - Python pip command
  - pyenv integration
  - User site-packages
  - pipx environments
  - Poetry installations
  - Conda environments

### Better Error Handling

- Platform-specific error messages (Windows/macOS/Linux)
- Actionable guidance with documentation links
- Clear explanations of what's missing and how to fix it

### UI Enhancements

- Auto-closing progress notifications (800ms)
- Module state synchronization across all views
- Visual "RECOMMENDED" badge on Poetry card
- Beginner-friendly setup wizard text

---

## 📚 Documentation Updates

- **README** - New feature screenshots with descriptions
- **Setup Text** - Simplified "Select Installation Method" for junior developers
- **Error Messages** - Better guidance with platform-specific fixes

---

## 🐛 Known Issues

None reported at this time.

---

## 📝 Migration Guide

**From v0.5.2:**
- Setup Wizard now appears before workspace creation (instead of after)
- Module Browser now available in sidebar - check "Available Modules" view
- Python and Poetry checks are automatic - no configuration needed

---

## 🔗 Links

- **GitHub Repository:** https://github.com/chistiq/rapidkit-vscode
- **Documentation:** https://www.workspai.com
- **Issues & Feedback:** https://github.com/chistiq/rapidkit-vscode/issues
- **Discussions:** https://github.com/chistiq/rapidkit-vscode/discussions

---

## 👥 Contributors

Special thanks to all contributors who made this release possible!

---

**Happy coding with RapidKit! 🚀**

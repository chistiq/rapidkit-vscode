# RapidKit v0.3.0 Release Notes

**Release Date:** November 10, 2025

## 🐛 Bug Fixes

### Fixed Generate Demo Project Hanging Issue

This release fixes a critical bug where the **"Generate Demo Project"** button would appear to hang with the message "Creating project structure..." and never complete.

**Root Cause:**
- The `generateDemo` command was using `stdio: 'pipe'` which captured output but prevented the user from seeing progress
- When child processes (`node generate-demo.js` or `npx rapidkit`) couldn't communicate their output, the extension appeared to freeze
- The progress indicator wasn't updating, making it seem like the operation was stuck

**What's Fixed:**
- ✅ Changed `stdio: 'pipe'` to `stdio: 'inherit'` for both workspace creation and demo generation
- ✅ Output from `generate-demo.js` and `npx rapidkit` now streams directly to the terminal/user
- ✅ Progress indicator now updates every 500ms while the operation is running
- ✅ Users can see real-time output showing what's being created

### Additional Improvements
- Generate Demo Project button now automatically detects demo workspaces
- Uses the correct `generate-demo.js` script for demo workspaces
- Automatically uses the selected workspace path - no folder selection needed
- Falls back to `npx rapidkit --demo-only` for non-demo workspaces

## 🔧 Technical Improvements

### Standard I/O Handling
- Updated `RapidKitCLI.generateDemo()` to use `stdio: 'inherit'`
- Updated `RapidKitCLI.createWorkspace()` to use `stdio: 'inherit'`
- Improved progress tracking with interval-based updates during execution

### Enhanced Workspace Detection
- Added `rapidkit.getSelectedWorkspace` command to retrieve current workspace context
- Improved `generateDemoCommand` to automatically fetch selected workspace when called from UI buttons
- Enhanced demo workspace detection to check for `generate-demo.js` file existence

## 📦 Installation

Install from VS Code Marketplace:
```
ext install getrapidkit.rapidkit
```

Or download the VSIX package and install manually:
```bash
code --install-extension rapidkit-vscode-0.3.0.vsix
```

## 🚀 Getting Started with Demo Workspaces

1. Click the RapidKit icon in the Activity Bar
2. Create a new workspace in demo mode
3. Select the workspace in the Workspaces view
4. Click **"Generate Demo Project"** in the PROJECTS view
5. Enter a project name
6. Watch the output in the progress notification as your project is being created ✨

## 🙏 Thank You

Thank you to everyone who reported the hanging issue and helped us improve RapidKit!

If you encounter any issues or have suggestions, please [open an issue on GitHub](https://github.com/chistiq/rapidkit-vscode/issues).

---

**Full Changelog:** https://github.com/chistiq/rapidkit-vscode/blob/main/CHANGELOG.md

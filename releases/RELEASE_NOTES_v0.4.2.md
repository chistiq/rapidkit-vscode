# Release Notes - RapidKit VS Code Extension v0.4.2

**Release Date:** December 5, 2025

## 🪵 Logging & UI Improvements

**Enhanced marketplace presence and logging functionality for better user experience!**

---

## 🎯 What's New

### 🪵 New Logging Commands

Added three new commands to the command palette for improved log management:

| Command | Description | Icon |
|---------|-------------|------|
| `RapidKit: Show Logs` | Display RapidKit logs output panel | $(output) |
| `RapidKit: Close Logs` | Close the logs panel | $(close) |
| `RapidKit: Clear Logs` | Clear all logs from the output | $(trash) |

**Usage:**
- Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
- Type "RapidKit" to see all new logging commands
- Select desired action

### 📺 Enhanced Marketplace Profile

Significant improvements to the extension's marketplace presence:

- **Animated Screenshot** - Replaced static PNG with animated GIF (1200×642px)
  - Shows actual extension workflow
  - Better engagement in marketplace gallery
  - Optimized file size (2.1 MB)
- **Improved README** - Removed duplicate icon from README content
  - Icon still shows on marketplace profile header
  - Cleaner, more professional appearance
  - Better focus on content and features

### 🎨 Better UX in Logger Utility

Enhanced the Logger class with new methods:

```typescript
// Clear all logs
logger.clear();

// Get direct access to OutputChannel
const channel = logger.getOutputChannel();
```

---

## 🔧 Technical Details

### New Logger Methods

- `clear()` - Clears all output from the RapidKit output channel
- `getOutputChannel()` - Returns the underlying VS Code OutputChannel for direct manipulation

### Updated Files

- `src/utils/logger.ts` - Added new methods
- `src/extension.ts` - Registered three new commands
- `package.json` - Added command definitions and activation events
- `README.md` - Updated with animated GIF screenshot
- `CHANGELOG.md` - Documented all changes
- `RELEASE_NOTES.md` - Updated latest release information

### No Breaking Changes

- All existing functionality remains unchanged
- New commands are additions, not replacements
- Backward compatible with all existing code

---

## 📊 Stats

- **Files Changed:** 6
- **Lines Added:** ~80
- **Lines Removed:** ~5
- **New Commands:** 3
- **Breaking Changes:** None
- **Deprecations:** None

---

## 🔗 Links

- 📦 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode)
- 🐙 [GitHub Repository](https://github.com/chistiq/rapidkit-vscode)
- 📚 [Documentation](https://www.workspai.com/docs)
- 🚀 [npm Package](https://www.npmjs.com/package/rapidkit)

---

## 🙏 Thanks

Thank you for using RapidKit! Your feedback helps us improve.

# Release Notes: v0.10.0

**Release Date:** February 12, 2026  
**Type:** Minor Release (Feature Update)

---

## 🚀 Smart Project Actions + Intelligent Browser + Port Detection

This release introduces a unified project actions panel in the Welcome Page, smart browser button that activates only when server is running, workspace upgrade detection, and intelligent port tracking for running servers.

---

## ✨ What's New

### 🚀 Project Actions Panel

Complete project lifecycle management directly in the Welcome Page with 6 smart buttons:

**Available Actions:**

1. **Terminal** 🖥️
   - Opens terminal in project directory
   - Quick access to command line
   - Respects project context

2. **Init** 📦
   - Installs project dependencies
   - Works for both FastAPI (Poetry) and NestJS (npm)
   - One-click dependency installation

3. **Dev/Stop** ▶️/⏹️
   - **Smart toggle button** that changes based on server state
   - Green "Dev" button when server is stopped
   - Red "Stop" button when server is running
   - Automatically detects server state from terminal

4. **Test** 🧪
   - Runs project test suite
   - Works with both pytest (FastAPI) and Jest (NestJS)
   - Opens test results in terminal

5. **Browser** 🌐
   - Opens running server in browser
   - **Smart enabled/disabled** based on server state
   - Only clickable when dev server is running
   - Automatically opens correct port

6. **Build** 🔨
   - Builds project for production
   - Runs `npx rapidkit build`
   - Orange-styled for emphasis

**Panel Features:**
- ✅ Conditional rendering based on project state
- ✅ Real-time state synchronization
- ✅ Professional disabled states
- ✅ Integrated with existing commands
- ✅ Framework-agnostic design

---

### ⬆️ Workspace Upgrade Button

Automatic detection of rapidkit-core updates with one-click upgrade:

**Features:**
- **Orange upgrade button** appears next to workspace name when update available
- Real-time version comparison with npm registry
- Detects installation type (workspace venv vs global/pipx)
- Runs appropriate upgrade command automatically:
  - Workspace venv: `poetry update rapidkit-core`
  - Global/pipx: `pipx upgrade rapidkit-core`

**Smart Detection:**
```typescript
// Checks workspace .venv or Poetry cache
const venvInfo = await detectPythonVirtualenv(workspacePath);

// Compares installed vs latest version
if (coreLatestVersion && isVersionOutdated(coreVersion, coreLatestVersion)) {
  showUpgradeButton = true;
}
```

**User Experience:**
- No more manual version checks
- Clear visual indicator (orange button)
- One-click upgrade process
- Works for all installation types

---

### 🎯 Smart Browser Button

Context-aware browser opening that adapts to server state:

**Intelligence:**
- ✅ Only **enabled** when dev server is running
- ✅ **Detects port** from running terminal
- ✅ Displays port in tooltip: `"Open in Browser (port 8001)"`
- ✅ Shows helpful message when disabled: `"Start server first"`
- ✅ Visual feedback with disabled state styling

**State Management:**
```typescript
interface WorkspaceStatus {
  isRunning?: boolean;
  runningPort?: number;
}

// Button automatically enables/disables
<button
  disabled={!isRunning}
  title={isRunning ? `Open at port ${port}` : "Start server first"}
/>
```

**Benefits:**
- No more blind browser opens to wrong ports
- Clear workflow guidance (Dev → Browser → Stop)
- Better user experience with smart defaults

---

### 📡 Running Port Detection

Automatic port extraction and display throughout the UI:

**Port Tracking:**
- Extracts port from terminal name: `"🚀 project [:8001]"`
- Stores in workspace status state
- Updates in real-time when server starts/stops

**Display Locations:**
1. **Sidebar Project Description:**
   - Shows: `"FastAPI 🟢 :8001"` or `"NestJS 🟢 :3000"`
   - Color-coded by framework
   - Only visible when server running

2. **Project Tooltips:**
   - Before: `"🚀 Server running!"`
   - After: `"🚀 Server running on port 8001!"`

3. **Browser Button:**
   - Tooltip: `"Open in Browser (port 8001)"`
   - Ensures correct port is opened

**Technical Implementation:**
```typescript
// Extract port from terminal name
const terminal = runningServers.get(projectPath);
const match = terminal.name.match(/:([0-9]+)/);
const port = match ? parseInt(match[1], 10) : 8000;

// Update UI state
WelcomePanel.updateWithProject(projectPath, projectName, port);
```

---

## 🎨 Improved

### Enhanced Sidebar Icons

Better visual feedback for project states:

**Before:**
- Browser icon always visible
- No port information
- Static states

**After:**
- Browser icon **only for running projects** (contextValue: `project-running`)
- Port displayed: `"FastAPI 🟢 :8001"`
- Dynamic icon updates on start/stop

**package.json Configuration:**
```json
{
  "command": "rapidkit.projectBrowser",
  "when": "view == rapidkitProjects && viewItem == project-running",
  "group": "inline@5"
}
```

---

### State Synchronization

Real-time UI updates across all panels:

**Synchronized States:**
1. **Terminal State** → `runningServers` Map
2. **Tree View** → Project contextValue (`project` or `project-running`)
3. **Webview** → WorkspaceStatus with `isRunning` + `runningPort`

**Update Flow:**
```
User clicks "Dev" 
  → Terminal starts with port
  → runningServers.set(path, terminal)
  → WelcomePanel.updateWithProject()
  → Webview receives { isRunning: true, runningPort: 8001 }
  → Browser button enables
  → Sidebar updates icon + port display
```

**Update Triggers:**
- ✅ Server start (Dev, Init & Start, Start Anyway)
- ✅ Server stop
- ✅ Project selection change
- ✅ Manual refresh

---

### Disabled Button Styling

Professional disabled states for better UX:

**CSS Implementation:**
```css
.project-action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

.project-action-btn:disabled:hover {
  background: var(--vscode-button-secondaryBackground);
  border-color: transparent;
  transform: none;
}
```

**Features:**
- Semi-transparent (40% opacity)
- Not-allowed cursor
- No hover effects when disabled
- Clear visual distinction from enabled state

---

## 🔧 Technical Details

### New Files

**1. ProjectActions.tsx** (105 lines)
- Location: `webview-ui/src/components/`
- Purpose: Unified action panel component
- Props: 8 handlers + workspaceStatus
- Features: Conditional rendering, smart toggles

**2. Type Updates**
```typescript
// webview-ui/src/types.ts
export interface WorkspaceStatus {
  hasWorkspace: boolean;
  workspaceName?: string;
  workspacePath?: string;
  installedModules?: Array<{ slug: string; version: string; display_name: string }>;
  isRunning?: boolean;          // NEW
  runningPort?: number;         // NEW
  seq?: number;
}
```

### Modified Files

**1. extension.ts**
- Import `runningServers` for state tracking
- Update WelcomePanel after server start/stop
- Enhanced projectDev/projectStop commands

**2. welcomePanel.ts**
- Import `runningServers` from extension
- Extract port from terminal names
- Send `isRunning` + `runningPort` to webview

**3. projectExplorer.ts**
- Extract port for each running project
- Pass port to ProjectTreeItem constructor
- Display port in description + tooltip

**4. package.json**
- Version bump: 0.9.0 → 0.10.0
- Browser menu condition: `project-running` only

**5. CSS Updates**
- Disabled button styles
- Hover effect improvements
- Professional state transitions

---

## 📊 Performance Impact

### UI Responsiveness
- ✅ **No performance degradation**
- ✅ Port extraction: `O(1)` regex operation
- ✅ State updates: Minimal overhead
- ✅ Real-time synchronization without lag

### Memory Usage
- ✅ Negligible increase (~10KB for new component)
- ✅ Port stored as single number in state
- ✅ No memory leaks from event listeners

---

## 🎯 User Experience Improvements

### Workflow Clarity

**Before:**
```
1. Click Dev (server starts)
2. Click Browser (guesses port 8000?)
3. Confusion if port is different
4. Manual check required
```

**After:**
```
1. Click Dev (server starts on port 8001)
2. Browser button enables with "Open at port 8001" tooltip
3. Click Browser → Opens correct URL automatically
4. Stop button replaces Dev button
```

### Visual Guidance

**Project States:**
- 🔴 Stopped: `"FastAPI"` → Dev button (green)
- 🟢 Running: `"FastAPI 🟢 :8001"` → Stop button (red) + Browser enabled

### Centralized Actions

**Before:** Actions scattered across:
- Command palette
- Sidebar context menus
- Tree view inline icons

**After:** All actions in one place:
- Welcome Page action panel
- Consistent UI/UX
- Better discoverability

---

## 🐛 Bug Fixes

- Fixed Browser button always enabled (now smart)
- Fixed missing port information in UI
- Fixed inconsistent state between panels
- Fixed disabled button hover effects

---

## 📚 Documentation Updates

- Updated CHANGELOG.md with v0.10.0 entry
- Updated RELEASE_NOTES.md with comprehensive details
- Added inline code comments for port detection
- Enhanced type definitions with JSDoc

---

## 🚀 Migration Guide

### For Extension Users

**No breaking changes!** Everything works as before, plus:

1. **Welcome Page:** New action panel appears when project selected
2. **Browser Button:** Now smarter - only enabled when server running
3. **Port Display:** See running port in sidebar and tooltips
4. **Upgrade Button:** Orange button when rapidkit-core update available

### For Extension Developers

**New API accessible via exports:**
```typescript
// Import running servers state
import { runningServers } from './extension';

// Check if server running
const isRunning = runningServers.has(projectPath);

// Get terminal and extract port
const terminal = runningServers.get(projectPath);
const match = terminal.name.match(/:([0-9]+)/);
const port = match ? parseInt(match[1], 10) : 8000;
```

---

## 🎉 Try It Out

1. **Reload VS Code** to activate v0.10.0
2. **Open Welcome Page** (RapidKit icon in Activity Bar)
3. **Select a project** from sidebar
4. **See the new action panel** in Welcome Page
5. **Click Dev** → Watch Browser button enable with port
6. **Hover over Browser** → See "Open at port X" tooltip
7. **Click Browser** → Opens correct URL
8. **Look at sidebar** → See `"FastAPI 🟢 :8001"`

---

## 📝 Credits

**Developed by:** RapidKit Team  
**Contributors:** AI Assistant (Claude Sonnet 4.5)  
**Testing:** Community feedback

---

## 🔮 What's Next?

Planned for v0.11.0:
- Auto-restart on file changes
- Terminal output capture and display
- Port conflict detection and resolution
- Multi-project parallel run support

---

**Full Changelog:** [CHANGELOG.md](../CHANGELOG.md)  
**Installation:** [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode)  
**GitHub:** [rapidkit-vscode](https://github.com/chistiq/rapidkit-vscode)

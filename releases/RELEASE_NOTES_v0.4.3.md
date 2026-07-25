# Release Notes - RapidKit VS Code Extension v0.4.3

**Release Date:** December 12, 2025

## 🎨 UI/UX Enhancements & Complete Module Catalog

**Major UI improvements with enhanced notifications, cleaner sidebar, and complete module preview catalog!**

---

## 🎯 What's New

### 🧩 Complete Module Explorer Catalog

Added comprehensive module preview catalog with **27 modules** across **12 categories**:

| Category | Modules | Icon |
|----------|---------|------|
| 🌟 **AI** | AI Assistant | sparkle |
| 🛡️ **Authentication** | Auth Core, API Keys, OAuth, Passwordless, Session | shield |
| 💳 **Billing** | Cart, Inventory, Stripe Payment | credit-card |
| 💼 **Business** | Storage | briefcase |
| ⚡ **Cache** | Redis | zap |
| 📧 **Communication** | Email, Notifications | mail |
| 🗄️ **Database** | PostgreSQL, MongoDB, SQLite | database |
| 🔧 **Essentials** | Deployment, Logging, Middleware, Settings | tools |
| 📊 **Observability** | Observability Core | pulse |
| 🔒 **Security** | CORS, Rate Limiting, Security Headers | lock |
| ✅ **Tasks** | Celery | checklist |
| 👤 **Users** | Users Core, User Profiles | person |

**All modules marked with "🔜 Coming Soon" preview status** - Full integration coming in Q1 2026!

### 📢 Enhanced Notifications with Action Buttons

Notifications now include helpful action buttons for streamlined workflows:

#### After Project Creation
```
✅ Project "MyAPI" created successfully!

[📂 Open in Editor] [⚡ Open Terminal] [🧩 Add Modules] [📖 View Docs]
```

- **📂 Open in Editor** - Opens project in VS Code
- **⚡ Open Terminal** - Opens terminal in project directory with `rapidkit init && rapidkit dev` hint
- **🧩 Add Modules** - Opens module picker for the new project
- **📖 View Docs** - Opens RapidKit documentation

#### After Adding Module
```
✅ Module "Authentication Core" added successfully!

[📖 View Module Docs] [➕ Add Another Module]
```

#### System Check Results
```
✅ System check passed!

[📊 View Full Report]
```

Or for issues:
```
⚠️ Some system checks failed. See output for details.

[🔧 View Issues]
```

### 🎨 Cleaner Sidebar UI

**Removed TEMPLATES Tab:**
- Eliminated redundant TEMPLATES view
- Simplified sidebar navigation
- Templates accessible through main creation commands

**Enhanced ACTIONS Panel:**
```
Quick Start
  [$(add) Create Workspace]
  [$(file-code) Create FastAPI Project]
  [$(bracket) Create NestJS Project]

Resources
  [$(pulse) System Check]
  [$(book) Documentation]
  [$(github) View on GitHub]

Feedback
  [$(star) Rate Extension]
```

### 🔒 Safer Context Menus

**Dangerous Operations Moved to Bottom:**
- Delete Project → Now at bottom of context menu
- Remove Workspace → Now at bottom of context menu
- Uses `z_danger@99` group for consistent positioning
- Reduces accidental deletions

### 📊 Enhanced Status Bar

**New Project Count Display:**
```
🚀 RapidKit | 3 Projects | Ready
```

- Shows total project count across all workspaces
- Updates dynamically when projects are added/removed
- Click to open quick actions

---

## 🔧 Changed

### UI Improvements

| Component | Before | After |
|-----------|--------|-------|
| Sidebar Views | 4 panels (Actions, Workspaces, Projects, Modules, Templates) | 4 panels (Templates removed) |
| Actions Panel | Basic links | Categorized: Quick Start, Resources, Feedback |
| Context Menu | Delete at top | Delete at bottom (safer) |
| Status Bar | `$(rocket) RapidKit` | `🚀 RapidKit \| X Projects \| Ready` |
| Notifications | Simple messages | Messages + action buttons |
| Module List | 3 sample modules | 27 modules in 12 categories |
| Welcome Page | `v0.4.0` | `v0.4.x` |

### Module Explorer Updates

- **Status Icons:**
  - Stable modules: `$(verified)` ✅
  - Preview modules: `$(eye)` 👁️
  - Beta modules: `$(beaker)` 🧪
- **Descriptions:** Preview modules show "🔜 Coming Soon"
- **Interaction:** Preview modules non-clickable (no premature install attempts)

---

## 🐛 Fixed

- **Doctor Command** - Fixed async/await handling for notification action buttons
- **Terminal Integration** - Corrected terminal cwd and command hints
- **Module Picker** - Removed undefined `projectPath` variable reference

---

## 📊 Stats

- **Files Changed:** 8
- **Lines Added:** ~450
- **Lines Removed:** ~85
- **New Features:** 5 (Enhanced notifications, Module catalog, Cleaner UI, Safer menus, Status bar)
- **Breaking Changes:** None
- **Modules Added:** 27 (preview)

---

## 🔗 Links

- 📦 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode)
- 🐙 [GitHub Repository](https://github.com/chistiq/rapidkit-vscode)
- 📚 [Documentation](https://www.workspai.com/docs)
- 🚀 [npm Package](https://www.npmjs.com/package/rapidkit)
- 🧩 [Module Catalog](https://www.workspai.com/docs/modules)

---

## 🚀 What's Next

**Coming in v0.5.0:**
- Full module installation support
- Module dependency management
- Real-time module status updates
- Module configuration UI
- Integration with RapidKit Core v1.0

---

## 🙏 Thanks

Thank you for using RapidKit! Your feedback drives these improvements.

**Rate us:** [⭐ VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode&ssr=false#review-details)

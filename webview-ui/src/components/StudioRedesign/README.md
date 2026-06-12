# Incident Studio vNext - Redesigned UI

## Overview

This directory contains the modular, minimal-premium Incident Studio UI. Production entry is `IncidentStudioVNext.tsx`. Legacy presentation contracts live in `webview-ui/src/lib/` and `incidentStudioPresentationContracts.test.ts`.

## Architecture

### 4-Region Layout

```
┌────────────────────────────────────────────────────────────┐
│                       TopBar                               │
│  (Mode Switcher | Scope | Release Gate)                    │
├────┬──────────────┬──────────────┬───────────────────────┤
│    │              │              │                       │
│ A  │   Sidebar    │   Context    │                       │
│ C  │  (Workspace  │   Panel      │    ChatSurface       │
│ T  │   Items)     │  (Health +   │   (Timeline +        │
│ I  │              │   Gates +    │    Actions +         │
│ V  │              │   Files)     │    Input)            │
│ I  │              │              │                       │
│ T  │              │              │                       │
│ Y  │              │              │                       │
│    │              │              │                       │
│ B  │              │              │                       │
│ A  │              │              │                       │
│ R  │              │              │                       │
│    │              │              │                       │
└────┴──────────────┴──────────────┴───────────────────────┘
 46px   224px          280px          flex
```

### Component Structure

```
StudioRedesign/
├── index.ts                    # Public exports
├── IncidentStudioVNext.tsx      # Main wrapper (4-region container)
├── regions/                    # UI regions (5 components)
│   ├── TopBar.tsx
│   ├── ActivityBar.tsx
│   ├── WorkspaceSidebar.tsx
│   ├── ContextPanel.tsx
│   └── ChatSurface.tsx
├── state/                      # State management
│   └── studioState.ts          # Types + state helpers
└── styles/                     # Design system
    └── designTokens.ts         # Color + spacing + typography
```

## Key Features

### 1. 5-Phase Workflow Navigation
- **Detect** → **Diagnose** → **Plan** → **Verify** → **Learn**
- Vertical activity bar with phase icons
- Enforced phase transitions (validates against policy gates)
- Phase milestone cards in chat timeline

### 2. User Mode Progression
- **Guided**: Single safe route, high guardrails
- **Standard** (default): Balanced speed + control
- **Expert**: Full evidence details, operational depth

### 3. Evidence Visibility
- Confidence percentage with source pills
- Freshness timestamps on evidence
- Inline code blocks with Copy/Run actions
- Expert mode expands source breakdown

### 4. Release Gate & Policy Compliance
- GO/NO-GO badge in top bar
- Policy gate status cards in context panel
- Artifact ID for audit trail (expert mode)
- Prevents forward phase transition if gates blocking

### 5. Scope Truthfulness
- Workspace vs Project scope selector
- Explicit labels for aggregated metrics
- Prevents ambiguous claims in enterprise workflows

### 6. Smart Context Panel
- Health summary with % breakdown
- Policy gates (flow state, telemetry, release posture)
- Related files with health badges (OK/WARN/ERR)
- Always-visible, scrollable, low-noise

## Feature Flag System

### Enable vNext UI

```javascript
// In browser console on VS Code extension webview:
localStorage.setItem('incident-studio-ui-version', 'vnext');
// Reload the extension or webview
```

### Revert to Legacy UI

```javascript
localStorage.setItem('incident-studio-ui-version', 'legacy');
```

### Check Current Version

```javascript
localStorage.getItem('incident-studio-ui-version');  // 'vnext' or 'legacy'
```

### Programmatic Check

```typescript
import { isStudioVNextEnabled } from '@/lib/studioFeatureFlags';

if (isStudioVNextEnabled()) {
  // Render vNext
} else {
  // Render legacy
}
```

## State Management

### Creating Initial State

```typescript
import { createInitialState } from '@/components/StudioRedesign';

const state = createInitialState({
  workspaceName: 'rapidkit-core',
  userMode: 'standard',
  scopeType: 'workspace',
});
```

### Phase Transitions

```typescript
import { canTransitionToPhase, getNextPhase } from '@/components/StudioRedesign';

// Check if transition is valid
const isValid = canTransitionToPhase('plan', 'verify', policyGates);

// Get next phase in sequence
const nextPhase = getNextPhase('diagnose');  // 'plan'
```

## Design Tokens

### Colors (Dark Theme)

- **Background**: `#0d0d0f` (root), `#141416` (surface1), `#161618` (surface2)
- **Primary**: `#6C5CE7` (action), hover: `#7e6dd5`
- **Teal**: `#00CFC1` (secondary accent)
- **Status**: OK `#00B894`, Warning `#FDCB6E`, Error `#FF5F5F`
- **Text**: High `rgba(255,255,255,0.82)`, Medium `0.55`, Muted `0.34`

### Typography

- **UI Labels**: 9px, 500 weight, uppercase, 0.5px tracking
- **Body**: 12-13px, 400 weight, 1.4-1.5 line height
- **Code**: 12px, JetBrains Mono
- **Headings**: 12-14px, 600 weight

### Spacing

- xs: 4px, sm: 8px, md: 12px, lg: 16px, xl: 24px, xxl: 32px

## Integration with Existing Services

### Message Handlers (from AIIncidentStudio)

The legacy studio has extracted handlers for:
- `_handleAISuggestModulesMessage()`
- `_handleAIQueryMessage()` (streaming)
- `_handleRunDoctorMessage()`
- `_handleOpenIncidentNavigatorTargetMessage()`
- `_handleAIParseCreationMessage()`

### vNext Integration Points

1. **Map message contracts** to vNext state/handlers
2. **Reuse policy gate** helpers from `incidentStudioPolicyGates.ts`
3. **Integrate confidence UI** from `incidentStudioConfidenceUI.ts`
4. **Connect telemetry** to `incidentStudioTelemetry.ts`

## Development Workflow

### Local Testing

```bash
# Build webview
cd webview-ui
npm run build

# Build extension
cd ..
npm run build

# Launch VS Code with extension
code --extensionDevelopmentPath=$(pwd)
```

### Hot Reload (Dev Mode)

```bash
# Terminal 1: Watch extension changes
npm run watch

# Terminal 2: Watch webview changes
cd webview-ui && npm run watch
```

### Feature Flag for A/B Testing

1. Default: Legacy UI (backward compatible)
2. Opt-in: `localStorage.setItem('incident-studio-ui-version', 'vnext')`
3. Gradual rollout: Can set %age of users via config

## Testing Checklist

- [ ] Responsive layout (wide/normal/compact/mobile breakpoints)
- [ ] Phase transition guards (verify gates before advancing)
- [ ] Source pill expansion (standard vs expert mode)
- [ ] User mode switching updates visible details
- [ ] Scope selector filters/labels metrics
- [ ] Chat streaming animations
- [ ] Copy/Run button handlers
- [ ] Related files click navigation
- [ ] Policy gate status updates

## Migration Roadmap

### Phase 1: Foundation (✅ Complete)
- [x] Directory structure
- [x] Design tokens
- [x] State management
- [x] 5 region components
- [x] Feature flag system
- [x] Feature flag conditional render

### Phase 2: Integration (Next)
- [ ] Map existing message contracts
- [ ] Connect policy gate helpers
- [ ] Integrate confidence UI system
- [ ] Add error boundaries
- [ ] Implement telemetry tracking

### Phase 3: Progressive Rollout
- [ ] Create settings UI for feature flag
- [ ] Add analytics for vNext adoption
- [ ] Monitor error rates
- [ ] Gather user feedback

### Phase 4: Full Replacement (Future)
- [x] Migrate 100% of incident studio usage (`IncidentStudioVNext` in production `App.tsx`)
- [x] Archive legacy monolith (removed — contracts in lib tests)
- [x] Delete archived monolith after contract tests migrate to lib/vNext

## Known Limitations (v1)

- Mock data for assistant responses (pending real AI integration)
- No file navigation implemented yet
- Terminal bridge UI pending
- Policy gate updates mock-only
- No persistent chat history

## Files Modified

- `webview-ui/src/App.tsx` - Added vNext conditional render + feature flag import

## Files Created

- All files in `webview-ui/src/components/StudioRedesign/` (9 new files)
- `webview-ui/src/lib/studioFeatureFlags.ts` (1 new file)

## Build Status

- ✅ TypeScript compilation: Success
- ✅ Extension build: Success
- ✅ Webview build: Success
- ✅ No runtime errors (on demo)

---

**Version**: 1.0.0 (Foundation)  
**Last Updated**: 2026-05-19  
**Status**: Ready for integration with legacy incident studio handlers

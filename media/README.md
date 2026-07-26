# Workspai Media Assets

Icons, README illustrations, and Marketplace capture assets for the Workspai VS Code extension.

## Brand palette

| Token        | Value     | Usage                             |
| ------------ | --------- | --------------------------------- |
| Background   | `#0F172A` | Marketplace banner, icon backdrop |
| Surface      | `#111827` | Panels and cards                  |
| Accent start | `#6C5CE7` | Primary brand gradient            |
| Accent end   | `#00CFC1` | Secondary brand gradient          |

## Icons (current)

| File                   | Size      | Usage                                       |
| ---------------------- | --------- | ------------------------------------------- |
| `icons/icon.svg`       | vector    | README hero, source of truth                |
| `icons/icon.png`       | 1024×1024 | Marketplace extension icon (`package.json`) |
| `icons/icon-128.png`   | 128×128   | Sidebar view icons                          |
| `icons/workspai.svg`   | vector    | Full wordmark / logo source                 |
| `icons/fastapi.svg`    | vector    | FastAPI tree labels                         |
| `icons/nestjs.svg`     | vector    | NestJS tree labels                          |
| `icons/go.svg`         | vector    | Go tree labels                              |
| `icons/springboot.svg` | vector    | Spring Boot tree labels                     |
| `icons/dotnet.svg`     | vector    | .NET tree labels                            |

### Regenerating marketplace icons

```bash
# After updating media/icons/icon.png
python3 - <<'PY'
from PIL import Image
src = "media/icons/icon.png"
img = Image.open(src).convert("RGBA")
img.resize((128, 128), Image.Resampling.LANCZOS).save("media/icons/icon-128.png")
PY
```

## README illustration

The Marketplace README intentionally tells one product story. Until a real
Assistant recording is captured, `readme/incident-studio.png` is its static
fallback.

| File                         | Section                                  |
| ---------------------------- | ---------------------------------------- |
| `readme/assistant-loop.gif`  | Primary README visual after real capture |
| `readme/incident-studio.png` | Static fallback                          |

The remaining dashboard, evidence-loop, and sidebar mockups are retained as
source material but are not embedded in the public README. They are **not** a
substitute for real Marketplace captures.

## Legacy screenshots (archive)

The older `screenshots/workspai-screenshot-*.png` set predates v0.35 dashboard/studio redesign. Keep it only as reference until replaced.

| Status                                | Action                                                      |
| ------------------------------------- | ----------------------------------------------------------- |
| `workspai-screenshot-1.png` … `9.png` | Recapture after local smoke test on v0.35                   |
| Marketplace hero                      | Full 1920×1080 workbench, dashboard + sidebar visible       |
| Module browser shot                   | Recapture after capability badges and path-free labels ship |

### Recommended recapture flows

| Asset            | Flow                                                                             |
| ---------------- | -------------------------------------------------------------------------------- |
| Marketplace hero | Dashboard open → workspace selected → Run / Repair / Artifacts + sidebar visible |
| Workspai Studio  | Secondary sidebar Studio open with blocker context, ship loop, and verify state  |
| Module browser   | FastAPI project selected → installed/available filters                           |
| Contract graph   | Workspace selected → graph populated from `workspace.contract.json`              |

### Primary Assistant GIF

Capture one continuous, real interaction:

1. Enter an ordinary code task in **Agent** mode.
2. Show the active Workspace Intelligence stage without dwelling on raw logs.
3. Show one inspected file and one transaction-backed edit.
4. Show the scoped test or build.
5. Finish on successful verify and refreshed evidence.

Save the optimized result as `readme/assistant-loop.gif`, then replace the
static README image source with that path. Keep `incident-studio.png` as the
release-safe fallback.

## Capture rules

- Use a clean dark VS Code theme.
- Prefer 1920×1080 or larger for Marketplace assets.
- Keep the Workspai sidebar visible in primary shots.
- Close unrelated tabs and private panels.
- Do not show secrets, tokens, or local-only paths such as `/home/...`.
- Use real demo workspaces and a freshly compiled extension build.
- Keep the primary GIF between 10 and 15 seconds.
- Capture one task only; do not splice unrelated product surfaces together.
- Keep the composer, active loop stage, changed file, and final verify state legible.
- Pause briefly on the changed file and successful final state.
- Optimize the GIF before committing it and check the rendered Marketplace page.

## Marketplace notes

- PNG for screenshots; SVG allowed in README.
- First Marketplace image should show dashboard + sidebar context, not a modal crop.
- README mockups may be refreshed between releases; Marketplace should use real captures before publish.

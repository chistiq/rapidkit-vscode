# Workspai Media Assets

Icons, README illustrations, and Marketplace capture assets for the Workspai VS Code extension.

## Brand palette

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#0F172A` | Marketplace banner, icon backdrop |
| Surface | `#111827` | Panels and cards |
| Accent start | `#6C5CE7` | Primary brand gradient |
| Accent end | `#00CFC1` | Secondary brand gradient |

## Icons (current)

| File | Size | Usage |
|------|------|-------|
| `icons/icon.svg` | vector | README hero, source of truth |
| `icons/icon.png` | 1024×1024 | Marketplace extension icon (`package.json`) |
| `icons/icon-128.png` | 128×128 | Sidebar view icons |
| `icons/workspai.svg` | vector | Full wordmark / logo source |
| `icons/fastapi.svg` | vector | FastAPI tree labels |
| `icons/nestjs.svg` | vector | NestJS tree labels |
| `icons/go.svg` | vector | Go tree labels |
| `icons/springboot.svg` | vector | Spring Boot tree labels |
| `icons/dotnet.svg` | vector | .NET tree labels |

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

## README illustrations (v0.35 set)

Current README uses product mockups in `media/readme/` plus a **Mermaid architecture diagram** in the root `README.md` (no separate SVG asset).

| File | Section |
|------|---------|
| `readme/dashboard.png` | Enterprise dashboard |
| `readme/evidence-loop.png` | Dashboard evidence → Studio fix → verify → artifact refresh |
| `readme/sidebar.png` | Sidebar control plane |
| `readme/incident-studio.png` | Workspai Studio secondary-sidebar repair workflow |

These are **not** a substitute for Marketplace screenshots. They keep the public README current while real workbench captures are regenerated.

## Legacy screenshots (archive)

The older `screenshots/workspai-screenshot-*.png` set predates v0.35 dashboard/studio redesign. Keep it only as reference until replaced.

| Status | Action |
|--------|--------|
| `workspai-screenshot-1.png` … `9.png` | Recapture after local smoke test on v0.35 |
| Marketplace hero | Full 1920×1080 workbench, dashboard + sidebar visible |
| Module browser shot | Recapture after capability badges and path-free labels ship |

### Recommended recapture flows

| Asset | Flow |
|-------|------|
| Marketplace hero | Dashboard open → workspace selected → Run / Repair / Artifacts + sidebar visible |
| Workspai Studio | Secondary sidebar Studio open with blocker context, ship loop, and verify state |
| Module browser | FastAPI project selected → installed/available filters |
| Contract graph | Workspace selected → graph populated from `workspace.contract.json` |

### Optional GIFs

| File | Flow |
|------|------|
| `screenshots/gif-create-project-with-ai.gif` | Dashboard → AI Project Builder → project in sidebar |
| `screenshots/gif-doctor-graph-release-flow.gif` | Doctor → Graph → Pipeline → Release |
| `screenshots/gif-share-workspace-handoff.gif` | Archive → Verify → Export |

## Capture rules

- Use a clean dark VS Code theme.
- Prefer 1920×1080 or larger for Marketplace assets.
- Keep the Workspai sidebar visible in primary shots.
- Close unrelated tabs and private panels.
- Do not show secrets, tokens, or local-only paths such as `/home/...`.
- Use real demo workspaces and a freshly compiled extension build.
- Keep GIFs between 10 and 18 seconds.

## Marketplace notes

- PNG for screenshots; SVG allowed in README.
- First Marketplace image should show dashboard + sidebar context, not a modal crop.
- README mockups may be refreshed between releases; Marketplace should use real captures before publish.

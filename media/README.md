# Workspai Media Assets

This folder contains icons, screenshots, and future capture assets used by the Workspai VS Code extension README and Marketplace listing.

## Icons

- `icons/icon.png` - extension icon, 256x256 PNG
- `icons/icon-128.png` - extension icon, 128x128 PNG
- `icons/workspai.svg` - Workspai logo source
- `icons/workspai.png` - Workspai logo raster
- `icons/fastapi.svg` - FastAPI project icon
- `icons/nestjs.svg` - NestJS project icon
- `icons/go.svg` - Go project icon
- `icons/springboot.svg` - Spring Boot project icon

## Current Screenshot Set

All public screenshots should be real VS Code captures. Do not use generated mock screenshots for release claims or Marketplace imagery.

| File | Current status | Content | Notes |
|------|----------------|---------|-------|
| `screenshots/workspai-screenshot-1.png` | Ready | Full dashboard with sidebar, Workspace Operations Console, Command Center, Recent Workspaces, templates, and graph context | Primary README/Marketplace image |
| `screenshots/workspai-screenshot-2.png` | Ready for README | Create with AI workspace modal | Cropped modal detail; use a full-workbench capture for Marketplace if possible |
| `screenshots/workspai-screenshot-3.png` | Ready for README | AI Project Builder modal | Cropped modal detail; use a full-workbench capture for Marketplace if possible |
| `screenshots/workspai-screenshot-4.png` | Ready for README detail | Sidebar Contract Graph summary | For Marketplace, prefer a full Contract Graph / topology view capture |
| `screenshots/workspai-screenshot-5.png` | Ready for README | Sidebar control plane with workspaces, projects, modules, health, and contract graph | Tall sidebar crop; not ideal as a Marketplace hero image |
| `screenshots/workspai-screenshot-6.png` | Needs recapture before Marketplace | Module Browser with project actions and installed/available modules | Current capture may show the old absolute-path UI; recapture after rebuilding the extension |
| `screenshots/workspai-screenshot-7.png` | Ready | WorkspAI Incident Studio with sidebar context | Strong secondary Marketplace image |
| `screenshots/workspai-screenshot-8.png` | Ready for README | Editor quick fixes | Cropped editor detail; pair with a full-workbench capture for Marketplace |
| `screenshots/workspai-screenshot-9.png` | Ready for README | Workspace Contract Registry with sidebar Contract Graph and `workspace.contract.json` | Shows the contract-backed architecture model; not ideal as Marketplace hero because breadcrumb includes a local path |

## Release Capture Backlog

- Recapture `workspai-screenshot-4.png` as a full Contract Graph / architecture topology view before using it as a Marketplace screenshot.
- Recapture `workspai-screenshot-6.png` after the latest Module Browser UI is loaded; it should show only workspace/project names, not absolute paths.
- Prefer full 1920x1080 workbench captures for Marketplace images. Cropped modal/detail screenshots are fine for README sections.
- Keep the first Marketplace image focused on the dashboard and sidebar, not on a modal.

## Recommended GIFs

GIFs are optional for docs and landing pages. Marketplace support may vary, so keep static screenshots as the primary asset set.

| File | Flow |
|------|------|
| `screenshots/gif-create-project-with-ai.gif` | Dashboard -> AI Project Builder -> plan -> project appears in sidebar |
| `screenshots/gif-doctor-graph-release-flow.gif` | Doctor -> Graph -> Test -> Release |
| `screenshots/gif-share-workspace-handoff.gif` | Archive -> Verify Archive -> Export |

## Capture Rules

- Use a clean dark VS Code theme.
- Prefer 1920x1080 or larger.
- Keep the Workspai sidebar visible.
- Close unrelated editor tabs and private panels.
- Avoid showing secrets, tokens, private paths, or unrelated local state.
- Use real demo workspaces and real extension UI.
- Keep GIFs between 10 and 18 seconds.

## Marketplace Notes

- Use PNG for screenshots.
- Keep screenshots readable at reduced Marketplace preview size.
- Show primary value in the first screenshot: dashboard, command center, and sidebar context.
- Avoid local-only content such as `/home/...` paths in public assets when possible.

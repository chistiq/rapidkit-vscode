# Workspai UI surface guide

> Extension 0.35.0 · Workspai CLI 0.52.2+

This guide documents the current user-facing surfaces. It is a review aid for
maintainers; it is not a second command reference.

## Primary sidebar

The Activity Bar container is the fast navigation surface.

```text
Workspaces
  └─ Workspace
      └─ Projects
          └─ Project

Modules / resources
Health and version
Quick actions
```

Rules:

- workspace and project names are shown before local paths;
- current, warning, blocked, and unknown states must be visually distinct;
- runtime/kind icons come from canonical project taxonomy;
- project actions remain available while unrelated workspace work is running;
- commands receive the selected workspace/project payload, never implicit stale
  selection.

## Dashboard

The Dashboard is the evidence and operations surface.

| Section   | Purpose                                            |
| --------- | -------------------------------------------------- |
| Home      | Current workspace and next action                  |
| Run       | Lifecycle and governed command execution           |
| Repair    | Blockers, Doctor findings, and remediation         |
| Artifacts | Reports, contracts, receipts, and provenance       |
| Graph     | Relationships, evidence paths, changes, and impact |
| Project   | Selected-project status and actions                |
| Library   | Workspaces, kits, modules, and reusable resources  |

Every card must identify its scope. Missing or stale evidence must remain
visible as missing/stale instead of being rendered as passed.

## Secondary sidebar

### Create

Create supports two equivalent paths:

- **Model-assisted** — describe a workspace or project, review the resolved plan,
  then confirm.
- **Manual** — choose create/adopt/import and provide explicit values.

Both paths use the canonical create-planner contract. Current project kinds are
backend, frontend, desktop, and extension. The visible kit list is derived from
the contract's available entries; planned entries are not presented as runnable.

Create actions:

- create workspace;
- create project;
- adopt local project or Git repository;
- import project;
- import workspace/archive.

### Assistant

The Assistant owns questions, planning, and Studio repair sessions.

```text
Ask   → inspect and explain
Plan  → inspect and prepare a grounded plan
Agent → inspect → change → focused checks → governed evidence → verify
```

A plus/new-chat action and scope selector must create a session with the same
workspace/project scope shown in the composer. A project-scoped label must not
silently execute a workspace-wide repair.

## Setup & Recovery

The required row is the Workspai CLI. Its version comes from live discovery and
the synced compatibility contract; it is not hardcoded.

RapidKit Core is optional. Show it as required only when the selected workspace
contains a Python-backed capability.

Setup states:

- **Detected** — executable and version are current.
- **Update available** — the owning installation can be upgraded.
- **Optional** — runtime is not required by the workspace.
- **Needs repair** — installation exists but is incomplete or inconsistent.
- **Not installed** — no valid installation was found.

## Studio blocker flow

```text
Card or user goal
  → exact scope and current evidence
  → remediation strategy
  → source transaction
  → runtime-native checks
  → Workspace Intelligence refresh
  → verify current artifact
```

Rules:

- command exit 0 is not proof that source changed;
- a dependency manifest edit is incomplete until its lock/install/audit/test/build
  transaction closes;
- only fresh non-blocking verification can complete a session;
- repeated inspection without a causal change is bounded;
- safe contract-authored operations may continue automatically;
- an exhausted audit accelerator delegates to guarded, project-native source
  repair before Studio asks for a breaking decision;
- breaking, invasive, destructive, external, or unsupported actions stop at a
  clear review boundary;
- rollback and changed-file evidence remain attached to the session.

## Graph surface

The Graph tab can show diagram and 3D renderers over the same graph contract.
Streaming/reload state must remain visible. Search and evidence queries are
bounded and proof-carrying; UI labels must not imply live data when the stream is
paused or stale.

## Accessibility and responsive behavior

- keyboard focus must reach tabs, cards, menus, copy buttons, and dialogs;
- status must not rely on color alone;
- icons require text labels or accessible names;
- narrow sidebars keep the primary action visible and move secondary detail
  behind disclosure;
- long paths and model output wrap or truncate without hiding the owning scope.

## Release checks

```bash
corepack npm run validate:contracts
corepack npm run typecheck
corepack npm test
corepack npm run build
```

Also verify the packaged VSIX when release assets change.

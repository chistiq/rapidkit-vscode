# When Workspai needs Python

Python is optional in Workspai.

You do **not** need Python to use:

- the Workspai VS Code extension;
- Workspace Intelligence, model, graph, Doctor, or evidence artifacts;
- adopted repositories;
- Node.js, Go, Java, .NET, Rust, PHP, frontend, desktop, or extension kits.

Python 3.10+ and RapidKit Core are needed only when a selected kit or module is
implemented by the optional Python engine.

## Why the extension does not install Python itself

Python is an operating-system runtime. Installing it may require administrator
access, platform-specific package managers, PATH changes, and security decisions.
A VS Code extension must not silently perform those operations.

When a Python-backed capability is selected, Workspai can guide the user and
create an isolated workspace environment after a compatible interpreter exists.

## Installation priority

For a workspace that needs RapidKit Core, the extension resolves Core in this
order:

1. a valid workspace-local environment such as `.venv`;
2. the environment declared by the workspace;
3. compatible global or fallback installations.

A stale or incomplete `.venv` is not treated as a valid installation. The
upgrade action must target the installation that owns the detected Core version;
it must not default to `pipx upgrade` when the workspace-local environment is
the selected owner.

## Non-Python workspaces

Minimal and non-Python workspaces must remain Python-free. Setup may display
Python as an optional runtime, but it must not:

- block workspace creation;
- install RapidKit Core automatically;
- show a Core upgrade as a workspace requirement;
- lower workspace readiness because Core is absent.

## Python-backed kits and modules

When a user explicitly selects a Python-backed capability, Workspai may ask for:

- Python 3.10 or newer;
- an environment strategy such as Poetry or venv;
- permission to install or upgrade RapidKit Core inside that environment.

This decision belongs to the selected capability, not to workspace creation in
general.

## Verify the active installation

From the owning workspace:

```bash
npx workspai doctor workspace --json
```

For a specific project:

```bash
cd path/to/project
npx workspai doctor project --json
```

Doctor reports the detected installation, version, location, and whether Core is
required by the current workspace.

## Summary

| Workspace need                       | Python/Core required? |
| ------------------------------------ | --------------------- |
| Workspace Intelligence and graph     | No                    |
| Adopt or import existing software    | No                    |
| Node/Go/Java/.NET/Rust/PHP projects  | No                    |
| Frontend, desktop, or extension kits | No                    |
| Python-backed kits/modules           | Yes                   |
| Explicit RapidKit Core module work   | Yes                   |

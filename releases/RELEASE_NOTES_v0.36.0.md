<!-- workspai-release-announcement
{
  "productId": "workspai-vscode",
  "headline": "Reliable Sessions and First-Install-Safe Creation",
  "summary": "Workspai for VS Code now keeps Studio and Create session ownership truthful across reloads, detects version-managed CLI installs, and can create the first managed workspace from a completely clean machine.",
  "highlights": [
    {
      "icon": "🧭",
      "text": "Studio distinguishes live repair ownership from persisted session history"
    },
    {
      "icon": "🧹",
      "text": "Interrupted Create sessions become stopped, explainable, and removable"
    },
    {
      "icon": "🌱",
      "text": "First project creation safely bootstraps the default minimal workspace"
    },
    {
      "icon": "🔎",
      "text": "NVM, FNM, asdf, Volta, and global npm CLI installs are detected locally"
    },
    {
      "icon": "🛡️",
      "text": "Guarded dependency repair retains project-native resolution evidence"
    }
  ]
}
-->

# Workspai VS Code v0.36.0

Released August 3, 2026.

## Reliable sessions and first-install-safe creation

This release focuses on a simple promise: the extension should always tell the
truth about what is running, what stopped, and which workspace owns the next
action.

It aligns the extension with Workspai CLI 0.52.3 and strengthens the Create,
Setup, and Studio paths that matter most on a fresh machine or after a VS Code
reload.

## Studio returns control to the user

A durable Studio session is useful history, but it is not evidence that a model
provider or repair process is still running. Workspai now separates those two
states.

- Reloading the sidebar does not silently restart a repair.
- A persisted session without a live owner is shown as paused or stopped.
- Resume remains an explicit user action.
- Recovery preserves the owning workspace, affected projects, remediation
  evidence, and verification boundary.
- Guarded dependency paths remain available when an automatic fix would require
  a downgrade, force install, or unapproved breaking change.

## Create sessions have a real lifecycle

Create history now records completed, stopped, and live operations separately.
Only the session owned by the current Webview operation is temporarily locked.

If VS Code reloads or an operation is interrupted, an old `Planning` or
`Creating` record becomes a stopped session with a short explanation. The user
can inspect or delete it instead of being left with permanent busy state.

## The first project works on a clean machine

Creating a project from the extension no longer assumes that `.workspai`,
`.rapidkit`, or the managed workspace parent already exists.

The extension now:

1. creates the managed parent directory;
2. asks the canonical Workspai CLI for a `minimal`, Python-optional workspace;
3. deduplicates simultaneous requests for the same workspace;
4. verifies that a canonical workspace marker was actually produced;
5. registers the workspace only after successful creation; and
6. reports the real subprocess diagnostic instead of `unknown error`.

The resulting default location remains:

```text
~/.workspai/workspaces/workspai
```

## CLI detection follows real developer environments

The extension can discover Workspai through direct PATH access, global npm
metadata, NVM, FNM, asdf, and Volta installations. Activation does not use a
network-backed `npx` fallback, so an offline machine or registry delay cannot
turn a local version check into a false install warning.

The minimum verified CLI version comes from the synchronized compatibility
contract rather than a hard-coded UI label.

## Compatibility

- VS Code 1.106.0 or newer
- Workspai CLI 0.52.3 or newer
- RapidKit Core 0.6.0 only when a Python-backed kit or module requires it

There are no intentional breaking changes to existing workspaces or saved
sessions.

## Upgrade

Install or update the extension from the Marketplace:

```bash
code --install-extension rapidkit.rapidkit-vscode --force
```

Then reload VS Code. If needed, open **Workspai: Open Setup & Recovery** to
verify the local CLI and optional Python engine.

## Validation

- Create lifecycle and fresh-install managed-workspace tests passed.
- CLI detection tests cover PATH, npm global metadata, and version-manager
  installations.
- Studio recovery and remediation-plan tests passed.
- TypeScript host and Webview checks passed.
- Production Webview build passed.

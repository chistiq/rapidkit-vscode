# Getting started with Workspai for VS Code

<!-- WORKSPAI:CLI-RELEASE-POLICY:START -->

> Extension 0.49.0 · verified with Workspai CLI 0.80.0 · minimum compatible CLI 0.80.0

<!-- WORKSPAI:CLI-RELEASE-POLICY:END -->

Workspai helps people and AI tools understand and change the same workspace
using a shared model, graph, health evidence, and verification loop.

## What you need

- VS Code 1.106.0 or newer
- Git when you want change, impact, or `--since` evidence

The extension executes the Workspai CLI selected by its canonical release
policy. The first run downloads that exact npm package into extension storage,
checks its integrity, and reuses the cached copy offline. A global CLI and a
separate Node.js installation are not required for Create, adopt, Doctor,
Graph, or governed Goal flows. Ordinary Agent tasks also work directly in an
open folder without CLI setup or an implicit Goal Pack.

Python is **not required** for the extension, Workspace Intelligence, or
non-Python projects. RapidKit Core and Python 3.10+ are optional and only needed
for Python-backed kits or modules.

## Configure an AI provider

Open **Dashboard > Settings > AI & Models** and choose a provider. For VS Code
models, refresh the available models and choose a default or Auto. The list
reflects models currently exposed to extensions by your installed providers.

For an API provider, choose the exact model ID and save the provider config when
you change it. Official provider URLs are fixed; use **Custom OpenAI-compatible
API** for another endpoint. HTTPS is required except for localhost HTTP endpoints,
including IPv6 loopback. Base URLs must not contain credentials or query tokens.

Save the API key separately in VS Code Secret Storage, then select **Test
provider**. The test uses the saved configuration and makes a minimal live model
request; provider charges may apply. **Configured** means required settings are
present; a successful test confirms the connection for that request. It does not
certify every model capability or future request. Unsaved config or key changes
must be saved before testing. Save errors remain visible and keep your key draft.
Settings with an existing workspace override are updated at that same scope.

## Assistant conversations and coding

Greetings and general questions answer directly. Questions about current project
names use local workspace contracts and registries rather than cached health
reports. Documentation and explicit web research can use public search/fetch,
installed CLI help, and enabled VS Code/MCP tools without selecting a workspace.
Search sites may challenge automated requests; the Assistant can fetch official
pages or try an enabled host tool instead, and must explain actual failures.

Ordinary Agent tasks use the open folder's source, project commands, diagnostics,
and final change review. Inspected source edits keep durable before/after data
in extension storage, support exact diffs and Undo, and reject stale replacements.
Existing diagnostics are reported separately from newly introduced errors. Native
workspace checks do not claim Workspai CLI canonical verification. Explicit Goal
and dashboard repair sessions retain their CLI contracts and verification rules.

### Existing projects and file review

You can work on an existing repository across the folders open in VS Code without
registering it with Workspai. Give its path when the selected workspace differs;
ambiguous destinations need a choice. Project source and canonical Workspai
workspace ownership are separate and remain attached to the request on Resume.

For an unmanaged project, the Assistant can offer adoption in place or import of
a copy into the managed default or a custom workspace. This requires your
approval. Declining onboarding keeps ordinary work available at the source path.

Changed files appear in a review panel above the composer. Open a file or its
comparison, then Keep changes or Restore the request checkpoint. Restoration
checks for newer user edits and reports conflicts rather than overwriting them.
Attachments show image thumbnails in the composer and sent messages; select a
thumbnail for a full-size preview. Saved chats are in the searchable header picker.

Interactive commands run in visible VS Code terminals with exact one-run approval,
output and exit-status reads, stdin, and cancellation. Shell integration must be
available to observe execution; otherwise no command is sent and the Assistant
can use bounded commands or another enabled tool. Enter secrets directly in the
visible terminal rather than chat.

Image-producing host tools can supply bounded PNG/JPEG/GIF/WebP observations to
vision-capable models. Owned attachments and output images are stored privately
with bounded retention and can be recovered after reload without re-executing the
original tool. Binary image bytes are omitted from synchronous sidebar state and
durable event logs. Storage or recovery failures are reported separately from the
result of the operation that already ran.

In a source editor, use **Workspai: Suggest Next Edit (Preview)** from the context
menu to request a focused continuation using the configured model. The model sees
bounded source around the cursor and recent editor changes, and may return no
suggestion. Review the diff, then use **Accept Workspai edit** or **Discard**.
Acceptance rejects changed documents and ambiguous source matches. This is a
user-triggered preview, not automatic next-edit completion or verified code;
run the relevant checks after accepting. Ordinary editor Undo remains available.

## Install

1. Install **Workspai** from the VS Code Marketplace.
2. Run **Workspai: Open Setup & Recovery**. The runtime row should confirm the
   CLI version verified for this extension. Optional language runtimes are
   evaluated against the active workspace, not treated as universal
   requirements.

3. Optional: install the CLI when you also want terminal access:

   ```bash
   npm install -g workspai@0.80.0
   workspai --version
   ```

The global install is a separate download for your terminal. Extension
commands stay on the verified package cached in extension storage.

## Understand a public repository first

Open **Analyze Repo**, paste a public GitHub, GitLab, or Bitbucket repository
URL, and select **Analyze**. Workspai creates an isolated shallow copy and
projects canonical Model, Graph, readiness, connected-surface, and bounded
retrieval evidence without installing dependencies or running repository code.

See [Analyze Repo](./REPOSITORY_ANALYSIS.md) for the evidence, cache, and safety
boundaries.

The separate Dashboard **Review Changes** tab is temporarily hidden in 0.49.0.
Its retained working-tree comparison and CLI evidence workflow is documented in
[Review Changes](./REVIEW_CHANGES.md). File review inside Assistant chats,
including Keep/Restore controls, remains available.

## Start with a workspace

Open the Workspai secondary sidebar and select **Create**.

You can:

- create a workspace;
- create a project from the canonical kit catalog;
- add an existing local project or Git repository;
- import a Workspai workspace or archive.

The same flow is available from the terminal:

```bash
workspai create
```

If you are already inside an existing project and want the managed default
workspace, the shortest path is:

```bash
npx workspai adopt .
```

Workspai creates or resolves the workspace, registers the project, writes the
project-to-workspace link, and synchronizes consumer context. You can continue
working from the project directory; the CLI resolves the owning workspace
without requiring you to remember its path.

The adopted repository receives portable consumer artifacts under `.workspai/`
and generated agent Skills under `.agents/skills/` when repository state permits
that mirror. The project entry records readiness and points to a bounded
project-owned Graph artifact whose hash and source freshness are validated by
the extension. The owning workspace keeps the complete aggregate Model and
Graph; project artifacts are scoped projections, not competing canonical
graphs. Existing authored `.agents` content is preserved and unsafe symlink or
path escapes are rejected.

## Create a project

From **Create**, choose manual creation or describe the project to a model. Both
paths resolve the same canonical kit contract.

Free-form Create messages pass through an intent router before planning. It is
grounded in the selected target and canonical workspace architecture, so it can
answer Create questions, request one focused clarification, open adopt/import,
or offer an explicit handoff to governed Agent for changes to existing source.
Only a high-confidence creation request reaches the plan preview, and no
filesystem mutation occurs until that plan is approved.

For model-driven creation, Workspai exposes a bounded capability lifecycle:

1. inspect the portable Create context;
2. read the canonical executable framework and kit contract;
3. evaluate architecture choices when the user delegates them;
4. submit one non-mutating plan proposal;
5. bind approval to the immutable plan, session, and selected scope;
6. execute workspace/project creation through one controller-owned operation;
7. synchronize Workspace Intelligence and refresh the project surface.

The model decides what should be proposed. It cannot call raw filesystem,
package-manager, workspace, project, or synchronization mutations. After the
user approves the visible plan, the extension executes the deterministic
sequence through its verified Workspai runtime. Failed retryable operations can
reuse only that same authorized plan; changing the scope or plan requires a new
proposal and approval.

The current catalog covers backend, frontend, desktop, and extension projects,
including FastAPI, NestJS, Spring Boot, Go, .NET, Next.js, React, Vue, Angular,
Nuxt, Astro, SvelteKit, Rust Axum, Laravel, Electron, Tauri, and VS Code
extensions.

Terminal examples:

```bash
npx workspai create project nextjs my-web
npx workspai create project nestjs.standard my-api
npx workspai create project desktop.tauri my-desktop
```

After create, adopt, or import, Workspai refreshes the workspace model, graph,
agent context, and related consumer surfaces.

Create intentionally stops at that synchronized foundation. It does not
silently run host dependency initialization or claim that Doctor, Analyze,
Readiness, and strict verification passed. Use **Initialize dependencies** on a
created workspace when you want the explicit `workspai bootstrap --profile ...`
operation. Node-, Go-, Java-, and .NET-only profiles never install the optional
workspace Python engine. The extension derives these profile, kit, runtime, and
lifecycle decisions from the CLI-published Create capability contract rather
than maintaining a second execution matrix.

## Use the Dashboard

Run **Workspai: Open Dashboard**. Its sections have explicit scope:

- **Home** — current workspace summary and next useful action
- **Run** — project and workspace lifecycle commands
- **Repair** — blockers, Doctor findings, and governed remediation
- **Artifacts** — reports, contracts, receipts, and evidence
- **Graph** — relationships, proof paths, changes, and impact
- **Project** — selected-project actions and evidence
- **Library** — kits, modules, workspaces, and reusable resources

A missing artifact is shown as missing or stale. It is never presented as a
successful result.

## Use the Assistant

The secondary sidebar Assistant supports three modes:

| Mode      | What it does                                                                    |
| --------- | ------------------------------------------------------------------------------- |
| **Ask**   | Reads bounded workspace context and explains without changing source.           |
| **Plan**  | Investigates the task and produces a grounded implementation plan.              |
| **Agent** | Changes source, runs scoped checks, reviews the diff, and verifies the outcome. |

Agent mode works for ordinary requests and blocker cards. Examples:

- “Prepare this workspace for release.”
- “Fix dependency vulnerabilities without a breaking upgrade.”
- “Raise test coverage to 75% and keep the build green.”

For dependency changes, Studio does not treat a manifest edit as completion. It
must reconcile the lockfile and installed tree, rerun the focused audit, run
declared tests/build, refresh Workspace Intelligence, and verify current
evidence. “No direct automatic fix” moves Agent mode into guarded source
investigation; it does not immediately stop the session. Studio first inspects
the runtime-owned manifest, lock/baseline, transitive advisory path, and
compatible owner or constraint options. Breaking, forced, downgrade,
destructive, external, or policy-exception choices remain explicit review
boundaries.

## The governed loop

The canonical loop is:

```text
Understand → Change → Evidence → Gate → Ground → Distribute → Explain
```

Run it directly when you need a machine-readable receipt:

```bash
npx workspai workspace intelligence run \
  --for-agent generic \
  --strict \
  --json
```

Use a supported agent identifier when targeting a specific consumer. Generated
agent instructions and evidence-selected Skills tell the model how to query
bounded Graph evidence and which operational workflows the repository can
actually justify. Users do not need to paste the entire Graph into prompts, and
irrelevant Skills are recorded as suppressed rather than presented as valid.

## Health and verification

```bash
# Workspace health
npx workspai doctor workspace

# Project health, from the project directory
npx workspai doctor project

# Lifecycle stages
npx workspai workspace run test --strict
npx workspai workspace run build --strict
```

Doctor reports live under the owning workspace's `.workspai/reports/`
directory. Project-scoped evidence retains project identity even when the
project is external to the workspace directory.

## Troubleshooting

### CLI is installed but Setup cannot find it

Run **Workspai: Open Setup & Recovery** and choose **Verify**. The extension
checks direct, global npm, NVM/FNM/asdf, and npx-compatible discovery paths.
Reload the window after changing your Node version manager.

### RapidKit Core shows an upgrade in a non-Python workspace

Core is optional. Minimal and non-Python workspaces should not show an upgrade
action unless they declare a Python-backed kit/module or a valid workspace-local
Core environment.

### A repair remains blocked

Open the session activity. A blocked result means current evidence still rejects
completion, a required runtime tool is missing, or the remaining change crosses
a review boundary. Studio must not replace that state with a success message.

## Learn more

- [Workspai Learn](https://www.workspai.dev/)
- [CLI documentation](https://www.workspai.dev/learn/cli)
- [GitHub](https://github.com/chistiq/rapidkit-vscode)
- [Issues](https://github.com/chistiq/rapidkit-vscode/issues)

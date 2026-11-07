# Getting started with Workspai for VS Code

<!-- WORKSPAI:CLI-RELEASE-POLICY:START -->

> Extension 0.50.0 · verified with Workspai CLI 0.80.0 · minimum compatible CLI 0.80.0

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

Tool decisions from compatible API providers stream into a receiving status while
the response is assembled. Tool execution starts after a complete validated
decision. Stop cancels the request, and compatible endpoints without streaming
support can use the JSON response path. Receiving byte counts are transport
progress, not token usage or proof that the task is complete. Usage receipts use
provider measurements where available and label estimates separately.

Longer conversations retain bounded historical excerpts when the active context
is compacted. Excerpts identify truncation and omitted entries; current execution
receipts control destinations, approvals, changes and pending checks. Saved
request history remains available when an omitted detail matters.

### Existing projects and file review

You can work on an existing repository across the folders open in VS Code without
registering it with Workspai. Give its path when the selected workspace differs;
ambiguous destinations need a choice. Project source and canonical Workspai
workspace ownership are separate and remain attached to the request on Resume.

For an unmanaged project, the Assistant can offer adoption in place or import of
a copy into the managed default or a custom workspace. This requires your
approval. Declining onboarding keeps ordinary work available at the source path.
After registration, the Assistant receives refreshed repository rules and bounded
project context. Graph retrieval can help locate relevant dependencies, tests and
proofs; ordinary source, language and command tools remain available when Graph
evidence is missing or stale. Registration itself does not verify a code change.

Activity rows keep permission waits and checkpoints under **Execution details**.
**Response ready** means the native workspace response is available; inspect its
reported checks and limits before treating the complete workflow as verified.

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

### Code context, symbol renaming and editor suggestions

The Assistant can retrieve focused source snippets with paths, line ranges and
content hashes. When available, the same retrieval can include Workspai Graph
proofs and installed language-provider symbols. Each source retains its coverage
and provenance; a missing Graph or language provider does not prevent ordinary
source work. The default retrieval is bounded and uses lexical ranking. An optional,
independent embedding index is available through `search-semantic-code`.

Configure embeddings in **User Settings**, not repository settings:

```json
{
  "workspai.semanticSearch.enabled": true,
  "workspai.semanticSearch.provider": "local",
  "workspai.semanticSearch.localBaseUrl": "http://127.0.0.1:11434/v1",
  "workspai.semanticSearch.model": "your-installed-embedding-model"
}
```

The local route requires an already running OpenAI-compatible loopback embedding
server and never sends a saved cloud API key. Alternatively, `current-api` uses
your selected OpenAI-compatible API provider and saved key; that endpoint must
support the embedding model you specify. The VS Code chat-model API does not
provide embeddings by itself. Nothing is downloaded or enabled automatically.
Embedding requests send bounded source chunks and have separate usage and costs.
The private cache stores vectors, hashes and source locators rather than raw source;
vectors should still be treated as derived project data. Source collection observes
local `.gitignore` and `.workspaiignore` chains and excludes sensitive/generated
paths. Results report partial coverage and recheck current source hashes; they
do not prove exhaustive recall or code correctness. Ask the tool to `clear` to
delete all embedding-provider indexes for the selected source, including while
the feature is disabled. Ordinary source and Graph tools remain available.

For a symbol rename in Agent or Goal mode, the Assistant can use the installed
language provider and apply its text edits through the existing protected edit
transaction. The review panel and request checkpoint support review and restoration.
This changes text only; file moves and notebook operations are separate. Inspect
affected references and run the relevant project checks before treating a refactor
as complete. Provider availability depends on the language extensions installed.

For insertion suggestions, run **Trigger Inline Suggestion** in a source editor.
Workspai previews ghost text using your configured AI provider; accepting it uses
the editor's normal Undo. In-flight suggestions are discarded if the document
changes or the request is cancelled. A cached insertion can continue without a
new model request when the only change is typing its exact prefix.
Set `workspai.inlineCompletions.enabled` to `false` to
disable this provider. Automatic suggestions after a typing pause are controlled
separately by `workspai.inlineCompletions.automatic` and are off by default; enabling
them sends bounded source and repository instructions to the configured provider
and can increase model usage. Ghost-text insertions and the reviewed next-edit
command above are separate features. Set `workspai.inlineCompletions.replacements`
to `true` to allow native previews of exact current-line replacements that preserve
the text before the cursor. Arbitrary multi-line next edits still use the reviewed
command; this does not implement Copilot's proposed native next-edit APIs.
Neither feature establishes that code was tested.

Reviewed next-edit proposals can survive unrelated typing that shifts the target
block. Acceptance checks that the block and surrounding context still match
uniquely; edits inside that context require a fresh proposal.

### Parallel source proposals

For independent changes, Agent can choose `delegate-isolated-tasks` with up to three
disjoint sets of exact writable paths. Each child receives a private copy of bounded
text source, including current unsaved buffers and applicable instructions. It can
inspect and edit its claimed files. These are source forks, not Git worktrees or an
OS sandbox: private children have no terminal, host-tool, adoption or scope-switch
capabilities. The parent and sequential delegation retain those capabilities.

The parent reviews proposals and uses `integrate-isolated-task` to apply selected
completed segments through its normal permissions, inspected-source hashes and
request checkpoint. Conflicting user edits are preserved. Child completion does not
verify the combined result: the parent still runs applicable checks and reviews it.
Status and Resume retain completed child work; discard removes a private job.
Forks are limited to 8 MiB of seed text and 3,000 files, four retained jobs per chat
and sixteen per storage area. Old jobs expire after seven days; deleting the parent
chat deletes its retained forks and child-session family. Larger work can use direct
tools or sequential delegation without creating a source fork.

When a local supported Chromium, Chrome or Edge browser is installed, Agent can
open an isolated browser, inspect text or screenshots, and read bounded console
and network observations. Network observations exclude headers, bodies, URL
credentials and query strings. Hover, click, type, supported keys and dialog
responses use approved interactions; the Assistant must observe the resulting
page before reporting an outcome. These observations are a limited recent
history, not a complete network trace or an application test suite.

Compatible VS Code agents can also use Workspai's contributed read-only tools:
**Workspai Workspace Inventory** (`#workspaiInventory`) and **Workspai Graph Search**
(`#workspaiGraph`). Enable them in the host agent's tool picker when needed. They
accept one open filesystem folder; with several folders open, provide its exact
path or unique name. These tools do not create, adopt or edit projects. Graph reads
use the CLI's freshness behavior and may refresh its derived Graph cache. Their
availability and selection in another agent depend on that host's tool support.

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

The separate Dashboard **Review Changes** tab is temporarily hidden.
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

Use **Continue in Agent** on the creation receipt to continue implementation and
run project checks with the selected model and the Assistant's available tools.
The handoff retains the created workspace and project destination; it starts a
fresh conversation without an unrelated repair or editor issue. For multiple
created projects, the Agent receives workspace scope. Non-native stacks can also
continue in Agent using the appropriate project toolchain.

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

The secondary sidebar Assistant supports four modes:

| Mode      | What it does                                                                    |
| --------- | ------------------------------------------------------------------------------- |
| **Ask**   | Reads bounded workspace context and explains without changing source.           |
| **Plan**  | Investigates the task and produces a grounded implementation plan.              |
| **Agent** | Changes source, runs scoped checks, reviews the diff, and verifies the outcome. |
| **Goal**  | Pursues a defined outcome with explicit checks and durable progress.            |

Agent mode works for ordinary requests and blocker cards. Examples:

- “Prepare this workspace for release.”
- “Fix dependency vulnerabilities without a breaking upgrade.”
- “Raise test coverage to 75% and keep the build green.”

For multi-part workspace Agent tasks, requested outcomes are retained from intent
routing without another model request. The Assistant tracks observed source
ranges and instruction pages, can reuse identical previews within a request, and
provides continuation locations for bounded reads. Resume retains this metadata;
it does not turn historical observations into current filesystem validation.

Completion includes a review of requested outcomes against recorded observations
and checks. Unresolved work keeps applicable tools available; read-loop feedback
does not force verification or declare success. Ask for the original failing
workflow or a focused behavioral check when static checks alone are insufficient.
Ordinary workspace verification remains distinct from canonical CLI verification,
and no fixed token-saving percentage is guaranteed.

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

# Analyze Repo

## Graph rendering consistency

Analyze Repo and Dashboard Graph deliberately use the same software 3D backend
as Graph GIF exports. Both retain interactive orbit, selection, shapes and
kind-based colors. GPU capability detection uses separate probe canvases;
availability alone is not used to select the embedded-webview renderer.
Analyze starts with **All evidence** in the bounded projection, rather than
hiding file/test kinds behind the Architecture filter. Displayed counts remain
distinct from canonical totals. This does not increase or invent Graph coverage.

For local pre-handoff change inspection, see [Review Changes](./REVIEW_CHANGES.md).

**Analyze Repo** answers one question before an agent touches unfamiliar code:
what is this system, how large is its evidence graph, and is its current state
ready for grounded agent work?

Paste a public repository-root URL from GitHub, GitLab, or Bitbucket into the
dashboard tab and select **Analyze**. The extension then:

1. resolves the current remote `HEAD` without credentials;
2. creates a shallow, no-submodule clone in extension-owned storage;
3. creates a separate minimal Workspai workspace and adopts the clone with
   project grounding disabled;
4. builds the canonical Workspace Model and Knowledge Graph;
5. runs `workspace intelligence run --for-agent generic --json`; and
6. measures one bounded Graph retrieval with the CLI's published methodology.

The UI projects the resulting artifacts. It does not maintain a second
framework detector, graph builder, readiness score, or token formula.

The results surface reuses the extension's production 3D Graph renderer as a
full-width, architecture-first explorer with project, entity-kind, text, and
neighborhood controls. It receives a sanitized, bounded projection of the
canonical Graph. Full entity, relation,
and proof totals remain visible when the visual projection is bounded. Doctor
cards are produced from `doctor-last-run.json` through the same canonical
Doctor evidence projector used by Dashboard and Studio.

## What the report means

Enable **Record analysis for GIF** before starting to capture the actual rendered
analysis page. The recorder samples each observed stage, then captures the results
from top to bottom and close views of the live Graph, Doctor, and next steps.
**Recorded analysis GIF** exports those screen frames at 960×600. It is a
time-compressed recording (up to 36 frames), not a continuous desktop video.
Recording stays inside this panel; it does not request screen-sharing access.
**Summary GIF** is a separate illustrated recap and is not a screen recording.

- **Verdict** is the status of the canonical intelligence run. `blocked` means
  the analysis completed and found a readiness gate; it is not presented as an
  execution failure.
- **Graph totals** come from the Knowledge Graph quality record.
- **High-connection surfaces** are a deterministic degree ranking over
  canonical Graph relations. They are navigation hints, not risk claims.
- **Context efficiency** is shown only when the CLI returns its
  `workspace-graph-token-efficiency.v1` result. It remains explicitly labelled
  as an estimate with the CLI-authored claim boundary.
- **Web/remote-agent fit** evaluates portable Graph evidence, proof coverage,
  Doctor blockers, and supported verification actions. It remains conditional
  until a remote environment is actually tested, and preserves a blocked
  intelligence gate even if Doctor has no blocking finding.
- **Security signals** come only from static Doctor evidence. They do not
  replace dependency audit, secret scanning, SAST, or penetration testing.
  An absent audit result is displayed as **Audit not verified**, never green.
- **Delivery controls** report observed CI, release, ownership, and verification
  entry points. **Change surface** summarizes high-connection Graph entities.
- **Analysis story GIF** replays only observed stages, captures the real
  rendered Graph, and tours Graph, Doctor, and decision scenes with focused
  zooms as a 960×540 shareable sequence. **360° Graph GIF** uses the same 3D
  scene and orbit encoder as the main Graph tab. Both are encoded locally and
  saved only after the user chooses a destination.

## Safety and resource boundary

Quick Analysis does not install project dependencies and does not run source,
build, test, start, or repository lifecycle commands. Git credential prompting,
credential-bearing environment variables and injected Git configuration,
submodules, tags, and LFS smudging are disabled. CLI home, configuration, and
registry state are isolated from the user's normal Workspai registry.

Each operation has a ten-minute process timeout and a 1 GB local-copy limit.
The user can stop an active operation or delete its local copy. At most three
completed analyses are retained; the cache key includes normalized URL, remote
commit, and verified CLI version, so a new commit or CLI release cannot reuse
stale evidence.

Opening the isolated copy creates a new VS Code window. It does not silently
replace or register the user's active workspace.
# Interactive investigation

After analysis, **Find your starting point** searches the complete captured
canonical Graph with the CLI's bounded search operation (eight primary results),
not only the 500-node visual projection. Questions and Doctor's **Find related
graph evidence** action enter the same search. A selected result shows connecting
surfaces and returned proofs. **Open source evidence** opens the referenced file
and line inside the isolated repository; it never executes a suggested command.

The host binds requests to the active analysis, refuses changed Graph artifacts,
and authorizes source access from retained proof IDs rather than webview paths.
Source content hashes, when present in a proof, must still match before opening.
Non-source artifacts and files above 2 MiB are not opened by this action. Missing
results or missing proofs are explicit, not a clean verdict. Search relations
are indexed structural evidence, not guaranteed runtime reachability or measured
test coverage. Search uses no model and does not adopt or rebuild the repository.

Repository analysis runs through the extension's pinned Workspai CLI 0.77.0
runtime. The first production run downloads that exact package, checks its
integrity, and reuses the cached copy. The UI does not silently substitute
sibling source or an unverified runtime for the released package.

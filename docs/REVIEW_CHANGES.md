# Review Changes

> The Dashboard tab is temporarily hidden in 0.49.0. The workflow below
> describes the retained implementation. Assistant file review remains available.

Review Changes is a local, pre-handoff view of working-tree changes and
CLI-authored impact. It is not an AI code reviewer or a completed verification.

1. Open **Review Changes** in the Workspai header.
2. Enter a local branch, tag or commit (default `HEAD`). This is a direct
   working-tree comparison, not a PR merge-base comparison or staged-only diff.
3. Choose the Git repository root using the native folder picker.
4. Inspect changed paths, CLI impact reasons and suggested commands.
5. Check freshness and copy the handoff report, with its limitations included.

The summary separates changed paths, CLI impact items, and suggested checks.
Missing impact is displayed as unavailable, never as zero. Filter the changed
paths locally without changing the comparison or hiding paths from the exported
handoff. Status counts include additions, modifications, deletions, untracked
files, and other Git statuses. No readiness score is invented from these counts.

The initial supported scope is a Git-rooted Workspai workspace with an existing
intelligence snapshot. The CLI's `workspace diff` and `workspace impact` refresh
their own evidence reports. Review does not adopt repositories, replace the
snapshot, install dependencies, run tests, execute recommended commands or edit
project source. Workspace trust is required. A missing snapshot or a linked
workspace whose Git observation does not cover the selected repository is an
explicit limitation, never a clean verdict.

## Evidence boundaries

- The comparison is pinned to a resolved commit. SHA-256 fingerprints include
  HEAD, changed filenames, working-file contents/modes, deletions and untracked
  files. Symlink targets are recorded without following them.
- More than 1,000 changed paths, 32 MiB of changed file contents, submodule
  changes, or files changing during collection stop the review.
- CLI impact remains a project-level dependency assessment. It does not prove
  complete runtime reachability, behavioral correctness or test coverage.
- Every suggested command is **not executed**. Some CLI recommendations can
  install, start services or repair files; copying a command is not approval to
  run it. The feature never executes commands supplied by the webview or report.
- Old test reports are not automatically attached as passing evidence. The
  current version does not import PCC verification receipts or launch tests.
- Leaving the webview or aging a snapshot prompts a recheck. Copy always checks
  contents again; stale reports cannot be copied through the handoff action.
- Freshness resolves the original selected ref again, so moving a comparison
  branch also invalidates the report. Editing the comparison field requires a
  refresh; checking the old report cannot validate the new selection. Refresh
  is bound to the active report ID and its natively selected repository.
- Impact must carry matching embedded diff evidence, including the comparison,
  model hashes, Git commit, and changed-path coverage. Missing evidence
  collections do not become an empty successful assessment.
- Handoffs retain repository identity, the selected ref and resolved commit,
  impact reasons, required/optional check labels, and verification limitations.
  Copy remains busy until the clipboard operation actually completes.
- Analysis is local, uses the configured CLI runtime, and needs no extra model
  service. No new CLI command, server or paid integration is introduced.

Automatic execution, matching PCC receipts, and Git observation across detached
linked workspaces are not part of this first version.

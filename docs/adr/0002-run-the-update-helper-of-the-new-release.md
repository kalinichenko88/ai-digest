# 0002 Run the update helper of the new release

- Status: accepted
- Date: 2026-11-26

## Updates

- 2026-11-26 #45: Consequences. Was: "has 4 lines of room under I-7, and the last four fixes to it added 5, 1, 8 and 16 lines".

## Context

`run.sh update` downloads the latest release and installs it with a helper:
the helper merges new sources into `sources.yml`, copies the new files and
pulls the image. Up to v0.1.8, the helper is a heredoc in the installed
`scripts/run.sh`. So the old version installs the new one, and a change to
the helper reaches an install one update late: the helper of v0.1.8 does not
copy `.mcp.json`, and the launcher must download it (#36). The heredoc also
kept `scripts/run.sh` at 256 lines, past the 160 of I-7 (#32).

## Options considered

- The helper is `scripts/apply-update.sh`, which each release ships at the
  root of its archive; `run.sh update` runs the copy in the release that it
  downloads.
- The helper is a file of the install, next to `run.sh`, and `run.sh update`
  runs that copy: an install that an older heredoc updated does not have the
  file, so its next update fails.
- The helper stays a heredoc in `run.sh`, and only the code gets shorter:
  the old version still installs the new one, and `run.sh` keeps three jobs.

## Decision

We will ship the helper as `apply-update.sh` at the root of the archive.
`run.sh update` extracts the release into a temp folder and runs
`bash <release>/apply-update.sh <release> <install> <version> <owner/repo>`.
`run.sh` deletes the temp folder at exit with an `EXIT` trap. The helper
copies a new `run.sh` over the one that bash runs, so `run.sh` runs the
helper inside its `if` block and exits in that block: bash has read the
whole block before it runs it, and it does not read the new file.

## Consequences

Good: the new version decides what it merges and copies, so a file that a
release adds reaches an install at its first update. `scripts/run.sh` drops
to 156 lines and leaves the `debt` list of I-7. The helper deletes no
folder, so a run of it from the repository cannot delete the repository.

Bad: each installed `run.sh` from this version on keeps a contract with
every later release. The asset name holds `tar.gz`, the archive has one top
folder `ai-digest/`, `apply-update.sh` is at its root, and the helper takes
the four arguments and runs on bash 3.2, the bash of macOS. A release that
breaks one of them stops `run.sh update`. The check and the download stay in
`run.sh`, so a change to them still reaches an install one update late. The
first update from v0.1.8 or older still runs the old heredoc; only the
update after it runs the helper of the new release. `scripts/run.sh` has 3
lines of room under I-7, and the last five fixes to it added 5, 1, 8, 16
and 1 lines. `run.sh update` runs code of the downloaded release at once; before,
the next run of the copied `run.sh` ran it, so the update trusts the
release no more than before.

## Invariants

None. `scripts/run.sh` leaves the `debt` list of I-7.

## Confirmation

`tests/scripts/run.test.ts` builds the archive with
`scripts/build-archive.sh` and runs `run.sh update` on it with stubs for
`curl`, `gh`, `docker` and `claude`. It checks the installed `.mcp.json` and
`apply-update.sh`, that the download is deleted, and that the launcher after
the update block does not start Claude.

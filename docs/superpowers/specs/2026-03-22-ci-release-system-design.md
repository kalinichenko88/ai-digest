# CI & Release System Design

## Overview

End users should not need source code. They download a release archive from GitHub Releases containing the launch script, Claude Code skills, and configs. The release process is driven by a Claude Code skill (`/release`), CI handles quality checks and artifact building.

**Repository constant:** `REPO=kalinichenko88/ai-digest` — all scripts and CI reference this single constant for GitHub URLs and API calls. The actual repo slug must be confirmed before implementation.

## 1. Skill `/release <version>`

**Invocation:** `/release 1.0.0`

**Steps:**

1. **Validate** — version is valid semver, tag does not exist, branch is `main`, working tree is clean
2. **Bump version** in `package.json`, `README.md`, `.version`
3. **Commit:** `release: v1.0.0`
4. **Tag:** `v1.0.0`
5. **Generate release description** — analyze `git log <prev-tag>..v<version>`, group changes by category (features, fixes, improvements)
6. **Create GitHub Release** as draft: `gh release create v1.0.0 --title "v1.0.0" --notes "<description>" --draft`
7. **Push** branch + tag: `git push && git push --tags`

> **Note:** Draft release is created before push (step 6 before 7) to avoid a race condition where CI triggers on the tag push and tries to attach artifacts to a release that doesn't exist yet.

The release stays as draft until CI attaches artifacts and publishes it.

**Skill location:** `.claude/skills/release/SKILL.md`

## 2. CI Workflow

**File:** `.github/workflows/ci.yml` (replaces `docker-publish.yml`)

**Permissions:** `contents: write`, `packages: write` (required for release artifact upload and Docker push to GHCR).

### Trigger: any push (all branches)

- **Quality checks:** `biome check` + `vitest run`

### Trigger: tag `v*`

Runs sequentially after quality checks pass:

1. **Quality checks** — biome + vitest. If fails, pipeline stops, release stays draft
2. **Build Docker image** — multi-stage build, push to GHCR (`ghcr.io/kalinichenko88/ai-digest`) with semver tags (latest, major, major.minor, full)
3. **Build release archive** — `ai-digest-v1.0.0.tar.gz` (see section 3 for contents)
4. **Upload archive** — attach `.tar.gz` to existing GitHub Release
5. **Publish release** — `gh release edit v1.0.0 --draft=false`

## 3. Release Archive Contents

```
ai-digest/
├── .claude/
│   ├── skills/
│   │   ├── ai-digest/SKILL.md
│   │   ├── add-source/SKILL.md
│   │   └── validate-sources/SKILL.md
│   └── settings.json        # MCP server config (Docker)
├── config/
│   ├── sources.yml           # default sources
│   └── delivery.yml          # template
├── .env.example
├── .version                  # plain text version
├── run.sh                    # launch script + update subcommand
├── install.sh                # interactive installer
├── CLAUDE.md                 # example template (user edits for personalization)
└── README.md
```

**Not included:** `src/`, `tests/`, `node_modules/`, `dist/`, `Dockerfile`, `package.json`, `tsconfig.json`, `biome.json`, `.github/`, `.husky/`

## 4. Install Script (`install.sh`)

**Two modes:**

### Via curl (remote)

```bash
curl -sL https://github.com/kalinichenko88/ai-digest/releases/latest/download/install.sh | bash
```

> **Note:** URL points to the latest published release asset, not to `main` branch. This ensures the installer version matches the archive it downloads.

1. Fetches latest release archive via GitHub API (unauthenticated)
2. Unpacks to current directory
3. Runs interactive setup

### From archive (local)

```bash
./install.sh
```

Runs interactive setup on already unpacked files.

### Interactive Setup

1. **Check dependencies** — `docker`, `claude`, `gh`. Warns if missing, does not block
2. **Language** — digest language (default: `en`)
3. **Output path** — where to save digests (default: `~/digests`)
4. **GitHub token** — optional, increases API rate limit (default: empty)
5. **Notifications** — enable macOS notifications (default: `true`)
6. **Write configs** — substitutes answers into `delivery.yml` and `.env`
7. **Pull Docker image** — `docker pull ghcr.io/kalinichenko88/ai-digest:latest`
8. **Print summary** — "Edit CLAUDE.md for personalization, run: `./run.sh`"

## 5. Update Mechanism (`run.sh update`)

**Invocation:** `./run.sh update`

**Steps:**

1. **Read current version** from `.version`
2. **Fetch latest version** via unauthenticated GitHub REST API:
   ```bash
   curl -s https://api.github.com/repos/kalinichenko88/ai-digest/releases/latest
   ```
   Falls back to `gh api` if `gh` is present and authenticated. Reads `GITHUB_TOKEN` from `.env` if available to avoid rate limits.
3. **Compare** — if equal, print "Already up to date" and exit
4. **Download** new release archive to temp directory, unpack
5. **Merge configs** (using `yq` — added as a declared dependency, checked at runtime):
   - `sources.yml` — union merge by source `name` field: new sources are appended, existing sources keep user values. Algorithm: iterate new file entries, skip if `name` already exists in user file, append otherwise.
   - `delivery.yml` — shallow key merge: new keys are added with defaults, existing keys preserve user values. Algorithm: for each top-level key in new file, add to user file only if key is absent.
   - `.env` — not touched
   - `CLAUDE.md` — not touched
6. **Self-update safely** — copy new `run.sh` to a temp file, then `exec` into a helper script from temp that:
   - Replaces skills, settings.json, run.sh, install.sh, README.md, .version
   - Pulls new Docker image: `docker pull ghcr.io/kalinichenko88/ai-digest:<new-version>`
   - Prints what was updated, which new config keys were added

   > **Note:** `run.sh` cannot replace itself while running. The exec-into-helper pattern ensures the old script hands off to a temp copy before any files are overwritten.

## 6. File Changes Summary

### New files

| File | Description |
|---|---|
| `.claude/skills/release/SKILL.md` | `/release <version>` skill |
| `scripts/install.sh` | Interactive installer |
| `scripts/build-archive.sh` | Builds release archive (called by CI) |
| `.version` | Current version (plain text, synced by `/release` skill) |

### Modified files

| File | Change |
|---|---|
| `scripts/run.sh` | Add `update` subcommand with exec-into-helper self-update |
| `.github/workflows/docker-publish.yml` | Rename to `ci.yml`. Add: `contents: write` permission, quality checks on every push, archive build + attach + publish on tag |
| `CLAUDE.md` | Add `/release` skill documentation |
| `README.md` | Installation via `curl \| bash` and update instructions |

### Unchanged

`src/`, `config/`, `tests/`, `Dockerfile`, `.claude/skills/ai-digest/`, `.claude/skills/add-source/`, `.claude/skills/validate-sources/`

## 7. Dependencies

| Dependency | Required by | Notes |
|---|---|---|
| `docker` | run.sh, install.sh | Required for MCP server |
| `claude` | run.sh | Claude Code CLI |
| `gh` | /release skill | GitHub CLI for release creation |
| `yq` | run.sh update | YAML merge for config updates. Checked at runtime, install.sh warns if missing |
| `curl` | install.sh, run.sh update | Unauthenticated GitHub API calls |

## 8. Full Flow

```
Developer                            CI                              End User
─────────                            ──                              ────────

git push (any branch)
          ──────────────────►  quality checks (biome + vitest)
                               pass / fail

/release 1.0.0
  ├─ bump .version, package.json, README
  ├─ commit + tag v1.0.0
  ├─ gh release create (draft)
  ├─ push branch + tag
          ──────────────────►  quality checks
                               pass
                               build Docker → GHCR
                               build archive (tar.gz)
                               attach archive to release
                               gh release edit --draft=false
                                                                    curl | bash
                                                                      ├─ download archive
                                                                      ├─ interactive setup
                                                                      ├─ docker pull
                                                                      └─ ready

                                                                    ./run.sh update
                                                                      ├─ check version (curl)
                                                                      ├─ download new archive
                                                                      ├─ merge configs (yq)
                                                                      ├─ exec into helper
                                                                      ├─ replace files
                                                                      ├─ docker pull
                                                                      └─ print summary
```

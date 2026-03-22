---
name: release
description: Create a new release — bump version, tag, generate changelog, create GitHub Release
user_invocable: true
arguments:
  - name: version
    description: Semver version to release (e.g., 1.0.0)
    required: true
---

# Release

Create a new release for ai-digest.

## Prerequisites

Before starting, validate ALL of the following. Stop and report if any check fails:

1. Working tree is clean: `git status --porcelain` returns empty
2. Current branch is `main`: `git branch --show-current` returns `main`
3. Version `{version}` is valid semver (MAJOR.MINOR.PATCH)
4. Tag `v{version}` does not exist: `git tag -l "v{version}"` returns empty
5. `gh` CLI is authenticated: `gh auth status` succeeds

## Steps

### Step 1: Bump version

Update version in these files:
- `.version` — replace contents with `{version}`
- `package.json` — update `"version"` field to `"{version}"`
- `README.md` — update any version references

### Step 2: Update CHANGELOG.md

Determine previous tag:
```bash
git describe --tags --abbrev=0 HEAD 2>/dev/null || echo ""
```

If previous tag exists, analyze commits since that tag:
```bash
git log {prev_tag}..HEAD --oneline
```

If no previous tag, analyze all commits:
```bash
git log --oneline
```

Update `CHANGELOG.md` in Keep a Changelog format:

1. Add a new section `## [{version}] - {YYYY-MM-DD}` **after** the intro text and **before** the previous release section
2. Group changes into subsections:
   - **Added** — new functionality (`feat:` commits)
   - **Fixed** — bug fixes (`fix:` commits)
   - **Changed** — refactoring, behavior changes (`refactor:`, `perf:` commits)
   - **Docs** — documentation updates (`docs:` commits)
   - **Improved** — chores, DX improvements (`chore:` commits)
   - Only include subsections that have entries
3. Write concise, human-readable descriptions (not raw commit messages)
4. Add a comparison link at the bottom of the file:
   `[{version}]: https://github.com/kalinichenko88/ai-digest/compare/v{prev_version}...v{version}`
   If no previous tag: `[{version}]: https://github.com/kalinichenko88/ai-digest/releases/tag/v{version}`

### Step 3: Commit and tag

```bash
git add .version package.json README.md CHANGELOG.md
git commit -m "release: v{version}"
git tag "v{version}"
```

### Step 4: Generate release description

Determine previous tag:
```bash
git describe --tags --abbrev=0 HEAD~1 2>/dev/null || echo ""
```

If previous tag exists, analyze commits between tags:
```bash
git log {prev_tag}..v{version} --oneline
```

If no previous tag, analyze all commits:
```bash
git log --oneline
```

Group changes into categories:
- **Features** — new functionality (commits starting with `feat:`)
- **Fixes** — bug fixes (commits starting with `fix:`)
- **Improvements** — refactoring, performance, DX (commits starting with `refactor:`, `perf:`, `chore:`, `docs:`)

Write a concise, human-readable description. Include:
- Summary of what's new (2-3 sentences)
- Categorized list of changes
- Docker image tag: `ghcr.io/kalinichenko88/ai-digest:{version}`
- Install command: `curl -sL https://github.com/kalinichenko88/ai-digest/releases/latest/download/install.sh | bash`
- Update command: `./run.sh update`

### Step 5: Push

```bash
git push origin main
git push origin "v{version}"
```

### Step 6: Create draft GitHub Release

> **Note:** `gh release create` requires the tag to exist on remote, so push happens first.
> The race condition with CI is not a practical concern — CI queue latency ensures the draft release
> is created before CI reaches the artifact upload step.

```bash
gh release create "v{version}" \
  --title "v{version}" \
  --notes "<generated description>" \
  --draft
```

After push, CI will:
1. Run quality checks (biome + vitest)
2. Build and push Docker image to GHCR
3. Build release archive and attach to this release
4. Remove draft flag — release becomes public

### Step 7: Verify

Report to user:
- Release URL: `https://github.com/kalinichenko88/ai-digest/releases/tag/v{version}`
- CI status: `gh run list --limit 1`
- Remind: "CI will publish the release once quality checks and builds pass"

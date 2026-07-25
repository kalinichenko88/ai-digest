# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.6] - 2026-07-25

### Added

- Append-only `logs/run.log` capturing process diagnostics: uncaught exceptions,
  unhandled rejections, signals, and exit codes (a missing exit line means SIGKILL)
- Per-tool call timing and error logging — a throwing handler is no longer invisible
- `run.sh` fails fast with a clear exit code when Docker is missing or its daemon is down,
  and notifies on failure so a dead run is visible without digging through logs

### Fixed

- CI now runs `tsc --noEmit` and treats Biome warnings as errors — type and lint breaks
  previously slipped through and surfaced as a stuck draft release
- `@types/node` realigned to the Node 24 runtime, with the `engines` floor enforced
  via `.npmrc` so an incompatible install fails instead of warning

### Changed

- Removed ~650 lines of over-engineering with no behavior change: the pass-through
  `checkDuplicates` tool, unread result fields, and duplicated log statements
- Hand-rolled date and timestamp formatting replaced with `toLocaleString('sv-SE')`,
  pinned by a test so a small-ICU runtime can't silently corrupt log filenames
- Sources: added openclaw RSS, dropped the broken claude-code-blog feed

### Docs

- Deleted `docs/prd.md` and `docs/design-spec.md` — both restated the README and the
  code; git history keeps the original rationale

### Improved

- Dependencies bumped to latest majors: TypeScript 7, Vitest 4, MCP SDK 1.29,
  lint-staged 17, Biome 2.5.5, plus GitHub Actions updates

## [0.1.5] - 2026-04-06

### Added

- Narrative intro paragraph to daily digest output
- Break intro into short paragraphs for improved readability

### Docs

- Update cross-day dedup spec and PRD, remove outdated plans

## [0.1.4] - 2026-04-06

### Added

- Cross-day deduplication engine with URL and title normalization
- `fetch_previous_urls` and `check_duplicates` MCP tools
- Title word-overlap similarity scoring for fuzzy duplicate detection
- Deduplication types, config, and digest fixture files

### Fixed

- Suppress log writes during test runs
- Read MCP server version from package.json instead of hardcoded value

### Docs

- Add cross-day deduplication design spec and implementation plan
- Add PATH setup for Apple Shortcuts scheduling
- Add update command to release description template

## [0.1.3] - 2026-03-22

### Added

- CHANGELOG.md generation as part of the release process

### Fixed

- Improve JSON parsing for tag and archive URL in `run.sh`

## [0.1.2] - 2025-06-04

### Fixed

- Increase max-turns from 30 to 50 to prevent pipeline timeout

### Docs

- Add Obsidian vault integration tip
- Add CI and release badges to README
- Add scheduling section with no built-in scheduler note

## [0.1.1] - 2025-05-31

### Added

- Per-step progress logging to ai-digest pipeline
- `/release` skill for version management
- Full CI/CD pipeline: quality checks + Docker publish + release
- Update subcommand to `run.sh` with safe self-update
- Interactive `install.sh` for end-user setup
- `build-archive.sh` for release artifact assembly
- `.version` file for release tracking
- MCP server, Docker distribution, Biome linting

### Fixed

- Skip prepare script in Docker production install
- Use host timezone in Docker container and logger
- Remove yq and gh from install.sh dependency check

### Improved

- Configure import ordering and add `node:` prefix
- Bump GitHub Actions to Node.js 22+ compatible versions

[0.1.6]: https://github.com/kalinichenko88/ai-digest/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/kalinichenko88/ai-digest/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/kalinichenko88/ai-digest/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/kalinichenko88/ai-digest/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/kalinichenko88/ai-digest/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/kalinichenko88/ai-digest/releases/tag/v0.1.1

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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

[0.1.5]: https://github.com/kalinichenko88/ai-digest/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/kalinichenko88/ai-digest/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/kalinichenko88/ai-digest/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/kalinichenko88/ai-digest/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/kalinichenko88/ai-digest/releases/tag/v0.1.1

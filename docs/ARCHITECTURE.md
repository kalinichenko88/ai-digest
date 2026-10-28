# Architecture

ai-digest makes a daily tech news digest. This file holds what the code
cannot tell: where each kind of work lives, which rules the code keeps, and
the limits of a file and a folder. It states what the code keeps now. A
change to a rule needs an ADR.

## Bird's-eye view

The pipeline is a prompt, not code. Claude Code runs the `ai-digest` skill.
The skill calls MCP tools for the deterministic work: fetch the sources, read
the previous digests, classify duplicates, validate the config. Claude does
the judgment work itself: filter by the person's interests, categorize,
summarize, write the Markdown file, notify.

The MCP server is one Node process over stdio. It normally runs in Docker:
`.claude/settings.json` starts `docker run` with the install's `config/` and
`logs/` folders mounted into the container.

Data flow of one run:

1. `scripts/run.sh` starts `claude -p "Run ai-digest skill"` and tails
   `logs/YYYY-MM-DD.md`.
2. The skill calls `validate_sources`, then `fetch_previous_urls`, then
   `fetch_all_rss` and `fetch_github_releases`, then `check_duplicates`.
3. Each tool reads `config/sources.yml` or `config/delivery.yml` on that
   call, does its work, and returns one JSON object.
4. Claude writes `<output_path>/YYYY-MM-DD.md`. The next runs read that file
   back for deduplication.

Two things ship: the Docker image on GHCR (the server and the default
config), and a tarball on GitHub Releases (the skills, `settings.json`, the
config templates, `run.sh`, `install.sh`). `run.sh update` replaces the
tarball files and merges new sources into the person's `sources.yml`.

## Codemap

```
src/mcp-server.ts           the edge: tool registration, stdio transport,
                            config paths, process death hooks
src/config.ts               reads config/*.yml, fills the defaults
src/logger.ts               appends to logs/run.log
src/types.ts                the shared types
src/tools/                  one file per tool capability
  fetch-rss.ts              RSS feeds -> DigestItem[]
  fetch-github-releases.ts  GitHub API -> DigestItem[]
  fetch-previous-urls.ts    previous digests on disk -> DigestEntry[]
  check-duplicates.ts       items x previous entries -> classification
  validate-sources.ts       sources.yml structure, URL reachability
src/utils/                  pure string functions: normalize, similarity
tests/                      vitest, one file per src file; fixtures/digests
.claude/skills/             the pipeline and the user commands, as prompts
.claude/settings.json       wires the MCP server: docker run with mounts
.claude/CLAUDE.md           instructions for work on this repo; not shipped
CLAUDE.md                   the reader's context: stack, interests, topics
                            to ignore; the ai-digest skill reads it, and the
                            archive ships it as a template
config/                     sources.yml, delivery.yml
scripts/                    run.sh (launcher and updater), install.sh,
                            build-archive.sh
Dockerfile                  two stages: build, then dist + config
.github/workflows/ci.yml    biome, tsc, vitest; on a tag: image and release
```

## Modules

The areas live in file names, not in folders: `src/tools/` holds files of
two areas. Folders are by kind (`tools/`, `utils/`).

| Area         | Files                                                                                                                                                                                   | Public API                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Pipeline     | `.claude/skills/ai-digest/`                                                                                                                                                             | the skill name; it uses the server only through the tool names that `src/mcp-server.ts` registers |
| Sources      | `src/tools/fetch-rss.ts`, `src/tools/fetch-github-releases.ts`, `src/tools/validate-sources.ts`, `config/sources.yml`, `.claude/skills/add-source/`, `.claude/skills/validate-sources/` | the exported functions of each tool file; `src/mcp-server.ts` is their only importer              |
| Dedup        | `src/tools/fetch-previous-urls.ts`, `src/tools/check-duplicates.ts`, `src/utils/`, the `deduplication` block of `config/delivery.yml`                                                   | the same rule                                                                                     |
| Server       | `src/mcp-server.ts`, `src/config.ts`, `src/logger.ts`, `src/types.ts`                                                                                                                   | the MCP tool names and their JSON shapes, which `src/types.ts` states                             |
| Distribution | `Dockerfile`, `scripts/`, `.claude/settings.json`, `.github/workflows/ci.yml`, `.claude/skills/release/`                                                                                | `install.sh`, `run.sh`, `run.sh update`                                                           |

Dependencies point one way: `mcp-server.ts` → `tools/` → `utils/` and
`types.ts`. `config.ts` and `logger.ts` are leaves that any file may import.
A tool file does not import another tool file, except `check-duplicates.ts`,
which uses `utils/`.

## Layers

| Role              | Where                                                                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edge              | the tool handlers in `src/mcp-server.ts`; each `SKILL.md` in `.claude/skills/`; `scripts/run.sh`                                                                                             |
| Check at the edge | the zod `inputSchema` of each tool in `src/mcp-server.ts`; the defaults and the `sources.yml` shape check in `src/config.ts` (see _Cross-cutting concerns_)                                  |
| Logic             | `src/tools/check-duplicates.ts`; `validateStructure` in `src/tools/validate-sources.ts`; `src/utils/`                                                                                        |
| Data              | `src/tools/fetch-rss.ts`; `src/tools/fetch-github-releases.ts`; `src/tools/fetch-previous-urls.ts`; `checkReachability` in `src/tools/validate-sources.ts`; `src/config.ts`; `src/logger.ts` |

## Patterns

- Each `fetch-*.ts` in `src/tools/` returns `ToolResult`: `items` and an
  optional `warnings`. A source that fails becomes a warning; the other
  sources still return. Fan-out uses `Promise.allSettled`.
- Each tool function in `src/tools/` takes parsed config or a path as an
  argument. The config is loaded on every tool call, by `src/mcp-server.ts`
  or, for `validate_sources`, by `validateSources`, so an edit to
  `config/*.yml` takes effect on the next call, with no restart.
- Dates are local, not UTC. `toLocaleDateString('sv-SE')` gives
  `YYYY-MM-DD` in local time; a digest file name is the person's calendar
  day. For this, `.claude/settings.json` passes `TZ` and mounts
  `/etc/localtime` into the container.
- Each network call carries a timeout of 10 to 15 seconds: `AbortSignal.timeout`
  on `fetch`, `timeout` on the RSS parser.
- `src/logger.ts` is silent under vitest (`process.env.VITEST`), so a test
  never writes `logs/`.
- Each `.test.ts` in `tests/` tests one `src/` file and mocks at the
  boundary: `vi.mock('rss-parser')`, `vi.stubGlobal('fetch')`. The config
  tests write real files under `tests/fixtures/config/` and delete them.
  One exception: `tests/fetch-previous-urls.test.ts` also checks the
  Step 7 digest template of the `ai-digest` skill, which shapes the files
  that module reads back.

## Invariants

- **I-1.** Only `src/mcp-server.ts` knows the transport. It is the only
  file in `src/` that imports `@modelcontextprotocol/sdk` or `zod`, and no
  file in `src/` imports it back.
  Check: grep `@modelcontextprotocol|from 'zod'|mcp-server` in `src/` except `src/mcp-server.ts`.
- **I-2.** Only `src/tools/` reaches the network.
  Check: grep `fetch\(|parseURL\(|rss-parser` in `src/` except `src/tools/`.
- **I-3.** Only `src/config.ts` parses YAML.
  Check: grep `from 'yaml'` in `src/` except `src/config.ts`.
- **I-4.** No file in `src/` writes to stdout. Stdout is the MCP transport;
  one stray line breaks the protocol. Diagnostics go to `logs/run.log`
  through `src/logger.ts`, or to stderr.
  Check: grep `console\.log\(|process\.stdout` in `src/`.
- **I-5.** `src/tools/` and `src/utils/` know no path of the install: no
  `__dirname`, no `import.meta`, no home directory, no config file name.
  They get paths and parsed config as arguments from `src/mcp-server.ts`.
  Check: grep `__dirname|import\.meta|homedir\(|sources\.yml|delivery\.yml` in `src/tools/` `src/utils/`.
- **I-6.** Code in `src/tools/` does not `throw`. A failed source is a
  warning in the result, so one dead feed does not end the whole call.
  Check: grep `throw` in `src/tools/`.
- **I-7.** No code file in `src/`, `tests/` or `scripts/` has more than
  160 lines.
  Check: lines 160 in `src/` `tests/` `scripts/` debt `src/mcp-server.ts` `scripts/run.sh`.
- **I-8.** No folder in `src/`, `tests/` or `scripts/` holds more than 8
  code files of its own.
  Check: files 8 in `src/` `tests/` `scripts/`.

## Limits of decomposition

The limits come from the project's own sizes on 2026-10-28: the 90th
percentile by nearest rank, over the 28 code files and 7 folders that
`data.ere` of the debt skill leaves in.

- Lines per file: rank 26 of 28 is 160. Two files are above it and start on
  the `debt` list of I-7: `src/mcp-server.ts` (264) and `scripts/run.sh`
  (226). `tests/validate-sources.test.ts` is at 160, the limit itself.
- Code files per folder: rank 7 of 7 is 8. No folder is above it. `tests/`
  is at 8, the limit itself; `src/tools/` is at 5.

`tests/` and `scripts/` are under the limits, with `scripts/run.sh` as
known debt. A path leaves the `debt` list when it drops under the limit. A
new number needs an ADR.

## Cross-cutting concerns

- **Config.** Two files, `config/sources.yml` and `config/delivery.yml`.
  `src/mcp-server.ts` resolves `config/` next to `dist/`; in Docker that is
  `/app/config`, the mount of the install's `config/`. Only `src/config.ts`
  parses them. `delivery.yml` gets a default for every key in
  `src/config.ts`, so `run.sh update` does not merge it. `sources.yml` has
  no defaults. `loadSourcesConfig` checks its shape at load: `rss` is a list
  of mappings and `github_releases.repos` is a list. A wrong shape throws one
  error that names each wrong part, so every tool fails with that message,
  and `validate_sources` returns it as a structure error. The fields of each
  entry are checked only by `validateStructure`, when `validate_sources`
  runs: a bad field fails one source, not the call.
  `install.sh` writes `delivery.yml` and `.env`; `run.sh update` merges new
  sources into `sources.yml` with `yq` when `yq` is installed.
- **Secrets.** `GITHUB_TOKEN` lives in `.env`, reaches the container through
  `--env-file`, and is read in `src/tools/fetch-github-releases.ts` only.
- **Logging.** Two files in `logs/`. `logs/run.log` holds process
  diagnostics: `src/logger.ts` writes `[date time] [pid] [tag] message`
  from the server, and `runlog` in `scripts/run.sh` writes `[date time]
  [pid] message` from the launcher. `logs/YYYY-MM-DD.md` holds the run of
  the pipeline: Claude's stdout, appended by `run.sh`, and the progress
  lines that the `ai-digest` skill writes with `echo`. One tag per area:
  `mcp`, `config`, `rss`, `github`, `dedup`, `validation`, or the tool
  name.
- **Errors.** Three tiers. A failed source is a warning in the tool result
  (I-6). A thrown error in a handler goes through the one wrapper around
  `server.registerTool` in `src/mcp-server.ts`: it logs `FAILED` with the
  elapsed time and rethrows, and the SDK turns it into an error response.
  Process death hooks log `uncaughtException`, `unhandledRejection`, each
  signal, and the exit code; a `run.log` with no `exiting code=` line means
  a SIGKILL. `run.sh` exits 2 with no `docker` and 3 with no daemon.
- **Time.** Local time everywhere: log stamps, digest file names, the
  dedup window. The container gets `TZ` and `/etc/localtime`.
- **Version.** `.version`, `package.json` and `README.md` carry it; the
  `release` skill bumps all three. The server reads `package.json` at start
  for its MCP server version.

## ADRs

None accepted yet. An ADR goes to `docs/adr/NNNN-title.md` and into this
index in the same commit.

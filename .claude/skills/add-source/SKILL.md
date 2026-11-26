---
name: add-source
description: Add a new news source (RSS or GitHub release) to ai-digest config
model: haiku
allowed-tools: Read, Edit, mcp__ai-digest-mcp__validate_sources
---

# Add Source

Help the user add a new source to `config/sources.yml`. The `validate_sources`
MCP tool checks the new entry. This skill does no checks of its own.

## Flow

1. Ask: "What type of source? (rss / github_release)"

2. Based on type, ask for required info:
   - **rss**: Ask only for the URL. Use limit 10 by default.
   - **github_release**: Ask for repo in `owner/name` format (e.g. "facebook/react")

3. Read current `config/sources.yml`

4. Append the new entry to the correct section, and write the file:
   - rss → append to `rss` array. Generate the name yourself — derive a short lowercase identifier from the domain/path (e.g. `https://react.dev/blog/rss.xml` → `react-blog`, `https://dev.to/feed` → `devto`). When an `rss` entry already has that name, add `-2`, `-3` and so on, until no entry has it.
   - github_release → append to `github_releases.repos` array

5. Call the `validate_sources` MCP tool (no arguments). It checks the whole
   file: duplicates (an RSS source by name and by URL, a GitHub source by
   repo), the fields, and that each URL is reachable.

6. Read the result for the new entry:
   - The tool is not available (the MCP server does not run): remove the new
     entry, say that the MCP server must run to check it (`/ai-digest` needs
     the server too), and stop.
   - `reachability` is empty: the file did not load. Remove the new entry,
     show the error, and stop.
   - `structure.errors` holds an error of the new entry: remove the new entry,
     show the error, and stop. An error of a new RSS entry starts with
     `rss[N]`, where N is its index in `rss`, counted from 0. An error of a
     new repo quotes it whole, as `"owner/name"`.
   - Its `reachability` item has `status: failed`: show its `detail`, and ask
     whether to keep it. If not, remove the new entry and stop.
   - `structure.errors` holds errors of other sources: they stop the next
     digest run. Say how many there are, in one line, and that
     `/validate-sources` shows them.

7. Confirm: "Added <name/repo> to <section>." When `structure.valid` is true,
   add: "It will be included in the next digest run."

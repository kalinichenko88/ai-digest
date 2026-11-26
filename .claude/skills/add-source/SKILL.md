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
   - **rss**: Ask only for the URL. Generate the name yourself — derive a short lowercase identifier from the domain/path (e.g. `https://react.dev/blog/rss.xml` → `react-blog`, `https://dev.to/feed` → `devto`). Use limit 10 by default.
   - **github_release**: Ask for repo in `owner/name` format (e.g. "facebook/react")

3. Read current `config/sources.yml`

4. Append the new entry to the correct section, and write the file:
   - rss → append to `rss` array
   - github_release → append to `github_releases.repos` array

5. Call the `validate_sources` MCP tool (no arguments). It checks the whole
   file: duplicates (an RSS source by name and by URL, a GitHub source by
   repo), the fields, and that each URL is reachable.

6. Read the result for the new entry:
   - `structure.errors` holds a `duplicate name` error for the new RSS entry,
     and no other error for it: you made the name, so give it another one (as
     `react-blog-2`), write the file, and go back to step 5.
   - `structure.errors` holds another error that names the new entry (its
     `rss[N]` index, its name or its repo), or `reachability` is empty (the
     file did not load): remove the new entry, show the error, and stop.
   - Its `reachability` item has `status: failed`: show its `detail`, and ask
     whether to keep it. If not, remove the new entry and stop.
   - Errors of other sources are not part of this task: say how many there
     are, in one line, and that `/validate-sources` shows them.
   - The tool is not available (the MCP server does not run): keep the entry,
     and say that it is not checked and that `/validate-sources` checks it.
   - The new entry passes: say nothing about the checks.

7. Confirm: "Added <name/repo> to <section>. It will be included in the next digest run."

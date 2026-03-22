---
name: add-source
description: Add a new news source (RSS or GitHub release) to ai-digest config
model: haiku
allowed-tools: Read, Edit, WebFetch
---

# Add Source

Help the user add a new source to `config/sources.yml`.

## Flow

1. Ask: "What type of source? (rss / github_release)"

2. Based on type, ask for required info:
   - **rss**: Ask only for the URL. Generate the name yourself — derive a short lowercase identifier from the domain/path (e.g. `https://react.dev/blog/rss.xml` → `react-blog`, `https://dev.to/feed` → `devto`). Use limit 10 by default.
   - **github_release**: Ask for repo in `owner/name` format (e.g. "facebook/react")

3. Read current `config/sources.yml`

4. Check for duplicates before adding:
   - **rss**: check if the same URL already exists
   - **github_release**: check if the same repo already exists
   - If duplicate found, tell the user and do NOT add it

5. Validate the source is reachable before adding:
   - **rss**: WebFetch the URL, check for HTTP 2xx response
   - **github_release**: WebFetch `https://github.com/{owner}/{repo}`, check it exists
   - If the source returns 404 or connection error, warn the user and ask whether to add it anyway
   - If the source is reachable, proceed silently

6. Append the new entry to the correct section:
   - rss → append to `rss` array
   - github_release → append to `github_releases.repos` array

7. Write the updated file

8. Confirm: "Added <name/repo/account> to <section>. It will be included in the next digest run."

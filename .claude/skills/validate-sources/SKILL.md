---
name: validate-sources
description: Validate sources.yml structure and check that all URLs/endpoints are reachable. Use when the user wants to check, verify, validate, or test the sources config, or after adding/modifying sources. Also use when the user mentions broken links, 404 errors, or source health checks.
model: haiku
allowed-tools: Read, Bash
---

# Validate Sources

Validate `config/sources.yml` for structural correctness and URL reachability.

## Step 1: Call the MCP tool

Call the `validate_sources` MCP tool (no arguments).

## Step 2: Report results

Format the JSON response as a structured report:

### If structure has errors:
```
## Sources Validation Report

### Structure: ✗ Errors found
- <error 1>
- <error 2>
```

### URL check results:
```
### URL Checks (N sources)
✓ rss: name — OK
✗ rss: name — HTTP 404

### Summary
X passed, Y failed, Z unable to verify
```

If everything passes, keep it short: "All N sources valid, all URLs reachable."

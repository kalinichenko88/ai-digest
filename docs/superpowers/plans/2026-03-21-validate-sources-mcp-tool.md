# validate_sources MCP Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `validate_sources` MCP tool that validates `config/sources.yml` structure and checks URL reachability using Node's native `fetch`.

**Architecture:** A new `src/tools/validate-sources.ts` module exports two functions: `validateStructure` (sync, validates YAML shape) and `checkReachability` (async, HEAD/GET requests to all URLs). The MCP tool in `mcp-server.ts` calls both and returns a structured report. Results are logged via the existing logger.

**Tech Stack:** TypeScript, Node.js native `fetch`, Vitest, existing `SourcesConfig` types

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/tools/validate-sources.ts` | Structure validation + URL reachability checks |
| Create | `tests/validate-sources.test.ts` | Unit tests (mocked fetch for reachability) |
| Modify | `src/mcp-server.ts:1-10,100-111` | Register `validate_sources` tool |

---

### Task 1: Structure Validation

**Files:**
- Create: `src/tools/validate-sources.ts`
- Create: `tests/validate-sources.test.ts`

- [ ] **Step 1: Write failing tests for structure validation**

```ts
// tests/validate-sources.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateStructure } from "../src/tools/validate-sources.js";
import type { SourcesConfig } from "../src/types.js";

describe("validateStructure", () => {
  it("returns no errors for valid config", () => {
    const config: SourcesConfig = {
      rss: [{ name: "test", url: "https://example.com/rss", limit: 10 }],
      github_releases: { repos: ["owner/repo"] },
      twitter: { accounts: ["someuser"] },
    };
    expect(validateStructure(config)).toEqual([]);
  });

  it("catches RSS entry with empty name", () => {
    const config: SourcesConfig = {
      rss: [{ name: "", url: "https://example.com/rss", limit: 10 }],
      github_releases: { repos: [] },
      twitter: { accounts: [] },
    };
    const errors = validateStructure(config);
    expect(errors).toContainEqual(expect.stringContaining("empty name"));
  });

  it("catches RSS entry with invalid url", () => {
    const config: SourcesConfig = {
      rss: [{ name: "test", url: "ftp://bad", limit: 10 }],
      github_releases: { repos: [] },
      twitter: { accounts: [] },
    };
    const errors = validateStructure(config);
    expect(errors).toContainEqual(expect.stringContaining("url"));
  });

  it("catches RSS entry with non-positive limit", () => {
    const config: SourcesConfig = {
      rss: [{ name: "test", url: "https://example.com", limit: 0 }],
      github_releases: { repos: [] },
      twitter: { accounts: [] },
    };
    const errors = validateStructure(config);
    expect(errors).toContainEqual(expect.stringContaining("limit"));
  });

  it("catches duplicate RSS names", () => {
    const config: SourcesConfig = {
      rss: [
        { name: "dup", url: "https://a.com", limit: 5 },
        { name: "dup", url: "https://b.com", limit: 5 },
      ],
      github_releases: { repos: [] },
      twitter: { accounts: [] },
    };
    const errors = validateStructure(config);
    expect(errors).toContainEqual(expect.stringContaining("duplicate"));
  });

  it("catches invalid github repo format", () => {
    const config: SourcesConfig = {
      rss: [],
      github_releases: { repos: ["just-a-name"] },
      twitter: { accounts: [] },
    };
    const errors = validateStructure(config);
    expect(errors).toContainEqual(expect.stringContaining("owner/repo"));
  });

  it("catches duplicate github repos", () => {
    const config: SourcesConfig = {
      rss: [],
      github_releases: { repos: ["a/b", "a/b"] },
      twitter: { accounts: [] },
    };
    const errors = validateStructure(config);
    expect(errors).toContainEqual(expect.stringContaining("duplicate"));
  });

  it("catches twitter account with @ prefix", () => {
    const config: SourcesConfig = {
      rss: [],
      github_releases: { repos: [] },
      twitter: { accounts: ["@bad"] },
    };
    const errors = validateStructure(config);
    expect(errors).toContainEqual(expect.stringContaining("@"));
  });

  it("catches duplicate twitter accounts", () => {
    const config: SourcesConfig = {
      rss: [],
      github_releases: { repos: [] },
      twitter: { accounts: ["same", "same"] },
    };
    const errors = validateStructure(config);
    expect(errors).toContainEqual(expect.stringContaining("duplicate"));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/validate-sources.test.ts`
Expected: FAIL — module `validate-sources.js` does not exist

- [ ] **Step 3: Implement `validateStructure`**

```ts
// src/tools/validate-sources.ts
import type { SourcesConfig } from "../types.js";

export function validateStructure(config: SourcesConfig): string[] {
  const errors: string[] = [];

  // RSS
  const rssNames = new Set<string>();
  for (const [i, src] of config.rss.entries()) {
    if (!src.name || src.name.trim() === "") {
      errors.push(`rss[${i}]: empty name`);
    } else if (rssNames.has(src.name)) {
      errors.push(`rss[${i}]: duplicate name "${src.name}"`);
    } else {
      rssNames.add(src.name);
    }

    if (!src.url?.startsWith("http://") && !src.url?.startsWith("https://")) {
      errors.push(`rss[${i}] "${src.name}": url must start with http:// or https://`);
    }

    if (!Number.isInteger(src.limit) || src.limit < 1) {
      errors.push(`rss[${i}] "${src.name}": limit must be a positive integer`);
    }
  }

  // GitHub
  const repoSet = new Set<string>();
  for (const repo of config.github_releases.repos) {
    if (!/^[^/]+\/[^/]+$/.test(repo)) {
      errors.push(`github: "${repo}" must match owner/repo format`);
    }
    if (repoSet.has(repo)) {
      errors.push(`github: duplicate repo "${repo}"`);
    } else {
      repoSet.add(repo);
    }
  }

  // Twitter
  const accountSet = new Set<string>();
  for (const account of config.twitter.accounts) {
    if (!account || account.trim() === "") {
      errors.push(`twitter: empty account name`);
    } else if (account.startsWith("@")) {
      errors.push(`twitter: "${account}" should not start with @`);
    }
    if (accountSet.has(account)) {
      errors.push(`twitter: duplicate account "${account}"`);
    } else {
      accountSet.add(account);
    }
  }

  return errors;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/validate-sources.test.ts`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/validate-sources.ts tests/validate-sources.test.ts
git commit -m "feat: add validateStructure for sources config"
```

---

### Task 2: URL Reachability Checks

**Files:**
- Modify: `src/tools/validate-sources.ts`
- Modify: `tests/validate-sources.test.ts`

- [ ] **Step 1: Write failing tests for `checkReachability`**

Merge into `tests/validate-sources.test.ts`. The file already imports `vi` and `beforeEach` from Task 1. Add `checkReachability` to the existing import from `validate-sources.js`. Place the `mockFetch` and `vi.stubGlobal` lines between the imports and the first `describe` block:

```ts
// Add to existing imports at top of file:
import { validateStructure, checkReachability } from "../src/tools/validate-sources.js";

// Add after imports, before first describe block:
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Add this new describe block after the validateStructure describe:
describe("checkReachability", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("reports OK for 200 responses", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const config: SourcesConfig = {
      rss: [{ name: "test", url: "https://example.com/rss", limit: 10 }],
      github_releases: { repos: [] },
      twitter: { accounts: [] },
    };
    const results = await checkReachability(config);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("ok");
  });

  it("reports failed for non-ok responses", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    const config: SourcesConfig = {
      rss: [{ name: "broken", url: "https://example.com/404", limit: 10 }],
      github_releases: { repos: [] },
      twitter: { accounts: [] },
    };
    const results = await checkReachability(config);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("failed");
    expect(results[0].detail).toContain("404");
  });

  it("reports failed for network errors", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const config: SourcesConfig = {
      rss: [{ name: "down", url: "https://down.example.com", limit: 10 }],
      github_releases: { repos: [] },
      twitter: { accounts: [] },
    };
    const results = await checkReachability(config);
    expect(results[0].status).toBe("failed");
    expect(results[0].detail).toContain("ECONNREFUSED");
  });

  it("checks github repos at github.com URL", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const config: SourcesConfig = {
      rss: [],
      github_releases: { repos: ["owner/repo"] },
      twitter: { accounts: [] },
    };
    await checkReachability(config);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://github.com/owner/repo",
      expect.objectContaining({ method: "HEAD" })
    );
    // HEAD succeeded, so no GET fallback
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("marks twitter as unable-to-verify on non-404", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });
    const config: SourcesConfig = {
      rss: [],
      github_releases: { repos: [] },
      twitter: { accounts: ["someuser"] },
    };
    const results = await checkReachability(config);
    expect(results[0].status).toBe("unverifiable");
  });

  it("marks twitter as failed on 404", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    const config: SourcesConfig = {
      rss: [],
      github_releases: { repos: [] },
      twitter: { accounts: ["gone"] },
    };
    const results = await checkReachability(config);
    expect(results[0].status).toBe("failed");
    expect(results[0].detail).toContain("404");
  });

  it("falls back to GET when HEAD fails", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 405 })  // HEAD rejected
      .mockResolvedValueOnce({ ok: true, status: 200 });   // GET succeeds
    const config: SourcesConfig = {
      rss: [{ name: "head-reject", url: "https://example.com/feed", limit: 10 }],
      github_releases: { repos: [] },
      twitter: { accounts: [] },
    };
    const results = await checkReachability(config);
    expect(results[0].status).toBe("ok");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("marks twitter as unverifiable on network error", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const config: SourcesConfig = {
      rss: [],
      github_releases: { repos: [] },
      twitter: { accounts: ["unreachable"] },
    };
    const results = await checkReachability(config);
    expect(results[0].status).toBe("unverifiable");
  });

  it("checks all sources in parallel", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const config: SourcesConfig = {
      rss: [
        { name: "a", url: "https://a.com", limit: 5 },
        { name: "b", url: "https://b.com", limit: 5 },
      ],
      github_releases: { repos: ["o/r"] },
      twitter: { accounts: ["u"] },
    };
    const results = await checkReachability(config);
    expect(results).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/validate-sources.test.ts`
Expected: FAIL — `checkReachability` is not exported

- [ ] **Step 3: Implement `checkReachability`**

Add to `src/tools/validate-sources.ts`:

```ts
export interface ReachabilityResult {
  type: "rss" | "github" | "twitter";
  name: string;
  url: string;
  status: "ok" | "failed" | "unverifiable";
  detail?: string;
}

export async function checkReachability(
  config: SourcesConfig
): Promise<ReachabilityResult[]> {
  const checks: Promise<ReachabilityResult>[] = [];

  for (const src of config.rss) {
    checks.push(checkUrl("rss", src.name, src.url));
  }

  for (const repo of config.github_releases.repos) {
    checks.push(checkUrl("github", repo, `https://github.com/${repo}`));
  }

  for (const account of config.twitter.accounts) {
    checks.push(checkTwitter(account));
  }

  return Promise.all(checks);
}

async function checkUrl(
  type: "rss" | "github",
  name: string,
  url: string
): Promise<ReachabilityResult> {
  try {
    let res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Retry with GET — some servers reject HEAD
      res = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(10_000),
      });
    }
    if (res.ok) {
      return { type, name, url, status: "ok" };
    }
    return { type, name, url, status: "failed", detail: `HTTP ${res.status}` };
  } catch (err) {
    return {
      type,
      name,
      url,
      status: "failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkTwitter(account: string): Promise<ReachabilityResult> {
  const url = `https://x.com/${account}`;
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      return { type: "twitter", name: account, url, status: "ok" };
    }
    if (res.status === 404) {
      return {
        type: "twitter",
        name: account,
        url,
        status: "failed",
        detail: "HTTP 404",
      };
    }
    return { type: "twitter", name: account, url, status: "unverifiable" };
  } catch {
    return { type: "twitter", name: account, url, status: "unverifiable" };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/validate-sources.test.ts`
Expected: All 18 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/validate-sources.ts tests/validate-sources.test.ts
git commit -m "feat: add checkReachability for URL validation"
```

---

### Task 3: Register MCP Tool

**Files:**
- Modify: `src/mcp-server.ts:1-10` (imports)
- Modify: `src/mcp-server.ts:100-111` (add tool before `main()`)

- [ ] **Step 1: Add import to `mcp-server.ts`**

Add after the `fetchTwitter` import (line 9):

```ts
import {
  validateStructure,
  checkReachability,
} from "./tools/validate-sources.js";
```

- [ ] **Step 2: Register `validate_sources` tool**

Add before the `async function main()` block (before line 102):

```ts
server.tool(
  "validate_sources",
  "Validate sources.yml structure and check that all source URLs are reachable",
  {},
  async () => {
    const config = loadSourcesConfig(join(CONFIG_DIR, "sources.yml"));
    log("validation", "Starting sources validation");

    const structureErrors = validateStructure(config);
    const reachability = await checkReachability(config);

    const passed = reachability.filter((r) => r.status === "ok").length;
    const failed = reachability.filter((r) => r.status === "failed").length;
    const unverifiable = reachability.filter(
      (r) => r.status === "unverifiable"
    ).length;

    log(
      "validation",
      `Sources validation: ${passed} passed, ${failed} failed, ${unverifiable} unable to verify`
    );

    for (const r of reachability) {
      if (r.status === "failed") {
        log("validation", `✗ ${r.type}: ${r.name} — ${r.detail}`);
      } else if (r.status === "unverifiable") {
        log("validation", `⚠ ${r.type}: ${r.name} — unable to verify`);
      }
    }

    if (structureErrors.length > 0) {
      log(
        "validation",
        `Structure errors: ${structureErrors.join("; ")}`
      );
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            structure: {
              valid: structureErrors.length === 0,
              errors: structureErrors,
            },
            reachability: reachability.map((r) => ({
              type: r.type,
              name: r.name,
              status: r.status,
              detail: r.detail,
            })),
            summary: { passed, failed, unverifiable },
          }),
        },
      ],
    };
  }
);
```

- [ ] **Step 3: Verify build passes**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/mcp-server.ts
git commit -m "feat: register validate_sources MCP tool"
```

---

### Task 4: Update Skill to Use MCP Tool

**Files:**
- Modify: `.claude/skills/validate-sources/SKILL.md`

- [ ] **Step 1: Rewrite the skill to call the MCP tool**

Replace the skill content with a simplified version that calls the MCP tool and formats the output. Keep the frontmatter but remove `Agent` and `WebFetch` from `allowed-tools` since they're no longer needed:

```markdown
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
\`\`\`
## Sources Validation Report

### Structure: ✗ Errors found
- <error 1>
- <error 2>
\`\`\`

### URL check results:
\`\`\`
### URL Checks (N sources)
✓ rss: name — OK
✗ rss: name — HTTP 404
⚠ twitter: name — unable to verify

### Summary
X passed, Y failed, Z unable to verify
\`\`\`

If everything passes, keep it short: "All N sources valid, all URLs reachable."
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/validate-sources/SKILL.md
git commit -m "refactor: simplify validate-sources skill to use MCP tool"
```

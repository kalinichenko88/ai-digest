# 0001 Check the shape of sources.yml at load, by hand

- Status: accepted
- Date: 2026-10-28

## Context

`loadSourcesConfig` cast the parsed YAML to `SourcesConfig` and checked
nothing. A `sources.yml` with no `rss` key, or no `github_releases.repos`,
made every tool fail with `TypeError: Cannot read properties of undefined`.
`validate_sources` failed the same way, before it could report the problem
(#17). The fields of each entry were checked by `validateStructure`, and only
when `validate_sources` ran.

## Options considered

- A zod schema for `sources.yml` in `src/config.ts`, parsed at load: amends
  I-1, and a field check in the schema stops every tool for one bad entry.
- A hand check of the shape in `src/config.ts` at load; the fields stay in
  `validateStructure`.
- Defaults for a missing section, as `delivery.yml` has: a typo such as
  `rs:` then gives a digest with no RSS items, and no error.

## Decision

We will check the shape of `sources.yml` by hand in `loadSourcesConfig`:
the document is a mapping, `rss` is a list of mappings, and
`github_releases.repos` is a list. A wrong shape throws one error that names
each wrong part. `validate_sources` returns that error as a structure error.
The fields of each entry (name, url, limit, the `owner/repo` format,
duplicates) stay in `validateStructure`.

## Consequences

Good: every tool fails with one clear message, and `validate_sources`
reports a file that does not load. zod stays at the edge (I-1). A bad field
fails one source, not the whole call.

Bad: two functions check one file. A new section of `sources.yml` adds its
shape to `shapeErrors` in `src/config.ts` and its fields to
`validateStructure`.

## Invariants

None.

## Confirmation

The tests of `loadSourcesConfig` in `tests/config.test.ts` and of
`validateSources` in `tests/validate-sources.test.ts`.

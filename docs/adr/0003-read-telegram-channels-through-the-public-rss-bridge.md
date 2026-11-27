# 0003 Read a Telegram channel through the public RSS-Bridge

- Status: accepted
- Date: 2026-11-27

## Context

The person who reads the digest follows tech news in public Telegram
channels, and many of them have no RSS feed. `sources.yml` took only RSS
feeds and GitHub repos (#4). The person decided: no scraper of
`t.me/s/<channel>` for now. A test of about 14 daily runs reads each channel
through the public RSS-Bridge instance and its `TelegramBridge`. The config
holds only the slug of the channel, not the URL of the bridge.

Measured on 2026-11-27: the bridge answers HTTP 200 with 20 Atom entries for
a slug and for `@slug`. It answers HTTP 500 for a pasted
`https://t.me/<channel>`, for `https://t.me/s/<channel>` and for a channel
that does not exist. The project's `rss-parser` reads the feed as it is:
each item has a title (the first words of the post), a link
`https://t.me/<channel>/<id>`, a date, the text and the author.

The terms of the public instance: "Non-commercial usage only. Excessive usage
not allowed (max 10k req/24h)." The Content Licensing terms of Telegram
prohibit the use of its data in the deployment of artificial intelligence;
the digest sends the text of a post to an LLM for its summary. That question
applies to every way of reading a channel and is open (#4).

ADR 0001 rejected defaults for a missing section of `sources.yml`. This
decision fills fields of one entry that names a channel, and adds no section.

## Options considered

- A plain `rss` entry with the URL of the bridge: no code, but the person
  wants only the slug in the config.
- Expand a `telegram` entry in `loadSourcesConfig`: one helper and one
  constant in `src/config.ts`, and every reader of the loaded config gets an
  ordinary `RssSource`.
- Build the URL in the tools: `fetch-rss.ts` and `validate-sources.ts` both
  need it and a tool file imports no other, so a helper in `src/utils/`, its
  own test file (past I-8 in `tests/`), and a split of `validate-sources.ts`
  (I-7).
- A `fetch_telegram` tool: a new tool file and its test file (I-8), its
  registration in `src/mcp-server.ts`, which is on the I-7 debt list, and a
  new call in the `ai-digest` skill.
- A separate `telegram:` list of slugs: a new section by ADR 0001, and its
  errors would cite an `rss[N]` index that the file does not have.
- `url: <channel>`: an RSS URL typed without `https://` would become a
  Telegram channel, with no error.

## Decision

We will let an `rss` entry name a public channel with `telegram: <channel>`.
After the shape check, `loadSourcesConfig` sets the `url` of that entry to the
feed of the public RSS-Bridge instance for the channel, and fills `name` with
the slug and `limit` with 20 when the entry has none. `telegram` sets `url`
also when the entry has one. An entry whose `telegram` is not a string stays
as it is, and `validateStructure` reports its missing fields. The expansion
changes the entries in place, keeps their order and throws nothing. The
address of the instance is one constant in `src/config.ts`.

## Consequences

Good: no parser, no new dependency, no new tool and no new file of code.
`fetchRss`, `validateStructure`, `checkReachability` and `check_duplicates`
read a channel as any feed. A later collector of our own, on MTProto, can
read the same `telegram:` entries.

Bad:

- A host of a third party is in the code. The instance sees the list of
  channels and the IP address of the install. A self-hosted bridge
  (`rssbridge/rss-bridge`) needs a setting for its address.
- Knowledge of the Sources area sits in `src/config.ts` of the Server area,
  because `src/config.ts` is the leaf that every tool reads.
- The bridge gives only the 20 newest posts of a channel, and its cache can
  give a new post late.
- Each run makes 2 requests a channel, one from `validate_sources` and one
  from `fetch_all_rss`, against the limit of 10k a day.
- Three readers take the raw file: `scripts/apply-update.sh`, Step 1 of the
  `ai-digest` skill and `/add-source`. `apply-update.sh` merges `rss` entries
  by `name`, so a shipped `rss` entry must keep its `name`.
- An installed `sources.yml` with `telegram:` entries needs this expansion:
  with it removed, or on a release before it, each such entry gives three
  structure errors and stops the run.
- All 20 posts of a channel are often older than the dedup window, so an old
  post can come back in a later digest (#61).

## Invariants

None.

## Confirmation

The test "fills the url, name and limit of a telegram entry" of
`loadSourcesConfig` in `tests/config.test.ts`.

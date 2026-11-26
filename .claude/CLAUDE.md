# Working on ai-digest

The root `CLAUDE.md` is the digest reader's context, not instructions for this
repo: the `ai-digest` skill reads it, and the release archive ships it as a
template. Instructions for work on the code go here; this file does not ship.

See [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md). Before a spec, a plan or
the first edit of a new feature, read `docs/ARCHITECTURE.md`. At the start of a
new feature, and for a decision, load `craft:architecture`.

`/release <version>` makes a new release; its steps are in
`.claude/skills/release/SKILL.md`. The archive does not ship this skill, so the
root `CLAUDE.md` does not list it.

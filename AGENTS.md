# Agent Instructions

## Architecture Decision Records

This repo uses `adr-tools` and stores ADRs in `doc/adr`.

Agents must automatically manage ADRs when making or implementing architecture-level decisions:

- Check existing ADRs with `adr list` before changing architecture, integrations, tool surfaces, external APIs, security boundaries, or long-lived conventions.
- Add a new ADR with `adr new <title>` when introducing a significant decision.
- Update or supersede existing ADRs when a new decision changes a previous one.
- Keep ADRs concise and specific: context, decision, consequences.
- Do not create ADRs for tiny mechanical edits that do not affect architecture or project policy.

Recent relevant ADRs:

- `doc/adr/0002-decide-when-to-spawn-subagents.md`
- `doc/adr/0003-add-read-only-github-tools-for-agent-research.md`

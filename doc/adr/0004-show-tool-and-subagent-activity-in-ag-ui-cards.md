# 4. Show Tool and Subagent Activity in AG-UI Cards

Date: 2026-05-01

## Status

Accepted

## Context

The chat app now has server-side tools for GitHub research and a `route_subagents` decision tool that implements [ADR 0002](0002-decide-when-to-spawn-subagents.md). Users need to see what the agent did: which tools ran, what GitHub evidence was inspected, and what subagent-spawning decision was made.

Earlier AG-UI/status plumbing was removed because generic lifecycle status messages duplicated visible chat/tool output. The new need is different: expose structured, useful activity summaries directly where tool calls appear, without reintroducing a separate status event channel.

## Decision

Render AG-UI-style inline activity cards for selected tool outputs in the chat transcript.

Add a pure summarization layer in `src/lib/ag-ui-tool-activity.ts` that converts tool input/output pairs into compact rows and links. Use it from `src/components/Chat.tsx` inside the existing tool-call rendering path.

Specialized summaries:

- `route_subagents`: show chosen action, prompt class, complexity, domain breadth, subtask independence, verification burden, cost/privacy risk, rationale, and validation gate.
- `github_search`: show search type, query, repository scope, result count, and top GitHub result links.
- `github_get`: show requested resource, repository, issue/PR number or ref/run id, and item count for list-like CI/review/comment responses.

Keep existing custom widgets for weather, stock, and Brave search. Fall back to JSON rendering for unknown tools.

## Consequences

Benefits:

- Makes subagent routing decisions visible and auditable in the conversation.
- Makes GitHub research evidence easier to inspect without opening raw JSON.
- Reuses existing tool-call message parts instead of adding a new streaming/status protocol.
- Keeps summarization testable as pure functions.

Costs and risks:

- Adds UI code and client bundle size.
- The cards are summaries, not complete raw payloads.
- Real worker/subagent execution is still future work; currently the UI shows routing decisions, not spawned worker timelines.

Mitigations:

- Keep raw fallback JSON for unknown tools.
- Keep GitHub links clickable for drill-down.
- Cover summary behavior in `tests/ag-ui-tool-activity.test.ts`.

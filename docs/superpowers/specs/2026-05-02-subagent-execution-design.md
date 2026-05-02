# Subagent Execution Design

Date: 2026-05-02

## Context

`tanstack-tutorial` currently implements subagent routing, not subagent execution. `src/lib/subagent-router.ts` exposes the `route_subagents` TanStack AI tool and returns a deterministic routing note, but `spawn_one_specialist` and `spawn_multiple_specialists` are only decisions. No worker agents are run.

The goal is to finish the app-native implementation using TanStack AI through the existing OpenRouter model configuration. Pi is only the coding agent used to work on this repository and is not part of the runtime design.

## Goals

- Keep `route_subagents` as the cheap deterministic decision gate.
- Add real app-native subagent execution through TanStack AI/OpenRouter.
- Allow subagents to use approved read-only server tools.
- Keep workers bounded, observable, and integrated by the main chat model.
- Preserve the ADR 0002 policy: default to no spawning, spawn only with explicit benefit and validation path.

## Non-goals

- No external Pi subprocesses.
- No recursive subagents.
- No code-editing or state-mutating workers.
- No full workflow engine or persistent replay store in this increment.
- No weather, stock, search-query, `route_subagents`, or `run_subagents` access inside workers.

## Architecture

Add a separate orchestration layer instead of merging execution into the router:

- `src/lib/subagent-router.ts`
  - Continues to decide whether delegation is appropriate.
  - Remains deterministic, cheap, and directly testable.

- `src/lib/subagent-orchestrator.ts`
  - Validates worker briefs.
  - Runs one or more bounded worker model calls through TanStack AI/OpenRouter.
  - Provides only approved read-only tools to workers.
  - Returns structured worker results for the main model to integrate.

- `src/lib/tools.ts`
  - Registers a new `run_subagents` server tool alongside `route_subagents`.

- `src/lib/ag-ui-tool-activity.ts`
  - Adds a compact activity summary for `run_subagents` results.

- `src/components/Chat.tsx`
  - Reuses the existing tool-card path to show subagent execution summaries.

The main chat model remains the integrator. Workers produce findings; they do not decide the final answer.

## Data Flow

1. User asks a task.
2. Main chat model calls `route_subagents({ prompt })` when delegation might be relevant.
3. `route_subagents` returns a `SubagentRoutingNote`.
4. If `chosenAction` is `spawn_one_specialist` or `spawn_multiple_specialists`, the main model may call `run_subagents` with the routing note and bounded worker briefs.
5. `run_subagents` validates the request.
6. The orchestrator runs workers through TanStack AI/OpenRouter.
7. Workers may call approved read-only tools.
8. `run_subagents` returns structured worker outputs, errors, and an integration hint.
9. The main model integrates the final user-facing answer.

## Tool Contract

Add a `run_subagents` server tool with input similar to:

```ts
type SubagentWorkerBrief = {
  name: string
  objective: string
  scope: string
  nonGoals: string
  allowedTools: Array<'github_search' | 'github_get' | 'brave_web_search'>
  expectedOutput: string
}

type RunSubagentsInput = {
  originalPrompt: string
  routingNote: SubagentRoutingNote
  workers: SubagentWorkerBrief[]
}
```

Return output similar to:

```ts
type SubagentWorkerResult = {
  name: string
  status: 'completed' | 'failed'
  output: string
  error?: string
}

type RunSubagentsResult = {
  action: SubagentAction
  workers: SubagentWorkerResult[]
  integrationHint: string
}
```

## Validation Rules

`run_subagents` must reject invalid requests before model calls:

- `spawn_one_specialist` requires exactly one worker.
- `spawn_multiple_specialists` requires two to four workers.
- Other routing actions cannot execute workers.
- Each worker must include `name`, `objective`, `scope`, `nonGoals`, and `expectedOutput`.
- `allowedTools` must be a subset of `github_search`, `github_get`, and `brave_web_search`.
- Worker count and tool access must be bounded to control cost and coordination risk.

## Worker Behavior

Each worker receives a bounded system prompt:

```text
You are a bounded specialist subagent.
Complete only the assigned brief.
Use only allowed tools.
Do not implement code or mutate state.
Return concise findings with evidence and uncertainty.
```

Workers should use the selected parent chat model when available. If no model is passed through the tool input or execution context, the orchestrator should use the existing default chat model configuration.

Workers may use:

- `brave_web_search`
- `github_search`
- `github_get`

Workers must not use:

- `route_subagents`
- `run_subagents`
- `request_search_query`
- weather or stock demo tools
- any future mutating tools unless a later ADR explicitly allows them

## Error Handling

- A failed worker returns `{ status: 'failed', error }`.
- Other workers should continue when possible.
- `run_subagents` should return partial results instead of failing the whole tool call for isolated worker failures.
- Validation failures should fail fast with a clear error.
- Timeouts and max-turn limits should be enforced to prevent runaway work.

## UI

Extend `summarizeToolActivity` for `run_subagents`:

- action
- worker count
- completed count
- failed count
- worker name/status rows
- integration hint

The raw JSON fallback remains available for details not shown in the compact card.

## Tests

Add coverage for:

- `run_subagents` rejects non-spawn routing actions.
- one-specialist routing requires exactly one worker.
- multi-specialist routing requires two to four workers.
- invalid or disallowed tools are rejected.
- empty worker brief fields are rejected.
- activity summary renders subagent execution output.
- partial worker failure returns a structured failed worker result when using an injectable/mock worker runner.

Existing `subagent-router` tests should remain unchanged.

## ADR Impact

This implements the future worker-spawning layer anticipated by ADR 0002. Because it changes the architecture from routing-only to routing plus execution, add a new ADR or update/supersede ADR 0002 during implementation.

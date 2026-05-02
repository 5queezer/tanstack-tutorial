# Design: `@tanstack/ai-subagents`

## Goal

Extract the tutorial app's subagent routing and execution layer into a reusable TanStack AI extension package, publishable as `@tanstack/ai-subagents`.

The first version is TanStack-AI-only for simplicity, but internals should remain clean enough that a future runtime-agnostic core package could be split out.

## Current Problem

The app already has useful subagent pieces:

- deterministic routing in `src/lib/subagent-router.ts`
- bounded worker orchestration in `src/lib/subagent-orchestrator.ts`
- `route_subagents` and `run_subagents` server tools in `src/lib/tools.ts`
- tests for routing, validation, partial failure, and tool registration

Those pieces are not reusable yet because they import app concerns directly: Langfuse tracing, OpenRouter model lookup, Brave/GitHub tools, and local tool registration.

## Architecture

Create a package-style boundary with these modules:

```txt
packages/ai-subagents/
  src/
    index.ts
    types.ts
    schemas.ts
    router.ts
    orchestrator.ts
    tanstack-tools.ts
```

Initial extraction may happen inside the repo before npm publishing, but the code should use package-like imports and exports from the start.

### Module Responsibilities

- `types.ts`: public TypeScript types such as `SubagentAction`, `SubagentRoutingNote`, `SubagentWorkerBrief`, `RunSubagentsInput`, `RunSubagentsResult`, and `SubagentWorkerRunner`.
- `schemas.ts`: Zod schemas for router and run-subagents tool inputs.
- `router.ts`: pure deterministic `routeSubagentRequest(prompt)` policy.
- `orchestrator.ts`: pure validation, bounded worker fanout, partial failure handling, and default worker execution logic using injected dependencies.
- `tanstack-tools.ts`: TanStack AI `toolDefinition(...)` factories for `route_subagents` and `run_subagents`.
- `index.ts`: stable public exports.

## Public API

The package should export:

```ts
export {
  routeSubagentRequest,
  runSubagents,
  validateRunSubagentsInput,
  createSubagentRouterTool,
  createRunSubagentsTool,
}

export type {
  SubagentAction,
  SubagentRoutingNote,
  SubagentWorkerBrief,
  RunSubagentsInput,
  RunSubagentsResult,
  SubagentWorkerRunner,
  SubagentToolRegistry,
}
```

Consumer usage:

```ts
import {
  createSubagentRouterTool,
  createRunSubagentsTool,
} from '@tanstack/ai-subagents'

const routeSubagents = createSubagentRouterTool()

const runSubagents = createRunSubagentsTool({
  chat,
  getAdapter: (model) => getChatModel(model),
  tools: {
    brave_web_search: braveWebSearch,
    github_search: githubSearch,
    github_get: githubGet,
  },
  trace: (name, args, fn) => traceToolCall(name, args, fn),
})

export const serverTools = [
  braveWebSearch,
  githubSearch,
  githubGet,
  routeSubagents,
  runSubagents,
]
```

## Dependency Injection

The package must not import app-specific integrations. Consumers provide:

- `chat`: TanStack AI chat function, or a compatible worker runner override.
- `getAdapter(model)`: model adapter lookup.
- `tools`: named registry of allowed worker tools.
- `trace`: optional wrapper for tracing tool execution.
- optional limits such as `maxWorkers`.
- optional system prompt override.

The default orchestration still enforces bounded fanout and read-only-style allowlists, but the allowed tool names come from the consumer's configured registry.

## Package Boundaries

The package owns:

- routing policy
- subagent input schemas
- worker brief validation
- worker fanout
- partial failure handling
- TanStack AI tool factory wrappers

The app owns:

- actual Brave/GitHub or other tool implementations
- model provider configuration
- tracing backend
- UI rendering and activity cards
- app-specific assistant system prompts

## Testing

Move or adapt current tests so they validate the package exports:

- router chooses expected actions for simple questions, research, risky implementation, parallel review, and unsafe requests.
- orchestrator rejects non-spawn actions.
- `spawn_one_specialist` requires exactly one worker.
- `spawn_multiple_specialists` requires two to four workers by default.
- disallowed tools are rejected.
- empty worker brief fields are rejected.
- completed worker results include integration hints.
- worker failures become partial failure results instead of failing the whole run.
- TanStack tool factories produce tools named `route_subagents` and `run_subagents`.

The tutorial app should keep an integration test asserting its `serverTools` include both subagent tools.

## Publishing Constraints

The npm package should be ESM-first and typed.

Recommended dependency policy:

```json
{
  "peerDependencies": {
    "@tanstack/ai": "^0.14.0",
    "zod": "^4.0.0"
  }
}
```

Do not depend on `@tanstack/ai-openrouter`, Langfuse, React, Brave-specific code, or GitHub-specific code.

## Migration Plan Summary

1. Introduce package-style files and exports.
2. Move pure router and type definitions.
3. Move schemas and `run_subagents` tool definition into the package boundary.
4. Refactor orchestrator to receive model/tool/tracing dependencies through options.
5. Update app `src/lib/tools.ts` to call package factories.
6. Update tests to import package exports.
7. Once stable, prepare npm metadata and publish as `@tanstack/ai-subagents`.

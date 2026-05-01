# Autoresearch: Apply Agentic Harness Engineering to TanStack Chat

## Objective
Apply ideas from arXiv:2604.25850, **Agentic Harness Engineering: Observability-Driven Automatic Evolution of Coding-Agent Harnesses**, to this TanStack chat tutorial without benchmark cheating or overfitting.

Relevant AHE principles from the paper abstract:
- **Component observability**: editable components should have explicit file-level representations, clear ownership, and revertible changes.
- **Experience observability**: raw trajectories/events should be distilled into compact, layered evidence that developers/agents can inspect.
- **Decision observability**: every edit should have an explicit prediction/hypothesis and be verified against outcomes.
- Ablations in the paper emphasize structural harness improvements (tools, middleware, memory) over prompt-only changes.

For this repo, treat the chat app as an agent harness. Optimize the app/harness so it is leaner and more maintainable while preserving correctness. Favor structural improvements in tools, middleware, state/memory, and observability. Avoid benchmark-specific hacks such as deleting real features just to shrink the bundle.

## Metrics
- **Primary**: `bundle_gzip_kb` (kb, lower is better) — total gzip size of built JS assets. This monitors client harness leanness and discourages heavy observability/UI additions.
- **Secondary**: `bundle_raw_kb`, `js_files`, `css_kb` — tradeoff monitors for build output shape.

## How to Run
`./autoresearch.sh` — builds the app and outputs `METRIC name=value` lines.

## Files in Scope
- `src/components/Chat.tsx` — main chat harness UI, state, event handling, tool rendering.
- `src/components/chat/*.tsx` and `src/components/chat/*.ts` — chat subcomponents, storage, follow-up heuristics, AG-UI helpers.
- `src/lib/*.ts` — model/tool/provider integration and server-side harness utilities.
- `src/routes/api/*.ts` — server routes for chat, models, follow-ups.
- `src/routes/*.tsx`, `src/client.tsx`, `src/server.ts`, `src/router.tsx`, `vite.config.ts` — app shell/build configuration when relevant.
- `autoresearch.sh`, `autoresearch.checks.sh`, `autoresearch.md`, `autoresearch.ideas.md` — benchmark and loop documentation.

## Off Limits
- Do not edit `node_modules`, lockfiles, generated `dist`, `.git`, or secrets/env files.
- Do not edit `src/routeTree.gen.ts` by hand unless route files changed and regeneration/build requires it; it is generated.
- Do not remove meaningful user-facing chat capabilities solely to improve bundle size.
- Do not fake metrics, skip the build, or tailor code to the benchmark script.

## Constraints
- TypeScript typecheck must pass.
- Production build must pass.
- No new runtime dependencies unless a strong AHE structural benefit outweighs bundle cost.
- Protect user intent: existing chat features (model selection, free-only filter, thinking toggle, tool widgets, follow-ups, interactive search prompt, OpenRouter error handling) should keep working.
- Each experiment must include an AHE-style hypothesis in `log_experiment` ASI.

## What's Been Tried
- Session setup: selected bundle gzip size as primary metric to keep AHE-inspired harness changes disciplined and transferable rather than benchmark-specific.

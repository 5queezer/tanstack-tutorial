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
- Kept: replaced `react-markdown`/`remark-gfm` with a focused safe renderer for common chat markdown (paragraphs, lists, code, links), yielding the largest early bundle win while retaining useful formatting.
- Kept: replaced Radix Select/Toggle/Tooltip/ScrollArea with native controls. This applied AHE component observability by removing heavy UI harness dependencies where browser primitives preserved behavior.
- Kept: split the client-visible `request_search_query` definition away from server tool implementations, then switched that client-visible schema to plain JSON Schema. This avoided leaking Zod/server tool code into the browser.
- Kept: removed identity/pass-through wrappers (`clientTools`, unused status local, server entry wrapper, redundant false debug flags, StrictMode/startTransition wrappers, single-page scrollRestoration) when typecheck/build verified equivalent behavior.
- Discarded: plain client tool object/factory splits. They slightly regressed because `@tanstack/ai-react`/`@tanstack/ai-client` already include the relevant runtime and extra module boundaries added overhead.
- Discarded: converting all server tool Zod schemas to JSON Schema. Verbose schemas outweighed any server-bundle benefit; keep Zod for server-only maintainability.
- Discarded: factoring a single-use tool label ternary into a helper. Single-use helper overhead was larger than inline minified code.
- Kept: progressively trusted internal server/client contracts for known tool outputs and custom events, removing fallback parsing/validation/unused payload fields where inputs are controlled by this app.
- Kept: inlined tiny single-use UI components after simplification (`TypingIndicator`, `AgUiStatusPanel`, `InteractiveSearchPrompt`, `FollowUps`). This reduced module/prop overhead but made `Chat.tsx` more monolithic; re-extract if complexity grows.
- Kept: removed decorative UI bytes (emojis, animated typing keyframes, follow-up arrow) while preserving text affordances.
- Correctness fix: direct `export default createStartHandler(...)` passed build/typecheck but broke Vite dev (`default.fetch is not a function`). Restored `{ fetch: createStartHandler(...) }` and added a backpressure check that imports `dist/server/server.js` and asserts `default.fetch` is a function.
- Kept: removed most AG-UI status plumbing after simplifying status UI; tool cards/results and typing state preserve practical observability. Follow-up custom events remain.
- Kept: simplified optional model follow-up request bookkeeping (no duplicate request key, no cancellation guard, trust internal response shape). This trades some stale/refetch protection for a leaner optional hint path.
- Kept: replaced the client-visible request-search `toolDefinition.client(...)` import with a minimal local `{ name, execute }` object, dropping one JS chunk. This relies on current TanStack AI client runtime only reading name/execute for client tools.
- Kept: progressively inlined localStorage helpers and removed generic boolean fallback handling; settings persistence is now direct and lean but less abstract.
- Kept: simplified optional follow-up and Brave result parsing by trusting internal/provider response shapes more. This improves bundle size but should be revisited if malformed provider responses appear in UI.
- Kept: removed optional OpenRouter attribution metadata (`appTitle`, `HTTP-Referer`, `X-Title`) from main/follow-up requests. Core API behavior remains, but restore if deployment policy or provider analytics require attribution.
- Kept: method shorthand for logger/route/client callback objects, direct Brave URL construction, and tool-widget trust of internal payload primitive types.
- Discarded: shared constants for repeated demo strings, direct `@tanstack/ai-client` import for `fetchServerSentEvents`, reduce-based message text extraction, and unary-plus number formatting; all regressed gzip or checks.

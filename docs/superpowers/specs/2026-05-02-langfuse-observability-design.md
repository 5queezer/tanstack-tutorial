# Langfuse Observability Design

## Goal

Add optional server-side Langfuse tracing to the research chat application so researchers can inspect model requests, tool usage, latency, failures, and—when explicitly enabled—full prompt/output data.

## Scope

This design covers Langfuse integration for the existing TanStack AI server routes and tools:

- `/api/chat` streaming chat requests.
- `/api/followups` OpenRouter follow-up generation requests.
- Server tools registered in `src/lib/tools.ts`, including weather, stock, Brave search, GitHub tools, subagent routing, and search-query requests.

This design does not add a Langfuse UI, dataset/evaluation workflows, prompt registry integration, or client-side/browser tracing.

## Architecture

Create a focused server-only tracing module at `src/lib/langfuse-tracing.ts`. The module owns Langfuse SDK initialization, environment parsing, capture-mode behavior, redaction helpers, no-op behavior when Langfuse is not configured, and safe asynchronous flushing.

Application code calls the tracing module from server routes and tool wrappers. The rest of the app should not import the Langfuse SDK directly. This keeps the data-boundary decision centralized and makes tests independent from Langfuse network calls.

Use the Node `langfuse` npm package as a normal runtime dependency. The implementation should use the current v3 package API verified during design (`langfuse@3.38.20` was inspected): constructor options include `publicKey`, `secretKey`, and `baseUrl`; environment fallback names include `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_BASEURL`; the client supports `flushAsync()`.

## Configuration

Langfuse is optional. If any required credential is missing, blank, or whitespace-only, tracing is disabled and the app behaves as it does today. Partial configuration must be fail-closed to disabled, not fail-open or throw during startup.

Environment variables:

- `LANGFUSE_PUBLIC_KEY`: Langfuse public key.
- `LANGFUSE_SECRET_KEY`: Langfuse secret key.
- `LANGFUSE_BASEURL`: Langfuse host URL, for example a self-hosted instance URL. This is required so research deployments do not accidentally default to Langfuse Cloud.
- `LANGFUSE_CAPTURE_MODE`: optional capture mode.
  - `metadata`: default. Record metadata and operational signals only.
  - `full`: record metadata plus prompts, completions, tool input, and tool output.
- `LANGFUSE_FLUSH_MODE`: optional flush mode.
  - `safe`: default. Call `flushAsync()` after terminal route/tool observations, catch failures, and do not block indefinitely.

`LANGFUSE_CAPTURE_MODE` parsing trims whitespace and lowercases the value. Missing, blank, or invalid values fall back to `metadata`.

## Capture Policy

### Metadata mode

Metadata mode records:

- Route name, such as `api.chat` or `api.followups`.
- Conversation id when present, as `sessionId`, assuming conversation ids are pseudonymous research session identifiers and not raw user ids or emails.
- Selected model id.
- Feature flags such as `showThinking` and whether reasoning was enabled.
- Tool names.
- Status: `success`, `error`, or `aborted`.
- Duration in milliseconds.
- Safe error summaries.

Metadata mode does not record:

- User messages.
- System prompts.
- Assistant output.
- Tool input payloads.
- Tool output payloads.
- Follow-up prompt content.
- Raw upstream response bodies, headers, metadata blobs, or stack traces.

Metadata mode intentionally uses binary payload redaction: it records that a tool ran, not its input query or output. This sacrifices some operational detail to keep the default safe for research prompts and private GitHub/search data. Researchers who need payload-level analysis must opt into `LANGFUSE_CAPTURE_MODE=full` on a self-hosted instance.

### Full mode

Full mode records everything from metadata mode and additionally records:

- Chat messages sent to the model.
- Assistant text accumulated from the stream.
- Follow-up prompt messages and completion content.
- Tool input and output payloads.

Full mode is opt-in because this is a research data boundary and may include private user prompts, GitHub data, search queries, and model outputs.

## Safe Error Summary Contract

The tracing layer must convert unknown errors into a small, non-sensitive object before sending them to Langfuse in metadata mode:

```ts
type SafeErrorSummary = {
  name: string
  message: string
  status?: number
}
```

Rules:

- `name` is `error.name` for `Error` instances, otherwise `UnknownError`.
- `message` is `error.message` for `Error` instances, otherwise `String(error)`.
- `message` is normalized to one line and truncated to 200 characters.
- `status` is copied only from a top-level numeric `status` or `code` field.
- Never include `body`, `body$`, `response`, `metadata`, `raw`, `headers`, `stack`, `cause`, nested `error` objects, request payloads, response payloads, or environment variables.
- Full mode may include richer error details only if they are already part of captured full inputs/outputs; it still must not include environment variables or authorization headers.

## Data Flow

### Chat route

`src/routes/api/chat.ts` creates a Langfuse trace near the start of a valid request. The trace includes route, conversation id, model, and capture-mode-safe metadata. The route records a generation observation around the TanStack AI `chat()` stream.

The implementation should piggy-back on the existing `withOpenRouterErrorMetadata()` stream wrapper rather than adding a second stream traversal. That wrapper already accumulates assistant text and observes `RUN_ERROR` and `RUN_FINISHED` chunks. Extend it to notify the tracing module of terminal states:

- `success`: a `RUN_FINISHED` chunk was observed. In full mode, record the accumulated assistant text.
- `error`: a `RUN_ERROR` chunk was observed or the async iterator threw. Record a safe error summary in metadata mode.
- `aborted`: the request signal aborts or the stream ends before `RUN_FINISHED` or `RUN_ERROR`. Record partial duration and status without assistant text in metadata mode; full mode may record the partial accumulated assistant text.

After a terminal state is recorded, call the tracing module's safe flush helper. The helper calls Langfuse `flushAsync()` with a bounded timeout, catches errors, and never changes the HTTP/SSE response behavior.

### Follow-ups route

`src/routes/api/followups.ts` creates a trace for follow-up generation only when an OpenRouter call is attempted. It records model, status, duration, and parsed follow-up count. In full mode it records the request messages and generated response content.

The existing route intentionally returns `{ followUps: [] }` for missing OpenRouter config, invalid model input, or fetch/parsing failures. Missing OpenRouter config and invalid model input remain untraced because no model call is attempted. Fetch, response, and parsing failures during an attempted OpenRouter call should be traced as `error` with a safe error summary, then the route should continue returning `{ followUps: [] }`.

After success or error is recorded, call the tracing module's safe flush helper with the same no-impact guarantees used by the chat route.

### Tools

`src/lib/tools.ts` wraps each server tool implementation with a tracing helper. The helper records tool name, status, duration, and safe error summaries. In full mode it also records tool input and output. GitHub tools and subagent routing remain server-side and are traced through the wrapper rather than importing Langfuse directly in each tool module.

Tool tracing should record parent trace linkage only when the surrounding route context can pass it safely. If route-to-tool parent linkage is not available from TanStack AI tool execution, tool traces may be independent traces tagged with the tool name. Do not add global mutable request state just to force parent linkage.

After each tool success or error observation, call safe flush. Tool flush failures must not change tool return values or thrown errors.

## Async Flush and Runtime Assumptions

This app runs server-side Node code through TanStack Start/Vite, not browser client code. Langfuse must not be imported from client components.

The tracing module exposes `flushLangfuseSafely(timeoutMs = 1500)`. It should:

1. Return immediately if tracing is disabled.
2. Race `client.flushAsync()` against a timeout.
3. Catch and suppress flush errors.
4. Avoid throwing on process shutdown, request abort, or network failure.

Route handlers call this helper after terminal observations. The helper is best-effort: losing telemetry is acceptable; delaying or breaking chat is not.

## Error Handling

Langfuse must never break chat behavior. Tracing failures are swallowed after optionally writing a server-side debug warning. Route and tool behavior remains unchanged if Langfuse is unavailable, partially configured, misconfigured, or temporarily failing.

The existing OpenRouter error formatting remains the user-facing error path. Langfuse records only safe error summaries in metadata mode.

## Testing Strategy

Use Node test files under `tests/`.

Tests should cover:

- Capture mode parsing: missing, blank, mixed-case `metadata`, mixed-case `full`, whitespace-padded values, and invalid values.
- Configuration parsing: all credentials present enables tracing; missing any of `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, or `LANGFUSE_BASEURL` disables tracing.
- Safe error summaries remove raw response bodies, metadata, headers, stack traces, nested errors, and authorization-like fields.
- Redaction behavior: metadata mode removes inputs and outputs; full mode preserves them.
- No-op behavior when Langfuse credentials are missing.
- Safe flush catches SDK/network failures and timeout paths.
- Tool tracing wrapper preserves return values and propagates original tool errors.
- Route-level integration with a fake tracing client confirms `/api/chat` and `/api/followups` call the tracing layer for success and error paths without network calls.

Tests should not make network calls to Langfuse.

## Architecture Decision Record

Add an ADR because Langfuse introduces a new external observability integration and data boundary. Follow this repo's ADR convention from `AGENTS.md`: run `adr new "Add Optional Langfuse Observability"` and keep the resulting numbered file under `doc/adr`, expected to be `doc/adr/0005-add-optional-langfuse-observability.md` unless `adr-tools` chooses a different number.

The ADR should record:

- Langfuse is optional and server-side only.
- Self-hosted Langfuse is the preferred research deployment.
- `LANGFUSE_BASEURL` is required to avoid accidental Langfuse Cloud defaulting.
- Metadata-only capture is the default.
- Full prompt/output capture requires explicit `LANGFUSE_CAPTURE_MODE=full`.
- Conversation ids are treated as pseudonymous research session ids, not direct user identifiers.
- Tool payload redaction is binary by design in metadata mode.
- Langfuse tracing and flush failures must not affect chat or tool execution.
- Sampling/rate limiting are intentionally deferred until event volume requires them.

## Acceptance Criteria

- The app builds and tests pass without Langfuse environment variables.
- The app builds and tests pass with partial Langfuse environment variables and tracing disabled.
- The `langfuse` package is added as a runtime dependency.
- Langfuse SDK code is isolated to `src/lib/langfuse-tracing.ts`.
- `/api/chat`, `/api/followups`, and server tools call the tracing layer.
- Metadata mode does not include raw prompts, model outputs, tool inputs, tool outputs, raw upstream bodies, headers, metadata blobs, or stack traces.
- Full mode includes raw prompts, model outputs, tool inputs, and tool outputs.
- Chat tracing distinguishes success, error, and aborted stream states.
- Follow-up OpenRouter failures are traced while preserving the existing `{ followUps: [] }` response.
- Langfuse `flushAsync()` is called through a bounded safe helper and never changes response behavior.
- A concise ADR under `doc/adr` documents the observability/data-boundary decision.

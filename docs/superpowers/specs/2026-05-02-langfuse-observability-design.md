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

Create a focused server-only tracing module at `src/lib/langfuse-tracing.ts`. The module owns Langfuse SDK initialization, environment parsing, capture-mode behavior, redaction helpers, and no-op behavior when Langfuse is not configured.

Application code calls the tracing module from server routes and tool wrappers. The rest of the app should not import the Langfuse SDK directly. This keeps the data-boundary decision centralized and makes tests independent from Langfuse network calls.

## Configuration

Langfuse is optional. If required credentials are missing, tracing is disabled and the app behaves as it does today.

Environment variables:

- `LANGFUSE_PUBLIC_KEY`: Langfuse public key.
- `LANGFUSE_SECRET_KEY`: Langfuse secret key.
- `LANGFUSE_BASEURL`: Langfuse host URL, for example a self-hosted instance URL.
- `LANGFUSE_CAPTURE_MODE`: optional capture mode.
  - `metadata`: default. Record metadata and operational signals only.
  - `full`: record metadata plus prompts, completions, tool input, and tool output.

Invalid `LANGFUSE_CAPTURE_MODE` values fall back to `metadata`.

## Capture Policy

### Metadata mode

Metadata mode records:

- Route name, such as `api.chat` or `api.followups`.
- Conversation id when present.
- Selected model id.
- Feature flags such as `showThinking` and whether reasoning was enabled.
- Tool names.
- Status: success or error.
- Duration.
- Error summaries.

Metadata mode does not record:

- User messages.
- System prompts.
- Assistant output.
- Tool input payloads.
- Tool output payloads.
- Follow-up prompt content.

### Full mode

Full mode records everything from metadata mode and additionally records:

- Chat messages sent to the model.
- Assistant text accumulated from the stream.
- Follow-up prompt messages and completion content.
- Tool input and output payloads.

Full mode is opt-in because this is a research data boundary and may include private user prompts, GitHub data, search queries, and model outputs.

## Data Flow

### Chat route

`src/routes/api/chat.ts` creates a Langfuse trace near the start of a valid request. The trace includes route, conversation id, model, and capture-mode-safe metadata. The route records a generation observation around the TanStack AI `chat()` stream. On normal stream completion, it marks the generation as successful and optionally records the accumulated assistant text in full mode. On stream or OpenRouter errors, it marks the generation as failed and records a safe error summary.

### Follow-ups route

`src/routes/api/followups.ts` creates a trace for follow-up generation only when an OpenRouter call is attempted. It records model, status, duration, and parsed follow-up count. In full mode it records the request messages and generated response content.

### Tools

`src/lib/tools.ts` wraps each server tool implementation with a tracing helper. The helper records tool name, status, duration, and error summaries. In full mode it also records tool input and output. GitHub tools and subagent routing remain server-side and are traced through the wrapper rather than importing Langfuse directly in each tool module.

## Error Handling

Langfuse must never break chat behavior. Tracing failures are swallowed after optionally writing a server-side debug warning. Route and tool behavior remains unchanged if Langfuse is unavailable, misconfigured, or temporarily failing.

The existing OpenRouter error formatting remains the user-facing error path. Langfuse records only safe error summaries in metadata mode.

## Testing Strategy

Use Node test files under `tests/`.

Tests should cover:

- Capture mode parsing: missing, `metadata`, `full`, and invalid values.
- Redaction behavior: metadata mode removes inputs and outputs; full mode preserves them.
- No-op behavior when Langfuse credentials are missing.
- Tool tracing wrapper preserves return values and propagates original tool errors.

Tests should not make network calls to Langfuse.

## Architecture Decision Record

Add an ADR because Langfuse introduces a new external observability integration and data boundary. The ADR should record:

- Langfuse is optional and server-side only.
- Self-hosted Langfuse is the preferred research deployment.
- Metadata-only capture is the default.
- Full prompt/output capture requires explicit `LANGFUSE_CAPTURE_MODE=full`.
- Langfuse tracing failures must not affect chat or tool execution.

## Acceptance Criteria

- The app builds and tests pass without Langfuse environment variables.
- Langfuse SDK code is isolated to `src/lib/langfuse-tracing.ts`.
- `/api/chat`, `/api/followups`, and server tools call the tracing layer.
- Metadata mode does not include raw prompts, model outputs, tool inputs, or tool outputs.
- Full mode includes raw prompts, model outputs, tool inputs, and tool outputs.
- A concise ADR documents the observability/data-boundary decision.

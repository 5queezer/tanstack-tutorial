# 5. Add Optional Langfuse Observability

Date: 2026-05-02

## Status

Accepted

## Context

This repository is a research chat application using TanStack AI, OpenRouter, and server-side tools. Research work needs auditable traces for model calls, tool usage, latency, failures, and later evaluation, but prompts, GitHub data, search queries, and model outputs can be sensitive.

Langfuse is MIT-licensed for its core/open-source portions, can be self-hosted, and supports the LLM observability use case. Adding it introduces an external observability and data boundary, so capture policy must be explicit.

## Decision

Add optional server-side Langfuse tracing behind environment configuration.

- Keep Langfuse SDK usage isolated to `src/lib/langfuse-tracing.ts`.
- Do not add client-side Langfuse code or expose Langfuse keys to the browser.
- Require `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_BASEURL`; missing or partial configuration disables tracing.
- Prefer self-hosted Langfuse for research deployments. Requiring `LANGFUSE_BASEURL` prevents accidental fallback to Langfuse Cloud.
- Default to `LANGFUSE_CAPTURE_MODE=metadata`, which records operational metadata but not raw prompts, model outputs, tool inputs, or tool outputs.
- Allow raw prompt/output/tool payload capture only with explicit `LANGFUSE_CAPTURE_MODE=full`.
- Treat conversation ids as pseudonymous research session ids, not direct user identifiers.
- Redact tool payloads completely in metadata mode rather than maintaining per-tool safe-field allowlists.
- Flush traces best-effort with bounded timeouts; Langfuse failures must not affect chat, follow-up, or tool behavior.
- Defer sampling and rate limiting until event volume requires them.

## Consequences

Researchers can inspect model and tool behavior in Langfuse when configured, while local development and deployments without Langfuse environment variables continue to work unchanged.

Metadata mode is safer by default but less informative: for example, a Brave search trace records that the search tool ran, not the query. Researchers who need payload-level analysis must opt into full mode and should use a self-hosted Langfuse instance with appropriate data-handling controls.

The app now has an additional runtime dependency and more route/tool instrumentation code. The centralized tracing module and tests mitigate this by keeping SDK details and redaction behavior in one place.

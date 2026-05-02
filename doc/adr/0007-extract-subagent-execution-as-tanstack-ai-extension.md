# 7. Extract Subagent Execution as TanStack AI Extension

Date: 2026-05-02

## Status

Accepted

## Context

The tutorial app now has deterministic subagent routing and bounded subagent execution. The implementation is useful beyond this app, but it is currently coupled to local tracing, OpenRouter model lookup, and concrete Brave/GitHub tool imports.

The intended end state is an npm package, `@tanstack/ai-subagents`, that can be reused by TanStack AI applications without forcing a specific model provider, tool set, tracing backend, or React UI.

## Decision

Extract the subagent router and orchestrator behind a TanStack-AI-only package boundary.

The package will export ready-made TanStack AI tool factories for `route_subagents` and `run_subagents`, plus pure routing, validation, orchestration, schemas, and TypeScript types. It will depend on `@tanstack/ai` and `zod`, but app-specific integrations will be injected by consumers.

Consumers will provide the model adapter lookup, allowed worker tools, optional tracing, and optional worker runner overrides. The app remains responsible for Brave, GitHub, OpenRouter, Langfuse, and UI rendering.

## Consequences

Subagent execution becomes reusable and publishable as `@tanstack/ai-subagents` while preserving the current app behavior.

The package boundary makes ownership clearer: the extension owns delegation policy and bounded fanout mechanics; each application owns provider and tool integration. This reduces coupling but requires a small configuration API and compatibility tests around TanStack AI tool definitions.

A future core package can be split out if other runtimes need the same orchestration logic, but the first extraction will stay TanStack-AI-only for simplicity.

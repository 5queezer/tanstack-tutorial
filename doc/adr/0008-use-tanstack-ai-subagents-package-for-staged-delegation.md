# 8. Use tanstack ai subagents package for staged delegation

Date: 2026-05-04

## Status

Accepted

## Context

ADR 0007 planned to extract local subagent routing and execution into a reusable TanStack AI extension. The local `tanstack-subagents` module has now been updated with deterministic routing, model-directed delegation, staged-DAG worker execution, profiles, verification policy, lifecycle hooks, and TanStack AI tool factories.

The tutorial should demonstrate the current package API instead of maintaining a parallel local router/orchestrator implementation.

## Decision

Depend on the local `@5queezer/tanstack-ai-subagents` package and replace local subagent routing/execution logic with compatibility re-exports and package tool factories.

Expose four tutorial modes through a UI select: deterministic routing only, deterministic route-then-run execution, deterministic staged-DAG execution with verification, and model-directed delegation. The server chooses the appropriate subagent tool surface and mode-specific system prompt per request.

Worker execution remains bounded to read-only Brave and GitHub tools, uses package `toolNames`/profiles rather than local `allowedTools`, caps fanout at four workers, and requires verification metadata before integration.

## Consequences

The tutorial now tracks the reusable package API and demonstrates the updated delegation patterns directly in the app.

The package owns routing, validation, topology selection, staged-DAG scheduling, and verification result shape. The app owns model selection, concrete tool registry, profiles, tracing, UI selection, and final answer integration.

Using a local file dependency is appropriate while the package is local/unpublished, but published tutorials should switch to the registry package once available.

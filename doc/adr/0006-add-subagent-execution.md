# 6. Add Subagent Execution

Date: 2026-05-02

## Status

Accepted

## Context

ADR 0002 established `route_subagents` as a deterministic decision gate for when to spawn subagents. The current implementation returns routing notes but does not execute workers. The chat harness now needs app-native worker execution using TanStack AI through OpenRouter, not external coding-agent processes.

## Decision

Add a separate `run_subagents` server tool backed by `src/lib/subagent-orchestrator.ts`.

`route_subagents` remains responsible for deciding whether delegation is justified. `run_subagents` is responsible for validating bounded worker briefs, running one or more read-only specialist workers, and returning structured worker results to the main chat model for integration.

Workers may use only approved read-only tools: `brave_web_search`, `github_search`, and `github_get`. Workers must not call `route_subagents`, `run_subagents`, client query tools, demo tools, or mutating tools.

## Consequences

The app now has a real worker-spawning layer while preserving the routing guardrails from ADR 0002. The main model remains the integrator, worker fanout is bounded, and subagent execution is visible through tool activity cards. This adds OpenRouter/tool-call cost and requires tests for validation, partial failure, and UI summaries.

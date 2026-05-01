# 2. Decide When to Spawn Subagents

Date: 2026-05-01

## Status

Accepted

## Context

This repository is experimenting with agentic harness design for a TanStack chat application. Some prompts are best handled by the current agent with ordinary tool use; others benefit from one or more subagents that can investigate, implement, review, or validate independently.

Spawning agents is not free. It adds latency, token cost, coordination overhead, merge risk, and possible inter-agent misalignment. Recent papers suggest treating delegation as an explicit routing decision rather than an automatic default:

- Agentic Harness Engineering (AHE, arXiv:2604.25850) argues for observable, falsifiable harness decisions: editable components, distilled experience, and hypotheses tied to outcomes.
- AgentGate (arXiv:2604.06696) frames dispatch as a constrained routing decision: direct response, single-agent invocation, multi-agent planning, or escalation, followed by structural grounding.
- Task-Aware Delegation Cues (arXiv:2603.11011) recommends task-conditioned capability and coordination-risk signals before delegation.
- ReDel (arXiv:2408.02248) shows recursive multi-agent delegation can be useful, but needs explicit delegation schemes, event logs, and replay/debugging.
- Single-agent or Multi-agent Systems? Why Not Both? (arXiv:2505.18286) finds multi-agent systems can add cost and complexity, and motivates hybrid cascades that default to cheaper single-agent execution when sufficient.
- Why Do Multi-Agent LLM Systems Fail? (arXiv:2503.13657) identifies failures from system design issues, inter-agent misalignment, and weak task verification.
- Agent-Oriented Planning (arXiv:2410.02189) emphasizes solvability, completeness, and non-redundancy for subtask allocation.
- Tool-to-Agent Retrieval (arXiv:2511.01854) highlights that routing should consider fine-grained capabilities, not only coarse agent labels.
- Dynamic Task Decomposition / Tool Integration (arXiv:2410.22457) supports task graphs, explicit delegation, and evaluation of node/tool/structure quality for complex multi-step tasks.

## Decision

Use a structured subagent-spawning router before dispatching any subagent. The router must choose one of these actions:

1. **Answer directly** when the prompt is simple, low-risk, and does not require external state changes.
2. **Use tools in the current agent** when the prompt needs local inspection, web research, shell commands, or code edits but remains coherent for one agent.
3. **Write a plan first** when implementation is multi-step, risky, or spans architectural boundaries.
4. **Spawn one specialist** when a bounded task needs focused expertise or independent review without parallel fanout.
5. **Spawn multiple independent specialists** only when subtasks are separable, can be validated independently, and parallel work is expected to reduce risk or latency.
6. **Reject, clarify, or escalate** when the prompt is unsafe, underspecified, privacy-sensitive, or has high coordination risk without clear benefit.

The default is **not** to spawn agents. The router may spawn agents only when it can name the expected benefit and the validation path.

For each spawning decision, record a short routing note containing:

- prompt class: question, research, implementation, review, debugging, optimization, or operations;
- complexity: low, medium, or high;
- domain breadth: single-domain or multi-domain;
- subtask independence: low, medium, or high;
- verification burden: low, medium, or high;
- cost/latency/privacy risk: low, medium, or high;
- chosen action;
- rationale;
- validation gate.

When spawning multiple agents, the orchestrator must provide each worker with a bounded brief:

- objective;
- files or sources in scope;
- non-goals;
- allowed tools/actions;
- expected artifact format;
- validation command or review criteria.

A single integrator remains responsible for merging outputs, resolving conflicts, and deciding whether the result satisfies the validation gate.

## Implementation

Implemented in `src/lib/subagent-router.ts` as a deterministic routing policy plus the server-side TanStack AI tool `route_subagents`.

The implementation returns the routing note fields required by this ADR: prompt class, complexity, domain breadth, subtask independence, verification burden, cost/latency/privacy risk, chosen action, rationale, and validation gate.

The tool is registered in `src/lib/tools.ts` and advertised to the chat model in `src/routes/api/chat.ts`. It does not spawn workers by itself; it is the required decision gate before an orchestrator or future worker-spawning layer dispatches subagents.

Behavior is covered by `tests/subagent-router.test.ts`.

## Consequences

Benefits:

- Reduces unnecessary multi-agent overhead for simple prompts.
- Makes delegation decisions inspectable and auditable.
- Encourages subtask solvability, completeness, and non-redundancy.
- Separates parallel investigation from final integration.
- Gives future harness optimizations a measurable decision surface.

Costs and risks:

- Adds a small planning step before delegation.
- Requires maintaining routing criteria and examples.
- Bad routing notes can create false confidence if not checked against outcomes.
- Some tasks may run slower when the router chooses to plan before acting.

Mitigations:

- Keep routing notes concise.
- Prefer single-agent execution unless the benefit of delegation is explicit.
- Use executable validation gates for implementation work.
- Log failed or wasteful delegation patterns so the router can be revised.

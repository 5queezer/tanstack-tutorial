export const subagentModeOptions = [
  { value: 'deterministic_routing', label: 'Routing only' },
  { value: 'route_then_run', label: 'Route + execute' },
  { value: 'staged_dag_verified', label: 'Staged DAG + verify' },
  { value: 'model_delegated', label: 'Model delegated' },
] as const

export type SubagentMode = typeof subagentModeOptions[number]['value']

export function normalizeSubagentMode(value: unknown): SubagentMode {
  return subagentModeOptions.some((option) => option.value === value)
    ? value as SubagentMode
    : 'deterministic_routing'
}

export function createSubagentSystemPrompt(mode: SubagentMode) {
  if (mode === 'deterministic_routing') {
    return 'Subagent demo mode: deterministic routing only. When delegation might be relevant, call route_subagents and explain the routing note. Do not execute workers.'
  }

  if (mode === 'route_then_run') {
    return 'Subagent demo mode: deterministic routing plus execution. First call route_subagents. If it returns a spawn action, call run_subagents with independent workers that have no dependsOn entries so execution is parallel. Use toolNames for allowed tools and integrate worker findings.'
  }

  if (mode === 'staged_dag_verified') {
    return 'Subagent demo mode: deterministic routing plus staged-DAG execution and verification. First call route_subagents. If it returns a spawn action, call run_subagents with workers that use dependsOn to form stages, include verificationCriteria for each worker, and integrate the verification result before answering.'
  }

  return 'Subagent demo mode: model-directed delegation. Use delegate_subagents when bounded specialist workers can help. Provide toolNames or profiles, dependsOn where staged work is useful, verificationCriteria, read_only authority, and concise expected outputs.'
}

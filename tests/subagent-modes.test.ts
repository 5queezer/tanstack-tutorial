import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createSubagentSystemPrompt, subagentModeOptions, normalizeSubagentMode } from '../src/lib/subagent-modes.ts'

test('exposes four tutorial subagent demonstration modes', () => {
  assert.deepEqual(subagentModeOptions.map((option) => option.value), [
    'deterministic_routing',
    'route_then_run',
    'staged_dag_verified',
    'model_delegated',
  ])
})

test('normalizes unknown subagent modes to deterministic routing', () => {
  assert.equal(normalizeSubagentMode('surprise'), 'deterministic_routing')
  assert.equal(normalizeSubagentMode('staged_dag_verified'), 'staged_dag_verified')
})

test('system prompts explain the selected orchestration mode', () => {
  assert.match(createSubagentSystemPrompt('deterministic_routing'), /call route_subagents/i)
  assert.doesNotMatch(createSubagentSystemPrompt('deterministic_routing'), /run_subagents/i)
  assert.match(createSubagentSystemPrompt('route_then_run'), /independent workers/i)
  assert.match(createSubagentSystemPrompt('staged_dag_verified'), /dependsOn/i)
  assert.match(createSubagentSystemPrompt('staged_dag_verified'), /verificationCriteria/i)
  assert.match(createSubagentSystemPrompt('model_delegated'), /delegate_subagents/i)
})

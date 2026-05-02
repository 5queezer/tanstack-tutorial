import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  allowedSubagentTools,
  runSubagents,
  type RunSubagentsInput,
  type SubagentWorkerRunner,
} from '../src/lib/subagent-orchestrator.ts'
import type { SubagentRoutingNote } from '../src/lib/subagent-router.ts'

function routingNote(chosenAction: SubagentRoutingNote['chosenAction']): SubagentRoutingNote {
  return {
    promptClass: 'review',
    complexity: 'high',
    domainBreadth: 'multi-domain',
    subtaskIndependence: 'high',
    verificationBurden: 'medium',
    costLatencyPrivacyRisk: 'medium',
    chosenAction,
    rationale: 'Review work is separable.',
    validationGate: 'Integrator validates findings.',
  }
}

function input(action: SubagentRoutingNote['chosenAction'], workers = 1): RunSubagentsInput {
  return {
    originalPrompt: 'Review frontend and backend independently.',
    routingNote: routingNote(action),
    model: 'openrouter/test-model',
    workers: Array.from({ length: workers }, (_, index) => ({
      name: `worker-${index + 1}`,
      objective: `Inspect area ${index + 1}`,
      scope: `area-${index + 1}`,
      nonGoals: 'Do not edit code.',
      allowedTools: ['github_search'],
      expectedOutput: 'Concise findings with evidence.',
    })),
  }
}

const runner: SubagentWorkerRunner = async (brief) => ({
  name: brief.name,
  status: 'completed',
  output: `${brief.name} done`,
})

test('exports the read-only subagent tool allowlist', () => {
  assert.deepEqual(allowedSubagentTools, ['brave_web_search', 'github_search', 'github_get'])
})

test('rejects non-spawn routing actions', async () => {
  await assert.rejects(
    runSubagents(input('use_tools'), { runner }),
    /does not allow subagent execution/i,
  )
})

test('requires exactly one worker for spawn_one_specialist', async () => {
  await assert.rejects(
    runSubagents(input('spawn_one_specialist', 2), { runner }),
    /requires exactly one worker/i,
  )
})

test('requires two to four workers for spawn_multiple_specialists', async () => {
  await assert.rejects(
    runSubagents(input('spawn_multiple_specialists', 1), { runner }),
    /requires 2 to 4 workers/i,
  )

  await assert.rejects(
    runSubagents(input('spawn_multiple_specialists', 5), { runner }),
    /requires 2 to 4 workers/i,
  )
})

test('rejects disallowed worker tools', async () => {
  const request = input('spawn_one_specialist')
  request.workers[0]!.allowedTools = ['route_subagents' as any]

  await assert.rejects(
    runSubagents(request, { runner }),
    /disallowed tool/i,
  )
})

test('rejects empty required worker brief fields', async () => {
  const request = input('spawn_one_specialist')
  request.workers[0]!.objective = '   '

  await assert.rejects(
    runSubagents(request, { runner }),
    /objective is required/i,
  )
})

test('returns completed worker results and integration hint', async () => {
  const result = await runSubagents(input('spawn_multiple_specialists', 2), { runner })

  assert.equal(result.action, 'spawn_multiple_specialists')
  assert.equal(result.workers.length, 2)
  assert.equal(result.workers[0]!.status, 'completed')
  assert.match(result.integrationHint, /integrate/i)
})

test('returns partial failure results without failing the whole run', async () => {
  const partialRunner: SubagentWorkerRunner = async (brief) => {
    if (brief.name === 'worker-2') throw new Error('worker timed out')
    return { name: brief.name, status: 'completed', output: `${brief.name} done` }
  }

  const result = await runSubagents(input('spawn_multiple_specialists', 2), { runner: partialRunner })

  assert.equal(result.workers[0]!.status, 'completed')
  assert.equal(result.workers[1]!.status, 'failed')
  assert.match(result.workers[1]!.error!, /worker timed out/)
})

test('registers run_subagents in server tools', async () => {
  const { serverTools } = await import('../src/lib/tools.ts')
  assert.ok(serverTools.some((tool: any) => tool.name === 'run_subagents'))
})

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  runSubagents,
  type RunSubagentsInput,
  type SubagentRoutingNote,
  type SubagentWorkerRunner,
} from '@5queezer/tanstack-ai-subagents'

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

function worker(name: string, dependsOn: string[] = []) {
  return {
    name,
    objective: `Inspect ${name}`,
    scope: `${name} area`,
    nonGoals: 'Do not edit code.',
    toolNames: ['github_search'] as Array<'github_search'>,
    expectedOutput: 'Concise findings with evidence.',
    dependsOn,
    verificationCriteria: `Verify ${name} evidence is cited.`,
    authority: 'read_only' as const,
    risk: 'low' as const,
  }
}

function input(action: SubagentRoutingNote['chosenAction'], workers = [worker('worker-1')]): RunSubagentsInput<'github_search'> {
  return {
    originalPrompt: 'Review frontend and backend independently.',
    routingNote: routingNote(action),
    model: 'openrouter/test-model',
    workers,
  }
}

const tools = { github_search: { name: 'github_search' } }
const runner: SubagentWorkerRunner<'github_search'> = async (brief) => ({
  name: brief.name,
  status: 'completed',
  output: `${brief.name} done`,
})

test('rejects non-spawn routing actions', async () => {
  await assert.rejects(
    runSubagents(input('use_tools'), { tools, runner }),
    /does not allow subagent execution/i,
  )
})

test('requires exactly one worker for spawn_one_specialist', async () => {
  await assert.rejects(
    runSubagents(input('spawn_one_specialist', [worker('a'), worker('b')]), { tools, runner }),
    /requires exactly one worker/i,
  )
})

test('requires two to four workers for spawn_multiple_specialists by app policy', async () => {
  await assert.rejects(
    runSubagents(input('spawn_multiple_specialists', [worker('a')]), { tools, runner, maxWorkers: 4 }),
    /requires 2 to 4 workers/i,
  )

  await assert.rejects(
    runSubagents(input('spawn_multiple_specialists', [worker('a'), worker('b'), worker('c'), worker('d'), worker('e')]), { tools, runner, maxWorkers: 4 }),
    /requires 2 to 4 workers/i,
  )
})

test('rejects disallowed worker tools from the configured registry', async () => {
  const request = input('spawn_one_specialist')
  request.workers[0]!.toolNames = ['route_subagents' as any]

  await assert.rejects(
    runSubagents(request, { tools, runner }),
    /disallowed tool/i,
  )
})

test('runs independent workers as parallel topology', async () => {
  const result = await runSubagents(input('spawn_multiple_specialists', [worker('frontend'), worker('backend')]), { tools, runner, maxWorkers: 4 })

  assert.equal(result.action, 'spawn_multiple_specialists')
  assert.equal(result.topology, 'parallel')
  assert.equal(result.workers.length, 2)
  assert.equal(result.workers[0]!.status, 'completed')
  assert.match(result.integrationHint, /integrate/i)
})

test('runs dependent workers as staged DAG and preserves dependency order', async () => {
  const seen: string[] = []
  const result = await runSubagents(
    input('spawn_multiple_specialists', [worker('research'), worker('verify', ['research'])]),
    {
      tools,
      maxWorkers: 4,
      runner: async (brief) => {
        seen.push(brief.name)
        return { name: brief.name, status: 'completed', output: `${brief.name} done` }
      },
    },
  )

  assert.equal(result.topology, 'staged_dag')
  assert.deepEqual(seen, ['research', 'verify'])
})

test('adds verification results when verifier is configured', async () => {
  const result = await runSubagents(input('spawn_multiple_specialists', [worker('research'), worker('verify', ['research'])]), {
    tools,
    runner,
    maxWorkers: 4,
    policy: { requireVerification: true, maxDepth: 3 },
    verifier: async (runResult) => ({
      status: runResult.workers.every((item) => item.status === 'completed') ? 'verified' : 'failed',
      summary: `Checked ${runResult.workers.length} workers`,
      checkedWorkers: runResult.workers.map((item) => item.name),
    }),
  })

  assert.equal(result.verification?.status, 'verified')
  assert.deepEqual(result.verification?.checkedWorkers, ['research', 'verify'])
})

test('registers subagent package tools in server tool sets', async () => {
  const { getServerTools } = await import('../src/lib/tools.ts')

  assert.ok(getServerTools('deterministic_routing').some((tool: any) => tool.name === 'route_subagents'))
  assert.ok(!getServerTools('deterministic_routing').some((tool: any) => tool.name === 'run_subagents'))
  assert.ok(getServerTools('route_then_run').some((tool: any) => tool.name === 'run_subagents'))
  assert.ok(getServerTools('model_delegated').some((tool: any) => tool.name === 'delegate_subagents'))
})

test('server subagent tools inject the selected chat model when tool input omits model', async () => {
  const { withSelectedSubagentModel } = await import('../src/lib/tools.ts')
  const request = input('spawn_multiple_specialists', [worker('kernel'), worker('tls')])
  delete request.model

  assert.equal(withSelectedSubagentModel(request, 'openrouter/selected').model, 'openrouter/selected')
})

# Subagent Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add app-native TanStack AI/OpenRouter subagent execution behind the existing `route_subagents` decision gate.

**Architecture:** Keep `src/lib/subagent-router.ts` as a deterministic routing policy. Add `src/lib/subagent-orchestrator.ts` for validating bounded worker briefs and running workers through TanStack AI with approved read-only tools. Expose it as a `run_subagents` server tool and summarize results in the existing AG-UI tool-card layer.

**Tech Stack:** TypeScript, TanStack AI, OpenRouter adapter, Zod, Node test runner, ADR tools.

---

## File Map

- Create `src/lib/subagent-orchestrator.ts`: types, input validation, worker execution, injectable test runner.
- Modify `src/lib/tools.ts`: define/register `run_subagents`; pass selected model from tool input to orchestrator.
- Modify `src/routes/api/chat.ts`: advertise `run_subagents` and instruct model to call it only after spawn routing.
- Modify `src/lib/ag-ui-tool-activity.ts`: summarize `run_subagents` results.
- Modify `tests/subagent-router.test.ts`: no changes expected; run as regression.
- Create `tests/subagent-orchestrator.test.ts`: validation and partial-failure tests.
- Modify `tests/ag-ui-tool-activity.test.ts`: execution-card summary test.
- Add ADR under `doc/adr/`: record transition from routing-only to routing plus execution.

## Task 1: Record Architecture Decision

**Files:**
- Create: `doc/adr/NNNN-add-subagent-execution.md` via `adr new "Add Subagent Execution"`

- [ ] **Step 1: Check existing ADRs**

Run:

```bash
adr list
```

Expected: list includes ADR 0002 and ADR 0004.

- [ ] **Step 2: Create the ADR**

Run:

```bash
adr new "Add Subagent Execution"
```

Expected: a new numbered file is created in `doc/adr/`.

- [ ] **Step 3: Replace the ADR body**

Use the generated filename and write:

```markdown
# N. Add Subagent Execution

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
```

- [ ] **Step 4: Commit ADR**

Run:

```bash
git add doc/adr
git commit -m "docs: record subagent execution decision"
```

Expected: commit succeeds.

## Task 2: Add Orchestrator Validation and Types

**Files:**
- Create: `src/lib/subagent-orchestrator.ts`
- Test: `tests/subagent-orchestrator.test.ts`

- [ ] **Step 1: Write failing validation tests**

Create `tests/subagent-orchestrator.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- tests/subagent-orchestrator.test.ts
```

Expected: FAIL because `src/lib/subagent-orchestrator.ts` does not exist.

- [ ] **Step 3: Implement validation/types with injectable runner**

Create `src/lib/subagent-orchestrator.ts`:

```ts
import { chat } from '@tanstack/ai'

import { getChatModel } from './ai'
import { braveWebSearch } from './tools'
import { githubGet, githubSearch } from './github-tool'
import type { SubagentAction, SubagentRoutingNote } from './subagent-router'

export const allowedSubagentTools = ['brave_web_search', 'github_search', 'github_get'] as const
export type AllowedSubagentTool = typeof allowedSubagentTools[number]

export type SubagentWorkerBrief = {
  name: string
  objective: string
  scope: string
  nonGoals: string
  allowedTools: Array<AllowedSubagentTool>
  expectedOutput: string
}

export type RunSubagentsInput = {
  originalPrompt: string
  routingNote: SubagentRoutingNote
  workers: SubagentWorkerBrief[]
  model?: string
}

export type SubagentWorkerResult = {
  name: string
  status: 'completed' | 'failed'
  output: string
  error?: string
}

export type RunSubagentsResult = {
  action: SubagentAction
  workers: SubagentWorkerResult[]
  integrationHint: string
}

export type SubagentWorkerRunner = (brief: SubagentWorkerBrief, input: RunSubagentsInput) => Promise<SubagentWorkerResult>

type RunSubagentsOptions = {
  runner?: SubagentWorkerRunner
}

export async function runSubagents(input: RunSubagentsInput, options: RunSubagentsOptions = {}): Promise<RunSubagentsResult> {
  validateRunSubagentsInput(input)

  const runner = options.runner ?? runModelWorker
  const workers = await Promise.all(input.workers.map(async (brief) => {
    try {
      return await runner(brief, input)
    } catch (error) {
      return {
        name: brief.name,
        status: 'failed' as const,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown worker error',
      }
    }
  }))

  return {
    action: input.routingNote.chosenAction,
    workers,
    integrationHint: 'Integrate completed worker findings, call out failures or uncertainty, and validate against the routing note validation gate.',
  }
}

export function validateRunSubagentsInput(input: RunSubagentsInput) {
  const action = input.routingNote.chosenAction

  if (action !== 'spawn_one_specialist' && action !== 'spawn_multiple_specialists') {
    throw new Error(`Routing action ${action} does not allow subagent execution`)
  }

  if (action === 'spawn_one_specialist' && input.workers.length !== 1) {
    throw new Error('spawn_one_specialist requires exactly one worker')
  }

  if (action === 'spawn_multiple_specialists' && (input.workers.length < 2 || input.workers.length > 4)) {
    throw new Error('spawn_multiple_specialists requires 2 to 4 workers')
  }

  input.workers.forEach((worker, index) => {
    requireText(worker.name, `workers[${index}].name`)
    requireText(worker.objective, `workers[${index}].objective`)
    requireText(worker.scope, `workers[${index}].scope`)
    requireText(worker.nonGoals, `workers[${index}].nonGoals`)
    requireText(worker.expectedOutput, `workers[${index}].expectedOutput`)

    for (const tool of worker.allowedTools) {
      if (!(allowedSubagentTools as readonly string[]).includes(tool)) {
        throw new Error(`workers[${index}] requested disallowed tool: ${tool}`)
      }
    }
  })
}

function requireText(value: string, field: string) {
  if (!value?.trim()) throw new Error(`${field} is required`)
}

function getAllowedWorkerTools(names: Array<AllowedSubagentTool>) {
  const tools = []
  if (names.includes('brave_web_search')) tools.push(braveWebSearch)
  if (names.includes('github_search')) tools.push(githubSearch)
  if (names.includes('github_get')) tools.push(githubGet)
  return tools
}

async function runModelWorker(brief: SubagentWorkerBrief, input: RunSubagentsInput): Promise<SubagentWorkerResult> {
  if (!input.model) throw new Error('run_subagents requires a model for worker execution')

  const output = await chat({
    adapter: getChatModel(input.model),
    stream: false,
    tools: getAllowedWorkerTools(brief.allowedTools),
    systemPrompts: [
      'You are a bounded specialist subagent. Complete only the assigned brief. Use only allowed tools. Do not implement code or mutate state. Return concise findings with evidence and uncertainty.',
    ],
    messages: [{
      role: 'user',
      content: [
        `Original prompt: ${input.originalPrompt}`,
        `Routing rationale: ${input.routingNote.rationale}`,
        `Validation gate: ${input.routingNote.validationGate}`,
        `Worker name: ${brief.name}`,
        `Objective: ${brief.objective}`,
        `Scope: ${brief.scope}`,
        `Non-goals: ${brief.nonGoals}`,
        `Expected output: ${brief.expectedOutput}`,
      ].join('\n'),
    }],
  })

  return {
    name: brief.name,
    status: 'completed',
    output,
  }
}
```

- [ ] **Step 4: Run orchestrator tests**

Run:

```bash
npm test -- tests/subagent-orchestrator.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS. If a circular import type error occurs from importing `braveWebSearch` from `tools.ts`, split shared tool definitions into a small file or import only server tool values that do not create runtime cycles.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/lib/subagent-orchestrator.ts tests/subagent-orchestrator.test.ts
git commit -m "feat: add subagent orchestrator validation"
```

Expected: commit succeeds.

## Task 3: Register `run_subagents` Server Tool

**Files:**
- Modify: `src/lib/tools.ts`
- Modify: `src/routes/api/chat.ts`
- Test: `tests/subagent-orchestrator.test.ts`

- [ ] **Step 1: Add a server-tool registration test**

Append to `tests/subagent-orchestrator.test.ts`:

```ts
test('registers run_subagents in server tools', async () => {
  const { serverTools } = await import('../src/lib/tools.ts')
  assert.ok(serverTools.some((tool: any) => tool.name === 'run_subagents'))
})
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm test -- tests/subagent-orchestrator.test.ts
```

Expected: FAIL because `run_subagents` is not registered.

- [ ] **Step 3: Add `run_subagents` to tools**

Modify `src/lib/tools.ts` imports:

```ts
import { runSubagents } from './subagent-orchestrator'
```

Add after `braveWebSearch`:

```ts
export const runSubagentsDef = toolDefinition({
  name: 'run_subagents',
  description: 'Run bounded read-only specialist subagents after route_subagents chooses a spawn action.',
  inputSchema: z.object({
    originalPrompt: z.string(),
    model: z.string().optional(),
    routingNote: z.object({
      promptClass: z.enum(['question', 'research', 'implementation', 'review', 'debugging', 'optimization', 'operations']),
      complexity: z.enum(['low', 'medium', 'high']),
      domainBreadth: z.enum(['single-domain', 'multi-domain']),
      subtaskIndependence: z.enum(['low', 'medium', 'high']),
      verificationBurden: z.enum(['low', 'medium', 'high']),
      costLatencyPrivacyRisk: z.enum(['low', 'medium', 'high']),
      chosenAction: z.enum(['answer_directly', 'use_tools', 'write_plan_first', 'spawn_one_specialist', 'spawn_multiple_specialists', 'reject_clarify_escalate']),
      rationale: z.string(),
      validationGate: z.string(),
    }),
    workers: z.array(z.object({
      name: z.string(),
      objective: z.string(),
      scope: z.string(),
      nonGoals: z.string(),
      allowedTools: z.array(z.enum(['brave_web_search', 'github_search', 'github_get'])),
      expectedOutput: z.string(),
    })).min(1).max(4),
  }),
})

export const runSubagentsTool = runSubagentsDef.server(async (args) => traceToolCall('run_subagents', args, async () => runSubagents(args as any)))
```

Change final export:

```ts
export const serverTools = [getWeather, getStockQuote, braveWebSearch, githubSearch, githubGet, subagentRoute, runSubagentsTool, requestSearchQueryDef]
```

- [ ] **Step 4: Update system prompt**

In `src/routes/api/chat.ts`, replace the existing system prompt string with:

```ts
'Helpful assistant. Tools: get_weather weather, get_stock_quote stocks/tickers, brave_web_search current/recent/docs/web, github_search GitHub issues/PRs/code/repos/users, github_get GitHub issue/PR/comments/reviews/files/commits/status/checks/actions, route_subagents decide direct/tools/plan/subagents/escalate, run_subagents execute bounded read-only specialists only after route_subagents returns spawn_one_specialist or spawn_multiple_specialists. Missing/ambiguous search: call request_search_query then brave_web_search. Say weather/stock data is demo when relevant. Cite Brave/GitHub URLs. For subagent execution, the main assistant integrates worker findings and mentions worker failures or uncertainty.',
```

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
npm test
npm run typecheck
```

Expected: both PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/lib/tools.ts src/routes/api/chat.ts tests/subagent-orchestrator.test.ts
git commit -m "feat: expose subagent execution tool"
```

Expected: commit succeeds.

## Task 4: Add Tool Activity Summary

**Files:**
- Modify: `src/lib/ag-ui-tool-activity.ts`
- Modify: `tests/ag-ui-tool-activity.test.ts`

- [ ] **Step 1: Write failing summary test**

Append to `tests/ag-ui-tool-activity.test.ts`:

```ts
test('summarizes run_subagents worker execution', () => {
  const summary = summarizeToolActivity('run_subagents', undefined, {
    action: 'spawn_multiple_specialists',
    workers: [
      { name: 'frontend', status: 'completed', output: 'Frontend OK' },
      { name: 'backend', status: 'failed', output: '', error: 'timeout' },
    ],
    integrationHint: 'Integrate completed worker findings.',
  })

  assert.ok(summary)
  assert.equal(summary.title, 'Subagent execution')
  assert.deepEqual(summary.rows, [
    ['Action', 'spawn_multiple_specialists'],
    ['Workers', '2'],
    ['Completed', '1'],
    ['Failed', '1'],
    ['frontend', 'completed'],
    ['backend', 'failed'],
    ['Integration', 'Integrate completed worker findings.'],
  ])
})
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm test -- tests/ag-ui-tool-activity.test.ts
```

Expected: FAIL because `run_subagents` summary is missing.

- [ ] **Step 3: Implement summary**

In `src/lib/ag-ui-tool-activity.ts`, add after the `route_subagents` block:

```ts
  if (toolName === 'run_subagents') {
    const workers = output.workers ?? []
    const completed = workers.filter((worker: any) => worker.status === 'completed').length
    const failed = workers.filter((worker: any) => worker.status === 'failed').length

    return {
      title: 'Subagent execution',
      rows: [
        ['Action', String(output.action)],
        ['Workers', String(workers.length)],
        ['Completed', String(completed)],
        ['Failed', String(failed)],
        ...workers.map((worker: any) => [String(worker.name), String(worker.status)] as [string, string]),
        ['Integration', String(output.integrationHint)],
      ],
    }
  }
```

- [ ] **Step 4: Run activity tests**

Run:

```bash
npm test -- tests/ag-ui-tool-activity.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/lib/ag-ui-tool-activity.ts tests/ag-ui-tool-activity.test.ts
git commit -m "feat: summarize subagent execution activity"
```

Expected: commit succeeds.

## Task 5: Final Verification and Prompt Regression

**Files:**
- Modify only if verification exposes issues.

- [ ] **Step 1: Run all tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Manual behavior smoke check**

Start dev server:

```bash
npm run dev
```

Ask the chat:

```text
Review the frontend, GitHub tool code, and subagent routing tests in parallel and summarize independent findings.
```

Expected:

- The assistant calls `route_subagents`.
- If routing chooses `spawn_multiple_specialists`, the assistant may call `run_subagents` with 2-4 bounded workers.
- The UI shows a Subagent routing card and a Subagent execution card.
- Final answer integrates worker outputs and mentions failures if any.

- [ ] **Step 5: Commit verification fixes if needed**

If changes were needed, run:

```bash
git add src tests doc/adr
git commit -m "fix: stabilize subagent execution"
```

Expected: commit succeeds or no changes exist.

## Self-Review Notes

- Spec coverage: routing gate preserved, app-native TanStack AI/OpenRouter execution added, read-only tool allowlist enforced, UI summary added, partial failure tested, ADR update included.
- Placeholders: no TBD/TODO placeholders remain.
- Type consistency: plan consistently uses `RunSubagentsInput`, `SubagentWorkerBrief`, `SubagentWorkerRunner`, `runSubagents`, and `run_subagents`.

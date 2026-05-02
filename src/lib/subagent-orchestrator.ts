import { chat } from '@tanstack/ai'

import { getChatModel } from './ai.ts'
import { githubGet, githubSearch } from './github-tool.ts'
import type { SubagentAction, SubagentRoutingNote } from './subagent-router.ts'

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

async function getAllowedWorkerTools(names: Array<AllowedSubagentTool>) {
  const tools = []
  if (names.includes('brave_web_search')) {
    const { braveWebSearch } = await import('./tools.ts')
    tools.push(braveWebSearch)
  }
  if (names.includes('github_search')) tools.push(githubSearch)
  if (names.includes('github_get')) tools.push(githubGet)
  return tools
}

async function runModelWorker(brief: SubagentWorkerBrief, input: RunSubagentsInput): Promise<SubagentWorkerResult> {
  if (!input.model) throw new Error('run_subagents requires a model for worker execution')

  const output = await chat({
    adapter: getChatModel(input.model),
    stream: false,
    tools: await getAllowedWorkerTools(brief.allowedTools),
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

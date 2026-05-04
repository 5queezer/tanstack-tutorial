import { chat } from '@tanstack/ai'
import { toolDefinition } from '@tanstack/ai'
import {
  createDelegateSubagentsTool,
  createRunSubagentsTool,
  createSubagentRouterTool,
  type RunSubagentsResult,
  type RunSubagentsInput,
} from '@5queezer/tanstack-ai-subagents'
import { z } from 'zod'
import { getChatModel } from './ai.ts'
import { braveWebSearch } from './brave-tool.ts'
import { requestSearchQueryDef } from './request-search-tool.ts'
import { githubGet, githubSearch } from './github-tool.ts'
import { traceToolCall } from './langfuse-tracing.ts'
import type { SubagentMode } from './subagent-modes.ts'

export const getWeatherDef = toolDefinition({
  name: 'get_weather',
  description: 'Weather.',
  inputSchema: z.object({
    city: z.string(),
  }),
})

export const getStockDef = toolDefinition({
  name: 'get_stock_quote',
  description: 'Stock quote.',
  inputSchema: z.object({
    symbol: z.string(),
  }),
})

type WeatherInput = { city: string }
type StockInput = { symbol: string }
type WeatherOutput = {
  condition: string
  temperatureC: number
  humidity: number
  windKph: number
}
type StockOutput = {
  price: number
  change: number
  changePercent: number
  currency: string
  marketState: string
}

type WorkerToolName = 'brave_web_search' | 'github_search' | 'github_get'

type WorkerTool = typeof braveWebSearch | typeof githubSearch | typeof githubGet

const weatherByCity: Record<string, WeatherOutput> = {
  berlin: { condition: 'Partly cloudy', temperatureC: 18, humidity: 62, windKph: 14 },
  london: { condition: 'Light rain', temperatureC: 15, humidity: 78, windKph: 18 },
  'new york': { condition: 'Sunny', temperatureC: 23, humidity: 54, windKph: 11 },
  tokyo: { condition: 'Humid and warm', temperatureC: 27, humidity: 71, windKph: 9 },
  paris: { condition: 'Clear', temperatureC: 20, humidity: 58, windKph: 10 },
}

const stockBySymbol: Record<string, StockOutput> = {
  AAPL: { price: 197.42, change: 1.38, changePercent: 0.7, currency: 'USD', marketState: 'Demo delayed' },
  MSFT: { price: 431.27, change: -2.84, changePercent: -0.65, currency: 'USD', marketState: 'Demo delayed' },
  NVDA: { price: 128.93, change: 3.21, changePercent: 2.55, currency: 'USD', marketState: 'Demo delayed' },
  TSLA: { price: 244.81, change: -5.44, changePercent: -2.17, currency: 'USD', marketState: 'Demo delayed' },
  SPY: { price: 586.12, change: 0.91, changePercent: 0.16, currency: 'USD', marketState: 'Demo delayed' },
}

const subagentTools: Record<WorkerToolName, WorkerTool> = {
  brave_web_search: braveWebSearch,
  github_search: githubSearch,
  github_get: githubGet,
}

const subagentProfiles = {
  research: {
    toolNames: ['brave_web_search', 'github_search', 'github_get'] as WorkerToolName[],
    systemPrompt: 'Research the assigned subtask with read-only web and GitHub tools. Return concise findings with evidence URLs and uncertainty.',
  },
  verify: {
    toolNames: ['github_search', 'github_get'] as WorkerToolName[],
    systemPrompt: 'Verify worker findings against GitHub evidence. Return exact evidence, gaps, and whether the finding is ready to integrate.',
  },
}

export const getWeather = getWeatherDef.server(async (args) => traceToolCall('get_weather', args, async () => {
  const { city } = args as WeatherInput
  const key = city.toLowerCase().trim()
  const weather = weatherByCity[key] ?? {
    condition: 'Mild and clear',
    temperatureC: 21,
    humidity: 60,
    windKph: 12,
  }

  return {
    city,
    ...weather,
  }
}))

export const getStockQuote = getStockDef.server(async (args) => traceToolCall('get_stock_quote', args, async () => {
  const { symbol } = args as StockInput
  const normalizedSymbol = symbol.toUpperCase().trim()
  const quote = stockBySymbol[normalizedSymbol] ?? {
    price: 100 + normalizedSymbol.length * 7.13,
    change: 1.24,
    changePercent: 1.1,
    currency: 'USD',
    marketState: 'Demo delayed',
  }

  return {
    symbol: normalizedSymbol,
    ...quote,
  }
}))

export const subagentRoute = createSubagentRouterTool({ trace: traceToolCall })

export const runSubagentsTool = createRunSubagentsTool<WorkerToolName, WorkerTool, ReturnType<typeof getChatModel>>({
  chat,
  getAdapter: getChatModel,
  tools: subagentTools,
  profiles: subagentProfiles,
  maxWorkers: 4,
  policy: { maxDepth: 3 },
  trace: traceToolCall,
})

export const verifiedRunSubagentsTool = createRunSubagentsTool<WorkerToolName, WorkerTool, ReturnType<typeof getChatModel>>({
  chat,
  getAdapter: getChatModel,
  tools: subagentTools,
  profiles: subagentProfiles,
  maxWorkers: 4,
  policy: { requireVerification: true, maxDepth: 3 },
  trace: traceToolCall,
  verifier: async (result: RunSubagentsResult, input: RunSubagentsInput<WorkerToolName>) => ({
    status: result.workers.every((worker) => worker.status === 'completed') ? 'verified' : 'needs_review',
    summary: result.workers.every((worker) => worker.status === 'completed')
      ? `Verified ${result.topology} delegation against ${input.routingNote.validationGate}`
      : 'One or more workers failed; review gaps before integrating.',
    checkedWorkers: result.workers.map((worker) => worker.name),
  }),
})

export const delegateSubagentsTool = createDelegateSubagentsTool<WorkerToolName, WorkerTool, ReturnType<typeof getChatModel>>({
  chat,
  getAdapter: getChatModel,
  tools: subagentTools,
  profiles: subagentProfiles,
  maxWorkers: 4,
  policy: { requireVerification: true, maxDepth: 3 },
  trace: traceToolCall,
  verifier: async (result) => ({
    status: result.workers.every((worker) => worker.status === 'completed') ? 'verified' : 'needs_review',
    summary: `Verified model-directed ${result.topology} delegation before integration.`,
    checkedWorkers: result.workers.map((worker) => worker.name),
  }),
})

const baseServerTools = [getWeather, getStockQuote, braveWebSearch, githubSearch, githubGet]

export function getServerTools(mode: SubagentMode) {
  if (mode === 'deterministic_routing') return [...baseServerTools, subagentRoute, requestSearchQueryDef]
  if (mode === 'model_delegated') return [...baseServerTools, delegateSubagentsTool, requestSearchQueryDef]
  if (mode === 'staged_dag_verified') return [...baseServerTools, subagentRoute, verifiedRunSubagentsTool, requestSearchQueryDef]
  return [...baseServerTools, subagentRoute, runSubagentsTool, requestSearchQueryDef]
}

export const serverTools = getServerTools('staged_dag_verified')

import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { requestSearchQueryDef } from './request-search-tool.ts'
import { githubGet, githubSearch } from './github-tool.ts'
import { runSubagents } from './subagent-orchestrator.ts'
import { subagentRoute } from './subagent-router.ts'
import { traceToolCall } from './langfuse-tracing.ts'

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

export const braveWebSearchDef = toolDefinition({
  name: 'brave_web_search',
  description: 'Web search.',
  inputSchema: z.object({
    query: z.string().max(400),
    count: z.number().int().min(1).max(10).optional(),
  }),
})

type WeatherInput = { city: string }
type StockInput = { symbol: string }
type BraveWebSearchInput = { query: string; count?: number }
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

type BraveSearchResponse = {
  query?: { original?: string }
  web?: {
    results?: Array<{
      title?: string
      url?: string
      description?: string

    }>
  }
}

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

export const braveWebSearch = braveWebSearchDef.server(async (args) => traceToolCall('brave_web_search', args, async () => {
  const { query, count = 5 } = args as BraveWebSearchInput

  if (!process.env.BRAVE_API_KEY) {
    throw new Error('BRAVE_API_KEY missing')
  }

  const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`, {
    headers: {
      'X-Subscription-Token': process.env.BRAVE_API_KEY,
    },
    signal: AbortSignal.timeout(1e4),
  })

  if (!response.ok) {
    throw new Error(`Brave failed: ${response.status}`)
  }

  const payload = (await response.json()) as BraveSearchResponse
  const results = (payload.web?.results ?? [])
    .slice(0, count)
    .map((result) => ({
      title: result.title,
      url: result.url,
      description: result.description,

    }))

  return {
    query: payload.query?.original,
    results,
  }
}))

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

export const serverTools = [getWeather, getStockQuote, braveWebSearch, githubSearch, githubGet, subagentRoute, runSubagentsTool, requestSearchQueryDef]

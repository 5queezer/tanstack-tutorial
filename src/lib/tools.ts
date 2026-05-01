import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export const getWeatherDef = toolDefinition({
  name: 'get_weather',
  description: 'Get current weather for a city. Use this when the user asks about weather, temperature, rain, wind, or conditions in a place.',
  inputSchema: z.object({
    city: z.string().describe('City or location name, for example Berlin or New York'),
  }),
  outputSchema: z.object({
    city: z.string(),
    condition: z.string(),
    temperatureC: z.number(),
    humidity: z.number(),
    windKph: z.number(),
    observedAt: z.string(),
  }),
})

export const getStockDef = toolDefinition({
  name: 'get_stock_quote',
  description: 'Get a demo stock quote for a ticker symbol. Use this when the user asks about stocks, share price, market price, or tickers.',
  inputSchema: z.object({
    symbol: z.string().describe('Ticker symbol, for example AAPL, MSFT, NVDA, TSLA, or SPY'),
  }),
  outputSchema: z.object({
    symbol: z.string(),
    price: z.number(),
    change: z.number(),
    changePercent: z.number(),
    currency: z.string(),
    marketState: z.string(),
    observedAt: z.string(),
  }),
})

export const requestSearchQueryDef = toolDefinition({
  name: 'request_search_query',
  description: 'Ask the user for a missing or ambiguous web search query. Use this before brave_web_search when the user asks to search but does not specify what to search for.',
  inputSchema: z.object({
    prompt: z.string().describe('Short question asking what to search for'),
    suggestedQuery: z.string().optional().describe('Optional suggested search query the user can edit'),
  }),
  outputSchema: z.object({
    query: z.string(),
  }),
})

export const braveWebSearchDef = toolDefinition({
  name: 'brave_web_search',
  description: 'Search the live web with Brave Search. Use this for current events, recent facts, documentation lookups, news, or when the user asks to search the web. Cite returned URLs in the answer.',
  inputSchema: z.object({
    query: z.string().max(400).describe('Concise search query, under 400 characters'),
    count: z.number().int().min(1).max(10).optional().describe('Number of search results to return, default 5'),
  }),
  outputSchema: z.object({
    query: z.string(),
    results: z.array(z.object({
      title: z.string(),
      url: z.string(),
      description: z.string(),
      age: z.string().optional(),
      source: z.string().optional(),
    })),
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
      age?: string
      profile?: { name?: string }
      meta_url?: { hostname?: string }
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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const getWeather = getWeatherDef.server(async (args, context) => {
  const { city } = args as WeatherInput
  context?.emitCustomEvent('tool.status', {
    tool: 'weather',
    label: `Looking up weather for ${city}`,
    progress: 25,
  })
  await delay(350)

  const key = city.toLowerCase().trim()
  const weather = weatherByCity[key] ?? {
    condition: 'Mild and clear',
    temperatureC: 21,
    humidity: 60,
    windKph: 12,
  }

  context?.emitCustomEvent('tool.status', {
    tool: 'weather',
    label: `Weather data ready for ${city}`,
    progress: 100,
  })

  return {
    city,
    ...weather,
    observedAt: new Date().toISOString(),
  }
})

export const getStockQuote = getStockDef.server(async (args, context) => {
  const { symbol } = args as StockInput
  const normalizedSymbol = symbol.toUpperCase().trim()

  context?.emitCustomEvent('tool.status', {
    tool: 'stock',
    label: `Fetching quote for ${normalizedSymbol}`,
    progress: 25,
  })
  await delay(350)

  const quote = stockBySymbol[normalizedSymbol] ?? {
    price: 100 + normalizedSymbol.length * 7.13,
    change: 1.24,
    changePercent: 1.1,
    currency: 'USD',
    marketState: 'Demo delayed',
  }

  context?.emitCustomEvent('tool.status', {
    tool: 'stock',
    label: `Quote ready for ${normalizedSymbol}`,
    progress: 100,
  })

  return {
    symbol: normalizedSymbol,
    ...quote,
    observedAt: new Date().toISOString(),
  }
})

export const braveWebSearch = braveWebSearchDef.server(async (args, context) => {
  const { query, count = 5 } = args as BraveWebSearchInput
  const apiKey = process.env.BRAVE_API_KEY

  if (!apiKey) {
    throw new Error('BRAVE_API_KEY not configured')
  }

  const safeCount = Math.min(Math.max(count, 1), 10)
  const safeQuery = query.slice(0, 400)

  context?.emitCustomEvent('tool.status', {
    tool: 'web-search',
    label: `Searching Brave for “${safeQuery}”`,
    progress: 20,
  })

  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', safeQuery)
  url.searchParams.set('count', String(safeCount))
  url.searchParams.set('text_decorations', 'false')

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': apiKey,
    },
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    throw new Error(`Brave Search failed: ${response.status} ${response.statusText}`)
  }

  context?.emitCustomEvent('tool.status', {
    tool: 'web-search',
    label: 'Brave results received',
    progress: 75,
  })

  const payload = (await response.json()) as BraveSearchResponse
  const results = (payload.web?.results ?? [])
    .filter((result) => result.title && result.url)
    .slice(0, safeCount)
    .map((result) => ({
      title: result.title!,
      url: result.url!,
      description: result.description ?? '',
      age: result.age,
      source: result.profile?.name ?? result.meta_url?.hostname,
    }))

  context?.emitCustomEvent('tool.status', {
    tool: 'web-search',
    label: `${results.length} Brave results ready`,
    progress: 100,
  })

  return {
    query: payload.query?.original ?? safeQuery,
    results,
  }
})

export const serverTools = [getWeather, getStockQuote, braveWebSearch, requestSearchQueryDef]

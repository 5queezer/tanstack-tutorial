import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { requestSearchQueryDef } from './request-search-tool'

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

export const getWeather = getWeatherDef.server(async (args) => {
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
})

export const getStockQuote = getStockDef.server(async (args) => {
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
})

export const braveWebSearch = braveWebSearchDef.server(async (args) => {
  const { query, count = 5 } = args as BraveWebSearchInput

  if (!process.env.BRAVE_API_KEY) {
    throw new Error('BRAVE_API_KEY missing')
  }

  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(count))
  url.searchParams.set('text_decorations', 'false')

  const response = await fetch(url, {
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
})

export const serverTools = [getWeather, getStockQuote, braveWebSearch, requestSearchQueryDef]

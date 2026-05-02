import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { traceToolCall } from './langfuse-tracing.ts'

export const braveWebSearchDef = toolDefinition({
  name: 'brave_web_search',
  description: 'Web search.',
  inputSchema: z.object({
    query: z.string().max(400),
    count: z.number().int().min(1).max(10).optional(),
  }),
})

type BraveWebSearchInput = { query: string; count?: number }

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

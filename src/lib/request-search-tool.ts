import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

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

import { toolDefinition } from '@tanstack/ai'

const requestSearchInputSchema = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      description: 'Short question asking what to search for',
    },
    suggestedQuery: {
      type: 'string',
      description: 'Optional suggested search query the user can edit',
    },
  },
  required: ['prompt'],
  additionalProperties: false,
} as const

const requestSearchOutputSchema = {
  type: 'object',
  properties: {
    query: { type: 'string' },
  },
  required: ['query'],
  additionalProperties: false,
} as const

export const requestSearchQueryDef = toolDefinition({
  name: 'request_search_query',
  description: 'Ask the user for a missing or ambiguous web search query. Use this before brave_web_search when the user asks to search but does not specify what to search for.',
  inputSchema: requestSearchInputSchema,
  outputSchema: requestSearchOutputSchema,
})

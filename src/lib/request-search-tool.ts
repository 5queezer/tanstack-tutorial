import { toolDefinition } from '@tanstack/ai'

const requestSearchInputSchema = {
  type: 'object',
  properties: {
    prompt: { type: 'string' },
    suggestedQuery: { type: 'string' },
  },
  required: ['prompt'],
  additionalProperties: false,
} as const

export const requestSearchQueryDef = toolDefinition({
  name: 'request_search_query',
  description: 'Ask for a search query.',
  inputSchema: requestSearchInputSchema,
})

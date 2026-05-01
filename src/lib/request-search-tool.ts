import { toolDefinition } from '@tanstack/ai'

const requestSearchInputSchema = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      description: 'Question asking what to search for',
    },
    suggestedQuery: {
      type: 'string',
      description: 'Optional editable suggested query',
    },
  },
  required: ['prompt'],
  additionalProperties: false,
} as const

export const requestSearchQueryDef = toolDefinition({
  name: 'request_search_query',
  description: 'Ask the user for a missing or ambiguous query before brave_web_search.',
  inputSchema: requestSearchInputSchema,
})

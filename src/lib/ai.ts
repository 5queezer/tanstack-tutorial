import { createOpenaiChat } from '@tanstack/ai-openai'

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
export function getChatModel(modelId: string) {
  const apiKey = process.env.OPENROUTER_API_KEY

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not configured')
  }

  return createOpenaiChat(
    modelId as any,
    apiKey,
    {
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: {
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? 'http://localhost:3000',
        'X-Title': process.env.OPENROUTER_APP_NAME ?? 'TanStack Tutorial',
      },
    },
  )
}

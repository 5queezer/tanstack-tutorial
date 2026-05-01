import { createOpenRouterText } from '@tanstack/ai-openrouter'

export function getChatModel(modelId: string) {
  const apiKey = process.env.OPENROUTER_API_KEY

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not configured')
  }

  return createOpenRouterText(modelId as any, apiKey, {
    httpReferer: process.env.OPENROUTER_SITE_URL ?? 'http://localhost:3000',
    appTitle: process.env.OPENROUTER_APP_NAME ?? 'TanStack Tutorial',
  })
}

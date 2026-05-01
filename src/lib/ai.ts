import { createOpenRouterText } from '@tanstack/ai-openrouter'

export function getChatModel(modelId: string) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not configured')
  }

  return createOpenRouterText(modelId as any, process.env.OPENROUTER_API_KEY)
}

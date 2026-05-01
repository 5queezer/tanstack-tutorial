import { createFileRoute } from '@tanstack/react-router'

import {
  isFreeOpenRouterModel,
  isTextChatOpenRouterModel,
  supportsOpenRouterThinking,
  type ChatModel,
  type OpenRouterModelResponse,
} from '../../lib/models'

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'

export const Route = createFileRoute('/api/models')({
  server: {
    handlers: {
      GET: async () => {
        const response = await fetch(OPENROUTER_MODELS_URL, {
          headers: process.env.OPENROUTER_API_KEY
            ? { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` }
            : undefined,
        })

        if (!response.ok) {
          return new Response(
            JSON.stringify({ error: 'Failed to fetch OpenRouter models' }),
            {
              status: response.status,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        const payload = (await response.json()) as OpenRouterModelResponse
        const models = (payload.data ?? [])
          .filter((model): model is NonNullable<typeof payload.data>[number] & { id: string } =>
            Boolean(model.id) && isTextChatOpenRouterModel(model),
          )
          .map<ChatModel>((model) => ({
            id: model.id,
            label: model.name ?? model.id,
            free: isFreeOpenRouterModel(model),
            supportsThinking: supportsOpenRouterThinking(model),
          }))
          .sort((a, b) => a.label.localeCompare(b.label))

        return new Response(JSON.stringify({ models }), {
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})

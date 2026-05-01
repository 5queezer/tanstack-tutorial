import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { createFileRoute } from '@tanstack/react-router'

import { getChatModel } from '../../lib/ai'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!process.env.OPENROUTER_API_KEY) {
          return new Response(
            JSON.stringify({ error: 'OPENROUTER_API_KEY not configured' }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        const body = await request.json()
        const { messages } = body
        const conversationId = body.conversationId ?? body.data?.conversationId
        const model = body.model ?? body.data?.model
        const showThinking = Boolean(body.showThinking ?? body.data?.showThinking)

        if (typeof model !== 'string' || !model) {
          return new Response(JSON.stringify({ error: 'No OpenRouter model selected' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const abortController = new AbortController()

        const stream = chat({
          adapter: getChatModel(model),
          messages,
          conversationId,
          abortController,
          modelOptions: showThinking
            ? {
                reasoning: {
                  effort: 'medium',
                  summary: 'auto',
                },
              }
            : undefined,
        })

        return toServerSentEventsResponse(stream, { abortController })
      },
    },
  },
})

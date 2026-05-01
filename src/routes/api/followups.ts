import { createFileRoute } from '@tanstack/react-router'

import { getOpenRouterModel } from '../../lib/openrouter-models'

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'

type FollowUpMessage = {
  role?: string
  content?: string
}

type OpenRouterFollowUpResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

export const Route = createFileRoute('/api/followups')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!process.env.OPENROUTER_API_KEY) {
          return json({ followUps: [] }, 200)
        }

        const body = (await request.json()) as { messages?: Array<FollowUpMessage>; model?: string }
        const model = typeof body.model === 'string' ? body.model : undefined

        if (!model || !(await getOpenRouterModel(model))) {
          return json({ followUps: [] }, 200)
        }

        const messages = (body.messages ?? [])
          .filter((message) => message.role && message.content)
          .slice(-8)

        if (messages.length < 2) {
          return json({ followUps: [] }, 200)
        }

        try {
          const response = await fetch(OPENROUTER_CHAT_URL, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? 'http://localhost:3000',
              'X-Title': process.env.OPENROUTER_APP_NAME ?? 'TanStack Tutorial',
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: 'system',
                  content:
                    'Generate 3 short useful follow-up questions from the conversation. Avoid filler/repetition. Return only JSON: {"followUps":["..."]}.',
                },
                {
                  role: 'user',
                  content: messages.map((message) => `${message.role}: ${message.content}`).join('\n\n'),
                },
              ],
              temperature: 0.5,
              max_tokens: 180,
              response_format: { type: 'json_object' },
            }),
            signal: AbortSignal.timeout(12e3),
          })

          if (!response.ok) {
            return json({ followUps: [] }, 200)
          }

          const payload = (await response.json()) as OpenRouterFollowUpResponse
          const content = payload.choices?.[0]?.message?.content ?? ''
          const followUps = parseFollowUps(content)

          return json({ followUps }, 200)
        } catch {
          return json({ followUps: [] }, 200)
        }
      },
    },
  },
})

function parseFollowUps(content: string) {
  try {
    const parsed = JSON.parse(content) as { followUps?: unknown }
    if (!Array.isArray(parsed.followUps)) return []

    return parsed.followUps
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 3)
  } catch {
    return []
  }
}

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

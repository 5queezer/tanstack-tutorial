import { createFileRoute } from '@tanstack/react-router'

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
      async POST({ request }) {
        if (!process.env.OPENROUTER_API_KEY) {
          return json({ followUps: [] })
        }

        const body = (await request.json()) as { messages?: Array<FollowUpMessage>; model?: string }

        if (typeof body.model !== 'string') {
          return json({ followUps: [] })
        }

        const messages = (body.messages ?? []).slice(-8)

        try {
          const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: body.model,
              messages: [
                {
                  role: 'system',
                  content:
                    'Return JSON with 3 short follow-up questions: {"followUps":["..."]}.',
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

          const payload = (await response.json()) as OpenRouterFollowUpResponse
          const content = payload.choices?.[0]?.message?.content ?? ''
          const followUps = parseFollowUps(content)

          return json({ followUps })
        } catch {
          return json({ followUps: [] })
        }
      },
    },
  },
})

function parseFollowUps(content: string) {
  try {
    return (JSON.parse(content) as { followUps: Array<string> }).followUps.slice(0, 3)
  } catch {
    return []
  }
}

function json(data: unknown) {
  return new Response(JSON.stringify(data))
}

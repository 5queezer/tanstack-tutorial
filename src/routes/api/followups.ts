import { createFileRoute } from '@tanstack/react-router'
import { createLangfuseTrace, finishLangfuseObservation, flushLangfuseSafely } from '../../lib/langfuse-tracing.ts'

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

        const langfuseTrace = createLangfuseTrace({
          name: 'api.followups',
          model: body.model,
          input: messages,
          metadata: { messageCount: messages.length },
        })

        try {
          const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: body.model,
              messages: createFollowUpMessages(messages),
              max_tokens: 180,
              response_format: { type: 'json_object' },
            }),
            signal: AbortSignal.timeout(12e3),
          })

          const payload = (await response.json()) as OpenRouterFollowUpResponse
          const content = payload.choices?.[0]?.message?.content ?? ''
          const followUps = parseFollowUps(content)
          finishLangfuseObservation(langfuseTrace?.observation, {
            status: 'success',
            startedAt: langfuseTrace?.startedAt,
            output: content,
            metadata: { followUpCount: followUps.length },
          })
          void flushLangfuseSafely()

          return json({ followUps })
        } catch (error) {
          finishLangfuseObservation(langfuseTrace?.observation, {
            status: 'error',
            startedAt: langfuseTrace?.startedAt,
            error,
          })
          void flushLangfuseSafely()
          return json({ followUps: [] })
        }
      },
    },
  },
})

export function createFollowUpMessages(messages: Array<FollowUpMessage>) {
  return [
    {
      role: 'system' as const,
      content: 'Return JSON only with exactly 3 short follow-up questions: {"followUps":["..."]}. Base every question on the actual conversation, especially the latest user request and assistant answer. Make questions specific, relevant, and useful next steps. Do not suggest generic prompts, unrelated topics, or actions not implied by the conversation.',
    },
    {
      role: 'user' as const,
      content: `Actual conversation:\n${messages.map((message) => `${message.role}: ${message.content}`).join('\n\n')}\n\nPropose relevant follow-up questions for this exact conversation.`,
    },
  ]
}

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

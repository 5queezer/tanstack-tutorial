import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { createFileRoute } from '@tanstack/react-router'
import type { StreamChunk } from '@tanstack/ai'

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

        const stream = withOpenRouterErrorMetadata(chat({
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
        }))

        return toServerSentEventsResponse(stream, { abortController })
      },
    },
  },
})

async function* withOpenRouterErrorMetadata(
  stream: AsyncIterable<StreamChunk>,
): AsyncIterable<StreamChunk> {
  try {
    yield* stream
  } catch (error) {
    const formatted = formatOpenRouterError(error)

    yield {
      type: 'RUN_ERROR',
      timestamp: Date.now(),
      message: formatted.message,
      code: formatted.code,
      error: {
        message: formatted.message,
        code: formatted.code,
      },
    } as StreamChunk
  }
}

function formatOpenRouterError(error: unknown) {
  const status = getErrorNumber(error, 'status') ?? getErrorNumber(error, 'code')
  const nestedError = getErrorRecord(error, 'error')
  const metadata = getErrorRecord(nestedError, 'metadata')
  const raw = getErrorString(metadata, 'raw')
  const providerName = getErrorString(metadata, 'provider_name')
  const message = raw
    ? `${providerName ? `${providerName}: ` : ''}${raw}`
    : error instanceof Error
      ? error.message
      : 'Unknown OpenRouter error'

  return {
    message: status ? `${status} ${message}` : message,
    code: status ? String(status) : undefined,
  }
}

function getErrorRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined

  const field = (value as Record<string, unknown>)[key]
  return field && typeof field === 'object' ? (field as Record<string, unknown>) : undefined
}

function getErrorString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object') return undefined

  const field = (value as Record<string, unknown>)[key]
  return typeof field === 'string' && field.length > 0 ? field : undefined
}

function getErrorNumber(value: unknown, key: string): number | undefined {
  if (!value || typeof value !== 'object') return undefined

  const field = (value as Record<string, unknown>)[key]
  return typeof field === 'number' ? field : undefined
}

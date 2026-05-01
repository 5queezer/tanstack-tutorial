import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { createFileRoute } from '@tanstack/react-router'
import type { StreamChunk } from '@tanstack/ai'

import { getChatModel } from '../../lib/ai'
import { getOpenRouterModel } from '../../lib/openrouter-models'

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
        const selectedModel = await getOpenRouterModel(model)

        if (!selectedModel) {
          return new Response(JSON.stringify({ error: `Unsupported OpenRouter model: ${model}` }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const enableThinking = showThinking && Boolean(selectedModel.supportsThinking)
        const abortController = new AbortController()
        const errorCapture = createOpenRouterErrorCaptureLogger()

        const stream = withOpenRouterErrorMetadata(chat({
          adapter: getChatModel(model),
          messages,
          conversationId,
          abortController,
          debug: {
            provider: false,
            output: false,
            middleware: false,
            tools: false,
            agentLoop: false,
            config: false,
            request: false,
            errors: true,
            logger: errorCapture.logger,
          },
          modelOptions: enableThinking
            ? {
                reasoning: {
                  effort: 'medium',
                  max_tokens: 1024,
                  exclude: false,
                },
              }
            : undefined,
        }), errorCapture)

        return toServerSentEventsResponse(stream, { abortController })
      },
    },
  },
})

async function* withOpenRouterErrorMetadata(
  stream: AsyncIterable<StreamChunk>,
  errorCapture: ReturnType<typeof createOpenRouterErrorCaptureLogger>,
): AsyncIterable<StreamChunk> {
  try {
    for await (const chunk of stream) {
      if (chunk.type === 'RUN_ERROR') {
        yield enrichRunErrorChunk(chunk, errorCapture.lastError)
        continue
      }

      yield chunk
    }
  } catch (error) {
    yield createRunErrorChunk(formatOpenRouterError(errorCapture.lastError ?? error))
  }
}

function enrichRunErrorChunk(chunk: StreamChunk, capturedError: unknown): StreamChunk {
  if (!capturedError) return chunk

  const formatted = formatOpenRouterError(capturedError)
  return {
    ...chunk,
    message: formatted.message,
    code: formatted.code,
    error: {
      message: formatted.message,
      code: formatted.code,
    },
  } as StreamChunk
}

function createRunErrorChunk(formatted: { message: string; code?: string }): StreamChunk {
  return {
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

function createOpenRouterErrorCaptureLogger() {
  const capture = {
    lastError: undefined as unknown,
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: (_message: string, meta?: Record<string, unknown>) => {
        if (meta?.error) {
          capture.lastError = meta.error
        }
      },
    },
  }

  return capture
}

function formatOpenRouterError(error: unknown) {
  const payload = getOpenRouterErrorPayload(error)
  const metadata = getErrorRecord(payload, 'metadata')
  const status =
    getErrorNumber(error, 'status') ??
    getErrorNumber(payload, 'code') ??
    getErrorNumber(error, 'code')
  const raw = getErrorString(metadata, 'raw')
  const providerName = getErrorString(metadata, 'provider_name')
  const fallbackMessage = getErrorString(payload, 'message')
  const message = raw
    ? `${providerName ? `${providerName}: ` : ''}${raw}`
    : fallbackMessage ?? (error instanceof Error ? error.message : 'Unknown OpenRouter error')

  return {
    message: status ? `${status} ${message}` : message,
    code: status ? String(status) : undefined,
  }
}

function getOpenRouterErrorPayload(error: unknown): Record<string, unknown> | undefined {
  const directPayload = getErrorRecord(error, 'error')
  if (directPayload) return directPayload

  const response = getErrorRecord(error, 'response')
  const body = getErrorString(response, 'body$') ?? getErrorString(error, 'body$')
  if (!body) return undefined

  try {
    const parsed = JSON.parse(body) as unknown
    return getErrorRecord(parsed, 'error')
  } catch {
    return undefined
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

import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { createFileRoute } from '@tanstack/react-router'
import type { StreamChunk } from '@tanstack/ai'

import { getChatModel } from '../../lib/ai'
import { getOpenRouterModel } from '../../lib/openrouter-models'
import { serverTools } from '../../lib/tools'

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
        const selectedModel = showThinking ? await getOpenRouterModel(model) : undefined
        const enableThinking = showThinking && Boolean(selectedModel?.supportsThinking)
        const abortController = new AbortController()
        const errorCapture = createOpenRouterErrorCaptureLogger()

        const stream = withOpenRouterErrorMetadata(chat({
          adapter: getChatModel(model),
          messages,
          conversationId,
          abortController,
          systemPrompts: [
            'Helpful assistant. Tools: get_weather weather, get_stock_quote stocks/tickers, brave_web_search current/recent/docs/web. Missing/ambiguous search: call request_search_query then brave_web_search. Say weather/stock data is demo when relevant. Cite Brave URLs.',
          ],
          tools: serverTools,
          debug: {
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
  let sawFirstToken = false
  let accumulatedContent = ''

  yield createStatusEvent('Model ready')
  yield createStatusEvent('Request sent')

  try {
    for await (const chunk of stream) {
      if (chunk.type === 'RUN_STARTED') {
        yield createStatusEvent('Run started')
      }

      if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
        accumulatedContent += chunk.delta ?? ''
        if (!sawFirstToken) {
          sawFirstToken = true
          yield createStatusEvent('First token')
        }
      }

      if (chunk.type === 'RUN_ERROR') {
        yield createStatusEvent('Error')
        yield enrichRunErrorChunk(chunk, errorCapture.lastError)
        continue
      }

      if (chunk.type === 'RUN_FINISHED') {
        yield createStatusEvent('Complete')
        yield {
          type: 'CUSTOM',
          name: 'f',
          value: { followUps: createServerFollowUps(accumulatedContent) },
        } as StreamChunk
      }

      yield chunk
    }
  } catch (error) {
    yield createStatusEvent('Error')
    yield createRunErrorChunk(formatOpenRouterError(errorCapture.lastError ?? error))
  }
}

function createServerFollowUps(assistantText: string) {
  const text = assistantText.toLowerCase()

  if (text.includes('weather')) {
    return ['Compare another city?', 'What should I wear?', 'Do I need an umbrella?']
  }

  if (text.includes('stock') || text.includes('price') || text.includes('market')) {
    return ['Compare another ticker?', 'What are the risks?', 'Show recent company news']
  }

  if (text.includes('search') || text.includes('source') || text.includes('http')) {
    return ['Open the top source', 'Search newer results', 'Summarize sources as a table']
  }

  return ['Give a concrete example?', 'Turn that into steps?', 'What should I ask next?']
}

function createStatusEvent(label: string): StreamChunk {
  return {
    type: 'CUSTOM',
    name: 's',
    value: { label },
  } as StreamChunk
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

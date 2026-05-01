import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { createFileRoute } from '@tanstack/react-router'
import type { StreamChunk } from '@tanstack/ai'

import { getChatModel } from '../../lib/ai'
import { getOpenRouterModel } from '../../lib/openrouter-models'
import { serverTools } from '../../lib/tools'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      async POST({ request }) {
        if (!process.env.OPENROUTER_API_KEY) {
          return new Response(
            JSON.stringify({ error: 'OPENROUTER_API_KEY missing' }),
            { status: 500 },
          )
        }

        const body = await request.json()
        const { messages } = body
        const conversationId = body.conversationId ?? body.data?.conversationId
        const model = body.model ?? body.data?.model
        const showThinking = !!(body.showThinking ?? body.data?.showThinking)

        if (typeof model !== 'string' || !model) {
          return new Response(JSON.stringify({ error: 'No model selected' }), { status: 400 })
        }
        const selectedModel = showThinking ? await getOpenRouterModel(model) : undefined
        const enableThinking = showThinking && !!selectedModel?.supportsThinking
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
  let accumulatedContent = ''

  try {
    for await (const chunk of stream) {
      if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
        accumulatedContent += chunk.delta

      }

      if (chunk.type === 'RUN_ERROR') {
        yield errorCapture.lastError
          ? {
              ...chunk,
              message: formatOpenRouterError(errorCapture.lastError),
            } as StreamChunk
          : chunk
        continue
      }

      if (chunk.type === 'RUN_FINISHED') {
        yield {
          type: 'CUSTOM',
          value: createServerFollowUps(accumulatedContent),
        } as StreamChunk
      }

      yield chunk
    }
  } catch (error) {
    yield {
      type: 'RUN_ERROR',
      message: formatOpenRouterError(errorCapture.lastError ?? error),
    } as StreamChunk
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

function createOpenRouterErrorCaptureLogger() {
  const capture = {
    lastError: undefined as unknown,
    logger: {
      debug() {},
      info() {},
      warn() {},
      error(_message: string, meta?: Record<string, unknown>) {
        capture.lastError = meta?.error ?? capture.lastError
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
  const fallbackMessage = getErrorString(payload, 'message')
  const message = raw ?? fallbackMessage ?? (error instanceof Error ? error.message : 'OpenRouter error')

  return status ? `${status} ${message}` : message
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
  return typeof field === 'string' ? field : undefined
}

function getErrorNumber(value: unknown, key: string): number | undefined {
  if (!value || typeof value !== 'object') return undefined

  const field = (value as Record<string, unknown>)[key]
  return typeof field === 'number' ? field : undefined
}

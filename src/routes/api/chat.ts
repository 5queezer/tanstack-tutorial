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
          systemPrompts: [
            'You are a helpful assistant. Tools: get_weather for weather, get_stock_quote for stocks/tickers, brave_web_search for current/recent/docs/web-search questions. If a search query is missing or ambiguous, call request_search_query, then brave_web_search. Say weather/stock data is demo data when relevant. Cite Brave URLs.',
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
        }), errorCapture, {
          model,
          thinking: enableThinking,
        })

        return toServerSentEventsResponse(stream, { abortController })
      },
    },
  },
})

async function* withOpenRouterErrorMetadata(
  stream: AsyncIterable<StreamChunk>,
  errorCapture: ReturnType<typeof createOpenRouterErrorCaptureLogger>,
  context: { model: string; thinking: boolean },
): AsyncIterable<StreamChunk> {
  let sawFirstToken = false
  let accumulatedContent = ''

  yield createStatusEvent('Model validated', 15, context)
  yield createStatusEvent('Request sent to OpenRouter', 35, context)

  try {
    for await (const chunk of stream) {
      if (chunk.type === 'RUN_STARTED') {
        yield createStatusEvent('AG-UI run started', 50, context)
      }

      if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
        accumulatedContent += chunk.delta ?? ''
        if (!sawFirstToken) {
          sawFirstToken = true
          yield createStatusEvent('First token received', 70, context)
        }
      }

      if (chunk.type === 'RUN_ERROR') {
        yield createStatusEvent('Provider error', 100, context)
        yield enrichRunErrorChunk(chunk, errorCapture.lastError)
        continue
      }

      if (chunk.type === 'RUN_FINISHED') {
        yield createStatusEvent('Run complete', 100, context)
        yield createFollowUpsEvent(createServerFollowUps(accumulatedContent))
      }

      yield chunk
    }
  } catch (error) {
    yield createStatusEvent('Provider error', 100, context)
    yield createRunErrorChunk(formatOpenRouterError(errorCapture.lastError ?? error))
  }
}

function createFollowUpsEvent(followUps: Array<string>): StreamChunk {
  return {
    type: 'CUSTOM',
    name: 'f',
    timestamp: Date.now(),
    value: { followUps },
  } as StreamChunk
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

function createStatusEvent(
  label: string,
  progress: number,
  context: { model: string; thinking: boolean },
): StreamChunk {
  return {
    type: 'CUSTOM',
    name: 's',
    timestamp: Date.now(),
    value: {
      label,
      progress,
      model: context.model,
      thinking: context.thinking,
    },
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

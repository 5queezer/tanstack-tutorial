import { Langfuse } from 'langfuse'

export type LangfuseCaptureMode = 'metadata' | 'full'
export type LangfuseTerminalStatus = 'success' | 'error' | 'aborted'

export type LangfuseConfig = {
  enabled: boolean
  publicKey?: string
  secretKey?: string
  baseUrl?: string
  captureMode: LangfuseCaptureMode
}

type LangfuseLike = {
  trace?: (body: Record<string, unknown>) => LangfuseTraceLike
  flushAsync?: () => Promise<void>
}

type LangfuseTraceLike = {
  generation?: (body: Record<string, unknown>) => LangfuseObservationLike
  span?: (body: Record<string, unknown>) => LangfuseObservationLike
  update?: (body: Record<string, unknown>) => unknown
}

type LangfuseObservationLike = {
  end?: (body?: Record<string, unknown>) => unknown
  update?: (body: Record<string, unknown>) => unknown
}

export type LangfuseTraceHandle = {
  trace: LangfuseTraceLike
  observation: LangfuseObservationLike
  startedAt: number
  captureMode: LangfuseCaptureMode
}

let client: LangfuseLike | undefined
let testClient: LangfuseLike | undefined
let testConfig: LangfuseConfig | undefined

export function buildLangfuseConfig(env: NodeJS.ProcessEnv = process.env): LangfuseConfig {
  const publicKey = nonBlank(env.LANGFUSE_PUBLIC_KEY)
  const secretKey = nonBlank(env.LANGFUSE_SECRET_KEY)
  const baseUrl = nonBlank(env.LANGFUSE_BASEURL)
  const captureMode = parseCaptureMode(env.LANGFUSE_CAPTURE_MODE)

  return {
    enabled: !!(publicKey && secretKey && baseUrl),
    publicKey,
    secretKey,
    baseUrl,
    captureMode,
  }
}

export function parseCaptureMode(value: unknown): LangfuseCaptureMode {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return normalized === 'full' ? 'full' : 'metadata'
}

export function capturePayload(mode: LangfuseCaptureMode, payload: unknown) {
  return mode === 'full' ? payload : undefined
}

export function createSafeErrorSummary(error: unknown) {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : undefined
  const rawMessage = error instanceof Error ? error.message : String(error)
  const status = numberField(record, 'status') ?? numberField(record, 'code')

  return {
    name: error instanceof Error ? error.name : 'UnknownError',
    message: rawMessage.replace(/\s+/g, ' ').trim().slice(0, 200),
    ...(status === undefined ? {} : { status }),
  }
}

export function createLangfuseTrace(input: {
  name: string
  model?: string
  conversationId?: string
  metadata?: Record<string, unknown>
  input?: unknown
}): LangfuseTraceHandle | undefined {
  return safely(() => {
    const activeClient = getLangfuseClient()
    if (!activeClient?.trace) return undefined

    const config = getActiveConfig()
    const trace = activeClient.trace({
      name: input.name,
      sessionId: input.conversationId,
      metadata: compactObject({
        route: input.name,
        model: input.model,
        captureMode: config.captureMode,
        ...input.metadata,
      }),
      input: capturePayload(config.captureMode, input.input),
    })
    const observation = trace.generation?.({
      name: input.name,
      model: input.model,
      input: capturePayload(config.captureMode, input.input),
      metadata: compactObject({ status: 'started', route: input.name }),
    }) ?? trace.span?.({
      name: input.name,
      input: capturePayload(config.captureMode, input.input),
      metadata: compactObject({ status: 'started', route: input.name, model: input.model }),
    })

    if (!observation) return undefined
    return { trace, observation, startedAt: Date.now(), captureMode: config.captureMode }
  })
}

export function finishLangfuseObservation(
  observation: LangfuseObservationLike | undefined,
  input: {
    status: LangfuseTerminalStatus
    startedAt?: number
    output?: unknown
    error?: unknown
    metadata?: Record<string, unknown>
  },
) {
  safely(() => {
    if (!observation?.end) return
    const config = getActiveConfig()
    observation.end({
      output: capturePayload(config.captureMode, input.output),
      metadata: compactObject({
        ...input.metadata,
        status: input.status,
        durationMs: input.startedAt ? Date.now() - input.startedAt : undefined,
        error: input.error ? createSafeErrorSummary(input.error) : undefined,
      }),
    })
  })
}

export async function traceToolCall<T>(toolName: string, args: unknown, fn: () => Promise<T>): Promise<T> {
  const startedAt = Date.now()
  const config = getActiveConfig()
  const activeClient = getLangfuseClient()
  const trace = safely(() => activeClient?.trace?.({
    name: `tool.${toolName}`,
    metadata: { toolName, captureMode: config.captureMode },
    input: capturePayload(config.captureMode, args),
  }))
  const span = safely(() => trace?.span?.({
    name: toolName,
    input: capturePayload(config.captureMode, args),
    metadata: { status: 'started', toolName },
  }))

  try {
    const output = await fn()
    finishLangfuseObservation(span, {
      status: 'success',
      startedAt,
      output,
      metadata: { toolName },
    })
    void flushLangfuseSafely()
    return output
  } catch (error) {
    finishLangfuseObservation(span, {
      status: 'error',
      startedAt,
      error,
      metadata: { toolName },
    })
    void flushLangfuseSafely()
    throw error
  }
}

export async function flushLangfuseSafely(timeoutMs = 1500): Promise<void> {
  const activeClient = getLangfuseClient()
  if (!activeClient?.flushAsync) return

  try {
    const flushing = activeClient.flushAsync().catch(() => {})
    await Promise.race([
      flushing,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ])
  } catch {
    // Langfuse observability must never affect request behavior.
  }
}

export function setLangfuseClientForTests(fakeClient: LangfuseLike, env?: NodeJS.ProcessEnv) {
  testClient = fakeClient
  testConfig = env ? buildLangfuseConfig(env) : {
    enabled: true,
    captureMode: 'metadata',
  }
}

export function resetLangfuseForTests() {
  testClient = undefined
  testConfig = undefined
  client = undefined
}

function getLangfuseClient(): LangfuseLike | undefined {
  if (testClient) return testClient

  const config = getActiveConfig()
  if (!config.enabled) return undefined

  client ??= new Langfuse({
    publicKey: config.publicKey,
    secretKey: config.secretKey,
    baseUrl: config.baseUrl,
  })
  return client
}

function getActiveConfig() {
  return testConfig ?? buildLangfuseConfig()
}

function nonBlank(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function numberField(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key]
  return typeof value === 'number' ? value : undefined
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T
}

function safely<T>(fn: () => T): T | undefined {
  try {
    return fn()
  } catch {
    return undefined
  }
}

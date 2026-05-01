import {
  isFreeOpenRouterModel,
  isTextChatOpenRouterModel,
  supportsOpenRouterThinking,
  type ChatModel,
  type OpenRouterModelResponse,
} from './models'

const MODEL_CACHE_TTL_MS = 6e5

let cachedModels: Array<ChatModel> | undefined
let cachedAt = 0

export async function getOpenRouterModels() {
  const now = Date.now()

  if (cachedModels && now - cachedAt < MODEL_CACHE_TTL_MS) {
    return cachedModels
  }

  const response = await fetch('https://openrouter.ai/api/v1/models', {
    headers: process.env.OPENROUTER_API_KEY
      ? { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` }
      : undefined,
    signal: AbortSignal.timeout(1e4),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch OpenRouter models: ${response.status} ${response.statusText}`)
  }

  const payload = (await response.json()) as OpenRouterModelResponse
  const models = (payload.data ?? [])
    .filter((model): model is NonNullable<typeof payload.data>[number] & { id: string } =>
      Boolean(model.id) && isTextChatOpenRouterModel(model),
    )
    .map<ChatModel>((model) => ({
      id: model.id,
      label: model.name ?? model.id,
      free: isFreeOpenRouterModel(model),
      supportsThinking: supportsOpenRouterThinking(model),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))

  cachedModels = models
  cachedAt = now

  return models
}

export async function getOpenRouterModel(modelId: string) {
  const models = await getOpenRouterModels()
  return models.find((model) => model.id === modelId)
}

export type ChatModel = {
  id: string
  label: string
  free: boolean
  supportsThinking?: boolean
}

export type OpenRouterModelResponse = {
  data?: Array<{
    id?: string
    name?: string
    pricing?: {
      prompt?: string
      completion?: string
      request?: string
      image?: string
    }
    architecture?: {
      input_modalities?: Array<string>
      output_modalities?: Array<string>
      modality?: string
    }
    supported_parameters?: Array<string>
  }>
}

export function isFreeOpenRouterModel(model: { id?: string }) {
  // OpenRouter's zero-priced catalogue entries can still route to paid providers.
  // The explicit `:free` suffix is the reliable user-selectable free variant.
  return model.id?.endsWith(':free') ?? false
}

export function isTextChatOpenRouterModel(model: {
  architecture?: {
    input_modalities?: Array<string>
    output_modalities?: Array<string>
    modality?: string
  }
}) {
  const inputModalities = model.architecture?.input_modalities
  const outputModalities = model.architecture?.output_modalities
  const modality = model.architecture?.modality

  if (inputModalities?.length && !inputModalities.includes('text')) return false
  if (outputModalities?.length && !outputModalities.includes('text')) return false
  if (modality && !modality.includes('text')) return false

  return true
}

export function supportsOpenRouterThinking(model: {
  id?: string
  name?: string
  supported_parameters?: Array<string>
}) {
  const searchable = `${model.id ?? ''} ${model.name ?? ''}`.toLowerCase()

  return (
    model.supported_parameters?.includes('reasoning') ||
    model.supported_parameters?.includes('include_reasoning') ||
    model.supported_parameters?.includes('reasoning_effort') ||
    /(^|[/:\s-])(r1|o1|o3|o4)([/:\s-]|$)/.test(searchable) ||
    searchable.includes('reasoning') ||
    searchable.includes('thinking') ||
    searchable.includes('gpt-5') ||
    searchable.includes('claude') ||
    searchable.includes('gemini') ||
    searchable.includes('qwen3')
  )
}

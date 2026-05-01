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
  return !!model.id?.endsWith(':free')
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

  return !(
    (inputModalities?.length && !inputModalities.includes('text')) ||
    (outputModalities?.length && !outputModalities.includes('text')) ||
    (modality && !modality.includes('text'))
  )
}

export function supportsOpenRouterThinking(model: {
  id?: string
  name?: string
  supported_parameters?: Array<string>
}) {
  const searchable = `${model.id ?? ''} ${model.name ?? ''}`.toLowerCase()

  return model.supported_parameters?.some((parameter) => parameter.includes('reasoning')) ||
    ['reasoning', 'thinking', 'gpt-5', 'claude', 'gemini', 'qwen3'].some((term) => searchable.includes(term))
}

export const STORAGE_KEYS = {
  selectedModel: 'tanstack-chat:selected-model',
  freeOnly: 'tanstack-chat:free-only',
  showThinking: 'tanstack-chat:show-thinking',
  followUpMode: 'tanstack-chat:follow-up-mode',
} as const

export function readLocalStorage(key: string) {
  if (typeof window === 'undefined') return undefined

  return window.localStorage.getItem(key) ?? undefined
}

export function readLocalStorageBoolean(key: string, fallback = false) {
  const value = readLocalStorage(key)

  if (value === 'true') return true
  if (value === 'false') return false

  return fallback
}

export function writeLocalStorage(key: string, value: string | boolean) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(key, String(value))
}

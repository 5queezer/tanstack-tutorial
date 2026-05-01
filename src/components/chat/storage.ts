export const STORAGE_KEYS = {
  selectedModel: 'tc:model',
  freeOnly: 'tc:free',
  showThinking: 'tc:think',
  followUpMode: 'tc:followups',
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

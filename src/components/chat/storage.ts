export const STORAGE_KEYS = {
  selectedModel: 'tc:m',
  freeOnly: 'tc:f',
  showThinking: 'tc:t',
  followUpMode: 'tc:u',
} as const

export function readLocalStorage(key: string) {
  return localStorage.getItem(key) ?? undefined
}

export function readLocalStorageBoolean(key: string, fallback = false) {
  const value = readLocalStorage(key)

  if (value === 'true') return true
  if (value === 'false') return false

  return fallback
}

export function writeLocalStorage(key: string, value: string | boolean) {
  localStorage.setItem(key, String(value))
}

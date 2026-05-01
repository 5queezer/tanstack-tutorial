import type { AgUiStatusEvent } from './types'

export const thinkingDotKeyframes = `
@keyframes chat-dot-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
  40% { transform: translateY(-4px); opacity: 1; }
}
`

export function isStatusEventValue(value: unknown): value is Omit<AgUiStatusEvent, 'at'> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { label?: unknown }).label === 'string' &&
      typeof (value as { progress?: unknown }).progress === 'number',
  )
}

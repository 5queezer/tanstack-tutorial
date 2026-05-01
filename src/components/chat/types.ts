import type { ChatModel } from '../../lib/models'

export type UiChatModel = ChatModel & {
  supportsThinking?: boolean
}

export type ChatMessage = {
  role: string
  parts?: Array<{ type?: string; content?: string }>
}

export type AgUiStatusEvent = {
  label: string
  progress: number
  at: number
}

export type PendingSearchQueryRequest = {
  prompt: string
}

export type FollowUpMode = 'h' | 'm' | 'a' | 'o'

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
}


export type FollowUpMode = 'h' | 'm' | 'a' | 'o'

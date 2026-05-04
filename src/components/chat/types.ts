import type { ChatModel } from '../../lib/models'

export type UiChatModel = ChatModel & {
  supportsThinking?: boolean
}


export type FollowUpMode = 'h' | 'm' | 'a' | 'o'
export type { SubagentMode } from '../../lib/subagent-modes'

import type { ChatMessage } from './types'

export function getMessageText(message?: ChatMessage) {
  return message?.parts
    ?.filter((part) => part.type === 'text' && part.content)
    .map((part) => part.content)
    .join(' ')
    .trim() ?? ''
}

export function createFollowUps(userText = '', assistantText = '') {
  const cleanedUserText = userText.replace(/\s+/g, ' ').trim()
  const cleanedAssistantText = assistantText.replace(/\s+/g, ' ').trim()
  const tooShortForSpecificFollowUps = cleanedUserText.length < 12 || /^(hi|hello|hey|yo|sup|thanks|thank you)[!.?\s]*$/i.test(cleanedUserText)

  if (tooShortForSpecificFollowUps) {
    return [
      'What can you help me with?',
      'Give me a few example prompts',
      'Help me brainstorm an idea',
      'Explain something complicated simply',
    ]
  }

  const topic = cleanedUserText.length > 80 ? `${cleanedUserText.slice(0, 77)}...` : cleanedUserText
  const assistantMentionsSteps = /step|first|next|then|finally|start|begin/i.test(cleanedAssistantText)

  return [
    assistantMentionsSteps ? 'Can you turn that into a checklist?' : 'Can you give me a concrete example?',
    `Can you explain more about “${topic}”?`,
    'What are the trade-offs?',
    'What should I ask next?',
  ]
}

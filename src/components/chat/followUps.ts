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
  const tooShortForSpecificFollowUps = cleanedUserText.length < 12 || /^(hi|hello|hey|thanks|thank you)[!.?\s]*$/i.test(cleanedUserText)

  if (tooShortForSpecificFollowUps) {
    return [
      'What can you help with?',
      'Give example prompts',
      'Help me brainstorm',
      'Explain something simply',
    ]
  }

  const topic = cleanedUserText.length > 80 ? `${cleanedUserText.slice(0, 77)}...` : cleanedUserText
  const assistantMentionsSteps = /step|first|next|then|finally|start|begin/i.test(cleanedAssistantText)

  return [
    assistantMentionsSteps ? 'Turn that into a checklist?' : 'Give a concrete example?',
    `Explain more about “${topic}”?`,
    'What are the trade-offs?',
    'What should I ask next?',
  ]
}

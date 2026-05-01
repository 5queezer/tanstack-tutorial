import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { CheckIcon, ChevronDownIcon } from '@radix-ui/react-icons'
import * as ScrollArea from '@radix-ui/react-scroll-area'
import * as Select from '@radix-ui/react-select'
import * as Toggle from '@radix-ui/react-toggle'
import * as Tooltip from '@radix-ui/react-tooltip'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import type { ChatModel } from '../lib/models'

const thinkingDotKeyframes = `
@keyframes chat-dot-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
  40% { transform: translateY(-4px); opacity: 1; }
}
`

const STORAGE_KEYS = {
  selectedModel: 'tanstack-chat:selected-model',
  freeOnly: 'tanstack-chat:free-only',
  showThinking: 'tanstack-chat:show-thinking',
} as const

type UiChatModel = ChatModel & {
  supportsThinking?: boolean
}

type ChatMessage = {
  role: string
  parts?: Array<{ type?: string; content?: string }>
}

type AgUiStatusEvent = {
  label: string
  progress: number
  model?: string
  thinking?: boolean
  at: number
}

function getMessageText(message?: ChatMessage) {
  return message?.parts
    ?.filter((part) => part.type === 'text' && part.content)
    .map((part) => part.content)
    .join(' ')
    .trim() ?? ''
}

function readLocalStorage(key: string) {
  if (typeof window === 'undefined') return undefined

  return window.localStorage.getItem(key) ?? undefined
}

function readLocalStorageBoolean(key: string, fallback = false) {
  const value = readLocalStorage(key)

  if (value === 'true') return true
  if (value === 'false') return false

  return fallback
}

function writeLocalStorage(key: string, value: string | boolean) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(key, String(value))
}

function createFollowUps(userText = '', assistantText = '') {
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

function isStatusEventValue(value: unknown): value is Omit<AgUiStatusEvent, 'at'> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { label?: unknown }).label === 'string' &&
      typeof (value as { progress?: unknown }).progress === 'number',
  )
}

export function Chat() {
  const [input, setInput] = useState('')
  const [models, setModels] = useState<Array<UiChatModel>>([])
  const [modelsError, setModelsError] = useState<string | undefined>()
  const [selectedModel, setSelectedModel] = useState('')
  const [freeOnly, setFreeOnly] = useState(false)
  const [showThinking, setShowThinking] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [agUiStatuses, setAgUiStatuses] = useState<Array<AgUiStatusEvent>>([])
  const modelOptions = useMemo(
    () => models.filter((model) => !freeOnly || model.free),
    [freeOnly, models],
  )
  const selectedModelInfo = models.find((model) => model.id === selectedModel)
  const selectedModelLabel = selectedModelInfo?.label ?? 'Loading models...'
  const thinkingAvailable = Boolean(selectedModelInfo?.supportsThinking)
  const { messages, sendMessage, isLoading, error, stop } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    body: { model: selectedModel || undefined, showThinking: showThinking && thinkingAvailable },
    onCustomEvent: (eventName, value) => {
      if (eventName !== 'demo.status' || !isStatusEventValue(value)) return

      setAgUiStatuses((current) => [
        ...current.slice(-5),
        {
          ...value,
          at: Date.now(),
        },
      ])
    },
  })
  const latestAgUiStatus = agUiStatuses.at(-1)
  const followUps = useMemo(() => {
    if (isLoading || messages.length === 0) return []

    const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant')
    const lastAssistantText = getMessageText(lastAssistant)
    if (!lastAssistant || !lastAssistantText.trim()) return []

    const lastUserText = getMessageText(
      [...messages].reverse().find((message) => message.role === 'user'),
    )

    return createFollowUps(lastUserText, lastAssistantText)
  }, [isLoading, messages])

  useEffect(() => {
    setSelectedModel(readLocalStorage(STORAGE_KEYS.selectedModel) ?? '')
    setFreeOnly(readLocalStorageBoolean(STORAGE_KEYS.freeOnly))
    setShowThinking(readLocalStorageBoolean(STORAGE_KEYS.showThinking))
    setSettingsLoaded(true)
  }, [])

  useEffect(() => {
    if (!settingsLoaded) return

    let cancelled = false

    async function loadModels() {
      try {
        const response = await fetch('/api/models')

        if (!response.ok) {
          throw new Error('Failed to load OpenRouter models')
        }

        const { models: nextModels } = (await response.json()) as { models: Array<UiChatModel> }

        if (cancelled) return

        setModels(nextModels)
        setSelectedModel((current) => {
          const currentModel = nextModels.find((model) => model.id === current)
          if (currentModel && (!freeOnly || currentModel.free)) return current

          return (freeOnly ? nextModels.find((model) => model.free)?.id : undefined) ?? nextModels.find((model) => model.free)?.id ?? nextModels[0]?.id ?? ''
        })
      } catch (err) {
        if (!cancelled) {
          setModelsError(err instanceof Error ? err.message : 'Failed to load OpenRouter models')
        }
      }
    }

    loadModels()

    return () => {
      cancelled = true
    }
  }, [freeOnly, settingsLoaded])

  useEffect(() => {
    if (!thinkingAvailable) {
      setShowThinking(false)
    }
  }, [thinkingAvailable])

  useEffect(() => {
    if (settingsLoaded && selectedModel) {
      writeLocalStorage(STORAGE_KEYS.selectedModel, selectedModel)
    }
  }, [selectedModel, settingsLoaded])

  useEffect(() => {
    if (settingsLoaded) {
      writeLocalStorage(STORAGE_KEYS.freeOnly, freeOnly)
    }
  }, [freeOnly, settingsLoaded])

  useEffect(() => {
    if (settingsLoaded) {
      writeLocalStorage(STORAGE_KEYS.showThinking, showThinking)
    }
  }, [showThinking, settingsLoaded])

  function handleFreeOnlyChange(pressed: boolean) {
    setFreeOnly(pressed)

    if (pressed && !models.find((model) => model.id === selectedModel)?.free) {
      const nextModel = models.find((model) => model.free)
      setSelectedModel(nextModel?.id ?? '')
      setShowThinking((current) => current && Boolean(nextModel?.supportsThinking))
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()

    const text = input.trim()
    if (!text) return

    setAgUiStatuses([])
    sendMessage(text)
    setInput('')
  }

  function handleFollowUpClick(question: string) {
    if (isLoading) return
    setAgUiStatuses([])
    sendMessage(question)
  }

  return (
    <Tooltip.Provider delayDuration={200}>
      <style>{thinkingDotKeyframes}</style>
      <main
        style={{
          height: '100vh',
          maxWidth: 920,
          margin: '0 auto',
          padding: '1rem',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <header style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}>
          <h1 style={{ margin: 0 }}>Chat</h1>

          <div
            style={{
              display: 'flex',
              gap: '0.75rem',
              alignItems: 'end',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'grid', gap: 4, fontSize: 14 }}>
              <span>Model</span>
              <Select.Root
                value={selectedModel}
                onValueChange={(modelId) => {
                  setSelectedModel(modelId)
                  setShowThinking((current) => current && Boolean(models.find((model) => model.id === modelId)?.supportsThinking))
                }}
                disabled={isLoading || modelOptions.length === 0}
              >
                <Select.Trigger
                  aria-label="Model"
                  title={selectedModel}
                  style={{
                    display: 'inline-flex',
                    fontFamily: 'inherit',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    width: 'min(420px, calc(100vw - 2rem))',
                    padding: '0.55rem 0.7rem',
                    border: '1px solid #ccc',
                    borderRadius: 8,
                    background: '#fff',
                    cursor: isLoading || modelOptions.length === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Select.Value placeholder="Loading models...">{selectedModelLabel}</Select.Value>
                  <Select.Icon>
                    <ChevronDownIcon />
                  </Select.Icon>
                </Select.Trigger>

                <Select.Portal>
                  <Select.Content
                    position="popper"
                    sideOffset={6}
                    align="start"
                    style={{
                      zIndex: 10,
                      width: 'min(560px, calc(100vw - 2rem))',
                      overflow: 'hidden',
                      padding: 6,
                      border: '1px solid #ddd',
                      borderRadius: 10,
                      background: '#fff',
                      boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
                    }}
                  >
                    <Select.Viewport style={{ maxHeight: 340, overflowY: 'auto', padding: 2, fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
                      {modelOptions.map((model) => (
                        <Select.Item
                          key={model.id}
                          value={model.id}
                          style={{
                            position: 'relative',
                            display: 'flex',
                            alignItems: 'center',
                            width: '100%',
                            minHeight: 36,
                            boxSizing: 'border-box',
                            padding: '0.55rem 0.65rem 0.55rem 2rem',
                            borderRadius: 8,
                            cursor: 'pointer',
                            outline: 'none',
                            fontFamily: 'inherit',
                            fontSize: 14,
                          }}
                        >
                          <Select.ItemIndicator
                            style={{
                              position: 'absolute',
                              left: 10,
                              display: 'inline-flex',
                              alignItems: 'center',
                            }}
                          >
                            <CheckIcon />
                          </Select.ItemIndicator>
                          <Select.ItemText
                            style={{
                              display: 'block',
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontFamily: 'inherit',
                            }}
                          >
                            {model.label}{model.free ? ' (free)' : ''}
                          </Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>

            <Toggle.Root
              pressed={freeOnly}
              onPressedChange={handleFreeOnlyChange}
              disabled={isLoading || models.length === 0}
              aria-label="Show free models only"
              style={{
                fontFamily: 'inherit',
                padding: '0.55rem 0.75rem',
                border: '1px solid #ccc',
                borderRadius: 8,
                background: freeOnly ? '#111' : '#fff',
                color: freeOnly ? '#fff' : '#111',
                cursor: isLoading ? 'not-allowed' : 'pointer',
              }}
            >
              Free only
            </Toggle.Root>

            <Toggle.Root
              pressed={showThinking}
              onPressedChange={setShowThinking}
              disabled={isLoading || !thinkingAvailable}
              aria-label="Show model thinking"
              title={thinkingAvailable ? 'Show model thinking/reasoning when available' : 'Selected model does not advertise thinking support'}
              style={{
                fontFamily: 'inherit',
                padding: '0.55rem 0.75rem',
                border: '1px solid #ccc',
                borderRadius: 8,
                background: showThinking ? '#111' : '#fff',
                color: showThinking ? '#fff' : '#111',
                opacity: thinkingAvailable ? 1 : 0.55,
                cursor: isLoading || !thinkingAvailable ? 'not-allowed' : 'pointer',
              }}
            >
              Thinking
            </Toggle.Root>
          </div>

          {latestAgUiStatus ? (
            <section
              aria-label="AG-UI stream status"
              style={{
                display: 'grid',
                gap: '0.45rem',
                padding: '0.7rem 0.8rem',
                border: '1px solid #e4e4e4',
                borderRadius: 12,
                background: '#fafafa',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: 13 }}>
                <strong>AG-UI live</strong>
                <span style={{ color: '#666' }}>{latestAgUiStatus.label}</span>
              </div>
              <div style={{ height: 6, overflow: 'hidden', borderRadius: 999, background: '#e8e8e8' }}>
                <div
                  style={{
                    width: `${latestAgUiStatus.progress}%`,
                    height: '100%',
                    borderRadius: 999,
                    background: latestAgUiStatus.progress >= 100 && error ? 'crimson' : '#111',
                    transition: 'width 220ms ease',
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {agUiStatuses.map((status) => (
                  <span
                    key={`${status.at}-${status.label}`}
                    style={{
                      padding: '0.2rem 0.45rem',
                      borderRadius: 999,
                      background: '#eee',
                      color: '#555',
                      fontSize: 12,
                    }}
                  >
                    {status.label}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {modelsError ? <p style={{ color: 'crimson', margin: 0 }}>{modelsError}</p> : null}
        </header>

        <ScrollArea.Root
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            border: '1px solid #ddd',
            borderRadius: 14,
            marginBottom: '1rem',
            background: '#fff',
          }}
        >
          <ScrollArea.Viewport style={{ width: '100%', height: '100%' }}>
            <div style={{ display: 'grid', gap: '0.75rem', padding: '1rem' }}>
              {messages.length === 0 ? (
                <p style={{ margin: 0, color: '#666' }}>Ask something to start the conversation.</p>
              ) : (
                <>
                  {messages.map((message) => {
                    const isUser = message.role === 'user'

                    return (
                    <article
                      key={message.id}
                      style={{
                        display: 'flex',
                        justifyContent: isUser ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <div
                        style={{
                          maxWidth: '78%',
                          padding: '0.75rem 0.9rem',
                          borderRadius: 18,
                          borderBottomRightRadius: isUser ? 4 : 18,
                          borderBottomLeftRadius: isUser ? 18 : 4,
                          background: isUser ? '#111' : '#f2f2f2',
                          color: isUser ? '#fff' : '#111',
                          lineHeight: 1.4,
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {message.parts?.map((part, index) => {
                          if (part.type === 'thinking') {
                            if (!showThinking) return null

                            const hasTextAfterThinking = message.parts
                              .slice(index + 1)
                              .some((nextPart) => nextPart.type === 'text' && Boolean(nextPart.content))

                            return (
                              <details
                                key={index}
                                open={!hasTextAfterThinking}
                                style={{
                                  marginBottom: '0.5rem',
                                  color: isUser ? '#ddd' : '#555',
                                  fontSize: 13,
                                }}
                              >
                                <summary style={{ cursor: 'pointer' }}>Thinking</summary>
                                <pre
                                  style={{
                                    maxHeight: 160,
                                    overflow: 'auto',
                                    whiteSpace: 'pre-wrap',
                                    margin: '0.5rem 0 0',
                                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                  }}
                                >
                                  {part.content}
                                </pre>
                              </details>
                            )
                          }

                          if (part.type === 'text') {
                            return (
                              <ReactMarkdown
                                key={index}
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  p: ({ children }) => <p style={{ margin: '0 0 0.6rem' }}>{children}</p>,
                                  ul: ({ children }) => <ul style={{ margin: '0.4rem 0 0.7rem', paddingLeft: '1.25rem' }}>{children}</ul>,
                                  ol: ({ children }) => <ol style={{ margin: '0.4rem 0 0.7rem', paddingLeft: '1.25rem' }}>{children}</ol>,
                                  li: ({ children }) => <li style={{ margin: '0.2rem 0' }}>{children}</li>,
                                  code: ({ children }) => (
                                    <code
                                      style={{
                                        padding: '0.12rem 0.25rem',
                                        borderRadius: 4,
                                        background: isUser ? '#333' : '#e4e4e4',
                                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                        fontSize: '0.92em',
                                      }}
                                    >
                                      {children}
                                    </code>
                                  ),
                                  pre: ({ children }) => (
                                    <pre
                                      style={{
                                        overflowX: 'auto',
                                        margin: '0.5rem 0',
                                        padding: '0.65rem',
                                        borderRadius: 8,
                                        background: isUser ? '#333' : '#e4e4e4',
                                      }}
                                    >
                                      {children}
                                    </pre>
                                  ),
                                }}
                              >
                                {part.content}
                              </ReactMarkdown>
                            )
                          }

                          return null
                        })}
                      </div>
                    </article>
                    )
                  })}

                  {!isLoading && followUps.length > 0 ? (
                    <section
                      aria-label="Follow-up questions"
                      style={{
                        display: 'grid',
                        gap: '0.35rem',
                        justifySelf: 'stretch',
                        maxWidth: 760,
                        margin: '0.5rem 0 0.25rem',
                      }}
                    >
                      <h2 style={{ margin: '0 0 0.35rem', fontSize: 16 }}>Follow-ups</h2>
                      {followUps.map((question) => (
                        <button
                          key={question}
                          type="button"
                          onClick={() => handleFollowUpClick(question)}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '20px minmax(0, 1fr)',
                            gap: '0.5rem',
                            alignItems: 'center',
                            padding: '0.7rem 0',
                            border: 0,
                            borderTop: '1px solid #e7e7e7',
                            background: 'transparent',
                            color: '#222',
                            textAlign: 'left',
                            font: 'inherit',
                            cursor: 'pointer',
                          }}
                        >
                          <span aria-hidden="true" style={{ color: '#777' }}>↳</span>
                          <span>{question}</span>
                        </button>
                      ))}
                    </section>
                  ) : null}

                  {isLoading ? (
                    <article style={{ display: 'flex', justifyContent: 'flex-start' }}>
                      <div
                        aria-label="Assistant is typing"
                        style={{
                          display: 'inline-flex',
                          gap: 5,
                          alignItems: 'center',
                          padding: '0.8rem 0.95rem',
                          borderRadius: 18,
                          borderBottomLeftRadius: 4,
                          background: '#f2f2f2',
                        }}
                      >
                        {[0, 1, 2].map((dot) => (
                          <span
                            key={dot}
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: 999,
                              background: '#555',
                              animation: 'chat-dot-bounce 1.1s infinite ease-in-out',
                              animationDelay: `${dot * 0.16}s`,
                            }}
                          />
                        ))}
                      </div>
                    </article>
                  ) : null}
                </>
              )}
            </div>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar
            orientation="vertical"
            style={{ display: 'flex', padding: 3, width: 10, background: '#f3f3f3' }}
          >
            <ScrollArea.Thumb style={{ flex: 1, borderRadius: 999, background: '#bbb' }} />
          </ScrollArea.Scrollbar>
          <ScrollArea.Corner />
        </ScrollArea.Root>

        {error ? <p style={{ color: 'crimson', marginTop: 0 }}>{String(error)}</p> : null}

        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask something..."
            aria-label="Chat message"
            style={{ flex: 1, padding: '0.75rem', border: '1px solid #ccc', borderRadius: 8, fontFamily: 'inherit' }}
          />

          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                type={isLoading ? 'button' : 'submit'}
                onClick={isLoading ? stop : undefined}
                disabled={!isLoading && !selectedModel}
                style={{
                  fontFamily: 'inherit',
                  padding: '0.75rem 1rem',
                  border: 0,
                  borderRadius: 8,
                  color: '#fff',
                  background: isLoading ? '#888' : '#111',
                  cursor: 'pointer',
                }}
              >
                {isLoading ? 'Stop' : 'Send'}
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                sideOffset={6}
                style={{
                  padding: '0.4rem 0.6rem',
                  borderRadius: 6,
                  color: '#fff',
                  background: '#111',
                  fontSize: 12,
                }}
              >
                {isLoading ? 'Stop the response' : 'Send your message'}
                <Tooltip.Arrow style={{ fill: '#111' }} />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </form>
      </main>
    </Tooltip.Provider>
  )
}

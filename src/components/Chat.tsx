import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { useEffect, useMemo, useRef, useState, type SubmitEventHandler } from 'react'
import { createFollowUps, getMessageText } from './chat/followUps'
import { readLocalStorage, readLocalStorageBoolean, STORAGE_KEYS, writeLocalStorage } from './chat/storage'
import { AgUiStatusPanel } from './chat/AgUiStatusPanel'
import { FollowUps } from './chat/FollowUps'
import { InteractiveSearchPrompt } from './chat/InteractiveSearchPrompt'
import { MarkdownContent } from './chat/MarkdownContent'
import { ToolWidget } from './chat/ToolWidget'
import { TypingIndicator } from './chat/TypingIndicator'
import type { AgUiStatusEvent, FollowUpMode, PendingSearchQueryRequest, UiChatModel } from './chat/types'
import { requestSearchQueryDef } from '../lib/request-search-tool'

const thinkingDotKeyframes = `
@keyframes chat-dot-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
  40% { transform: translateY(-4px); opacity: 1; }
}
`
function isFollowUpMode(value: string | undefined): value is FollowUpMode {
  return value === 'h' || value === 'm' || value === 'a' || value === 'o'
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
  const [followUpMode, setFollowUpMode] = useState<FollowUpMode>('h')
  const [modelFollowUps, setModelFollowUps] = useState<Array<string>>([])
  const [agUiFollowUps, setAgUiFollowUps] = useState<Array<string>>([])
  const [isLoadingFollowUps, setIsLoadingFollowUps] = useState(false)
  const followUpRequestKeyRef = useRef('')
  const [pendingSearchQuery, setPendingSearchQuery] = useState<PendingSearchQueryRequest | undefined>()
  const [interactiveSearchInput, setInteractiveSearchInput] = useState('')
  const searchQueryResolverRef = useRef<((result: { query: string }) => void) | undefined>(undefined)
  const modelOptions = models.filter((model) => !freeOnly || model.free)
  const selectedModelInfo = models.find((model) => model.id === selectedModel)
  const thinkingAvailable = Boolean(selectedModelInfo?.supportsThinking)
  const interactiveSearchTool = useMemo(
    () => requestSearchQueryDef.client((toolInput) => {
      const input = toolInput as { prompt?: string; suggestedQuery?: string }
      const suggestedQuery = input.suggestedQuery ?? ''

      setInteractiveSearchInput(suggestedQuery)
      setPendingSearchQuery({
        prompt: input.prompt ?? 'What should I search for?',
        suggestedQuery,
      })

      return new Promise<{ query: string }>((resolve) => {
        searchQueryResolverRef.current = resolve
      })
    }),
    [],
  )
  const { messages, sendMessage, isLoading, error, stop } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    body: { model: selectedModel || undefined, showThinking: showThinking && thinkingAvailable },
    tools: [interactiveSearchTool],
    onCustomEvent: (eventName, value) => {
      if (eventName === 'f') {
        setAgUiFollowUps((value as { followUps: Array<string> }).followUps)
        return
      }

      if (!['s', 't'].includes(eventName)) return

      setAgUiStatuses((current) => [
        ...current.slice(-5),
        {
          ...(value as Omit<AgUiStatusEvent, 'at'>),
          at: Date.now(),
        },
      ])
    },
  })
  const heuristicFollowUps = useMemo(() => {
    if (isLoading || messages.length === 0) return []

    const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant')
    const lastAssistantText = getMessageText(lastAssistant)
    if (!lastAssistant || !lastAssistantText.trim()) return []

    const lastUserText = getMessageText(
      [...messages].reverse().find((message) => message.role === 'user'),
    )

    return createFollowUps(lastUserText, lastAssistantText)
  }, [isLoading, messages])
  const followUps = followUpMode === 'o'
    ? []
    : followUpMode === 'm'
      ? modelFollowUps
      : followUpMode === 'a'
        ? agUiFollowUps
        : heuristicFollowUps

  useEffect(() => {
    setSelectedModel(readLocalStorage(STORAGE_KEYS.selectedModel) ?? '')
    setFreeOnly(readLocalStorageBoolean(STORAGE_KEYS.freeOnly))
    setShowThinking(readLocalStorageBoolean(STORAGE_KEYS.showThinking))
    const storedFollowUpMode = readLocalStorage(STORAGE_KEYS.followUpMode)
    setFollowUpMode(isFollowUpMode(storedFollowUpMode) ? storedFollowUpMode : 'h')
    setSettingsLoaded(true)
  }, [])

  useEffect(() => {
    if (!settingsLoaded) return

    let cancelled = false

    async function loadModels() {
      try {
        const response = await fetch('/api/models')

        if (!response.ok) {
          throw new Error('Model load failed')
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
          setModelsError(err instanceof Error ? err.message : 'Model load failed')
        }
      }
    }

    loadModels()

    return () => {
      cancelled = true
    }
  }, [settingsLoaded])

  useEffect(() => {
    if (!thinkingAvailable) {
      setShowThinking(false)
    }
  }, [thinkingAvailable])

  useEffect(() => {
    if (!settingsLoaded) return

    if (selectedModel) writeLocalStorage(STORAGE_KEYS.selectedModel, selectedModel)
    writeLocalStorage(STORAGE_KEYS.freeOnly, freeOnly)
    writeLocalStorage(STORAGE_KEYS.showThinking, showThinking)
    writeLocalStorage(STORAGE_KEYS.followUpMode, followUpMode)
  }, [selectedModel, freeOnly, showThinking, followUpMode, settingsLoaded])

  useEffect(() => {
    if (followUpMode !== 'm' || isLoading || !selectedModel || messages.length === 0) return

    const serializableMessages = messages
      .map((message) => ({ role: message.role, content: getMessageText(message) }))
      .filter((message) => message.content)

    const lastAssistant = [...serializableMessages].reverse().find((message) => message.role === 'assistant')
    if (!lastAssistant) return

    const requestKey = JSON.stringify({ selectedModel, serializableMessages })
    if (requestKey === followUpRequestKeyRef.current) return
    followUpRequestKeyRef.current = requestKey

    let cancelled = false
    setIsLoadingFollowUps(true)
    setModelFollowUps([])

    fetch('/api/followups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: selectedModel, messages: serializableMessages }),
    })
      .then((response) => (response.ok ? response.json() : { followUps: [] }))
      .then((payload: { followUps?: Array<string> }) => {
        if (!cancelled) {
          setModelFollowUps(Array.isArray(payload.followUps) ? payload.followUps : [])
        }
      })
      .catch(() => {
        if (!cancelled) {
          setModelFollowUps([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingFollowUps(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [followUpMode, isLoading, messages, selectedModel])

  function handleFreeOnlyChange(pressed: boolean) {
    setFreeOnly(pressed)

    if (pressed && !models.find((model) => model.id === selectedModel)?.free) {
      const nextModel = models.find((model) => model.free)
      setSelectedModel(nextModel?.id ?? '')
      setShowThinking((current) => current && Boolean(nextModel?.supportsThinking))
    }
  }

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()

    const text = input.trim()
    if (!text) return

    setAgUiStatuses([])
    setModelFollowUps([])
    setAgUiFollowUps([])
    sendMessage(text)
    setInput('')
  }

  function handleFollowUpClick(question: string) {
    if (isLoading) return
    setAgUiStatuses([])
    setModelFollowUps([])
    setAgUiFollowUps([])
    sendMessage(question)
  }

  const handleInteractiveSearchSubmit: SubmitEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()

    const query = interactiveSearchInput.trim()
    if (!query || !searchQueryResolverRef.current) return

    searchQueryResolverRef.current({ query })
    searchQueryResolverRef.current = undefined
    setPendingSearchQuery(undefined)
    setInteractiveSearchInput('')
  }

  return (
    <>
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
              <select
                aria-label="Model"
                value={selectedModel}
                onChange={(event) => {
                  const modelId = event.target.value
                  setSelectedModel(modelId)
                  setShowThinking((current) => current && Boolean(models.find((model) => model.id === modelId)?.supportsThinking))
                }}
                disabled={isLoading || modelOptions.length === 0}
                style={{
                  width: 'min(420px, calc(100vw - 2rem))',
                  height: 38,
                  padding: '0 0.65rem',
                  border: '1px solid #ccc',
                  borderRadius: 8,
                  background: '#fff',
                  fontFamily: 'inherit',
                }}
              >
                {modelOptions.length === 0 ? <option value="">Loading...</option> : null}
                {modelOptions.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}{model.free ? ' (free)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gap: 4, fontSize: 14 }}>
              <span>Follow-ups</span>
              <select
                value={followUpMode}
                onChange={(event) => setFollowUpMode(event.target.value as FollowUpMode)}
                disabled={isLoading}
                style={{
                  height: 38,
                  padding: '0 0.65rem',
                  border: '1px solid #ccc',
                  borderRadius: 8,
                  background: '#fff',
                  fontFamily: 'inherit',
                }}
              >
                <option value="h">Heuristic</option>
                <option value="m">Model</option>
                <option value="a">AG-UI</option>
                <option value="o">Off</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => handleFreeOnlyChange(!freeOnly)}
              disabled={isLoading || models.length === 0}
              aria-pressed={freeOnly}
              aria-label="Free models"
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
            </button>

            <button
              type="button"
              onClick={() => setShowThinking(!showThinking)}
              disabled={isLoading || !thinkingAvailable}
              aria-pressed={showThinking}
              aria-label="Thinking"
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
            </button>
          </div>

          <AgUiStatusPanel statuses={agUiStatuses} hasError={Boolean(error)} />

          {modelsError ? <p style={{ color: 'crimson', margin: 0 }}>{modelsError}</p> : null}
        </header>

        <section
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            border: '1px solid #ddd',
            borderRadius: 14,
            marginBottom: '1rem',
            background: '#fff',
          }}
        >
            <div style={{ display: 'grid', gap: '0.75rem', padding: '1rem' }}>
              {messages.length === 0 ? (
                <p style={{ margin: 0, color: '#666' }}>Ask something to start.</p>
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

                          if (part.type === 'tool-call') {
                            const toolName = 'name' in part ? String(part.name) : 'tool'
                            const toolInput = 'input' in part ? part.input : undefined
                            const toolOutput = 'output' in part ? part.output : undefined
                            const state = 'state' in part ? String(part.state) : 'running'

                            return (
                              <div
                                key={'id' in part ? String(part.id) : index}
                                style={{
                                  display: 'grid',
                                  gap: '0.35rem',
                                  margin: '0.25rem 0',
                                  padding: '0.65rem',
                                  borderRadius: 12,
                                  background: isUser ? '#2b2b2b' : '#e8f2ff',
                                  color: isUser ? '#fff' : '#111',
                                  fontSize: 13,
                                }}
                              >
                                <strong>{toolName === 'get_weather' ? 'Weather' : toolName === 'get_stock_quote' ? 'Stock' : toolName === 'brave_web_search' ? 'Search' : toolName === 'request_search_query' ? 'Search query' : toolName}</strong>
                                <span style={{ color: isUser ? '#ddd' : '#555' }}>{state}</span>
                                <ToolWidget toolName={toolName} input={toolInput} output={toolOutput} />
                              </div>
                            )
                          }

                          if (part.type === 'tool-result') {
                            return null
                          }

                          if (part.type === 'text') {
                            return (
                              <MarkdownContent key={index} content={part.content} isUser={isUser} />                            )
                          }

                          return null
                        })}
                      </div>
                    </article>
                    )
                  })}

                  <InteractiveSearchPrompt
                    request={pendingSearchQuery}
                    value={interactiveSearchInput}
                    onChange={setInteractiveSearchInput}
                    onSubmit={handleInteractiveSearchSubmit}
                  />

                  {!isLoading ? <FollowUps questions={followUps} onSelect={handleFollowUpClick} /> : null}
                  {!isLoading && followUpMode === 'm' && isLoadingFollowUps ? (
                    <p style={{ margin: '0.25rem 0', color: '#666' }}>Generating…</p>
                  ) : null}

                  {isLoading ? <TypingIndicator /> : null}
                </>
              )}
            </div>
        </section>

        {error ? <p style={{ color: 'crimson', marginTop: 0 }}>{String(error)}</p> : null}

        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask..."
            aria-label="Message"
            style={{ flex: 1, padding: '0.75rem', border: '1px solid #ccc', borderRadius: 8, fontFamily: 'inherit' }}
          />

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
        </form>
      </main>
    </>
  )
}

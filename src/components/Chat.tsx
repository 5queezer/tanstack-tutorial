import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { useEffect, useMemo, useRef, useState, type ReactNode, type SubmitEventHandler } from 'react'
import type { FollowUpMode, UiChatModel } from './chat/types'

function getMessageText(message?: { parts: Array<{ type?: string; content?: string }> }) {
  if (!message) return ''
  return message.parts
    .filter((part) => part.type === 'text' && part.content)
    .map((part) => part.content)
    .join(' ')
    .trim()
}

function createFollowUps(userText = '', assistantText = '') {
  const cleanedUserText = userText.trim()
  const tooShortForSpecificFollowUps = cleanedUserText.length < 12 || /^(hi|hello|hey|thanks|thank you)\W*$/i.test(cleanedUserText)

  if (tooShortForSpecificFollowUps) {
    return [
      'What can you help with?',
      'Give example prompts',
      'Help me brainstorm',
      'Explain something simply',
    ]
  }

  const topic = cleanedUserText.length > 80 ? `${cleanedUserText.slice(0, 77)}...` : cleanedUserText
  const assistantMentionsSteps = /step|first|next|then|finally|start|begin/i.test(assistantText)

  return [
    assistantMentionsSteps ? 'Turn that into a checklist?' : 'Give a concrete example?',
    `Explain more about “${topic}”?`,
    'What are the trade-offs?',
    'What should I ask next?',
  ]
}


const STORAGE_KEYS = {
  selectedModel: 'tc:m',
  freeOnly: 'tc:f',
  showThinking: 'tc:t',
  followUpMode: 'tc:u',
} as const


type MarkdownBlock =
  | { t: 'c'; c: string }
  | { t: 'l'; o: boolean; i: Array<string> }
  | { t: 'p'; c: string }

const linkPattern = /(`[^`]+`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g

function MarkdownContent({ content, isUser }: { content: string; isUser: boolean }) {
  return <>{parseBlocks(content).map((block, index) => renderBlock(block, isUser, index))}</>
}

function parseBlocks(content: string): Array<MarkdownBlock> {
  const lines = content.split('\n')
  const blocks: Array<MarkdownBlock> = []
  let paragraph: Array<string> = []

  function flushParagraph() {
    if (paragraph.length === 0) return
    blocks.push({ t: 'p', c: paragraph.join(' ') })
    paragraph = []
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      flushParagraph()
      const codeLines: Array<string> = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index])
        index += 1
      }
      blocks.push({ t: 'c', c: codeLines.join('\n') })
      continue
    }

    if (!trimmed) {
      flushParagraph()
      continue
    }

    const unordered = /^-\s+(.+)$/.exec(trimmed)
    const ordered = /^\d+\.\s+(.+)$/.exec(trimmed)
    if (unordered || ordered) {
      flushParagraph()
      const listItems = [unordered?.[1] ?? ordered?.[1] ?? '']
      const isOrdered = !!ordered

      while (index + 1 < lines.length) {
        const nextTrimmed = lines[index + 1].trim()
        const nextMatch = isOrdered ? /^\d+\.\s+(.+)$/.exec(nextTrimmed) : /^-\s+(.+)$/.exec(nextTrimmed)
        if (!nextMatch) break
        listItems.push(nextMatch[1])
        index += 1
      }

      blocks.push({ t: 'l', o: isOrdered, i: listItems })
      continue
    }

    paragraph.push(trimmed)
  }

  flushParagraph()
  return blocks
}

function renderBlock(block: MarkdownBlock, isUser: boolean, key: number) {
  if (block.t === 'c') {
    return (
      <pre
        key={key}
        style={{
          overflowX: 'auto',
          margin: '0.5rem 0',
          padding: '0.65rem',
          borderRadius: 8,
          background: isUser ? '#333' : '#e4e4e4',
        }}
      >
        <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{block.c}</code>
      </pre>
    )
  }

  if (block.t === 'l') {
    const ListTag = block.o ? 'ol' : 'ul'
    return (
      <ListTag key={key} style={{ margin: '0.4rem 0 0.7rem', paddingLeft: '1.25rem' }}>
        {block.i.map((item, index) => (
          <li key={index} style={{ margin: '0.2rem 0' }}>
            {renderInline(item, isUser)}
          </li>
        ))}
      </ListTag>
    )
  }

  return (
    <p key={key} style={{ margin: '0 0 0.6rem' }}>
      {renderInline(block.c, isUser)}
    </p>
  )
}

function renderInline(text: string, isUser: boolean): Array<ReactNode> {
  const nodes: Array<ReactNode> = []
  let lastIndex = 0

  for (const match of text.matchAll(linkPattern)) {
    const index = match.index!
    if (index > lastIndex) nodes.push(text.slice(lastIndex, index))

    const token = match[0]
    if (token.startsWith('`')) {
      nodes.push(
        <code
          key={index}
          style={{
            padding: '0.12rem 0.25rem',
            borderRadius: 4,
            background: isUser ? '#333' : '#e4e4e4',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '0.92em',
          }}
        >
          {token.slice(1, -1)}
        </code>,
      )
    } else {
      nodes.push(
        <a key={index} href={match[3]} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
          {match[2]}
        </a>,
      )
    }

    lastIndex = index + token.length
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}


function formatNumber(value: unknown, digits = 1) {
  return Number(value).toFixed(digits)
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '0.5rem', borderRadius: 10, background: '#fff' }}>
      <div style={{ color: '#666', fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 800 }}>{value}</div>
    </div>
  )
}

function ToolWidget({ toolName, input, output }: { toolName: string; input: unknown; output: unknown }) {
  const result = output as Record<string, unknown>

  if (!result) {
    return input ? <div style={{ color: '#555', fontSize: 13 }}>Input: {JSON.stringify(input)}</div> : null
  }

  if (toolName === 'get_weather') {
    return (
      <div style={{ display: 'grid', gap: '0.55rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{String(result.city)}</div>
            <div style={{ color: '#555' }}>{String(result.condition)}</div>
          </div>
          <div style={{ fontSize: 34, fontWeight: 800 }}>{formatNumber(result.temperatureC, 0)}°C</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem' }}>
          <Metric label="Humidity" value={`${formatNumber(result.humidity, 0)}%`} />
          <Metric label="Wind" value={`${formatNumber(result.windKph, 0)} km/h`} />
        </div>
      </div>
    )
  }

  if (toolName === 'get_stock_quote') {
    const change = Number(result.change)
    const isUp = change >= 0

    return (
      <div style={{ display: 'grid', gap: '0.55rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{String(result.symbol)}</div>
            <div style={{ color: '#555' }}>{String(result.marketState)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{String(result.currency)} {formatNumber(result.price, 2)}</div>
            <div style={{ color: isUp ? '#147a35' : 'crimson', fontWeight: 700 }}>
              {isUp ? '▲' : '▼'} {formatNumber(Math.abs(change), 2)} ({formatNumber(Math.abs(Number(result.changePercent)), 2)}%)
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (toolName === 'brave_web_search') {
    const results = result.results as Array<unknown>

    return (
      <div style={{ display: 'grid', gap: '0.55rem' }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Results for “{String(result.query)}”</div>
        {results.map((item, index) => {
          const searchResult = item as Record<string, unknown>
          const url = String(searchResult.url)

          return (
            <a
              key={`${url}-${index}`}
              href={url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'grid',
                gap: 2,
                padding: '0.55rem',
                borderRadius: 10,
                background: '#fff',
                color: '#111',
                textDecoration: 'none',
              }}
            >
              <strong>{String(searchResult.title)}</strong>
              <span style={{ color: '#555', fontSize: 13 }}>{String(searchResult.description)}</span>
              <span style={{ color: '#777', fontSize: 12 }}>{url}</span>
            </a>
          )
        })}
      </div>
    )
  }

  return <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(result)}</pre>
}


export function Chat() {
  const [input, setInput] = useState('')
  const [models, setModels] = useState<Array<UiChatModel>>([])
  const [modelsError, setModelsError] = useState<string | undefined>()
  const [selectedModel, setSelectedModel] = useState('')
  const [freeOnly, setFreeOnly] = useState(false)
  const [showThinking, setShowThinking] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [followUpMode, setFollowUpMode] = useState<FollowUpMode>('h')
  const [modelFollowUps, setModelFollowUps] = useState<Array<string>>([])
  const [agUiFollowUps, setAgUiFollowUps] = useState<Array<string>>([])
  const [isLoadingFollowUps, setIsLoadingFollowUps] = useState(false)
  const [pendingSearchPrompt, setPendingSearchPrompt] = useState<string | undefined>()
  const [interactiveSearchInput, setInteractiveSearchInput] = useState('')
  const searchQueryResolverRef = useRef<((result: { query: string }) => void) | undefined>(undefined)
  const modelOptions = models.filter((model) => !freeOnly || model.free)
  const thinkingAvailable = !!models.find((model) => model.id === selectedModel)?.supportsThinking
  const interactiveSearchTool = {
    name: 'request_search_query',
    execute(toolInput: { prompt?: string; suggestedQuery?: string }) {
      setInteractiveSearchInput(toolInput.suggestedQuery ?? '')
      setPendingSearchPrompt(toolInput.prompt ?? 'What should I search for?')

      return new Promise<{ query: string }>((resolve) => {
        searchQueryResolverRef.current = resolve
      })
    },
  } as any
  const { messages, sendMessage, isLoading, error, stop } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    body: { model: selectedModel || undefined, showThinking: showThinking && thinkingAvailable },
    tools: [interactiveSearchTool],
    onCustomEvent(_eventName, value) {
      setAgUiFollowUps(value as Array<string>)
    },
  })
  const heuristicFollowUps = (() => {
    if (isLoading || messages.length === 0) return []

    const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant')
    const lastAssistantText = getMessageText(lastAssistant)
    if (!lastAssistant || !lastAssistantText.trim()) return []

    const lastUserText = getMessageText(
      [...messages].reverse().find((message) => message.role === 'user'),
    )

    return createFollowUps(lastUserText, lastAssistantText)
  })()
  const followUps = followUpMode === 'o'
    ? []
    : followUpMode === 'm'
      ? modelFollowUps
      : followUpMode === 'a'
        ? agUiFollowUps
        : heuristicFollowUps

  useEffect(() => {
    setSelectedModel(localStorage.getItem(STORAGE_KEYS.selectedModel) ?? '')
    setFreeOnly(localStorage.getItem(STORAGE_KEYS.freeOnly) === 'true')
    setShowThinking(localStorage.getItem(STORAGE_KEYS.showThinking) === 'true')
    setFollowUpMode((localStorage.getItem(STORAGE_KEYS.followUpMode) as FollowUpMode) ?? 'h')
    setSettingsLoaded(true)
  }, [])

  useEffect(() => {
    if (!settingsLoaded) return

    async function loadModels() {
      try {
        const response = await fetch('/api/models')

        if (!response.ok) {
          throw new Error('Model load failed')
        }

        const { models: nextModels } = (await response.json()) as { models: Array<UiChatModel> }

        setModels(nextModels)
        setSelectedModel((current) => {
          const currentModel = nextModels.find((model) => model.id === current)
          if (currentModel && (!freeOnly || currentModel.free)) return current

          return (freeOnly ? nextModels.find((model) => model.free)?.id : undefined) ?? nextModels.find((model) => model.free)?.id ?? nextModels[0]?.id ?? ''
        })
      } catch (err) {
        setModelsError(err instanceof Error ? err.message : 'Model load failed')
      }
    }

    loadModels()
  }, [settingsLoaded])

  useEffect(() => {
    if (!thinkingAvailable) {
      setShowThinking(false)
    }
  }, [thinkingAvailable])

  useEffect(() => {
    if (!settingsLoaded) return

    localStorage.setItem(STORAGE_KEYS.selectedModel, selectedModel)
    localStorage.setItem(STORAGE_KEYS.freeOnly, String(freeOnly))
    localStorage.setItem(STORAGE_KEYS.showThinking, String(showThinking))
    localStorage.setItem(STORAGE_KEYS.followUpMode, followUpMode)
  }, [selectedModel, freeOnly, showThinking, followUpMode, settingsLoaded])

  useEffect(() => {
    if (followUpMode !== 'm' || isLoading || !selectedModel || messages.length === 0) return

    const serializableMessages = messages
      .map((message) => ({ role: message.role, content: getMessageText(message) }))
      .filter((message) => message.content)

    const lastAssistant = [...serializableMessages].reverse().find((message) => message.role === 'assistant')
    if (!lastAssistant) return

    setIsLoadingFollowUps(true)
    setModelFollowUps([])

    fetch('/api/followups', {
      method: 'POST',
      body: JSON.stringify({ model: selectedModel, messages: serializableMessages }),
    })
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload?: { followUps?: Array<string> }) => {
        setModelFollowUps(payload?.followUps ?? [])
      })
      .catch(() => setModelFollowUps([]))
      .finally(() => {
        setIsLoadingFollowUps(false)
      })
  }, [followUpMode, isLoading, messages, selectedModel])

  function handleFreeOnlyChange(pressed: boolean) {
    setFreeOnly(pressed)

    if (pressed && !models.find((model) => model.id === selectedModel)?.free) {
      const nextModel = models.find((model) => model.free)
      setSelectedModel(nextModel?.id ?? '')
      setShowThinking((current) => current && !!nextModel?.supportsThinking)
    }
  }

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()

    const text = input.trim()
    if (!text) return

    setModelFollowUps([])
    setAgUiFollowUps([])
    sendMessage(text)
    setInput('')
  }

  function handleFollowUpClick(question: string) {
    if (isLoading) return
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
    setPendingSearchPrompt(undefined)
    setInteractiveSearchInput('')
  }

  return (
    <>
      <main
        style={{
          height: '100vh',
          maxWidth: 920,
          margin: '0 auto',
          padding: '1rem',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'system-ui,sans-serif',
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
                  setShowThinking((current) => current && !!models.find((model) => model.id === modelId)?.supportsThinking)
                }}
                disabled={isLoading || modelOptions.length === 0}
                style={{
                  width: 'min(420px, calc(100vw - 2rem))',
                  height: 38,
                  padding: '0 0.65rem',
                  border: '1px solid #ccc',
                  borderRadius: 8,
                  background: '#fff',
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
                        {message.parts.map((part, index) => {
                          if (part.type === 'thinking') {
                            if (!showThinking) return null

                            const hasTextAfterThinking = message.parts
                              .slice(index + 1)
                              .some((nextPart) => nextPart.type === 'text' && !!nextPart.content)

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

                  {pendingSearchPrompt ? (
                    <article style={{ display: 'flex', justifyContent: 'flex-start' }}>
                      <form
                        onSubmit={handleInteractiveSearchSubmit}
                        style={{
                          display: 'grid',
                          gap: '0.65rem',
                          width: 'min(560px, 100%)',
                          padding: '0.9rem',
                          borderRadius: 18,
                          borderBottomLeftRadius: 4,
                          background: '#e8f2ff',
                          color: '#111',
                        }}
                      >
                        <div>
                          <strong>Search query?</strong>
                          <p style={{ margin: '0.35rem 0 0', color: '#555' }}>{pendingSearchPrompt}</p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <input
                            value={interactiveSearchInput}
                            onChange={(event) => setInteractiveSearchInput(event.target.value)}
                            placeholder="Search..."
                            autoFocus
                            style={{
                              flex: 1,
                              padding: '0.65rem',
                              border: '1px solid #c8d8ee',
                              borderRadius: 10,
                                        }}
                          />
                          <button
                            type="submit"
                            disabled={!interactiveSearchInput.trim()}
                            style={{
                              padding: '0.65rem 0.85rem',
                              border: 0,
                              borderRadius: 10,
                              background: '#111',
                              color: '#fff',
                                          cursor: interactiveSearchInput.trim() ? 'pointer' : 'not-allowed',
                            }}
                          >
                            Search
                          </button>
                        </div>
                      </form>
                    </article>
                  ) : null}

                  {!isLoading && followUps.length > 0 ? (
                    <section
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
                            padding: '0.7rem 0',
                            border: 0,
                            borderTop: '1px solid #e7e7e7',
                            background: 'transparent',
                            color: '#222',
                            textAlign: 'left',
                            cursor: 'pointer',
                          }}
                        >
                          {question}
                        </button>
                      ))}
                    </section>
                  ) : null}
                  {!isLoading && followUpMode === 'm' && isLoadingFollowUps ? (
                    <p style={{ margin: '0.25rem 0', color: '#666' }}>Generating…</p>
                  ) : null}

                  {isLoading ? (
                    <article style={{ display: 'flex', justifyContent: 'flex-start' }}>
                      <div
                        aria-label="Typing"
                        style={{
                          padding: '0.8rem 0.95rem',
                          borderRadius: 18,
                          borderBottomLeftRadius: 4,
                          background: '#f2f2f2',
                          color: '#555',
                        }}
                      >
                        ...
                      </div>
                    </article>
                  ) : null}
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
            style={{ flex: 1, padding: '0.75rem', border: '1px solid #ccc', borderRadius: 8 }}
          />

          <button
            type={isLoading ? 'button' : 'submit'}
            onClick={isLoading ? stop : undefined}
            disabled={!isLoading && !selectedModel}
            style={{
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

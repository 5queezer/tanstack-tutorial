import type { SubmitEventHandler } from 'react'
import type { PendingSearchQueryRequest } from './types'

export function InteractiveSearchPrompt({
  request,
  value,
  onChange,
  onSubmit,
}: {
  request?: PendingSearchQueryRequest
  value: string
  onChange: (value: string) => void
  onSubmit: SubmitEventHandler<HTMLFormElement>
}) {
  if (!request) return null

  return (
    <article style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <form
        onSubmit={onSubmit}
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
          <strong>🔎 What should I search for?</strong>
          <p style={{ margin: '0.35rem 0 0', color: '#555' }}>{request.prompt}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Enter a search query..."
            autoFocus
            style={{
              flex: 1,
              padding: '0.65rem',
              border: '1px solid #c8d8ee',
              borderRadius: 10,
              fontFamily: 'inherit',
            }}
          />
          <button
            type="submit"
            disabled={!value.trim()}
            style={{
              padding: '0.65rem 0.85rem',
              border: 0,
              borderRadius: 10,
              background: '#111',
              color: '#fff',
              fontFamily: 'inherit',
              cursor: value.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Search
          </button>
        </div>
      </form>
    </article>
  )
}

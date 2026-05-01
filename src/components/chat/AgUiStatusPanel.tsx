import type { AgUiStatusEvent } from './types'

export function AgUiStatusPanel({ statuses, hasError }: { statuses: Array<AgUiStatusEvent>; hasError: boolean }) {
  const latest = statuses.at(-1)
  if (!latest) return null

  return (
    <section
      aria-label="Status"
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
        <span style={{ color: '#666' }}>{latest.label}</span>
      </div>
      <div style={{ height: 6, overflow: 'hidden', borderRadius: 999, background: '#e8e8e8' }}>
        <div
          style={{
            width: `${latest.progress}%`,
            height: '100%',
            borderRadius: 999,
            background: latest.progress >= 100 && hasError ? 'crimson' : '#111',
            transition: 'width 220ms ease',
          }}
        />
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {statuses.map((status) => (
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
  )
}

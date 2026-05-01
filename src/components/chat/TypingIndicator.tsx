export function TypingIndicator() {
  return (
    <article style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <div
        aria-label="Typing"
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
        <span style={{ width: 7, height: 7, borderRadius: 999, background: '#555' }} />
        <span style={{ width: 7, height: 7, borderRadius: 999, background: '#555' }} />
        <span style={{ width: 7, height: 7, borderRadius: 999, background: '#555' }} />
      </div>
    </article>
  )
}

export function TypingIndicator() {
  return (
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
  )
}

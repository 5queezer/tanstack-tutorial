export function FollowUps({ questions, onSelect }: { questions: Array<string>; onSelect: (question: string) => void }) {
  if (questions.length === 0) return null

  return (
    <section
      aria-label="Follow-ups"
      style={{
        display: 'grid',
        gap: '0.35rem',
        justifySelf: 'stretch',
        maxWidth: 760,
        margin: '0.5rem 0 0.25rem',
      }}
    >
      <h2 style={{ margin: '0 0 0.35rem', fontSize: 16 }}>Follow-ups</h2>
      {questions.map((question) => (
        <button
          key={question}
          type="button"
          onClick={() => onSelect(question)}
          style={{
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
          {question}
        </button>
      ))}
    </section>
  )
}

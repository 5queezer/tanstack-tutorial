import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function MarkdownContent({ content, isUser }: { content: string; isUser: boolean }) {
  return (
    <ReactMarkdown
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
      {content}
    </ReactMarkdown>
  )
}

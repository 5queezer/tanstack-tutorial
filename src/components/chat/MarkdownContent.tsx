import type { ReactNode } from 'react'

type MarkdownBlock =
  | { type: 'code'; content: string; key: string }
  | { type: 'list'; ordered: boolean; items: Array<string>; key: string }
  | { type: 'paragraph'; content: string; key: string }

const linkPattern = /(`[^`]+`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g

export function MarkdownContent({ content, isUser }: { content: string; isUser: boolean }) {
  return <>{parseBlocks(content).map((block) => renderBlock(block, isUser))}</>
}

function parseBlocks(content: string): Array<MarkdownBlock> {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks: Array<MarkdownBlock> = []
  let paragraph: Array<string> = []

  function flushParagraph() {
    if (paragraph.length === 0) return
    blocks.push({ type: 'paragraph', content: paragraph.join(' '), key: `p-${blocks.length}` })
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
      blocks.push({ type: 'code', content: codeLines.join('\n'), key: `code-${blocks.length}` })
      continue
    }

    if (!trimmed) {
      flushParagraph()
      continue
    }

    const unordered = /^[-*]\s+(.+)$/.exec(trimmed)
    const ordered = /^\d+[.)]\s+(.+)$/.exec(trimmed)
    if (unordered || ordered) {
      flushParagraph()
      const listItems = [unordered?.[1] ?? ordered?.[1] ?? '']
      const isOrdered = Boolean(ordered)

      while (index + 1 < lines.length) {
        const nextTrimmed = lines[index + 1].trim()
        const nextMatch = isOrdered ? /^\d+[.)]\s+(.+)$/.exec(nextTrimmed) : /^[-*]\s+(.+)$/.exec(nextTrimmed)
        if (!nextMatch) break
        listItems.push(nextMatch[1])
        index += 1
      }

      blocks.push({ type: 'list', ordered: isOrdered, items: listItems, key: `list-${blocks.length}` })
      continue
    }

    paragraph.push(trimmed)
  }

  flushParagraph()
  return blocks
}

function renderBlock(block: MarkdownBlock, isUser: boolean) {
  if (block.type === 'code') {
    return (
      <pre
        key={block.key}
        style={{
          overflowX: 'auto',
          margin: '0.5rem 0',
          padding: '0.65rem',
          borderRadius: 8,
          background: isUser ? '#333' : '#e4e4e4',
        }}
      >
        <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{block.content}</code>
      </pre>
    )
  }

  if (block.type === 'list') {
    const ListTag = block.ordered ? 'ol' : 'ul'
    return (
      <ListTag key={block.key} style={{ margin: '0.4rem 0 0.7rem', paddingLeft: '1.25rem' }}>
        {block.items.map((item, index) => (
          <li key={`${block.key}-${index}`} style={{ margin: '0.2rem 0' }}>
            {renderInline(item, isUser, `${block.key}-${index}`)}
          </li>
        ))}
      </ListTag>
    )
  }

  return (
    <p key={block.key} style={{ margin: '0 0 0.6rem' }}>
      {renderInline(block.content, isUser, block.key)}
    </p>
  )
}

function renderInline(text: string, isUser: boolean, keyPrefix: string): Array<ReactNode> {
  const nodes: Array<ReactNode> = []
  let lastIndex = 0

  for (const match of text.matchAll(linkPattern)) {
    if (match.index === undefined) continue
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))

    const token = match[0]
    if (token.startsWith('`')) {
      nodes.push(
        <code
          key={`${keyPrefix}-code-${match.index}`}
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
        <a key={`${keyPrefix}-link-${match.index}`} href={match[3]} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
          {match[2]}
        </a>,
      )
    }

    lastIndex = match.index + token.length
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}

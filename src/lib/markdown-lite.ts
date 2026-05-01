export type MarkdownBlock =
  | { t: 'c'; c: string }
  | { t: 'h'; l: number; c: string }
  | { t: 'l'; o: boolean; i: Array<string> }
  | { t: 'p'; c: string }

export type InlineSegment =
  | { t: 'text'; c: string }
  | { t: 'code'; c: string }
  | { t: 'strong'; c: string }
  | { t: 'em'; c: string }
  | { t: 'link'; c: string; href: string }

const inlinePattern = /(`[^`]+`|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g

export function parseMarkdownBlocks(content: string): Array<MarkdownBlock> {
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

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed)
    if (heading) {
      flushParagraph()
      blocks.push({ t: 'h', l: heading[1].length, c: heading[2] })
      continue
    }

    const unordered = /^[-*]\s+(.+)$/.exec(trimmed)
    const ordered = /^\d+\.\s+(.+)$/.exec(trimmed)
    if (unordered || ordered) {
      flushParagraph()
      const listItems = [unordered?.[1] ?? ordered?.[1] ?? '']
      const isOrdered = !!ordered

      while (index + 1 < lines.length) {
        const nextTrimmed = lines[index + 1].trim()
        const nextMatch = isOrdered ? /^\d+\.\s+(.+)$/.exec(nextTrimmed) : /^[-*]\s+(.+)$/.exec(nextTrimmed)
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

export function parseMarkdownInline(text: string): Array<InlineSegment> {
  const segments: Array<InlineSegment> = []
  let lastIndex = 0

  for (const match of text.matchAll(inlinePattern)) {
    const index = match.index!
    if (index > lastIndex) segments.push({ t: 'text', c: text.slice(lastIndex, index) })

    const token = match[0]
    if (token.startsWith('`')) segments.push({ t: 'code', c: token.slice(1, -1) })
    else if (match[2]) segments.push({ t: 'strong', c: match[2] })
    else if (match[3]) segments.push({ t: 'em', c: match[3] })
    else segments.push({ t: 'link', c: match[4], href: match[5] })

    lastIndex = index + token.length
  }

  if (lastIndex < text.length) segments.push({ t: 'text', c: text.slice(lastIndex) })
  return segments
}

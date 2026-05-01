import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseMarkdownBlocks, parseMarkdownInline } from '../src/lib/markdown-lite.ts'

test('parses markdown headings instead of leaving hash markers in text', () => {
  assert.deepEqual(parseMarkdownBlocks('## Trending repos'), [
    { t: 'h', l: 2, c: 'Trending repos' },
  ])
})

test('parses bold and italic inline markdown markers', () => {
  assert.deepEqual(parseMarkdownInline('**claw-code** and *fast repo*'), [
    { t: 'strong', c: 'claw-code' },
    { t: 'text', c: ' and ' },
    { t: 'em', c: 'fast repo' },
  ])
})

test('keeps links and inline code parseable with emphasis', () => {
  assert.deepEqual(parseMarkdownInline('See **[repo](https://github.com/a/b)** and `npm test`'), [
    { t: 'text', c: 'See ' },
    { t: 'strong', c: '[repo](https://github.com/a/b)' },
    { t: 'text', c: ' and ' },
    { t: 'code', c: 'npm test' },
  ])
})

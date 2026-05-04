import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createFollowUpMessages } from '../src/routes/api/followups.ts'

const messages = [
  { role: 'user', content: 'Compare staged DAG delegation with parallel subagents for TLS audit work.' },
  { role: 'assistant', content: 'Staged DAG delegation lets a verification worker depend on a research worker, while parallel subagents are better for independent TLS, PostgreSQL, and kernel-memory audits.' },
]

test('follow-up prompt requires suggestions grounded in the actual latest conversation', () => {
  const promptMessages = createFollowUpMessages(messages)
  const system = promptMessages[0]!.content
  const user = promptMessages[1]!.content

  assert.match(system, /actual conversation/i)
  assert.match(system, /latest/i)
  assert.match(system, /Do not suggest generic/i)
  assert.match(system, /JSON only/i)
  assert.match(user, /staged DAG delegation/i)
  assert.match(user, /kernel-memory audits/i)
})

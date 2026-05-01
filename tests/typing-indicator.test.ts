import assert from 'node:assert/strict'
import { test } from 'node:test'

import { typingDotDelays } from '../src/lib/typing-indicator.ts'

test('provides staggered delays for three animated typing dots', () => {
  assert.deepEqual(typingDotDelays, ['0s', '0.15s', '0.3s'])
})

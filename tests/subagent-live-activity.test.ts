import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createSubagentLifecycleCallbacks,
  updateSubagentActivity,
  type SubagentActivityEvent,
} from '../src/lib/subagent-live-activity.ts'

test('tracks running workers and completion status by name', () => {
  const started: SubagentActivityEvent = { kind: 'subagent-worker', name: 'frontend-review', status: 'running' }
  const finished: SubagentActivityEvent = { kind: 'subagent-worker', name: 'frontend-review', status: 'completed' }

  const running = updateSubagentActivity([], started)
  assert.deepEqual(running, [{ name: 'frontend-review', status: 'running' }])

  const completed = updateSubagentActivity(running, finished)
  assert.deepEqual(completed, [{ name: 'frontend-review', status: 'completed' }])
})

test('preserves first-seen order and records failures', () => {
  const events: SubagentActivityEvent[] = [
    { kind: 'subagent-worker', name: 'research', status: 'running' },
    { kind: 'subagent-worker', name: 'verify', status: 'running' },
    { kind: 'subagent-worker', name: 'research', status: 'failed', error: 'timeout' },
  ]
  const state = events.reduce(updateSubagentActivity, [])

  assert.deepEqual(state, [
    { name: 'research', status: 'failed', error: 'timeout' },
    { name: 'verify', status: 'running' },
  ])
})

test('emits lifecycle events through TanStack custom event context', async () => {
  const events: Array<[string, Record<string, unknown>]> = []
  const callbacks = createSubagentLifecycleCallbacks({
    emitCustomEvent(eventName, value) {
      events.push([eventName, value])
    },
  })

  await callbacks.onWorkerStart({ name: 'research' } as any)
  await callbacks.onWorkerFinish({ name: 'research', status: 'completed', output: 'ok' } as any, { name: 'research' } as any)
  await callbacks.onWorkerFail({ name: 'verify' } as any, new Error('bad credentials'))

  assert.deepEqual(events, [
    ['subagent:worker', { kind: 'subagent-worker', name: 'research', status: 'running' }],
    ['subagent:worker', { kind: 'subagent-worker', name: 'research', status: 'completed' }],
    ['subagent:worker', { kind: 'subagent-worker', name: 'verify', status: 'failed', error: 'bad credentials' }],
  ])
})

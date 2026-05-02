import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildLangfuseConfig,
  capturePayload,
  createLangfuseTrace,
  createSafeErrorSummary,
  finishLangfuseObservation,
  flushLangfuseSafely,
  resetLangfuseForTests,
  setLangfuseClientForTests,
  traceToolCall,
} from '../src/lib/langfuse-tracing.ts'

test('parses capture mode safely', () => {
  assert.equal(buildLangfuseConfig({}).captureMode, 'metadata')
  assert.equal(buildLangfuseConfig({ LANGFUSE_CAPTURE_MODE: ' FULL ' }).captureMode, 'full')
  assert.equal(buildLangfuseConfig({ LANGFUSE_CAPTURE_MODE: 'MetaData' }).captureMode, 'metadata')
  assert.equal(buildLangfuseConfig({ LANGFUSE_CAPTURE_MODE: 'bad' }).captureMode, 'metadata')
})

test('requires complete Langfuse configuration', () => {
  assert.equal(buildLangfuseConfig({ LANGFUSE_PUBLIC_KEY: 'pk', LANGFUSE_SECRET_KEY: 'sk' }).enabled, false)
  assert.equal(buildLangfuseConfig({ LANGFUSE_PUBLIC_KEY: 'pk', LANGFUSE_SECRET_KEY: 'sk', LANGFUSE_BASEURL: '   ' }).enabled, false)
  assert.equal(buildLangfuseConfig({ LANGFUSE_PUBLIC_KEY: 'pk', LANGFUSE_SECRET_KEY: 'sk', LANGFUSE_BASEURL: 'https://lf.local' }).enabled, true)
})

test('redacts payloads in metadata mode and preserves them in full mode', () => {
  assert.equal(capturePayload('metadata', { secret: 'value' }), undefined)
  assert.deepEqual(capturePayload('full', { secret: 'value' }), { secret: 'value' })
})

test('safe error summaries exclude raw nested fields', () => {
  const error = Object.assign(new Error('first line\nsecond line'), {
    status: 429,
    response: { body: 'raw prompt' },
    metadata: { raw: 'provider raw body' },
    headers: { authorization: 'Bearer token' },
  })

  assert.deepEqual(createSafeErrorSummary(error), { name: 'Error', message: 'first line second line', status: 429 })
})

test('safe flush suppresses client failures', async () => {
  setLangfuseClientForTests({ flushAsync: async () => { throw new Error('network') } })
  await flushLangfuseSafely(10)
  resetLangfuseForTests()
})

test('tool tracing returns values and rethrows original errors', async () => {
  const calls: Array<string> = []
  setLangfuseClientForTests({
    trace: () => ({ span: () => ({ end: () => { calls.push('end') } }) }),
    flushAsync: async () => { calls.push('flush') },
  })

  assert.equal(await traceToolCall('demo_tool', { a: 1 }, async () => 'ok'), 'ok')
  await assert.rejects(() => traceToolCall('demo_tool', {}, async () => { throw new TypeError('boom') }), TypeError)
  assert.ok(calls.includes('end'))
  resetLangfuseForTests()
})

test('observation helpers record terminal statuses and redact metadata payloads', async () => {
  const ended: Array<Record<string, unknown>> = []
  setLangfuseClientForTests({
    trace: () => ({ generation: () => ({ end: (body?: Record<string, unknown>) => { if (body) ended.push(body) } }) }),
    flushAsync: async () => {},
  })

  const trace = createLangfuseTrace({ name: 'api.chat', model: 'model-a', input: { prompt: 'secret' } })
  finishLangfuseObservation(trace?.observation, { status: 'success', output: 'secret output' })

  assert.equal(ended[0]?.output, undefined)
  assert.deepEqual((ended[0]?.metadata as Record<string, unknown>)?.status, 'success')
  resetLangfuseForTests()
})

test('observation helpers preserve payloads in full mode', async () => {
  const ended: Array<Record<string, unknown>> = []
  setLangfuseClientForTests({
    trace: () => ({ generation: () => ({ end: (body?: Record<string, unknown>) => { if (body) ended.push(body) } }) }),
    flushAsync: async () => {},
  }, { LANGFUSE_PUBLIC_KEY: 'pk', LANGFUSE_SECRET_KEY: 'sk', LANGFUSE_BASEURL: 'https://lf.local', LANGFUSE_CAPTURE_MODE: 'full' })

  const trace = createLangfuseTrace({ name: 'api.chat', model: 'model-a', input: { prompt: 'secret' } })
  finishLangfuseObservation(trace?.observation, { status: 'success', output: 'secret output' })

  assert.deepEqual(ended[0]?.output, 'secret output')
  resetLangfuseForTests()
})

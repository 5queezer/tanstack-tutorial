# Langfuse Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional server-side Langfuse tracing with metadata-by-default redaction and opt-in full capture.

**Architecture:** Add a single `src/lib/langfuse-tracing.ts` module that owns SDK initialization, redaction, safe error summaries, safe flushing, and route/tool helper APIs. Integrate it from `/api/chat`, `/api/followups`, and server tool definitions. Add an ADR under `doc/adr`.

**Tech Stack:** TypeScript, Node test runner, TanStack AI, TanStack Start routes, `langfuse` npm package v3.

---

## File Structure

- Create: `src/lib/langfuse-tracing.ts` — server-only Langfuse wrapper, config parsing, redaction, safe flush, route/tool tracing helpers.
- Create: `tests/langfuse-tracing.test.ts` — unit tests for config parsing, redaction, safe errors, flush, and tool wrapper behavior.
- Modify: `src/routes/api/chat.ts` — create chat trace and finish it from existing stream wrapper terminal states.
- Modify: `src/routes/api/followups.ts` — trace attempted follow-up OpenRouter calls.
- Modify: `src/lib/tools.ts` — wrap local server tools with tracing helper.
- Modify: `src/lib/github-tool.ts` — wrap GitHub server tools with tracing helper.
- Modify: `src/lib/subagent-router.ts` — wrap subagent routing server tool with tracing helper.
- Modify: `package.json`, lockfile — add `langfuse` runtime dependency.
- Create: `doc/adr/0005-add-optional-langfuse-observability.md` via `adr new`.

### Task 1: Tracing Module

**Files:**
- Create: `tests/langfuse-tracing.test.ts`
- Create: `src/lib/langfuse-tracing.ts`

- [ ] **Step 1: Write failing tests**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildLangfuseConfig,
  capturePayload,
  createSafeErrorSummary,
  flushLangfuseSafely,
  resetLangfuseForTests,
  setLangfuseClientForTests,
  traceToolCall,
} from '../src/lib/langfuse-tracing.ts'

test('parses capture mode safely', () => {
  assert.equal(buildLangfuseConfig({}).captureMode, 'metadata')
  assert.equal(buildLangfuseConfig({ LANGFUSE_CAPTURE_MODE: ' FULL ' }).captureMode, 'full')
  assert.equal(buildLangfuseConfig({ LANGFUSE_CAPTURE_MODE: 'bad' }).captureMode, 'metadata')
})

test('requires complete Langfuse configuration', () => {
  assert.equal(buildLangfuseConfig({ LANGFUSE_PUBLIC_KEY: 'pk', LANGFUSE_SECRET_KEY: 'sk' }).enabled, false)
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
    trace: () => ({ span: () => ({ end: () => calls.push('end') }) }),
    flushAsync: async () => calls.push('flush'),
  })
  assert.equal(await traceToolCall('demo_tool', { a: 1 }, async () => 'ok'), 'ok')
  await assert.rejects(() => traceToolCall('demo_tool', {}, async () => { throw new TypeError('boom') }), TypeError)
  assert.ok(calls.includes('end'))
  resetLangfuseForTests()
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/langfuse-tracing.test.ts`
Expected: FAIL because `src/lib/langfuse-tracing.ts` does not exist.

- [ ] **Step 3: Implement tracing module**

Create `src/lib/langfuse-tracing.ts` with exported functions matching the test imports: `buildLangfuseConfig`, `capturePayload`, `createSafeErrorSummary`, `flushLangfuseSafely`, `traceToolCall`, `createLangfuseTrace`, `finishLangfuseObservation`, `setLangfuseClientForTests`, and `resetLangfuseForTests`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/langfuse-tracing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/langfuse-tracing.ts tests/langfuse-tracing.test.ts package.json package-lock.json bun.lock
git commit -m "feat: add langfuse tracing module"
```

### Task 2: Route and Tool Integration

**Files:**
- Modify: `src/routes/api/chat.ts`
- Modify: `src/routes/api/followups.ts`
- Modify: `src/lib/tools.ts`
- Modify: `src/lib/github-tool.ts`
- Modify: `src/lib/subagent-router.ts`

- [ ] **Step 1: Write or extend tests for integration-visible behavior**

Add tests in `tests/langfuse-tracing.test.ts` that use fake clients to verify observation helpers record success, error, and aborted statuses without raw payloads in metadata mode.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/langfuse-tracing.test.ts`
Expected: FAIL until the observation helper records terminal status consistently.

- [ ] **Step 3: Integrate tracing helpers**

Update route handlers and tool server callbacks to call `createLangfuseTrace`, `finishLangfuseObservation`, `traceToolCall`, and `flushLangfuseSafely` as described in the spec.

- [ ] **Step 4: Run verification**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/chat.ts src/routes/api/followups.ts src/lib/tools.ts src/lib/github-tool.ts src/lib/subagent-router.ts tests/langfuse-tracing.test.ts
git commit -m "feat: trace chat routes and tools with langfuse"
```

### Task 3: ADR

**Files:**
- Create: `doc/adr/0005-add-optional-langfuse-observability.md`

- [ ] **Step 1: Create ADR**

Run: `adr new "Add Optional Langfuse Observability"`
Expected: creates `doc/adr/0005-add-optional-langfuse-observability.md`.

- [ ] **Step 2: Write ADR content**

Record context, decision, and consequences from the design spec: server-only optional Langfuse, self-hosted preference, required base URL, metadata default, full opt-in, pseudonymous conversation ids, binary tool payload redaction, and best-effort flush.

- [ ] **Step 3: Commit**

```bash
git add doc/adr/0005-add-optional-langfuse-observability.md
git commit -m "docs: record langfuse observability decision"
```

### Task 4: Final Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run full tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit any verification fixes**

```bash
git status --short
git add -A
git commit -m "fix: complete langfuse observability integration"
```

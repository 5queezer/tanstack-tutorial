import assert from 'node:assert/strict'
import { test } from 'node:test'

import { summarizeToolActivity } from '../src/lib/ag-ui-tool-activity.ts'

test('summarizes subagent routing decisions as AG-UI activity rows', () => {
  const summary = summarizeToolActivity('route_subagents', { prompt: 'review frontend and backend' }, {
    chosenAction: 'spawn_multiple_specialists',
    promptClass: 'review',
    complexity: 'high',
    domainBreadth: 'multi-domain',
    subtaskIndependence: 'high',
    verificationBurden: 'medium',
    costLatencyPrivacyRisk: 'medium',
    rationale: 'Review work is separable.',
    validationGate: 'Integrator validates findings.',
  })

  assert.ok(summary)
  assert.equal(summary.title, 'Subagent routing')
  assert.deepEqual(summary.rows.slice(0, 4), [
    ['Action', 'spawn_multiple_specialists'],
    ['Class', 'review'],
    ['Complexity', 'high'],
    ['Domains', 'multi-domain'],
  ])
  assert.deepEqual(summary.rows.at(-1), ['Validation', 'Integrator validates findings.'])
})

test('summarizes github_search with query, type, repo, and result count', () => {
  const summary = summarizeToolActivity('github_search', { query: 'default.fetch', type: 'prs', repo: 'TanStack/router' }, {
    results: [
      { title: 'Fix server fetch', url: 'https://github.com/TanStack/router/pull/1' },
      { title: 'Dev server issue', url: 'https://github.com/TanStack/router/issues/2' },
    ],
  })

  assert.ok(summary)
  assert.ok(summary)
  assert.equal(summary.title, 'GitHub search')
  assert.deepEqual(summary.rows, [
    ['Type', 'prs'],
    ['Query', 'default.fetch'],
    ['Repo', 'TanStack/router'],
    ['Results', '2'],
  ])
  assert.deepEqual(summary.links, [
    ['Fix server fetch', 'https://github.com/TanStack/router/pull/1'],
    ['Dev server issue', 'https://github.com/TanStack/router/issues/2'],
  ])
})

test('summarizes github_get requests for PR status details', () => {
  const summary = summarizeToolActivity('github_get', { resource: 'check_runs', owner: 'TanStack', repo: 'router', ref: 'abc123' }, {
    check_runs: [{ name: 'test', status: 'completed', conclusion: 'success' }],
  })

  assert.ok(summary)
  assert.equal(summary.title, 'GitHub details')
  assert.deepEqual(summary.rows, [
    ['Resource', 'check_runs'],
    ['Repo', 'TanStack/router'],
    ['Ref', 'abc123'],
    ['Items', '1'],
  ])
})

test('summarizes github_search output even when tool input is absent', () => {
  const summary = summarizeToolActivity('github_search', undefined, {
    type: 'repos',
    query: 'stars:>10000 pushed:>2026-04-01',
    results: [{ title: 'owner/repo', url: 'https://github.com/owner/repo' }],
  })

  assert.ok(summary)
  assert.equal(summary.title, 'GitHub search')
  assert.deepEqual(summary.rows, [
    ['Type', 'repos'],
    ['Query', 'stars:>10000 pushed:>2026-04-01'],
    ['Repo', 'any'],
    ['Results', '1'],
  ])
})

test('summarizes run_subagents worker execution', () => {
  const summary = summarizeToolActivity('run_subagents', undefined, {
    action: 'spawn_multiple_specialists',
    topology: 'staged_dag',
    workers: [
      { name: 'frontend', status: 'completed', output: 'Frontend OK' },
      { name: 'backend', status: 'failed', output: '', error: 'timeout' },
    ],
    verification: {
      status: 'needs_review',
      summary: 'Backend timed out.',
      checkedWorkers: ['frontend', 'backend'],
    },
    integrationHint: 'Integrate completed worker findings.',
  })

  assert.ok(summary)
  assert.equal(summary.title, 'Subagent execution')
  assert.deepEqual(summary.rows, [
    ['Action', 'spawn_multiple_specialists'],
    ['Topology', 'staged_dag'],
    ['Workers', '2'],
    ['Completed', '1'],
    ['Failed', '1'],
    ['Verified', 'needs_review'],
    ['Verifier', 'Backend timed out.'],
    ['frontend', 'completed'],
    ['backend', 'failed'],
    ['Integration', 'Integrate completed worker findings.'],
  ])
})

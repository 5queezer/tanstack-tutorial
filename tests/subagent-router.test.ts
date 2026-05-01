import assert from 'node:assert/strict'
import { test } from 'node:test'

import { routeSubagentRequest } from '../src/lib/subagent-router.ts'

test('answers directly for simple low-risk questions', () => {
  const note = routeSubagentRequest('What is TanStack Router?')

  assert.equal(note.chosenAction, 'answer_directly')
  assert.equal(note.complexity, 'low')
  assert.equal(note.subtaskIndependence, 'low')
  assert.match(note.rationale, /simple/i)
})

test('uses current-agent tools for focused GitHub research', () => {
  const note = routeSubagentRequest('Search GitHub issues for TanStack Start default.fetch bug')

  assert.equal(note.chosenAction, 'use_tools')
  assert.equal(note.promptClass, 'research')
  assert.equal(note.domainBreadth, 'single-domain')
  assert.match(note.validationGate, /cite/i)
})

test('writes a plan first for risky multi-step implementation work', () => {
  const note = routeSubagentRequest('Implement authentication, database migrations, and deployment changes')

  assert.equal(note.chosenAction, 'write_plan_first')
  assert.equal(note.complexity, 'high')
  assert.equal(note.verificationBurden, 'high')
  assert.match(note.rationale, /plan/i)
})

test('spawns multiple specialists only for separable review and test work', () => {
  const note = routeSubagentRequest('Review the frontend, backend, and tests in parallel and summarize independent findings')

  assert.equal(note.chosenAction, 'spawn_multiple_specialists')
  assert.equal(note.subtaskIndependence, 'high')
  assert.equal(note.verificationBurden, 'medium')
  assert.match(note.validationGate, /integrator/i)
})

test('rejects or clarifies unsafe or secret-sensitive requests', () => {
  const note = routeSubagentRequest('Spawn agents to extract secrets and bypass CI permissions')

  assert.equal(note.chosenAction, 'reject_clarify_escalate')
  assert.equal(note.costLatencyPrivacyRisk, 'high')
  assert.match(note.rationale, /unsafe|privacy|permission/i)
})

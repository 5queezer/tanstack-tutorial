import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildGitHubGetPath, buildGitHubSearchPath, compactGitHubItems } from '../src/lib/github-tool.ts'

test('builds pull request search path with repo qualifier and limit', () => {
  const path = buildGitHubSearchPath({ type: 'prs', query: 'failing tests', repo: 'tanstack/router', limit: 3 })
  const url = new URL(`https://api.github.com${path}`)

  assert.equal(url.pathname, '/search/issues')
  assert.equal(url.searchParams.get('per_page'), '3')
  assert.equal(url.searchParams.get('q'), 'failing tests repo:tanstack/router is:pr')
})

test('builds file search path with default limit', () => {
  const path = buildGitHubSearchPath({ type: 'files', query: 'createFileRoute', repo: 'TanStack/router' })
  const url = new URL(`https://api.github.com${path}`)

  assert.equal(url.pathname, '/search/code')
  assert.equal(url.searchParams.get('per_page'), '5')
  assert.equal(url.searchParams.get('q'), 'createFileRoute repo:TanStack/router')
})

test('builds read-only pull request details paths', () => {
  assert.equal(
    buildGitHubGetPath({ resource: 'pr_review_comments', owner: 'TanStack', repo: 'router', number: 12 }),
    '/repos/TanStack/router/pulls/12/comments?per_page=5',
  )
  assert.equal(
    buildGitHubGetPath({ resource: 'check_runs', owner: 'TanStack', repo: 'router', ref: 'abc123', limit: 10 }),
    '/repos/TanStack/router/commits/abc123/check-runs?per_page=10',
  )
})

test('compacts GitHub items to stable read-only fields', () => {
  const compacted = compactGitHubItems([
    {
      title: 'Fix bug',
      html_url: 'https://github.com/o/r/pull/1',
      state: 'open',
      repository_url: 'https://api.github.com/repos/o/r',
      user: { login: 'alice' },
      body: 'Long body text',
    },
  ])

  assert.deepEqual(compacted, [
    {
      title: 'Fix bug',
      url: 'https://github.com/o/r/pull/1',
      state: 'open',
      repository: 'o/r',
      user: 'alice',
      body: 'Long body text',
    },
  ])
})

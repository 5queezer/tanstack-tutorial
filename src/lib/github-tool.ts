import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

type GitHubSearchInput = {
  query: string
  type?: 'issues' | 'prs' | 'code' | 'files' | 'repos' | 'users'
  repo?: string
  limit?: number
}

type GitHubGetInput = {
  resource:
    | 'issue'
    | 'issue_comments'
    | 'pr'
    | 'pr_files'
    | 'pr_commits'
    | 'pr_reviews'
    | 'pr_review_comments'
    | 'commit_status'
    | 'check_runs'
    | 'workflow_runs'
    | 'workflow_run'
    | 'workflow_run_jobs'
  owner: string
  repo: string
  number?: number
  ref?: string
  runId?: number
  limit?: number
}

export const githubSearchDef = toolDefinition({
  name: 'github_search',
  description: 'Read-only GitHub search.',
  inputSchema: z.object({
    query: z.string().max(500),
    type: z.enum(['issues', 'prs', 'code', 'files', 'repos', 'users']).optional(),
    repo: z.string().optional(),
    limit: z.number().int().min(1).max(10).optional(),
  }),
})

export const githubGetDef = toolDefinition({
  name: 'github_get',
  description: 'Read GitHub issue/PR/CI details.',
  inputSchema: z.object({
    resource: z.enum([
      'issue',
      'issue_comments',
      'pr',
      'pr_files',
      'pr_commits',
      'pr_reviews',
      'pr_review_comments',
      'commit_status',
      'check_runs',
      'workflow_runs',
      'workflow_run',
      'workflow_run_jobs',
    ]),
    owner: z.string(),
    repo: z.string(),
    number: z.number().int().optional(),
    ref: z.string().optional(),
    runId: z.number().int().optional(),
    limit: z.number().int().min(1).max(10).optional(),
  }),
})

export function buildGitHubSearchPath(input: GitHubSearchInput) {
  const type = input.type ?? 'issues'
  const query = [input.query, input.repo ? `repo:${input.repo}` : '', type === 'prs' ? 'is:pr' : '']
    .filter(Boolean)
    .join(' ')
  const endpoint = type === 'code' || type === 'files' ? 'code' : type === 'repos' ? 'repositories' : type === 'users' ? 'users' : 'issues'
  const params = new URLSearchParams({ q: query, per_page: String(input.limit ?? 5) })
  return `/search/${endpoint}?${params}`
}

export function buildGitHubGetPath(input: GitHubGetInput) {
  const base = `/repos/${input.owner}/${input.repo}`
  const perPage = `?per_page=${input.limit ?? 5}`

  switch (input.resource) {
    case 'issue':
      return `${base}/issues/${input.number}`
    case 'issue_comments':
      return `${base}/issues/${input.number}/comments${perPage}`
    case 'pr':
      return `${base}/pulls/${input.number}`
    case 'pr_files':
      return `${base}/pulls/${input.number}/files${perPage}`
    case 'pr_commits':
      return `${base}/pulls/${input.number}/commits${perPage}`
    case 'pr_reviews':
      return `${base}/pulls/${input.number}/reviews${perPage}`
    case 'pr_review_comments':
      return `${base}/pulls/${input.number}/comments${perPage}`
    case 'commit_status':
      return `${base}/commits/${input.ref}/status`
    case 'check_runs':
      return `${base}/commits/${input.ref}/check-runs${perPage}`
    case 'workflow_runs':
      return `${base}/actions/runs${perPage}`
    case 'workflow_run':
      return `${base}/actions/runs/${input.runId}`
    case 'workflow_run_jobs':
      return `${base}/actions/runs/${input.runId}/jobs${perPage}`
  }
}

export function compactGitHubItems(items: Array<any>) {
  return items.map((item) => ({
    title: item.title ?? item.name,
    url: item.html_url,
    state: item.state ?? item.status ?? item.conclusion,
    repository: item.repository?.full_name ?? item.repository_url?.split('/repos/')[1],
    user: item.user?.login ?? item.actor?.login,
    body: item.body ?? item.description ?? item.path,
  }))
}

async function githubJson(path: string) {
  if (!process.env.GITHUB_TOKEN) throw Error('GITHUB_TOKEN missing')

  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (!response.ok) throw Error(`GitHub failed: ${response.status}`)
  return response.json()
}

export const githubSearch = githubSearchDef.server(async (args) => {
  const input = args as GitHubSearchInput
  const payload = await githubJson(buildGitHubSearchPath(input))
  return {
    type: input.type ?? 'issues',
    query: input.query,
    results: compactGitHubItems(payload.items ?? []),
  }
})

export const githubGet = githubGetDef.server(async (args) => {
  const input = args as GitHubGetInput
  const payload = await githubJson(buildGitHubGetPath(input))
  return Array.isArray(payload) ? compactGitHubItems(payload) : payload
})

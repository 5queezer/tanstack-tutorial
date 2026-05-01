# 3. Add Read-Only GitHub Tools for Agent Research

Date: 2026-05-01

## Status

Accepted

## Context

The chat agent needs to research GitHub issues, pull requests, files/code, review comments, and CI/status information without leaving the application harness. This supports the subagent-spawning policy in [ADR 0002](0002-decide-when-to-spawn-subagents.md): agents and subagents need bounded, auditable, read-only source inspection before deciding whether to implement, review, or escalate work.

The integration must keep GitHub credentials server-side. It must not create, edit, merge, comment, approve, rerun workflows, or otherwise mutate GitHub state. The user explicitly requested read-only access with a token requirement.

Options considered:

1. Use `@octokit/rest` or `octokit`.
2. Use `@octokit/request`.
3. Use plain server-side `fetch` against GitHub REST endpoints.

Octokit packages are useful for larger GitHub integrations, but this repository only needs a small set of explicit read-only endpoints. Adding a dependency would increase dependency surface and lockfile churn without much benefit.

## Decision

Add two server-side TanStack AI tools implemented with plain `fetch` and `GITHUB_TOKEN`:

- `github_search` for read-only search across issues, pull requests, files/code, repositories, and users.
- `github_get` for read-only retrieval of issue details, issue comments, pull request details, changed files, commits, reviews, review comments, commit status, check runs, workflow runs, individual workflow runs, and workflow run jobs.

Use GitHub REST API endpoints only. Send these request headers:

- `Authorization: Bearer ${process.env.GITHUB_TOKEN}`
- `Accept: application/vnd.github+json`
- `X-GitHub-Api-Version: 2022-11-28`

Keep result payloads compact and stable for model consumption. Limit list endpoints with `per_page`, defaulting to 5 and capping schema input at 10.

Do not add Octokit unless the GitHub integration grows to need broader API coverage, pagination abstractions, GraphQL, webhook handling, or plugin behavior.

## Consequences

Benefits:

- GitHub token remains server-side.
- The tools are auditable as read-only because each endpoint is an HTTP GET.
- No new runtime dependency or lockfile churn.
- Agents can inspect GitHub issues, PRs, code/files, comments, reviews, and CI signals before making implementation or spawning decisions.

Costs and risks:

- Manual endpoint construction is more verbose than Octokit methods.
- Pagination support is intentionally minimal.
- GitHub rate limits and token permissions determine what the tools can read.
- Fine-grained tokens may need repository permissions such as Contents read, Issues read, Pull requests read, Actions read, Checks read, and Commit statuses read.

Mitigations:

- Keep endpoint builders covered by tests.
- Keep tool schemas constrained and list limits small.
- Add Octokit later only if repeated endpoint handling becomes hard to maintain.
- Treat these tools as read-only: no POST, PATCH, PUT, or DELETE endpoints in this integration.

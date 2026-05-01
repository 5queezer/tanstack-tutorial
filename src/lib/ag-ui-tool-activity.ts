export type ToolActivitySummary = {
  title: string
  rows: Array<[string, string]>
  links?: Array<[string, string]>
}

export function summarizeToolActivity(toolName: string, input: any, output: any): ToolActivitySummary | undefined {
  if (toolName === 'route_subagents') {
    return {
      title: 'Subagent routing',
      rows: [
        ['Action', String(output.chosenAction)],
        ['Class', String(output.promptClass)],
        ['Complexity', String(output.complexity)],
        ['Domains', String(output.domainBreadth)],
        ['Independence', String(output.subtaskIndependence)],
        ['Verification', String(output.verificationBurden)],
        ['Risk', String(output.costLatencyPrivacyRisk)],
        ['Rationale', String(output.rationale)],
        ['Validation', String(output.validationGate)],
      ],
    }
  }

  if (toolName === 'github_search') {
    const results = output.results ?? []
    return {
      title: 'GitHub search',
      rows: [
        ['Type', String(input.type ?? output.type ?? 'issues')],
        ['Query', String(input.query ?? output.query)],
        ['Repo', String(input.repo ?? 'any')],
        ['Results', String(results.length)],
      ],
      links: results
        .filter((item: any) => item.url)
        .slice(0, 5)
        .map((item: any) => [String(item.title ?? item.url), String(item.url)]),
    }
  }

  if (toolName === 'github_get') {
    const items = Array.isArray(output) ? output : output.check_runs ?? output.workflow_runs ?? output.jobs ?? output.statuses
    return {
      title: 'GitHub details',
      rows: [
        ['Resource', String(input.resource)],
        ['Repo', `${input.owner}/${input.repo}`],
        ...(input.number ? [['Number', String(input.number)] as [string, string]] : []),
        ...(input.ref ? [['Ref', String(input.ref)] as [string, string]] : []),
        ...(input.runId ? [['Run', String(input.runId)] as [string, string]] : []),
        ['Items', String(Array.isArray(items) ? items.length : 1)],
      ],
    }
  }
}

import type { SubagentWorkerBrief, SubagentWorkerResult } from '@5queezer/tanstack-ai-subagents'

export type SubagentActivityStatus = 'running' | 'completed' | 'failed'

export type SubagentActivityEvent = {
  kind: 'subagent-worker'
  name: string
  status: SubagentActivityStatus
  error?: string
}

export type SubagentActivityItem = {
  name: string
  status: SubagentActivityStatus
  error?: string
}

type CustomEventEmitter = {
  emitCustomEvent(eventName: string, value: Record<string, any>): void
}

export function updateSubagentActivity(
  items: Array<SubagentActivityItem>,
  event: SubagentActivityEvent,
): Array<SubagentActivityItem> {
  if (event.kind !== 'subagent-worker') return items

  const next = { name: event.name, status: event.status, ...(event.error ? { error: event.error } : {}) }
  const existingIndex = items.findIndex((item) => item.name === event.name)
  if (existingIndex < 0) return [...items, next]

  return items.map((item, index) => (index === existingIndex ? next : item))
}

export function isSubagentActivityEvent(value: unknown): value is SubagentActivityEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Record<string, unknown>
  return event.kind === 'subagent-worker' &&
    typeof event.name === 'string' &&
    (event.status === 'running' || event.status === 'completed' || event.status === 'failed')
}

export function createSubagentLifecycleCallbacks(emitter: CustomEventEmitter) {
  const emit = (event: SubagentActivityEvent) => emitter.emitCustomEvent('subagent:worker', event)

  return {
    onWorkerStart(brief: SubagentWorkerBrief) {
      emit({ kind: 'subagent-worker', name: brief.name, status: 'running' })
    },
    onWorkerFinish(result: SubagentWorkerResult, brief: SubagentWorkerBrief) {
      emit({
        kind: 'subagent-worker',
        name: brief.name,
        status: result.status,
        ...(result.status === 'failed' && result.error ? { error: result.error } : {}),
      })
    },
    onWorkerFail(brief: SubagentWorkerBrief, error: unknown) {
      emit({
        kind: 'subagent-worker',
        name: brief.name,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown worker error',
      })
    },
  }
}

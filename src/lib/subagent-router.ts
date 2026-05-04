import { createSubagentRouterTool } from '@5queezer/tanstack-ai-subagents'
import { traceToolCall } from './langfuse-tracing.ts'

export type { RoutingLevel, SubagentAction, SubagentRoutingNote } from '@5queezer/tanstack-ai-subagents'
export { createSubagentRouter, routeSubagentRequest } from '@5queezer/tanstack-ai-subagents'

const routeTool = createSubagentRouterTool({ trace: traceToolCall })

export const subagentRouteDef = routeTool.definition
export const subagentRoute = routeTool

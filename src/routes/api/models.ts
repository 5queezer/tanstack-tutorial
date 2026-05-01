import { createFileRoute } from '@tanstack/react-router'

import { getOpenRouterModels } from '../../lib/openrouter-models'

export const Route = createFileRoute('/api/models')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const models = await getOpenRouterModels()

          return new Response(JSON.stringify({ models }))
        } catch (error) {
          return new Response(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Model fetch failed',
            }),
            { status: 502 },
          )
        }
      },
    },
  },
})

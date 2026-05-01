import { createFileRoute } from '@tanstack/react-router'

import { getOpenRouterModels } from '../../lib/openrouter-models'

export const Route = createFileRoute('/api/models')({
  server: {
    handlers: {
      async GET() {
        try {
          const models = await getOpenRouterModels()

          return new Response(JSON.stringify({ models }))
        } catch (error) {
          return new Response(
            JSON.stringify({
              error: (error as Error).message,
            }),
            { status: 502 },
          )
        }
      },
    },
  },
})

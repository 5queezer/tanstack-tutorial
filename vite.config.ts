import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
export default defineConfig({
  resolve: { tsconfigPaths: true },
  optimizeDeps: {
    include: ['react-markdown', 'remark-gfm'],
  },
  plugins: [tanstackStart(), react()],
})

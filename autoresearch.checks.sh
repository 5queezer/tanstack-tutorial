#!/usr/bin/env bash
set -euo pipefail
npm run typecheck >/tmp/autoresearch-typecheck.log 2>&1 || {
  tail -80 /tmp/autoresearch-typecheck.log >&2
  exit 1
}
node -e "import('./dist/server/server.js').then(m=>{if(typeof m.default?.fetch!=='function') throw new Error('server default.fetch missing')}).catch(e=>{console.error(e); process.exit(1)})"

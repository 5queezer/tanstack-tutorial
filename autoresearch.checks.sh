#!/usr/bin/env bash
set -euo pipefail
npm run typecheck >/tmp/autoresearch-typecheck.log 2>&1 || {
  tail -80 /tmp/autoresearch-typecheck.log >&2
  exit 1
}

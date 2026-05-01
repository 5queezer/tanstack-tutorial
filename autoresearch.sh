#!/usr/bin/env bash
set -euo pipefail

rm -rf dist
npm run build >/tmp/autoresearch-build.log 2>&1 || {
  tail -80 /tmp/autoresearch-build.log >&2
  exit 1
}

python3 - <<'PY'
from pathlib import Path
import gzip

root = Path('dist')
js_files = list(root.rglob('*.js'))
css_files = list(root.rglob('*.css'))
raw_js = sum(p.stat().st_size for p in js_files)
gzip_js = sum(len(gzip.compress(p.read_bytes(), compresslevel=9)) for p in js_files)
raw_css = sum(p.stat().st_size for p in css_files)
print(f'METRIC bundle_gzip_kb={gzip_js/1024:.3f}')
print(f'METRIC bundle_raw_kb={raw_js/1024:.3f}')
print(f'METRIC js_files={len(js_files)}')
print(f'METRIC css_kb={raw_css/1024:.3f}')
PY

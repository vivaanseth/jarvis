#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
while IFS= read -r file; do node --check "$file"; done < <(find electron browser-extension -type f \( -name '*.js' -o -name '*.cjs' \) -not -path '*/node_modules/*' | sort)

#!/usr/bin/env bash
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

files=()
while IFS= read -r file; do files+=("$file"); done < <(git ls-files --cached --others --exclude-standard 2>/dev/null)
(( ${#files[@]} )) || exit 0

patterns=(
  'AIza[0-9A-Za-z_-]{30,}'
  'sk-[A-Za-z0-9_-]{24,}'
  'gsk_[A-Za-z0-9]{20,}'
  'github_pat_[A-Za-z0-9_]{20,}'
  'gh[pousr]_[A-Za-z0-9]{20,}'
  'xox[baprs]-[A-Za-z0-9-]{10,}'
  'tvly-[A-Za-z0-9_-]{20,}'
  'nvapi-[A-Za-z0-9_-]{20,}'
  '(secret|ntn)_[A-Za-z0-9_-]{20,}'
  '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----'
)

for pattern in "${patterns[@]}"; do
  if command -v rg >/dev/null 2>&1; then
    if rg -n --no-messages --color never --glob '!package-lock.json' --glob '!script/check_secrets.sh' -- "$pattern" "${files[@]}"; then
      echo "Potential secret detected. Remove it and rotate the credential before committing." >&2
      exit 1
    fi
  else
    for file in "${files[@]}"; do
      case "$file" in
        package-lock.json|script/check_secrets.sh) continue ;;
      esac
      [[ -f "$file" ]] || continue
      if grep -nE -- "$pattern" "$file"; then
        echo "Potential secret detected. Remove it and rotate the credential before committing." >&2
        exit 1
      fi
    done
  fi
done

echo "Secret scan passed (${#files[@]} files checked)."

#!/bin/zsh
set -euo pipefail

cd "${0:A:h}/.."

files=(${(f)"$(git ls-files --cached --others --exclude-standard 2>/dev/null)"})
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

for pattern in $patterns; do
  if rg -n --no-messages --color never --glob '!package-lock.json' --glob '!script/check_secrets.sh' -- "$pattern" $files; then
    print -u2 "Potential secret detected. Remove it and rotate the credential before committing."
    exit 1
  fi
done

print "Secret scan passed (${#files[@]} files checked)."

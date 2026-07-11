#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT_DIR/dist/Jarvis.app"
PROCESS_PATTERN="^$APP/Contents/MacOS/Electron$"

stop_running() {
  while IFS= read -r pid; do [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true; done < <(pgrep -f "$PROCESS_PATTERN" || true)
}

package_and_launch() {
  cd "$ROOT_DIR"
  [[ -x "$ROOT_DIR/node_modules/.bin/electron" ]] || npm install
  npm run package
  stop_running
  /usr/bin/open -na "$APP"
}

case "$MODE" in
  run)
    package_and_launch
    ;;
  --verify|verify)
    cd "$ROOT_DIR"
    npm run check
    npm test
    DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}" "$ROOT_DIR/script/build_native_bridge.sh"
    npm run package
    codesign --verify --deep --strict "$APP"
    stop_running
    /usr/bin/open -na "$APP"
    for _ in {1..40}; do
      pgrep -f "$PROCESS_PATTERN" >/dev/null && pgrep -f 'JarvisNativeBridge$' >/dev/null && break
      sleep 0.25
    done
    pgrep -f "$PROCESS_PATTERN" >/dev/null || { echo "Jarvis exited before startup completed." >&2; exit 1; }
    pgrep -f 'JarvisNativeBridge$' >/dev/null || { echo "Jarvis native companion did not start within 10 seconds." >&2; exit 1; }
    echo "Jarvis $(node -p "require('$ROOT_DIR/package.json').version") passed tests, native build, signing verification, and packaged launch."
    ;;
  --package|package)
    cd "$ROOT_DIR"; exec npm run package
    ;;
  --install|install)
    cd "$ROOT_DIR"; npm run package; exec "$ROOT_DIR/script/install_local.sh"
    ;;
  --debug|debug)
    stop_running
    cd "$ROOT_DIR"; exec env ELECTRON_ENABLE_LOGGING=1 npm run dev
    ;;
  --logs|logs)
    package_and_launch
    exec /usr/bin/log stream --info --style compact --predicate 'process == "Electron" OR process == "JarvisNativeBridge"'
    ;;
  --telemetry|telemetry)
    package_and_launch
    touch "$HOME/Library/Application Support/Jarvis/jarvis.log.jsonl"
    exec tail -f "$HOME/Library/Application Support/Jarvis/jarvis.log.jsonl"
    ;;
  *)
    echo "usage: $0 [run|--verify|--package|--install|--debug|--logs|--telemetry]" >&2
    exit 2
    ;;
esac

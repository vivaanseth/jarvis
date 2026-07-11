#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -z "${DEVELOPER_DIR:-}" && -d /Applications/Xcode.app/Contents/Developer ]]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi

if ! xcodebuild -version >/dev/null 2>&1; then
  echo "JarvisNativeBridge requires full Xcode because the installed Command Line Tools and macOS SDK do not match." >&2
  echo "Install Xcode, select it with xcode-select, then rerun this script." >&2
  exit 1
fi

swift build -c release --product JarvisNativeBridge
BRIDGE="$(swift build -c release --show-bin-path)/JarvisNativeBridge"
codesign --force --sign - --identifier com.local.Jarvis.NativeBridge "$BRIDGE"
if ! otool -s __TEXT __info_plist "$BRIDGE" >/dev/null 2>&1; then
  echo "JarvisNativeBridge is missing its embedded privacy usage descriptions." >&2
  exit 1
fi
echo "Built and ad-hoc signed: $BRIDGE"

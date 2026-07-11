#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_APP="$ROOT_DIR/dist/Jarvis.app"
if [[ -n "${JARVIS_INSTALL_DIR:-}" ]]; then
  INSTALL_DIR="$JARVIS_INSTALL_DIR"
elif [[ -w /Applications ]]; then
  INSTALL_DIR="/Applications"
else
  INSTALL_DIR="$HOME/Applications"
fi
TARGET_APP="$INSTALL_DIR/Jarvis.app"
BACKUP_DIR="$ROOT_DIR/dist-previous"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [[ ! -d "$SOURCE_APP" ]]; then
  "$ROOT_DIR/script/package_electron.sh"
fi
codesign --verify --deep --strict "$SOURCE_APP"
mkdir -p "$BACKUP_DIR" "$INSTALL_DIR"
if [[ -d "$TARGET_APP" ]]; then
  /usr/bin/ditto "$TARGET_APP" "$BACKUP_DIR/Jarvis-$STAMP.app"
fi
pkill -f '/Jarvis.app/Contents/MacOS/Electron( |$)' >/dev/null 2>&1 || true
rm -rf "$TARGET_APP"
/usr/bin/ditto "$SOURCE_APP" "$TARGET_APP"
codesign --verify --deep --strict "$TARGET_APP"
/usr/bin/open -na "$TARGET_APP"
echo "Installed and launched: $TARGET_APP"
if compgen -G "$BACKUP_DIR/Jarvis-*.app" >/dev/null; then echo "Previous version retained in: $BACKUP_DIR"; fi
